"""Demo logic: scenarios, single and batch requests, LLM comparison and costs."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from pathlib import Path
from typing import Any

from decision_client import FoundryClient, llm_schema, llm_system_prompt, normalize_llm

log = logging.getLogger("decision1")

BASE = Path(__file__).parent
# The API accepts up to 255 questions per call; we leave some headroom.
MAX_QUESTIONS_PER_CALL = 250
# UI languages: Spanish is the original; the others are overlaid from scenarios/<lang>/ and lab.<lang>.json.
LANGS = ("es", "en")
DEFAULT_LANG = "es"
# Keys that a translation replaces entirely because their names also change in another language
# (state fields and the action proposed by the agent, whose arguments the model and the audience see; in the Lab,
# also the per-value labels, which go with the question name).
SCENARIO_REPLACE = frozenset({"state_fields", "action"})
LAB_REPLACE = frozenset({"state", "questions", "values"})


def load_json(name: str) -> Any:
    return json.loads((BASE / name).read_text(encoding="utf-8"))


def merge_overlay(base: Any, over: Any, replace: frozenset[str] = frozenset(), path: str = "$") -> Any:
    """Overlays a translation on the original without changing its structure.

    Dicts: by key (a key that doesn't exist in the original is an error, except those in `replace`).
    Lists of dicts with `id`: by id (the translation may include only some of them). Other lists: same length,
    element by element. All other values are replaced and must be of the same type.
    """
    if isinstance(base, dict) and isinstance(over, dict):
        out = dict(base)
        for key, val in over.items():
            if key in replace:
                out[key] = val
            elif key not in base:
                raise ValueError(f"{path}.{key}: not in the original")
            else:
                out[key] = merge_overlay(base[key], val, replace, f"{path}.{key}")
        return out
    if isinstance(base, list) and isinstance(over, list):
        if base and all(isinstance(b, dict) and "id" in b for b in base):
            index = {b["id"]: i for i, b in enumerate(base)}
            out = list(base)
            for o in over:
                oid = o.get("id") if isinstance(o, dict) else None
                if oid not in index:
                    raise ValueError(f"{path}: unknown id {oid!r}")
                out[index[oid]] = merge_overlay(base[index[oid]], o, replace, f"{path}[{oid}]")
            return out
        if len(base) != len(over):
            raise ValueError(f"{path}: {len(over)} elements, the original has {len(base)}")
        return [merge_overlay(b, o, replace, f"{path}[{i}]") for i, (b, o) in enumerate(zip(base, over))]
    numbers = (int, float)
    if type(base) is not type(over) and not (isinstance(base, numbers) and isinstance(over, numbers)):
        raise ValueError(f"{path}: is {type(over).__name__}, the original is {type(base).__name__}")
    return over


def localized(base: dict, overlay: Path, lang: str, replace: frozenset[str], source: str) -> dict:
    """The Spanish original or, if it exists, its translation into `lang`; `locale` is the language actually served."""
    if lang == DEFAULT_LANG:
        return {**base, "locale": DEFAULT_LANG}
    if not overlay.exists():
        log.warning("%s: no translation into '%s'; serving Spanish", source, lang)
        return {**base, "locale": DEFAULT_LANG}
    try:
        merged = merge_overlay(base, json.loads(overlay.read_text(encoding="utf-8")), replace)
    except ValueError as exc:
        raise ValueError(f"{overlay.relative_to(BASE)}: {exc}") from exc
    return {**merged, "locale": lang}


def load_scenarios(folder: Path = BASE / "scenarios", lang: str = DEFAULT_LANG) -> dict[str, dict]:
    scenarios = []
    for path in sorted(folder.glob("*.json")):
        sc = localized(json.loads(path.read_text(encoding="utf-8")), folder / lang / path.name, lang, SCENARIO_REPLACE, path.name)
        _validate(sc, path.name)
        scenarios.append(sc)
    scenarios.sort(key=lambda s: s.get("order", 99))
    return {s["id"]: s for s in scenarios}


def load_lab(lang: str = DEFAULT_LANG) -> dict:
    return localized(load_json("lab.json"), BASE / f"lab.{lang}.json", lang, LAB_REPLACE, "lab.json")


def _validate(sc: dict, source: str) -> None:
    game = sc.get("kind") == "game"
    required = ("id", "title", "context", "questions", "primary") + (("notes",) if game else ("items", "state_fields"))
    for key in required:
        if key not in sc:
            raise ValueError(f"{source}: missing '{key}'")
    if sc["primary"] not in sc["questions"]:
        raise ValueError(f"{source}: 'primary' must be one of the questions")
    if sc["questions"][sc["primary"]]["type"] != "choice":
        raise ValueError(f"{source}: the primary question must be of type 'choice'")
    if game:
        return
    ids = [it["id"] for it in sc["items"]]
    if len(ids) != len(set(ids)):
        raise ValueError(f"{source}: duplicate item ids")


# ---------- Building requests ----------

# Texts sent to the model, which depend on the scenario language (`sc["locale"]`).
REQUEST_TEXTS = {
    "es": {
        "context": "contexto",
        "ref": "el elemento",
        "batch_key": "elementos",
        "about": "Sobre {ref} {id}: {instructions}",
        "plural": "elementos",
        "llm_batch": (
            "Recibirás varios {plural} en JSON, identificados por su id. "
            "Responde a todas las preguntas para cada uno de ellos, de forma independiente."
        ),
    },
    "en": {
        "context": "context",
        "ref": "the item",
        "batch_key": "items",
        "about": "About {ref} {id}: {instructions}",
        "plural": "items",
        "llm_batch": (
            "You will receive several {plural} as JSON, identified by their id. "
            "Answer all the questions for each of them, independently."
        ),
    },
}


def request_texts(sc: dict) -> dict:
    return REQUEST_TEXTS.get(sc.get("locale", DEFAULT_LANG)) or REQUEST_TEXTS[DEFAULT_LANG]


def item_fields(sc: dict, item: dict) -> dict:
    return {key: item.get(field) for key, field in sc["state_fields"].items()}


def item_state(sc: dict, item: dict) -> dict:
    """Decision-1 state for an item: business context + item fields."""
    return {request_texts(sc)["context"]: sc["context"], **item_fields(sc, item)}


def batch_payload(sc: dict, items: list[dict]) -> tuple[dict, dict]:
    """Several items in a single call: all of them in the state, with the questions repeated per item."""
    txt = request_texts(sc)
    ref = sc.get("item_ref", txt["ref"])
    state = {txt["context"]: sc["context"], sc.get("batch_key", txt["batch_key"]): {it["id"]: item_fields(sc, it) for it in items}}
    questions: dict[str, dict] = {}
    for it in items:
        for name, q in sc["questions"].items():
            about = txt["about"].format(ref=ref, id=it["id"], instructions=q["instructions"])
            questions[f"{it['id']}__{name}"] = {**q, "instructions": about}
    return state, questions


class UnknownItems(KeyError):
    def __init__(self, ids: list[str]):
        super().__init__(f"Unknown items: {', '.join(ids)}")
        self.ids = ids


def chunk_items(sc: dict, items: list[dict]) -> list[list[dict]]:
    per_call = max(1, MAX_QUESTIONS_PER_CALL // max(1, len(sc["questions"])))
    return [items[i : i + per_call] for i in range(0, len(items), per_call)]


def select_items(sc: dict, item_ids: list[str] | None) -> list[dict]:
    if not item_ids:
        return list(sc["items"])
    by_id = {it["id"]: it for it in sc["items"]}
    missing = [i for i in item_ids if i not in by_id]
    if missing:
        raise UnknownItems(missing)
    return [by_id[i] for i in item_ids]


# ---------- Costs ----------


class Pricing:
    def __init__(self, data: dict):
        self.data = data
        self.usd_to_eur = float(data.get("usd_to_eur", 1.0))
        self.models: dict[str, dict] = data.get("models", {})

    def cost(self, model_key: str, usage: dict) -> dict | None:
        p = self.models.get(model_key)
        if not p:
            return None
        cached = usage.get("cached_input_tokens", 0) or 0
        fresh = max(0, (usage.get("input_tokens", 0) or 0) - cached)
        usd = (
            fresh * p.get("input", 0)
            + cached * p.get("cached_input", p.get("input", 0))
            + (usage.get("output_tokens", 0) or 0) * p.get("output", 0)
        ) / 1_000_000
        return {"usd": usd, "eur": usd * self.usd_to_eur}


def sum_usage(usages: list[dict]) -> dict:
    keys = ("input_tokens", "cached_input_tokens", "output_tokens", "reasoning_tokens")
    return {k: sum((u.get(k) or 0) for u in usages) for k in keys if any(k in u for u in usages)}


# ---------- Running Decision-1 ----------


async def d1_item(client: FoundryClient, sc: dict, item: dict) -> dict:
    return await client.decide(item_state(sc, item), sc["questions"])


async def d1_batch(client: FoundryClient, sc: dict, items: list[dict]) -> dict:
    t0 = time.perf_counter()

    async def one(chunk: list[dict]) -> tuple[list[dict], dict]:
        state, questions = batch_payload(sc, chunk)
        return chunk, await client.decide(state, questions)

    done = await asyncio.gather(*(one(c) for c in chunk_items(sc, items)))
    results: dict[str, dict] = {}
    for chunk, r in done:
        for it in chunk:
            results[it["id"]] = {n: r["answers"].get(f"{it['id']}__{n}", {"type": "missing"}) for n in sc["questions"]}
    calls = [r for _, r in done]
    return {
        "results": results,
        "calls": len(calls),
        "decisions": len(items) * len(sc["questions"]),
        "latency_ms": max(r["latency_ms"] for r in calls),
        "wall_ms": round((time.perf_counter() - t0) * 1000, 1),
        "wait_ms": max(r["wait_ms"] for r in calls),
        "usage": sum_usage([r["usage"] for r in calls]),
        "rate": calls[-1]["rate"],
        "model": calls[0]["model"],
        "request": calls[0]["request"],
        "raw": calls[0]["raw"],
    }


# ---------- Running a generative LLM (for the race) ----------


async def llm_item(client: FoundryClient, sc: dict, item: dict, cmp: dict) -> dict:
    return await client.decide_with_llm(
        cmp["deployment"],
        item_fields(sc, item),
        sc["questions"],
        sc["context"],
        cmp.get("reasoning_effort"),
        lang=sc.get("locale", DEFAULT_LANG),
    )


def llm_batch_schema(item_ids: list[str], questions: dict[str, dict]) -> dict:
    per_item = llm_schema(questions)
    return {
        "type": "object",
        "properties": {i: per_item for i in item_ids},
        "required": list(item_ids),
        "additionalProperties": False,
    }


async def llm_batch(client: FoundryClient, sc: dict, items: list[dict], cmp: dict) -> dict:
    txt = request_texts(sc)
    plural = sc.get("item_label_plural", txt["plural"])
    system = llm_system_prompt(sc["context"], sc["questions"], sc.get("locale", DEFAULT_LANG)) + "\n\n" + txt["llm_batch"].format(plural=plural)
    user = json.dumps({it["id"]: item_fields(sc, it) for it in items}, ensure_ascii=False)
    schema = llm_batch_schema([it["id"] for it in items], sc["questions"])
    t0 = time.perf_counter()
    res = await client.chat_json(
        cmp["deployment"], system, user, schema, cmp.get("reasoning_effort"), max_tokens=16000
    )
    parsed = res.pop("parsed")
    results = {it["id"]: normalize_llm(parsed.get(it["id"]) or {}, sc["questions"]) for it in items}
    return {
        **res,
        "results": results,
        "calls": 1,
        "decisions": len(items) * len(sc["questions"]),
        "wall_ms": round((time.perf_counter() - t0) * 1000, 1),
        "raw": parsed,
    }
