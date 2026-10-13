// Panel derecho del caso 6: el porqué, lo medido en la partida, el coste de decidir y cómo funciona.
import { h, fmt, rich } from './util.js';
import { S, eur } from './core.js';
import { t, N_ } from './i18n.js';
import { note, noteList, showJson } from './notes.js';
import { describeState } from './game/observe.js';
import { seconds } from './game/engine.js';
import { D1_ID, D1_NAME, clock, liveStats, speedText } from './arcade-shared.js';

const PER_DECISIONS = 10000;

const STATE_TEXT = { idle: N_('Sin empezar'), running: N_('En juego'), paused: N_('En pausa'), finished: N_('Terminada') };

/** Devuelve { root, update }: `update()` repinta lo medido sin recrear los botones. */
export function renderArcadeNotes(sc, ses) {
  const name = (side) => (side === 0 ? D1_NAME : ses.rival.label);
  const rows = [
    [t('Puntos'), (p) => fmt.int(p.g.score), (p) => p.g.score, 'high'],
    [t('Latencia media'), (p, s) => fmt.ms(s.modelMs), (p, s) => s.modelMs, 'low'],
    [t('Edad del mundo'), (p, s) => fmt.ms(s.ageMs), (p, s) => s.ageMs, 'low'],
    [t('Decisiones'), (p, s) => fmt.int(s.decisions)],
    [t('Saltadas'), (p, s) => fmt.int(s.skipped), (p, s) => s.skipped, 'low'],
  ].map(([label, text, value, better]) => ({ label, text, value, better, cells: [h('b', null, '—'), h('b', null, '—')] }));

  const state = h('b', null, '—');
  const headD1 = h('span', { class: 'd1' });
  const headRv = h('span', { class: 'rv' });
  const live = h(
    'div',
    { class: 'arc-nt' },
    h('div', { class: 'arc-nt-head' }, h('span'), headD1, headRv),
    rows.map((r) => h('div', { class: 'arc-nt-row' }, h('span', null, r.label), ...r.cells)),
  );
  const liveHint = h('p', { class: 'muted small' }, t('Pulsa ▶ Jugar (o la barra espaciadora) para empezar la partida.'));

  const bigValue = h('b', null, '—');
  const bigText = h('span');
  const big = h('div', { class: 'big' }, bigValue, bigText);
  const costRows = h('div', { class: 'run-rows' });
  const costHint = h('p', { class: 'muted small' }, t('Se calcula con los tokens reales de la partida.'));

  const code = h('code');
  const how = h('p', { class: 'small' });
  const btnReq = h('button', { class: 'btn', onclick: () => showJson(t('📤 Petición a Decision-1'), request()) }, t('📤 Ver petición'));
  const btnD1 = h('button', { class: 'btn', onclick: () => showJson(t('📥 Respuesta · {modelo}', { modelo: D1_NAME }), ses.d1.last.raw) }, `📥 ${D1_NAME}`);
  const btnRv = h('button', { class: 'btn', onclick: () => showJson(t('📥 Respuesta · {modelo}', { modelo: ses.rival.label }), ses.rival.last.raw) });

  function request() {
    const text = ses.d1.inflight?.text || ses.d1.last?.text || describeState(ses.d1.g);
    return { model: S.config?.decision?.deployment || D1_ID, state: `${sc.context}\n\n${text}`, questions: sc.questions };
  }

  const cadence = S.config?.game?.cadence_ms || 1050;
  const rpm = S.config?.decision?.rpm || 60;

  const root = h(
    'div',
    { class: 'notes-case' },
    h('div', { class: 'notes-kicker' }, t('Caso {n} · notas para el presentador', { n: sc.order })),
    note('🎯', t('El reto'), h('p', null, rich(sc.notes.reto))),
    note('⚡', t('La solución con Decision-1'), h('p', null, rich(sc.notes.solucion))),
    note('🧠', t('Por qué es un nuevo paradigma'), h('p', null, rich(sc.notes.paradigma))),
    note('🏢', t('Dónde aplica'), h('div', { class: 'applies' }, (sc.notes.aplica_a || []).map((a) => h('span', { class: 'apply' }, a)))),
    note('🏁', t('Esta partida'), h('div', { class: 'nrow' }, h('span', null, t('Estado')), state), live, liveHint),
    note('💶', t('El coste de decidir'), big, costRows, costHint),
    note(
      '🔧',
      t('Cómo funciona'),
      h(
        'div',
        { class: 'how' },
        code,
        how,
        h('p', { class: 'small muted' }, t('La partida es la misma para los dos (semilla y reglas). Solo cambia quién contesta y cuánto tarda.')),
        h('div', { class: 'how-btns' }, btnReq, btnD1, btnRv),
      ),
    ),
    note('🔍', t('Cómo leerlo'), noteList((sc.notes.lectura || []).map((txt) => rich(txt)))),
  );

  function update() {
    const m = ses.match;
    const [a, b] = m.players;
    const sa = liveStats(a);
    const sb = liveStats(b);
    const started = m.status !== 'idle';

    state.textContent = started
      ? t('{estado} · {tiempo} · {velocidad} · semilla {semilla}', { estado: t(STATE_TEXT[m.status]), tiempo: clock(seconds(a.g)), velocidad: speedText(m.speed), semilla: m.seed })
      : t(STATE_TEXT.idle);
    headD1.textContent = name(0);
    headRv.textContent = name(1);
    live.hidden = !started;
    liveHint.hidden = started;
    for (const r of rows) {
      const stats = [sa, sb];
      const vals = [a, b].map((p, i) => (r.value ? r.value(p, stats[i]) : null));
      [a, b].forEach((p, i) => {
        r.cells[i].textContent = r.text(p, stats[i]);
        const better = r.better && vals[0] != null && vals[1] != null && vals[0] !== vals[1] && (r.better === 'high') === vals[i] > vals[1 - i];
        r.cells[i].classList.toggle('win', !!better);
      });
    }

    const ready = sa.perDecisionUsd != null && sb.perDecisionUsd != null && sa.perDecisionUsd > 0;
    big.hidden = !ready;
    costRows.hidden = !ready;
    costHint.hidden = ready;
    if (ready) {
      const ratio = sb.perDecisionUsd / sa.perDecisionUsd;
      bigValue.textContent = fmt.times(ratio >= 1 ? ratio : 1 / ratio);
      bigText.textContent = ratio >= 1 ? t('más barato decidir con {d1} que con {rival}', { d1: D1_NAME, rival: ses.rival.label }) : t('más caro decidir con {d1} que con {rival}', { d1: D1_NAME, rival: ses.rival.label });
      const per = (s) => fmt.eur(eur(s.perDecisionUsd * PER_DECISIONS));
      const rate = (s) => (s.modelMs ? `${fmt.num(1000 / s.modelMs, 1)} /s` : '—');
      const line = (label, x, y) => h('div', { class: 'nrow' }, h('span', null, label), h('b', null, `${x} · ${y}`));
      costRows.replaceChildren(
        line(t('{n} decisiones', { n: fmt.int(PER_DECISIONS) }), per(sa), per(sb)),
        line(t('Decisiones por segundo (máx.)'), rate(sa), rate(sb)),
        h('p', { class: 'muted small' }, t('{d1} · {rival}. Decision-1 factura solo entrada; el LLM, entrada y salida.', { d1: D1_NAME, rival: ses.rival.label })),
      );
    }

    code.textContent = `POST /api/game/decide · ${D1_ID} | ${ses.rival.id}`;
    how.textContent = t('Cada modelo recibe el estado del juego en texto y dos preguntas: carril (13 opciones) y peligro (sí/no). Pide una decisión nueva cada ~{s} s (límite de {rpm} RPM) y la partida no espera la respuesta.', { s: fmt.num(cadence / 1000, 2), rpm: fmt.int(rpm) });
    btnRv.textContent = `📥 ${ses.rival.label}`;
    btnD1.disabled = !a.last;
    btnRv.disabled = !b.last;
  }

  update();
  return { root, update };
}
