// Página de un caso: cabecera, barra de herramientas, KPI, carrera y la vista animada (FLIP).
import { h, fmt, flip, toast } from './util.js';
import { S, caseState, eur } from './core.js';
import { t, tn } from './i18n.js';
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
  els.process = h('button', { class: 'btn primary', onclick: () => caseAction('process'), title: t('Procesar (barra espaciadora)') }, t('▶ Procesar'), ' ', h('kbd', null, t('Espacio')));
  els.modeBatch = h('button', { type: 'button', onclick: () => setMode('batch'), title: t('Todos los elementos en una sola llamada (B)') }, t('📦 Lote'), ' ', h('small', null, t('1 llamada')));
  els.modeSingle = h('button', { type: 'button', onclick: () => setMode('single'), title: t('Una llamada por elemento, en paralelo (B)') }, t('🔁 Uno a uno'));
  els.raceBtn = h('button', { class: 'btn race-btn', onclick: () => caseAction('race'), title: t('El mismo lote contra un LLM generativo (C)') }, t('🏁 Carrera'), ' ', h('kbd', null, 'C'));
  els.raceSel = h(
    'select',
    { 'aria-label': t('Modelo rival en la carrera'), onchange: (e) => (S.raceModel = e.target.value) },
    (S.config?.comparisons || []).map((c) => h('option', { value: c.id, selected: c.id === S.raceModel, title: c.label }, `vs ${c.label.split(' · ')[0]}`)),
  );
  els.thrVal = h('b', null, fmt.pct(S.threshold));
  els.thr = h('input', {
    type: 'range',
    min: 50,
    max: 99,
    step: 1,
    value: Math.round(S.threshold * 100),
    'aria-label': t('Umbral de confianza'),
    oninput: (e) => {
      S.threshold = Number(e.target.value) / 100;
      els.thrVal.textContent = fmt.pct(S.threshold);
      refresh();
    },
  });
  els.timer = h('span', { class: 'timer' });
  els.reset = h('button', { class: 'btn ghost', onclick: () => caseAction('reset'), title: t('Reiniciar el caso (R)') }, t('↺ Reiniciar'));
  els.kpis = h('div', { class: 'kpis' });
  els.raceSlot = h('div', { class: 'race-slot' });
  els.view = h('div', { class: 'view-host' });

  const head = h(
    'div',
    { class: 'case-head' },
    h('div', { class: 'case-icon' }, sc.icon),
    h('div', null, h('div', { class: 'case-kicker' }, t('Caso {n} · {sector}', { n: sc.order, sector: sc.sector })), h('h1', { class: 'case-title' }, sc.title), h('div', { class: 'case-headline' }, sc.headline)),
    h('div', { class: 'case-brand' }, t('Empresa ficticia'), h('b', null, sc.brand)),
  );
  const toolbar = h(
    'div',
    { class: 'toolbar' },
    els.process,
    h('div', { class: 'seg', role: 'group', 'aria-label': t('Modo de llamada') }, els.modeBatch, els.modeSingle),
    els.raceBtn,
    S.config?.comparisons?.length ? els.raceSel : null,
    h('span', { class: 'grow' }),
    h('label', { class: 'thr', title: t('Por debajo de esta confianza, la decisión pasa a revisión humana') }, t('Umbral'), els.thr, els.thrVal),
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
  const calls = m.calls || 0;
  const callsSub = m.wait_ms
    ? tn(calls, '{n} llamada · espera por RPM {ms}', '{n} llamadas · espera por RPM {ms}', { ms: fmt.ms(m.wait_ms) })
    : tn(calls, '{n} llamada', '{n} llamadas');
  const batchSub = m.decisions ? tn(m.decisions, '1 llamada · {n} decisión', '1 llamada · {n} decisiones') : t('tiempo en el modelo');
  return [
    kpi(t('Procesados'), `${done}/${n}`, st.busy ? t('procesando…') : wall != null ? t('en {tiempo} de reloj', { tiempo: fmt.ms(wall) }) : sc.item_label_plural, done === n ? 'good' : ''),
    kpi(single ? t('Latencia p50 por llamada') : t('Latencia de la llamada'), lat != null ? fmt.ms(lat) : '—', single ? callsSub : batchSub, 'accent'),
    kpi(
      t('Coste Decision-1'),
      done ? fmt.eur(st.cost.eur) : '—',
      done
        ? t('{coste} por 1.000 {items}', { coste: fmt.eur((st.cost.eur / done) * 1000), items: sc.item_label_plural })
        : t('{precio} $/M tokens · salida gratis', { precio: fmt.num(0.042, 3) }),
    ),
    kpi(
      t('Automatizado'),
      done ? fmt.pct(sum.automated / done) : '—',
      done
        ? t('{n} a {destino} · umbral {umbral}', { n: sum.review, destino: sc.review_label.toLowerCase(), umbral: fmt.pct(S.threshold) })
        : t('umbral {umbral}', { umbral: fmt.pct(S.threshold) }),
      done ? 'good' : '',
    ),
    kpi(t('Acierto vs referencia'), acc.n ? `${acc.ok}/${acc.n}` : '—', acc.n ? t('{pct} en la decisión principal', { pct: fmt.pct(acc.ok / acc.n) }) : t('etiquetas de referencia del caso')),
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
  const elapsed = st.run?.t0 ? (st.run.t1 ?? performance.now()) - st.run.t0 : null;
  cur.els.timer.textContent = elapsed != null ? `⏱ ${fmt.num(elapsed / 1000, 2)} s` : '';
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
    if (!resetCase(sc.id)) toast(t('Espera a que termine la ejecución en curso.'), 'info', 2500);
  } else if (action === 'mode') {
    setMode(S.mode === 'batch' ? 'single' : 'batch');
    toast(S.mode === 'batch' ? t('📦 Modo lote: todo en 1 llamada') : t('🔁 Modo uno a uno: 1 llamada por elemento'), 'info', 2000);
  }
}
