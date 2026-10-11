// Comparativa final de una partida: quién ganó, por qué y qué midió cada modelo.
import { h, fmt, rich } from './util.js';
import { eur } from './core.js';
import { OVER_LABEL, clock, speedText } from './arcade-shared.js';

const ms = (s) => (s == null ? null : s * 1000);

const ROWS = [
  { label: 'Resultado', get: (r) => OVER_LABEL[r.over] || '—' },
  { label: 'Puntos', get: (r) => r.score, show: fmt.int, better: 'high' },
  { label: 'Vidas que le quedan', get: (r) => r.lives, show: fmt.int, better: 'high' },
  { label: 'Tiempo de partida', get: (r) => r.seconds, show: clock },
  { label: 'Decisiones tomadas', get: (r) => r.decisions, show: fmt.int, better: 'high' },
  { label: 'Decisiones saltadas', get: (r) => r.skipped, show: fmt.int, better: 'low' },
  { label: 'Latencia en el modelo', get: (r) => r.modelMs, show: fmt.ms, better: 'low' },
  { label: 'Latencia con la red', get: (r) => r.rttMs, show: fmt.ms, better: 'low' },
  { label: 'Edad del mundo al decidir', get: (r) => ms(r.ageS), show: fmt.ms, better: 'low', hint: 'Cuánto había cambiado la partida entre pedir la decisión y recibirla (media).' },
  { label: 'Acierto por decisión (≈)', get: (r) => r.quality, show: (v) => fmt.pct(v), better: 'high', hint: 'Frente a un oráculo aproximado que mira 2,5 s al futuro. Orientativo, no es un benchmark.' },
  { label: 'Tokens (entrada / salida)', get: (r) => `${fmt.int(r.tokensIn)} / ${fmt.int(r.tokensOut)}` },
  { label: 'Coste de la partida', get: (r) => r.usd, show: (v) => fmt.eur(eur(v)), better: 'low' },
];

function why(a, b) {
  if (a.won !== b.won) return 'pasarse el juego';
  if (a.score !== b.score) return 'más puntos';
  if (a.lives !== b.lives) return 'más vidas';
  return 'menos tiempo';
}

function table(rows) {
  const [a, b] = rows;
  const body = ROWS.map((row) => {
    const va = row.get(a);
    const vb = row.get(b);
    const comparable = row.better && typeof va === 'number' && typeof vb === 'number' && va !== vb;
    const bestIdx = comparable ? ((row.better === 'high') === va > vb ? 0 : 1) : -1;
    const cell = (v, i) => h('td', { class: i === bestIdx ? 'best' : '' }, typeof v === 'number' ? (row.show || String)(v) : v ?? '—');
    return h('tr', null, h('th', { scope: 'row', title: row.hint }, row.label, row.hint ? h('sup', null, ' ⓘ') : null), cell(va, 0), cell(vb, 1));
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
    out.push(['⚡', `**${f.label}** contestó ${fmt.times(s.modelMs / f.modelMs)} más rápido (${fmt.ms(f.modelMs)} frente a ${fmt.ms(s.modelMs)}). Sus decisiones llegaban con el mundo ${fmt.ms(ms(f.ageS))} «viejo» de media; las de ${s.label}, ${fmt.ms(ms(s.ageS))}.`]);
  }
  if (a.decisions && b.decisions) {
    const ca = a.usd / a.decisions;
    const cb = b.usd / b.decisions;
    const cheap = ca <= cb ? a : b;
    const dear = cheap === a ? b : a;
    const [cc, cd] = cheap === a ? [ca, cb] : [cb, ca];
    out.push(['💶', `Cada decisión de **${cheap.label}** costó ${fmt.eur(eur(cc))}, ${fmt.times(cd / cc)} menos que la de ${dear.label} (${fmt.eur(eur(cd))}).`]);
  }
  if (res.winner < 0) out.push(['🤝', ses.speed >= 2 ? 'Empate: repite con otra semilla para desempatar.' : 'Empate: repite con otra semilla o sube la velocidad para desempatar.']);
  else if (res.winner === faster) out.push(['🏁', 'La velocidad se notó: el modelo que decidió con el mundo más fresco fue el que ganó.']);
  else if (faster >= 0) {
    const retry = ses.speed >= 2
      ? 'Prueba otra semilla: ya estás a la máxima velocidad, donde más pesa la latencia.'
      : `${ses.speed >= 1.5 ? 'Sube a ×2' : 'Sube a ×1,5 o ×2'}, o prueba otra semilla: cuanto más rápido corre el mundo, más pesa la latencia.`;
    out.push(['⚖️', `Esta vez ganó el modelo más lento: ${res.rows[faster].label} contesta antes, pero la calidad por decisión es parecida y una sola partida no es un benchmark. ${retry}`]);
  }
  return out;
}

/** `act` = { again, nextSeed, faster } (acciones de la barra); `faster` es null si ya está a la máxima velocidad. */
export function renderResult(ses, res, act) {
  const [a, b] = res.rows;
  const tone = res.winner === 0 ? 'd1' : res.winner === 1 ? 'rv' : 'tie';
  const title = res.winner < 0 ? '🤝 Empate' : `🏆 Gana ${res.rows[res.winner].label}`;
  const detail = res.winner < 0 ? 'mismos puntos, vidas y tiempo' : `por ${why(a, b)}`;
  return h(
    'section',
    { class: 'arc-result', 'aria-label': 'Resultado de la partida' },
    h(
      'div',
      { class: `arc-verdict ${tone}` },
      h('b', null, title),
      h('span', null, `${detail} · ${fmt.int(a.score)} – ${fmt.int(b.score)} puntos · semilla ${res.seed} · ${speedText(ses.speed)}`),
    ),
    table(res.rows),
    h('ul', { class: 'arc-insights' }, insights(res, ses).map(([icon, text]) => h('li', null, h('i', null, icon), h('span', null, rich(text))))),
    h(
      'div',
      { class: 'arc-actions' },
      h('button', { class: 'btn primary', onclick: act.again }, '↺ Otra partida'),
      h('button', { class: 'btn', onclick: act.nextSeed, title: 'Cambia la semilla: otra partida distinta' }, '🎲 Otra semilla'),
      act.faster ? h('button', { class: 'btn race-btn', onclick: act.faster.run, title: 'El mundo va más deprisa; el modelo, igual de lento' }, `⚡ Subir a ${speedText(act.faster.speed)}`) : null,
    ),
    ses.history.length > 1
      ? h(
          'div',
          { class: 'arc-history' },
          h('div', { class: 'im-label' }, 'Partidas de esta sesión'),
          h(
            'ol',
            null,
            ses.history.map((g) =>
              h(
                'li',
                { class: g.winner === 0 ? 'd1' : g.winner === 1 ? 'rv' : 'tie' },
                h('span', null, `Semilla ${g.seed} · ${speedText(g.speed)} · vs ${g.rival}`),
                h('b', null, `${fmt.int(g.scores[0])} – ${fmt.int(g.scores[1])}`),
                h('em', null, g.winner < 0 ? 'empate' : g.winner === 0 ? 'Decision-1' : g.rival),
              ),
            ),
          ),
        )
      : null,
  );
}
