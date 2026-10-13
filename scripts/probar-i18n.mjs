#!/usr/bin/env node
// Comprueba las traducciones de la interfaz (src/static/js/i18n/en/*.js) contra el código.
//
//   node scripts/probar-i18n.mjs            # informe completo
//   node scripts/probar-i18n.mjs --quiet    # solo errores y recuentos
//
// Errores (código de salida 1): clave sin traducción, traducción sin uso, placeholders {x} o **negritas**
// distintos, t() con interpolación `${}`, traducciones repetidas con valores distintos.
// Avisos: textos en español sin envolver en t()/tx()/tn()/N_() y llamadas t(variable) que conviene revisar.
// Para ignorar un literal a propósito, añade `// i18n-ok` en su línea.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JS = join(ROOT, 'src/static/js');
const QUIET = process.argv.includes('--quiet');
// El texto que se envía a los modelos en el caso 6 es en español en ambos idiomas.
const SKIP_FILES = new Set(['game/observe.js']);

// ---------- Lector de JavaScript (literales, plantillas, llamadas) ----------

const PUNCT_BEFORE_REGEX = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);
const KW_BEFORE_REGEX = new Set(['return', 'typeof', 'case', 'in', 'of', 'delete', 'void', 'throw', 'new', 'else', 'do', 'instanceof', 'yield', 'await']);

function decode(body) {
  return body.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|\r?\n|.)/gs, (m, g) => {
    if (g[0] === 'u' && g.length > 1) return String.fromCodePoint(parseInt(g.replace(/[u{}]/g, ''), 16));
    if (g[0] === 'x' && g.length === 3) return String.fromCharCode(parseInt(g.slice(1), 16));
    if (g === '\n' || g === '\r\n') return '';
    return { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' }[g] ?? g;
  });
}

function lex(src, start, closeBrace) {
  const toks = [];
  let i = start;
  let depth = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
    } else if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === '/' && src[i + 1] === '*') {
      const e = src.indexOf('*/', i + 2);
      i = e < 0 ? src.length : e + 2;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      let body = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\') {
          body += src[j] + src[j + 1];
          j += 2;
        } else body += src[j++];
      }
      toks.push({ type: 'str', value: decode(body), pos: i });
      i = j + 1;
    } else if (c === '`') {
      let j = i + 1;
      let cur = '';
      const parts = [];
      const exprs = [];
      while (j < src.length && src[j] !== '`') {
        if (src[j] === '\\') {
          cur += src[j] + src[j + 1];
          j += 2;
        } else if (src[j] === '$' && src[j + 1] === '{') {
          parts.push(decode(cur));
          cur = '';
          const inner = lex(src, j + 2, true);
          exprs.push(inner.toks);
          j = inner.end;
        } else cur += src[j++];
      }
      parts.push(decode(cur));
      toks.push({ type: 'tpl', parts, exprs, value: parts.join('${}'), pos: i });
      i = j + 1;
    } else if (c === '{') {
      depth++;
      toks.push({ type: 'p', value: c, pos: i++ });
    } else if (c === '}') {
      if (closeBrace && depth === 0) return { toks, end: i + 1 };
      depth--;
      toks.push({ type: 'p', value: c, pos: i++ });
    } else if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1;
      while (j < src.length && /[\w$]/.test(src[j])) j++;
      toks.push({ type: 'id', value: src.slice(i, j), pos: i });
      i = j;
    } else if (/[0-9]/.test(c)) {
      let j = i + 1;
      while (j < src.length && /[\w.]/.test(src[j])) j++;
      toks.push({ type: 'num', value: src.slice(i, j), pos: i });
      i = j;
    } else if (c === '/' && regexAllowed(toks[toks.length - 1])) {
      let j = i + 1;
      let inClass = false;
      while (j < src.length) {
        const ch = src[j];
        if (ch === '\\') j += 2;
        else if (ch === '[') (inClass = true), j++;
        else if (ch === ']') (inClass = false), j++;
        else if (ch === '/' && !inClass) break;
        else j++;
      }
      j++;
      while (/[a-z]/i.test(src[j] || '')) j++;
      toks.push({ type: 're', value: src.slice(i, j), pos: i });
      i = j;
    } else {
      toks.push({ type: 'p', value: c, pos: i++ });
    }
  }
  return { toks, end: i };
}

function regexAllowed(p) {
  if (!p) return true;
  if (p.type === 'p') return PUNCT_BEFORE_REGEX.has(p.value);
  if (p.type === 'id') return KW_BEFORE_REGEX.has(p.value);
  return false;
}

const isP = (t, v) => t?.type === 'p' && t.value === v;
const isLit = (t) => t?.type === 'str' || (t?.type === 'tpl' && t.exprs.length === 0);

/** Recorre una lista de tokens (y las expresiones de las plantillas) buscando llamadas de traducción. */
function scan(toks, file, out) {
  for (let k = 0; k < toks.length; k++) {
    const tk = toks[k];
    if (tk.type === 'tpl') for (const e of tk.exprs) scan(e, file, out);
    if (tk.type !== 'id' || !isP(toks[k + 1], '(') || isP(toks[k - 1], '.')) continue;
    const fn = tk.value;
    if (['t', 'tx', 'tn', 'N_'].includes(fn)) out.used.add(fn);
    if (fn === 't' || fn === 'tx' || fn === 'N_') {
      const a = toks[k + 2];
      if (isLit(a) && (isP(toks[k + 3], ',') || isP(toks[k + 3], ')'))) {
        a.isKey = true;
        out.keys.push({ key: a.value, file, pos: a.pos, fn });
      } else if (a?.type === 'tpl' && a.exprs.length) {
        out.errors.push({ file, pos: a.pos, msg: `${fn}() con interpolación \`\${}\`; usa {parámetros}` });
      } else if (a && (a.type === 'str' || a.type === 'tpl')) {
        out.errors.push({ file, pos: a.pos, msg: `${fn}() con un literal seguido de operador; la clave debe ser un único literal` });
      } else if (fn !== 'N_') {
        out.dynamic.push({ file, pos: tk.pos, fn });
      }
    } else if (fn === 'tn') {
      let depth = 0;
      let j = k + 2;
      for (; j < toks.length; j++) {
        const v = toks[j];
        if (v.type === 'p' && '([{'.includes(v.value)) depth++;
        else if (v.type === 'p' && ')]}'.includes(v.value)) depth--;
        else if (isP(v, ',') && depth === 0) break;
        if (depth < 0) break;
      }
      const one = toks[j + 1];
      const many = toks[j + 3];
      if (isLit(one) && isP(toks[j + 2], ',') && isLit(many)) {
        for (const l of [one, many]) {
          l.isKey = true;
          out.keys.push({ key: l.value, file, pos: l.pos, fn });
        }
      } else out.errors.push({ file, pos: tk.pos, msg: 'tn(n, singular, plural): las claves deben ser dos literales' });
    }
  }
}

/** Todos los literales de una lista de tokens, incluidos los de las plantillas. */
function* literals(toks) {
  for (let k = 0; k < toks.length; k++) {
    const tk = toks[k];
    if (tk.type === 'tpl') for (const e of tk.exprs) yield* literals(e);
    if (tk.type === 'str' || tk.type === 'tpl') yield { tk, prev: toks[k - 1], next: toks[k + 1] };
  }
}

// ---------- Heurística de texto en español ----------

const ACCENTS = /[áéíóúñüÁÉÍÓÚÑ¿¡]/;
const STRONG = new Set(
  ('que para con sin por una los las del más como pero también muy esta este esto estos estas todo todos todas cada entre sobre desde hasta hay está están ' +
    'tiene tienen puede puedes tu tus su sus llamada llamadas decisión decisiones caso casos coste costes lote procesar reiniciar empate gana ganador partida ' +
    'partidas petición peticiones pregunta preguntas respuesta respuestas umbral nota notas ahorro horas minutos segundos cargando copiar copiado cerrar ' +
    'laboratorio introducción ejecución proyección resultado velocidad tiempo menos solo mes año días día cuando donde porque aquí ver abrir mostrar ocultar ' +
    'enviar guardar cancelar aceptar volver siguiente anterior nuevo nueva nada otro otra otros uno dos tres cuatro cinco seis carrera automatizado ' +
    'automatizados reseña reseñas mensaje mensajes acción acciones revisión humana humano modelo modelos entrada salida lenguaje idioma idiomas ' +
    'empresa clientes cliente ficticia pulsa elige prueba pruébalo calentando juega jugar pausar reanudar invasores invasor nave bomba disparo').split(/\s+/),
);
const WEAK = new Set('de en el la al y a un es se lo le'.split(' '));

function spanishSignal(s) {
  if (!/[A-Za-zÁÉÍÓÚáéíóúñÑ]{2}/.test(s)) return 0;
  if (ACCENTS.test(s)) return 3;
  const words = s.toLowerCase().split(/[^a-záéíóúñü]+/).filter(Boolean);
  if (words.some((w) => STRONG.has(w))) return 2;
  if (words.filter((w) => WEAK.has(w)).length >= 2) return 1;
  return 0;
}

// ---------- Ejecución ----------

function walk(dir) {
  const files = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) files.push(...(e.name === 'i18n' ? [] : walk(p)));
    else if (e.name.endsWith('.js') && e.name !== 'i18n.js') files.push(p);
  }
  return files;
}

const keys = [];
const dynamic = [];
const errors = [];
const leaks = [];
const lineOf = (src) => {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') starts.push(i + 1);
  return (pos) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
};

for (const path of walk(JS).sort()) {
  const file = relative(JS, path).split(sep).join('/');
  const src = readFileSync(path, 'utf8');
  const at = lineOf(src);
  const lines = src.split('\n');
  const { toks } = lex(src, 0, false);
  const out = { keys: [], dynamic: [], errors: [], used: new Set() };
  scan(toks, file, out);
  const imported = new Set();
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"][^'"]*i18n\.js['"]/g)) {
    for (const part of m[1].split(',')) imported.add(part.trim().split(/\s+as\s+/).pop());
  }
  for (const fn of out.used) if (!imported.has(fn)) errors.push(`${file}: usa ${fn}() sin importarlo de i18n.js`);
  const fix = (r) => ({ ...r, line: at(r.pos) });
  keys.push(...out.keys.map(fix));
  dynamic.push(...out.dynamic.map(fix));
  errors.push(...out.errors.map((r) => ({ ...fix(r), msg: `${file}:${at(r.pos)} ${r.msg}` })));
  if (SKIP_FILES.has(file)) continue;
  for (const { tk, prev, next } of literals(toks)) {
    if (tk.isKey) continue;
    if (prev?.type === 'id' && (prev.value === 'from' || prev.value === 'import')) continue;
    if ((isP(prev, '{') || isP(prev, ',')) && isP(next, ':')) continue;
    const line = at(tk.pos);
    if (/i18n-ok/.test(lines[line - 1])) continue;
    const sig = spanishSignal(tk.value);
    if (sig) leaks.push({ file, line, sig, text: tk.value.replace(/\s+/g, ' ').slice(0, 110) });
  }
}

// Diccionario: cada fragmento por separado (para detectar conflictos) y el agregado.
const fragDir = join(JS, 'i18n/en');
const fragments = {};
for (const f of readdirSync(fragDir).filter((n) => n.endsWith('.js')).sort()) {
  fragments[f] = (await import(pathToFileURL(join(fragDir, f)).href)).default;
}
const EN = {};
const owner = {};
for (const [f, dict] of Object.entries(fragments)) {
  for (const [es, en] of Object.entries(dict)) {
    if (es in EN && EN[es] !== en) errors.push(`traducciones distintas para «${es}»: ${owner[es]} y ${f}`);
    EN[es] = en;
    owner[es] ??= f;
  }
}

const used = new Set(keys.map((k) => k.key));
const names = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const bolds = (s) => (s.match(/\*\*/g) || []).length;
for (const k of keys) {
  if (!(k.key in EN)) errors.push(`${k.file}:${k.line} sin traducción: «${k.key}»`);
}
for (const [es, en] of Object.entries(EN)) {
  if (typeof en !== 'string' || !en.trim()) errors.push(`${owner[es]}: traducción vacía para «${es}»`);
  else {
    if (names(es) !== names(en)) errors.push(`${owner[es]}: placeholders distintos en «${es}» → «${en}»`);
    if (bolds(es) !== bolds(en)) errors.push(`${owner[es]}: marcas ** distintas en «${es}» → «${en}»`);
  }
  if (!used.has(es)) errors.push(`${owner[es]}: traducción sin uso en el código: «${es}»`);
}

const fmtPos = (r) => `${r.file}:${r.line}`;
if (!QUIET) {
  const sorted = leaks.sort((a, b) => b.sig - a.sig || a.file.localeCompare(b.file) || a.line - b.line);
  if (sorted.length) {
    console.log(`\nPosibles textos en español sin envolver (${sorted.length}):`);
    for (const l of sorted) console.log(`  ${l.sig === 1 ? '?' : '!'} ${fmtPos(l)}  ${JSON.stringify(l.text)}`);
  }
  if (dynamic.length) {
    console.log(`\nLlamadas t(variable) a revisar a mano (${dynamic.length}): solo son válidas con constantes marcadas con N_().`);
    for (const d of dynamic) console.log(`  ${fmtPos(d)}  ${d.fn}(…)`);
  }
}
if (errors.length) {
  console.log(`\nErrores (${errors.length}):`);
  for (const e of errors) console.log(`  ✗ ${typeof e === 'string' ? e : e.msg}`);
}
console.log(
  `\ni18n: ${used.size} claves usadas, ${Object.keys(EN).length} traducciones, ${leaks.length} posibles textos sin envolver, ${dynamic.length} llamadas dinámicas, ${errors.length} errores.`,
);
process.exit(errors.length ? 1 : 0);
