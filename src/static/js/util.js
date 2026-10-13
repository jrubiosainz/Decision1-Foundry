// Utilidades de interfaz: DOM, formato según el idioma, animaciones y diálogos.
import { t, locale } from './i18n.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Crea un elemento: h('div', {class: 'x', onclick, style: {'--c': 'red'}}, 'texto', otroNodo, [lista]) */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [sk, sv] of Object.entries(v)) {
        if (sv == null) continue;
        if (sk.startsWith('--')) el.style.setProperty(sk, sv);
        else el.style[sk] = sv;
      }
    } else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value' && 'value' in el) el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  add(el, children);
  return el;
}

function add(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) add(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => escapeMap[c]);

/** Texto con **negritas** -> nodo HTML seguro. */
export function rich(text) {
  const span = document.createElement('span');
  span.innerHTML = esc(text).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  return span;
}

// ---------- Formato ----------

// Un formateador por idioma y opciones: cambiar de idioma cambia separadores, símbolos de moneda y porcentajes.
const nfCache = new Map();
const nf = (o) => {
  const loc = locale();
  const key = `${loc}|${JSON.stringify(o)}`;
  let f = nfCache.get(key);
  if (!f) nfCache.set(key, (f = new Intl.NumberFormat(loc, o)));
  return f;
};

function money(v, currency) {
  if (v == null || Number.isNaN(v)) return '—';
  const a = Math.abs(v);
  const o = { style: 'currency', currency };
  if (a === 0) Object.assign(o, { maximumFractionDigits: 0 });
  else if (a < 0.01) Object.assign(o, { maximumSignificantDigits: 2 });
  else if (a < 100) Object.assign(o, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  else Object.assign(o, { maximumFractionDigits: 0, useGrouping: 'always' });
  return nf(o).format(v);
}

export const fmt = {
  int: (n) => (n == null ? '—' : nf({ maximumFractionDigits: 0, useGrouping: 'always' }).format(n)),
  num: (n, d = 1) => (n == null ? '—' : nf({ maximumFractionDigits: d, useGrouping: 'always' }).format(n)),
  pct: (p, d = 0) => (p == null ? '—' : nf({ style: 'percent', maximumFractionDigits: d }).format(p)),
  ms: (ms) => {
    if (ms == null || Number.isNaN(ms)) return '—';
    if (ms < 1000) return `${Math.round(ms)} ms`;
    return `${fmt.num(ms / 1000, ms < 10000 ? 2 : 1)} s`;
  },
  eur: (v) => money(v, 'EUR'),
  usd: (v) => money(v, 'USD'),
  // «×13» en español y «13×» en inglés.
  times: (r) => {
    if (r == null || !Number.isFinite(r)) return '—';
    const v = r >= 10 ? fmt.int(r) : fmt.num(r, 1);
    return locale().startsWith('en') ? `${v}×` : `×${v}`;
  },
};

// Nombres de idioma en su propia lengua (igual en toda la interfaz).
export const LANGS = {
  es: 'Español', ca: 'Català', eu: 'Euskara', gl: 'Galego', pt: 'Português', en: 'English', // i18n-ok
  de: 'Deutsch', fr: 'Français', it: 'Italiano', nl: 'Nederlands',
};

// Los canales llegan del escenario ya traducido (Llamada → Call, Empleado → Employee, Encuesta → Survey).
const CHANNEL_ICONS = {
  email: '✉️', whatsapp: '💬', web: '🌐', 'x / twitter': '𝕏', chat: '💭', llamada: '📞', call: '📞', phone: '📞',
  app: '📱', empleado: '🪪', employee: '🪪', booking: '🛏️', google: '🔎', tripadvisor: '🦉', encuesta: '📝', survey: '📝',
};
export const channelIcon = (name) => CHANNEL_ICONS[String(name || '').toLowerCase()] || '•';

export const median = (xs) => {
  const a = xs.filter((x) => x != null).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

export const plural = (n, one, many) => `${fmt.int(n)} ${n === 1 ? one : many}`;

// ---------- Concurrencia ----------

/** Ejecuta fn sobre items con un máximo de `limit` en paralelo. */
export async function pool(items, limit, fn) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
}

// ---------- Animación FLIP ----------

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Anima los elementos con [data-flip] desde su posición anterior a la nueva tras `mutate()`.
 * Funciona aunque el DOM se regenere: empareja por el valor de data-flip.
 */
export function flip(root, mutate, { duration = 700, stagger = 0, maxDelay = 900 } = {}) {
  if (!root || reduceMotion()) {
    mutate();
    return;
  }
  const before = new Map();
  for (const el of root.querySelectorAll('[data-flip]')) before.set(el.dataset.flip, el.getBoundingClientRect());
  mutate();
  let i = 0;
  for (const el of root.querySelectorAll('[data-flip]')) {
    const b = before.get(el.dataset.flip);
    if (!b) continue;
    const a = el.getBoundingClientRect();
    if (!a.width || !a.height) continue;
    const dx = b.left - a.left;
    const dy = b.top - a.top;
    const sx = b.width / a.width;
    const sy = b.height / a.height;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.02 && Math.abs(sy - 1) < 0.02) continue;
    const delay = Math.min(stagger * i++, maxDelay);
    el.style.zIndex = '5';
    const anim = el.animate(
      [
        { transformOrigin: 'top left', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
        { transformOrigin: 'top left', transform: 'none' },
      ],
      { duration, delay, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'backwards' },
    );
    anim.onfinish = anim.oncancel = () => {
      el.style.zIndex = '';
    };
  }
}

// ---------- Avisos y diálogos ----------

export function toast(message, kind = 'info', ms = 4500) {
  const box = $('#toasts');
  if (!box) return;
  const t = h('div', { class: `toast ${kind}`, role: kind === 'error' ? 'alert' : 'status' }, message);
  box.append(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 350);
  }, ms);
}

let lastFocus = null;

export function openModal(content, { wide = false, onClose } = {}) {
  const m = $('#modal');
  lastFocus = document.activeElement;
  m.innerHTML = '';
  const close = h('button', { class: 'modal-close', 'aria-label': t('Cerrar'), title: t('Cerrar (Esc)'), onclick: closeModal }, '×');
  m.append(h('div', { class: `modal${wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true' }, close, content));
  m.hidden = false;
  m.onclick = (e) => {
    if (e.target === m) closeModal();
  };
  m._onClose = onClose;
  close.focus();
}

export function closeModal() {
  const m = $('#modal');
  if (m.hidden) return;
  m.hidden = true;
  m.innerHTML = '';
  if (typeof m._onClose === 'function') m._onClose();
  m._onClose = null;
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

export const modalOpen = () => !$('#modal').hidden;

// ---------- JSON coloreado ----------

export function jsonHtml(value, maxLen = 80000) {
  let s = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  let cut = false;
  if (s.length > maxLen) {
    s = s.slice(0, maxLen);
    cut = true;
  }
  s = esc(s).replace(
    /(&quot;(?:\\.|(?!&quot;).)*?&quot;)(\s*:)?|\b(true|false|null)\b|(-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)/g,
    (m, str, colon, kw, num) => {
      if (str) return colon ? `<span class="j-key">${str}</span>${colon}` : `<span class="j-str">${str}</span>`;
      if (kw) return `<span class="j-kw">${kw}</span>`;
      return `<span class="j-num">${num}</span>`;
    },
  );
  return s + (cut ? `\n<span class="j-cut">${esc(t('… (recortado)'))}</span>` : '');
}

export function copyText(text) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(
      () => toast(t('Copiado al portapapeles'), 'ok', 1800),
      () => toast(t('No se pudo copiar'), 'error'),
    );
  }
}
