"""Lógica de la demo: escenarios, peticiones individuales y en lote, comparativa con LLM y costes."""

from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path
from typing import Any

from decision_client import FoundryClient, llm_schema, llm_system_prompt, normalize_llm

BASE = Path(__file__).parent
# El API admite hasta 255 preguntas por llamada; dejamos margen.
MAX_QUESTIONS_PER_CALL = 250


def load_json(name: str) -> Any:
    return json.loads((BASE / name).read_text(encoding="utf-8"))


def load_scenarios(folder: Path = BASE / "scenarios") -> dict[str, dict]:
    scenarios = []
    for path in sorted(folder.glob("*.json")):
        sc = json.loads(path.read_text(encoding="utf-8"))
        _validate(sc, path.name)
        scenarios.append(sc)
    scenarios.sort(key=lambda s: s.get("order", 99))
    return {s["id"]: s for s in scenarios}


def _validate(sc: dict, source: str) -> None:
    game = sc.get("kind") == "game"
    required = ("id", "title", "context", "questions", "primary") + (("notes",) if game else ("items", "state_fields"))
    for key in required:
        if key not in sc:
            raise ValueError(f"{source}: falta '{key}'")
    if sc["primary"] not in sc["questions"]:
        raise ValueError(f"{source}: 'primary' debe ser una de las preguntas")
    if sc["questions"][sc["primary"]]["type"] != "choice":
        raise ValueError(f"{source}: la pregunta principal debe ser de tipo 'choice'")
    if game:
        return
    ids = [it["id"] for it in sc["items"]]
    if len(ids) != len(set(ids)):
        raise ValueError(f"{source}: hay ids de elementos repetidos")


# ---------- Construcción de peticiones ----------


def item_fields(sc: dict, item: dict) -> dict:
    return {key: item.get(field) for key, field in sc["state_fields"].items()}


def item_state(sc: dict, item: dict) -> dict:
    """Estado de Decision-1 para un elemento: contexto del negocio + campos del elemento."""
    return {"contexto": sc["context"], **item_fields(sc, item)}


def batch_payload(sc: dict, items: list[dict]) -> tuple[dict, dict]:
    """Varios elementos en una sola llamada: todos en el estado y las preguntas repetidas por elemento."""
    ref = sc.get("item_ref", "el elemento")
    state = {"contexto": sc["context"], sc.get("batch_key", "elementos"): {it["id"]: item_fields(sc, it) for it in items}}
    questions: dict[str, dict] = {}
    for it in items:
        for name, q in sc["questions"].items():
            questions[f"{it['id']}__{name}"] = {**q, "instructions": f"Sobre {ref} {it['id']}: {q['instructions']}"}
    return state, questions


def chunk_items(sc: dict, items: list[dict]) -> list[list[dict]]:
    per_call = max(1, MAX_QUESTIONS_PER_CALL // max(1, len(sc["questions"])))
    return [items[i : i + per_call] for i in range(0, len(items), per_call)]


def select_items(sc: dict, item_ids: list[str] | None) -> list[dict]:
    if not item_ids:
        return list(sc["items"])
    by_id = {it["id"]: it for it in sc["items"]}
    missing = [i for i in item_ids if i not in by_id]
    if missing:
        raise KeyError(f"Elementos desconocidos: {', '.join(missing)}")
    return [by_id[i] for i in item_ids]


# ---------- Costes ----------


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


# ---------- Ejecución con Decision-1 ----------


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


# ---------- Ejecución con un LLM generativo (para la carrera) ----------


async def llm_item(client: FoundryClient, sc: dict, item: dict, cmp: dict) -> dict:
    return await client.decide_with_llm(
        cmp["deployment"], item_fields(sc, item), sc["questions"], sc["context"], cmp.get("reasoning_effort")
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
    plural = sc.get("item_label_plural", "elementos")
    system = llm_system_prompt(sc["context"], sc["questions"]) + (
        f"\n\nRecibirás varios {plural} en JSON, identificados por su id. "
        "Responde a todas las preguntas para cada uno de ellos, de forma independiente."
    )
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
