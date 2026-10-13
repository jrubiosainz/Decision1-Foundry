// Panel derecho de cada caso: el porqué, el resultado de la ejecución y la proyección mensual.
import { h, fmt, rich, openModal, jsonHtml, copyText } from './util.js';
import { S, caseState, eur } from './core.js';
import { t, tn } from './i18n.js';
import { rivalLabel } from './race.js';

const HOURS_FTE = 140; // horas productivas al mes por persona (aproximación)
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function showJson(title, value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  openModal(
    h(
      'div',
      { class: 'json-modal' },
      h('div', { class: 'json-head' }, h('h2', null, title), h('button', { class: 'btn', onclick: () => copyText(text) }, t('📋 Copiar'))),
      h('pre', { class: 'json', html: jsonHtml(value) }),
    ),
    { wide: true },
  );
}

export const note = (icon, title, ...body) => h('section', { class: 'note' }, h('h3', null, h('span', { class: 'note-icon' }, icon), title), ...body);
export const noteList = (items) => h('ul', { class: 'note-list' }, items.map((item) => h('li', null, ...[item].flat())));
const section = note;
const line = (label, value, cls = '') => h('div', { class: `nrow ${cls}` }, h('span', null, label), h('b', null, value));

export function renderCaseNotes(sc, onProj) {
  const st = caseState(sc.id);
  const sv = sc.notes.savings || {};
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
  const humanTime = sv.minutes_per_item > 0;
  return h(
    'div',
    { class: 'notes-case' },
    h('div', { class: 'notes-kicker' }, t('Caso {n} · notas para el presentador', { n: sc.order })),
    section('🎯', t('El reto'), h('p', null, rich(sc.notes.reto))),
    section('⚡', t('La solución con Decision-1'), h('p', null, rich(sc.notes.solucion))),
    section('🧠', t('Por qué es un nuevo paradigma'), h('p', null, rich(sc.notes.paradigma))),
    section('🏢', t('Dónde aplica'), h('div', { class: 'applies' }, (sc.notes.aplica_a || []).map((a) => h('span', { class: 'apply' }, a)))),
    section('📊', t('Resultado de esta ejecución'), h('div', { class: 'run-rows', dataset: { slot: 'run' } })),
    section(
      '💶',
      t('Proyección mensual'),
      h(
        'div',
        { class: 'proj-grid' },
        field('volume', t('{items} al mes', { items: cap(sc.item_label_plural) }), 1000),
        humanTime ? field('minutes', t('Minutos por {item} hoy', { item: sc.item_label }), 0.5, 'min') : null,
        humanTime ? field('eurHour', t('Coste por hora'), 1, '€/h') : null,
      ),
      h('div', { class: 'proj-out', dataset: { slot: 'proj' } }),
    ),
    section('🔧', t('Cómo funciona'), h('div', { dataset: { slot: 'how' } })),
  );
}

function runRows(sc, st, sum) {
  if (!sum.processed) return [h('p', { class: 'muted' }, st.busy ? t('⏳ Procesando…') : t('Pulsa ▶ Procesar (o la barra espaciadora) para ver el resultado.'))];
  return [
    line(t('✅ Procesados'), `${sum.processed}/${sc.items.length}`),
    line(t('🤖 Automatizados'), `${sum.automated} · ${fmt.pct(sum.automated / sum.processed)}`, 'hi'),
    ...sum.rows.map((r) => line(`${r.icon} ${r.label}`, String(r.value))),
  ];
}

function projection(sc, st, sum) {
  const p = st.proj;
  const n = sum.processed;
  if (!n || st.busy) return h('p', { class: 'muted small' }, t('Se calcula con los datos reales de la ejecución: automatización conseguida y coste medido de Decision-1.'));
  const auto = sum.automated / n;
  const d1Month = p.volume * (st.cost.eur / n);
  const out = [];
  if (sum.economics) {
    const e = sum.economics;
    const base = p.volume * eur(e.perReqBase);
    const routed = p.volume * eur(e.perReqRouter);
    out.push(
      h('div', { class: 'big' }, h('b', null, fmt.eur(base - routed)), h('span', null, t('al mes en inferencia (−{pct})', { pct: fmt.pct(e.saving) }))),
      line(t('🧠 Todo al modelo grande'), fmt.eur(base)),
      line(t('🔀 Con router Decision-1'), fmt.eur(routed)),
      line(t('⚡ De ello, Decision-1'), fmt.eur(d1Month)),
    );
  } else if (p.minutes > 0) {
    const hours = (p.volume * auto * p.minutes) / 60;
    out.push(
      h('div', { class: 'big' }, h('b', null, fmt.eur(hours * p.eurHour)), h('span', null, t('al mes en tiempo liberado'))),
      line(t('⏱ Horas liberadas'), `${fmt.int(hours)} h · ≈ ${fmt.num(hours / HOURS_FTE, 1)} FTE`),
      line(t('🤖 Automatización aplicada'), fmt.pct(auto)),
      line(t('⚡ Coste de Decision-1'), t('{importe} al mes', { importe: fmt.eur(d1Month) })),
    );
  } else {
    out.push(line(t('⚡ Coste de Decision-1'), t('{importe} al mes', { importe: fmt.eur(d1Month) })));
  }
  if (st.llm?.cost?.eur != null && !st.race?.running) {
    const nl = Object.keys(st.llm.results || {}).length || n;
    const llmMonth = p.volume * (st.llm.cost.eur / nl);
    out.push(
      line(t('🐢 Mismas decisiones con {modelo}', { modelo: rivalLabel(st.llm.model) }), t('{importe} al mes', { importe: fmt.eur(llmMonth) })),
      line(t('💡 Decision-1 sale'), t('{veces} más barato', { veces: fmt.times(llmMonth / d1Month) }), 'hi'),
    );
  } else {
    out.push(h('p', { class: 'muted small' }, t('🏁 Lanza la carrera para añadir el coste de hacerlo con un LLM.')));
  }
  return h('div', null, out);
}

/** Etiqueta de la última llamada: se compone al pintar, run.js solo guarda ids y contadores. */
function lastLabel(last) {
  if (last.mode === 'single') return t('Última llamada · {id}', { id: last.id });
  return tn(last.decisions || 0, '1 llamada · {n} decisión', '1 llamada · {n} decisiones');
}

function how(sc, st) {
  const nq = Object.keys(sc.questions).length;
  const n = sc.items.length;
  const m = st.meta || {};
  const desc =
    m.mode === 'single'
      ? [
          t('Modo uno a uno: una llamada por {item} con {nq} preguntas (hasta {par} en paralelo).', { item: sc.item_label, nq, par: sc.concurrency || 4 }),
          tn(m.calls || 0, '{n} llamada en total.', '{n} llamadas en total.'),
        ].join(' ')
      : t('Modo lote: una sola llamada con {preguntas} preguntas ({n} {items} × {nq}). Cada pregunta lleva el contexto de su {item}.', {
          preguntas: fmt.int(n * nq),
          n,
          items: sc.item_label_plural,
          nq,
          item: sc.item_label,
        });
  return h(
    'div',
    { class: 'how' },
    h('code', null, `POST …/providers/microsoft/v1/systemone · ${S.config?.decision?.deployment || 'decision-1'}`),
    h('p', { class: 'small' }, desc),
    h('p', { class: 'small muted' }, t('Tres tipos de pregunta: choice (elegir entre criterios), score (escala ordenada) y noul (sí/no). Todas devuelven probabilidades calibradas: el umbral de confianza decide qué se automatiza.')),
    st.last
      ? h(
          'div',
          { class: 'how-btns' },
          h('button', { class: 'btn', onclick: () => showJson(t('📤 Petición · {label}', { label: lastLabel(st.last) }), st.last.request) }, t('📤 Ver petición')),
          h('button', { class: 'btn', onclick: () => showJson(t('📥 Respuesta · {label}', { label: lastLabel(st.last) }), st.last.raw) }, t('📥 Ver respuesta')),
        )
      : null,
  );
}

export function updateCaseNotes(root, sc, st, sum) {
  const slot = (k) => root.querySelector(`[data-slot="${k}"]`);
  slot('run')?.replaceChildren(...runRows(sc, st, sum));
  slot('proj')?.replaceChildren(projection(sc, st, sum));
  slot('how')?.replaceChildren(how(sc, st));
}
