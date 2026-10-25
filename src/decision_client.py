"""Cliente mínimo y sin claves (Entra ID) para Microsoft-Decision-1, la OpenAI Decisions API y los LLMs de comparación en Microsoft Foundry.

Microsoft-Decision-1 habla el protocolo "System One":
    POST {endpoint}/providers/microsoft/v1/systemone
    {"model": "<deployment>", "state": <texto u objeto>, "questions": {"<nombre>": {"type": "choice"|"score"|"noul", ...}}}

La OpenAI Decisions API acepta texto, imágenes y JSON como entrada:
    POST {endpoint}/openai/v1/decisions
    {"model": "<deployment>", "input": <texto o mensajes>, "questions": [{"type": "predicate"|"choice"|"score", "name": ..., ...}]}
"""

from __future__ import annotations

import asyncio
import json
import os
import random
import time
from typing import Any

import httpx
from azure.identity import DefaultAzureCredential, ManagedIdentityCredential

SCOPE = "https://cognitiveservices.azure.com/.default"
DECISION_PATH = "/providers/microsoft/v1/systemone"
CHAT_PATH = "/openai/v1/chat/completions"
DECISIONS_PATH = "/openai/v1/decisions"
MAX_RATE_WAIT_S = 45.0


class FoundryError(Exception):
    def __init__(self, status: int, detail: Any):
        super().__init__(f"{status}: {detail}")
        self.status = status
        self.detail = detail


def _make_credential():
    # En App Service usamos la managed identity; en local, `az login` / `azd auth login`.
    if os.environ.get("IDENTITY_ENDPOINT") or os.environ.get("MSI_ENDPOINT"):
        return ManagedIdentityCredential(client_id=os.environ.get("AZURE_CLIENT_ID"))
    return DefaultAzureCredential(
        exclude_managed_identity_credential=True,
        exclude_interactive_browser_credential=True,
        additionally_allowed_tenants=["*"],
    )


def _rate_info(headers: httpx.Headers) -> dict:
    def num(name: str) -> int | None:
        try:
            return int(float(headers[name]))
        except (KeyError, ValueError):
            return None

    return {
        "limit": num("x-ratelimit-limit-requests"),
        "remaining": num("x-ratelimit-remaining-requests"),
        "region": headers.get("azureml-destination-region") or headers.get("x-ms-region"),
    }


class FoundryClient:
    def __init__(self, endpoint: str, decision_deployment: str, max_rate_wait_s: float = MAX_RATE_WAIT_S):
        self.endpoint = endpoint.rstrip("/")
        self.decision_deployment = decision_deployment
        self.max_rate_wait_s = max_rate_wait_s
        self._credential = _make_credential()
        self._tenant = os.environ.get("AZURE_TENANT_ID") or None
        self._token: str | None = None
        self._expires_on = 0.0
        self._token_lock = asyncio.Lock()
        self._http = httpx.AsyncClient(
            timeout=httpx.Timeout(90.0, connect=10.0),
            limits=httpx.Limits(max_connections=64, max_keepalive_connections=32, keepalive_expiry=120),
        )
        self.last_rate: dict = {}
        self.last_rate_ts = 0.0

    async def close(self) -> None:
        await self._http.aclose()

    async def _bearer(self) -> str:
        if self._token and time.time() < self._expires_on - 300:
            return self._token
        async with self._token_lock:
            if not self._token or time.time() >= self._expires_on - 300:
                kwargs = {"tenant_id": self._tenant} if self._tenant else {}
                tok = await asyncio.to_thread(self._credential.get_token, SCOPE, **kwargs)
                self._token, self._expires_on = tok.token, float(tok.expires_on)
        return self._token  # type: ignore[return-value]

    async def warmup(self) -> None:
        """Obtiene el token y abre la conexión TLS sin consumir cuota de Decision-1."""
        token = await self._bearer()
        try:
            await self._http.get(f"{self.endpoint}/openai/v1/models", headers={"Authorization": f"Bearer {token}"})
        except httpx.HTTPError:
            pass

    async def _post(self, path: str, body: dict, max_wait_s: float | None = None) -> dict:
        """POST con reintentos ante 429 (respetando retry-after-ms) y 5xx.

        Devuelve el JSON y métricas: latency_ms (solo el intento bueno), wait_ms (espera por cuota) y attempts.
        `max_wait_s` sustituye al máximo de espera por cuota (0 = sin reintentos, para llamadas en tiempo real).
        """
        limit_s = self.max_rate_wait_s if max_wait_s is None else max_wait_s
        attempts, waited = 0, 0.0
        t_start = time.perf_counter()
        while True:
            attempts += 1
            headers = {"Authorization": f"Bearer {await self._bearer()}"}
            t0 = time.perf_counter()
            resp = await self._http.post(f"{self.endpoint}{path}", json=body, headers=headers)
            latency_ms = (time.perf_counter() - t0) * 1000
            retryable = resp.status_code == 429 or resp.status_code in (500, 502, 503, 504)
            if retryable and attempts < 100 and waited < limit_s:
                hint = resp.headers.get("retry-after-ms")
                wait_s = float(hint) / 1000 if hint else float(resp.headers.get("retry-after", 0) or 0)
                wait_s = max(wait_s, 0.2 * attempts) + random.uniform(0.05, 0.35)
                waited += wait_s
                await asyncio.sleep(wait_s)
                continue
            if resp.status_code >= 400:
                try:
                    detail = resp.json()
                except ValueError:
                    detail = resp.text
                raise FoundryError(resp.status_code, detail)
            rate = _rate_info(resp.headers)
            return {
                "data": resp.json(),
                "latency_ms": round(latency_ms, 1),
                "total_ms": round((time.perf_counter() - t_start) * 1000, 1),
                "wait_ms": round(waited * 1000),
                "attempts": attempts,
                "rate": rate,
            }

    # ---------- Microsoft-Decision-1 ----------

    async def decide(self, state: Any, questions: dict[str, dict], max_wait_s: float | None = None) -> dict:
        body = {"model": self.decision_deployment, "state": state, "questions": questions}
        res = await self._post(DECISION_PATH, body, max_wait_s)
        self.last_rate = res["rate"]
        self.last_rate_ts = time.time()
        data = res.pop("data")
        usage = data.get("usage") or {}
        return {
            **res,
            "model": data.get("model"),
            "answers": normalize_answers(data.get("answers") or {}, questions),
            "usage": {"input_tokens": usage.get("input_tokens", 0), "output_tokens": usage.get("output_tokens", 0)},
            "request": body,
            "raw": data,
        }

    # ---------- OpenAI Decisions API ----------

    async def decisions(self, deployment: str, input: Any, questions: list[dict], max_wait_s: float | None = None) -> dict:
        body = {"model": deployment, "input": input, "questions": questions}
        res = await self._post(DECISIONS_PATH, body, max_wait_s)
        data = res.pop("data")
        res.pop("rate", None)
        usage = data.get("usage") or {}
        details = usage.get("input_tokens_details") or {}
        return {
            **res,
            "model": data.get("model"),
            "answers": normalize_decisions(data.get("answers") or [], questions),
            "usage": {
                "input_tokens": usage.get("input_tokens", 0) or 0,
                "cached_input_tokens": details.get("cached_tokens", 0) or 0,
                "cache_write_tokens": details.get("cache_write_tokens", 0) or 0,
                "output_tokens": usage.get("output_tokens", 0) or 0,
            },
            "raw": data,
        }

    # ---------- LLM generativo equivalente (para la carrera) ----------

    async def chat_json(
        self,
        deployment: str,
        system: str,
        user: str,
        schema: dict,
        reasoning_effort: str | None = None,
        max_tokens: int = 4000,
        max_wait_s: float | None = None,
    ) -> dict:
        """Chat completions con salida estructurada (json_schema estricto). Devuelve el JSON ya parseado."""
        body: dict[str, Any] = {
            "model": deployment,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "response_format": {"type": "json_schema", "json_schema": {"name": "decision", "strict": True, "schema": schema}},
            "max_completion_tokens": max_tokens,
        }
        if reasoning_effort:
            body["reasoning_effort"] = reasoning_effort
        res = await self._post(CHAT_PATH, body, max_wait_s)
        data = res.pop("data")
        content = (data.get("choices") or [{}])[0].get("message", {}).get("content") or "{}"
        try:
            parsed = json.loads(content)
        except json.JSONDecodeError:
            parsed = {}
        usage = data.get("usage") or {}
        return {
            **res,
            "model": data.get("model"),
            "parsed": parsed,
            "usage": {
                "input_tokens": usage.get("prompt_tokens", 0),
                "cached_input_tokens": (usage.get("prompt_tokens_details") or {}).get("cached_tokens", 0),
                "output_tokens": usage.get("completion_tokens", 0),
                "reasoning_tokens": (usage.get("completion_tokens_details") or {}).get("reasoning_tokens", 0),
            },
            "reasoning_effort": reasoning_effort,
            "request": body,
        }

    async def decide_with_llm(
        self,
        deployment: str,
        state: Any,
        questions: dict[str, dict],
        context: str = "",
        reasoning_effort: str | None = None,
        max_tokens: int = 4000,
        max_wait_s: float | None = None,
        lang: str = "es",
    ) -> dict:
        user = state if isinstance(state, str) else json.dumps(state, ensure_ascii=False)
        res = await self.chat_json(
            deployment, llm_system_prompt(context, questions, lang), user, llm_schema(questions), reasoning_effort, max_tokens, max_wait_s
        )
        parsed = res.pop("parsed")
        return {**res, "answers": normalize_llm(parsed, questions), "raw": parsed}


def short_label(text: Any) -> str:
    """'Alta: impacto relevante…' -> 'Alta'."""
    s = text if isinstance(text, str) else json.dumps(text, ensure_ascii=False)
    return s.split(":", 1)[0].strip() if ":" in s[:40] else s[:40]


def normalize_answers(answers: dict[str, dict], questions: dict[str, dict]) -> dict[str, dict]:
    """Respuesta de Decision-1 -> forma uniforme para la interfaz (también usada para el LLM)."""
    out: dict[str, dict] = {}
    for name, q in questions.items():
        a = answers.get(name)
        if not a:
            out[name] = {"type": "missing"}
            continue
        kind = a.get("type") or q.get("type")
        if kind == "choice":
            probs = sorted(((k, float(v)) for k, v in (a.get("probabilities") or {}).items()), key=lambda kv: -kv[1])
            out[name] = {
                "type": "choice",
                "value": a.get("choice"),
                "confidence": a.get("confidence"),
                "probs": [{"key": k, "p": p} for k, p in probs],
            }
        elif kind == "score":
            raw = {int(k): float(v) for k, v in (a.get("probabilities") or {}).items()}
            criteria = q.get("criteria") or []
            level = max(raw, key=raw.get) if raw else None
            out[name] = {
                "type": "score",
                "value": level,
                "label": short_label(criteria[level]) if level is not None and level < len(criteria) else None,
                "expected": a.get("score"),
                "confidence": a.get("confidence"),
                "probs": [
                    {"key": i, "label": short_label(c), "p": raw.get(i, 0.0)} for i, c in enumerate(criteria)
                ],
            }
        elif kind == "noul":
            p = float(a.get("noul", 0.0))
            out[name] = {"type": "noul", "value": p >= 0.5, "p": p, "confidence": max(p, 1 - p)}
        else:
            out[name] = {"type": kind or "unknown", "raw": a}
    return out


PROMPT_TEXTS = {
    "es": {
        "intro": (
            "Eres un sistema de decisión. Lee el mensaje del usuario y responde a cada pregunta eligiendo "
            "exactamente una de las opciones permitidas. Devuelve solo el JSON pedido."
        ),
        "noul": "(true/false)",
        "choice": "(elige una clave)",
        "score": "(elige un nivel numérico, de menor a mayor)",
    },
    "en": {
        "intro": (
            "You are a decision system. Read the user's message and answer each question by choosing "
            "exactly one of the allowed options. Return only the requested JSON."
        ),
        "noul": "(true/false)",
        "choice": "(choose a key)",
        "score": "(choose a numeric level, from lowest to highest)",
    },
}


def normalize_decisions(answers: list[dict], questions: list[dict]) -> dict[str, dict]:
    """Respuestas de la Decisions API por nombre de pregunta, con el mismo vocabulario para los tres tipos.

    predicate → value (bool) y p; choice → value y probs ordenadas; score → value (índice del nivel), label y expected.
    `confidence` es la probabilidad de la respuesta elegida.
    """
    by_name = {a.get("name"): a for a in answers if isinstance(a, dict)}
    out: dict[str, dict] = {}
    for q in questions:
        name = q["name"]
        a = by_name.get(name)
        if not a:
            out[name] = {"type": "missing"}
            continue
        kind = a.get("type")
        if kind == "predicate":
            p = float(a.get("probability") or 0.0)
            out[name] = {"type": "predicate", "value": p >= 0.5, "p": p, "confidence": max(p, 1 - p)}
        elif kind == "choice":
            probs = sorted(
                ({"key": str(x.get("value")), "p": float(x.get("probability") or 0.0)} for x in a.get("probabilities") or []),
                key=lambda x: -x["p"],
            )
            value = a.get("choice") or (probs[0]["key"] if probs else None)
            conf = next((x["p"] for x in probs if x["key"] == value), 0.0)
            out[name] = {"type": "choice", "value": value, "confidence": conf, "probs": probs}
        elif kind == "score":
            labels = [lv.get("label") for lv in q.get("levels") or []]
            probs = []
            for x in a.get("probabilities") or []:
                label = x.get("label")
                idx = labels.index(label) if label in labels else int(x.get("value") or 0)
                probs.append({"key": idx, "label": labels[idx] if 0 <= idx < len(labels) else label, "p": float(x.get("probability") or 0.0)})
            probs.sort(key=lambda x: x["key"])
            best = max(probs, key=lambda x: x["p"]) if probs else {"key": 0, "label": None, "p": 0.0}
            expected = sum(x["key"] * x["p"] for x in probs)
            out[name] = {"type": "score", "value": best["key"], "label": best["label"], "expected": round(expected, 3), "confidence": best["p"], "probs": probs}
        else:
            out[name] = {"type": "refusal" if kind == "refusal" else "missing"}
    return out


def llm_system_prompt(context: str, questions: dict[str, dict], lang: str = "es") -> str:
    txt = PROMPT_TEXTS.get(lang) or PROMPT_TEXTS["es"]
    lines = []
    if context:
        lines += [context.strip(), ""]
    lines.append(txt["intro"])
    for name, q in questions.items():
        instr = q.get("instructions")
        instr = instr if isinstance(instr, str) else json.dumps(instr, ensure_ascii=False)
        if q["type"] == "noul":
            lines.append(f"- {name} {txt['noul']}: {instr}")
        elif q["type"] == "choice":
            lines.append(f"- {name} {txt['choice']}: {instr}")
            lines += [f"    · {k}: {v or ''}" for k, v in (q.get("criteria") or {}).items()]
        elif q["type"] == "score":
            lines.append(f"- {name} {txt['score']}: {instr}")
            lines += [f"    · {i}: {c or ''}" for i, c in enumerate(q.get("criteria") or [])]
    return "\n".join(lines)


def llm_schema(questions: dict[str, dict]) -> dict:
    props: dict[str, Any] = {}
    for name, q in questions.items():
        if q["type"] == "noul":
            props[name] = {"type": "boolean"}
        elif q["type"] == "choice":
            props[name] = {"type": "string", "enum": list((q.get("criteria") or {}).keys())}
        elif q["type"] == "score":
            props[name] = {"type": "integer", "enum": list(range(len(q.get("criteria") or [])))}
    return {"type": "object", "properties": props, "required": list(props), "additionalProperties": False}


def normalize_llm(parsed: dict, questions: dict[str, dict]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for name, q in questions.items():
        v = parsed.get(name)
        if v is None:
            out[name] = {"type": "missing"}
        elif q["type"] == "noul":
            out[name] = {"type": "noul", "value": bool(v), "p": 1.0 if v else 0.0, "confidence": None}
        elif q["type"] == "choice":
            out[name] = {"type": "choice", "value": v, "confidence": None, "probs": []}
        elif q["type"] == "score":
            criteria = q.get("criteria") or []
            label = short_label(criteria[v]) if isinstance(v, int) and 0 <= v < len(criteria) else None
            out[name] = {"type": "score", "value": v, "label": label, "expected": v, "confidence": None, "probs": []}
    return out
