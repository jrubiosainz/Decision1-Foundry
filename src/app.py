"""Web de la demo de Microsoft-Decision-1: API (FastAPI) y web estática."""

from __future__ import annotations

import asyncio
import hmac
import json
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import demo
from decision_client import FoundryClient, FoundryError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("decision1")

ENDPOINT = os.environ.get("AZURE_AI_ENDPOINT", "").rstrip("/")
DECISION_DEPLOYMENT = os.environ.get("DECISION_DEPLOYMENT", "decision-1")
DECISION_SKU = os.environ.get("DECISION_SKU", "DataZoneStandard")
LOCATION = os.environ.get("AZURE_LOCATION", "")
ACCESS_CODE = os.environ.get("DEMO_ACCESS_CODE", "").strip()
ALLOWED_LLMS = [d.strip() for d in os.environ.get("COMPARISON_DEPLOYMENTS", "").split(",") if d.strip()]
DEFAULT_RPM = int(os.environ.get("DECISION_RPM", "17"))

LAB_MAX_STATE_CHARS = 20_000
LAB_MAX_QUESTIONS = 32
D1_PRICE_KEY = "Microsoft-Decision-1"

SCENARIOS = demo.load_scenarios()
LAB = demo.load_json("lab.json")
PRICING = demo.Pricing(demo.load_json("pricing.json"))


def _comparisons() -> dict[str, dict]:
    """LLMs disponibles para la carrera: solo los desplegados (COMPARISON_DEPLOYMENTS)."""
    configured = PRICING.data.get("comparisons", [])
    out = [c for c in configured if c["deployment"] in ALLOWED_LLMS]
    known = {c["deployment"] for c in configured}
    out += [{"id": d, "deployment": d, "label": d, "reasoning_effort": None} for d in ALLOWED_LLMS if d not in known]
    return {c["id"]: c for c in out}


COMPARISONS = _comparisons()
WARM_IDLE_S = 180  # tras unos minutos sin llamadas, la primera decisión tarda ~3 s en lugar de <1 s


async def _prime_model(app: FastAPI) -> None:
    """Una decisión mínima para despertar el modelo antes de que el presentador pulse «Procesar»."""
    try:
        await app.state.client.decide("Hola, buenos días.", {"saludo": {"type": "noul", "instructions": "¿El mensaje es un saludo?"}})
        log.info("Decision-1 calentado")
    except Exception as exc:  # noqa: BLE001 - calentar es opcional
        log.warning("No se pudo calentar Decision-1: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    client = FoundryClient(ENDPOINT, DECISION_DEPLOYMENT) if ENDPOINT else None
    app.state.client = client
    app.state.primed_at = 0.0
    app.state.prime_task = None
    app.state.d1_sem = asyncio.Semaphore(6)
    app.state.llm_sem = asyncio.Semaphore(8)
    if client:
        try:
            await client.warmup()
        except Exception as exc:  # noqa: BLE001 - la web debe arrancar aunque falle el calentamiento
            log.warning("No se pudo calentar la conexión con Foundry: %s", exc)
    else:
        log.warning("Falta AZURE_AI_ENDPOINT: la web arranca, pero no podrá llamar al modelo.")
    yield
    if client:
        await client.close()


app = FastAPI(
    title="Microsoft-Decision-1 · demo",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)


@app.exception_handler(FoundryError)
async def _foundry_error(_: Request, exc: FoundryError) -> JSONResponse:
    # 401/403 de Foundry son de permisos de la identidad, no del código de acceso de la demo.
    status = exc.status if exc.status in (400, 404, 413, 422, 429) else 502
    return JSONResponse({"error": "foundry", "status": exc.status, "detail": exc.detail}, status_code=status)


@app.middleware("http")
async def _no_cache_static(request: Request, call_next):
    response = await call_next(request)
    if not request.url.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-cache")
    return response


def require_code(request: Request) -> None:
    if ACCESS_CODE:
        given = request.headers.get("x-demo-code", "")
        if not hmac.compare_digest(given.encode(), ACCESS_CODE.encode()):
            raise HTTPException(status_code=401, detail="Código de acceso incorrecto")


def client_of(request: Request) -> FoundryClient:
    client = request.app.state.client
    if not client:
        raise HTTPException(status_code=503, detail="Configura AZURE_AI_ENDPOINT para llamar al modelo.")
    return client


def quota(client: FoundryClient) -> dict:
    """Peticiones disponibles estimadas: última cabecera de cuota + recarga lineal (límite por minuto)."""
    rate = client.last_rate or {}
    limit = rate.get("limit") or DEFAULT_RPM
    remaining = rate.get("remaining")
    if remaining is None:
        estimate = float(limit)
    else:
        estimate = min(float(limit), remaining + (time.time() - client.last_rate_ts) * limit / 60)
    return {"limit": limit, "remaining": int(estimate), "region": rate.get("region")}


def scenario(scenario_id: str) -> dict:
    sc = SCENARIOS.get(scenario_id)
    if not sc:
        raise HTTPException(status_code=404, detail=f"Escenario desconocido: {scenario_id}")
    return sc


def items_of(sc: dict, item_ids: list[str] | None) -> list[dict]:
    try:
        return demo.select_items(sc, item_ids)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


def comparison(model: str) -> dict:
    cmp = COMPARISONS.get(model)
    if not cmp:
        raise HTTPException(status_code=400, detail=f"Modelo de comparación no disponible: {model}")
    return cmp


def lab_payload(state: Any, questions: dict | None) -> tuple[Any, dict]:
    if not isinstance(state, (str, dict)) or not state:
        raise HTTPException(status_code=400, detail="El estado debe ser un texto o un objeto JSON no vacío.")
    size = len(state) if isinstance(state, str) else len(json.dumps(state, ensure_ascii=False))
    if size > LAB_MAX_STATE_CHARS:
        raise HTTPException(status_code=413, detail=f"En el laboratorio el estado admite hasta {LAB_MAX_STATE_CHARS} caracteres.")
    if not questions:
        raise HTTPException(status_code=400, detail="Añade al menos una pregunta.")
    if len(questions) > LAB_MAX_QUESTIONS:
        raise HTTPException(status_code=400, detail=f"En el laboratorio se admiten hasta {LAB_MAX_QUESTIONS} preguntas.")
    for name, q in questions.items():
        if not isinstance(q, dict) or q.get("type") not in ("choice", "score", "noul"):
            raise HTTPException(status_code=400, detail=f"La pregunta '{name}' debe tener type 'choice', 'score' o 'noul'.")
    return state, questions


class DecideIn(BaseModel):
    scenario: str | None = None
    item_id: str | None = None
    state: Any = None
    questions: dict[str, dict] | None = None


class BatchIn(BaseModel):
    scenario: str
    item_ids: list[str] | None = None


class CompareIn(BaseModel):
    scenario: str
    model: str
    item_id: str | None = None
    item_ids: list[str] | None = None


@app.get("/healthz")
async def healthz() -> dict:
    return {"ok": True}


@app.get("/api/config")
async def config() -> dict:
    return {
        "decision": {
            "model": "Microsoft-Decision-1",
            "deployment": DECISION_DEPLOYMENT,
            "sku": DECISION_SKU,
            "location": LOCATION,
            "rpm": DEFAULT_RPM,
        },
        "comparisons": [{"id": c["id"], "label": c["label"], "deployment": c["deployment"]} for c in COMPARISONS.values()],
        "pricing": PRICING.data,
        "access_required": bool(ACCESS_CODE),
        "configured": bool(ENDPOINT),
    }


@app.get("/api/scenarios", dependencies=[Depends(require_code)])
async def scenarios() -> dict:
    return {"scenarios": list(SCENARIOS.values()), "lab": LAB}


@app.get("/api/quota", dependencies=[Depends(require_code)])
async def get_quota(request: Request) -> dict:
    return quota(client_of(request))


@app.post("/api/warm", dependencies=[Depends(require_code)])
async def warm(request: Request) -> dict:
    """Calienta el modelo en segundo plano si lleva un rato sin llamadas (consume 1 petición de la cuota)."""
    client, state = client_of(request), request.app.state
    now = time.time()
    if now - max(client.last_rate_ts, state.primed_at) < WARM_IDLE_S or (state.prime_task and not state.prime_task.done()):
        return {"warming": False}
    state.primed_at = now
    state.prime_task = asyncio.create_task(_prime_model(request.app))
    return {"warming": True}


@app.post("/api/decide", dependencies=[Depends(require_code)])
async def decide(body: DecideIn, request: Request) -> dict:
    """Una llamada a Decision-1: un elemento de un escenario o un estado libre (laboratorio)."""
    client = client_of(request)
    if body.scenario:
        sc = scenario(body.scenario)
        item = items_of(sc, [body.item_id] if body.item_id else None)[0]
        state, questions = demo.item_state(sc, item), sc["questions"]
    else:
        state, questions = lab_payload(body.state, body.questions)
    async with request.app.state.d1_sem:
        res = await client.decide(state, questions)
    return {**res, "item_id": body.item_id, "cost": PRICING.cost(D1_PRICE_KEY, res["usage"]), "quota": quota(client)}


@app.post("/api/decide-batch", dependencies=[Depends(require_code)])
async def decide_batch(body: BatchIn, request: Request) -> dict:
    """Todos los elementos en una sola llamada (o en pocas, si superan 250 preguntas)."""
    client = client_of(request)
    sc = scenario(body.scenario)
    items = items_of(sc, body.item_ids)
    async with request.app.state.d1_sem:
        res = await demo.d1_batch(client, sc, items)
    return {**res, "cost": PRICING.cost(D1_PRICE_KEY, res["usage"]), "quota": quota(client)}


@app.post("/api/compare", dependencies=[Depends(require_code)])
async def compare(body: CompareIn, request: Request) -> dict:
    """Mismo elemento y mismas preguntas con un LLM generativo y salida estructurada."""
    client = client_of(request)
    cmp = comparison(body.model)
    sc = scenario(body.scenario)
    item = items_of(sc, [body.item_id] if body.item_id else None)[0]
    async with request.app.state.llm_sem:
        res = await demo.llm_item(client, sc, item, cmp)
    return {**res, "item_id": item["id"], "label": cmp["label"], "cost": PRICING.cost(cmp["deployment"], res["usage"])}


@app.post("/api/compare-batch", dependencies=[Depends(require_code)])
async def compare_batch(body: CompareIn, request: Request) -> dict:
    client = client_of(request)
    cmp = comparison(body.model)
    sc = scenario(body.scenario)
    items = items_of(sc, body.item_ids)
    async with request.app.state.llm_sem:
        res = await demo.llm_batch(client, sc, items, cmp)
    return {**res, "label": cmp["label"], "cost": PRICING.cost(cmp["deployment"], res["usage"])}


app.mount("/", StaticFiles(directory=demo.BASE / "static", html=True), name="static")
