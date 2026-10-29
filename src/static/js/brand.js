// Client brand: logo, name, colors (text, background and trim) and font. The server already serves the
// page with the brand applied; this dialog changes it with a live preview and saves it with the access code.
import { h, $, openModal, closeModal, toast } from './util.js';
import { S, api, ApiError, errorText, emit, setCode } from './core.js';
import { t, N_ } from './i18n.js';

export const DEFAULT_BRAND = { name: '', text: '#0f172a', background: '#ffffff', accent: '#0f6cbd', font: '' };

const COLOR_KEYS = ['text', 'background', 'accent'];
const COLORS = [
  ['text', N_('Texto (fuentes)')],
  ['background', N_('Fondo')],
  ['accent', N_('Ribetes y líneas')],
];
const PRESETS = [
  { label: 'Microsoft Foundry', fixed: true, text: '#0f172a', background: '#ffffff', accent: '#0f6cbd' },
  { label: N_('Negro y oro'), text: '#111111', background: '#ffffff', accent: '#b08d57' },
  { label: N_('Noche'), text: '#f3eee4', background: '#121212', accent: '#c9a96e' },
  { label: N_('Bronce'), text: '#2b2118', background: '#faf7f2', accent: '#a0703c' },
  { label: N_('Marino'), text: '#0f2340', background: '#ffffff', accent: '#c5a572' },
  { label: N_('Verde'), text: '#0b3b2e', background: '#ffffff', accent: '#5cb615' },
];
const FONTS = [
  ['', N_('Segoe UI (predeterminada)')],
  ['"Century Gothic","Avenir Next",Avenir,"Trebuchet MS",sans-serif', N_('Geométrica · Century Gothic, Avenir')],
  ['"Helvetica Neue",Helvetica,Arial,sans-serif', N_('Clásica · Helvetica, Arial')],
  ['Georgia,"Palatino Linotype",Palatino,serif', N_('Serif · Georgia, Palatino')],
  ['Didot,"Bodoni MT","Times New Roman",serif', N_('Elegante · Didot, Bodoni')],
];
const customStack = (name) => `"${name}","Segoe UI",system-ui,sans-serif`;
const CUSTOM_STACK = /^"([^"]+)","Segoe UI",system-ui,sans-serif$/;

const HEX = /^#[0-9a-f]{6}$/i;
// Same rules as the server (app.py): letters, numbers, spaces, commas, periods, hyphens and paired quotes.
const FONT = /^[\p{L}\p{N}_ ,.'"-]{1,160}$/u;
const FONT_NAME = /^[\p{L}\p{N}_ .-]{1,60}$/u;
const MAX_NAME = 60;
const MAX_FILE = 8 * 1024 * 1024;
const MAX_LOGO_BYTES = 600_000;
const LOGO_SIZES = [
  [192, 1200],
  [144, 900],
  [96, 600],
];
// Background of the case 6 board, which is dark with any brand.
const BOARD_BG = '#111f44';

const validFont = (f) => FONT.test(f) && (f.match(/"/g) || []).length % 2 === 0 && (f.match(/'/g) || []).length % 2 === 0;

// ---------- Color: same calculation as the server, so the preview matches what gets saved ----------

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

const lumOf = (r, g, b) => {
  const f = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

export const luminance = (hex) => lumOf(...rgb(hex));

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Like color-mix(in srgb, a weight, b). */
function mix(a, b, weight) {
  const [x, y] = [rgb(a), rgb(b)];
  return `#${x.map((v, i) => Math.floor(v * weight + y[i] * (1 - weight) + 0.5).toString(16).padStart(2, '0')).join('')}`;
}

const onAccent = (accent) => (contrast('#ffffff', accent) >= 4.5 || contrast('#ffffff', accent) >= contrast('#111111', accent) ? '#ffffff' : '#111111');

function accentText(accent, text, background) {
  const panel = mix(text, background, 0.06);
  const surfaces = [background, panel, mix(accent, background, 0.2), mix(accent, panel, 0.2)];
  for (let step = 0; step <= 10; step++) {
    const color = mix(accent, text, 1 - step / 10);
    if (Math.min(...surfaces.map((s) => contrast(color, s))) >= 4.5) return color;
  }
  return text;
}

/** Brand with the derived values that the server also computes (GET /api/brand). */
function derive(b) {
  return {
    ...b,
    themed: COLOR_KEYS.some((k) => b[k] !== DEFAULT_BRAND[k]),
    scheme: luminance(b.background) < 0.18 ? 'dark' : 'light',
    onAccent: onAccent(b.accent),
    accentText: accentText(b.accent, b.text, b.background),
  };
}

// ---------- Apply the brand to the page ----------

const msLogo = () => h('span', { class: 'ms-logo', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i'));

function renderMark(b) {
  const mark = $('#brand-mark');
  if (!mark) return;
  const parts = [];
  if (b.logo) {
    // The image is reused if it doesn't change, so it doesn't flicker while the name or colors are edited.
    const old = mark.querySelector('img.brand-logo');
    const img = old?.getAttribute('src') === b.logo ? old : h('img', { class: 'brand-logo', src: b.logo });
    img.alt = b.name || 'Logo';
    parts.push(img);
    fitLogo(img);
  }
  if (b.name) parts.push(h('span', { class: 'brand-name' }, b.name));
  mark.replaceChildren(...(parts.length ? parts : [msLogo(), h('span', null, 'Microsoft Foundry')]));
}

export function applyBrand(b) {
  const root = document.documentElement;
  if (b.themed) root.dataset.brand = b.scheme;
  else delete root.dataset.brand;
  const decls = b.themed
    ? [`--brand-text:${b.text}`, `--brand-bg:${b.background}`, `--brand-accent:${b.accent}`, `--brand-on-accent:${b.onAccent}`, `--brand-accent-text:${b.accentText}`]
    : [];
  if (b.font && validFont(b.font)) decls.push(`--font:${b.font}`);
  let style = $('#brand-vars');
  if (!style) document.head.append((style = h('style', { id: 'brand-vars' })));
  style.textContent = decls.length ? `:root{${decls.join(';')}}` : '';
  renderMark(b);
  emit('brand', b);
}

/** Brand accent for drawing on the dark case 6 board (null without a brand). Lightened if it doesn't show. */
export function boardAccent() {
  const root = document.documentElement;
  if (!root.dataset.brand) return null;
  const base = getComputedStyle(root).getPropertyValue('--brand-accent').trim().toLowerCase();
  if (!HEX.test(base)) return null;
  let color = base;
  for (let i = 1; i <= 10 && contrast(color, BOARD_BG) < 3; i++) color = mix('#ffffff', base, i / 10);
  return color;
}

// ---------- Logo: any image → cropped, scaled-down PNG ----------

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(t('No se pudo leer la imagen.')));
    img.src = src;
  });
}

/** SVG with an explicit size and viewBox, as a data URL: this way it renders sharp and without external resources. */
async function svgSource(file) {
  const doc = new DOMParser().parseFromString(await file.text(), 'image/svg+xml');
  const svg = doc.documentElement;
  if (svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error(t('El SVG no es válido.'));
  const box = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  const hasBox = box.length === 4 && box[2] > 0 && box[3] > 0;
  const [vw, vh] = hasBox ? [box[2], box[3]] : [parseFloat(svg.getAttribute('width')) || 300, parseFloat(svg.getAttribute('height')) || 150];
  const k = Math.min(400 / vh, 2400 / vw);
  if (!hasBox) svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
  svg.setAttribute('width', String(Math.max(1, Math.round(vw * k))));
  svg.setAttribute('height', String(Math.max(1, Math.round(vh * k))));
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
}

function canvasOf(width, height) {
  return h('canvas', { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) });
}

/** Bounding box of the non-transparent pixels (logos often come with empty margins). */
function opaqueBox(canvas) {
  const { width: w, height: hh } = canvas;
  const { data } = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, hh);
  let [x0, y0, x1, y1] = [w, hh, -1, -1];
  for (let y = 0; y < hh; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] <= 8) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

async function logoFromFile(file) {
  const svg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
  if (!svg && !/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error(t('Formato no admitido: usa PNG, JPG, SVG, WebP o GIF.'));
  if (file.size > MAX_FILE) throw new Error(t('La imagen supera los 8 MB.'));
  const src = svg ? await svgSource(file) : URL.createObjectURL(file);
  try {
    const img = await loadImage(src);
    const [nw, nh] = [img.naturalWidth || img.width, img.naturalHeight || img.height];
    if (!nw || !nh) throw new Error(t('No se pudo leer la imagen.'));
    const k = Math.min(1, 2400 / nw, 800 / nh);
    const work = canvasOf(nw * k, nh * k);
    work.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, work.width, work.height);
    const box = opaqueBox(work);
    if (!box) throw new Error(t('La imagen está vacía: es toda transparente.'));
    for (const [maxH, maxW] of LOGO_SIZES) {
      const s = Math.min(1, maxH / box.h, maxW / box.w);
      const out = canvasOf(box.w * s, box.h * s);
      const ctx = out.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(work, box.x, box.y, box.w, box.h, 0, 0, out.width, out.height);
      const dataUrl = out.toDataURL('image/png');
      if (dataUrl.length * 0.75 <= MAX_LOGO_BYTES - 2000) return { dataUrl, canvas: out };
    }
    throw new Error(t('El logotipo pesa demasiado incluso reducido: prueba con un PNG o un SVG más sencillo.'));
  } catch (e) {
    // A "tainted" canvas (e.g. an SVG with HTML content in Safari) can't be exported.
    if (e?.name === 'SecurityError') throw new Error(t('No se pudo procesar la imagen: prueba con un PNG.'));
    throw e;
  } finally {
    if (!svg) URL.revokeObjectURL(src);
  }
}

/** Up to five dominant colors of the logo (no transparent, white or black pixels), to use as accents. */
function logoPalette(canvas) {
  const k = Math.min(1, 48 / Math.max(canvas.width, canvas.height));
  const small = canvasOf(canvas.width * k, canvas.height * k);
  const ctx = small.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, small.width, small.height);
  const { data } = ctx.getImageData(0, 0, small.width, small.height);
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 128 || Math.min(r, g, b) > 235 || Math.max(r, g, b) < 20) continue;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
    e.n++;
    e.r += r;
    e.g += g;
    e.b += b;
    buckets.set(key, e);
  }
  const picked = [];
  for (const e of [...buckets.values()].sort((x, y) => y.n - x.n)) {
    const c = [e.r / e.n, e.g / e.n, e.b / e.n];
    if (picked.every((p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) > 48)) picked.push(c);
    if (picked.length === 5) break;
  }
  return picked.map((c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`);
}

async function imageCanvas(src) {
  const img = await loadImage(src);
  const c = canvasOf(img.naturalWidth, img.naturalHeight);
  c.getContext('2d').drawImage(img, 0, 0);
  return c;
}

// ---------- Logo legible on any background ----------

/** Luminance of the logo's opaque pixels and whether it has its own background (opaque border, like a JPG). */
const pixelCache = new Map();
function logoPixels(src) {
  let job = pixelCache.get(src);
  if (!job) {
    job = loadImage(src).then((img) => {
      const k = Math.min(1, 160 / Math.max(img.naturalWidth, img.naturalHeight, 1));
      const c = canvasOf(img.naturalWidth * k, img.naturalHeight * k);
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const { width: w, height: hh } = c;
      const { data } = ctx.getImageData(0, 0, w, hh);
      const lums = [];
      let edge = 0;
      let solid = 0;
      for (let y = 0; y < hh; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const opaque = data[i + 3] >= 128;
          if (opaque) lums.push(lumOf(data[i], data[i + 1], data[i + 2]));
          if (x === 0 || y === 0 || x === w - 1 || y === hh - 1) {
            edge++;
            if (opaque) solid++;
          }
        }
      }
      return { lums, framed: edge > 0 && solid / edge >= 0.9 };
    });
    job.catch(() => pixelCache.delete(src));
    pixelCache.set(src, job);
    if (pixelCache.size > 6) pixelCache.delete(pixelCache.keys().next().value);
  }
  return job;
}

function cssColor(s) {
  let m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p[3] ?? 1];
  }
  m = /^color\(srgb ([^)]+)\)$/.exec(s);
  if (m) {
    const p = m[1].split(/[\s/]+/).filter(Boolean).map(Number);
    return [p[0] * 255, p[1] * 255, p[2] * 255, p[3] ?? 1];
  }
  return null;
}

/** Luminance of the background behind an element, including semi-transparent layers. */
function backdropLum(el) {
  const layers = [];
  for (let e = el; e; e = e.parentElement) {
    const c = cssColor(getComputedStyle(e).backgroundColor);
    if (!c || c[3] <= 0) continue;
    layers.push(c);
    if (c[3] >= 0.99) break;
  }
  let bg = [255, 255, 255];
  for (const [r, g, b, a] of layers.reverse()) bg = [r * a + bg[0] * (1 - a), g * a + bg[1] * (1 - a), b * a + bg[2] * (1 - a)];
  return lumOf(...bg);
}

/** If much of the logo doesn't stand out from the background (a dark one on "Night", a white one on white), it goes on a plate in the text color. */
function fitLogo(img) {
  const src = img.getAttribute('src');
  if (!src) return;
  logoPixels(src)
    .then(({ lums, framed }) => {
      if (!img.isConnected || img.getAttribute('src') !== src || !lums.length) return;
      const bg = backdropLum(img.parentElement);
      const hidden = lums.filter((l) => (Math.max(l, bg) + 0.05) / (Math.min(l, bg) + 0.05) < 1.6).length;
      img.classList.toggle('plate', !framed && hidden / lums.length > 0.35);
    })
    .catch(() => {});
}

/** Logo already included in the page served with the brand. */
export function initBrand() {
  document.querySelectorAll('img.brand-logo').forEach(fitLogo);
}

// ---------- "Customize the brand" dialog ----------

let loading = false;

export async function openBrand() {
  if (loading) return;
  loading = true;
  try {
    S.brand = await api('/api/brand', null, { retry: false });
  } catch (e) {
    toast(errorText(e), 'error', 6000);
    return;
  } finally {
    loading = false;
  }
  brandModal(S.brand);
}

function brandModal(saved) {
  const draft = { name: saved.name, text: saved.text, background: saved.background, accent: saved.accent, font: saved.font, logo: saved.logo };
  let done = false;
  let closed = false;
  let chipToken = 0;

  // Logo
  const fileInput = h('input', {
    type: 'file',
    accept: 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.svg',
    hidden: true,
    onchange: (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (file) useFile(file);
    },
  });
  const prev = h('div', { class: 'logo-prev' });
  // An image that finishes processing after the dialog has closed must not repaint the preview.
  const preview = () => {
    if (closed) return;
    applyBrand(derive(draft));
    const img = prev.querySelector('img');
    if (img) fitLogo(img);
  };
  const pick = () => fileInput.click();
  const drop = h(
    'div',
    {
      class: 'logo-drop',
      role: 'button',
      tabindex: '0',
      title: t('Elegir el logotipo'),
      onclick: pick,
      onkeydown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          pick();
        }
      },
    },
    prev,
    h('div', { class: 'logo-hint' }, h('b', null, t('Arrastra aquí el logotipo o haz clic para elegirlo')), t('PNG, JPG, SVG, WebP o GIF. También puedes pegarlo con Ctrl+V / ⌘V.')),
  );
  const chipsLabel = h('span', null, t('Colores del logotipo:'));
  const chips = h('span', { style: { display: 'contents' } });
  const removeBtn = h('button', { type: 'button', class: 'btn ghost', onclick: () => setLogo(null) }, t('Quitar el logotipo'));
  const chipRow = h('div', { class: 'logo-chips' }, chipsLabel, chips, h('span', { class: 'grow' }), removeBtn);

  const renderLogo = () => {
    prev.replaceChildren(draft.logo ? h('img', { src: draft.logo, alt: '' }) : msLogo());
    removeBtn.hidden = !draft.logo;
  };

  const showChips = async (canvas) => {
    const token = ++chipToken;
    let colors = [];
    try {
      if (!canvas && draft.logo) canvas = await imageCanvas(draft.logo);
      if (canvas) colors = logoPalette(canvas);
    } catch {
      colors = [];
    }
    if (token !== chipToken) return;
    chips.replaceChildren(
      ...colors.map((c) =>
        h('button', {
          type: 'button',
          class: 'logo-chip',
          style: { background: c },
          title: t('Usar {color} en ribetes y líneas', { color: c.toUpperCase() }),
          'aria-label': t('Usar {color} en ribetes y líneas', { color: c.toUpperCase() }),
          onclick: () => setColor('accent', c),
        }),
      ),
    );
    chipsLabel.hidden = !colors.length;
    chipRow.hidden = !colors.length && !draft.logo;
  };

  const setLogo = (url, canvas = null) => {
    draft.logo = url;
    renderLogo();
    showChips(canvas);
    preview();
  };

  const useFile = async (file) => {
    drop.classList.add('drag');
    try {
      const { dataUrl, canvas } = await logoFromFile(file);
      setLogo(dataUrl, canvas);
    } catch (e) {
      toast(e?.message || t('No se pudo leer la imagen.'), 'error', 6000);
    } finally {
      drop.classList.remove('drag');
    }
  };

  // Name and font
  const name = h('input', {
    class: 'field-input',
    value: draft.name,
    maxlength: MAX_NAME,
    placeholder: 'Microsoft Foundry',
    autocomplete: 'off',
    oninput: () => {
      draft.name = name.value.replace(/\s+/g, ' ').trim();
      preview();
    },
  });
  const custom = h('input', { class: 'field-input', maxlength: 60, placeholder: t('Nombre exacto de la fuente, p. ej. Montserrat'), autocomplete: 'off', spellcheck: 'false', hidden: true });
  const fontSel = h(
    'select',
    { class: 'field-input' },
    FONTS.map(([stack, label]) => h('option', { value: stack, style: { fontFamily: stack || null } }, t(label))),
    h('option', { value: 'custom' }, t('Otra fuente instalada…')),
  );
  const setFont = () => {
    custom.hidden = fontSel.value !== 'custom';
    if (custom.hidden) {
      custom.setCustomValidity('');
      draft.font = fontSel.value;
    } else {
      const v = custom.value.replace(/\s+/g, ' ').trim();
      const stack = !v ? '' : FONT_NAME.test(v) ? customStack(v) : validFont(v) ? v : null;
      custom.setCustomValidity(stack == null ? t('Usa solo letras, números, espacios, puntos y guiones.') : '');
      if (stack == null) return;
      draft.font = stack;
    }
    preview();
  };
  fontSel.addEventListener('change', () => {
    setFont();
    if (!custom.hidden) custom.focus();
  });
  custom.addEventListener('input', setFont);
  const syncFont = () => {
    const known = FONTS.some(([stack]) => stack === draft.font);
    fontSel.value = known ? draft.font : 'custom';
    custom.hidden = known;
    custom.value = known ? '' : draft.font.match(CUSTOM_STACK)?.[1] || draft.font;
    custom.setCustomValidity('');
  };

  // Colors
  const pickers = {};
  const hexes = {};
  const warn = h('p', { class: 'brand-warn', hidden: true });
  const paint = () => {
    preview();
    for (const [key] of COLORS) {
      if (pickers[key].value !== draft[key]) pickers[key].value = draft[key];
      if (document.activeElement !== hexes[key]) hexes[key].value = draft[key];
    }
    const textOk = contrast(draft.text, draft.background) >= 4.5;
    const lineOk = contrast(draft.accent, draft.background) >= 1.5;
    warn.hidden = textOk && lineOk;
    warn.textContent = !textOk
      ? t('Poco contraste entre texto y fondo: puede leerse mal en un proyector.')
      : t('Los ribetes y las líneas apenas se distinguen del fondo.');
  };
  const setColor = (key, value) => {
    if (!HEX.test(value)) return;
    draft[key] = value.toLowerCase();
    paint();
  };
  const colorRow = ([key, label]) => {
    pickers[key] = h('input', { type: 'color', class: 'swatch', value: draft[key], 'aria-label': t(label), oninput: (e) => setColor(key, e.target.value) });
    hexes[key] = h('input', {
      class: 'field-input hex',
      value: draft[key],
      maxlength: 7,
      spellcheck: 'false',
      autocomplete: 'off',
      'aria-label': t('{label} (hexadecimal)', { label: t(label) }),
      oninput: (e) => {
        const v = e.target.value.trim();
        setColor(key, v.startsWith('#') ? v : `#${v}`);
      },
      onblur: (e) => (e.target.value = draft[key]),
    });
    return h('label', { class: 'color-row' }, h('span', { class: 'color-label' }, t(label)), pickers[key], hexes[key]);
  };
  const presets = h(
    'div',
    { class: 'presets' },
    PRESETS.map((p) => {
      const label = p.fixed ? p.label : t(p.label);
      return h(
        'button',
        {
          type: 'button',
          class: 'preset',
          title: label,
          onclick: () => {
            Object.assign(draft, { text: p.text, background: p.background, accent: p.accent });
            paint();
          },
        },
        h('span', { class: 'preset-swatch', style: { background: p.background, color: p.text, borderColor: p.accent } }, 'Aa'),
        label,
      );
    }),
  );

  // Footer: reset, access code (only if needed), cancel and save
  const code = h('input', { type: 'password', class: 'field-input', placeholder: t('Código de acceso'), 'aria-label': t('Código de acceso'), autocomplete: 'off', hidden: true, style: { width: '170px', flex: 'none' } });
  const reset = h(
    'button',
    {
      type: 'button',
      class: 'btn ghost',
      title: t('Vuelve al logotipo, los colores y la tipografía de Microsoft Foundry (se aplica al guardar)'),
      onclick: () => {
        Object.assign(draft, DEFAULT_BRAND);
        name.value = '';
        syncFont();
        setLogo(null);
        paint();
      },
    },
    t('Restablecer Microsoft Foundry'),
  );
  const submit = h('button', { type: 'submit', class: 'btn primary' }, t('Guardar'));

  const form = h(
    'form',
    {
      class: 'brand-form',
      onsubmit: async (e) => {
        e.preventDefault();
        if (!code.hidden && code.value.trim()) setCode(code.value.trim());
        const payload = { name: draft.name, text: draft.text, background: draft.background, accent: draft.accent, font: draft.font };
        // The logo is only sent if it changes: a data URL to replace it and null to remove it.
        if (draft.logo !== saved.logo) payload.logo = draft.logo;
        submit.disabled = true;
        try {
          S.brand = await api('/api/brand', payload, { retry: false });
          done = true;
          closeModal();
          applyBrand(S.brand);
          toast(S.brand.configured ? t('Marca guardada') : t('Marca de Microsoft Foundry restablecida'), 'ok', 2500);
        } catch (err) {
          submit.disabled = false;
          if (err instanceof ApiError && err.status === 401) {
            code.hidden = false;
            code.value = '';
            code.focus();
            toast(t('Introduce el código de acceso para guardar la marca.'), 'warn', 5000);
            return;
          }
          toast(errorText(err), 'error', 7000);
        }
      },
    },
    h('h2', null, t('🎨 Personalizar la marca')),
    h('p', { class: 'lead' }, t('Logotipo, nombre, colores y tipografía de la empresa a la que presentas la demo. Se ve en vivo; al guardar queda para todos los que la abran.')),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, t('Logotipo')), drop, chipRow, fileInput),
    h(
      'div',
      { class: 'field-row' },
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, t('Nombre')), name),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, t('Tipografía')), fontSel, custom),
    ),
    h('div', { class: 'field' }, h('span', { class: 'field-label' }, t('Colores')), h('div', { class: 'colors' }, COLORS.map(colorRow))),
    presets,
    warn,
    h('div', { class: 'form-foot' }, reset, h('span', { class: 'grow' }), code, h('button', { type: 'button', class: 'btn', onclick: closeModal }, t('Cancelar')), submit),
  );

  // Drop or paste an image anywhere while the dialog is open (otherwise the browser would open the file).
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  const listeners = {
    dragover: (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      drop.classList.add('drag');
    },
    dragleave: (e) => {
      if (!e.relatedTarget) drop.classList.remove('drag');
    },
    drop: (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      drop.classList.remove('drag');
      const file = e.dataTransfer.files[0];
      if (file) useFile(file);
    },
    paste: (e) => {
      const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
      if (!file) return;
      e.preventDefault();
      useFile(file);
    },
  };
  for (const [type, fn] of Object.entries(listeners)) document.addEventListener(type, fn);

  openModal(form, {
    onClose: () => {
      closed = true;
      for (const [type, fn] of Object.entries(listeners)) document.removeEventListener(type, fn);
      chipToken++;
      if (!done) applyBrand(S.brand);
    },
  });
  syncFont();
  renderLogo();
  showChips();
  paint();
  setTimeout(() => name.focus(), 30);
}
