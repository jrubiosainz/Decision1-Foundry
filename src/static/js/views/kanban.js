// Case 1 · Ticket triage: kanban board by queue, sorted by urgency.
import { h } from '../util.js';
import { t } from '../i18n.js';
import { ans, primary, processedItems, card, lane, inboxBlock, sevBadge, flagChip, suggestion, yes, level, expected, scoreLabel } from './common.js';

const REVIEW = { color: '#d97706', icon: '👀' };

function badges(ctx, it) {
  const { sc } = ctx;
  const p = primary(ctx, it.id);
  const sev = ans(ctx, it.id, sc.severity);
  const out = [sevBadge(sev, 4, scoreLabel(sc, sc.severity, sev?.value, sev?.label))];
  for (const [k, f] of Object.entries(sc.flags || {})) {
    const a = ans(ctx, it.id, k);
    if (yes(a)) out.push(flagChip(f.icon, f.label, a));
  }
  if (p?.low) out.push(suggestion(ctx, p.a));
  return out;
}

const urgency = (ctx, id) => expected(ans(ctx, id, ctx.sc.severity)) ?? -1;

export default {
  render(ctx) {
    const { sc } = ctx;
    const done = processedItems(ctx).sort((x, y) => urgency(ctx, y.id) - urgency(ctx, x.id));
    const groups = Object.fromEntries(Object.keys(sc.lanes).map((k) => [k, []]));
    const review = [];
    for (const it of done) {
      const p = primary(ctx, it.id);
      if (p.low || !groups[p.key]) review.push(it);
      else groups[p.key].push(it);
    }
    const mk = (it, color) => card(ctx, it, { color, badges: badges(ctx, it) });
    return h(
      'div',
      { class: 'view kanban' },
      inboxBlock(ctx),
      h(
        'div',
        { class: 'lanes' },
        Object.entries(sc.lanes).map(([k, l]) => lane(k, l, groups[k].map((it) => mk(it, l.color)))),
        lane('review', { ...REVIEW, label: sc.review_label }, review.map((it) => mk(it, REVIEW.color)), { cls: 'review' }),
      ),
    );
  },

  summary(ctx) {
    const { sc } = ctx;
    const done = processedItems(ctx);
    const low = done.filter((it) => primary(ctx, it.id).low).length;
    const urgent = done.filter((it) => (level(ans(ctx, it.id, sc.severity)) ?? 0) >= 2).length;
    const rows = [{ icon: '🚨', label: t('Urgencia alta o crítica'), value: urgent }];
    for (const [k, f] of Object.entries(sc.flags || {})) {
      rows.push({ icon: f.icon, label: f.label, value: done.filter((it) => yes(ans(ctx, it.id, k))).length });
    }
    rows.push({ icon: '🌍', label: t('Idiomas, sin traducir ni configurar'), value: new Set(done.map((it) => it.lang)).size });
    rows.push({ icon: '👀', label: sc.review_label, value: low });
    return { processed: done.length, automated: done.length - low, review: low, rows };
  },
};
