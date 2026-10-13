// Laboratorio: Decision-1 con tu propio texto y tus propias preguntas.
import { h, fmt, rich } from './util.js';
import { S, api, errorText } from './core.js';
import { t, getLang } from './i18n.js';
import { addSession } from './run.js';
import { answerViz } from './views/answer.js';
import { sectionTitle, qLabel } from './views/common.js';
import { showJson, note, noteList } from './notes.js';

// tpl es el id de la plantilla (se busca en S.lab al pintar, ya en el idioma activo); err guarda el error, no su texto.
const L = { tpl: null, lang: null, edited: false, state: '', questions: '', busy: false, res: null, sent: null, err: null };
let els = null;

const pretty = (v) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2));
const current = () => S.lab?.templates?.find((tp) => tp.id === L.tpl) || null;

// Errores de validación del editor: se traducen al pintar para que sigan al idioma activo.
class LabError extends Error {
  constructor(kind, detail = '') {
    super(detail);
    this.kind = kind;
  }
}

function errorMessage(e) {
  if (!(e instanceof LabError)) return errorText(e);
  if (e.kind === 'json') return t('Las preguntas no son un JSON válido: {detalle}', { detalle: e.message });
  if (e.kind === 'shape') return t('Las preguntas deben ser un objeto JSON: { "nombre": { "type": "choice" | "score" | "noul", … } }');
  return t('Escribe un estado: el texto o el JSON sobre el que decidir.');
}

function load(tpl) {
  L.tpl = tpl.id;
  L.lang = getLang();
  L.edited = false;
  L.state = pretty(tpl.state);
  L.questions = JSON.stringify(tpl.questions, null, 2);
  L.res = null;
  L.err = null;
}

// Carga una plantilla antes de abrir el laboratorio (enlaces de la portada).
export function pickTemplate(id) {
  const tpl = S.lab?.templates?.find((tp) => tp.id === id);
  if (tpl) load(tpl);
}

function parse() {
  const raw = L.state.trim();
  let state = raw;
  if (/^[{[]/.test(raw)) {
    try {
      state = JSON.parse(raw);
    } catch {
      // No es JSON válido: se envía como texto.
    }
  }
  let questions;
  try {
    questions = JSON.parse(L.questions);
  } catch (e) {
    throw new LabError('json', e.message);
  }
  if (!questions || typeof questions !== 'object' || Array.isArray(questions) || !Object.keys(questions).length) throw new LabError('shape');
  return { state, questions };
}

export async function labRun() {
  if (!els || L.busy) return;
  let payload;
  try {
    payload = parse();
    if (!payload.state) throw new LabError('state');
  } catch (e) {
    L.err = e;
    paint();
    return;
  }
  L.err = null;
  L.busy = true;
  const t0 = performance.now();
  paint();
  try {
    const r = await api('/api/decide', payload);
    L.res = { ...r, wall: performance.now() - t0 };
    L.sent = payload.questions;
    addSession(1, Object.keys(payload.questions).length, r.cost, [r.latency_ms]);
  } catch (e) {
    L.err = e;
  } finally {
    L.busy = false;
    paint();
  }
}

function onKey(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    labRun();
  }
}

function formatQuestions() {
  try {
    L.questions = JSON.stringify(JSON.parse(L.questions), null, 2);
    els.questions.value = L.questions;
    L.err = null;
  } catch (e) {
    L.err = new LabError('json', e.message);
  }
  paint();
}

const kpi = (label, value, sub, cls = '') =>
  h('div', { class: `kpi ${cls}` }, h('div', { class: 'kpi-label' }, label), h('div', { class: 'kpi-value' }, value), h('div', { class: 'kpi-sub' }, sub));

// Plantillas con «rank»: las preguntas sí/no se ordenan por probabilidad y se cortan por un umbral.
function ranking(sc, answers, cfg) {
  const rk = { title: t('Ranking'), yes: t('Sí'), no: t('No'), threshold: 0.5, ...cfg };
  const rows = Object.entries(answers || {})
    .filter(([, a]) => a?.type === 'noul' && a.p != null)
    .sort((x, y) => y[1].p - x[1].p);
  if (rows.length < 2) return null;
  const n = rows.filter(([, a]) => a.p >= rk.threshold).length;
  return h(
    'div',
    { class: `rank${rk.tone ? ` tone-${rk.tone}` : ''}` },
    h(
      'div',
      { class: 'rank-head' },
      h('b', null, rk.title),
      h('span', { class: 'grow' }),
      h('span', { class: 'tag' }, t('{n} de {total} · {yes} si ≥ {umbral}', { n: fmt.int(n), total: fmt.int(rows.length), yes: rk.yes.toLowerCase(), umbral: fmt.pct(rk.threshold) })),
    ),
    rows.map(([q, a]) => {
      const on = a.p >= rk.threshold;
      return h(
        'div',
        { class: `rank-row${on ? ' on' : ''}`, title: sc.questions[q]?.instructions || '' },
        h('span', { class: 'rank-label' }, qLabel(sc, q)),
        h('span', { class: 'bar' }, h('i', { style: { width: `${Math.max(0.6, a.p * 100)}%` } }), h('b', { class: 'thr', style: { left: `${rk.threshold * 100}%` } })),
        h('span', { class: 'bar-val' }, fmt.pct(a.p)),
        h('span', { class: `rank-verdict${on ? ' yes' : ''}` }, on ? rk.yes : rk.no),
      );
    }),
  );
}

function results() {
  if (L.busy) return [h('div', { class: 'lab-empty' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('b', null, t('Decision-1 está decidiendo…')))];
  const r = L.res;
  if (!r)
    return [
      h(
        'div',
        { class: 'lab-empty' },
        h('b', null, t('⚡ Elige una plantilla o escribe la tuya')),
        h('p', { class: 'muted small' }, t('Pulsa Decidir (Ctrl+Enter). Verás cada respuesta con sus probabilidades, la latencia y el coste.')),
      ),
    ];
  const names = Object.keys(L.sent);
  const tpl = current();
  const labels = tpl?.labels || {};
  const sc = { questions: L.sent, primary: null, qLabels: labels.questions, valueLabels: labels.values };
  const rank = tpl?.rank ? ranking(sc, r.answers, tpl.rank) : null;
  const cards = rank ? names.filter((q) => r.answers?.[q]?.type !== 'noul') : names;
  const u = r.usage || {};
  return [
    h(
      'div',
      { class: 'kpis lab-kpis' },
      kpi(t('Latencia'), fmt.ms(r.latency_ms), t('{ms} de reloj', { ms: fmt.ms(r.wall) }), 'accent'),
      kpi(t('Decisiones'), fmt.int(names.length), t('1 sola llamada')),
      kpi(t('Tokens'), `${fmt.int(u.input_tokens)} → ${fmt.int(u.output_tokens)}`, t('entrada → salida')),
      kpi(t('Coste'), fmt.eur(r.cost?.eur), t('{coste} por {n} llamadas', { coste: fmt.eur((r.cost?.eur || 0) * 1000), n: fmt.int(1000) }), 'good'),
    ),
    rank,
    cards.length ? h('div', { class: 'av-grid' }, cards.map((q) => answerViz(sc, q, r.answers?.[q], { thr: S.threshold }))) : null,
    h(
      'div',
      { class: 'im-foot' },
      h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: () => showJson(t('📤 Petición'), r.request) }, t('📤 Petición')),
      h('button', { class: 'btn', onclick: () => showJson(t('📥 Respuesta'), r.raw) }, t('📥 Respuesta')),
    ),
  ];
}

function paint() {
  if (!els) return;
  const msg = L.err ? errorMessage(L.err) : '';
  els.run.disabled = L.busy;
  els.err.textContent = msg;
  els.err.hidden = !msg;
  for (const b of els.tpls.querySelectorAll('.tpl')) b.classList.toggle('on', b.dataset.tpl === L.tpl);
  els.res.replaceChildren(...results().filter(Boolean));
}

export function unmountLab() {
  els = null;
}

export function mountLab(stage, notes) {
  const tpls = S.lab?.templates || [];
  if (!L.tpl && tpls[0]) load(tpls[0]);
  // Una plantilla sin tocar sigue al idioma activo; lo que el usuario ha escrito se conserva tal cual.
  const cur = tpls.find((tp) => tp.id === L.tpl);
  if (cur && !L.edited && L.lang !== getLang()) load(cur);
  const ta = (key, rows, label) =>
    h('textarea', {
      class: `lab-ta lab-${key}`,
      rows,
      spellcheck: 'false',
      'aria-label': label,
      value: L[key],
      oninput: (e) => {
        L[key] = e.target.value;
        L.edited = true;
      },
      onkeydown: onKey,
    });
  els = {
    state: ta('state', 7, t('Estado')),
    questions: ta('questions', 16, t('Preguntas en JSON')),
    run: h('button', { class: 'btn primary', onclick: labRun }, t('⚡ Decidir'), ' ', h('kbd', null, 'Ctrl+Enter')),
    err: h('div', { class: 'lab-err', role: 'alert', hidden: true }),
    res: h('div', { class: 'lab-res', 'aria-live': 'polite' }),
    tpls: h('div', { class: 'tpl-groups' }),
  };
  const button = (tp) =>
    h(
      'button',
      {
        class: 'tpl',
        dataset: { tpl: tp.id },
        onclick: () => {
          load(tp);
          els.state.value = L.state;
          els.questions.value = L.questions;
          paint();
        },
      },
      h('b', null, tp.title),
      h('small', null, tp.description),
    );
  const groupNames = S.lab?.groups || {};
  const groupOf = (tp) => tp.group || 'negocio';
  els.tpls.append(
    ...[...new Set(tpls.map(groupOf))].map((g) =>
      h(
        'div',
        { class: 'tpl-group' },
        groupNames[g] ? h('div', { class: 'tpl-group-title' }, groupNames[g]) : null,
        h('div', { class: 'tpls' }, tpls.filter((tp) => groupOf(tp) === g).map(button)),
      ),
    ),
  );
  stage.replaceChildren(
    h(
      'div',
      { class: 'lab-page' },
      h(
        'div',
        { class: 'case-head' },
        h('div', { class: 'case-icon' }, '🧪'),
        h(
          'div',
          null,
          h('div', { class: 'case-kicker' }, t('Laboratorio')),
          h('h1', { class: 'case-title' }, t('Pruébalo con tus propios datos')),
          h('div', { class: 'case-headline' }, t('Un estado y unas preguntas cerradas: Decision-1 responde a todas a la vez, cada una con su probabilidad.')),
        ),
      ),
      sectionTitle(t('📚 Plantillas')),
      els.tpls,
      h(
        'div',
        { class: 'lab' },
        h(
          'div',
          { class: 'lab-editor' },
          h('div', { class: 'im-label' }, t('Estado · texto o JSON')),
          els.state,
          h('div', { class: 'im-label' }, t('Preguntas · JSON con type choice, score o noul')),
          els.questions,
          els.err,
          h('div', { class: 'lab-actions' }, els.run, h('button', { class: 'btn ghost', onclick: formatQuestions }, t('{ } Formatear'))),
        ),
        els.res,
      ),
    ),
  );
  notes.replaceChildren(
    h(
      'div',
      { class: 'notes-case' },
      h('div', { class: 'notes-kicker' }, t('Laboratorio · notas para el presentador')),
      note(
        '🎤',
        t('Cómo usarlo con el cliente'),
        noteList([
          t('Pide un ejemplo real (anonimizado) de su proceso: un ticket, una reseña, un correo o una conversación.'),
          t('Formula en voz alta las decisiones que hoy toma una persona y escríbelas como preguntas cerradas.'),
          t('Pulsa Decidir: en menos de un segundo tienes todas las respuestas, con su probabilidad.'),
        ]),
      ),
      note(
        '🤖',
        t('Dentro de un agente de IA'),
        noteList([
          rich(t('**Capa de decisiones:** el LLM principal ejecuta; Decision-1 elige skill, archivos y contexto antes, y valida reglas, riesgo y siguiente test después.')),
          rich(t('**~{s} y ~{coste} por llamada:** cabe en un hook en cada paso del agente.', { s: `${fmt.num(0.3, 1)} s`, coste: fmt.eur(0.00003) })),
          rich(t('**Ojo:** para bloquear o aprobar, combínalo con comprobaciones deterministas (tests, linters, permisos).')),
        ]),
      ),
      note(
        '🧩',
        t('Tres tipos de pregunta'),
        noteList([
          rich(t('**choice:** elige una opción. criteria = { clave: descripción }.')),
          rich(t('**score:** nivel en una escala ordenada. criteria = [de menor a mayor].')),
          rich(t('**noul:** sí o no, sin criteria. Devuelve la probabilidad de «sí».')),
        ]),
      ),
      note(
        '📏',
        t('Límites'),
        noteList([
          rich(t('**API:** hasta 255 preguntas por llamada y {tokens} tokens.', { tokens: fmt.int(64000) })),
          rich(t('**Este laboratorio:** 32 preguntas y {chars} caracteres de estado.', { chars: fmt.int(20000) })),
          rich(t('**Estado:** texto libre o JSON (por ejemplo, un ticket con sus campos).')),
        ]),
      ),
      note(
        '💡',
        t('Buenas preguntas'),
        noteList([
          t('Una decisión por pregunta, con instrucciones concretas.'),
          t('Describe bien cada opción: el modelo decide con esa descripción.'),
          t('Usa la confianza: automatiza por encima del umbral y revisa el resto.'),
        ]),
      ),
    ),
  );
  paint();
}
