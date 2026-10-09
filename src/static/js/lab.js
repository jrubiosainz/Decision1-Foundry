// Laboratorio: Decision-1 con tu propio texto y tus propias preguntas.
import { h, fmt } from './util.js';
import { S, api, errorText } from './core.js';
import { addSession } from './run.js';
import { answerViz } from './views/answer.js';
import { sectionTitle, qLabel } from './views/common.js';
import { showJson, note, noteList } from './notes.js';

const L = { tpl: null, def: null, state: '', questions: '', busy: false, res: null, sent: null, err: '' };
let els = null;

const pretty = (v) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2));

function load(tpl) {
  L.tpl = tpl.id;
  L.def = tpl;
  L.state = pretty(tpl.state);
  L.questions = JSON.stringify(tpl.questions, null, 2);
  L.res = null;
  L.err = '';
}

// Carga una plantilla antes de abrir el laboratorio (enlaces de la portada).
export function pickTemplate(id) {
  const tpl = S.lab?.templates?.find((t) => t.id === id);
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
    throw new Error(`Las preguntas no son un JSON válido: ${e.message}`);
  }
  if (!questions || typeof questions !== 'object' || Array.isArray(questions) || !Object.keys(questions).length)
    throw new Error('Las preguntas deben ser un objeto JSON: { "nombre": { "type": "choice" | "score" | "noul", … } }');
  return { state, questions };
}

export async function labRun() {
  if (!els || L.busy) return;
  let payload;
  try {
    payload = parse();
    if (!payload.state) throw new Error('Escribe un estado: el texto o el JSON sobre el que decidir.');
  } catch (e) {
    L.err = e.message;
    paint();
    return;
  }
  L.err = '';
  L.busy = true;
  const t0 = performance.now();
  paint();
  try {
    const r = await api('/api/decide', payload);
    L.res = { ...r, wall: performance.now() - t0 };
    L.sent = payload.questions;
    addSession(1, Object.keys(payload.questions).length, r.cost, [r.latency_ms]);
  } catch (e) {
    L.err = errorText(e);
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
    L.err = '';
  } catch (e) {
    L.err = `Las preguntas no son un JSON válido: ${e.message}`;
  }
  paint();
}

const kpi = (label, value, sub, cls = '') =>
  h('div', { class: `kpi ${cls}` }, h('div', { class: 'kpi-label' }, label), h('div', { class: 'kpi-value' }, value), h('div', { class: 'kpi-sub' }, sub));

// Plantillas con «rank»: las preguntas sí/no se ordenan por probabilidad y se cortan por un umbral.
function ranking(sc, answers) {
  const rk = { title: 'Ranking', yes: 'Sí', no: 'No', threshold: 0.5, ...L.def.rank };
  const rows = Object.entries(answers || {})
    .filter(([, a]) => a?.type === 'noul' && a.p != null)
    .sort((x, y) => y[1].p - x[1].p);
  if (rows.length < 2) return null;
  const n = rows.filter(([, a]) => a.p >= rk.threshold).length;
  return h(
    'div',
    { class: `rank${rk.tone ? ` tone-${rk.tone}` : ''}` },
    h('div', { class: 'rank-head' }, h('b', null, rk.title), h('span', { class: 'grow' }), h('span', { class: 'tag' }, `${n} de ${rows.length} · ${rk.yes.toLowerCase()} si ≥ ${fmt.pct(rk.threshold)}`)),
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
  if (L.busy) return [h('div', { class: 'lab-empty' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('b', null, 'Decision-1 está decidiendo…'))];
  const r = L.res;
  if (!r)
    return [
      h(
        'div',
        { class: 'lab-empty' },
        h('b', null, '⚡ Elige una plantilla o escribe la tuya'),
        h('p', { class: 'muted small' }, 'Pulsa Decidir (Ctrl+Enter). Verás cada respuesta con sus probabilidades, la latencia y el coste.'),
      ),
    ];
  const names = Object.keys(L.sent);
  const labels = L.def?.labels || {};
  const sc = { questions: L.sent, primary: null, qLabels: labels.questions, valueLabels: labels.values };
  const rank = L.def?.rank ? ranking(sc, r.answers) : null;
  const cards = rank ? names.filter((q) => r.answers?.[q]?.type !== 'noul') : names;
  const u = r.usage || {};
  return [
    h(
      'div',
      { class: 'kpis lab-kpis' },
      kpi('Latencia', fmt.ms(r.latency_ms), `${fmt.ms(r.wall)} de reloj`, 'accent'),
      kpi('Decisiones', fmt.int(names.length), '1 sola llamada'),
      kpi('Tokens', `${fmt.int(u.input_tokens)} → ${fmt.int(u.output_tokens)}`, 'entrada → salida'),
      kpi('Coste', fmt.eur(r.cost?.eur), `${fmt.eur((r.cost?.eur || 0) * 1000)} por 1.000 llamadas`, 'good'),
    ),
    rank,
    cards.length ? h('div', { class: 'av-grid' }, cards.map((q) => answerViz(sc, q, r.answers?.[q], { thr: S.threshold }))) : null,
    h(
      'div',
      { class: 'im-foot' },
      h('span', { class: 'grow' }),
      h('button', { class: 'btn', onclick: () => showJson('📤 Petición', r.request) }, '📤 Petición'),
      h('button', { class: 'btn', onclick: () => showJson('📥 Respuesta', r.raw) }, '📥 Respuesta'),
    ),
  ];
}

function paint() {
  if (!els) return;
  els.run.disabled = L.busy;
  els.err.textContent = L.err;
  els.err.hidden = !L.err;
  for (const b of els.tpls.querySelectorAll('.tpl')) b.classList.toggle('on', b.dataset.tpl === L.tpl);
  els.res.replaceChildren(...results().filter(Boolean));
}

export function unmountLab() {
  els = null;
}

export function mountLab(stage, notes) {
  const tpls = S.lab?.templates || [];
  if (!L.tpl && tpls[0]) load(tpls[0]);
  const ta = (key, rows, label) =>
    h('textarea', {
      class: `lab-ta lab-${key}`,
      rows,
      spellcheck: 'false',
      'aria-label': label,
      value: L[key],
      oninput: (e) => (L[key] = e.target.value),
      onkeydown: onKey,
    });
  els = {
    state: ta('state', 7, 'Estado'),
    questions: ta('questions', 16, 'Preguntas en JSON'),
    run: h('button', { class: 'btn primary', onclick: labRun }, '⚡ Decidir ', h('kbd', null, 'Ctrl+Enter')),
    err: h('div', { class: 'lab-err', role: 'alert', hidden: true }),
    res: h('div', { class: 'lab-res', 'aria-live': 'polite' }),
    tpls: h('div', { class: 'tpl-groups' }),
  };
  const button = (t) =>
    h(
      'button',
      {
        class: 'tpl',
        dataset: { tpl: t.id },
        onclick: () => {
          load(t);
          els.state.value = L.state;
          els.questions.value = L.questions;
          paint();
        },
      },
      h('b', null, t.title),
      h('small', null, t.description),
    );
  const groupNames = S.lab?.groups || {};
  const groupOf = (t) => t.group || 'negocio';
  els.tpls.append(
    ...[...new Set(tpls.map(groupOf))].map((g) =>
      h(
        'div',
        { class: 'tpl-group' },
        groupNames[g] ? h('div', { class: 'tpl-group-title' }, groupNames[g]) : null,
        h('div', { class: 'tpls' }, tpls.filter((t) => groupOf(t) === g).map(button)),
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
          h('div', { class: 'case-kicker' }, 'Laboratorio'),
          h('h1', { class: 'case-title' }, 'Pruébalo con tus propios datos'),
          h('div', { class: 'case-headline' }, 'Un estado y unas preguntas cerradas: Decision-1 responde a todas a la vez, cada una con su probabilidad.'),
        ),
      ),
      sectionTitle('📚 Plantillas'),
      els.tpls,
      h(
        'div',
        { class: 'lab' },
        h(
          'div',
          { class: 'lab-editor' },
          h('div', { class: 'im-label' }, 'Estado · texto o JSON'),
          els.state,
          h('div', { class: 'im-label' }, 'Preguntas · JSON con type choice, score o noul'),
          els.questions,
          els.err,
          h('div', { class: 'lab-actions' }, els.run, h('button', { class: 'btn ghost', onclick: formatQuestions }, '{ } Formatear')),
        ),
        els.res,
      ),
    ),
  );
  notes.replaceChildren(
    h(
      'div',
      { class: 'notes-case' },
      h('div', { class: 'notes-kicker' }, 'Laboratorio · notas para el presentador'),
      note(
        '🎤',
        'Cómo usarlo con el cliente',
        noteList([
          'Pide un ejemplo real (anonimizado) de su proceso: un ticket, una reseña, un correo o una conversación.',
          'Formula en voz alta las decisiones que hoy toma una persona y escríbelas como preguntas cerradas.',
          'Pulsa Decidir: en menos de un segundo tienes todas las respuestas, con su probabilidad.',
        ]),
      ),
      note(
        '🤖',
        'Dentro de un agente de IA',
        noteList([
          [h('b', null, 'Capa de decisiones: '), 'el LLM principal ejecuta; Decision-1 elige skill, archivos y contexto antes, y valida reglas, riesgo y siguiente test después.'],
          [h('b', null, '~0,3 s y ~0,00003 € por llamada: '), 'cabe en un hook en cada paso del agente.'],
          [h('b', null, 'Ojo: '), 'para bloquear o aprobar, combínalo con comprobaciones deterministas (tests, linters, permisos).'],
        ]),
      ),
      note(
        '🧩',
        'Tres tipos de pregunta',
        noteList([
          [h('b', null, 'choice: '), 'elige una opción. criteria = { clave: descripción }.'],
          [h('b', null, 'score: '), 'nivel en una escala ordenada. criteria = [de menor a mayor].'],
          [h('b', null, 'noul: '), 'sí o no, sin criteria. Devuelve la probabilidad de «sí».'],
        ]),
      ),
      note(
        '📏',
        'Límites',
        noteList([
          [h('b', null, 'API: '), 'hasta 255 preguntas por llamada y 64.000 tokens.'],
          [h('b', null, 'Este laboratorio: '), '32 preguntas y 20.000 caracteres de estado.'],
          [h('b', null, 'Estado: '), 'texto libre o JSON (por ejemplo, un ticket con sus campos).'],
        ]),
      ),
      note(
        '💡',
        'Buenas preguntas',
        noteList([
          'Una decisión por pregunta, con instrucciones concretas.',
          'Describe bien cada opción: el modelo decide con esa descripción.',
          'Usa la confianza: automatiza por encima del umbral y revisa el resto.',
        ]),
      ),
    ),
  );
  paint();
}
