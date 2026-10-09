// Página de un caso: cabecera, barra de herramientas, KPI, carrera y la vista animada (FLIP).
import { h, fmt, flip, toast } from './util.js';
import { S, caseState, eur } from './core.js';
import { VIEWS } from './views/index.js';
import { runCase, runRace, resetCase } from './run.js';
import { renderRace, tickRace } from './race.js';
import { renderCaseNotes, updateCaseNotes } from './notes.js';
import { openItem } from './itemmodal.js';

let cur = null;
let raf = 0;
let looping = false;

const ctxOf = (sc) => ({ sc, st: caseState(sc.id), threshold: S.threshold, onItem: (id) => openItem(sc, caseState(sc.id), id), eur });

export const currentCase = () => cur?.sc || null;

export function unmountCase() {
  cur = null;
}

export function mountCase(sc, stage, notes) {
  const view = VIEWS[sc.view];
  const els = {};
  els.process = h('button', { class: 'btn primary', onclick: () => caseAction('process'), title: 'Procesar (barra espaciadora)' }, '▶ Procesar ', h('kbd', null, 'Espacio'));
  els.modeBatch = h('button', { type: 'button', onclick: () => setMode('batch'), title: 'Todos los elementos en una sola llamada (B)' }, '📦 Lote ', h('small', null, '1 llamada'));
  els.modeSingle = h('button', { type: 'button', onclick: () => setMode('single'), title: 'Una llamada por elemento, en paralelo (B)' }, '🔁 Uno a uno');
  els.raceBtn = h('button', { class: 'btn race-btn', onclick: () => caseAction('race'), title: 'El mismo lote contra un LLM generativo (C)' }, '🏁 Carrera ', h('kbd', null, 'C'));
  els.raceSel = h(
    'select',
    { 'aria-label': 'Modelo rival en la carrera', onchange: (e) => (S.raceModel = e.target.value) },
    (S.config?.comparisons || []).map((c) => h('option', { value: c.id, selected: c.id === S.raceModel, title: c.label }, `vs ${c.label.split(' · ')[0]}`)),
  );
  els.thrVal = h('b', null, fmt.pct(S.threshold));
  els.thr = h('input', {
    type: 'range',
    min: 50,
    max: 99,
    step: 1,
    value: Math.round(S.threshold * 100),
    'aria-label': 'Umbral de confianza',
    oninput: (e) => {
      S.threshold = Number(e.target.value) / 100;
      els.thrVal.textContent = fmt.pct(S.threshold);
      refresh();
    },
  });
  els.timer = h('span', { class: 'timer' });
  els.reset = h('button', { class: 'btn ghost', onclick: () => caseAction('reset'), title: 'Reiniciar el caso (R)' }, '↺ Reiniciar');
  els.kpis = h('div', { class: 'kpis' });
  els.raceSlot = h('div', { class: 'race-slot' });
  els.view = h('div', { class: 'view-host' });

  const head = h(
    'div',
    { class: 'case-head' },
    h('div', { class: 'case-icon' }, sc.icon),
    h('div', null, h('div', { class: 'case-kicker' }, `Caso ${sc.order} · ${sc.sector}`), h('h1', { class: 'case-title' }, sc.title), h('div', { class: 'case-headline' }, sc.headline)),
    h('div', { class: 'case-brand' }, 'Empresa ficticia', h('b', null, sc.brand)),
  );
  const toolbar = h(
    'div',
    { class: 'toolbar' },
    els.process,
    h('div', { class: 'seg', role: 'group', 'aria-label': 'Modo de llamada' }, els.modeBatch, els.modeSingle),
    els.raceBtn,
    S.config?.comparisons?.length ? els.raceSel : null,
    h('span', { class: 'grow' }),
    h('label', { class: 'thr', title: 'Por debajo de esta confianza, la decisión pasa a revisión humana' }, 'Umbral', els.thr, els.thrVal),
    els.timer,
    els.reset,
  );
  stage.replaceChildren(h('div', { class: 'case', dataset: { case: sc.id } }, head, toolbar, els.kpis, els.raceSlot, els.view));
  const notesRoot = renderCaseNotes(sc, () => paintNotes());
  notes.replaceChildren(notesRoot);
  cur = { sc, view, els, notesRoot };
  paint();
}

export function refresh() {
  if (!cur || raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    paint();
  });
}

function kpi(label, value, sub, cls = '') {
  return h('div', { class: `kpi ${cls}` }, h('div', { class: 'kpi-label' }, label), h('div', { class: 'kpi-value' }, value), h('div', { class: 'kpi-sub' }, sub));
}

function accuracy(sc, st) {
  let ok = 0;
  let n = 0;
  for (const it of sc.items) {
    const a = st.results[it.id]?.[sc.primary];
    const exp = it.expected?.[sc.primary];
    if (!a || exp == null) continue;
    n++;
    if (a.value === exp) ok++;
  }
  return { ok, n };
}

function kpis(sc, st, sum) {
  const n = sc.items.length;
  const done = sum.processed;
  const m = st.meta || {};
  const single = m.mode === 'single';
  const lat = single ? m.p50 : m.latency_ms;
  const wall = st.run?.t1 ? st.run.t1 - st.run.t0 : null;
  const acc = accuracy(sc, st);
  return [
    kpi('Procesados', `${done}/${n}`, st.busy ? 'procesando…' : wall != null ? `en ${fmt.ms(wall)} de reloj` : sc.item_label_plural, done === n ? 'good' : ''),
    kpi(
      single ? 'Latencia p50 por llamada' : 'Latencia de la llamada',
      lat != null ? fmt.ms(lat) : '—',
      single ? `${m.calls || 0} llamadas${m.wait_ms ? ` · espera por RPM ${fmt.ms(m.wait_ms)}` : ''}` : m.decisions ? `1 llamada · ${fmt.int(m.decisions)} decisiones` : 'tiempo en el modelo',
      'accent',
    ),
    kpi('Coste Decision-1', done ? fmt.eur(st.cost.eur) : '—', done ? `${fmt.eur((st.cost.eur / done) * 1000)} por 1.000 ${sc.item_label_plural}` : '0,042 $/M tokens · salida gratis'),
    kpi(
      'Automatizado',
      done ? fmt.pct(sum.automated / done) : '—',
      done ? `${sum.review} a ${sc.review_label.toLowerCase()} · umbral ${fmt.pct(S.threshold)}` : `umbral ${fmt.pct(S.threshold)}`,
      done ? 'good' : '',
    ),
    kpi('Acierto vs referencia', acc.n ? `${acc.ok}/${acc.n}` : '—', acc.n ? `${fmt.pct(acc.ok / acc.n)} en la decisión principal` : 'etiquetas de referencia del caso'),
  ];
}

function paintNotes() {
  if (!cur) return;
  const ctx = ctxOf(cur.sc);
  updateCaseNotes(cur.notesRoot, cur.sc, ctx.st, cur.view.summary(ctx));
}

function paint() {
  if (!cur) return;
  const { sc, view, els } = cur;
  const ctx = ctxOf(sc);
  const st = ctx.st;
  const racing = !!st.race?.running;
  els.process.disabled = st.busy || racing;
  els.raceBtn.disabled = st.busy || racing || !S.config?.comparisons?.length;
  els.reset.disabled = st.busy || racing;
  els.modeBatch.classList.toggle('on', S.mode === 'batch');
  els.modeSingle.classList.toggle('on', S.mode === 'single');
  els.modeBatch.setAttribute('aria-pressed', String(S.mode === 'batch'));
  els.modeSingle.setAttribute('aria-pressed', String(S.mode === 'single'));

  flip(els.view, () => els.view.replaceChildren(view.render(ctx)), { stagger: st.meta?.mode === 'batch' ? 45 : 0 });
  const sum = view.summary(ctx);
  els.kpis.replaceChildren(...kpis(sc, st, sum));
  const race = renderRace(sc, st);
  els.raceSlot.replaceChildren(...(race ? [race] : []));
  updateCaseNotes(cur.notesRoot, sc, st, sum);
  tickTimer();
  if ((st.busy || racing) && !looping) {
    looping = true;
    requestAnimationFrame(loop);
  }
}

function tickTimer() {
  const st = caseState(cur.sc.id);
  const t = st.run?.t0 ? (st.run.t1 ?? performance.now()) - st.run.t0 : null;
  cur.els.timer.textContent = t != null ? `⏱ ${fmt.num(t / 1000, 2)} s` : '';
  cur.els.timer.classList.toggle('live', !!st.busy);
}

function loop() {
  if (!cur) {
    looping = false;
    return;
  }
  const st = caseState(cur.sc.id);
  tickTimer();
  if (st.race) tickRace(cur.els.raceSlot.firstElementChild, cur.sc, st);
  if (st.busy || st.race?.running) requestAnimationFrame(loop);
  else looping = false;
}

export function setMode(mode) {
  S.mode = mode === 'single' ? 'single' : 'batch';
  refresh();
}

export function caseAction(action) {
  if (!cur) return;
  const { sc } = cur;
  const st = caseState(sc.id);
  if (action === 'process') {
    if (!st.busy && !st.race?.running) runCase(sc);
  } else if (action === 'race') {
    if (!st.busy && !st.race?.running) runRace(sc, S.raceModel);
  } else if (action === 'reset') {
    if (!resetCase(sc.id)) toast('Espera a que termine la ejecución en curso.', 'info', 2500);
  } else if (action === 'mode') {
    setMode(S.mode === 'batch' ? 'single' : 'batch');
    toast(S.mode === 'batch' ? '📦 Modo lote: todo en 1 llamada' : '🔁 Modo uno a uno: 1 llamada por elemento', 'info', 2000);
  }
}
