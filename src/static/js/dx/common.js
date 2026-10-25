// Piezas comunes de la pestaña «OpenAI Decisions API»: estado, cabecera, respuestas, documentos y notas.
import { h, fmt, rich, esc, median, openModal } from '../util.js';
import { fail } from '../core.js';
import { t } from '../i18n.js';
import { note, noteList, showJson } from '../notes.js';
import { addSession } from '../run.js';

// Contenido de /api/dx y estado de cada caso. index.js lo rellena y repinta la vista con onChange.
export const DX = { data: null, cases: [], byId: {}, st: {}, onChange: null };

export const changed = (id) => DX.onChange?.(id);
export const img = (rel) => `/img/dx/${rel}`;
export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const HOURS_FTE = 140; // horas productivas al mes por persona (aproximación)

let lastError = 0;
/** Avisa de un error de la API una sola vez aunque fallen a la vez todas las llamadas en paralelo. */
export function reportError(e) {
  if (Date.now() - lastError > 3000) fail(e);
  lastError = Date.now();
}

// ---------- Contadores de una ejecución ----------

export const freshRun = () => ({
  busy: false,
  t0: 0,
  t1: 0,
  calls: 0,
  answers: 0,
  lats: [],
  tokens: { input: 0, cached: 0, written: 0 },
  cost: { usd: 0, eur: 0, eur_nocache: 0 },
  last: null,
});

export function startRun(run) {
  run.busy = true;
  run.t0 = performance.now();
  run.t1 = 0;
}

export function endRun(run) {
  run.busy = false;
  run.t1 = performance.now();
}

/** Suma una llamada real a los contadores del caso y de la sesión (los pasos que se saltan no llaman al modelo). */
export function track(run, res, label) {
  if (!res || res.skipped) return;
  const n = Object.keys(res.answers || {}).length;
  addSession(1, n, res.cost, [res.latency_ms]);
  const u = res.usage || {};
  run.calls += 1;
  run.answers += n;
  run.lats.push(res.latency_ms);
  run.tokens.input += u.input_tokens || 0;
  run.tokens.cached += u.cached_input_tokens || 0;
  run.tokens.written += u.cache_write_tokens || 0;
  run.cost.usd += res.cost?.usd || 0;
  run.cost.eur += res.cost?.eur || 0;
  run.cost.eur_nocache += res.cost?.eur_nocache || 0;
  run.last = { label, request: res.request, response: res.response };
}

export const cachedShare = (run) => (run.tokens.input ? run.tokens.cached / run.tokens.input : 0);

// ---------- Cabecera, barra y KPI ----------

export function caseHead(sc) {
  return h(
    'div',
    { class: 'case-head' },
    h('div', { class: 'case-icon' }, sc.icon),
    h('div', null, h('div', { class: 'case-kicker' }, t('Caso {n} · {sector}', { n: sc.order, sector: sc.sector })), h('h1', { class: 'case-title' }, sc.title), h('div', { class: 'case-headline' }, sc.headline)),
    h('div', { class: 'case-brand' }, t('Empresa ficticia'), h('b', null, sc.brand)),
  );
}

export function toolbar(els, buttons, onReset) {
  els.timer = h('span', { class: 'timer' });
  els.reset = h('button', { class: 'btn ghost', onclick: onReset, title: t('Reiniciar el caso (R)') }, t('↺ Reiniciar'));
  return h('div', { class: 'toolbar' }, ...buttons, h('span', { class: 'grow' }), els.timer, els.reset);
}

export function paintTimer(el, run) {
  if (!el) return;
  const ms = run.busy ? performance.now() - run.t0 : run.t1 ? run.t1 - run.t0 : null;
  el.textContent = ms == null ? '' : `⏱ ${fmt.ms(ms)}`;
  el.classList.toggle('live', run.busy);
}

export const kpi = (label, value, sub, cls = '') =>
  h('div', { class: `kpi ${cls}` }, h('div', { class: 'kpi-label' }, label), h('div', { class: 'kpi-value' }, value), h('div', { class: 'kpi-sub' }, sub));

/** KPI de llamadas, latencia, caché y coste, iguales en todos los casos. */
export function runKpis(run) {
  const share = cachedShare(run);
  const saved = run.cost.eur_nocache ? 1 - run.cost.eur / run.cost.eur_nocache : 0;
  return [
    kpi(t('Llamadas a la API'), fmt.int(run.calls), t('{n} respuestas', { n: fmt.int(run.answers) })),
    kpi(t('Latencia p50'), run.lats.length ? fmt.ms(median(run.lats)) : '—', run.lats.length ? t('máx. {ms}', { ms: fmt.ms(Math.max(...run.lats)) }) : ''),
    kpi(t('Tokens en caché'), run.tokens.input ? fmt.pct(share) : '—', t('{n} de entrada', { n: fmt.int(run.tokens.input) }), share > 0 ? 'accent' : ''),
    kpi(t('Coste real'), run.calls ? fmt.eur(run.cost.eur) : '—', saved >= 0.005 ? t('{pct} menos con caché', { pct: fmt.pct(saved) }) : t('la salida es gratis'), 'good'),
  ];
}

// ---------- Respuestas ----------

const answered = (q, a) => !!a && a.type === q.type;

/** Etiqueta de una respuesta: Sí/No, la opción elegida o el nivel de la escala. */
export function valueLabel(q, a) {
  if (!answered(q, a)) return a?.type === 'refusal' ? t('Sin respuesta (rechazada)') : t('Sin respuesta');
  if (a.type === 'predicate') return a.value ? t('Sí') : t('No');
  if (a.type === 'choice') return q.choices?.[a.value]?.label || String(a.value);
  return q.levels?.[a.value]?.label || a.label || String(a.value);
}

/** Probabilidad de la respuesta elegida. */
export function chosenP(a) {
  if (!a) return null;
  if (a.type === 'predicate') return a.value ? a.p : 1 - a.p;
  return a.probs?.find((x) => x.key === a.value)?.p ?? a.confidence ?? null;
}

/** ¿Es una respuesta aceptable según la definición de la pregunta? null si la pregunta no lo dice. */
export function isGood(q, a, declared) {
  if (!answered(q, a)) return null;
  if (q.compare && declared?.[q.compare] != null) return a.value === declared[q.compare];
  if (!('good' in q)) return null;
  if (q.type === 'predicate') return a.value === q.good;
  return Array.isArray(q.good) ? q.good.includes(a.value) : null;
}

const optLabel = (q, key) => (q.type === 'choice' ? q.choices?.[key]?.label : q.levels?.[key]?.label) ?? String(key);

const meter = (p) => h('span', { class: 'bar dx-meter' }, h('i', { style: { width: `${Math.max(0.6, (p || 0) * 100)}%` } }));

/** Una línea por pregunta: etiqueta, respuesta y probabilidad de esa respuesta. */
export function answerRow(q, a, { declared, key = false } = {}) {
  const good = isGood(q, a, declared);
  const p = answered(q, a) ? chosenP(a) : null;
  return h(
    'div',
    { class: `dx-ans${key ? ' key' : ''}`, title: q.instructions || '' },
    h('span', { class: 'dx-ans-q' }, q.label),
    h('span', { class: `dx-val${good === true ? ' good' : good === false ? ' bad' : ''}${answered(q, a) ? '' : ' none'}` }, valueLabel(q, a)),
    p == null ? h('span') : meter(p),
    h('span', { class: `bar-val${p != null && p < 0.7 ? ' low' : ''}` }, p == null ? '' : fmt.pct(p)),
  );
}

/** Respuesta completa con todas sus probabilidades (ventanas de detalle). */
export function answerBlock(q, a, { declared } = {}) {
  const head = answerRow(q, a, { declared });
  if (!answered(q, a) || a.type === 'predicate') return h('div', { class: 'dx-ansblock' }, head);
  const probs = (a.probs || []).filter((x) => x.p >= 0.005 || x.key === a.value).slice(0, 6);
  return h(
    'div',
    { class: 'dx-ansblock' },
    head,
    h(
      'div',
      { class: 'bars dx-subbars' },
      probs.map((x) =>
        h(
          'div',
          { class: `bar-row${x.key === a.value ? ' on' : ''}` },
          h('span', { class: 'bar-label' }, optLabel(q, x.key)),
          h('span', { class: 'bar' }, h('i', { style: { width: `${Math.max(0.6, x.p * 100)}%` } })),
          h('span', { class: 'bar-val' }, fmt.pct(x.p, x.p > 0 && x.p < 0.1 ? 1 : 0)),
        ),
      ),
    ),
  );
}

export function stamp(o, cls = '') {
  if (!o) return null;
  return h('span', { class: `dx-stamp tone-${o.tone || 'info'} ${cls}` }, `${o.icon || ''} ${o.stamp || o.label || ''}`.trim());
}

export const verdictMark = (ok) => (ok == null ? null : h('span', { class: `dx-check ${ok ? 'ok' : 'ko'}`, title: ok ? t('Coincide con el resultado esperado') : t('No coincide con el resultado esperado') }, ok ? '✓' : '✗'));

export function callFoot(res, label) {
  if (!res || res.skipped) return null;
  const u = res.usage || {};
  return h(
    'div',
    { class: 'dx-foot' },
    h('span', { class: 'lat' }, `⏱ ${fmt.ms(res.latency_ms)}`),
    h('span', { class: 'lat' }, t('{n} tokens', { n: fmt.int(u.input_tokens) })),
    u.cached_input_tokens ? h('span', { class: 'lat cached' }, t('💾 {n} en caché', { n: fmt.int(u.cached_input_tokens) })) : null,
    u.cache_write_tokens ? h('span', { class: 'lat' }, t('✍️ {n} a la caché', { n: fmt.int(u.cache_write_tokens) })) : null,
    h('span', { class: 'lat' }, fmt.eur(res.cost?.eur)),
    h('span', { class: 'grow' }),
    jsonButtons({ label, request: res.request, response: res.response }),
  );
}

export function jsonButtons(last) {
  if (!last?.request) return null;
  return h(
    'span',
    { class: 'how-btns' },
    h('button', { class: 'btn sm', onclick: () => showJson(t('📤 Petición · {label}', { label: last.label }), last.request) }, t('📤 Petición')),
    h('button', { class: 'btn sm', onclick: () => showJson(t('📥 Respuesta · {label}', { label: last.label }), last.response) }, t('📥 Respuesta')),
  );
}

// ---------- Documentos (Markdown sencillo y seguro) ----------

export function md(src) {
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
  const out = [];
  let block = null;
  const flush = () => {
    if (!block) return;
    if (block.type === 'p') out.push(`<p>${inline(block.lines.join(' '))}</p>`);
    else if (block.type === 'table') {
      const rows = block.lines.map((cells, i) => `<tr>${cells.map((c) => (i ? `<td>${inline(c)}</td>` : `<th>${inline(c)}</th>`)).join('')}</tr>`);
      out.push(`<table>${rows.join('')}</table>`);
    } else out.push(`<${block.type}>${block.lines.map((l) => `<li>${inline(l)}</li>`).join('')}</${block.type}>`);
    block = null;
  };
  const push = (type, item) => {
    if (block?.type !== type) {
      flush();
      block = { type, lines: [] };
    }
    block.lines.push(item);
  };
  for (const raw of String(src || '').split('\n')) {
    const line = raw.trim();
    let m;
    if (!line) flush();
    else if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      flush();
      const lv = Math.min(5, m[1].length + 1);
      out.push(`<h${lv}>${inline(m[2])}</h${lv}>`);
    } else if (line.startsWith('|')) {
      const cells = line.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) push('table', cells);
    } else if ((m = line.match(/^[-*]\s+(.*)$/))) push('ul', m[1]);
    else if ((m = line.match(/^\d+\.\s+(.*)$/))) push('ol', m[1]);
    else push('p', line);
  }
  flush();
  return out.join('');
}

export function showDoc(sc, file, title) {
  openModal(h('div', { class: 'dx-doc' }, h('div', { class: 'im-label' }, title), h('div', { class: 'dx-md', html: md(sc.docs?.[file] || '') })), { wide: true });
}

export const docButton = (sc, file, label) => h('button', { class: 'btn sm', onclick: () => showDoc(sc, file, label) }, `📄 ${label}`);

export function zoom(src, caption) {
  openModal(h('figure', { class: 'dx-zoom' }, h('img', { src, alt: caption || '' }), caption ? h('figcaption', null, caption) : null), { wide: true });
}

export const thumb = (rel, caption, cls = '') =>
  h('button', { class: `dx-thumb ${cls}`, title: caption || '', onclick: (e) => (e.stopPropagation(), zoom(img(rel), caption)) }, h('img', { src: img(rel), alt: caption || '', loading: 'lazy' }));

/** Entrada de un paso coloreada según su tipo: imagen, texto, JSON o regla determinista. */
export function mediaChip(sc, key, { short = false } = {}) {
  const inp = sc.inputs?.[key];
  if (!inp) return null;
  return h('span', { class: `dx-media m-${inp.media || 'text'}${short ? ' short' : ''}`, title: inp.label }, short ? inp.icon : `${inp.icon} ${inp.label}`);
}

/** Pasos de una cascada agrupados por columnas: cada paso en la primera profundidad a la que se puede llegar. */
export function cascadeColumns(sc) {
  const byId = Object.fromEntries(sc.steps.map((s) => [s.id, s]));
  const first = sc.steps[0]?.id;
  const depth = { [first]: 0 };
  const queue = [first];
  while (queue.length) {
    const id = queue.shift();
    for (const r of byId[id]?.route || []) {
      if (r.next && !(r.next in depth)) {
        depth[r.next] = depth[id] + 1;
        queue.push(r.next);
      }
    }
  }
  const cols = [];
  for (const s of sc.steps) (cols[depth[s.id] ?? 0] ||= []).push(s);
  return cols.filter(Boolean);
}

// ---------- Notas del presentador ----------

const line = (label, value, cls = '') => h('div', { class: `nrow ${cls}` }, h('span', null, label), h('b', null, value));

export function caseNotes(sc, st, onProj) {
  const n = sc.notes || {};
  const sv = n.savings || {};
  st.proj ||= { volume: sv.volume_month || 0, minutes: sv.minutes_per_item || 0, eurHour: sv.eur_hour || 0 };
  const field = (key, label, step, suffix) =>
    h(
      'label',
      { class: 'proj-field' },
      h('span', null, label),
      h(
        'span',
        { class: 'proj-input' },
        h('input', {
          type: 'number',
          min: 0,
          step,
          value: st.proj[key],
          oninput: (e) => {
            st.proj[key] = Math.max(0, Number(e.target.value) || 0);
            onProj();
          },
        }),
        suffix ? h('small', null, suffix) : null,
      ),
    );
  return h(
    'div',
    { class: 'notes-case' },
    h('div', { class: 'notes-kicker' }, t('Caso {n} · notas para el presentador', { n: sc.order })),
    note('🎯', t('El reto'), h('p', null, rich(n.reto || ''))),
    note('👁️', t('La solución con la Decisions API'), h('p', null, rich(n.solucion || ''))),
    note('🧠', t('Por qué es un nuevo paradigma'), h('p', null, rich(n.paradigma || ''))),
    note('🧩', t('Qué aprovecha de la API'), noteList((n.capacidades || []).map((c) => rich(c)))),
    note('🏢', t('Dónde aplica'), h('div', { class: 'applies' }, (n.aplica_a || []).map((a) => h('span', { class: 'apply' }, a)))),
    note('📊', t('Resultado de esta ejecución'), h('div', { dataset: { slot: 'run' } })),
    note(
      '💶',
      t('Proyección mensual'),
      h(
        'div',
        { class: 'proj-grid' },
        field('volume', t('{items} al mes', { items: cap(sc.item_label_plural) }), sc.kind === 'contracts' ? 10 : 1000),
        field('minutes', t('Minutos por {item} hoy', { item: sc.item_label }), 0.5, 'min'),
        field('eurHour', t('Coste por hora'), 1, '€/h'),
      ),
      h('div', { class: 'proj-out', dataset: { slot: 'proj' } }),
    ),
    note('🔧', t('Cómo funciona'), h('div', { dataset: { slot: 'how' } })),
  );
}

/** sum = {total, done, auto (0–1), autoLabel, ok, checked, rows: [[etiqueta, valor]], how} */
export function paintNotes(root, sc, st, sum) {
  if (!root) return;
  const slot = (k) => root.querySelector(`[data-slot="${k}"]`);
  const run = st.run;
  const rows = !sum.done
    ? [h('p', { class: 'muted small' }, run.busy ? t('⏳ Procesando…') : t('Pulsa ▶ (o la barra espaciadora) para ver el resultado.'))]
    : [
        line(t('✅ Procesados'), `${fmt.int(sum.done)}/${fmt.int(sum.total)}`),
        line(sum.autoLabel || t('🤖 Resueltos sin intervención'), fmt.pct(sum.auto), 'hi'),
        sum.checked ? line(t('🎯 Como se esperaba'), `${fmt.int(sum.ok)}/${fmt.int(sum.checked)}`) : null,
        ...(sum.rows || []).map(([label, value]) => line(label, value)),
        line(t('📞 Llamadas · p50'), `${fmt.int(run.calls)} · ${fmt.ms(median(run.lats))}`),
        line(t('💾 Tokens en caché'), t('{pct} de {n}', { pct: fmt.pct(cachedShare(run)), n: fmt.int(run.tokens.input) })),
        line(t('💶 Coste real · sin caché'), `${fmt.eur(run.cost.eur)} · ${fmt.eur(run.cost.eur_nocache)}`),
      ];
  slot('run')?.replaceChildren(...rows.filter(Boolean));
  slot('proj')?.replaceChildren(projection(sc, st, sum));
  slot('how')?.replaceChildren(how(st, sum.how));
}

function projection(sc, st, sum) {
  const p = st.proj;
  if (!sum.done || st.run.busy) return h('p', { class: 'muted small' }, t('Se calcula con los datos reales de la ejecución: automatización conseguida y coste medido de la Decisions API.'));
  const perItem = st.run.cost.eur / sum.done;
  const hours = (p.volume * sum.auto * p.minutes) / 60;
  return h(
    'div',
    null,
    h('div', { class: 'big' }, h('b', null, fmt.eur(hours * p.eurHour)), h('span', null, t('al mes en tiempo liberado'))),
    line(t('⏱ Horas liberadas'), `${fmt.int(hours)} h · ≈ ${fmt.num(hours / HOURS_FTE, 1)} FTE`),
    line(t('🤖 Automatización aplicada'), fmt.pct(sum.auto)),
    line(t('🖼️ Coste de la Decisions API'), t('{importe} al mes', { importe: fmt.eur(p.volume * perItem) })),
    line(t('Por {item}', { item: sc.item_label }), fmt.eur(perItem)),
  );
}

function how(st, text) {
  return h(
    'div',
    { class: 'how' },
    h('code', null, `POST …/openai/v1/decisions · ${DX.data?.model || ''}`),
    text ? h('p', { class: 'small' }, text) : null,
    h('p', { class: 'small muted' }, t('Tres tipos de pregunta: predicate (sí/no), choice (opciones descritas) y score (niveles ordenados). Cada respuesta trae su probabilidad y la salida no se cobra.')),
    jsonButtons(st.run.last),
  );
}
