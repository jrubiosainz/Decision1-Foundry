// Internacionalización (es / en). La cadena en español es la clave de traducción:
//
//   t('Procesar {n} tickets', { n })      →  "Process 12 tickets" en inglés; en español, el propio texto.
//   tx('Gana {quien} con {pts}', {...})   →  lista de hijos para h(), cuando un parámetro es un nodo del DOM.
//   tn(n, '{n} llamada', '{n} llamadas')  →  singular o plural, con {n} ya formateado según el idioma.
//   N_('Texto')                           →  marca una constante de módulo; se traduce al usarla con t(CONST).
//
// El diccionario inglés vive en i18n/en.js. Si falta una clave se muestra el texto en español y se anota
// en window.__d1Missing (lo usa scripts/probar-i18n.mjs y las pruebas del navegador).
import EN from './i18n/en.js';

export const UI_LANGS = ['es', 'en'];
const STORE = 'd1-lang';
const DICTS = { en: EN };
const PSEUDO = safe(() => localStorage.getItem('d1-pseudo') === '1', false);
const valid = (c) => (UI_LANGS.includes(c) ? c : null);

function safe(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

// El idioma sale de ?lang=es|en (se recuerda y se quita de la URL), luego de localStorage y, por defecto, es.
function initial() {
  const u = new URL(location.href);
  const q = valid(u.searchParams.get('lang'));
  if (q) {
    u.searchParams.delete('lang');
    history.replaceState(null, '', u.pathname + u.search + u.hash);
    safe(() => localStorage.setItem(STORE, q));
    return q;
  }
  return valid(safe(() => localStorage.getItem(STORE), null)) || 'es';
}

let lang = initial();
document.documentElement.lang = lang;
export const missing = (window.__d1Missing = new Set());

export const getLang = () => lang;
export const locale = () => (lang === 'en' ? 'en-US' : 'es-ES');

export function setLang(code) {
  if (!valid(code)) return lang;
  lang = code;
  safe(() => localStorage.setItem(STORE, code));
  document.documentElement.lang = code;
  return lang;
}

/** Marca un texto para traducir sin traducirlo aún (constantes de módulo). */
export const N_ = (s) => s;

function raw(key) {
  if (lang === 'es') return key;
  const hit = DICTS[lang]?.[key];
  if (hit == null) {
    missing.add(key);
    return key;
  }
  return hit;
}

const fill = (s, params) => (params ? s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : s);
const mark = (s) => (PSEUDO ? `⟦${s}⟧` : s);

export function t(key, params) {
  return mark(fill(raw(key), params));
}

/** Como t(), pero devuelve una lista de hijos para h(): los parámetros pueden ser nodos del DOM. */
export function tx(key, params) {
  const s = raw(key);
  const out = [];
  let last = 0;
  for (const m of s.matchAll(/\{(\w+)\}/g)) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(params && m[1] in params ? params[m[1]] : m[0]);
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return PSEUDO ? ['⟦', ...out, '⟧'] : out;
}

const intFmt = () => new Intl.NumberFormat(locale(), { maximumFractionDigits: 0, useGrouping: 'always' });

/** Singular (n === 1) o plural; ambas claves llevan {n}. */
export const tn = (n, one, many, params) => t(n === 1 ? one : many, { n: intFmt().format(n), ...params });
