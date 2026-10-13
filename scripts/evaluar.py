"""Evalúa los escenarios contra sus etiquetas de referencia ("expected").

Uso, desde la raíz del repo y con las variables del entorno de azd cargadas:

    set -a; eval "$(azd env get-values)"; set +a
    python scripts/evaluar.py                       # todos los escenarios en modo lote (1 llamada cada uno)
    python scripts/evaluar.py energia hoteles --uno-a-uno
    python scripts/evaluar.py router --llm gpt-5.4-mini
    python scripts/evaluar.py --lang en             # los mismos escenarios en su versión en inglés

El caso de juego (Space Invaders) no tiene etiquetas de referencia y se omite; para ese caso, ver scripts/partida.mjs.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

import demo  # noqa: E402
from decision_client import FoundryClient  # noqa: E402


def _fmt(answer: dict) -> str:
    if answer.get("type") == "noul":
        return f"{answer['p']:.2f}"
    return str(answer.get("label") or answer.get("value"))


def report(sc: dict, results: dict, title: str) -> tuple[int, int]:
    prim, sev = sc["primary"], sc.get("severity")
    ok = total = 0
    print(f"\n{sc.get('icon', '')} {sc['title']} — {title}")
    for it in sc["items"]:
        a = results.get(it["id"], {})
        p = a.get(prim, {})
        exp = (it.get("expected") or {}).get(prim)
        hit = exp is not None and p.get("value") == exp
        total += exp is not None
        ok += hit
        conf = p.get("confidence")
        conf_txt = f"{conf:.2f}" if isinstance(conf, (int, float)) else " -  "
        sev_txt = f" | {sev}={_fmt(a[sev])}" if sev and sev in a else ""
        extra = [
            f"{n}={_fmt(v)}"
            for n, v in a.items()
            if n not in (prim, sev) and not (v.get("type") == "choice" and v.get("value") == "sin_mencion")
            and not (v.get("type") == "noul" and v.get("p", 0) < 0.5)
        ]
        mark = "✓" if hit else ("✗" if exp is not None else "·")
        miss = "" if hit or exp is None else f"   <-- esperado {exp}"
        print(f"  {mark} {it['id']:<7} {str(p.get('value')):<20} conf={conf_txt}{sev_txt} | {' '.join(extra)}{miss}")
    print(f"  => acierto {ok}/{total}")
    return ok, total


async def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("escenarios", nargs="*", help="ids de escenario (por defecto, todos)")
    ap.add_argument("--uno-a-uno", action="store_true", help="una llamada por elemento en lugar de una por escenario")
    ap.add_argument("--llm", help="id de comparación de pricing.json para evaluar también un LLM")
    ap.add_argument("--lang", choices=demo.LANGS, default=demo.DEFAULT_LANG, help="idioma de los escenarios (por defecto, es)")
    args = ap.parse_args()

    endpoint = os.environ.get("AZURE_AI_ENDPOINT")
    if not endpoint:
        sys.exit('Falta AZURE_AI_ENDPOINT. Ejecuta: set -a; eval "$(azd env get-values)"; set +a')
    scenarios = demo.load_scenarios(lang=args.lang)
    selected = args.escenarios or [sid for sid, sc in scenarios.items() if sc.get("kind") != "game"]
    pricing = demo.Pricing(demo.load_json("pricing.json"))
    # Sin prisa en la evaluación: si hace falta, esperamos a que se recargue la cuota de peticiones por minuto.
    client = FoundryClient(endpoint, os.environ.get("DECISION_DEPLOYMENT", "decision-1"), max_rate_wait_s=600)
    await client.warmup()
    sem = asyncio.Semaphore(4)
    try:
        for sid in selected:
            sc = scenarios[sid]
            if sc.get("kind") == "game":
                print(f"\n{sc.get('icon', '')} {sc['title']}: caso de juego, sin etiquetas de referencia (se omite; ver scripts/partida.mjs).")
                continue
            items = sc["items"]
            t0 = time.perf_counter()
            if args.uno_a_uno:
                async def one(it: dict) -> tuple[str, dict]:
                    async with sem:
                        return it["id"], await demo.d1_item(client, sc, it)

                done = await asyncio.gather(*(one(it) for it in items))
                results = {i: r["answers"] for i, r in done}
                lat = sorted(r["latency_ms"] for _, r in done)
                tokens = sum(r["usage"]["input_tokens"] for _, r in done)
                info = f"{len(done)} llamadas, p50 {lat[len(lat) // 2]:.0f} ms"
            else:
                r = await demo.d1_batch(client, sc, items)
                results, tokens = r["results"], r["usage"]["input_tokens"]
                info = f"{r['calls']} llamada(s), {r['decisions']} decisiones, {r['latency_ms']:.0f} ms"
            wall = (time.perf_counter() - t0) * 1000
            cost = pricing.cost("Microsoft-Decision-1", {"input_tokens": tokens})
            report(sc, results, f"Decision-1 · {info} · total {wall:.0f} ms · {tokens} tokens · ${cost['usd']:.5f}")

            if args.llm:
                cmp = next(c for c in pricing.data["comparisons"] if c["id"] == args.llm)
                t0 = time.perf_counter()
                if args.uno_a_uno:
                    async def one_llm(it: dict) -> tuple[str, dict]:
                        async with sem:
                            return it["id"], await demo.llm_item(client, sc, it, cmp)

                    done = await asyncio.gather(*(one_llm(it) for it in items))
                    results = {i: r["answers"] for i, r in done}
                    usage = demo.sum_usage([r["usage"] for _, r in done])
                else:
                    r = await demo.llm_batch(client, sc, items, cmp)
                    results, usage = r["results"], r["usage"]
                wall = (time.perf_counter() - t0) * 1000
                cost = pricing.cost(cmp["deployment"], usage) or {"usd": 0}
                report(sc, results, f"{cmp['label']} · total {wall:.0f} ms · {usage} · ${cost['usd']:.5f}")
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(main())
