// Cases 2, 3 and 4 · One call per image: expense receipts, brand creatives and inspection photos.
// The model answers the checks; the company's rules (policy, brand guidelines or risk matrix) pick the action.
import { h, fmt, pool, toast, openModal } from '../util.js';
import { api, errorText } from '../core.js';
import { t, tn, locale } from '../i18n.js';
import { DX, changed, img, cap, freshRun, startRun, endRun, track, reportError, caseHead, toolbar, paintTimer, kpi, runKpis, answerBlock, stamp, verdictMark, callFoot, caseNotes, paintNotes, docButton, thumb, zoom } from './common.js';

const CONCURRENCY = 4; // after the first call, which writes the cache
const UPLOAD = 'upload';
const MAX_SIDE = 1024;
const MAX_BYTES = 3 * 1024 * 1024;

const state = (sc) => (DX.st[sc.id] ||= { run: freshRun(), res: {}, busy: {}, err: {}, upload: null });
const dayFmt = (iso) => new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${iso}T12:00:00`));
const outcomeOf = (sc, res) => sc.outcomes[res?.assessment?.outcome] || null;

/** Does it match what was expected? In safety, the severity and the action are what count. */
function hitOf(sc, it, res) {
  const a = res?.assessment;
  if (!a || it.expected == null) return null;
  if (sc.kind === 'safety') return a.outcome === it.expected.outcome && a.severity?.level === it.expected.gravedad;
  return a.outcome === it.expected;
}

/** Title and subtitle of each item, depending on the case. */
function caption(sc, it) {
  if (it.id === UPLOAD) return [t('Tu foto'), t('Subida desde este navegador')];
  if (sc.kind === 'receipts') {
    const d = it.declared || {};
    const cat = sc.questions.categoria?.choices?.[d.categoria]?.label || d.categoria;
    return [d.empleado, `${fmt.eur(d.importe)} · ${cat}`];
  }
  if (sc.kind === 'creatives') return [it.title, `${it.channel} · ${it.format}`];
  return [it.site, it.zone];
}

// ---------- Calls (outside the view: they keep going even if the page changes) ----------

async function decideOne(sc, st, it) {
  if (DX.st[sc.id] !== st) return;
  st.busy[it.id] = true;
  delete st.err[it.id];
  changed(sc.id);
  try {
    const res = await api('/api/dx/decide', { case: sc.id, item: it.id });
    if (DX.st[sc.id] !== st) return;
    track(st.run, res, caption(sc, it).join(' · '));
    st.res[it.id] = res;
  } catch (e) {
    if (DX.st[sc.id] !== st) return;
    st.err[it.id] = e;
    reportError(e);
  } finally {
    if (DX.st[sc.id] === st) {
      st.busy[it.id] = false;
      changed(sc.id);
    }
  }
}

async function runAll(sc, st) {
  const todo = sc.items.filter((it) => !st.res[it.id]);
  if (!todo.length) return toast(t('Ya está todo procesado. Pulsa R para reiniciar.'), 'info', 2500);
  startRun(st.run);
  changed(sc.id);
  try {
    // The first call writes the shared context (policy, guidelines, references) to the cache; the rest read it.
    const [first, ...rest] = todo;
    await decideOne(sc, st, first);
    if (DX.st[sc.id] === st) await pool(rest, CONCURRENCY, (it) => decideOne(sc, st, it));
  } finally {
    if (DX.st[sc.id] === st) {
      endRun(st.run);
      changed(sc.id);
    }
  }
}

async function decideUpload(sc, st, src) {
  st.upload = { src, busy: true, res: null, err: null };
  changed(sc.id);
  const up = st.upload;
  try {
    const res = await api('/api/dx/decide', { case: sc.id, item: UPLOAD, image: src });
    if (st.upload !== up) return;
    track(st.run, res, t('Tu foto'));
    up.res = res;
  } catch (e) {
    if (st.upload !== up) return;
    up.err = e;
    reportError(e);
  } finally {
    if (st.upload === up) {
      up.busy = false;
      changed(sc.id);
    }
  }
}

/** Shrinks the photo to 1024 px on its longest side, as JPEG: fewer tokens, less waiting and under the 3 MB limit. */
async function shrink(file) {
  if (!file?.type?.startsWith('image/')) throw new Error(t('El archivo no es una imagen.'));
  const bmp = await createImageBitmap(file).catch(() => {
    throw new Error(t('No se ha podido leer la imagen.'));
  });
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = h('canvas', { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  const url = canvas.toDataURL('image/jpeg', 0.85);
  if (url.length * 0.75 > MAX_BYTES) throw new Error(t('La foto admite hasta {max} MB.', { max: 3 }));
  return url;
}

// ---------- Item detail ----------

function declaredBlock(sc, it, a) {
  const d = it.declared;
  if (!d) return null;
  const compare = Object.fromEntries((a.checks || []).filter((c) => c.rule === 'compare').map((c) => [c.q, c]));
  const catQ = sc.questions.categoria;
  const catLabel = (v) => catQ?.choices?.[v]?.label || v;
  const rows = [
    [t('Empleado'), d.empleado],
    [t('Concepto'), d.concepto],
    [t('Proyecto'), d.proyecto],
    [t('Importe'), fmt.eur(d.importe)],
    [t('Fecha'), dayFmt(d.fecha)],
    [t('Categoría'), catLabel(d.categoria), compare.categoria],
  ];
  return h(
    'div',
    { class: 'dxg-block' },
    h('div', { class: 'im-label' }, t('{ } Datos declarados (JSON en la misma petición)')),
    h(
      'dl',
      { class: 'dxg-declared' },
      rows.map(([k, v, c]) => [
        h('dt', null, k),
        h('dd', { class: c?.fired ? 'bad' : '' }, v, c?.fired ? h('span', { class: 'chip warn' }, t('en la foto: {valor}', { valor: catLabel(c.found) })) : null),
      ]),
    ),
  );
}

/** Rules in order: the first one with any alert wins; the last one is the default outcome. */
function chainBlock(sc, a) {
  if (!a.chain?.length) return null;
  const chosen = a.chain.findIndex((r) => r.fired);
  return h(
    'div',
    { class: 'dxg-block' },
    h('div', { class: 'im-label' }, t('⚙️ Reglas de la empresa, en orden')),
    h(
      'ol',
      { class: 'dxg-chain' },
      a.chain.map((r, i) => {
        const rule = (sc.rules || []).find((x) => x.id === r.id) || {};
        const cls = i === chosen ? 'won' : chosen >= 0 && i > chosen ? 'skip' : 'pass';
        return h(
          'li',
          { class: cls },
          h('div', { class: 'dxg-rule' }, stamp(sc.outcomes[r.outcome], 'sm'), h('span', null, rule.reason || r.id), h('span', { class: 'lat' }, fmt.pct(r.p))),
          r.checks.length
            ? h(
                'div',
                { class: 'dxg-rule-checks' },
                r.checks.map((c) => h('span', { class: `chip${c.fired ? ' warn' : ''}`, title: t('Probabilidad de incumplir: {pct}', { pct: fmt.pct(c.p_bad) }) }, c.fired ? '✗ ' : '✓ ', c.label)),
              )
            : null,
        );
      }),
    ),
  );
}

/** Risk matrix: the model's severity, the minimums set by the detected risks and the resulting action. */
function policyBlock(sc, a) {
  const pol = sc.policy;
  const sev = a.severity;
  if (!pol || !sev) return null;
  const floors = (a.checks || []).filter((c) => c.rule === 'floor');
  return h(
    'div',
    { class: 'dxg-block' },
    h('div', { class: 'im-label' }, `🧮 ${pol.label}`),
    h(
      'div',
      { class: 'dxg-sev' },
      h('span', null, t('Gravedad según el modelo')),
      h('b', null, sev.model_label ?? '—'),
      floors.length ? h('span', { class: 'dxg-sev-arrow' }, '→') : null,
      floors.length ? h('span', null, t('Gravedad aplicada')) : null,
      floors.length ? h('b', { class: sev.level > (sev.model ?? -1) ? 'raised' : '' }, sev.label ?? '—') : null,
    ),
    floors.length ? h('ul', { class: 'dxg-floors' }, floors.map((c) => h('li', { class: c.fired ? 'fired' : '' }, c.text, c.fired ? h('span', { class: 'chip warn' }, t('sube la gravedad')) : null))) : null,
    matrix(sc, a.rule),
  );
}

function matrix(sc, active) {
  const pol = sc.policy;
  const levels = sc.questions[pol.q].levels.map((l) => l.label);
  return h(
    'div',
    { class: 'dxg-matrix' },
    pol.rules.map((r, i) =>
      h(
        'div',
        { class: `dxg-mrow${i === active ? ' on' : ''}` },
        h('span', null, r.levels.map((lv) => levels[lv]).join(' / '), r.if ? h('small', null, ` + ${sc.questions[r.if]?.label || r.if}`) : null),
        stamp(sc.outcomes[r.outcome], 'sm'),
      ),
    ),
  );
}

function openDetail(sc, st, it) {
  const res = it.id === UPLOAD ? st.upload?.res : st.res[it.id];
  if (!res) return;
  const a = res.assessment || {};
  const o = outcomeOf(sc, res);
  const hit = hitOf(sc, it, res);
  const src = it.id === UPLOAD ? st.upload.src : img(it.image);
  const [title, sub] = caption(sc, it);
  const exp = it.expected;
  const expText = exp == null ? '' : sc.kind === 'safety' ? `${sc.outcomes[exp.outcome]?.stamp} · ${sc.questions[sc.policy.q].levels[exp.gravedad]?.label}` : sc.outcomes[exp]?.stamp;
  const chips = [...(a.flags || []).map((f) => h('span', { class: 'chip warn' }, f.text)), ...(a.infos || []).map((f) => h('span', { class: 'chip' }, f.text))];
  openModal(
    h(
      'div',
      { class: 'dxg-detail' },
      h('figure', { class: 'dxg-detail-fig' }, h('img', { src, alt: title || '' })),
      h(
        'div',
        { class: 'dxg-detail-body' },
        h('div', { class: 'im-label' }, `${sc.icon} ${sc.title}`),
        h('h2', null, title, h('small', null, sub)),
        h(
          'div',
          { class: 'dxg-verdict' },
          o ? stamp(o, 'lg') : h('span', { class: 'chip warn' }, t('Sin respuesta')),
          h('span', { class: 'lat' }, t('Confianza {pct}', { pct: fmt.pct(a.confidence) })),
          a.low_confidence ? h('span', { class: 'chip warn' }, t('Confianza baja')) : null,
          hit == null ? null : h('span', { class: 'dxg-exp' }, verdictMark(hit), hit ? t('Como se esperaba') : t('Se esperaba {outcome}', { outcome: expText })),
        ),
        h('p', { class: 'dxg-reason' }, a.reason || ''),
        chips.length ? h('div', { class: 'dxg-flags' }, chips) : null,
        declaredBlock(sc, it, a),
        sc.policy ? policyBlock(sc, a) : chainBlock(sc, a),
        h(
          'div',
          { class: 'dxg-block' },
          h('div', { class: 'im-label' }, t('🧠 Respuestas del modelo')),
          Object.entries(sc.questions).map(([name, q]) => answerBlock(q, res.answers?.[name], { declared: it.declared })),
        ),
        callFoot(res, title),
      ),
    ),
    { wide: true },
  );
}

// ---------- Vista ----------

export function mountGallery(sc, stage, notes) {
  let st = state(sc);
  const els = {};
  const cards = {};

  const process = () => {
    if (st.run.busy) return toast(t('Espera a que termine la ejecución en curso.'), 'info', 2500);
    runAll(sc, st);
  };
  const reset = () => {
    if (st.run.busy || st.upload?.busy) return toast(t('Espera a que termine la ejecución en curso.'), 'info', 2500);
    const { proj } = st;
    delete DX.st[sc.id];
    st = state(sc);
    st.proj = proj;
    changed(sc.id);
  };

  // ---------- Context: what travels in each call and the possible actions ----------
  function context() {
    const inputs = [h('span', { class: 'dx-media m-image' }, `🖼️ ${cap(sc.item_label)}`)];
    if (sc.kind === 'receipts') inputs.push(h('span', { class: 'dx-media m-json' }, t('{ } Datos declarados')));
    for (const r of sc.references || []) inputs.push(h('span', { class: 'dxg-ref' }, thumb(r.image, r.label), h('small', null, r.label)));
    if (sc.context_file) inputs.push(h('span', { class: 'dx-media m-text' }, docButton(sc, sc.context_file, sc.context_label), h('small', null, t('en caché'))));
    return h(
      'div',
      { class: 'dxg-context' },
      h('div', { class: 'dxg-ctx-group' }, h('span', { class: 'dxg-ctx-label' }, t('En cada llamada')), inputs),
      h('div', { class: 'dxg-ctx-group' }, h('span', { class: 'dxg-ctx-label' }, sc.policy ? sc.policy.label : t('Acciones')), sc.policy ? matrix(sc, -1) : Object.values(sc.outcomes).map((o) => stamp(o, 'sm'))),
    );
  }

  // ---------- Cards (built once; only their state changes) ----------
  function card(it) {
    const [title, sub] = caption(sc, it);
    const c = (cards[it.id] = { over: h('span', { class: 'dxg-over' }), mark: h('span', { class: 'dxg-mark' }), foot: h('span', { class: 'dxg-foot' }) });
    c.el = h(
      'button',
      {
        class: 'dxg-card',
        onclick: () => (st.res[it.id] ? openDetail(sc, st, it) : zoom(img(it.image), title)),
        title: t('Ver el detalle'),
      },
      h('span', { class: 'dxg-fig' }, h('img', { src: img(it.image), alt: title || '', loading: 'lazy' }), c.over, c.mark),
      h('span', { class: 'dxg-meta' }, h('b', null, title), h('span', { class: 'muted' }, sub)),
      c.foot,
    );
    return c.el;
  }

  function uploadCard() {
    const input = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', hidden: true, onchange: (e) => pick(e.target.files?.[0], e.target) });
    const c = (cards[UPLOAD] = { over: h('span', { class: 'dxg-over' }), mark: h('span', { class: 'dxg-mark' }), foot: h('span', { class: 'dxg-foot' }), input });
    c.img = h('img', { alt: t('Tu foto') });
    c.fig = h('span', { class: 'dxg-fig', role: 'button', tabindex: 0, onclick: () => (st.upload?.res ? openDetail(sc, st, { id: UPLOAD }) : input.click()) }, c.img, c.over, c.mark);
    c.empty = h('span', { class: 'dxg-drop' }, h('b', null, t('📷 Prueba con tu foto')), h('span', { class: 'muted small' }, t('Arrástrala aquí o pulsa para elegirla')));
    c.el = h(
      'div',
      {
        class: 'dxg-card dxg-upload',
        ondragover: (e) => (e.preventDefault(), c.el.classList.add('drag')),
        ondragleave: () => c.el.classList.remove('drag'),
        ondrop: (e) => {
          e.preventDefault();
          c.el.classList.remove('drag');
          pick(e.dataTransfer?.files?.[0]);
        },
      },
      input,
      c.fig,
      c.empty,
      h('span', { class: 'dxg-meta' }, h('b', null, t('Tu foto')), h('button', { class: 'btn sm', onclick: () => input.click() }, t('📷 Elegir foto'))),
      c.foot,
    );
    c.empty.addEventListener('click', () => input.click());
    return c.el;
  }

  async function pick(file, input) {
    if (input) input.value = '';
    if (!file) return;
    if (st.upload?.busy) return toast(t('Espera a que termine la ejecución en curso.'), 'info', 2500);
    try {
      decideUpload(sc, st, await shrink(file));
    } catch (e) {
      toast(e.message, 'error', 5000);
    }
  }

  function paintCard(c, res, busy, err, hit) {
    const o = outcomeOf(sc, res);
    const a = res?.assessment;
    c.el.classList.toggle('busy', !!busy);
    c.el.classList.toggle('scanning', !!busy);
    c.el.classList.toggle('done', !!res && !busy);
    c.el.classList.toggle('miss', hit === false);
    c.over.replaceChildren(...[busy ? h('span', { class: 'spinner', 'aria-hidden': 'true' }) : null, !busy && res ? stamp(o, '') || h('span', { class: 'chip warn' }, t('Sin respuesta')) : null].filter(Boolean));
    c.mark.replaceChildren(...[!busy && res ? verdictMark(hit) : null].filter(Boolean));
    const flags = a?.flags || [];
    const foot = busy
      ? [h('span', { class: 'muted small' }, t('Consultando a la Decisions API…'))]
      : err
        ? [h('span', { class: 'dxg-err', title: errorText(err) }, t('⚠️ Error'))]
        : res
          ? [
              ...flags.slice(0, 2).map((f) => h('span', { class: 'chip warn', title: f.text }, f.text)),
              flags.length > 2 ? h('span', { class: 'chip' }, `+${flags.length - 2}`) : null,
              a?.low_confidence ? h('span', { class: 'chip warn' }, t('Confianza baja')) : null,
              sc.kind === 'safety' && a?.severity?.label ? h('span', { class: 'chip' }, a.severity.label) : null,
              h('span', { class: 'grow' }),
              h('span', { class: `lat${res.usage?.cached_input_tokens ? ' cached' : ''}`, title: res.usage?.cached_input_tokens ? t('💾 {n} en caché', { n: fmt.int(res.usage.cached_input_tokens) }) : '' }, `${res.usage?.cached_input_tokens ? '💾 ' : ''}${fmt.ms(res.latency_ms)}`),
            ]
          : [];
    c.foot.replaceChildren(...foot.filter(Boolean));
  }

  // ---------- Summary, KPIs and notes ----------
  function summary() {
    const done = sc.items.filter((it) => st.res[it.id]);
    const outs = done.map((it) => st.res[it.id].assessment?.outcome);
    const autoN = outs.filter((k) => sc.outcomes[k]?.auto).length;
    const ok = done.filter((it) => hitOf(sc, it, st.res[it.id])).length;
    const counts = Object.entries(sc.outcomes)
      .map(([k, o]) => [o, outs.filter((x) => x === k).length])
      .filter(([, n]) => n);
    const flags = done.reduce((n, it) => n + (st.res[it.id].assessment?.flags?.length || 0), 0);
    const nq = Object.keys(sc.questions).length;
    const how = {
      receipts: t('Una llamada por {item}: la foto, los datos declarados en JSON y la política en caché. El modelo responde {n} comprobaciones y las reglas de la política, en orden, deciden la acción. Si la confianza baja del 70 %, revisa una persona.', { item: sc.item_label, n: nq }),
      creatives: t('Una llamada por {item}: la imagen, el logotipo y la paleta oficiales y la guía de marca en caché. El modelo responde {n} comprobaciones y las reglas de la guía deciden si se publica, se corrige o pasa a Legal.', { item: sc.item_label, n: nq }),
      safety: t('Una llamada por {item}. El modelo puntúa la gravedad y detecta los riesgos; cada riesgo fija una gravedad mínima y la matriz de riesgos decide la acción. Pruébalo con una foto tuya.', { item: sc.item_label }),
    }[sc.kind];
    return {
      total: sc.items.length,
      done: done.length,
      autoN,
      auto: done.length ? autoN / done.length : 0,
      autoLabel: t('🤖 Sin intervención humana'),
      ok,
      checked: done.length,
      rows: done.length
        ? [
            ...counts.map(([o, n]) => [stamp(o, 'sm'), fmt.int(n)]),
            sc.kind === 'safety' ? null : [t('🚩 Alertas detectadas'), fmt.int(flags)],
            st.run.t1 && !st.run.busy ? [t('⏱ Tiempo total'), fmt.ms(st.run.t1 - st.run.t0)] : null,
          ].filter(Boolean)
        : [],
      how,
    };
  }

  function paint() {
    if (DX.st[sc.id] !== st) st = state(sc);
    const s = summary();
    els.kpis.replaceChildren(
      kpi(t('Sin intervención'), s.done ? `${fmt.int(s.autoN)}/${fmt.int(s.done)}` : '—', s.done ? t('{ok}/{n} como se esperaba', { ok: fmt.int(s.ok), n: fmt.int(s.done) }) : tn(sc.items.length, '{n} ejemplo', '{n} ejemplos'), 'accent'),
      ...runKpis(st.run),
    );
    for (const it of sc.items) paintCard(cards[it.id], st.res[it.id], st.busy[it.id], st.err[it.id], hitOf(sc, it, st.res[it.id]));
    const up = cards[UPLOAD];
    if (up) {
      const u = st.upload;
      up.el.classList.toggle('has', !!u);
      if (u && up.img.getAttribute('src') !== u.src) up.img.src = u.src;
      paintCard(up, u?.res, u?.busy, u?.err, null);
    }
    els.btn.disabled = st.run.busy;
    paintNotes(notes, sc, st, s);
    paintTimer(els.timer, st.run);
  }

  els.kpis = h('div', { class: 'kpis' });
  els.btn = h('button', { class: 'btn primary', onclick: process, title: t('Procesa todos los ejemplos (Espacio)') }, t('▶ Procesar {n} {items}', { n: sc.items.length, items: sc.item_label_plural }), ' ', h('kbd', null, t('Espacio')));
  const grid = h('div', { class: `dxg-grid k-${sc.kind}` }, sc.items.map(card), sc.upload ? uploadCard() : null);
  stage.replaceChildren(h('div', { class: `dx-case dxg k-${sc.kind}` }, caseHead(sc), toolbar(els, [els.btn], reset), els.kpis, context(), grid));
  notes.replaceChildren(caseNotes(sc, st, () => paintNotes(notes, sc, st, summary())));
  paint();

  return {
    paint,
    tick: () => paintTimer(els.timer, st.run),
    process,
    reset,
  };
}
