#!/usr/bin/env python3
"""Validates the demo translations (scenarios and Lab) against the Spanish original.

    .venv/bin/python scripts/check-translations.py                    # all English translations
    .venv/bin/python scripts/check-translations.py --only 03 04 lab   # only some (file prefix) and/or the Lab
    .venv/bin/python scripts/check-translations.py --allow-missing    # doesn't require all of them to exist

A translation is a partial file overlaid on the original (src/scenarios/<lang>/<same name>.json and
src/lab.<lang>.json). The script checks that:
  - the structure is the original's (same keys, lists of the same size, elements identified by `id`);
  - identifiers (ids, types, colors, icons, `expected`, question keys…) and numbers don't change;
  - all Spanish items are translated and those already in another language stay intact;
  - the item fields in `state_fields` are the same (only the names shown to the model change);
  - no Spanish sentences are left untranslated (or half-translated) and the policy numbering is kept.
Exits with code 1 if there are errors; warnings call for human review.
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

# Keys whose value is an identifier or presentation data that the translation can't touch.
IDENT_KEYS = frozenset({"id", "type", "kind", "primary", "severity", "color", "icon", "order", "group", "view", "bad_when"})
# In the game case only what the audience sees is translated; the rest is read by the engine or the model.
GAME_FROZEN = ("context", "questions", "game")
# Texts that always change when translated.
MUST_CHANGE = ("title", "headline", "sector", "item_ref", "item_text_label")
MUST_CHANGE_NOTES = ("reto", "solucion", "paradigma")
# Marker the guardrails view looks for to separate the policy from the rest of the context.
POLICY_MARKER = {"en": "Policy:"}
KNOWN_CHANNELS = frozenset(
    {"email", "whatsapp", "web", "x / twitter", "chat", "call", "phone", "app", "employee", "booking", "google", "tripadvisor", "survey"}
)

# Words that only exist in Spanish: two or more in a text give it away.
ES_WORDS = frozenset(
    "el la los las del una unos unas para por que qué más pero sus como cuando porque también sobre entre hasta desde muy "
    "está están nos les esto este esta ese esa eso todo toda todos todas nada algo usted ustedes gracias hola buenas buenos "
    "quiero tengo necesito puedo cuál dónde cómo tiene tienen puede pueden hacer mi mis nuestro nuestra vuestro vuestra".split()
)
WORD = re.compile(r"[a-záéíóúüñ]+", re.I)
SPANISH_MARKS = re.compile(r"[¿¡ñÑ]")
NUMBERING = re.compile(r"\((\d+)\)")
# Data that can't change when a tool argument is translated: emails, dates and references.
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
    """An untranslated text (same as the original and in Spanish) is an error; a half-translated one, a warning."""
    rep.total += 1
    rep.changed += new != base
    hits = spanish_hits(new)
    if hits >= 2:
        if new == base:
            rep.err(path, f"untranslated ({hits} Spanish words): {new[:70]!r}")
        else:
            rep.warn(path, f"half-translated ({hits} Spanish words): {new[:70]!r}")
    elif new != base and SPANISH_MARKS.search(new):
        rep.warn(path, f"contains Spanish characters (¿ ¡ ñ): {new[:70]!r}")
    if new != base:
        if base.count("**") != new.count("**"):
            rep.err(path, f"the ** (bold) markers don't match the original: {new[:70]!r}")
        if sorted(re.findall(r"\d+", base)) != sorted(re.findall(r"\d+", new)):
            rep.warn(path, f"the numbers change: {base[:60]!r} → {new[:60]!r}")


def compare(b, m, path: str, key, rep: Report, skip: frozenset, lang: str, foreign=None, expected=False) -> None:
    """Walks the original and the merged translation together and checks what can't change."""
    if isinstance(b, dict) and isinstance(m, dict):
        for k, bv in b.items():
            if k in skip:
                continue
            if k not in m:
                rep.err(f"{path}.{k}", "missing from the translation")
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
                rep.err(path, f"is an identifier and isn't translated: {b!r} → {m!r}")
        elif key == "lang":
            want = lang if b == "es" else b
            if m != want:
                rep.err(path, f"must be {want!r}, not {m!r}")
        elif foreign and key == "text":
            if m != b:
                rep.err(path, "this text is already in another language and must stay intact")
        elif foreign is False and key == "text" and m == b:
            rep.err(path, f"untranslated: {m[:70]!r}")
        else:
            text_check(rep, path, b, m)
    elif m != b:
        rep.err(path, f"isn't text and can't change: {b!r} → {m!r}")


def check_state_fields(base: dict, merged: dict, lang: str, rep: Report) -> None:
    bs, ms = base.get("state_fields"), merged.get("state_fields")
    if not bs:
        return
    if sorted(bs.values()) != sorted(ms.values()):
        rep.err("state_fields", f"the item fields must be the same: {sorted(bs.values())} ≠ {sorted(ms.values())}")
    texts = demo.REQUEST_TEXTS.get(lang, demo.REQUEST_TEXTS[demo.DEFAULT_LANG])
    for name in ms:
        if not isinstance(name, str) or not name.strip():
            rep.err("state_fields", f"empty field name: {name!r}")
        elif re.search(r"[^\x00-\x7f]", name):
            rep.warn("state_fields", f"field name with non-ASCII characters: {name!r}")
    if texts["context"] in ms:
        rep.err("state_fields", f"the name {texts['context']!r} is reserved for the business context")
    if merged.get("batch_key") == texts["context"]:
        rep.err("batch_key", f"can't be {texts['context']!r}, which is reserved for the context")
    if list(ms) == list(bs):
        rep.warn("state_fields", "the field names are the original ones: the model will see them in Spanish")


def check_actions(base: dict, merged: dict, rep: Report) -> None:
    """Action proposed by the agent (guardrails): tool and arguments consistent with the translated policy."""
    tools: dict[str, str] = {}
    for b, m in zip(base["items"], merged["items"]):
        ba, ma = b.get("action"), m.get("action")
        if ba is None:
            continue
        path = f"items[{b['id']}].action"
        if set(ba) != set(ma):
            rep.err(path, f"the keys are {sorted(ba)} and aren't translated (the UI reads them); found {sorted(ma)}")
            continue
        tool, new_tool = ba["herramienta"], ma["herramienta"]
        if tools.setdefault(tool, new_tool) != new_tool:
            rep.err(path, f"the tool {tool!r} is translated in two ways: {tools[tool]!r} and {new_tool!r}")
        if new_tool not in merged["context"]:
            rep.err(path, f"the tool {new_tool!r} doesn't appear in the policy (context)")
        bargs, margs = ba["argumentos"], ma["argumentos"]
        if len(bargs) != len(margs):
            rep.err(path, f"arguments: {len(margs)}, the original has {len(bargs)} (same order)")
            continue
        for (bk, bv), (mk, mv) in zip(bargs.items(), margs.items()):
            if not IDENTIFIER.match(mk):
                rep.warn(f"{path}.argumentos.{mk}", "the argument name should be lowercase snake_case")
            if isinstance(bv, str) and isinstance(mv, str):
                if sorted(PROTECTED.findall(bv)) != sorted(PROTECTED.findall(mv)):
                    rep.err(f"{path}.argumentos.{mk}", f"protected data changes (email, date or reference): {bv!r} → {mv!r}")
                text_check(rep, f"{path}.argumentos.{mk}", bv, mv)
            elif bv != mv:
                rep.err(f"{path}.argumentos.{mk}", f"different non-text value: {bv!r} → {mv!r}")
    if len(set(tools.values())) != len(tools):
        rep.err("items.action", "two different tools are translated the same way")


def check_scenario(base: dict, over: dict, lang: str, rep: Report) -> None:
    try:
        merged = demo.merge_overlay(base, over, demo.SCENARIO_REPLACE)
    except ValueError as exc:
        rep.err("structure", str(exc))
        return
    skip = set(demo.SCENARIO_REPLACE)
    if base.get("kind") == "game":
        for key in GAME_FROZEN:
            if merged.get(key) != base.get(key):
                rep.err(key, "not translated in the game case: the engine and the model read it")
        skip |= set(GAME_FROZEN)
    compare(base, merged, "$", None, rep, frozenset(skip), lang)

    for key in MUST_CHANGE:
        if key in base and merged[key] == base[key]:
            rep.err(key, f"must be translated: {base[key]!r}")
    for key in MUST_CHANGE_NOTES:
        if key in base.get("notes", {}) and merged["notes"][key] == base["notes"][key]:
            rep.err(f"notes.{key}", "must be translated")
    check_state_fields(base, merged, lang, rep)

    if NUMBERING.findall(base["context"]) != NUMBERING.findall(merged["context"]):
        rep.err("context", f"the policy numbering changes: {NUMBERING.findall(base['context'])} → {NUMBERING.findall(merged['context'])}")
    marker = POLICY_MARKER.get(lang)
    if base.get("view") == "guardrails" and marker and marker not in merged["context"]:
        rep.err("context", f"must contain {marker!r}, which the view uses to separate the policy")

    for name, q in base.get("questions", {}).items():
        crit, new = q.get("criteria"), merged["questions"][name].get("criteria")
        if isinstance(crit, list):
            for i, (bc, mc) in enumerate(zip(crit, new)):
                if ":" in bc and ":" not in mc:
                    rep.err(f"questions.{name}.criteria[{i}]", f"must keep 'Label: description': {mc!r}")

    for it in merged.get("items", []):
        if "hotel" in it and "hotels" in merged and it["hotel"] not in merged["hotels"]:
            rep.err(f"items[{it['id']}].hotel", f"{it['hotel']!r} isn't in `hotels`")
        for field in ("channel", "source"):
            if field in it and str(it[field]).lower() not in KNOWN_CHANNELS:
                rep.warn(f"items[{it['id']}].{field}", f"unknown channel {it[field]!r}: no icon in the UI")
    if "items" in base:
        check_items(base, merged, over, lang, rep)
    if any("action" in it for it in base.get("items", [])):
        check_actions(base, merged, rep)


def check_items(base: dict, merged: dict, over: dict, lang: str, rep: Report) -> None:
    present = {o.get("id") for o in over.get("items", [])}
    mine = [it for it in base["items"] if it.get("lang") in (None, "es")]
    for it in mine:
        if it["id"] not in present:
            rep.err(f"items[{it['id']}]", "the item translation is missing")
    kept = len(base["items"]) - len(mine)
    rep.summary = f"{len(mine) - sum(it['id'] not in present for it in mine)}/{len(mine)} items translated, {kept} in other languages left intact"


def check_lab(base: dict, over: dict, lang: str, rep: Report) -> None:
    try:
        merged = demo.merge_overlay(base, over, demo.LAB_REPLACE)
    except ValueError as exc:
        rep.err("structure", str(exc))
        return
    compare(base, merged, "$", None, rep, frozenset(demo.LAB_REPLACE), lang)
    present = {t.get("id") for t in over.get("templates", [])}
    done = 0
    for b, m in zip(base["templates"], merged["templates"]):
        path = f"templates[{b['id']}]"
        if b["id"] not in present:
            rep.err(path, "the template translation is missing")
            continue
        done += 1
        check_template(b, m, path, rep)
    rep.summary = f"{done}/{len(base['templates'])} templates translated"


def check_state_value(rep: Report, path: str, b, m) -> None:
    """A template's `state` is translated whole: same shapes and sizes, translated texts, everything else identical."""
    if isinstance(b, str) and isinstance(m, str):
        text_check(rep, path, b, m)
    elif isinstance(b, dict) and isinstance(m, dict):
        if len(b) != len(m):
            rep.err(path, f"{len(m)} fields, the original has {len(b)}")
            return
        for (bk, bv), (mk, mv) in zip(b.items(), m.items()):
            check_state_value(rep, f"{path}.{mk}", bv, mv)
    elif isinstance(b, list) and isinstance(m, list):
        if len(b) != len(m):
            rep.err(path, f"{len(m)} elements, the original has {len(b)}")
            return
        for i, (bv, mv) in enumerate(zip(b, m)):
            check_state_value(rep, f"{path}[{i}]", bv, mv)
    elif b != m:
        rep.err(path, f"isn't text and can't change: {b!r} → {m!r}")


def check_template(b: dict, m: dict, path: str, rep: Report) -> None:
    bs, ms = b["state"], m["state"]
    if type(bs) is not type(ms):
        rep.err(f"{path}.state", f"is {type(ms).__name__}, the original is {type(bs).__name__}")
    elif isinstance(bs, dict):
        if len(bs) != len(ms):
            rep.err(f"{path}.state", f"{len(ms)} fields, the original has {len(bs)}")
        else:
            for (bk, bv), (mk, mv) in zip(bs.items(), ms.items()):
                check_state_value(rep, f"{path}.state.{mk}", bv, mv)
    else:
        text_check(rep, f"{path}.state", bs, ms)

    bq, mq = b["questions"], m["questions"]
    if len(bq) != len(mq):
        rep.err(f"{path}.questions", f"{len(mq)} questions, the original has {len(bq)}")
        return
    for (bn, bd), (mn, md) in zip(bq.items(), mq.items()):
        qpath = f"{path}.questions.{mn}"
        if not QUESTION_NAME.match(mn):
            rep.warn(qpath, "the question name should be an identifier (letters, digits and _)")
        if bd["type"] != md.get("type"):
            rep.err(qpath, f"type {md.get('type')!r}, the original is {bd['type']!r}")
            continue
        text_check(rep, f"{qpath}.instructions", bd["instructions"], md.get("instructions", ""))
        bc, mc = bd.get("criteria"), md.get("criteria")
        if type(bc) is not type(mc):
            rep.err(f"{qpath}.criteria", "must have the same shape as the original")
        elif isinstance(bc, dict):
            if len(bc) != len(mc):
                rep.err(f"{qpath}.criteria", f"{len(mc)} options, the original has {len(bc)}")
            else:
                for (bk, bv), (mk, mv) in zip(bc.items(), mc.items()):
                    text_check(rep, f"{qpath}.criteria.{mk}", bv, mv)
        elif isinstance(bc, list):
            if len(bc) != len(mc):
                rep.err(f"{qpath}.criteria", f"{len(mc)} levels, the original has {len(bc)}")
            else:
                for i, (bv, mv) in enumerate(zip(bc, mc)):
                    if ":" in bv and ":" not in mv:
                        rep.err(f"{qpath}.criteria[{i}]", f"must keep 'Label: description': {mv!r}")
                    text_check(rep, f"{qpath}.criteria[{i}]", bv, mv)
    check_labels(m, path, rep)


def check_labels(m: dict, path: str, rep: Report) -> None:
    """UI labels (`labels`) point to existing questions and options and contain no Spanish."""
    labels = m.get("labels") or {}
    questions = m["questions"]
    for name, text in labels.get("questions", {}).items():
        where = f"{path}.labels.questions.{name}"
        if name not in questions:
            rep.err(where, "not a question of the template")
        elif spanish_hits(text) >= 2:
            rep.err(where, f"untranslated: {text[:70]!r}")
    for name, values in labels.get("values", {}).items():
        choices = (questions.get(name) or {}).get("criteria")
        if not isinstance(choices, dict):
            rep.err(f"{path}.labels.values.{name}", "not a choice question of the template")
            continue
        for key, text in values.items():
            where = f"{path}.labels.values.{name}.{key}"
            if key not in choices:
                rep.err(where, "not an option of the question")
            elif spanish_hits(text) >= 2:
                rep.err(where, f"untranslated: {text[:70]!r}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lang", default="en", choices=[code for code in demo.LANGS if code != demo.DEFAULT_LANG])
    ap.add_argument("--only", nargs="+", metavar="ID", help="file prefixes (01, 03-viajes…) and/or 'lab'")
    ap.add_argument("--allow-missing", action="store_true", help="a missing translation file is not an error")
    ap.add_argument("--dir", type=Path, help="folder with the scenario translations (default: src/scenarios/<lang>)")
    ap.add_argument("--lab", type=Path, help="Lab translation (default: src/lab.<lang>.json)")
    ap.add_argument("--quiet", action="store_true", help="don't show warnings")
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
        print("Nothing to validate: check --only", file=sys.stderr)
        return 2

    reports: list[Report] = []
    for name, base_path, over_path, check in jobs:
        rep = Report(name)
        reports.append(rep)
        if not over_path.exists():
            if args.only is not None or not args.allow_missing:
                rep.err(str(over_path.relative_to(ROOT)) if over_path.is_relative_to(ROOT) else str(over_path), "the translation doesn't exist")
            else:
                rep.summary = "no translation (allowed)"
        else:
            try:
                over = json.loads(over_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError as exc:
                rep.err("json", f"invalid JSON: {exc}")
            else:
                base = json.loads(base_path.read_text(encoding="utf-8"))
                check(base, over, args.lang, rep)

        mark = "✗" if rep.errors else ("⚠" if rep.warnings else "✓")
        stats = f" · {rep.changed}/{rep.total} texts differ from the original" if rep.total else ""
        print(f"{mark} {name}: {rep.summary or 'checked'}{stats} · {len(rep.errors)} errors · {len(rep.warnings)} warnings")
        for path, msg in rep.errors:
            print(f"    ✗ {path}: {msg}")
        if not args.quiet:
            for path, msg in rep.warnings:
                print(f"    ⚠ {path}: {msg}")

    errors = sum(len(r.errors) for r in reports)
    warnings = sum(len(r.warnings) for r in reports)
    print(f"\n{'FAILED' if errors else 'OK'}: {errors} errors, {warnings} warnings in {len(reports)} files")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
