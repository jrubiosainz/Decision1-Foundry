// Carrera: Decision-1 contra un LLM generativo con el mismo lote y las mismas preguntas.
import { h, fmt } from './util.js';
import { valid } from './views/common.js';

const D1_COLOR = '#0f6cbd';
const LLM_COLOR = '#7c3aed';

export function raceStats(sc, st) {
  const r = st.race;
  if (!r || r.running || !r.d1 || !r.llm || r.llm.failed || r.d1.failed) return null;
  let agree = 0;
  let both = 0;
  let d1ok = 0;
  let llmok = 0;
  let ref = 0;
  for (const it of sc.items) {
    const a = st.results[it.id]?.[sc.primary];
    const b = st.llm?.results?.[it.id]?.[sc.primary];
    if (valid(a) && valid(b)) {
      both++;
      if (a.value === b.value) agree++;
    }
    const exp = it.expected?.[sc.primary];
    if (exp != null) {
      ref++;
      if (a?.value === exp) d1ok++;
      if (b?.value === exp) llmok++;
    }
  }
  const d1Usd = st.cost?.usd;
  const llmUsd = st.llm?.cost?.usd;
  return {
    speed: r.llm.ms / r.d1.ms,
    cost: d1Usd && llmUsd ? llmUsd / d1Usd : null,
    agree,
    both,
    d1ok,
    llmok,
    ref,
  };
}

function bar(key, name, sub, color) {
  return h(
    'div',
    { class: 'race-row running', dataset: { race: key }, style: { '--c': color } },
    h('div', { class: 'race-name' }, name, h('small', null, sub)),
    h('div', { class: 'race-track' }, h('i'), h('span', { class: 'race-time' }, '0,00 s')),
    h('div', { class: 'race-stats' }, '…'),
  );
}

export function renderRace(sc, st) {
  const r = st.race;
  if (!r) return null;
  const nq = Object.keys(sc.questions).length;
  const box = h(
    'section',
    { class: 'race', 'aria-live': 'polite' },
    h(
      'div',
      { class: 'race-title' },
      '🏁 Carrera con el mismo lote y las mismas preguntas',
      h('span', { class: 'muted small' }, `${sc.items.length} ${sc.item_label_plural} × ${nq} preguntas · 1 llamada por modelo`),
    ),
    bar('d1', 'Microsoft-Decision-1', 'Sistema 1 · una sola pasada', D1_COLOR),
    bar('llm', r.label, 'LLM generativo · salida JSON', LLM_COLOR),
    h('div', { class: 'race-foot' }),
  );
  tickRace(box, sc, st);
  return box;
}

const secs = (ms) => `${fmt.num(ms / 1000, ms < 10000 ? 2 : 1)} s`;

function statsText(side, sc, st) {
  if (!side) return '…';
  if (side.failed) return '✗ error';
  const parts = [];
  if (side.latency_ms != null) parts.push(h('span', null, 'modelo ', h('b', null, fmt.ms(side.latency_ms))));
  if (side.cost?.eur != null) parts.push(h('span', null, ' · ', h('b', null, fmt.eur(side.cost.eur))));
  return parts.length ? parts : '✓';
}

/** Actualiza barras y tiempos sin rehacer el DOM (se llama en cada frame mientras corre). */
export function tickRace(box, sc, st) {
  const r = st.race;
  if (!box || !r) return;
  const now = performance.now() - r.t0;
  const d1ms = r.d1?.ms ?? now;
  const llmms = r.llm?.ms ?? now;
  const max = Math.max(d1ms, llmms, 400);
  for (const [key, ms, side] of [
    ['d1', d1ms, r.d1],
    ['llm', llmms, r.llm],
  ]) {
    const row = box.querySelector(`[data-race="${key}"]`);
    if (!row) continue;
    row.classList.toggle('running', !side);
    row.querySelector('.race-track i').style.transform = `scaleX(${Math.max(0.004, ms / max)})`;
    row.querySelector('.race-time').textContent = side?.failed ? 'error' : secs(ms);
    const stats = row.querySelector('.race-stats');
    if (side && !stats.dataset.done) {
      stats.replaceChildren(...[statsText(side, sc, st)].flat());
      stats.dataset.done = '1';
    }
  }
  const foot = box.querySelector('.race-foot');
  const s = raceStats(sc, st);
  if (!s || foot.dataset.done) {
    if (!s && !foot.dataset.done) foot.textContent = r.running ? `⏳ ${r.d1 ? `Decision-1 ya ha terminado; ${r.label} sigue generando…` : 'Las dos llamadas salen a la vez…'}` : r.error || '';
    return;
  }
  foot.dataset.done = '1';
  foot.replaceChildren(
    h('span', null, '⚡ ', h('b', null, fmt.times(s.speed)), ' más rápido'),
    s.cost ? h('span', null, '💶 ', h('b', null, fmt.times(s.cost)), ' más barato') : null,
    h('span', null, '🤝 coinciden ', h('b', null, `${s.agree}/${s.both}`), ' en la decisión principal'),
    s.ref ? h('span', { class: 'muted small' }, `🎯 frente a la referencia: Decision-1 ${s.d1ok}/${s.ref} · ${r.label} ${s.llmok}/${s.ref}`) : null,
  );
}
