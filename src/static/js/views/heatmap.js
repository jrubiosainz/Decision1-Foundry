// Case 2 · Voice of the guest: actions, hotel × topic heatmap and sorted reviews.
import { h, fmt } from '../util.js';
import { t } from '../i18n.js';
import { ans, primary, processedItems, card, tile, sectionTitle, suggestion, yes, expected } from './common.js';

const EMOJI = ['😡', '😕', '😐', '🙂', '😍'];
const ORDER = ['escalar', 'responder', 'agradecer', 'archivar'];
const REVIEW_COLOR = '#d97706';
const short = (hotel) => String(hotel || '').replace(/^Brisa\s+/, '');
const emojiOf = (x) => (x == null ? '·' : EMOJI[Math.max(0, Math.min(4, Math.round(x)))]);
// Net balance (-1..1) -> tone: red, amber, green.
const hue = (net) => (net < 0 ? 45 + 45 * net : 45 + 85 * net);
const sentiment = (ctx, id) => expected(ans(ctx, id, ctx.sc.severity));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function cellStats(ctx, items, theme) {
  let pos = 0;
  let neg = 0;
  let neu = 0;
  for (const it of items) {
    const v = ans(ctx, it.id, theme)?.value;
    if (v === 'positivo') pos++;
    else if (v === 'negativo') neg++;
    else if (v === 'neutro') neu++;
  }
  const n = pos + neg + neu;
  return { pos, neg, neu, n, net: n ? (pos - neg) / n : null };
}

function heatTable(ctx, done) {
  const { sc, st } = ctx;
  st.heatPrev ||= {};
  const themes = Object.entries(sc.themes);
  const rows = sc.hotels.map((hotel) => {
    const items = done.filter((it) => it.hotel === hotel);
    const cells = themes.map(([k, label]) => {
      const s = cellStats(ctx, items, k);
      const key = `${hotel}|${k}`;
      const sig = `${s.pos}/${s.neg}/${s.neu}`;
      const changed = st.heatPrev[key] !== undefined && st.heatPrev[key] !== sig;
      st.heatPrev[key] = sig;
      if (!s.n) return h('td', { class: 'hm-cell empty' }, '·');
      return h(
        'td',
        {
          class: `hm-cell${changed ? ' pulse' : ''}`,
          style: { '--h': hue(s.net) },
          title: t('{label} · {hotel}: {pos} positivas, {neg} negativas, {neu} neutras', { label, hotel: short(hotel), pos: fmt.int(s.pos), neg: fmt.int(s.neg), neu: fmt.int(s.neu) }),
        },
        s.pos ? h('span', null, `▲${s.pos}`) : null,
        s.neg ? h('span', null, `▼${s.neg}`) : null,
        !s.pos && !s.neg ? '=' : null,
      );
    });
    const avg = mean(items.map((it) => sentiment(ctx, it.id)).filter((x) => x != null));
    return h(
      'tr',
      null,
      h('th', { class: 'hm-hotel' }, short(hotel), h('small', null, items.length ? ` · ${items.length}` : '')),
      cells,
      avg == null
        ? h('td', { class: 'hm-cell empty' }, '·')
        : h('td', { class: 'hm-cell sent', style: { '--h': hue((avg - 2) / 2) } }, `${emojiOf(avg)} ${fmt.num(avg + 1, 1)}`),
    );
  });
  return h(
    'table',
    { class: 'heatmap' },
    h('thead', null, h('tr', null, h('th', null, t('Hotel')), themes.map(([, l]) => h('th', null, l)), h('th', null, t('Media /5')))),
    h('tbody', null, rows),
  );
}

function list(ctx, title, items, icon, empty) {
  const snippet = (text) => (text.length > 96 ? `${text.slice(0, 96)}…` : text);
  return h(
    'div',
    { class: 'hm-list' },
    h('div', { class: 'hm-list-title' }, title, ' ', h('span', { class: 'count' }, items.length)),
    items.length
      ? h('ul', null, items.map((it) => h('li', null, h('button', { type: 'button', onclick: () => ctx.onItem(it.id) }, icon, ' ', h('b', null, short(it.hotel)), ' · ', snippet(it.text)))))
      : h('div', { class: 'muted small' }, empty),
  );
}

function badges(ctx, it) {
  const { sc } = ctx;
  const p = primary(ctx, it.id);
  if (!p) return [];
  const act = sc.actions[p.key];
  const out = [p.low || !act ? suggestion(ctx, p.a) : h('span', { class: 'act', style: { '--c': act.color } }, act.icon, ' ', act.label)];
  const s = sentiment(ctx, it.id);
  if (s != null) out.push(h('span', { class: 'emoji', title: t('Sentimiento {valor} / 5', { valor: fmt.num(s + 1, 1) }) }, emojiOf(s)));
  for (const [k, label] of Object.entries(sc.themes)) {
    const v = ans(ctx, it.id, k)?.value;
    if (v && v !== 'sin_mencion') out.push(h('span', { class: `theme ${v}` }, v === 'positivo' ? '+' : v === 'negativo' ? '−' : '=', ' ', label)); // i18n-ok
  }
  if (yes(ans(ctx, it.id, 'elogia_empleado'))) out.push(h('span', { class: 'flag good' }, t('👏 Elogio')));
  return out;
}

function rank(ctx, it) {
  const p = primary(ctx, it.id);
  if (!p) return 99;
  return p.low ? 0.5 : ORDER.indexOf(p.key);
}

function tally(ctx, done) {
  const counts = Object.fromEntries(ORDER.map((k) => [k, 0]));
  let review = 0;
  for (const it of done) {
    const p = primary(ctx, it.id);
    if (p.low || !(p.key in counts)) review++;
    else counts[p.key]++;
  }
  const praise = done.filter((it) => yes(ans(ctx, it.id, 'elogia_empleado')));
  return { counts, review, praise };
}

export default {
  render(ctx) {
    const { sc } = ctx;
    const done = processedItems(ctx);
    const { counts, review, praise } = tally(ctx, done);
    const avg = mean(done.map((it) => sentiment(ctx, it.id)).filter((x) => x != null));
    const sorted = [...sc.items].sort((a, b) => rank(ctx, a) - rank(ctx, b) || (sentiment(ctx, a.id) ?? 9) - (sentiment(ctx, b.id) ?? 9));
    const escalated = done.filter((it) => {
      const p = primary(ctx, it.id);
      return !p.low && p.key === 'escalar';
    });
    return h(
      'div',
      { class: 'view heatmap-view' },
      h(
        'div',
        { class: 'tiles' },
        ORDER.map((k) => tile(sc.actions[k].icon, sc.actions[k].label, counts[k], { color: sc.actions[k].color })),
        tile('👀', sc.review_label, review, { color: REVIEW_COLOR }),
        tile('👏', t('Elogios a empleados'), praise.length, { color: '#0ea5e9' }),
        tile(emojiOf(avg), t('Sentimiento medio'), avg == null ? '—' : `${fmt.num(avg + 1, 1)} / 5`, { color: '#6366f1' }),
      ),
      h(
        'div',
        { class: 'hm-wrap' },
        h('div', { class: 'hm-table' }, sectionTitle(t('🗺️ Mapa de calor por hotel y tema')), heatTable(ctx, done)),
        h(
          'div',
          { class: 'hm-side' },
          list(ctx, t('🚨 Alertas para dirección'), escalated, '🚨', t('Sin alertas')),
          list(ctx, t('👏 Reconocimientos'), praise, '👏', t('Sin elogios todavía')),
        ),
      ),
      sectionTitle(`📝 ${sc.item_label_plural[0].toUpperCase()}${sc.item_label_plural.slice(1)}`, h('span', { class: 'muted' }, `${done.length}/${sc.items.length}`)),
      h(
        'div',
        { class: 'cards-grid' },
        sorted.map((it) => {
          const p = primary(ctx, it.id);
          const color = p ? (p.low ? REVIEW_COLOR : sc.actions[p.key]?.color) : undefined;
          return card(ctx, it, { color, badges: badges(ctx, it), head: [h('span', { class: 'chip hotel' }, '🏨 ', short(it.hotel))] });
        }),
      ),
    );
  },

  summary(ctx) {
    const { sc } = ctx;
    const done = processedItems(ctx);
    const { counts, review, praise } = tally(ctx, done);
    let worst = null;
    for (const hotel of sc.hotels) {
      const items = done.filter((it) => it.hotel === hotel);
      for (const [k, label] of Object.entries(sc.themes)) {
        const s = cellStats(ctx, items, k);
        if (s.n && s.net < 0 && (!worst || s.net < worst.net || (s.net === worst.net && s.neg > worst.neg))) worst = { ...s, label, hotel };
      }
    }
    const rows = [
      { icon: '🚨', label: t('Escaladas a dirección'), value: counts.escalar },
      { icon: '💬', label: t('Respuestas a preparar'), value: counts.responder },
      { icon: '👏', label: t('Elogios a empleados'), value: praise.length },
      { icon: '🌍', label: t('Idiomas, sin traducir'), value: new Set(done.map((it) => it.lang)).size },
    ];
    if (worst) rows.push({ icon: '📉', label: t('Punto más débil'), value: `${worst.label} · ${short(worst.hotel)}` });
    rows.push({ icon: '👀', label: sc.review_label, value: review });
    return { processed: done.length, automated: done.length - review, review, rows };
  },
};
