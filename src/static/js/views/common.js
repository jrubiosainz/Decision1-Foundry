// Piezas comunes de las vistas de los casos de uso.
// ctx = { sc, st, threshold, onItem(id), eur(usd) }
import { h, fmt, LANGS, channelIcon } from '../util.js';
import { t, tx, N_ } from '../i18n.js';

export const valid = (a) => !!a && a.type !== 'missing' && a.type !== 'unknown';
export const ans = (ctx, id, q) => ctx.st.results[id]?.[q];
export const isDone = (ctx, id) => !!ctx.st.results[id];
export const isLow = (a, thr) => !valid(a) || (a.confidence != null && a.confidence < thr);
export const yes = (a) => !!a && a.type === 'noul' && !!a.value;
export const level = (a) => (a && a.type === 'score' ? a.value : null);
export const expected = (a) => (a && a.type === 'score' ? (a.expected ?? a.value) : null);
export const processedItems = (ctx) => ctx.sc.items.filter((it) => isDone(ctx, it.id));
export const waitingItems = (ctx) => ctx.sc.items.filter((it) => !isDone(ctx, it.id));
export const primaryMap = (sc) => sc.lanes || sc.actions || sc.teams || sc.routes || sc.decisions || {};

const humanize = (k) => {
  const s = String(k ?? '').replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const VALUE_LABELS = { sin_mencion: N_('Sin mención'), negativo: N_('Negativo'), neutro: N_('Neutro'), positivo: N_('Positivo') };
const Q_LABELS = {
  elogia_empleado: N_('Elogia a un empleado'), en_destino: N_('Viajero en destino'), oportunidad_venta: N_('Oportunidad de venta'),
  datos_internos: N_('Necesita datos internos'), datos_personales: N_('Datos personales sensibles'), sentimiento: N_('Sentimiento'),
};
// Etiqueta por defecto, traducida al pintar (solo claves propias del mapa).
const defaultLabel = (map, k) => (typeof map[k] === 'string' ? t(map[k]) : null);

export function qLabel(sc, q) {
  if (q === sc.primary) return t('Decisión principal');
  return sc.qLabels?.[q] || sc.flags?.[q]?.label || sc.themes?.[q] || sc.checks?.[q]?.label || defaultLabel(Q_LABELS, q) || humanize(q);
}

export function choiceLabel(sc, q, key) {
  if (key == null) return '—';
  if (q === sc.primary) return primaryMap(sc)[key]?.label || humanize(key);
  return sc.valueLabels?.[q]?.[key] || defaultLabel(VALUE_LABELS, key) || humanize(key);
}

/**
 * Etiqueta de un nivel de escala sacada del escenario actual (mismo recorte que short_label del backend).
 * Los resultados guardados llevan la etiqueta del idioma en que se pidieron; así siempre sigue al idioma activo.
 */
export function scoreLabel(sc, q, lvl, fallback) {
  const c = sc?.questions?.[q]?.criteria?.[lvl];
  if (typeof c !== 'string') return fallback;
  return c.slice(0, 40).includes(':') ? c.split(':', 1)[0].trim() : c.slice(0, 40);
}

export function answerText(sc, q, a) {
  if (!valid(a)) return '—';
  if (a.type === 'choice') return choiceLabel(sc, q, a.value);
  if (a.type === 'score') return scoreLabel(sc, q, a.value, a.label) ?? String(a.value);
  if (a.type === 'noul') return a.value ? t('Sí') : t('No');
  return '—';
}

export const sameAnswer = (a, b) => valid(a) && valid(b) && a.value === b.value;

/** Decisión principal ya filtrada por el umbral de confianza. */
export function primary(ctx, id) {
  const a = ans(ctx, id, ctx.sc.primary);
  if (!a) return null;
  return { a, key: valid(a) ? a.value : null, low: isLow(a, ctx.threshold) };
}

// ---------- Chips y distintivos ----------

export function sevBadge(a, n = 4, label = a?.label) {
  if (!a || a.type !== 'score' || a.value == null) return null;
  const lvl = n === 4 ? a.value : Math.round((a.value / Math.max(1, n - 1)) * 3);
  return h('span', { class: `sev sev-${lvl}`, title: t('Nivel {nivel} · valor esperado {valor}', { nivel: fmt.int(a.value), valor: fmt.num(a.expected, 2) }) }, label);
}

export function confPill(a, thr) {
  if (!a || a.confidence == null) return null;
  const low = a.confidence < thr;
  return h(
    'span',
    { class: `conf${low ? ' low' : ''}`, title: low ? t('Confianza por debajo del umbral: revisión') : t('Confianza calibrada de Decision-1') },
    fmt.pct(a.confidence),
  );
}

export const langChip = (code) => (code ? h('span', { class: 'chip lang', title: LANGS[code] || code }, code.toUpperCase()) : null);

export function metaChips(it) {
  return [
    it.channel && h('span', { class: 'chip ch' }, channelIcon(it.channel), ' ', it.channel),
    it.source && h('span', { class: 'chip ch' }, channelIcon(it.source), ' ', it.source),
    it.customer && h('span', { class: `chip cust${/\bagenc/i.test(it.customer) ? ' b2b' : ''}` }, it.customer),
    langChip(it.lang),
  ];
}

export function latencyChip(ctx, id) {
  const ms = ctx.st.meta?.items?.[id]?.latency_ms;
  return ms != null ? h('span', { class: 'lat', title: t('Latencia de la llamada a Decision-1') }, '⚡ ', fmt.ms(ms)) : null;
}

export function flagChip(icon, label, a, { bad = true } = {}) {
  const p = a?.type === 'noul' ? a.p : null;
  return h('span', { class: `flag${bad ? '' : ' good'}`, title: p != null ? `${label} · p = ${fmt.pct(p, 1)}` : label }, icon, ' ', label);
}

export function suggestion(ctx, a) {
  if (!valid(a)) return h('span', { class: 'chip warn' }, t('👀 Sin respuesta'));
  return h(
    'span',
    { class: 'chip warn', title: t('La confianza no llega al umbral: lo revisa una persona') },
    t('👀 ¿{label}? {conf}', { label: choiceLabel(ctx.sc, ctx.sc.primary, a.value), conf: fmt.pct(a.confidence) }),
  );
}

// ---------- Bloques ----------

/** Tarjeta de un elemento (se anima con FLIP entre columnas gracias a data-flip). */
export function card(ctx, it, { color, badges = [], cls = '', text = it.text, head = [] } = {}) {
  const p = primary(ctx, it.id);
  const pending = ctx.st.pending.has(it.id);
  const foot = [...badges, latencyChip(ctx, it.id)].filter(Boolean);
  return h(
    'button',
    {
      type: 'button',
      class: `card ${cls}${pending ? ' scanning' : ''}${p ? ' done' : ''}${p?.low ? ' low' : ''}`,
      dataset: { flip: it.id },
      style: { '--c': color },
      onclick: () => ctx.onItem(it.id),
      title: t('Ver la decisión en detalle'),
    },
    h('div', { class: 'card-head' }, h('b', { class: 'card-id' }, it.id), head, metaChips(it), h('span', { class: 'grow' }), p && confPill(p.a, ctx.threshold)),
    h('div', { class: 'card-text' }, text),
    foot.length ? h('div', { class: 'card-foot' }, foot) : null,
  );
}

export function tile(icon, label, value, { color, sub, title, cls = '' } = {}) {
  return h(
    'div',
    { class: `tile ${cls}`, style: { '--c': color }, title },
    h('div', { class: 'tile-top' }, h('span', { class: 'tile-icon' }, icon), h('span', { class: 'tile-label' }, label)),
    h('div', { class: 'tile-value' }, value),
    sub ? h('div', { class: 'tile-sub' }, sub) : null,
  );
}

export function lane(key, { label, color, icon, sub }, cards, { cls = '' } = {}) {
  return h(
    'section',
    { class: `lane ${cls}`, style: { '--c': color }, dataset: { lane: key } },
    h('header', { class: 'lane-head' }, icon ? h('span', { class: 'lane-icon' }, icon) : null, h('span', { class: 'lane-title' }, label), h('span', { class: 'count' }, cards.length)),
    sub ? h('div', { class: 'lane-sub' }, sub) : null,
    h('div', { class: 'lane-body' }, cards.length ? cards : h('div', { class: 'lane-empty' }, '—')),
  );
}

/** Bandeja de entrada con lo pendiente de decidir. */
export function inboxBlock(ctx, waiting = waitingItems(ctx)) {
  const { sc } = ctx;
  const total = sc.items.length;
  if (!waiting.length) {
    return h(
      'div',
      { class: 'inbox-empty' },
      tx('✓ Bandeja vacía · {cuenta} {items} con decisión', {
        cuenta: h('b', null, t('{n} de {total}', { n: fmt.int(total), total: fmt.int(total) })),
        items: sc.item_label_plural,
      }),
    );
  }
  return h(
    'section',
    { class: 'inbox' },
    h(
      'header',
      { class: 'inbox-head' },
      t('📥 Entrada'),
      ' ',
      h('span', { class: 'count' }, waiting.length),
      h('span', { class: 'muted' }, ' ', t('{items} sin decidir', { items: sc.item_label_plural })),
    ),
    h('div', { class: 'inbox-grid' }, waiting.map((it) => card(ctx, it, { cls: 'mini' }))),
  );
}

export function sectionTitle(text, extra) {
  return h('div', { class: 'section-title' }, h('span', null, text), extra || null);
}

export const fmtCountdown = (ms) => {
  if (ms <= 0) return t('vencido');
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
