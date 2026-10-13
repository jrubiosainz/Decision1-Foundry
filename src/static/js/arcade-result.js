// Comparativa final de una partida: quién ganó, por qué y qué midió cada modelo.
import { h, fmt, rich } from './util.js';
import { eur } from './core.js';
import { t, N_ } from './i18n.js';
import { OVER_LABEL, clock, speedText } from './arcade-shared.js';

const ms = (s) => (s == null ? null : s * 1000);

// Las etiquetas y ayudas se traducen con t() al pintar la tabla.
const ROWS = [
  { label: N_('Resultado'), get: (r) => (OVER_LABEL[r.over] ? t(OVER_LABEL[r.over]) : '—') },
  { label: N_('Puntos'), get: (r) => r.score, show: fmt.int, better: 'high' },
  { label: N_('Vidas que le quedan'), get: (r) => r.lives, show: fmt.int, better: 'high' },
  { label: N_('Tiempo de partida'), get: (r) => r.seconds, show: clock },
  { label: N_('Decisiones tomadas'), get: (r) => r.decisions, show: fmt.int, better: 'high' },
  { label: N_('Decisiones saltadas'), get: (r) => r.skipped, show: fmt.int, better: 'low' },
  { label: N_('Latencia en el modelo'), get: (r) => r.modelMs, show: fmt.ms, better: 'low' },
  { label: N_('Latencia con la red'), get: (r) => r.rttMs, show: fmt.ms, better: 'low' },
  { label: N_('Edad del mundo al decidir'), get: (r) => ms(r.ageS), show: fmt.ms, better: 'low', hint: N_('Cuánto había cambiado la partida entre pedir la decisión y recibirla (media).') },
  { label: N_('Acierto por decisión (≈)'), get: (r) => r.quality, show: (v) => fmt.pct(v), better: 'high', hint: N_('Frente a un oráculo aproximado que mira 2,5 s al futuro. Orientativo, no es un benchmark.') },
  { label: N_('Tokens (entrada / salida)'), get: (r) => `${fmt.int(r.tokensIn)} / ${fmt.int(r.tokensOut)}` },
  { label: N_('Coste de la partida'), get: (r) => r.usd, show: (v) => fmt.eur(eur(v)), better: 'low' },
];

function why(a, b) {
  if (a.won !== b.won) return t('por pasarse el juego');
  if (a.score !== b.score) return t('por más puntos');
  if (a.lives !== b.lives) return t('por más vidas');
  return t('por menos tiempo');
}

function table(rows) {
  const [a, b] = rows;
  const body = ROWS.map((row) => {
    const va = row.get(a);
    const vb = row.get(b);
    const comparable = row.better && typeof va === 'number' && typeof vb === 'number' && va !== vb;
    const bestIdx = comparable ? ((row.better === 'high') === va > vb ? 0 : 1) : -1;
    const cell = (v, i) => h('td', { class: i === bestIdx ? 'best' : '' }, typeof v === 'number' ? (row.show || String)(v) : v ?? '—');
    return h('tr', null, h('th', { scope: 'row', title: row.hint ? t(row.hint) : null }, t(row.label), row.hint ? h('sup', null, ' ⓘ') : null), cell(va, 0), cell(vb, 1));
  });
  return h(
    'table',
    { class: 'arc-table' },
    h('thead', null, h('tr', null, h('th'), h('th', { class: 'd1' }, a.label), h('th', { class: 'rv' }, b.label))),
    h('tbody', null, body),
  );
}

function insights(res, ses) {
  const [a, b] = res.rows;
  const out = [];
  const faster = a.modelMs != null && b.modelMs != null ? (a.modelMs <= b.modelMs ? 0 : 1) : -1;
  if (faster >= 0) {
    const f = res.rows[faster];
    const s = res.rows[1 - faster];
    out.push([
      '⚡',
      t('**{rapido}** contestó {veces} más rápido ({ms1} frente a {ms2}). Sus decisiones llegaban con el mundo {edad1} «viejo» de media; las de {lento}, {edad2}.', {
        rapido: f.label,
        veces: fmt.times(s.modelMs / f.modelMs),
        ms1: fmt.ms(f.modelMs),
        ms2: fmt.ms(s.modelMs),
        edad1: fmt.ms(ms(f.ageS)),
        lento: s.label,
        edad2: fmt.ms(ms(s.ageS)),
      }),
    ]);
  }
  if (a.decisions && b.decisions) {
    const ca = a.usd / a.decisions;
    const cb = b.usd / b.decisions;
    const cheap = ca <= cb ? a : b;
    const dear = cheap === a ? b : a;
    const [cc, cd] = cheap === a ? [ca, cb] : [cb, ca];
    out.push(['💶', t('Cada decisión de **{barato}** costó {coste}, {veces} menos que la de {caro} ({coste2}).', { barato: cheap.label, coste: fmt.eur(eur(cc)), veces: fmt.times(cd / cc), caro: dear.label, coste2: fmt.eur(eur(cd)) })]);
  }
  if (res.winner < 0) out.push(['🤝', ses.speed >= 2 ? t('Empate: repite con otra semilla para desempatar.') : t('Empate: repite con otra semilla o sube la velocidad para desempatar.')]);
  else if (res.winner === faster) out.push(['🏁', t('La velocidad se notó: el modelo que decidió con el mundo más fresco fue el que ganó.')]);
  else if (faster >= 0) {
    const retry = ses.speed >= 2
      ? t('Prueba otra semilla: ya estás a la máxima velocidad, donde más pesa la latencia.')
      : ses.speed >= 1.5
        ? t('Sube a {v}, o prueba otra semilla: cuanto más rápido corre el mundo, más pesa la latencia.', { v: speedText(2) })
        : t('Sube a {a} o {b}, o prueba otra semilla: cuanto más rápido corre el mundo, más pesa la latencia.', { a: speedText(1.5), b: speedText(2) });
    out.push(['⚖️', t('Esta vez ganó el modelo más lento: {rapido} contesta antes, pero la calidad por decisión es parecida y una sola partida no es un benchmark. {consejo}', { rapido: res.rows[faster].label, consejo: retry })]);
  }
  return out;
}

/** `act` = { again, nextSeed, faster } (acciones de la barra); `faster` es null si ya está a la máxima velocidad. */
export function renderResult(ses, res, act) {
  const [a, b] = res.rows;
  const tone = res.winner === 0 ? 'd1' : res.winner === 1 ? 'rv' : 'tie';
  const title = res.winner < 0 ? t('🤝 Empate') : t('🏆 Gana {nombre}', { nombre: res.rows[res.winner].label });
  const detail = res.winner < 0 ? t('mismos puntos, vidas y tiempo') : why(a, b);
  return h(
    'section',
    { class: 'arc-result', 'aria-label': t('Resultado de la partida') },
    h(
      'div',
      { class: `arc-verdict ${tone}` },
      h('b', null, title),
      h('span', null, t('{detalle} · {a} – {b} puntos · semilla {seed} · {speed}', { detalle: detail, a: fmt.int(a.score), b: fmt.int(b.score), seed: res.seed, speed: speedText(ses.speed) })),
    ),
    table(res.rows),
    h('ul', { class: 'arc-insights' }, insights(res, ses).map(([icon, text]) => h('li', null, h('i', null, icon), h('span', null, rich(text))))),
    h(
      'div',
      { class: 'arc-actions' },
      h('button', { class: 'btn primary', onclick: act.again }, t('↺ Otra partida')),
      h('button', { class: 'btn', onclick: act.nextSeed, title: t('Cambia la semilla: otra partida distinta') }, t('🎲 Otra semilla')),
      act.faster ? h('button', { class: 'btn race-btn', onclick: act.faster.run, title: t('El mundo va más deprisa; el modelo, igual de lento') }, t('⚡ Subir a {v}', { v: speedText(act.faster.speed) })) : null,
    ),
    ses.history.length > 1
      ? h(
          'div',
          { class: 'arc-history' },
          h('div', { class: 'im-label' }, t('Partidas de esta sesión')),
          h(
            'ol',
            null,
            ses.history.map((g) =>
              h(
                'li',
                { class: g.winner === 0 ? 'd1' : g.winner === 1 ? 'rv' : 'tie' },
                h('span', null, t('Semilla {seed} · {speed} · vs {rival}', { seed: g.seed, speed: speedText(g.speed), rival: g.rival })),
                h('b', null, `${fmt.int(g.scores[0])} – ${fmt.int(g.scores[1])}`),
                h('em', null, g.winner < 0 ? t('empate') : g.winner === 0 ? 'Decision-1' : g.rival),
              ),
            ),
          ),
        )
      : null,
  );
}
