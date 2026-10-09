// Caso 5 · Guardarraíles: cada acción del agente se valida contra la política antes de ejecutarse.
import { h, fmt } from '../util.js';
import { ans, primary, processedItems, tile, confPill, latencyChip, choiceLabel, valid, yes } from './common.js';

const HUMAN = 'aprobacion_humana';

export function verdict(ctx, id) {
  const p = primary(ctx, id);
  if (!p) return null;
  if (p.low || !ctx.sc.decisions[p.key]) return { key: HUMAN, low: true, a: p.a };
  return { key: p.key, low: false, a: p.a };
}

function policy(sc) {
  const [intro, rest = ''] = sc.context.split(/Política:/i);
  const rules = rest
    .split(/\(\d+\)/)
    .map((s) => s.trim())
    .filter(Boolean);
  return h(
    'details',
    { class: 'policy', open: true },
    h('summary', null, '📜 Política del agente · ', String(rules.length), ' reglas'),
    h('p', { class: 'muted small' }, intro.trim()),
    h('ol', null, rules.map((r) => h('li', null, r))),
  );
}

const argsText = (args) =>
  Object.entries(args || {})
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' · ');

function checkChips(ctx, it) {
  return Object.entries(ctx.sc.checks).map(([k, c]) => {
    const a = ans(ctx, it.id, k);
    if (!valid(a)) return null;
    const bad = a.value === c.bad_when;
    const pBad = c.bad_when ? a.p : 1 - a.p;
    return h('span', { class: `check ${bad ? 'bad' : 'ok'}`, title: `${c.label}: probabilidad de problema ${fmt.pct(pBad, 1)}` }, bad ? '⚠ ' : '✓ ', c.label, bad ? ` ${fmt.pct(pBad)}` : '');
  });
}

function row(ctx, it) {
  const { sc, st } = ctx;
  const v = verdict(ctx, it.id);
  const pending = st.pending.has(it.id);
  const d = v ? sc.decisions[v.key] : null;
  return h(
    'button',
    {
      type: 'button',
      class: `gr-row${pending ? ' scanning' : ''}${v ? ' done' : ''}`,
      dataset: { flip: it.id },
      style: { '--c': d?.color || '#cbd5e1' },
      onclick: () => ctx.onItem(it.id),
      title: 'Ver la decisión en detalle',
    },
    h('div', { class: 'gr-msg' }, h('b', { class: 'gr-id' }, it.id), h('span', { class: 'gr-quote' }, it.text)),
    h('div', { class: 'gr-tool' }, h('span', { class: 'tool' }, '🔧 ', h('b', null, it.action.herramienta)), h('span', { class: 'gr-args' }, argsText(it.action.argumentos))),
    h(
      'div',
      { class: 'gr-verdict' },
      v ? h('span', { class: 'verdict', style: { '--c': d.color } }, d.icon, ' ', d.label) : h('span', { class: 'verdict wait' }, pending ? '⏳ Evaluando…' : '⏸ En espera'),
      v?.low ? h('small', { class: 'muted' }, `confianza ${fmt.pct(v.a?.confidence)} · ¿${choiceLabel(sc, sc.primary, v.a?.value)}?`) : v ? confPill(v.a, ctx.threshold) : null,
      latencyChip(ctx, it.id),
    ),
    h('div', { class: 'gr-checks' }, v ? checkChips(ctx, it) : null),
  );
}

function tally(ctx) {
  const done = processedItems(ctx);
  const counts = Object.fromEntries(Object.keys(ctx.sc.decisions).map((k) => [k, 0]));
  for (const it of done) counts[verdict(ctx, it.id).key]++;
  return { done, counts };
}

const latencyLabel = (st) => (st.meta?.p50 != null ? ['Latencia p50 por acción', st.meta.p50] : ['Latencia de la llamada', st.meta?.latency_ms]);

export default {
  render(ctx) {
    const { sc, st } = ctx;
    const { counts } = tally(ctx);
    const [latLabel, lat] = latencyLabel(st);
    return h(
      'div',
      { class: 'view guardrails' },
      policy(sc),
      h(
        'div',
        { class: 'tiles' },
        Object.entries(sc.decisions).map(([k, d]) => tile(d.icon, d.label, counts[k] ?? 0, { color: d.color })),
        tile('⚡', latLabel, lat != null ? fmt.ms(lat) : '—', { color: '#6366f1' }),
      ),
      h('div', { class: 'gr-head' }, h('span', null, 'Mensaje del cliente'), h('span', null, 'Acción que propone el agente'), h('span', null, 'Veredicto'), h('span', null, 'Comprobaciones')),
      h('div', { class: 'gr-rows' }, sc.items.map((it) => row(ctx, it))),
    );
  },

  summary(ctx) {
    const { sc, st } = ctx;
    const { done, counts } = tally(ctx);
    const reason = (k, bad) => done.filter((it) => valid(ans(ctx, it.id, k)) && ans(ctx, it.id, k).value === bad).length;
    const rows = Object.entries(sc.decisions).map(([k, d]) => ({ icon: d.icon, label: d.label, value: counts[k] ?? 0 }));
    rows.push({ icon: '🕵️', label: 'Intentos de inyección detectados', value: done.filter((it) => yes(ans(ctx, it.id, 'prompt_injection'))).length });
    rows.push({ icon: '🔐', label: 'Exposición de datos sensibles', value: reason('datos_sensibles', true) });
    rows.push({ icon: '📏', label: 'Acciones que superan límites', value: reason('supera_limites', true) });
    const [latLabel, lat] = latencyLabel(st);
    if (lat != null) rows.push({ icon: '⚡', label: latLabel, value: fmt.ms(lat) });
    const review = counts[HUMAN] ?? 0;
    return { processed: done.length, automated: done.length - review, review, rows };
  },
};
