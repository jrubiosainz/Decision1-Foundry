"""Evaluates the OpenAI Decisions API cases (second tab) against their expected results ("expected").

Usage, from the repo root with the azd environment variables loaded:

    set -a; eval "$(azd env get-values)"; set +a
    python scripts/evaluate-dx.py                          # all five cases
    python scripts/evaluate-dx.py reclamaciones gastos --lang en
    python scripts/evaluate-dx.py seguridad --detail       # with all the answers
"""

from __future__ import annotations

import argparse
import asyncio
import os
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import demo  # noqa: E402
import dx  # noqa: E402
from decision_client import FoundryClient  # noqa: E402

PRICE = demo.load_json("pricing.json")["decisions_api"]
CALLS: list[dict] = []


async def call(client: FoundryClient, sem: asyncio.Semaphore, deployment: str, plan: dict) -> dict:
    async with sem:
        res = await client.decisions(deployment, plan["input"], plan["questions"])
    CALLS.append(res)
    return res


def short(a: dict) -> str:
    if a.get("type") == "predicate":
        return f"{'yes' if a['value'] else 'no'} {a['p']:.2f}"
    if a.get("type") == "score":
        return f"{a['label']} {a['confidence']:.2f}"
    if a.get("type") == "choice":
        return f"{a['value']} {a['confidence']:.2f}"
    return a.get("type", "?")


def usage_txt(res: dict | None) -> str:
    if not res:
        return ""
    u = res["usage"]
    return f"{res['latency_ms']:>5.0f} ms · {u['input_tokens']:>5} tok (cached {u['cached_input_tokens']}, cache write {u['cache_write_tokens']})"


def details(answers: dict) -> None:
    for name, a in answers.items():
        print(f"        {name:<20} {short(a)}")


async def eval_cascade(client, sem, dep, case, lang, detail) -> tuple[int, int]:
    async def one(item: dict):
        step, prior, path, steps = case["steps"][0]["id"], {}, [], []
        while True:
            plan = dx.plan(case, item, lang, step=step, prior=prior)
            path.append(step)
            if "skip" in plan:
                route, res = plan["skip"], None
            else:
                res = await call(client, sem, dep, plan)
                route = dx.route(case, plan["step"], item, res["answers"], lang)
                prior[step] = {q: a["value"] for q, a in res["answers"].items() if "value" in a}
            steps.append((step, res, route))
            if "next" not in route:
                return path, route, steps
            step = route["next"]

    results = await asyncio.gather(*[one(it) for it in case["items"]])
    ok = 0
    for item, (path, route, steps) in zip(case["items"], results):
        exp = item["expected"]
        hit = path == exp["path"] and route.get("outcome") == exp["outcome"]
        ok += hit
        miss = "" if hit else f"   <-- expected {'→'.join(exp['path'])} {exp['outcome']}"
        print(f"  {'✓' if hit else '✗'} {item['id']:<4} {'→'.join(path):<14} {route.get('outcome')}{miss}")
        for step, res, r in steps:
            low = " · low confidence" if r.get("low_confidence") else ""
            print(f"      {step:<3} {usage_txt(res)} → {r.get('next') or r.get('outcome')}: {r['reason']}{low}")
            if detail and res:
                details(res["answers"])
    return ok, len(case["items"])


async def eval_single(client, sem, dep, case, lang, detail) -> tuple[int, int]:
    items = case["items"]
    # The first one goes alone so it writes the prefix to the cache; the rest reuse it.
    first = await asyncio.gather(*[_single(client, sem, dep, case, it, lang) for it in items[:1]])
    rest = await asyncio.gather(*[_single(client, sem, dep, case, it, lang) for it in items[1:]])
    ok = 0
    for item, (res, a) in zip(items, first + rest):
        exp = item["expected"]
        if isinstance(exp, dict):
            sev = a.get("severity") or {}
            got = {k: a["outcome"] if k == "outcome" else sev.get("level") if k == sev.get("q") else res["answers"].get(k, {}).get("value") for k in exp}
            hit = got == exp
            shown = " ".join(f"{k}={v}" for k, v in got.items())
            if sev:
                shown += f" (model {sev['model']}{' ↑' + ','.join(sev['raised_by']) if sev['raised_by'] else ''})"
        else:
            hit = a["outcome"] == exp
            shown = f"{a['outcome']} {a['confidence']:.2f}" + (f" [{a['rule']}]" if a.get("rule") else "")
        ok += hit
        low = f" (low confidence {a['confidence']:.2f})" if a["low_confidence"] else ""
        flags = " ".join(f["text"] for f in a["flags"])
        infos = " ".join(f["text"] for f in a["infos"])
        miss = "" if hit else f"   <-- expected {exp}"
        print(f"  {'✓' if hit else '✗'} {item['id']:<4} {shown:<44}{low} {usage_txt(res)} | {flags} {infos}{miss}")
        if detail:
            details(res["answers"])
    return ok, len(items)


async def _single(client, sem, dep, case, item, lang):
    plan = dx.plan(case, item, lang)
    res = await call(client, sem, dep, plan)
    return res, dx.assess(case, item, res["answers"], lang)


async def eval_contracts(client, sem, dep, case, lang, detail) -> tuple[int, int]:
    lists = case["checklists"]

    async def one(item: dict):
        # The first checklist writes the contract to the cache; the others read it in parallel.
        plans = [dx.plan(case, item, lang, checklist=cl["id"]) for cl in lists]
        first = await call(client, sem, dep, plans[0])
        rest = await asyncio.gather(*[call(client, sem, dep, p) for p in plans[1:]])
        return [(p, r, dx.review(case, p, r["answers"])) for p, r in zip(plans, [first, *rest])]

    results = await asyncio.gather(*[one(it) for it in case["items"]])
    ok = total = 0
    for item, runs in zip(case["items"], results):
        hits, wrong, doubts = 0, [], []
        for p, r, rv in runs:
            qs = p["checklist"]["questions"]
            exp = item["expected"][rv["checklist"]]
            for cell in rv["cells"]:
                q, bad = qs[cell["q"]], not dx.is_good(qs[cell["q"]], exp[cell["q"]])
                hit = cell["status"] == ("bad" if bad else "ok")
                hits += hit
                if not hit:
                    p_txt = "—" if cell["p"] is None else f"{cell['p']:.2f}"
                    line = f"{rv['checklist']}.{cell['q']}: expected {exp[cell['q']]!r} ({'red' if bad else 'green'}), model {cell['value']!r} p_red={p_txt}"
                    (doubts if cell["status"] == "doubt" else wrong).append(line)
        n = sum(len(rv["cells"]) for _, _, rv in runs)
        ok += hits
        total += n
        red = sum(rv["red"] for _, _, rv in runs)
        exp_red = sum(not dx.is_good(q, item["expected"][cl["id"]][name]) for cl in lists for name, q in cl["questions"].items())
        print(f"  {'✓' if hits == n else '✗'} {item['id']:<10} {hits}/{n} checks · red={red} (expected {exp_red})")
        for line in wrong:
            print(f"      ✗ {line}")
        for line in doubts:
            print(f"      ? {line}")
        for p, r, rv in runs:
            print(f"      {rv['checklist']:<12} {usage_txt(r)}")
            if detail:
                details(r["answers"])
    return ok, total


EVALUATORS = {"cascade": eval_cascade, "contracts": eval_contracts}


async def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cases", nargs="*", help="case ids (default: all)")
    ap.add_argument("--lang", default=demo.DEFAULT_LANG, choices=demo.LANGS)
    ap.add_argument("--detail", action="store_true", help="show all the answers")
    ap.add_argument("--concurrency", type=int, default=4)
    args = ap.parse_args()
    endpoint = os.environ.get("AZURE_AI_ENDPOINT")
    if not endpoint:
        sys.exit("AZURE_AI_ENDPOINT is not set: load the azd variables first.")
    dep = os.environ.get("DX_DEPLOYMENT", "gpt-6-luna")
    cases = dx.load_cases(args.lang)
    unknown = [c for c in args.cases if c not in cases]
    if unknown:
        sys.exit(f"Unknown cases: {', '.join(unknown)}. Available: {', '.join(cases)}")
    client = FoundryClient(endpoint, os.environ.get("DECISION_DEPLOYMENT", "decision-1"))
    sem = asyncio.Semaphore(args.concurrency)
    ok = total = 0
    try:
        for cid in args.cases or list(cases):
            case = cases[cid]
            print(f"\n{case['icon']} {case['title']} ({case['kind']}, {args.lang})")
            fn = EVALUATORS.get(case["kind"], eval_single)
            o, t = await fn(client, sem, dep, case, args.lang, args.detail)
            print(f"  => accuracy {o}/{t}")
            ok, total = ok + o, total + t
    finally:
        await client.close()
    if CALLS:
        lat = [c["latency_ms"] for c in CALLS]
        usage = {k: sum(c["usage"][k] for c in CALLS) for k in ("input_tokens", "cached_input_tokens", "cache_write_tokens")}
        cost = dx.cost(usage, PRICE, 1.0)
        print(
            f"\nTotal: {ok}/{total} · {len(CALLS)} calls · median {statistics.median(lat):.0f} ms · "
            f"{usage['input_tokens']} tokens ({usage['cached_input_tokens']} cached) · "
            f"${cost['usd']:.4f} (${cost['usd_nocache']:.4f} without cache)"
        )


if __name__ == "__main__":
    asyncio.run(main())
