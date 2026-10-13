#!/usr/bin/env python3
"""Valida las traducciones de la demo (escenarios y laboratorio) frente al original en español.

    .venv/bin/python scripts/probar-idiomas.py                    # todas las traducciones al inglés
    .venv/bin/python scripts/probar-idiomas.py --only 03 04 lab   # solo algunas (prefijo del fichero) y/o el laboratorio
    .venv/bin/python scripts/probar-idiomas.py --allow-missing    # no exige que existan todas

Una traducción es un fichero parcial que se superpone al original (src/scenarios/<idioma>/<mismo nombre>.json y
src/lab.<idioma>.json). El script comprueba que:
  - la estructura es la del original (mismas claves, listas del mismo tamaño, elementos identificados por `id`);
  - los identificadores (ids, tipos, colores, iconos, `expected`, claves de las preguntas…) y los números no cambian;
  - todos los elementos en español están traducidos y los que ya están en otro idioma quedan intactos;
  - los campos del elemento de `state_fields` son los mismos (solo cambian los nombres con los que los ve el modelo);
  - no quedan frases en español sin traducir (o a medias) ni se pierde la numeración de la política.
Sale con código 1 si hay errores; los avisos piden una revisión humana.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

import demo  # noqa: E402

# Claves cuyo valor es un identificador o un dato de presentación que la traducción no puede tocar.
IDENT_KEYS = frozenset({"id", "type", "kind", "primary", "severity", "color", "icon", "order", "group", "view", "bad_when"})
# En el caso de juego solo se traduce lo que ve el público; el resto lo lee el motor o el modelo.
GAME_FROZEN = ("context", "questions", "game")
# Textos que cambian siempre al traducir.
MUST_CHANGE = ("title", "headline", "sector", "item_ref", "item_text_label")
MUST_CHANGE_NOTES = ("reto", "solucion", "paradigma")
# Marca que busca la vista de guardarraíles para separar la política del resto del contexto.
POLICY_MARKER = {"en": "Policy:"}
KNOWN_CHANNELS = frozenset(
    {"email", "whatsapp", "web", "x / twitter", "chat", "call", "phone", "app", "employee", "booking", "google", "tripadvisor", "survey"}
)

# Palabras que solo existen en español: dos o más en un texto lo delatan.
ES_WORDS = frozenset(
    "el la los las del una unos unas para por que qué más pero sus como cuando porque también sobre entre hasta desde muy "
    "está están nos les esto este esta ese esa eso todo toda todos todas nada algo usted ustedes gracias hola buenas buenos "
    "quiero tengo necesito puedo cuál dónde cómo tiene tienen puede pueden hacer mi mis nuestro nuestra vuestro vuestra".split()
)
WORD = re.compile(r"[a-záéíóúüñ]+", re.I)
SPANISH_MARKS = re.compile(r"[¿¡ñÑ]")
NUMBERING = re.compile(r"\((\d+)\)")
# Datos que no pueden cambiar al traducir un argumento de una herramienta: correos, fechas y referencias.
PROTECTED = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\d{4}-\d{2}-\d{2}|[A-Z]{2,}-\d+")
IDENTIFIER = re.compile(r"^[a-z][a-z0-9_]*$")
QUESTION_NAME = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")


def spanish_hits(text: str) -> int:
    return sum(1 for w in WORD.findall(text.lower()) if w in ES_WORDS)


class Report:
    def __init__(self, name: str):
        self.name = name
        self.errors: list[tuple[str, str]] = []
        self.warnings: list[tuple[str, str]] = []
        self.total = 0
        self.changed = 0
        self.summary = ""

    def err(self, path: str, msg: str) -> None:
        self.errors.append((path.removeprefix("$."), msg))

    def warn(self, path: str, msg: str) -> None:
        self.warnings.append((path.removeprefix("$."), msg))


def text_check(rep: Report, path: str, base: str, new: str) -> None:
    """Un texto sin traducir (igual al original y con español) es un error; uno a medias, un aviso."""
    rep.total += 1
    rep.changed += new != base
    hits = spanish_hits(new)
    if hits >= 2:
        if new == base:
            rep.err(path, f"sin traducir ({hits} palabras en español): {new[:70]!r}")
        else:
            rep.warn(path, f"traducción a medias ({hits} palabras en español): {new[:70]!r}")
    elif new != base and SPANISH_MARKS.search(new):
        rep.warn(path, f"contiene signos del español (¿ ¡ ñ): {new[:70]!r}")
    if new != base:
        if base.count("**") != new.count("**"):
            rep.err(path, f"los ** (negrita) no coinciden con el original: {new[:70]!r}")
        if sorted(re.findall(r"\d+", base)) != sorted(re.findall(r"\d+", new)):
            rep.warn(path, f"cambian las cifras: {base[:60]!r} → {new[:60]!r}")


def compare(b, m, path: str, key, rep: Report, skip: frozenset, lang: str, foreign=None, expected=False) -> None:
    """Recorre el original y la traducción ya fusionada a la vez y comprueba lo que no puede cambiar."""
    if isinstance(b, dict) and isinstance(m, dict):
        for k, bv in b.items():
            if k in skip:
                continue
            if k not in m:
                rep.err(f"{path}.{k}", "falta en la traducción")
                continue
            compare(bv, m[k], f"{path}.{k}", k, rep, skip, lang, foreign, expected or k == "expected")
    elif isinstance(b, list) and isinstance(m, list):
        by_id = bool(b) and all(isinstance(x, dict) and "id" in x for x in b)
        for i, (bv, mv) in enumerate(zip(b, m)):
            child_foreign = foreign
            if key == "items" and isinstance(bv, dict):
                child_foreign = bv.get("lang") not in (None, "es")
            compare(bv, mv, f"{path}[{bv['id'] if by_id else i}]", key, rep, skip, lang, child_foreign, expected)
    elif isinstance(b, str) and isinstance(m, str):
        if expected or key in IDENT_KEYS:
            if m != b:
                rep.err(path, f"es un identificador y no se traduce: {b!r} → {m!r}")
        elif key == "lang":
            want = lang if b == "es" else b
            if m != want:
                rep.err(path, f"debe ser {want!r}, no {m!r}")
        elif foreign and key == "text":
            if m != b:
                rep.err(path, "este texto ya está en otro idioma y debe quedar intacto")
        elif foreign is False and key == "text" and m == b:
            rep.err(path, f"sin traducir: {m[:70]!r}")
        else:
            text_check(rep, path, b, m)
    elif m != b:
        rep.err(path, f"no es texto y no puede cambiar: {b!r} → {m!r}")


def check_state_fields(base: dict, merged: dict, lang: str, rep: Report) -> None:
    bs, ms = base.get("state_fields"), merged.get("state_fields")
    if not bs:
        return
    if sorted(bs.values()) != sorted(ms.values()):
        rep.err("state_fields", f"los campos del elemento deben ser los mismos: {sorted(bs.values())} ≠ {sorted(ms.values())}")
    texts = demo.REQUEST_TEXTS.get(lang, demo.REQUEST_TEXTS[demo.DEFAULT_LANG])
    for name in ms:
        if not isinstance(name, str) or not name.strip():
            rep.err("state_fields", f"nombre de campo vacío: {name!r}")
        elif re.search(r"[^\x00-\x7f]", name):
            rep.warn("state_fields", f"nombre de campo con caracteres no ASCII: {name!r}")
    if texts["context"] in ms:
        rep.err("state_fields", f"el nombre {texts['context']!r} está reservado para el contexto del negocio")
    if merged.get("batch_key") == texts["context"]:
        rep.err("batch_key", f"no puede ser {texts['context']!r}, que está reservado para el contexto")
    if list(ms) == list(bs):
        rep.warn("state_fields", "los nombres de los campos son los del original: el modelo los verá en español")


def check_actions(base: dict, merged: dict, rep: Report) -> None:
    """Acción que propone el agente (guardarraíles): herramienta y argumentos coherentes con la política traducida."""
    tools: dict[str, str] = {}
    for b, m in zip(base["items"], merged["items"]):
        ba, ma = b.get("action"), m.get("action")
        if ba is None:
            continue
        path = f"items[{b['id']}].action"
        if set(ba) != set(ma):
            rep.err(path, f"las claves son {sorted(ba)} y no se traducen (las lee la interfaz); hay {sorted(ma)}")
            continue
        tool, new_tool = ba["herramienta"], ma["herramienta"]
        if tools.setdefault(tool, new_tool) != new_tool:
            rep.err(path, f"la herramienta {tool!r} se traduce de dos formas: {tools[tool]!r} y {new_tool!r}")
        if new_tool not in merged["context"]:
            rep.err(path, f"la herramienta {new_tool!r} no aparece en la política (context)")
        bargs, margs = ba["argumentos"], ma["argumentos"]
        if len(bargs) != len(margs):
            rep.err(path, f"argumentos: {len(margs)} y el original tiene {len(bargs)} (mismo orden)")
            continue
        for (bk, bv), (mk, mv) in zip(bargs.items(), margs.items()):
            if not IDENTIFIER.match(mk):
                rep.warn(f"{path}.argumentos.{mk}", "el nombre del argumento debería ser snake_case en minúsculas")
            if isinstance(bv, str) and isinstance(mv, str):
                if sorted(PROTECTED.findall(bv)) != sorted(PROTECTED.findall(mv)):
                    rep.err(f"{path}.argumentos.{mk}", f"cambian datos protegidos (correo, fecha o referencia): {bv!r} → {mv!r}")
                text_check(rep, f"{path}.argumentos.{mk}", bv, mv)
            elif bv != mv:
                rep.err(f"{path}.argumentos.{mk}", f"valor no textual distinto: {bv!r} → {mv!r}")
    if len(set(tools.values())) != len(tools):
        rep.err("items.action", "dos herramientas distintas se traducen igual")


def check_scenario(base: dict, over: dict, lang: str, rep: Report) -> None:
    try:
        merged = demo.merge_overlay(base, over, demo.SCENARIO_REPLACE)
    except ValueError as exc:
        rep.err("estructura", str(exc))
        return
    skip = set(demo.SCENARIO_REPLACE)
    if base.get("kind") == "game":
        for key in GAME_FROZEN:
            if merged.get(key) != base.get(key):
                rep.err(key, "en el caso de juego no se traduce: lo leen el motor y el modelo")
        skip |= set(GAME_FROZEN)
    compare(base, merged, "$", None, rep, frozenset(skip), lang)

    for key in MUST_CHANGE:
        if key in base and merged[key] == base[key]:
            rep.err(key, f"debe traducirse: {base[key]!r}")
    for key in MUST_CHANGE_NOTES:
        if key in base.get("notes", {}) and merged["notes"][key] == base["notes"][key]:
            rep.err(f"notes.{key}", "debe traducirse")
    check_state_fields(base, merged, lang, rep)

    if NUMBERING.findall(base["context"]) != NUMBERING.findall(merged["context"]):
        rep.err("context", f"la numeración de la política cambia: {NUMBERING.findall(base['context'])} → {NUMBERING.findall(merged['context'])}")
    marker = POLICY_MARKER.get(lang)
    if base.get("view") == "guardrails" and marker and marker not in merged["context"]:
        rep.err("context", f"debe contener {marker!r}, con lo que la vista separa la política")

    for name, q in base.get("questions", {}).items():
        crit, new = q.get("criteria"), merged["questions"][name].get("criteria")
        if isinstance(crit, list):
            for i, (bc, mc) in enumerate(zip(crit, new)):
                if ":" in bc and ":" not in mc:
                    rep.err(f"questions.{name}.criteria[{i}]", f"debe mantener 'Etiqueta: descripción': {mc!r}")

    for it in merged.get("items", []):
        if "hotel" in it and "hotels" in merged and it["hotel"] not in merged["hotels"]:
            rep.err(f"items[{it['id']}].hotel", f"{it['hotel']!r} no está en `hotels`")
        for field in ("channel", "source"):
            if field in it and str(it[field]).lower() not in KNOWN_CHANNELS:
                rep.warn(f"items[{it['id']}].{field}", f"canal desconocido {it[field]!r}: sin icono en la interfaz")
    if "items" in base:
        check_items(base, merged, over, lang, rep)
    if any("action" in it for it in base.get("items", [])):
        check_actions(base, merged, rep)


def check_items(base: dict, merged: dict, over: dict, lang: str, rep: Report) -> None:
    present = {o.get("id") for o in over.get("items", [])}
    mine = [it for it in base["items"] if it.get("lang") in (None, "es")]
    for it in mine:
        if it["id"] not in present:
            rep.err(f"items[{it['id']}]", "falta la traducción del elemento")
    kept = len(base["items"]) - len(mine)
    rep.summary = f"{len(mine) - sum(it['id'] not in present for it in mine)}/{len(mine)} elementos traducidos, {kept} en otros idiomas intactos"


def check_lab(base: dict, over: dict, lang: str, rep: Report) -> None:
    try:
        merged = demo.merge_overlay(base, over, demo.LAB_REPLACE)
    except ValueError as exc:
        rep.err("estructura", str(exc))
        return
    compare(base, merged, "$", None, rep, frozenset(demo.LAB_REPLACE), lang)
    present = {t.get("id") for t in over.get("templates", [])}
    done = 0
    for b, m in zip(base["templates"], merged["templates"]):
        path = f"templates[{b['id']}]"
        if b["id"] not in present:
            rep.err(path, "falta la traducción de la plantilla")
            continue
        done += 1
        check_template(b, m, path, rep)
    rep.summary = f"{done}/{len(base['templates'])} plantillas traducidas"


def check_state_value(rep: Report, path: str, b, m) -> None:
    """El `state` de una plantilla se traduce entero: mismas formas y tamaños, textos traducidos, el resto idéntico."""
    if isinstance(b, str) and isinstance(m, str):
        text_check(rep, path, b, m)
    elif isinstance(b, dict) and isinstance(m, dict):
        if len(b) != len(m):
            rep.err(path, f"{len(m)} campos y el original tiene {len(b)}")
            return
        for (bk, bv), (mk, mv) in zip(b.items(), m.items()):
            check_state_value(rep, f"{path}.{mk}", bv, mv)
    elif isinstance(b, list) and isinstance(m, list):
        if len(b) != len(m):
            rep.err(path, f"{len(m)} elementos y el original tiene {len(b)}")
            return
        for i, (bv, mv) in enumerate(zip(b, m)):
            check_state_value(rep, f"{path}[{i}]", bv, mv)
    elif b != m:
        rep.err(path, f"no es texto y no puede cambiar: {b!r} → {m!r}")


def check_template(b: dict, m: dict, path: str, rep: Report) -> None:
    bs, ms = b["state"], m["state"]
    if type(bs) is not type(ms):
        rep.err(f"{path}.state", f"es {type(ms).__name__} y el original {type(bs).__name__}")
    elif isinstance(bs, dict):
        if len(bs) != len(ms):
            rep.err(f"{path}.state", f"{len(ms)} campos y el original tiene {len(bs)}")
        else:
            for (bk, bv), (mk, mv) in zip(bs.items(), ms.items()):
                check_state_value(rep, f"{path}.state.{mk}", bv, mv)
    else:
        text_check(rep, f"{path}.state", bs, ms)

    bq, mq = b["questions"], m["questions"]
    if len(bq) != len(mq):
        rep.err(f"{path}.questions", f"{len(mq)} preguntas y el original tiene {len(bq)}")
        return
    for (bn, bd), (mn, md) in zip(bq.items(), mq.items()):
        qpath = f"{path}.questions.{mn}"
        if not QUESTION_NAME.match(mn):
            rep.warn(qpath, "el nombre de la pregunta debería ser un identificador (letras, cifras y _)")
        if bd["type"] != md.get("type"):
            rep.err(qpath, f"tipo {md.get('type')!r} y el original {bd['type']!r}")
            continue
        text_check(rep, f"{qpath}.instructions", bd["instructions"], md.get("instructions", ""))
        bc, mc = bd.get("criteria"), md.get("criteria")
        if type(bc) is not type(mc):
            rep.err(f"{qpath}.criteria", "debe tener la misma forma que el original")
        elif isinstance(bc, dict):
            if len(bc) != len(mc):
                rep.err(f"{qpath}.criteria", f"{len(mc)} opciones y el original tiene {len(bc)}")
            else:
                for (bk, bv), (mk, mv) in zip(bc.items(), mc.items()):
                    text_check(rep, f"{qpath}.criteria.{mk}", bv, mv)
        elif isinstance(bc, list):
            if len(bc) != len(mc):
                rep.err(f"{qpath}.criteria", f"{len(mc)} niveles y el original tiene {len(bc)}")
            else:
                for i, (bv, mv) in enumerate(zip(bc, mc)):
                    if ":" in bv and ":" not in mv:
                        rep.err(f"{qpath}.criteria[{i}]", f"debe mantener 'Etiqueta: descripción': {mv!r}")
                    text_check(rep, f"{qpath}.criteria[{i}]", bv, mv)
    check_labels(m, path, rep)


def check_labels(m: dict, path: str, rep: Report) -> None:
    """Las etiquetas de la interfaz (`labels`) apuntan a preguntas y opciones que existen y no llevan español."""
    labels = m.get("labels") or {}
    questions = m["questions"]
    for name, text in labels.get("questions", {}).items():
        where = f"{path}.labels.questions.{name}"
        if name not in questions:
            rep.err(where, "no es ninguna pregunta de la plantilla")
        elif spanish_hits(text) >= 2:
            rep.err(where, f"sin traducir: {text[:70]!r}")
    for name, values in labels.get("values", {}).items():
        choices = (questions.get(name) or {}).get("criteria")
        if not isinstance(choices, dict):
            rep.err(f"{path}.labels.values.{name}", "no es una pregunta de tipo choice de la plantilla")
            continue
        for key, text in values.items():
            where = f"{path}.labels.values.{name}.{key}"
            if key not in choices:
                rep.err(where, "no es ninguna opción de la pregunta")
            elif spanish_hits(text) >= 2:
                rep.err(where, f"sin traducir: {text[:70]!r}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lang", default="en", choices=[code for code in demo.LANGS if code != demo.DEFAULT_LANG])
    ap.add_argument("--only", nargs="+", metavar="ID", help="prefijos de fichero (01, 03-viajes…) y/o 'lab'")
    ap.add_argument("--allow-missing", action="store_true", help="no es un error que falte la traducción de algún fichero")
    ap.add_argument("--dir", type=Path, help="carpeta con las traducciones de los escenarios (por defecto src/scenarios/<idioma>)")
    ap.add_argument("--lab", type=Path, help="traducción del laboratorio (por defecto src/lab.<idioma>.json)")
    ap.add_argument("--quiet", action="store_true", help="no muestra los avisos")
    args = ap.parse_args()

    folder = args.dir or demo.BASE / "scenarios" / args.lang
    lab_file = args.lab or demo.BASE / f"lab.{args.lang}.json"
    wanted = lambda name: args.only is None or any(name.startswith(o) for o in args.only)  # noqa: E731

    jobs: list[tuple[str, Path, Path, object]] = []
    for path in sorted((demo.BASE / "scenarios").glob("*.json")):
        if wanted(path.name):
            jobs.append((path.name, path, folder / path.name, check_scenario))
    if args.only is None or "lab" in args.only:
        jobs.append(("lab.json", demo.BASE / "lab.json", lab_file, check_lab))
    if not jobs:
        print("Nada que validar: revisa --only", file=sys.stderr)
        return 2

    reports: list[Report] = []
    for name, base_path, over_path, check in jobs:
        rep = Report(name)
        reports.append(rep)
        if not over_path.exists():
            if args.only is not None or not args.allow_missing:
                rep.err(str(over_path.relative_to(ROOT)) if over_path.is_relative_to(ROOT) else str(over_path), "no existe la traducción")
            else:
                rep.summary = "sin traducción (permitido)"
        else:
            try:
                over = json.loads(over_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError as exc:
                rep.err("json", f"no es JSON válido: {exc}")
            else:
                base = json.loads(base_path.read_text(encoding="utf-8"))
                check(base, over, args.lang, rep)

        mark = "✗" if rep.errors else ("⚠" if rep.warnings else "✓")
        stats = f" · {rep.changed}/{rep.total} textos distintos del original" if rep.total else ""
        print(f"{mark} {name}: {rep.summary or 'revisado'}{stats} · {len(rep.errors)} errores · {len(rep.warnings)} avisos")
        for path, msg in rep.errors:
            print(f"    ✗ {path}: {msg}")
        if not args.quiet:
            for path, msg in rep.warnings:
                print(f"    ⚠ {path}: {msg}")

    errors = sum(len(r.errors) for r in reports)
    warnings = sum(len(r.warnings) for r in reports)
    print(f"\n{'FALLO' if errors else 'OK'}: {errors} errores, {warnings} avisos en {len(reports)} ficheros")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
