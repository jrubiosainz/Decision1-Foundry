// Caso 4 · Router de modelos GenAI: cada petición al destino más barato que la resuelve bien.
import { h, fmt } from '../util.js';
import { t, tx, tn } from '../i18n.js';
import { ans, primary, processedItems, card, lane, inboxBlock, sevBadge, flagChip, yes, sectionTitle, scoreLabel } from './common.js';

const FALLBACK = 'modelo_grande'; // i18n-ok

export function routeOf(ctx, id) {
  const p = primary(ctx, id);
  if (!p) return null;
  return p.low || !ctx.sc.routes[p.key] ? { key: FALLBACK, fallback: true } : { key: p.key, fallback: false };
}

/** Coste y latencia de esta ejecución frente a mandarlo todo al modelo grande. */
export function economics(ctx) {
  const { sc, st } = ctx;
  const done = processedItems(ctx);
  if (!done.length) return null;
  const big = sc.routes[FALLBACK];
  let routed = 0;
  let latSum = 0;
  let latN = 0;
  for (const it of done) {
    const key = routeOf(ctx, it.id).key;
    routed += sc.routes[key].cost_usd;
    if (key !== 'humano') { // i18n-ok
      latSum += sc.routes[key].latency_ms;
      latN++;
    }
  }
  const n = done.length;
  const d1Usd = st.cost?.usd ?? 0;
  const d1Ms = st.meta?.p50 ?? st.meta?.latency_ms ?? 0;
  const base = n * big.cost_usd;
  const withRouter = routed + d1Usd;
  return {
    n,
    base,
    withRouter,
    d1Usd,
    saving: base ? 1 - withRouter / base : 0,
    latBase: big.latency_ms,
    latRouter: latN ? latSum / latN + d1Ms : null,
    perReqBase: big.cost_usd,
    perReqRouter: withRouter / n,
  };
}

function badges(ctx, it) {
  const { sc } = ctx;
  const sev = ans(ctx, it.id, sc.severity);
  const out = [sevBadge(sev, 4, scoreLabel(sc, sc.severity, sev?.value, sev?.label))];
  const internal = ans(ctx, it.id, 'datos_internos');
  const personal = ans(ctx, it.id, 'datos_personales');
  if (yes(internal)) out.push(flagChip('🔒', t('Datos internos'), internal));
  if (yes(personal)) out.push(flagChip('🪪', t('Datos personales'), personal));
  if (routeOf(ctx, it.id)?.fallback) out.push(h('span', { class: 'chip warn', title: t('Confianza baja: por prudencia va al modelo grande') }, '↩ fallback'));
  return out;
}

function meter(ctx, e) {
  if (!e) return h('div', { class: 'meter empty' }, t('Procesa las peticiones para comparar el coste con enviarlo todo al modelo grande.'));
  const w = Math.max(1.5, Math.min(100, (e.withRouter / e.base) * 100));
  return h(
    'div',
    { class: 'meter' },
    h(
      'div',
      { class: 'meter-row' },
      h('span', { class: 'meter-label' }, t('🧠 Todo al modelo grande')),
      h('span', { class: 'meter-bar base' }, h('i', { style: { width: '100%' } })),
      h('span', { class: 'meter-val' }, fmt.eur(ctx.eur(e.base)), h('small', null, ' · ', t('{latencia} de media', { latencia: fmt.ms(e.latBase) }))),
    ),
    h(
      'div',
      { class: 'meter-row' },
      h('span', { class: 'meter-label' }, t('🔀 Con router Decision-1')),
      h('span', { class: 'meter-bar router' }, h('i', { style: { width: `${w}%` } })),
      h('span', { class: 'meter-val' }, fmt.eur(ctx.eur(e.withRouter)), h('small', null, e.latRouter != null ? [' · ', t('{latencia} de media', { latencia: fmt.ms(e.latRouter) })] : '')),
    ),
    h(
      'div',
      { class: 'meter-saving' },
      tx('{ahorro} de coste', { ahorro: h('b', null, `−${fmt.pct(e.saving)}`) }),
      e.latRouter ? [' · ', tx('{veces} más rápido de media', { veces: h('b', null, fmt.times(e.latBase / e.latRouter)) })] : null,
      h(
        'small',
        { class: 'muted' },
        ' · ',
        tn(e.n, 'incluye {coste} de Decision-1 por enrutar {n} petición', 'incluye {coste} de Decision-1 por enrutar {n} peticiones', { coste: fmt.eur(ctx.eur(e.d1Usd)) }),
      ),
    ),
  );
}

export default {
  render(ctx) {
    const { sc } = ctx;
    const groups = Object.fromEntries(Object.keys(sc.routes).map((k) => [k, []]));
    for (const it of processedItems(ctx)) groups[routeOf(ctx, it.id).key].push(it);
    return h(
      'div',
      { class: 'view router' },
      inboxBlock(ctx),
      h(
        'div',
        { class: 'lanes cols-4' },
        Object.entries(sc.routes).map(([k, r]) =>
          lane(
            k,
            {
              label: r.label,
              color: r.color,
              icon: r.icon,
              sub: t('{coste} / petición · {latencia}', {
                coste: fmt.eur(ctx.eur(r.cost_usd)),
                latencia: r.latency_ms ? `≈ ${fmt.ms(r.latency_ms)}` : t('cola humana'),
              }),
            },
            groups[k].map((it) => card(ctx, it, { color: r.color, badges: badges(ctx, it) })),
          ),
        ),
      ),
      sectionTitle(t('💶 Coste de atender estas peticiones')),
      meter(ctx, economics(ctx)),
    );
  },

  summary(ctx) {
    const { sc } = ctx;
    const done = processedItems(ctx);
    const counts = {};
    let fallback = 0;
    for (const it of done) {
      const r = routeOf(ctx, it.id);
      counts[r.key] = (counts[r.key] || 0) + 1;
      if (r.fallback) fallback++;
    }
    const rows = Object.entries(sc.routes).map(([k, r]) => ({ icon: r.icon, label: r.label, value: counts[k] || 0 }));
    const e = economics(ctx);
    if (e) rows.push({ icon: '💶', label: t('Ahorro frente a todo al modelo grande'), value: fmt.pct(e.saving) });
    rows.push({ icon: '↩', label: sc.review_label, value: fallback });
    return { processed: done.length, automated: done.length - fallback, review: fallback, rows, economics: e };
  },
};
