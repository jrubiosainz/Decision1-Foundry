// Internationalization (es / en). The Spanish string is the translation key:
//
//   t('Procesar {n} tickets', { n })      →  "Process 12 tickets" in English; in Spanish, the text itself.
//   tx('Gana {quien} con {pts}', {...})   →  list of children for h(), when a parameter is a DOM node.
//   tn(n, '{n} llamada', '{n} llamadas')  →  singular or plural, with {n} already formatted for the language.
//   N_('Texto')                           →  marks a module constant; it is translated when used with t(CONST).
//
// The English dictionary lives in i18n/en.js. If a key is missing, the Spanish text is shown and recorded
// in window.__d1Missing (used by scripts/check-i18n.mjs and the browser tests).
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

// The language comes from ?lang=es|en (remembered and removed from the URL), then localStorage, then the
// browser's preferred languages; English when none of them is supported.
function initial() {
  const u = new URL(location.href);
  const q = valid(u.searchParams.get('lang'));
  if (q) {
    u.searchParams.delete('lang');
    history.replaceState(null, '', u.pathname + u.search + u.hash);
    safe(() => localStorage.setItem(STORE, q));
    return q;
  }
  return valid(safe(() => localStorage.getItem(STORE), null)) || fromBrowser() || 'en';
}

function fromBrowser() {
  const prefs = safe(() => (navigator.languages?.length ? navigator.languages : [navigator.language]), []);
  for (const tag of prefs) {
    const code = valid(String(tag || '').slice(0, 2).toLowerCase());
    if (code) return code;
  }
  return null;
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

/** Marks a text for translation without translating it yet (module constants). */
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

/** Like t(), but returns a list of children for h(): parameters can be DOM nodes. */
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

/** Singular (n === 1) or plural; both keys contain {n}. */
export const tn = (n, one, many, params) => t(n === 1 ? one : many, { n: intFmt().format(n), ...params });
