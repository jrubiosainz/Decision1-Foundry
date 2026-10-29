// Case 3 · 24/7 assistance: the inbox is re-sorted by urgency and SLA, with a countdown.
import { h, fmt } from '../util.js';
import { t } from '../i18n.js';
import { ans, primary, processedItems, tile, metaChips, confPill, latencyChip, flagChip, suggestion, yes, level, expected, fmtCountdown, sectionTitle } from './common.js';

const REVIEW_COLOR = '#d97706';
const priority = (ctx, id) => (expected(ans(ctx, id, ctx.sc.severity)) ?? 0) + 0.25 * (ans(ctx, id, 'en_destino')?.p ?? 0);

function ordered(ctx) {
  const { sc, st } = ctx;
  const done = sc.items.filter((it) => st.results[it.id]).sort((a, b) => priority(ctx, b.id) - priority(ctx, a.id));
  return [...done, ...sc.items.filter((it) => !st.results[it.id])];
}

function slaBadge(ctx, it) {
  const lvl = level(ans(ctx, it.id, ctx.sc.severity));
  if (lvl == null) return h('span', { class: 'sla none' }, 'SLA —');
  const mins = ctx.sc.sla_minutes[lvl];
  const at = ctx.st.meta?.items?.[it.id]?.at ?? ctx.st.meta?.at ?? Date.now();
  if (mins <= 60) {
    const deadline = at + mins * 60000;
    return h('span', { class: `sla sla-${lvl}`, dataset: { deadline: String(deadline) }, title: t('Responder en {mins} min', { mins: fmt.int(mins) }) }, '⏱ ', fmtCountdown(deadline - Date.now()));
  }
  return h('span', { class: `sla sla-${lvl}`, title: t('Responder en {horas} h', { horas: fmt.num(mins / 60, 1) }) }, `${fmt.num(mins / 60, 0)} h`);
}

function row(ctx, it, idx, arrival) {
  const { sc, st } = ctx;
  const p = primary(ctx, it.id);
  const pending = st.pending.has(it.id);
  const move = p ? arrival - idx : 0;
  const team = p && !p.low ? sc.teams[p.key] : null;
  const dest = ans(ctx, it.id, 'en_destino');
  const sale = ans(ctx, it.id, 'oportunidad_venta');
  return h(
    'button',
    {
      type: 'button',
      class: `row${pending ? ' scanning' : ''}${p ? ' done' : ''}${p?.low ? ' low' : ''}`,
      dataset: { flip: it.id },
      style: { '--c': team?.color || (p?.low ? REVIEW_COLOR : '#cbd5e1') },
      onclick: () => ctx.onItem(it.id),
      title: t('Ver la decisión en detalle'),
    },
    h('span', { class: 'row-pos' }, idx + 1),
    h('span', { class: `row-move${move > 0 ? ' up' : move < 0 ? ' down' : ''}`, title: t('Posiciones ganadas o perdidas respecto al orden de llegada') }, move > 0 ? `▲${move}` : move < 0 ? `▼${-move}` : '·'),
    p ? slaBadge(ctx, it) : h('span', { class: 'sla none' }, pending ? '…' : 'FIFO'),
    h('div', { class: 'row-main' }, h('div', { class: 'row-head' }, h('b', null, it.id), metaChips(it)), h('div', { class: 'row-text' }, it.text)),
    h(
      'div',
      { class: 'row-side' },
      team ? h('span', { class: 'team', style: { '--c': team.color } }, team.label) : p?.low ? suggestion(ctx, p.a) : null,
      yes(dest) ? flagChip('📍', t('En destino'), dest) : null,
      yes(sale) ? flagChip('💰', t('Venta'), sale, { bad: false }) : null,
      p ? confPill(p.a, ctx.threshold) : null,
      latencyChip(ctx, it.id),
    ),
  );
}

function stats(ctx) {
  const { sc } = ctx;
  const done = processedItems(ctx);
  const top = sc.sla_minutes.length - 1;
  const crit = done.filter((it) => level(ans(ctx, it.id, sc.severity)) === top).length;
  const dest = done.filter((it) => yes(ans(ctx, it.id, 'en_destino'))).length;
  const opp = done.filter((it) => yes(ans(ctx, it.id, 'oportunidad_venta'))).length;
  const low = done.filter((it) => primary(ctx, it.id).low).length;
  const arrival = Object.fromEntries(sc.items.map((it, i) => [it.id, i]));
  let jump = null;
  ordered(ctx).forEach((it, i) => {
    if (!ctx.st.results[it.id]) return;
    const gain = arrival[it.id] - i;
    if (gain > 0 && (!jump || gain > jump.gain)) jump = { id: it.id, from: arrival[it.id] + 1, to: i + 1, gain };
  });
  return { done, crit, dest, opp, low, arrival, jump };
}

export default {
  render(ctx) {
    const { sc } = ctx;
    const s = stats(ctx);
    const teamCounts = {};
    for (const it of s.done) {
      const p = primary(ctx, it.id);
      if (!p.low) teamCounts[p.key] = (teamCounts[p.key] || 0) + 1;
    }
    return h(
      'div',
      { class: 'view inbox-view' },
      h(
        'div',
        { class: 'tiles' },
        tile('🚨', t('Críticos · 5 min'), s.crit, { color: '#ef4444' }),
        tile('📍', t('Viajeros en destino'), s.dest, { color: '#f97316' }),
        tile('💰', t('Oportunidades de venta'), s.opp, {
          color: '#10b981',
          sub: s.opp
            ? t('≈ {importe} de venta potencial', { importe: fmt.eur(s.opp * sc.upsell_value_eur) })
            : t('{importe} por oportunidad', { importe: fmt.eur(sc.upsell_value_eur) }),
        }),
        tile('👀', sc.review_label, s.low, { color: REVIEW_COLOR }),
      ),
      h(
        'div',
        { class: 'team-chips' },
        Object.entries(sc.teams).map(([k, tm]) => h('span', { class: `team${teamCounts[k] ? '' : ' dim'}`, style: { '--c': tm.color } }, tm.label, ' ', h('b', null, teamCounts[k] || 0))),
      ),
      sectionTitle(
        s.done.length ? t('📬 Bandeja ordenada por Decision-1 · urgencia y SLA') : t('📬 Bandeja en orden de llegada (FIFO)'),
        h('span', { class: 'muted' }, `${s.done.length}/${sc.items.length}`),
      ),
      h('div', { class: 'rows' }, ordered(ctx).map((it, i) => row(ctx, it, i, s.arrival[it.id]))),
    );
  },

  summary(ctx) {
    const { sc } = ctx;
    const s = stats(ctx);
    const rows = [
      { icon: '🚨', label: t('Críticos, a responder en 5 min'), value: s.crit },
      { icon: '📍', label: t('Viajeros en destino'), value: s.dest },
      { icon: '💰', label: t('Oportunidades de venta'), value: s.opp ? `${s.opp} · ≈ ${fmt.eur(s.opp * sc.upsell_value_eur)}` : 0 },
    ];
    if (s.jump) {
      rows.push({
        icon: '⏫',
        label: t('Mayor adelanto en la cola'),
        value: t('{id}: puesto {from} → {to}', { id: s.jump.id, from: fmt.int(s.jump.from), to: fmt.int(s.jump.to) }),
      });
    }
    rows.push({ icon: '👀', label: sc.review_label, value: s.low });
    return { processed: s.done.length, automated: s.done.length - s.low, review: s.low, rows };
  },
};
