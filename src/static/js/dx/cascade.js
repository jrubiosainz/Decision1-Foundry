// Case 1 · Claims cascade: each call's answer picks the next one, with image and text steps interleaved.
import { h, fmt, median, pool, toast } from '../util.js';
import { api, errorText } from '../core.js';
import { t, tn, locale } from '../i18n.js';
import { DX, changed, img, freshRun, startRun, endRun, track, reportError, caseHead, toolbar, paintTimer, kpi, runKpis, answerRow, stamp, verdictMark, callFoot, caseNotes, paintNotes, mediaChip, thumb, docButton, cascadeColumns } from './common.js';
import { mediaLegend } from './intro.js';

const CONCURRENCY = 6; // "Resolve all" launches the claims at once; each one advances step by step.

const state = (sc) => (DX.st[sc.id] ||= { run: freshRun(), sel: sc.items[0]?.id, claims: {}, active: 0 });
const valuesOf = (answers) =>
  Object.fromEntries(
    Object.entries(answers || {})
      .filter(([, a]) => 'value' in a)
      .map(([q, a]) => [q, a.value]),
  );
const pathOf = (c) => (c?.steps || []).map((s) => s.id);
const hitOf = (it, c) => !!c?.outcome && c.outcome === it.expected?.outcome && pathOf(c).join() === (it.expected?.path || []).join();
const pending = (c) => !c || (!c.busy && !c.outcome);
const dayFmt = (iso) => new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).format(new Date(`${iso}T12:00:00`));
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const price = (v) => new Intl.NumberFormat(locale(), { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);

/** Walks a claim through the cascade: one call per step until it reaches an outcome. */
async function resolve(sc, st, item) {
  const c = (st.claims[item.id] = { steps: [], outcome: null, busy: true, error: null, t0: performance.now(), t1: 0 });
  if (!st.active++) startRun(st.run);
  changed(sc.id);
  const prior = {};
  let step = sc.steps[0].id;
  try {
    for (let n = 0; step && n < sc.steps.length; n++) {
      const entry = { id: step, busy: true, t0: performance.now(), res: null, route: null };
      c.steps.push(entry);
      changed(sc.id);
      const res = await api('/api/dx/decide', { case: sc.id, item: item.id, step, prior });
      if (DX.st[sc.id] !== st) return;
      track(st.run, res, `${item.id} · ${step}`);
      Object.assign(entry, { busy: false, res, route: res.route || { outcome: 'revision', reason: '' } });
      if (!res.skipped) prior[step] = valuesOf(res.answers);
      step = entry.route.next || null;
      if (!step) c.outcome = entry.route.outcome || 'revision';
    }
    c.outcome ||= 'revision';
  } catch (e) {
    if (DX.st[sc.id] !== st) return;
    c.steps = c.steps.filter((s) => !s.busy);
    c.error = e;
    reportError(e);
  } finally {
    if (DX.st[sc.id] === st) {
      c.busy = false;
      c.t1 = performance.now();
      if (!--st.active) endRun(st.run);
      changed(sc.id);
    }
  }
}

export function mountCascade(sc, stage, notes) {
  let st = state(sc);
  const items = Object.fromEntries(sc.items.map((it) => [it.id, it]));
  const steps = Object.fromEntries(sc.steps.map((s) => [s.id, s]));
  const cols = cascadeColumns(sc);
  const plazo = sc.steps.flatMap((s) => s.route).find((r) => r.rule === 'plazo');
  const els = { head: {}, preview: {}, ins: {}, cards: new WeakMap(), live: null };

  const nonePending = () => {
    if (!st.active) toast(t('Ya están todas resueltas. Pulsa R para reiniciar.'), 'info', 2500);
  };
  const one = () => {
    let id = pending(st.claims[st.sel]) ? st.sel : null;
    if (!id) {
      const i = sc.items.findIndex((it) => it.id === st.sel);
      const next = [...sc.items.slice(i + 1), ...sc.items.slice(0, i)].find((it) => pending(st.claims[it.id]));
      if (!next) return nonePending();
      id = st.sel = next.id;
    }
    resolve(sc, st, items[id]);
  };
  const all = () => {
    const todo = sc.items.filter((it) => pending(st.claims[it.id]));
    if (!todo.length) return nonePending();
    pool(todo, CONCURRENCY, (it) => resolve(sc, st, it));
  };
  const reset = () => {
    if (st.active) return toast(t('Espera a que termine la ejecución en curso.'), 'info', 2500);
    const { proj, sel } = st;
    delete DX.st[sc.id];
    st = state(sc);
    Object.assign(st, { proj, sel });
    changed(sc.id);
  };
  const select = (id) => {
    st.sel = id;
    paint();
  };

  // ---------- Claim list (built once; only the path and the outcome change) ----------
  const rows = {};
  const list = h(
    'div',
    { class: 'dxc-list' },
    sc.items.map((it) => {
      const prod = sc.products[it.product] || {};
      const r = (rows[it.id] = { path: h('span', { class: 'dxc-path' }), result: h('span', { class: 'dxc-res' }) });
      r.el = h(
        'button',
        { class: 'dxc-row', onclick: () => select(it.id) },
        h('img', { src: img(it.photo), alt: '', loading: 'lazy' }),
        h('span', { class: 'dxc-row-main' }, h('b', null, it.customer), h('span', { class: 'dxc-row-sub' }, prod.name), r.path),
        r.result,
      );
      return r.el;
    }),
  );

  function paintList() {
    for (const it of sc.items) {
      const r = rows[it.id];
      const c = st.claims[it.id];
      const on = st.sel === it.id;
      r.el.classList.toggle('on', on);
      r.el.classList.toggle('busy', !!c?.busy);
      r.el.setAttribute('aria-pressed', String(on));
      const pills = c?.steps.length
        ? c.steps.flatMap((s, i) => [i ? h('span', { class: 'dxc-sep' }, '›') : null, h('span', { class: `dxc-pill${s.busy ? ' busy' : ''}${s.res?.skipped ? ' skip' : ''}` }, s.id)])
        : [h('span', { class: 'muted small' }, c?.error ? t('⚠️ Error') : t('Pendiente'))];
      r.path.replaceChildren(...pills.filter(Boolean));
      const o = c?.outcome && sc.outcomes[c.outcome];
      const res = c?.busy ? [h('span', { class: 'spinner', 'aria-hidden': 'true' })] : o ? [h('span', { class: `dxc-oc tone-${o.tone || 'info'}`, title: o.label }, o.icon), verdictMark(hitOf(it, c))] : [];
      r.result.replaceChildren(...res.filter(Boolean));
    }
  }

  // ---------- Detail of the selected claim ----------
  function header(it) {
    const prod = sc.products[it.product] || {};
    const days = daysBetween(it.delivered, it.claimed);
    const hist = it.history || {};
    return h(
      'div',
      { class: 'dxc-head' },
      h('div', { class: 'dxc-who' }, h('b', null, it.customer), h('span', null, `${prod.name} · ${price(prod.price)}`), h('span', { class: 'muted' }, t('Pedido {id}', { id: it.order }))),
      h(
        'div',
        { class: 'dxc-facts' },
        h('span', { class: 'chip' }, t('📦 Entregado el {fecha}', { fecha: dayFmt(it.delivered) })),
        h('span', { class: `chip${plazo && days > plazo.max_days ? ' warn' : ''}` }, tn(days, '📨 Reclamado {n} día después', '📨 Reclamado {n} días después')),
        h('span', { class: 'chip' }, tn(hist.antiguedad_meses, 'Cliente desde hace {n} mes', 'Cliente desde hace {n} meses')),
        h('span', { class: 'chip' }, tn(hist.pedidos_12m, '{n} pedido en 12 meses', '{n} pedidos en 12 meses')),
        h('span', { class: `chip${hist.reclamaciones_12m >= 3 ? ' warn' : ''}` }, tn(hist.reclamaciones_12m, '{n} reclamación', '{n} reclamaciones')),
        h('span', { class: 'chip' }, tn(hist.devoluciones_12m, '{n} devolución', '{n} devoluciones')),
      ),
    );
  }

  /** An input as the step sees it: the image, the text, the manual or the data the model receives. */
  function inputView(it, key) {
    const inp = sc.inputs[key];
    const prod = sc.products[it.product] || {};
    if (!inp) return null;
    if (inp.media === 'image') {
      const rel = { foto: it.photo, catalogo: prod.image, entrega: it.delivery_photo }[key];
      return h('figure', { class: `dxc-in m-image${rel ? '' : ' none'}` }, rel ? thumb(rel, inp.label) : h('span', { class: 'dxc-nofig' }, t('Sin foto')), h('figcaption', null, inp.label));
    }
    if (key === 'texto') return h('div', { class: 'dxc-in m-text' }, h('span', { class: 'dxc-in-label' }, `${inp.icon} ${inp.label}`), h('span', { class: 'dxc-quote', title: it.text }, t('«{texto}»', { texto: it.text })));
    if (key === 'manual' && prod.manual) return h('div', { class: 'dxc-in m-text' }, docButton(sc, prod.manual, inp.label));
    return h('div', { class: 'dxc-in' }, mediaChip(sc, key));
  }

  function preview(it) {
    return h(
      'div',
      { class: 'dxc-preview' },
      h(
        'div',
        { class: 'dxc-preview-figs' },
        ['foto', 'catalogo', 'entrega'].map((k) => inputView(it, k)),
      ),
      inputView(it, 'texto'),
    );
  }

  function subway(c) {
    const seen = new Map((c?.steps || []).map((s) => [s.id, s]));
    const node = (s) => {
      const e = seen.get(s.id);
      const cls = !e ? 'off' : e.busy ? 'busy' : e.res?.skipped ? 'skip' : 'done';
      return h('span', { class: `dxc-node ${cls}`, title: s.title }, h('b', null, s.id), ` ${s.icon}`);
    };
    const arrow = () => h('span', { class: 'dxc-arrow', 'aria-hidden': 'true' }, '→');
    const parts = cols.flatMap((col, i) => [i ? arrow() : null, h('span', { class: 'dxc-col' }, col.map(node))]);
    const o = c?.outcome && sc.outcomes[c.outcome];
    return h('div', { class: 'dxc-map' }, parts, arrow(), o ? stamp(o, 'sm') : h('span', { class: 'dxc-node off' }, '?'), mediaLegend());
  }

  const check = (ck) =>
    h('div', { class: `dxc-check${ck.fired ? ' fired' : ''}` }, h('span', null, `⚙️ ${ck.label}`), h('b', null, ck.text), h('span', { class: `dx-check ${ck.fired ? 'ko' : 'ok'}` }, ck.fired ? '✗' : '✓'));

  function routeLine(r) {
    if (!r) return null;
    const next = r.next && steps[r.next];
    return h(
      'div',
      { class: `dxc-route${r.low_confidence ? ' low' : ''}` },
      h('span', { class: 'dxc-route-arrow', 'aria-hidden': 'true' }, '↳'),
      next ? h('span', { class: 'dxc-next' }, h('b', null, next.id), ` ${next.icon} ${next.title}`) : stamp(sc.outcomes[r.outcome], 'sm'),
      h('span', { class: 'dxc-reason' }, r.reason),
      r.low_confidence ? h('span', { class: 'chip warn' }, t('Confianza baja')) : null,
    );
  }

  function stepCard(it, e) {
    if (!e.busy && els.cards.has(e)) return els.cards.get(e);
    const s = steps[e.id];
    const key = `${it.id}:${e.id}`;
    const ins = (els.ins[key] ||= h(
      'div',
      { class: 'dxc-ins' },
      s.inputs.map((k) => inputView(it, k)),
    ));
    const head = h('div', { class: 'dxc-step-head' }, h('span', { class: 'dxc-step-id' }, s.id), h('b', null, `${s.icon} ${s.title}`), h('span', { class: 'dxc-chips' }, s.inputs.map((k) => mediaChip(sc, k, { short: true }))));
    if (e.busy) {
      const live = h('span', { class: 'lat' });
      els.live = { el: live, t0: e.t0 };
      return h('li', { class: 'dxc-step busy scanning' }, head, h('div', { class: 'dxc-step-body' }, ins, h('div', { class: 'dxc-wait' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), t('Consultando a la Decisions API…'), live)));
    }
    const r = e.route;
    const out = e.res?.skipped
      ? h('div', { class: 'dxc-out' }, h('div', { class: 'dxc-skip' }, t('⏭️ Paso sin llamada al modelo')), routeLine(r))
      : h(
          'div',
          { class: 'dxc-out' },
          Object.entries(s.questions).map(([name, q]) => answerRow(q, e.res.answers?.[name], { key: name === r?.q })),
          (r?.checks || []).map(check),
          routeLine(r),
        );
    const card = h('li', { class: `dxc-step${e.res?.skipped ? ' skipped' : ''}` }, head, h('div', { class: 'dxc-step-body' }, ins, out), callFoot(e.res, `${it.id} · ${s.id}`));
    els.cards.set(e, card);
    return card;
  }

  function final(it, c) {
    if (c?.error && !c.busy) return h('div', { class: 'dxc-error' }, `⚠️ ${errorText(c.error)}`, ' ', h('span', { class: 'muted' }, t('Pulsa ▶ para reintentar.')));
    if (!c?.outcome || c.busy) return null;
    const o = sc.outcomes[c.outcome] || {};
    const hit = hitOf(it, c);
    const exp = it.expected || {};
    const calls = c.steps.filter((s) => s.res && !s.res.skipped).length;
    const cost = c.steps.reduce((n, s) => n + (s.res?.cost?.eur || 0), 0);
    return h(
      'div',
      { class: `dxc-final tone-${o.tone || 'info'}` },
      stamp(o, 'lg'),
      h(
        'div',
        { class: 'dxc-final-body' },
        h('div', null, o.desc || ''),
        h(
          'div',
          { class: 'dxc-final-meta' },
          verdictMark(hit),
          h('span', null, hit ? t('Como se esperaba') : t('Se esperaba {path} → {outcome}', { path: (exp.path || []).join(' → '), outcome: sc.outcomes[exp.outcome]?.label || exp.outcome })),
          h('span', { class: 'lat' }, tn(calls, '{n} llamada', '{n} llamadas')),
          h('span', { class: 'lat' }, `⏱ ${fmt.ms(c.t1 - c.t0)}`),
          h('span', { class: 'lat' }, fmt.eur(cost)),
        ),
      ),
    );
  }

  function paintDetail() {
    const it = items[st.sel] || sc.items[0];
    const c = st.claims[it.id];
    els.live = null;
    const body = c?.steps.length ? [h('ol', { class: 'dxc-steps' }, c.steps.map((e) => stepCard(it, e)))] : [(els.preview[it.id] ||= preview(it)), h('p', { class: 'dxc-hint muted' }, t('Pulsa ▶ Resolver (o la barra espaciadora): cada respuesta decide qué se pregunta después.'))];
    els.detail.replaceChildren(...[(els.head[it.id] ||= header(it)), subway(c), ...body, final(it, c)].filter(Boolean));
  }

  // ---------- Summary, KPIs and notes ----------
  function summary() {
    const done = sc.items.filter((it) => st.claims[it.id]?.outcome && !st.claims[it.id].busy);
    const claims = done.map((it) => st.claims[it.id]);
    const autoN = claims.filter((c) => sc.outcomes[c.outcome]?.auto).length;
    const stepsN = claims.reduce((n, c) => n + c.steps.length, 0);
    return {
      total: sc.items.length,
      done: done.length,
      autoN,
      auto: done.length ? autoN / done.length : 0,
      autoLabel: t('🤖 Resueltas sin intervención'),
      ok: done.filter((it) => hitOf(it, st.claims[it.id])).length,
      checked: done.length,
      avgSteps: done.length ? stepsN / done.length : 0,
      rows: done.length
        ? [
            [t('⛓️ Pasos por {item}', { item: sc.item_label }), fmt.num(stepsN / done.length, 1)],
            [t('⏱ Tiempo por {item} (mediana)', { item: sc.item_label }), fmt.ms(median(claims.map((c) => c.t1 - c.t0)))],
          ]
        : [],
      how: t('Cada paso es una llamada con sus propias entradas: fotos, relato, manual o datos del pedido. Su respuesta y reglas deterministas, como el plazo de 30 días, eligen el paso siguiente; lo dudoso pasa a una persona.'),
    };
  }

  function paintKpis(s) {
    els.kpis.replaceChildren(
      kpi(t('Sin intervención'), s.done ? `${fmt.int(s.autoN)}/${fmt.int(s.done)}` : '—', s.done ? t('{n} pasos de media', { n: fmt.num(s.avgSteps, 1) }) : t('{n} reclamaciones de ejemplo', { n: sc.items.length }), 'accent'),
      ...runKpis(st.run),
    );
  }

  function paint() {
    if (DX.st[sc.id] !== st) st = state(sc);
    const s = summary();
    paintKpis(s);
    paintList();
    paintDetail();
    paintNotes(notes, sc, st, s);
    paintTimer(els.timer, st.run);
  }

  els.kpis = h('div', { class: 'kpis' });
  els.detail = h('section', { class: 'dxc-detail' });
  const btnOne = h('button', { class: 'btn primary', onclick: one, title: t('Resuelve la reclamación seleccionada (Espacio)') }, t('▶ Resolver'), ' ', h('kbd', null, t('Espacio')));
  const btnAll = h('button', { class: 'btn', onclick: all, title: t('Lanza a la vez todas las pendientes') }, t('⏩ Resolver todas'));
  stage.replaceChildren(h('div', { class: 'dx-case dxc' }, caseHead(sc), toolbar(els, [btnOne, btnAll], reset), els.kpis, h('div', { class: 'dxc-main' }, list, els.detail)));
  notes.replaceChildren(caseNotes(sc, st, () => paintNotes(notes, sc, st, summary())));
  paint();

  return {
    paint,
    tick() {
      paintTimer(els.timer, st.run);
      if (els.live?.el.isConnected) els.live.el.textContent = fmt.ms(performance.now() - els.live.t0);
    },
    process: one,
    reset,
  };
}
