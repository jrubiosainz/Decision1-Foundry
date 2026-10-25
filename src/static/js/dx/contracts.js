// Caso 5 · Revisión de contratos: Legal, Privacidad y Finanzas hacen sus 20 preguntas cerradas sobre el mismo contrato.
// Una llamada por lista; la primera escribe el contrato en caché y las otras dos lo leen en paralelo.
import { h, fmt, pool, toast, openModal } from '../util.js';
import { api, errorText } from '../core.js';
import { t, tn } from '../i18n.js';
import { DX, changed, freshRun, startRun, endRun, track, reportError, caseHead, toolbar, paintTimer, kpi, runKpis, answerBlock, valueLabel, verdictMark, callFoot, caseNotes, paintNotes, showDoc } from './common.js';

const CONTRACTS_AT_ONCE = 2; // cada contrato lanza hasta 2 listas a la vez: 4 llamadas como máximo

const state = (sc) => (DX.st[sc.id] ||= { run: freshRun(), res: {}, cells: {}, busy: {}, err: {} });
const key = (it, cl) => `${it.id}:${cl.id}`;
const short = (it) => it.counterparty.split(/[\s,]/)[0];
const riskQ = (cl) => Object.keys(cl.questions).find((k) => cl.questions[k].type === 'score');
const goodValue = (q, v) => (q.type === 'predicate' ? v === (q.good ?? true) : (q.good || []).includes(v));
const labelOf = (q, v) => valueLabel(q, { type: q.type, value: v });
const ICON = { ok: '✓', bad: '✗', doubt: '?', unknown: '–', error: '!', busy: '', pending: '' };

/** ¿Sale la casilla del color esperado (verde si la respuesta esperada es aceptable, rojo si no)? */
function hitOf(it, cl, qk, cell) {
  const v = it.expected?.[cl.id]?.[qk];
  if (v === undefined || !cell) return null;
  return cell.status === (goodValue(cl.questions[qk], v) ? 'ok' : 'bad');
}

// ---------- Llamadas (fuera de la vista: siguen aunque se cambie de página) ----------

async function reviewList(sc, st, it, cl) {
  const k = key(it, cl);
  if (DX.st[sc.id] !== st || st.res[k] || st.busy[k]) return;
  st.busy[k] = true;
  delete st.err[k];
  changed(sc.id);
  try {
    const res = await api('/api/dx/decide', { case: sc.id, item: it.id, checklist: cl.id });
    if (DX.st[sc.id] !== st) return;
    track(st.run, res, `${short(it)} · ${cl.title}`);
    st.res[k] = res;
    st.cells[k] = Object.fromEntries((res.review?.cells || []).map((c) => [c.q, c]));
  } catch (e) {
    if (DX.st[sc.id] !== st) return;
    st.err[k] = e;
    reportError(e);
  } finally {
    if (DX.st[sc.id] === st) {
      st.busy[k] = false;
      changed(sc.id);
    }
  }
}

async function reviewContract(sc, st, it) {
  const [first, ...rest] = sc.checklists.filter((cl) => !st.res[key(it, cl)]);
  if (!first) return;
  await reviewList(sc, st, it, first);
  if (DX.st[sc.id] === st) await Promise.all(rest.map((cl) => reviewList(sc, st, it, cl)));
}

async function runContracts(sc, st, items) {
  const todo = items.filter((it) => sc.checklists.some((cl) => !st.res[key(it, cl)]));
  if (!todo.length) return toast(t('Ya está todo procesado. Pulsa R para reiniciar.'), 'info', 2500);
  startRun(st.run);
  changed(sc.id);
  try {
    await pool(todo, CONTRACTS_AT_ONCE, (it) => reviewContract(sc, st, it));
  } finally {
    if (DX.st[sc.id] === st) {
      endRun(st.run);
      changed(sc.id);
    }
  }
}

// ---------- Vista ----------

export function mountContracts(sc, stage, notes) {
  let st = state(sc);
  const els = { totals: {} };
  const cells = {}; // clave contrato:lista → { pregunta → botón }
  const cards = {};
  const perList = Object.keys(sc.checklists[0]?.questions || {}).length;
  const perContract = sc.checklists.reduce((n, cl) => n + Object.keys(cl.questions).length, 0);

  const wait = () => toast(t('Espera a que termine la ejecución en curso.'), 'info', 2500);
  const process = () => (st.run.busy ? wait() : runContracts(sc, st, sc.items));
  const reset = () => {
    if (st.run.busy) return wait();
    const { proj } = st;
    delete DX.st[sc.id];
    st = state(sc);
    st.proj = proj;
    changed(sc.id);
  };

  function context() {
    return h(
      'div',
      { class: 'dxg-context' },
      h(
        'div',
        { class: 'dxg-ctx-group' },
        h('span', { class: 'dxg-ctx-label' }, t('En cada llamada')),
        h('span', { class: 'dx-media m-text' }, t('📄 Contrato completo')),
        h('small', null, t('en caché')),
        h('span', { class: 'dx-media m-json' }, tn(perList, '✅ {n} pregunta cerrada', '✅ {n} preguntas cerradas')),
      ),
      h(
        'div',
        { class: 'dxg-ctx-group' },
        h('span', { class: 'dxg-ctx-label' }, t('Por contrato')),
        h('span', { class: 'small' }, tn(sc.checklists.length, '{n} llamada: la primera escribe el contrato en caché y las demás lo leen en paralelo', '{n} llamadas: la primera escribe el contrato en caché y las demás lo leen en paralelo')),
      ),
    );
  }

  // ---------- Tarjeta de cada contrato: riesgo global por departamento ----------
  function contractCard(it) {
    const c = (cards[it.id] = { status: h('div', { class: 'dxk-status' }) });
    c.btn = h('button', { class: 'btn sm', onclick: () => (st.run.busy ? wait() : runContracts(sc, st, [it])), title: t('Revisa solo este contrato') }, t('▶ Revisar'));
    c.el = h(
      'div',
      { class: 'dxk-contract' },
      h('div', { class: 'dxk-ct-head' }, h('span', { class: 'dxk-ct-icon' }, '📑'), h('div', null, h('b', null, it.title), h('span', { class: 'muted small' }, `${it.counterparty} · ${it.summary}`))),
      c.status,
      h('div', { class: 'dxk-ct-actions' }, h('button', { class: 'btn sm ghost', onclick: () => showDoc(sc, it.file, it.title) }, t('📄 Leer el contrato')), c.btn),
    );
    return c.el;
  }

  function riskStamp(it, cl) {
    const k = key(it, cl);
    const res = st.res[k];
    if (!res) return h('span', { class: `dx-stamp sm tone-info dxk-risk${st.busy[k] ? ' busy' : ''}`, title: cl.title }, `${cl.icon} ${st.busy[k] ? '…' : '—'}`);
    const qk = riskQ(cl);
    const q = cl.questions[qk];
    const a = res.answers?.[qk];
    const lvl = a?.type === 'score' ? a.value : null;
    const tone = lvl == null ? 'info' : lvl === 0 ? 'ok' : lvl >= q.levels.length - 1 ? 'bad' : 'warn';
    return h('span', { class: `dx-stamp sm tone-${tone} dxk-risk`, title: `${cl.title} · ${q.label}` }, `${cl.icon} ${valueLabel(q, a)}`);
  }

  function paintCard(it) {
    const c = cards[it.id];
    const keys = sc.checklists.map((cl) => key(it, cl));
    const busy = keys.some((k) => st.busy[k]);
    const done = keys.filter((k) => st.res[k]);
    const failed = keys.some((k) => st.err[k]);
    c.el.classList.toggle('busy', busy);
    c.el.classList.toggle('scanning', busy);
    c.btn.disabled = st.run.busy || done.length === keys.length;
    const red = done.reduce((n, k) => n + (st.res[k].review?.red || 0), 0);
    const doubt = done.reduce((n, k) => n + (st.res[k].review?.doubt || 0), 0);
    const line = busy
      ? h('span', { class: 'muted small' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), ' ', t('Consultando a la Decisions API…'))
      : failed
        ? h('span', { class: 'dxg-err', title: keys.map((k) => st.err[k] && errorText(st.err[k])).filter(Boolean)[0] }, t('⚠️ Error'))
        : done.length
          ? h('span', { class: 'small' }, h('b', null, t('🔴 {n} en rojo', { n: fmt.int(red) })), doubt ? ` · ${tn(doubt, '🟡 {n} dudosa', '🟡 {n} dudosas')}` : '')
          : h('span', { class: 'muted small' }, tn(perContract, '{n} comprobación pendiente', '{n} comprobaciones pendientes'));
    c.status.replaceChildren(h('div', { class: 'dxk-risks' }, sc.checklists.map((cl) => riskStamp(it, cl))), line);
  }

  // ---------- Matriz de cada lista: preguntas × contratos ----------
  function listPanel(cl) {
    const qs = Object.entries(cl.questions);
    return h(
      'section',
      { class: 'dxk-list', style: { '--n': sc.items.length } },
      h('header', { class: 'dxk-list-head' }, h('span', { class: 'dxk-list-icon' }, cl.icon), h('b', { title: cl.title }, cl.title)),
      h('div', { class: 'dxk-row dxk-cols' }, h('span'), sc.items.map((it) => h('span', { class: 'dxk-col', title: `${it.title} · ${it.counterparty}` }, short(it)))),
      qs.map(([qk, q]) =>
        h(
          'div',
          { class: `dxk-row${q.type === 'score' ? ' key' : ''}` },
          h('span', { class: 'dxk-q', title: q.instructions || '' }, q.label),
          sc.items.map((it) => {
            const b = h('button', { class: 'dxk-cell s-pending', onclick: () => openCell(it, cl, qk) });
            (cells[key(it, cl)] ||= {})[qk] = b;
            return b;
          }),
        ),
      ),
      h(
        'div',
        { class: 'dxk-row dxk-totals' },
        h('span', null, t('🔴 En rojo')),
        sc.items.map((it) => (els.totals[key(it, cl)] = h('span', { class: 'dxk-tot' }))),
      ),
    );
  }

  function paintList(it, cl) {
    const k = key(it, cl);
    const res = st.res[k];
    const map = st.cells[k] || {};
    for (const [qk, b] of Object.entries(cells[k] || {})) {
      const q = cl.questions[qk];
      const c = map[qk];
      const status = c?.status || (st.busy[k] ? 'busy' : st.err[k] ? 'error' : 'pending');
      const hit = hitOf(it, cl, qk, c);
      b.className = `dxk-cell s-${status}${hit === false ? ' miss' : ''}`;
      b.textContent = ICON[status] ?? '';
      b.disabled = !c;
      b.title = c ? `${q.label}: ${valueLabel(q, res.answers?.[qk])}${c.p == null ? '' : ` · ${t('Probabilidad de incumplir: {pct}', { pct: fmt.pct(c.p) })}`}` : q.label;
    }
    const tot = els.totals[k];
    if (tot) {
      tot.textContent = res ? fmt.int(res.review?.red || 0) : st.busy[k] ? '…' : '';
      tot.classList.toggle('bad', !!res?.review?.red);
    }
  }

  function openCell(it, cl, qk) {
    const k = key(it, cl);
    const res = st.res[k];
    const c = st.cells[k]?.[qk];
    if (!res || !c) return;
    const q = cl.questions[qk];
    const exp = it.expected?.[cl.id]?.[qk];
    const hit = hitOf(it, cl, qk, c);
    const verdict = {
      ok: t('🟢 En verde: no necesita revisión'),
      bad: t('🔴 En rojo: pasa al departamento'),
      doubt: t('🟡 Dudosa: la revisa una persona'),
      unknown: t('⚪ Sin respuesta: la revisa una persona'),
    }[c.status];
    openModal(
      h(
        'div',
        { class: 'dxk-detail' },
        h('div', { class: 'im-label' }, `${cl.icon} ${cl.title} · ${it.title}`),
        h('h2', null, q.label),
        q.instructions ? h('p', { class: 'muted small' }, q.instructions) : null,
        h('div', { class: `dxk-verdict s-${c.status}` }, h('b', null, verdict), c.p == null ? null : h('span', { class: 'lat' }, t('Probabilidad de incumplir: {pct}', { pct: fmt.pct(c.p) }))),
        answerBlock(q, res.answers?.[qk]),
        exp === undefined ? null : h('div', { class: 'dxg-exp' }, verdictMark(hit), hit ? t('Como se esperaba') : t('Se esperaba {valor}', { valor: labelOf(q, exp) })),
        h('div', { class: 'dxk-detail-actions' }, h('button', { class: 'btn sm', onclick: () => showDoc(sc, it.file, it.title) }, t('📄 Leer el contrato'))),
        callFoot(res, `${short(it)} · ${cl.title}`),
      ),
    );
  }

  // ---------- Resumen, KPI y notas ----------
  function summary() {
    let answered = 0;
    let green = 0;
    let red = 0;
    let doubt = 0;
    let ok = 0;
    for (const it of sc.items) {
      for (const cl of sc.checklists) {
        for (const [qk, c] of Object.entries(st.cells[key(it, cl)] || {})) {
          answered += 1;
          green += c.status === 'ok';
          red += c.status === 'bad';
          doubt += c.status === 'doubt' || c.status === 'unknown';
          ok += !!hitOf(it, cl, qk, c);
        }
      }
    }
    const done = sc.items.filter((it) => sc.checklists.every((cl) => st.res[key(it, cl)])).length;
    return {
      total: sc.items.length,
      done,
      answered,
      green,
      red,
      doubt,
      auto: answered ? green / answered : 0,
      autoLabel: t('🟢 Comprobaciones en verde'),
      ok,
      checked: answered,
      rows: answered
        ? [
            [t('🔴 Casillas en rojo'), fmt.int(red)],
            doubt ? [t('🟡 Casillas dudosas'), fmt.int(doubt)] : null,
            st.run.t1 && !st.run.busy ? [t('⏱ Tiempo total'), fmt.ms(st.run.t1 - st.run.t0)] : null,
          ].filter(Boolean)
        : [],
      how: t('Una llamada por lista: el texto del contrato y {n} preguntas cerradas. La primera lista escribe el contrato en caché y las demás lo leen en paralelo. Las casillas en rojo o dudosas llegan al abogado, al DPD o a Compras; el resto ya está comprobado.', { n: perList }),
    };
  }

  function paint() {
    if (DX.st[sc.id] !== st) st = state(sc);
    const s = summary();
    els.kpis.replaceChildren(
      kpi(
        t('Casillas en verde'),
        s.answered ? fmt.pct(s.auto) : '—',
        s.answered ? t('{ok}/{n} como se esperaba', { ok: fmt.int(s.ok), n: fmt.int(s.answered) }) : tn(perContract, '{n} comprobación por contrato', '{n} comprobaciones por contrato'),
        'accent',
      ),
      ...runKpis(st.run),
    );
    for (const it of sc.items) {
      paintCard(it);
      for (const cl of sc.checklists) paintList(it, cl);
    }
    els.btn.disabled = st.run.busy;
    paintNotes(notes, sc, st, s);
    paintTimer(els.timer, st.run);
  }

  els.kpis = h('div', { class: 'kpis' });
  els.btn = h('button', { class: 'btn primary', onclick: process, title: t('Revisa todos los contratos (Espacio)') }, t('▶ Revisar {n} {items}', { n: sc.items.length, items: sc.item_label_plural }), ' ', h('kbd', null, t('Espacio')));
  stage.replaceChildren(
    h(
      'div',
      { class: 'dx-case dxk' },
      caseHead(sc),
      toolbar(els, [els.btn], reset),
      els.kpis,
      context(),
      h('div', { class: 'dxk-contracts' }, sc.items.map(contractCard)),
      h('div', { class: 'dxk-lists' }, sc.checklists.map(listPanel)),
    ),
  );
  notes.replaceChildren(caseNotes(sc, st, () => paintNotes(notes, sc, st, summary())));
  paint();

  return {
    paint,
    tick: () => paintTimer(els.timer, st.run),
    process,
    reset,
  };
}
