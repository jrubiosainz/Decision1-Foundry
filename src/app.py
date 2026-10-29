"""Microsoft-Decision-1 demo web app: API (FastAPI) and static site."""

from __future__ import annotations

import asyncio
import base64
import binascii
import hashlib
import hmac
import html
import json
import logging
import math
import os
import re
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import demo
import dx
from decision_client import FoundryClient, FoundryError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("decision1")

ENDPOINT = os.environ.get("AZURE_AI_ENDPOINT", "").rstrip("/")
DECISION_DEPLOYMENT = os.environ.get("DECISION_DEPLOYMENT", "decision-1")
DECISION_SKU = os.environ.get("DECISION_SKU", "DataZoneStandard")
LOCATION = os.environ.get("AZURE_LOCATION", "")
ACCESS_CODE = os.environ.get("DEMO_ACCESS_CODE", "").strip()
ALLOWED_LLMS = [d.strip() for d in os.environ.get("COMPARISON_DEPLOYMENTS", "").split(",") if d.strip()]
DEFAULT_RPM = int(os.environ.get("DECISION_RPM", "60"))
DX_DEPLOYMENT = os.environ.get("DX_DEPLOYMENT", "gpt-6-luna")

LAB_MAX_STATE_CHARS = 20_000
LAB_MAX_QUESTIONS = 32
GAME_MAX_STATE_CHARS = 6_000
GAME_D1_ID = "decision-1"
GAME_LLM_TOKENS = 256  # without reasoning the answer is ~20 tokens; with reasoning it needs more headroom
GAME_LLM_REASONING_TOKENS = 4000
D1_PRICE_KEY = "Microsoft-Decision-1"

# Client brand (logo, name, colors and font). On App Service, /home is persistent storage:
# the brand survives restarts and new deployments.
BRAND_FILE = Path(
    os.environ.get("BRAND_FILE")
    or ("/home/data/brand.json" if os.environ.get("WEBSITE_SITE_NAME") else demo.BASE.parent / ".data" / "brand.json")
)
LOGO_FILE = BRAND_FILE.with_name("brand-logo.png")
DEFAULT_BRAND = {"name": "", "text": "#0f172a", "background": "#ffffff", "accent": "#0f6cbd", "font": ""}
BRAND_COLORS = ("text", "background", "accent")
HEX = re.compile(r"#[0-9a-fA-F]{6}")
FONT = re.compile(r"""[\w ,.'"-]{1,160}""")
MAX_BRAND_NAME = 60
MAX_LOGO_BYTES = 600_000
MAX_LOGO_SIDE = 4096
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
INDEX_FILE = demo.BASE / "static" / "index.html"

SCENARIOS_BY_LANG = {lang: demo.load_scenarios(lang=lang) for lang in demo.LANGS}
LABS = {lang: demo.load_lab(lang) for lang in demo.LANGS}
PRICING = demo.Pricing(demo.load_json("pricing.json"))
DX_BY_LANG = {lang: dx.load_cases(lang) for lang in demo.LANGS}
DX_PRICE = PRICING.data["decisions_api"]

# Games always send the model the same Spanish text: they don't depend on the UI language.
GAMES = SCENARIOS_BY_LANG[demo.DEFAULT_LANG]

# User-facing error messages, by UI language (X-Demo-Lang header).
MESSAGES = {
    "es": {
        "bad_code": "Código de acceso incorrecto",
        "no_endpoint": "Configura AZURE_AI_ENDPOINT para llamar al modelo.",
        "unknown_scenario": "Escenario desconocido: {id}",
        "unknown_game": "Juego desconocido: {id}",
        "unknown_items": "Elementos desconocidos: {ids}",
        "unknown_model": "Modelo de comparación no disponible: {model}",
        "lab_state": "El estado debe ser un texto o un objeto JSON no vacío.",
        "lab_state_size": "En el laboratorio el estado admite hasta {max} caracteres.",
        "lab_no_questions": "Añade al menos una pregunta.",
        "lab_max_questions": "En el laboratorio se admiten hasta {max} preguntas.",
        "lab_question_type": "La pregunta '{name}' debe tener type 'choice', 'score' o 'noul'.",
        "game_state": "El estado debe tener entre 1 y {max} caracteres.",
        "game_incomplete": "El modelo no devolvió una respuesta completa.",
        "unknown_dx_case": "Caso desconocido: {id}",
        "unknown_dx_item": "Elemento desconocido: {id}",
        "unknown_dx_step": "Paso desconocido: {id}",
        "unknown_dx_checklist": "Lista de comprobación desconocida: {id}",
        "dx_upload_type": "La foto debe ser una imagen JPEG, PNG o WebP.",
        "dx_upload_size": "La foto admite hasta {max} MB.",
        "brand_name": "El nombre admite hasta {max} caracteres.",
        "brand_color": "Los colores deben tener el formato #RRGGBB.",
        "brand_font": "Nombre de fuente no válido: usa letras, números, espacios, comas y comillas.",
        "brand_logo": "El logotipo debe ser una imagen PNG de hasta {max} KB y {side} px por lado.",
    },
    "en": {
        "bad_code": "Wrong access code",
        "no_endpoint": "Set AZURE_AI_ENDPOINT to call the model.",
        "unknown_scenario": "Unknown scenario: {id}",
        "unknown_game": "Unknown game: {id}",
        "unknown_items": "Unknown items: {ids}",
        "unknown_model": "Comparison model not available: {model}",
        "lab_state": "The state must be a non-empty text or JSON object.",
        "lab_state_size": "In the lab the state accepts up to {max} characters.",
        "lab_no_questions": "Add at least one question.",
        "lab_max_questions": "The lab accepts up to {max} questions.",
        "lab_question_type": "Question '{name}' must have type 'choice', 'score' or 'noul'.",
        "game_state": "The state must be between 1 and {max} characters.",
        "game_incomplete": "The model did not return a complete answer.",
        "unknown_dx_case": "Unknown case: {id}",
        "unknown_dx_item": "Unknown item: {id}",
        "unknown_dx_step": "Unknown step: {id}",
        "unknown_dx_checklist": "Unknown checklist: {id}",
        "dx_upload_type": "The photo must be a JPEG, PNG or WebP image.",
        "dx_upload_size": "The photo accepts up to {max} MB.",
        "brand_name": "The name accepts up to {max} characters.",
        "brand_color": "Colors must use the #RRGGBB format.",
        "brand_font": "Invalid font name: use letters, numbers, spaces, commas and quotes.",
        "brand_logo": "The logo must be a PNG image of up to {max} KB and {side} px per side.",
    },
}


def lang_of(request: Request) -> str:
    code = request.headers.get("x-demo-lang", "").strip().lower()
    return code if code in demo.LANGS else demo.DEFAULT_LANG


def fail(status: int, lang: str, key: str, **params: Any) -> HTTPException:
    return HTTPException(status_code=status, detail=MESSAGES[lang][key].format(**params))


def loc_label(item: dict, lang: str) -> str:
    return item.get(f"label_{lang}") or item["label"]


def _comparisons() -> dict[str, dict]:
    """LLMs available for the race: only the deployed ones (COMPARISON_DEPLOYMENTS)."""
    configured = PRICING.data.get("comparisons", [])
    out = [c for c in configured if c["deployment"] in ALLOWED_LLMS]
    known = {c["deployment"] for c in configured}
    out += [{"id": d, "deployment": d, "label": d, "reasoning_effort": None} for d in ALLOWED_LLMS if d not in known]
    return {c["id"]: c for c in out}


COMPARISONS = _comparisons()
WARM_IDLE_S = 180  # after a few minutes without calls, the first decision takes ~3 s instead of <1 s


async def _prime_model(app: FastAPI) -> None:
    """A minimal decision to wake up the model before the presenter clicks "Process"."""
    try:
        await app.state.client.decide("Hola, buenos días.", {"saludo": {"type": "noul", "instructions": "¿El mensaje es un saludo?"}})
        log.info("Decision-1 warmed up")
    except Exception as exc:  # noqa: BLE001 - warm-up is optional
        log.warning("Could not warm up Decision-1: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    client = FoundryClient(ENDPOINT, DECISION_DEPLOYMENT) if ENDPOINT else None
    app.state.client = client
    app.state.primed_at = 0.0
    app.state.prime_task = None
    app.state.d1_sem = asyncio.Semaphore(6)
    app.state.llm_sem = asyncio.Semaphore(8)
    app.state.dx_sem = asyncio.Semaphore(6)
    if client:
        try:
            await client.warmup()
        except Exception as exc:  # noqa: BLE001 - the web app must start even if the warm-up fails
            log.warning("Could not warm up the connection to Foundry: %s", exc)
    else:
        log.warning("AZURE_AI_ENDPOINT is not set: the web app starts, but it can't call the model.")
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
    # Foundry 401/403 errors are about the identity's permissions, not the demo access code.
    status = exc.status if exc.status in (400, 404, 413, 422, 429) else 502
    return JSONResponse({"error": "foundry", "status": exc.status, "detail": exc.detail}, status_code=status)


@app.middleware("http")
async def _no_cache_static(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers.setdefault("Vary", "X-Demo-Lang")
    else:
        response.headers.setdefault("Cache-Control", "no-cache")
    return response


def require_code(request: Request) -> None:
    if ACCESS_CODE:
        given = request.headers.get("x-demo-code", "")
        if not hmac.compare_digest(given.encode(), ACCESS_CODE.encode()):
            raise fail(401, lang_of(request), "bad_code")


def client_of(request: Request) -> FoundryClient:
    client = request.app.state.client
    if not client:
        raise fail(503, lang_of(request), "no_endpoint")
    return client


def quota(client: FoundryClient) -> dict:
    """Estimated available requests: last quota header + linear refill (per-minute limit)."""
    rate = client.last_rate or {}
    limit = rate.get("limit") or DEFAULT_RPM
    remaining = rate.get("remaining")
    if remaining is None:
        estimate = float(limit)
    else:
        estimate = min(float(limit), remaining + (time.time() - client.last_rate_ts) * limit / 60)
    return {"limit": limit, "remaining": int(estimate), "region": rate.get("region")}


def scenario(scenario_id: str, lang: str) -> dict:
    sc = SCENARIOS_BY_LANG[lang].get(scenario_id)
    if not sc or sc.get("kind") == "game":
        raise fail(404, lang, "unknown_scenario", id=scenario_id)
    return sc


def game(game_id: str, lang: str) -> dict:
    sc = GAMES.get(game_id)
    if not sc or sc.get("kind") != "game":
        raise fail(404, lang, "unknown_game", id=game_id)
    return sc


def items_of(sc: dict, item_ids: list[str] | None, lang: str) -> list[dict]:
    try:
        return demo.select_items(sc, item_ids)
    except demo.UnknownItems as exc:
        raise fail(404, lang, "unknown_items", ids=", ".join(exc.ids)) from exc


def comparison(model: str, lang: str) -> dict:
    cmp = COMPARISONS.get(model)
    if not cmp:
        raise fail(400, lang, "unknown_model", model=model)
    return cmp


def lab_payload(state: Any, questions: dict | None, lang: str) -> tuple[Any, dict]:
    if not isinstance(state, (str, dict)) or not state:
        raise fail(400, lang, "lab_state")
    size = len(state) if isinstance(state, str) else len(json.dumps(state, ensure_ascii=False))
    if size > LAB_MAX_STATE_CHARS:
        raise fail(413, lang, "lab_state_size", max=LAB_MAX_STATE_CHARS)
    if not questions:
        raise fail(400, lang, "lab_no_questions")
    if len(questions) > LAB_MAX_QUESTIONS:
        raise fail(400, lang, "lab_max_questions", max=LAB_MAX_QUESTIONS)
    for name, q in questions.items():
        if not isinstance(q, dict) or q.get("type") not in ("choice", "score", "noul"):
            raise fail(400, lang, "lab_question_type", name=name)
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


class GameIn(BaseModel):
    game: str = "invaders"
    model: str
    state: str


class DxIn(BaseModel):
    case: str
    item: str
    step: str | None = None
    checklist: str | None = None
    prior: dict[str, dict] | None = None
    image: str | None = None


@app.get("/healthz")
async def healthz() -> dict:
    return {"ok": True}


# ---------- Client brand: logo, name, colors and font ----------

_brand_cache: dict[str, Any] = {"key": None, "brand": None}


def _valid_font(font: str) -> bool:
    return bool(FONT.fullmatch(font)) and font.count('"') % 2 == 0 and font.count("'") % 2 == 0


def _clean_brand(data: dict) -> dict:
    """Sanitized saved values: anything invalid falls back to the Microsoft Foundry value."""
    brand = dict(DEFAULT_BRAND)
    name = data.get("name")
    if isinstance(name, str):
        brand["name"] = " ".join(name.split())[:MAX_BRAND_NAME]
    for key in BRAND_COLORS:
        value = data.get(key)
        if isinstance(value, str) and HEX.fullmatch(value):
            brand[key] = value.lower()
    font = data.get("font")
    if isinstance(font, str) and _valid_font(font):
        brand["font"] = font
    logo = data.get("logo")
    brand["logo"] = logo if isinstance(logo, str) and re.fullmatch(r"[0-9a-f]{12}", logo) else None
    return brand


def _read_brand() -> tuple[dict, bool]:
    """Saved brand and whether there is one; reread when the file changes."""
    try:
        st = BRAND_FILE.stat()
    except FileNotFoundError:
        return {**DEFAULT_BRAND, "logo": None}, False
    except OSError as exc:
        log.warning("Could not read %s: %s", BRAND_FILE, exc)
        return {**DEFAULT_BRAND, "logo": None}, False
    key = (st.st_mtime_ns, st.st_size)
    if _brand_cache["key"] != key:
        try:
            data = json.loads(BRAND_FILE.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            log.warning("Could not read %s: %s", BRAND_FILE, exc)
            return {**DEFAULT_BRAND, "logo": None}, False
        _brand_cache.update(key=key, brand=_clean_brand(data if isinstance(data, dict) else {}))
    return dict(_brand_cache["brand"]), True


def _rgb(color: str) -> tuple[int, ...]:
    return tuple(int(color[i : i + 2], 16) for i in (1, 3, 5))


def _luminance(color: str) -> float:
    def lin(c: float) -> float:
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    r, g, b = (lin(c / 255) for c in _rgb(color))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def _contrast(a: str, b: str) -> float:
    hi, lo = sorted((_luminance(a), _luminance(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def _mix(a: str, b: str, weight: float) -> str:
    """Like color-mix(in srgb, a weight, b). Rounds the same way as Math.round in the browser."""
    return "#" + "".join(f"{math.floor(x * weight + y * (1 - weight) + 0.5):02x}" for x, y in zip(_rgb(a), _rgb(b)))


def _on_accent(accent: str) -> str:
    """Text on the accent (primary buttons): white if it reads well; otherwise, the one with the most contrast."""
    if _contrast("#ffffff", accent) >= 4.5:
        return "#ffffff"
    return max(("#ffffff", "#111111"), key=lambda c: _contrast(c, accent))


def _accent_text(accent: str, text: str, background: str) -> str:
    """The accent used as text, moved toward the text color until it reads well (AA) on the background,
    the panels (in the dark theme, 6% of the text color) and the accent highlights (up to 20%), as in brand.css."""
    panel = _mix(text, background, 0.06)
    surfaces = (background, panel, _mix(accent, background, 0.2), _mix(accent, panel, 0.2))
    for step in range(11):
        color = _mix(accent, text, 1 - step / 10)
        if min(_contrast(color, s) for s in surfaces) >= 4.5:
            return color
    return text


def _brand_public(brand: dict, configured: bool) -> dict:
    return {
        "configured": configured,
        "themed": any(brand[k] != DEFAULT_BRAND[k] for k in BRAND_COLORS),
        "scheme": "dark" if _luminance(brand["background"]) < 0.18 else "light",
        **{k: brand[k] for k in ("name", *BRAND_COLORS, "font")},
        "onAccent": _on_accent(brand["accent"]),
        "accentText": _accent_text(brand["accent"], brand["text"], brand["background"]),
        "logo": f"/api/brand/logo?v={brand['logo']}" if brand.get("logo") else None,
    }


@app.get("/api/brand")
async def get_brand() -> dict:
    """No access code needed, like the page itself: the brand is visible before you enter."""
    return _brand_public(*_read_brand())


@app.get("/api/brand/logo")
async def get_brand_logo(v: str = "") -> Response:
    brand, _ = _read_brand()
    try:
        data = LOGO_FILE.read_bytes() if brand["logo"] else b""
    except OSError:
        data = b""
    if not data:
        raise HTTPException(404, "No logo")
    cache = "public, max-age=31536000, immutable" if v == brand["logo"] else "no-cache"
    return Response(data, media_type="image/png", headers={"Cache-Control": cache, "X-Content-Type-Options": "nosniff"})


class BrandIn(BaseModel):
    name: str = ""
    text: str
    background: str
    accent: str
    font: str = ""
    # data:image/png;base64,… to change the logo and null to remove it; if omitted, it's kept.
    logo: str | None = None


def _decode_logo(data_url: str, lang: str) -> bytes:
    prefix = "data:image/png;base64,"
    error = fail(400, lang, "brand_logo", max=MAX_LOGO_BYTES // 1000, side=MAX_LOGO_SIDE)
    if not data_url.startswith(prefix) or len(data_url) > len(prefix) + (MAX_LOGO_BYTES + 2) // 3 * 4:
        raise error
    try:
        data = base64.b64decode(data_url[len(prefix) :], validate=True)
    except (binascii.Error, ValueError):
        raise error from None
    if len(data) > MAX_LOGO_BYTES or not data.startswith(PNG_MAGIC) or data[12:16] != b"IHDR":
        raise error
    width, height = int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")
    if not (0 < width <= MAX_LOGO_SIDE and 0 < height <= MAX_LOGO_SIDE):
        raise error
    return data


def _write_atomic(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f"{path.name}.tmp")
    tmp.write_bytes(data)
    os.replace(tmp, path)


@app.post("/api/brand", dependencies=[Depends(require_code)])
async def set_brand(request: Request, body: BrandIn) -> dict:
    lang = lang_of(request)
    name = " ".join(body.name.split())
    if len(name) > MAX_BRAND_NAME:
        raise fail(400, lang, "brand_name", max=MAX_BRAND_NAME)
    colors = {k: getattr(body, k).strip().lower() for k in BRAND_COLORS}
    if not all(HEX.fullmatch(v) for v in colors.values()):
        raise fail(400, lang, "brand_color")
    font = " ".join(body.font.split())
    if font and not _valid_font(font):
        raise fail(400, lang, "brand_font")
    logo = _read_brand()[0]["logo"]
    png = None
    if "logo" in body.model_fields_set:
        png = _decode_logo(body.logo, lang) if body.logo else None
        logo = hashlib.sha256(png).hexdigest()[:12] if png else None
    brand = {"name": name, **colors, "font": font, "logo": logo}
    if brand == {**DEFAULT_BRAND, "logo": None}:
        # Same as Microsoft Foundry: the brand is deleted and the demo returns to its original look.
        for path in (BRAND_FILE, LOGO_FILE):
            path.unlink(missing_ok=True)
        log.info("Brand reset")
        return _brand_public(*_read_brand())
    if png:
        _write_atomic(LOGO_FILE, png)
    _write_atomic(BRAND_FILE, json.dumps(brand, ensure_ascii=False, indent=2).encode("utf-8"))
    if not logo:
        LOGO_FILE.unlink(missing_ok=True)
    st = BRAND_FILE.stat()
    _brand_cache.update(key=(st.st_mtime_ns, st.st_size), brand=brand)
    log.info("Brand saved: %s", name or "(no name)")
    return _brand_public(brand, True)


BRAND_MARK = re.compile(r"(<!--brand-->).*?(<!--/brand-->)", re.S)


def _brand_mark(pub: dict) -> str:
    """Client logo and name instead of Microsoft Foundry's ("" if there is neither)."""
    parts = []
    if pub["logo"]:
        alt = html.escape(pub["name"] or "Logo", quote=True)
        parts.append(f'<img class="brand-logo" src="{html.escape(pub["logo"], quote=True)}" alt="{alt}" />')
    if pub["name"]:
        parts.append(f'<span class="brand-name">{html.escape(pub["name"])}</span>')
    return "".join(parts)


def _brand_vars(pub: dict) -> str:
    decls = []
    if pub["themed"]:
        decls += [
            f"--brand-text:{pub['text']}",
            f"--brand-bg:{pub['background']}",
            f"--brand-accent:{pub['accent']}",
            f"--brand-on-accent:{pub['onAccent']}",
            f"--brand-accent-text:{pub['accentText']}",
        ]
    if pub["font"]:
        decls.append(f"--font:{pub['font']}")
    return f":root{{{';'.join(decls)}}}" if decls else ""


@app.get("/api/config")
async def config(request: Request) -> dict:
    lang = lang_of(request)
    pricing = {
        **PRICING.data,
        "source": PRICING.data.get(f"source_{lang}") or PRICING.data.get("source"),
        "comparisons": [{**c, "label": loc_label(c, lang)} for c in PRICING.data.get("comparisons", [])],
    }
    return {
        "decision": {
            "model": "Microsoft-Decision-1",
            "deployment": DECISION_DEPLOYMENT,
            "sku": DECISION_SKU,
            "location": LOCATION,
            "rpm": DEFAULT_RPM,
        },
        # Decision cadence for games: the Decision-1 limit with a 5% margin. Both models use the same one.
        "game": {"cadence_ms": max(1000, math.ceil(60_000 / max(1, DEFAULT_RPM) * 1.05))},
        "dx": {"model": DX_DEPLOYMENT},
        "comparisons": [{"id": c["id"], "label": loc_label(c, lang), "deployment": c["deployment"]} for c in COMPARISONS.values()],
        "pricing": pricing,
        "access_required": bool(ACCESS_CODE),
        "configured": bool(ENDPOINT),
    }


@app.get("/api/scenarios", dependencies=[Depends(require_code)])
async def scenarios(request: Request) -> dict:
    lang = lang_of(request)
    return {"lang": lang, "scenarios": list(SCENARIOS_BY_LANG[lang].values()), "lab": LABS[lang]}


@app.get("/api/quota", dependencies=[Depends(require_code)])
async def get_quota(request: Request) -> dict:
    return quota(client_of(request))


@app.post("/api/warm", dependencies=[Depends(require_code)])
async def warm(request: Request) -> dict:
    """Warms up the model in the background after a while without calls (uses 1 request from the quota)."""
    client, state = client_of(request), request.app.state
    now = time.time()
    if now - max(client.last_rate_ts, state.primed_at) < WARM_IDLE_S or (state.prime_task and not state.prime_task.done()):
        return {"warming": False}
    state.primed_at = now
    state.prime_task = asyncio.create_task(_prime_model(request.app))
    return {"warming": True}


@app.post("/api/decide", dependencies=[Depends(require_code)])
async def decide(body: DecideIn, request: Request) -> dict:
    """One call to Decision-1: an item from a scenario or a free-form state (Lab)."""
    client = client_of(request)
    lang = lang_of(request)
    if body.scenario:
        sc = scenario(body.scenario, lang)
        item = items_of(sc, [body.item_id] if body.item_id else None, lang)[0]
        state, questions = demo.item_state(sc, item), sc["questions"]
    else:
        state, questions = lab_payload(body.state, body.questions, lang)
    async with request.app.state.d1_sem:
        res = await client.decide(state, questions)
    return {**res, "item_id": body.item_id, "cost": PRICING.cost(D1_PRICE_KEY, res["usage"]), "quota": quota(client)}


@app.post("/api/game/decide", dependencies=[Depends(require_code)])
async def game_decide(body: GameIn, request: Request) -> dict:
    """A real-time decision: same state and same questions for Decision-1 or for the opponent LLM.

    No retries on 429: in a game a late answer is worth less than none; the client skips that turn.
    """
    client = client_of(request)
    lang = lang_of(request)
    sc = game(body.game, lang)
    if not body.state.strip() or len(body.state) > GAME_MAX_STATE_CHARS:
        raise fail(400, lang, "game_state", max=GAME_MAX_STATE_CHARS)
    if body.model == GAME_D1_ID:
        async with request.app.state.d1_sem:
            res = await client.decide(f"{sc['context']}\n\n{body.state}", sc["questions"], max_wait_s=0)
        cost, extra = PRICING.cost(D1_PRICE_KEY, res["usage"]), {"quota": quota(client)}
    else:
        cmp = comparison(body.model, lang)
        effort = cmp.get("reasoning_effort")
        tokens = GAME_LLM_TOKENS if effort == "none" else GAME_LLM_REASONING_TOKENS
        async with request.app.state.llm_sem:
            res = await client.decide_with_llm(cmp["deployment"], body.state, sc["questions"], sc["context"], effort, tokens, max_wait_s=0)
        cost, extra = PRICING.cost(cmp["deployment"], res["usage"]), {}
    answers = res["answers"]
    if any(answers.get(name, {}).get("type") == "missing" for name in sc["questions"]):
        raise fail(502, lang, "game_incomplete")
    return {
        "model": body.model,
        "answers": answers,
        "latency_ms": res["latency_ms"],
        "usage": res["usage"],
        "cost": cost,
        **extra,
    }


@app.post("/api/decide-batch", dependencies=[Depends(require_code)])
async def decide_batch(body: BatchIn, request: Request) -> dict:
    """All items in a single call (or a few, if they exceed 250 questions)."""
    client = client_of(request)
    lang = lang_of(request)
    sc = scenario(body.scenario, lang)
    items = items_of(sc, body.item_ids, lang)
    async with request.app.state.d1_sem:
        res = await demo.d1_batch(client, sc, items)
    return {**res, "cost": PRICING.cost(D1_PRICE_KEY, res["usage"]), "quota": quota(client)}


@app.post("/api/compare", dependencies=[Depends(require_code)])
async def compare(body: CompareIn, request: Request) -> dict:
    """Same item and same questions with a generative LLM and structured output."""
    client = client_of(request)
    lang = lang_of(request)
    cmp = comparison(body.model, lang)
    sc = scenario(body.scenario, lang)
    item = items_of(sc, [body.item_id] if body.item_id else None, lang)[0]
    async with request.app.state.llm_sem:
        res = await demo.llm_item(client, sc, item, cmp)
    return {**res, "item_id": item["id"], "label": loc_label(cmp, lang), "cost": PRICING.cost(cmp["deployment"], res["usage"])}


@app.post("/api/compare-batch", dependencies=[Depends(require_code)])
async def compare_batch(body: CompareIn, request: Request) -> dict:
    client = client_of(request)
    lang = lang_of(request)
    cmp = comparison(body.model, lang)
    sc = scenario(body.scenario, lang)
    items = items_of(sc, body.item_ids, lang)
    async with request.app.state.llm_sem:
        res = await demo.llm_batch(client, sc, items, cmp)
    return {**res, "label": loc_label(cmp, lang), "cost": PRICING.cost(cmp["deployment"], res["usage"])}


# ---------- OpenAI Decisions API (second tab) ----------


def dx_case(case_id: str, lang: str) -> dict:
    case = DX_BY_LANG[lang].get(case_id)
    if not case:
        raise fail(404, lang, "unknown_dx_case", id=case_id)
    return case


@app.get("/api/dx", dependencies=[Depends(require_code)])
async def dx_cases(request: Request) -> dict:
    lang = lang_of(request)
    return {
        "lang": lang,
        "model": DX_DEPLOYMENT,
        "configured": bool(ENDPOINT),
        "pricing": {**DX_PRICE, "usd_to_eur": PRICING.usd_to_eur},
        "cases": [dx.public(c, lang) for c in DX_BY_LANG[lang].values()],
    }


@app.post("/api/dx/decide", dependencies=[Depends(require_code)])
async def dx_decide(body: DxIn, request: Request) -> dict:
    """One call to the OpenAI Decisions API: an item of a case, a step of the cascade or a checklist of a contract."""
    client = client_of(request)
    lang = lang_of(request)
    case = dx_case(body.case, lang)
    try:
        item = dx.find_item(case, body.item)
        plan = dx.plan(case, item, lang, body.step, body.checklist, body.prior, body.image)
    except dx.DxError as exc:
        raise fail(exc.status, lang, exc.key, **exc.params) from exc
    out: dict[str, Any] = {"case": case["id"], "item": item["id"], "model": DX_DEPLOYMENT}
    if "step" in plan:
        out["step"] = plan["step"]["id"]
    if "checklist" in plan:
        out["checklist"] = plan["checklist"]["id"]
    if "skip" in plan:
        usage = {"input_tokens": 0, "cached_input_tokens": 0, "cache_write_tokens": 0, "output_tokens": 0}
        return {**out, "skipped": True, "route": plan["skip"], "answers": {}, "usage": usage, "cost": dx.cost(usage, DX_PRICE, PRICING.usd_to_eur), "latency_ms": 0, "total_ms": 0, "wait_ms": 0, "attempts": 0}
    async with request.app.state.dx_sem:
        res = await client.decisions(DX_DEPLOYMENT, plan["input"], plan["questions"])
    answers = res["answers"]
    out.update(
        {
            "answers": answers,
            "usage": res["usage"],
            "cost": dx.cost(res["usage"], DX_PRICE, PRICING.usd_to_eur),
            "latency_ms": res["latency_ms"],
            "total_ms": res["total_ms"],
            "wait_ms": res["wait_ms"],
            "attempts": res["attempts"],
            "request": dx.view({"model": DX_DEPLOYMENT, "input": plan["input"], "questions": plan["questions"]}, lang),
            "response": dx.view(res["raw"], lang),
        }
    )
    if case["kind"] == "cascade":
        out["route"] = dx.route(case, plan["step"], item, answers, lang)
    elif case["kind"] == "contracts":
        out["review"] = dx.review(case, plan, answers)
    else:
        out["assessment"] = dx.assess(case, item, answers, lang)
    return out


@app.get("/", include_in_schema=False)
@app.get("/index.html", include_in_schema=False)
async def index() -> HTMLResponse:
    """index.html with the brand already applied: the page shows the client's colors from the first frame."""
    page = INDEX_FILE.read_text(encoding="utf-8")
    pub = _brand_public(*_read_brand())
    if pub["themed"]:
        page = page.replace("<html ", f'<html data-brand="{pub["scheme"]}" ', 1)
    page = page.replace("</head>", f'  <style id="brand-vars">{_brand_vars(pub)}</style>\n  </head>', 1)
    mark = _brand_mark(pub)
    if mark:
        page = BRAND_MARK.sub(lambda m: m.group(1) + mark + m.group(2), page, count=1)
    return HTMLResponse(page, headers={"Cache-Control": "no-cache"})


app.mount("/", StaticFiles(directory=demo.BASE / "static", html=True), name="static")
