"""OpenAI Decisions API: los cinco casos de la segunda pestaña.

El contenido está en src/dx/*.json (traducciones en src/dx/<idioma>/) y los textos largos en src/dx/textos/. Este módulo
construye las peticiones con imágenes, texto y JSON, decide el siguiente paso de la cascada, aplica las reglas
deterministas y calcula el coste teniendo en cuenta la caché.
"""

from __future__ import annotations

import base64
import binascii
import json
from datetime import date
from typing import Any

import demo

DX_DIR = demo.BASE / "dx"
TEXT_DIR = DX_DIR / "textos"
IMG_DIR = demo.BASE / "static" / "img" / "dx"
KINDS = ("cascade", "receipts", "creatives", "safety", "contracts")
UPLOAD_ID = "upload"
MAX_UPLOAD_BYTES = 3 * 1024 * 1024
MAX_VIEW_CHARS = 600
MIME = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}

TEXTS = {
    "es": {
        "low_confidence": "Confianza baja en «{label}» ({p:.0%}): decide una persona.",
        "no_answer": "Sin respuesta para «{label}»: decide una persona.",
        "missing_input": "Falta «{label}» para este paso: decide una persona.",
        "no_route": "Ninguna regla aplica: decide una persona.",
        "days": "{days} días desde la entrega (máximo {limit})",
        "low_rules": "Resultado poco seguro ({p:.0%}), sobre todo por «{label}»: decide una persona.",
        "upload_text": "Foto subida para inspección:",
        "upload_name": "Tu foto",
        "contract_text": "Contrato que hay que revisar:",
        "image": "imagen",
        "chars": "caracteres",
    },
    "en": {
        "low_confidence": "Low confidence in «{label}» ({p:.0%}): a person decides.",
        "no_answer": "No answer for «{label}»: a person decides.",
        "missing_input": "«{label}» is missing for this step: a person decides.",
        "no_route": "No rule applies: a person decides.",
        "days": "{days} days since delivery (maximum {limit})",
        "low_rules": "Uncertain result ({p:.0%}), mainly because of «{label}»: a person decides.",
        "upload_text": "Photo uploaded for inspection:",
        "upload_name": "Your photo",
        "contract_text": "Contract to review:",
        "image": "image",
        "chars": "characters",
    },
}

# Claves del JSON que ve el modelo, traducidas para que la petición se lea en el idioma de la interfaz.
JSON_KEYS = {
    "en": {
        "pedido": "order",
        "producto": "product",
        "importe_eur": "amount_eur",
        "fecha_entrega": "delivered_on",
        "fecha_reclamacion": "claimed_on",
        "dias_desde_entrega": "days_since_delivery",
        "cliente": "customer",
        "antiguedad_meses": "customer_for_months",
        "pedidos_12m": "orders_12m",
        "reclamaciones_12m": "claims_12m",
        "devoluciones_12m": "returns_12m",
        "decisiones_previas": "previous_decisions",
        "empleado": "employee",
        "categoria": "category",
        "importe": "amount",
        "fecha": "date",
        "concepto": "description",
        "proyecto": "project",
        "fecha_envio": "submitted_on",
    }
}


class DxError(Exception):
    """Error de la petición; `key` es un mensaje de app.MESSAGES."""

    def __init__(self, status: int, key: str, **params: Any):
        super().__init__(key)
        self.status, self.key, self.params = status, key, params


# ---------- Contenido ----------


def load_cases(lang: str = demo.DEFAULT_LANG) -> dict[str, dict]:
    cases = []
    for path in sorted(DX_DIR.glob("*.json")):
        base = json.loads(path.read_text(encoding="utf-8"))
        case = demo.localized(base, DX_DIR / lang / path.name, lang, frozenset(), f"dx/{path.name}")
        if "contracts" in case:
            case["items"] = case.pop("contracts")
        _validate(case, path.name, lang)
        cases.append(case)
    cases.sort(key=lambda c: c.get("order", 99))
    return {c["id"]: c for c in cases}


_texts: dict[tuple[str, str], str] = {}


def text(name: str, lang: str) -> str:
    """Un texto largo (política, guía, manual, contrato) en el idioma pedido o, si no está traducido, en español."""
    key = (name, lang)
    if key not in _texts:
        path = TEXT_DIR / lang / name
        if lang == demo.DEFAULT_LANG or not path.exists():
            path = TEXT_DIR / name
        _texts[key] = path.read_text(encoding="utf-8").strip()
    return _texts[key]


_images: dict[str, str] = {}
_image_names: dict[str, str] = {}


def image(rel: str) -> str:
    """Imagen de src/static/img/dx/ como data URL (en memoria tras el primer uso)."""
    if rel not in _images:
        path = (IMG_DIR / rel).resolve()
        if IMG_DIR.resolve() not in path.parents or path.suffix.lower() not in MIME:
            raise ValueError(f"imagen no válida: {rel}")
        url = f"data:{MIME[path.suffix.lower()]};base64,{base64.b64encode(path.read_bytes()).decode()}"
        _images[rel], _image_names[url] = url, rel
    return _images[rel]


def uploaded(data_url: str | None) -> str:
    """Valida una foto subida (JPEG, PNG o WebP de hasta 3 MB) y la devuelve como data URL normalizada."""
    head, _, payload = (data_url or "").partition(",")
    mime = head.removeprefix("data:").removesuffix(";base64")
    if not head.startswith("data:") or not head.endswith(";base64") or mime not in ("image/jpeg", "image/png", "image/webp"):
        raise DxError(400, "dx_upload_type")
    if len(payload) > MAX_UPLOAD_BYTES * 4 // 3 + 8:
        raise DxError(413, "dx_upload_size", max=MAX_UPLOAD_BYTES // (1024 * 1024))
    try:
        raw = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise DxError(400, "dx_upload_type") from exc
    magic_ok = raw[:3] == b"\xff\xd8\xff" or raw[:8] == b"\x89PNG\r\n\x1a\n" or (raw[:4] == b"RIFF" and raw[8:12] == b"WEBP")
    if not magic_ok:
        raise DxError(400, "dx_upload_type")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise DxError(413, "dx_upload_size", max=MAX_UPLOAD_BYTES // (1024 * 1024))
    return f"{head},{payload}"


def docs(case: dict, lang: str) -> dict[str, str]:
    """Textos largos del caso para que la web pueda enseñarlos."""
    names = [case.get("context_file")]
    names += [p.get("manual") for p in (case.get("products") or {}).values()]
    names += [it.get("file") for it in case.get("items") or []]
    return {n: text(n, lang) for n in names if n}


def public(case: dict, lang: str) -> dict:
    return {**case, "docs": docs(case, lang)}


def _validate(case: dict, source: str, lang: str) -> None:
    def need(cond: bool, msg: str) -> None:
        if not cond:
            raise ValueError(f"dx/{source} ({lang}): {msg}")

    for key in ("id", "kind", "title", "items", "notes"):
        need(key in case, f"falta '{key}'")
    need(case["kind"] in KINDS, f"kind desconocido: {case['kind']}")
    ids = [it["id"] for it in case["items"]]
    need(len(ids) == len(set(ids)) and UPLOAD_ID not in ids, "ids de elementos repetidos o reservados")
    for rel in _image_refs(case):
        need((IMG_DIR / rel).is_file(), f"no existe la imagen {rel}")
    for name in docs_names(case):
        need((TEXT_DIR / name).is_file(), f"no existe el texto {name}")
    if case["kind"] == "cascade":
        steps = {s["id"]: s for s in case["steps"]}
        outcomes = case["outcomes"]
        need("revision" in outcomes, "falta el resultado 'revision'")
        for s in case["steps"]:
            for r in s["route"]:
                need(r.get("next") in steps if "next" in r else r.get("outcome") in outcomes, f"{s['id']}: destino desconocido {r}")
                need("q" not in r or r["q"] in s["questions"], f"{s['id']}: pregunta desconocida {r.get('q')}")
                need(r.get("low_outcome", "revision") in outcomes, f"{s['id']}: low_outcome desconocido")
        for it in case["items"]:
            need(it["product"] in case["products"], f"{it['id']}: producto desconocido")
            need(all(p in steps for p in it["expected"]["path"]), f"{it['id']}: camino esperado con pasos desconocidos")
    elif case["kind"] == "contracts":
        lists = case.get("checklists") or []
        need(bool(lists) and bool(case["items"]), "faltan contratos o listas de comprobación")
        for cl in lists:
            for name, q in cl["questions"].items():
                good = q.get("good", True)
                if q["type"] == "predicate":
                    need(isinstance(good, bool), f"{cl['id']}.{name}: 'good' debe ser true o false")
                else:
                    need(isinstance(good, list) and bool(good) and all(_valid_answer(q, g) for g in good), f"{cl['id']}.{name}: 'good' debe listar respuestas válidas")
        for it in case["items"]:
            need(bool(it.get("file")), f"{it['id']}: falta el texto del contrato")
            exp = it.get("expected") or {}
            for cl in lists:
                given = exp.get(cl["id"]) or {}
                need(set(given) == set(cl["questions"]), f"{it['id']}.{cl['id']}: faltan o sobran respuestas esperadas")
                for name, v in given.items():
                    need(_valid_answer(cl["questions"][name], v), f"{it['id']}.{cl['id']}.{name}: respuesta esperada no válida {v!r}")
    elif case.get("policy"):
        pol, qs = case["policy"], case["questions"]
        sq = qs.get(pol.get("q"))
        need(bool(sq) and sq["type"] == "score", "policy.q debe ser una pregunta de tipo score")
        n = len(sq["levels"])
        for r in pol["rules"]:
            need(r.get("outcome") in case["outcomes"], f"policy: resultado desconocido {r.get('outcome')}")
            need(bool(r["levels"]) and all(0 <= lv < n for lv in r["levels"]), f"policy: niveles fuera de rango {r['levels']}")
            need("if" not in r or qs.get(r["if"], {}).get("type") == "predicate", f"policy: la condición {r.get('if')} debe ser sí/no")
        need({lv for r in pol["rules"] if "if" not in r for lv in r["levels"]} == set(range(n)), "policy: cada nivel necesita una regla sin condición")
        for name, q in qs.items():
            need("floor" not in q or (q["type"] == "predicate" and 0 < q["floor"] < n and "flag" in q and "floor_text" in pol), f"{name}: mínimo no válido")
    else:
        rules, qs = case.get("rules") or [], case["questions"]
        need(bool(rules) and "any" not in rules[-1], "faltan las reglas o la última no es la regla por defecto")
        need(len({r["id"] for r in rules}) == len(rules), "ids de reglas repetidos")
        need(case.get("low_outcome") in case["outcomes"], "low_outcome desconocido")
        for r in rules:
            need(r.get("outcome") in case["outcomes"] and bool(r.get("reason")), f"regla {r['id']}: resultado desconocido o sin motivo")
            need(r is rules[-1] or bool(r.get("any")), f"regla {r['id']}: sin condiciones")
            for name in r.get("any", []):
                q = qs.get(name) or {}
                flaggable = isinstance(q.get("good"), bool) if q.get("type") == "predicate" else bool(q.get("compare") or q.get("good"))
                need(flaggable and "flag" in q, f"regla {r['id']}: {name} no es una comprobación con alerta")


def docs_names(case: dict) -> list[str]:
    names = [case.get("context_file")] + [p.get("manual") for p in (case.get("products") or {}).values()]
    names += [it.get("file") for it in case.get("items") or []]
    return [n for n in names if n]


def _valid_answer(q: dict, v: Any) -> bool:
    if q["type"] == "predicate":
        return isinstance(v, bool)
    if q["type"] == "choice":
        return isinstance(v, str) and v in q["choices"]
    return type(v) is int and 0 <= v < len(q["levels"])


def is_good(q: dict, v: Any) -> bool:
    """¿Es aceptable esta respuesta? `good` es true/false en las preguntas sí/no y una lista de opciones o niveles en las demás."""
    good = q.get("good", True)
    return v is good if q["type"] == "predicate" else v in good


def _image_refs(case: dict) -> list[str]:
    refs = [r["image"] for r in case.get("references") or []]
    refs += [p["image"] for p in (case.get("products") or {}).values()]
    for it in case["items"]:
        refs += [it[k] for k in ("image", "photo", "delivery_photo") if it.get(k)]
    return refs


# ---------- Peticiones ----------


def _txt(value: str) -> dict:
    return {"type": "input_text", "text": value}


def _img(url: str) -> dict:
    return {"type": "input_image", "image_url": url}


def _json(data: Any) -> dict:
    return {"type": "input_json", "data": data}


def _keys(obj: Any, lang: str) -> Any:
    names = JSON_KEYS.get(lang)
    if not names:
        return obj
    if isinstance(obj, dict):
        return {names.get(k, k): _keys(v, lang) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_keys(v, lang) for v in obj]
    return obj


def api_questions(questions: dict[str, dict], refs: dict[str, str] | None = None) -> list[dict]:
    """Preguntas del contenido → lista de la API. `ref_image` añade una imagen de referencia a las instrucciones."""
    out = []
    for name, q in questions.items():
        item: dict[str, Any] = {"type": q["type"], "name": name, "instructions": q["instructions"]}
        ref = q.get("ref_image")
        if ref and refs and ref in refs:
            item["instructions"] = [_txt(q["instructions"]), _img(refs[ref])]
        if q["type"] == "choice":
            item["choices"] = [{"value": k, "description": c.get("description") or c.get("label") or k} for k, c in q["choices"].items()]
        elif q["type"] == "score":
            item["levels"] = [{"label": lv["label"], **({"description": lv["description"]} if lv.get("description") else {})} for lv in q["levels"]]
        out.append(item)
    return out


def find_item(case: dict, item_id: str | None) -> dict:
    if item_id == UPLOAD_ID and case.get("upload"):
        return {"id": UPLOAD_ID}
    item = next((it for it in case["items"] if it["id"] == item_id), None)
    if not item:
        raise DxError(404, "unknown_dx_item", id=item_id)
    return item


def days_since_delivery(item: dict) -> int:
    return (date.fromisoformat(item["claimed"]) - date.fromisoformat(item["delivered"])).days


def prior_answers(case: dict, prior: Any) -> dict:
    """Respuestas de los pasos anteriores que manda la web, validadas contra las preguntas de cada paso."""
    out: dict[str, Any] = {}
    if not isinstance(prior, dict):
        return out
    for step in case["steps"]:
        given = prior.get(step["id"])
        if not isinstance(given, dict):
            continue
        for name, q in step["questions"].items():
            v = given.get(name)
            if q["type"] == "predicate" and isinstance(v, bool):
                out[name] = v
            elif q["type"] == "choice" and isinstance(v, str) and v in q["choices"]:
                out[name] = v
            elif q["type"] == "score" and type(v) is int and 0 <= v < len(q["levels"]):
                out[name] = q["levels"][v]["label"]
    return out


def plan(case: dict, item: dict, lang: str, step: str | None = None, checklist: str | None = None, prior: Any = None, upload: str | None = None) -> dict:
    """Petición para un elemento: {"input", "questions", "defs", "step"?} o {"skip": decisión sin llamar al modelo}."""
    kind = case["kind"]
    if kind == "cascade":
        return _plan_cascade(case, item, step or case["steps"][0]["id"], prior, lang)
    if kind == "contracts":
        return _plan_contract(case, item, checklist, lang)
    developer = case["developer"]
    if case.get("context_file"):
        developer += f"\n\n# {case.get('context_label', '')}\n\n{text(case['context_file'], lang)}"
    messages: list[dict] = [{"role": "developer", "content": developer}]
    if case.get("references"):
        refs = [_txt(case["references_text"])]
        for r in case["references"]:
            refs += [_txt(r["label"] + ":"), _img(image(r["image"]))]
        messages.append({"role": "user", "content": refs})
    T = TEXTS[lang]
    if item["id"] == UPLOAD_ID:
        content = [_txt(T["upload_text"]), _img(uploaded(upload))]
    else:
        caption = case["image_text"].format(**{k: v for k, v in item.items() if isinstance(v, str)})
        content = [_txt(caption), _img(image(item["image"]))]
    if kind == "receipts" and item.get("declared"):
        declared = {**item["declared"], "fecha_envio": case.get("submitted")}
        content += [_txt(case["json_text"]), _json(_keys(declared, lang))]
    messages.append({"role": "user", "content": content})
    return {"input": messages, "questions": api_questions(case["questions"]), "defs": case["questions"]}


def _plan_cascade(case: dict, item: dict, step_id: str, prior: Any, lang: str) -> dict:
    step = next((s for s in case["steps"] if s["id"] == step_id), None)
    if not step:
        raise DxError(404, "unknown_dx_step", id=step_id)
    T, P = TEXTS[lang], case["prompts"]
    product = case["products"][item["product"]]
    developer = case["developer"]
    content: list[dict] = []
    missing = None
    for inp in step["inputs"]:
        if inp == "foto":
            content += [_txt(P["foto"]), _img(image(item["photo"]))]
        elif inp == "texto":
            content.append(_txt(f"{P['texto']}\n«{item['text']}»"))
        elif inp == "entrega":
            if not item.get("delivery_photo"):
                missing = inp
                break
            content += [_txt(P["entrega"]), _img(image(item["delivery_photo"]))]
        elif inp == "manual":
            if not product.get("manual"):
                missing = inp
                break
            developer += f"\n\n# {P['manual']}\n\n{text(product['manual'], lang)}"
        elif inp == "json":
            data = {
                "pedido": {
                    "id": item["order"],
                    "producto": product["name"],
                    "importe_eur": product["price"],
                    "fecha_entrega": item["delivered"],
                    "fecha_reclamacion": item["claimed"],
                    "dias_desde_entrega": days_since_delivery(item),
                },
                "cliente": item["history"],
                "decisiones_previas": prior_answers(case, prior),
            }
            content += [_txt(P["json"]), _json(_keys(data, lang))]
        # «catalogo» va dentro de la pregunta como imagen de referencia y «regla» se evalúa aquí, sin modelo.
    if missing:
        label = case["inputs"][missing]["label"]
        return {"step": step, "skip": {"outcome": "revision", "reason": T["missing_input"].format(label=label), "checks": []}}
    refs = {"catalogo": image(product["image"])}
    messages = [{"role": "developer", "content": developer}, {"role": "user", "content": content}]
    return {"step": step, "input": messages, "questions": api_questions(step["questions"], refs), "defs": step["questions"]}


def _plan_contract(case: dict, item: dict, checklist: str | None, lang: str) -> dict:
    lists = {c["id"]: c for c in case["checklists"]}
    cl = lists.get(checklist or case["checklists"][0]["id"])
    if not cl:
        raise DxError(404, "unknown_dx_checklist", id=checklist)
    developer = case["developer"]
    # El contrato va primero y siempre igual: es el prefijo que la API guarda en caché para las tres listas.
    content = [_txt(f"{TEXTS[lang]['contract_text']}\n\n{text(item['file'], lang)}")]
    messages = [{"role": "developer", "content": developer}, {"role": "user", "content": content}]
    if cl.get("developer"):
        messages.append({"role": "user", "content": [_txt(cl["developer"])]})
    return {"checklist": cl, "input": messages, "questions": api_questions(cl["questions"]), "defs": cl["questions"]}


# ---------- Decisiones ----------


def _p_condition(answer: dict, rule: dict) -> float | None:
    kind = answer.get("type")
    if kind == "predicate":
        return answer["p"] if rule.get("eq", True) else 1 - answer["p"]
    if kind in ("choice", "score"):
        allowed = set(rule["in"]) if "in" in rule else {rule.get("eq")}
        return sum(x["p"] for x in answer.get("probs") or [] if x["key"] in allowed)
    return None


def _target(rule: dict) -> dict:
    return {"next": rule["next"]} if "next" in rule else {"outcome": rule["outcome"]}


def route(case: dict, step: dict, item: dict, answers: dict, lang: str) -> dict:
    """Recorre las reglas del paso en orden: reglas deterministas, condiciones sobre las respuestas y destino por defecto.

    Si la probabilidad de una condición no es concluyente (por debajo del umbral en un sentido o en otro), decide una persona.
    """
    T = TEXTS[lang]
    threshold = case.get("threshold", 0.7)
    checks: list[dict] = []
    for rule in step["route"]:
        if "rule" in rule:
            if rule["rule"] == "plazo":
                days = days_since_delivery(item)
                fired = days > rule["max_days"]
                checks.append({"rule": "plazo", "label": rule["label"], "text": T["days"].format(days=days, limit=rule["max_days"]), "fired": fired})
                if fired:
                    return {**_target(rule), "reason": rule["reason"], "rule": "plazo", "checks": checks}
            continue
        if "q" in rule:
            label = step["questions"][rule["q"]]["label"]
            p = _p_condition(answers.get(rule["q"]) or {}, rule)
            if p is None:
                return {"outcome": "revision", "reason": T["no_answer"].format(label=label), "q": rule["q"], "checks": checks}
            if max(p, 1 - p) < threshold:
                low = rule.get("low_outcome", "revision")
                return {"outcome": low, "reason": T["low_confidence"].format(label=label, p=max(p, 1 - p)), "q": rule["q"], "p": p, "low_confidence": True, "checks": checks}
            if p >= 0.5:
                return {**_target(rule), "reason": rule["reason"], "q": rule["q"], "p": p, "checks": checks}
            continue
        return {**_target(rule), "reason": rule["reason"], "checks": checks}
    return {"outcome": "revision", "reason": T["no_route"], "checks": checks}


def assess(case: dict, item: dict, answers: dict, lang: str) -> dict:
    """Alertas de cada respuesta, reglas deterministas y resultado final de los casos de una sola llamada."""
    flags, infos, checks = [], [], []
    for name, q in case["questions"].items():
        a = answers.get(name) or {}
        kind = a.get("type")
        if kind == "predicate":
            if "good" in q and a["value"] != q["good"]:
                flags.append({"q": name, "text": q["flag"], "p": a["confidence"]})
            elif q.get("info") and a["value"]:
                infos.append({"q": name, "text": q["info"], "p": a["confidence"]})
        elif kind == "choice" and q.get("compare"):
            declared = (item.get("declared") or {}).get(q["compare"])
            if declared is not None:
                ok = a["value"] == declared
                checks.append({"rule": "compare", "q": name, "label": q["label"], "declared": declared, "found": a["value"], "fired": not ok})
                if not ok:
                    flags.append({"q": name, "text": q["flag"], "p": a["confidence"], "rule": True})
        elif kind in ("score", "choice") and "good" in q and a["value"] not in q["good"]:
            flags.append({"q": name, "text": q["flag"], "p": a["confidence"]})
    if case.get("policy"):
        res = _policy(case, answers, lang)
        return {**res, "flags": flags, "infos": infos, "checks": checks + res["checks"]}
    res = _rules(case, item, answers, {f["q"] for f in flags}, lang)
    return {**res, "flags": flags, "infos": infos, "checks": checks}


def _p_bad(q: dict, a: dict, item: dict | None = None) -> float | None:
    """Probabilidad de que la respuesta sea mala: fuera de `good` o distinta de lo declarado (`compare`)."""
    if a.get("type") != q["type"]:
        return None
    if q["type"] == "predicate":
        return a["p"] if q.get("good", True) is False else 1 - a["p"]
    if q.get("compare"):
        declared = ((item or {}).get("declared") or {}).get(q["compare"])
        if declared is None:
            return 0.0
        ok = {declared}
    else:
        ok = set(q.get("good") or [])
    if a.get("probs"):
        return sum(x["p"] for x in a["probs"] if x["key"] not in ok)
    return 0.0 if a["value"] in ok else 1.0


def _rules(case: dict, item: dict, answers: dict, flagged: set[str], lang: str) -> dict:
    """Las reglas de la política, en orden: gana la primera con alguna alerta y la última es el resultado por defecto.

    El modelo no elige la acción: solo responde las comprobaciones. La confianza es la probabilidad de que gane esa
    misma regla según las probabilidades de cada comprobación (tratadas como independientes).
    """
    T, qs = TEXTS[lang], case["questions"]
    p_bad = {n: _p_bad(qs[n], answers.get(n) or {}, item) for r in case["rules"] for n in r.get("any", [])}
    missing = next((n for n, p in p_bad.items() if p is None), None)
    if missing:
        reason = T["no_answer"].format(label=qs[missing]["label"])
        return {"outcome": case["low_outcome"], "confidence": 0.0, "low_confidence": True, "reason": reason, "rule": None, "chain": []}
    chain, seen, clear, chosen = [], set(), 1.0, None
    for i, r in enumerate(case["rules"]):
        new = [n for n in r.get("any", []) if n not in seen]
        none_new = 1.0
        for n in new:
            none_new *= 1 - p_bad[n]
        fired = [n for n in r.get("any", []) if n in flagged]
        p = clear * (1 - none_new) if r.get("any") else clear
        if chosen is None and (fired or not r.get("any")):
            chosen = i
        checks = [{"q": n, "label": qs[n]["label"], "p_bad": p_bad[n], "fired": n in flagged} for n in r.get("any", [])]
        chain.append({"id": r["id"], "outcome": r["outcome"], "p": p, "fired": i == chosen, "checks": checks})
        clear *= none_new
        seen.update(new)
    rule = case["rules"][chosen]
    confidence = chain[chosen]["p"]
    low = confidence < case.get("threshold", 0.7)
    outcome, reason = rule["outcome"], rule["reason"]
    if low:
        relevant = [n for r in case["rules"][: chosen + 1] for n in r.get("any", [])]
        doubt = min(relevant, key=lambda n: max(p_bad[n], 1 - p_bad[n]))
        outcome, reason = case["low_outcome"], T["low_rules"].format(p=confidence, label=qs[doubt]["label"])
    return {"outcome": outcome, "confidence": confidence, "low_confidence": low, "reason": reason, "rule": rule["id"], "chain": chain}


def _policy(case: dict, answers: dict, lang: str) -> dict:
    """Matriz de riesgos: el modelo puntúa la gravedad, cada riesgo detectado fija un mínimo y la acción sale de las reglas.

    La confianza es la probabilidad de la acción elegida, sumando sobre la gravedad que da el modelo, los riesgos sí/no
    que fijan mínimos y las preguntas sí/no que condicionan las reglas (tratadas como independientes).
    """
    pol, qs = case["policy"], case["questions"]
    sq = qs[pol["q"]]
    labels = [lv["label"] for lv in sq["levels"]]
    sev = answers.get(pol["q"]) or {}
    model = sev.get("value") if sev.get("type") == "score" else None
    fired = [(n, q, answers[n]) for n, q in qs.items() if "floor" in q and (answers.get(n) or {}).get("type") == "predicate" and answers[n]["value"] != q.get("good", False)]
    floor = max((q["floor"] for _, q, _ in fired), default=0)
    checks = [
        {
            "rule": "floor",
            "q": n,
            "label": q["label"],
            "level": q["floor"],
            "level_label": labels[q["floor"]],
            "text": pol["floor_text"].format(flag=q["flag"], level=labels[q["floor"]]),
            "p": a["confidence"],
            "fired": q["floor"] == floor and (model is None or floor > model),
        }
        for n, q, a in fired
    ]
    severity = {"q": pol["q"], "model": model, "model_label": None if model is None else labels[model], "floor": floor, "raised_by": [c["q"] for c in checks if c["fired"]], "probs": sev.get("probs") or []}
    if model is None and not fired:
        reason = TEXTS[lang]["no_answer"].format(label=sq["label"])
        return {"outcome": None, "confidence": 0.0, "low_confidence": True, "reason": reason, "severity": {**severity, "level": None, "label": None}, "checks": checks}
    level = max(floor, 0 if model is None else model)

    def holds(name: str) -> float:
        a = answers.get(name) or {}
        return a["p"] if a.get("type") == "predicate" else 0.0

    def floor_le(f: int) -> float:
        out = 1.0
        for name, q in qs.items():
            if q.get("floor", 0) > f:
                out *= holds(name) if q.get("good", False) else 1 - holds(name)
        return out

    def dist(lv: int) -> list[float]:
        out, rest = [0.0] * len(pol["rules"]), 1.0
        for i, r in enumerate(pol["rules"]):
            if lv in r["levels"]:
                p = holds(r["if"]) if r.get("if") else 1.0
                out[i], rest = rest * p, rest * (1 - p)
        return out

    idx = next(i for i, r in enumerate(pol["rules"]) if level in r["levels"] and (not r.get("if") or holds(r["if"]) >= 0.5))
    p_floor = {f: floor_le(f) - (floor_le(f - 1) if f else 0.0) for f in range(len(labels))}
    probs = {x["key"]: x["p"] for x in severity["probs"]} if model is not None else {0: 1.0}
    confidence = sum(pm * pf * dist(max(lv, f))[idx] for lv, pm in probs.items() for f, pf in p_floor.items())
    rule = pol["rules"][idx]
    return {
        "outcome": rule["outcome"],
        "confidence": confidence,
        "low_confidence": confidence < case.get("threshold", 0.7),
        "reason": rule["reason"],
        "rule": idx,
        "severity": {**severity, "level": level, "label": labels[level]},
        "checks": checks,
    }


def review(case: dict, plan_: dict, answers: dict) -> dict:
    """Contratos: qué comprobaciones salen en rojo (una respuesta fuera de las aceptables) y con qué probabilidad."""
    cl = plan_["checklist"]
    threshold = case.get("threshold", 0.7)
    cells = []
    for name, q in cl["questions"].items():
        p_bad = _p_bad(q, answers.get(name) or {})
        if p_bad is None:
            cells.append({"q": name, "status": "unknown", "p": None, "value": None})
            continue
        status = "bad" if p_bad >= threshold else "ok" if p_bad <= 1 - threshold else "doubt"
        cells.append({"q": name, "status": status, "p": p_bad, "value": answers[name]["value"]})
    return {"checklist": cl["id"], "cells": cells, "red": sum(c["status"] == "bad" for c in cells), "doubt": sum(c["status"] == "doubt" for c in cells)}


# ---------- Costes y vista de la petición ----------


def cost(usage: dict, price: dict, usd_to_eur: float) -> dict:
    total = usage.get("input_tokens", 0) or 0
    cached = usage.get("cached_input_tokens", 0) or 0
    written = usage.get("cache_write_tokens", 0) or 0
    fresh = max(0, total - cached - written)
    usd = (fresh * price["input"] + cached * price["cached_input"] + written * price["cache_write"]) / 1_000_000
    usd_nocache = total * price["input"] / 1_000_000
    return {"usd": usd, "eur": usd * usd_to_eur, "usd_nocache": usd_nocache, "eur_nocache": usd_nocache * usd_to_eur}


def view(obj: Any, lang: str) -> Any:
    """La petición tal cual, pero con las imágenes y los textos largos abreviados para poder leerla en pantalla."""
    T = TEXTS[lang]
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if k == "image_url" and isinstance(v, str) and v.startswith("data:"):
                kb = round(len(v) * 3 / 4 / 1024)
                name = _image_names.get(v, T["upload_name"])
                out[k] = f"data:…;base64 ‹{T['image']} {name} · {kb} KB›"
            else:
                out[k] = view(v, lang)
        return out
    if isinstance(obj, list):
        return [view(v, lang) for v in obj]
    if isinstance(obj, str) and len(obj) > MAX_VIEW_CHARS:
        keep = MAX_VIEW_CHARS // 2
        return f"{obj[:keep]} … ‹+{len(obj) - keep} {T['chars']}›"
    return obj
