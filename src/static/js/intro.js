// Portada: qué es Decision-1, por qué es un nuevo paradigma y acceso a los cinco casos.
import { h, jsonHtml } from './util.js';
import { S, regionLabel, skuLabel } from './core.js';
import { note, noteList } from './notes.js';
import { pickTemplate } from './lab.js';

const SAMPLE_REQUEST = {
  model: 'decision-1',
  state: 'Cliente: "Huele a gas en el portal desde esta mañana. Tengo dos niños pequeños en casa."',
  questions: {
    cola: { type: 'choice', instructions: '¿Qué equipo debe atender el ticket?', criteria: { averias: 'Averías y emergencias', facturacion: 'Facturación', otros: 'Otros' } },
    urgencia: { type: 'score', instructions: '¿Con qué urgencia hay que actuar?', criteria: ['Baja', 'Media', 'Alta', 'Crítica'] },
    riesgo_seguridad: { type: 'noul', instructions: '¿Hay riesgo para la seguridad de las personas?' },
  },
};

// Respuesta real de Decision-1 a la petición de arriba (valores redondeados).
const SAMPLE_RESPONSE = {
  model: 'microsoft-decision-1',
  answers: {
    cola: { type: 'choice', choice: 'averias', confidence: 0.987, probabilities: { averias: 0.9913, facturacion: 0.0002, otros: 0.0086 } },
    urgencia: {
      type: 'score',
      score: 2.9998,
      confidence: 0.9997,
      legend: { 0: 'Baja', 1: 'Media', 2: 'Alta', 3: 'Crítica' },
      probabilities: { 0: 0.000005, 1: 0.00001, 2: 0.0002, 3: 0.9998 },
    },
    riesgo_seguridad: { type: 'noul', noul: 0.9998 },
  },
  usage: { input_tokens: 125, output_tokens: 3 },
};

const FACTS = [
  ['×35', 'más rápido que GPT-6 Sol en latencia p50'],
  ['36', 'benchmarks (~150.000 preguntas) con la mejor precisión media'],
  ['0,042 $', 'por millón de tokens de entrada; la salida es gratis'],
  ['1,3 %', 'de decisiones cambian ante perturbaciones; 0 al reordenar o parafrasear opciones'],
  ['255', 'preguntas por llamada: un lote entero en una sola petición'],
  ['×200', 'más barato que GPT-6 Sol en Xbox Research, con calidad comparable'],
];

const MEASURED = [
  ['~300 ms', 'p50 por llamada (Spain Central, DataZone UE)'],
  ['74/74', 'decisiones principales correctas en los 5 casos'],
  ['< 0,001 €', 'por lote de 12 a 16 elementos, en ~1 s'],
  ['×10 · ×30+', 'más rápido (en caliente) y más barato que GPT-6 Sol con el mismo lote'],
];

// Decision-1 como capa de decisiones de un agente: cada etiqueta abre su plantilla del laboratorio.
const FLOW_BEFORE = [
  ['agente-skill', '🧭 Skill'],
  ['agente-archivos', '📂 Archivos'],
  ['agente-compactacion', '🗜️ Contexto'],
];
const FLOW_AFTER = [
  ['agente-reglas', '🛡️ Reglas'],
  ['agente-revision', '🔍 Revisión'],
  ['agente-navegador', '🌐 Siguiente test'],
  ['agente-cobertura', '📋 Cobertura'],
];

function agentFlow() {
  const chips = (list) =>
    h(
      'div',
      { class: 'flow-chips' },
      list.map(([id, label]) => h('a', { class: 'flow-chip', href: '#lab', title: 'Probar en el laboratorio', onclick: () => pickTemplate(id) }, label)),
    );
  const step = (cls, kicker, title, body, foot) =>
    h('div', { class: `flow-step ${cls}` }, h('div', { class: 'flow-kicker' }, kicker), h('b', { class: 'flow-title' }, title), body, h('small', null, foot));
  const arrow = () => h('span', { class: 'flow-arrow', 'aria-hidden': 'true' }, '→');
  return [
    h(
      'div',
      { class: 'flow' },
      step('user', '👤 Usuario', 'Pide un cambio', null, '«El botón Pagar no funciona en Safari»'),
      arrow(),
      step('d1', '⚡ Decision-1 · antes', 'Decide', chips(FLOW_BEFORE), '~0,3 s'),
      arrow(),
      step('llm', '🧠 LLM principal', 'Ejecuta', null, 'Lee, razona y escribe el código: segundos o minutos'),
      arrow(),
      step('d1', '⚡ Decision-1 · después', 'Valida', chips(FLOW_AFTER), '~0,3 s'),
      arrow(),
      step('done', '✅ Resultado', 'Entrega', null, 'Revisado, probado y conforme a las reglas'),
    ),
    h(
      'p',
      { class: 'flow-caption' },
      'No todas las decisiones de un agente necesitan razonamiento generativo: elegir, filtrar, ordenar y validar son preguntas cerradas. Pulsa una etiqueta para probarla en el laboratorio.',
    ),
  ];
}

export function mountIntro(stage, notes) {
  const cases = S.scenarios.map((sc) =>
    h(
      'a',
      { class: 'case-card', href: `#${sc.id}` },
      h('span', { class: 'cc-icon' }, sc.icon),
      h('span', { class: 'cc-num' }, `Caso ${sc.order}`),
      h('b', { class: 'cc-title' }, sc.title),
      h('span', { class: 'cc-head' }, sc.headline),
      h('span', { class: 'cc-sector' }, `${sc.sector} · ${sc.brand}`),
    ),
  );
  stage.replaceChildren(
    h(
      'div',
      { class: 'intro' },
      h(
        'section',
        { class: 'hero' },
        h('div', { class: 'case-kicker' }, 'Nuevo en Microsoft Foundry'),
        h('h1', null, 'Microsoft-Decision-1: decisiones en milisegundos'),
        h(
          'p',
          { class: 'lead' },
          'No genera texto: ',
          h('b', null, 'decide'),
          '. Recibe un estado y preguntas cerradas y devuelve, en una sola pasada, cada respuesta con su probabilidad calibrada. Rápido, barato y consistente para las miles de microdecisiones que hoy hacen personas o LLMs caros.',
        ),
        h('div', { class: 'hero-cta' }, h('a', { class: 'btn primary', href: `#${S.scenarios[0]?.id || 'lab'}` }, '▶ Empezar por el caso 1 ', h('kbd', null, '→')), h('a', { class: 'btn', href: '#lab' }, '🧪 Laboratorio')),
      ),
      h(
        'div',
        { class: 'versus' },
        h(
          'div',
          { class: 'vs-card slow' },
          h('div', { class: 'vs-title' }, '🐢 Sistema 2 · LLM generativo'),
          h('ul', null, ['Razona y escribe token a token', 'Segundos por respuesta', 'Pagas cada token de salida', 'Texto libre que hay que validar', 'Puede cambiar de opinión entre llamadas'].map((t) => h('li', null, t))),
        ),
        h(
          'div',
          { class: 'vs-card fast' },
          h('div', { class: 'vs-title' }, '⚡ Sistema 1 · Decision-1'),
          h('ul', null, ['Una sola pasada, sin generar texto', 'Cientos de milisegundos', 'Salida gratis, entrada a 0,042 $/M tokens', 'Probabilidad calibrada en cada respuesta', 'Estable: misma entrada, misma decisión'].map((t) => h('li', null, t))),
        ),
      ),
      h('div', { class: 'section-title' }, h('span', null, '📈 Datos del lanzamiento')),
      h('div', { class: 'facts' }, FACTS.map(([b, t]) => h('div', { class: 'fact' }, h('b', null, b), h('span', null, t)))),
      h('div', { class: 'section-title' }, h('span', null, '🔬 Medido en esta demo')),
      h('div', { class: 'facts measured' }, MEASURED.map(([b, t]) => h('div', { class: 'fact' }, h('b', null, b), h('span', null, t)))),
      h('div', { class: 'section-title' }, h('span', null, '🧩 Así es una llamada')),
      h(
        'div',
        { class: 'sample' },
        h('div', null, h('div', { class: 'im-label' }, 'Petición: estado + preguntas'), h('pre', { class: 'json', html: jsonHtml(SAMPLE_REQUEST) })),
        h('div', null, h('div', { class: 'im-label' }, 'Respuesta: decisión + probabilidades'), h('pre', { class: 'json', html: jsonHtml(SAMPLE_RESPONSE) })),
      ),
      h('div', { class: 'section-title' }, h('span', null, '🗂️ Los cinco casos')),
      h('div', { class: 'case-cards' }, cases),
      h('div', { class: 'section-title' }, h('span', null, '🤖 Y dentro de tus agentes de IA')),
      ...agentFlow(),
    ),
  );

  const d = S.config?.decision || {};
  notes.replaceChildren(
    h(
      'div',
      { class: 'notes-case' },
      h('div', { class: 'notes-kicker' }, 'Introducción · notas para el presentador'),
      note(
        '🎤',
        'Mensajes clave',
        noteList([
          [h('b', null, 'Nuevo paradigma: '), 'un modelo que decide, no que escribe. Se integra en línea con cada evento del proceso.'],
          [h('b', null, 'Coste casi cero: '), 'salida gratis y 0,042 $ por millón de tokens de entrada. Miles de decisiones por céntimos.'],
          [h('b', null, 'Velocidad de Sistema 1: '), 'cientos de milisegundos. 20 decisiones encadenadas caben en ~2 s.'],
          [h('b', null, 'Confianza calibrada: '), 'un 90 % acierta 9 de cada 10. El umbral decide qué se automatiza y qué revisa una persona.'],
        ]),
      ),
      note(
        '🌍',
        'Disponibilidad',
        noteList([
          [h('b', null, 'Esta demo: '), `${regionLabel(d.location)} · ${skuLabel(d.sku, d.location)} · ${d.rpm || 17} RPM`],
          [h('b', null, 'DataZone UE (7): '), 'Spain Central, Sweden Central, West Europe, France Central, Germany West Central, Italy North y Poland Central.'],
          [h('b', null, 'DataZone EE. UU. (9) '), 'y ', h('b', null, 'Global Standard (31 regiones).')],
          [h('b', null, 'Cuota: '), 'con pocas RPM, el modo lote mete hasta 255 preguntas en una llamada.'],
        ]),
      ),
      note(
        '⚖️',
        '¿Decision-1 o un LLM?',
        noteList([
          [h('b', null, 'Decision-1: '), 'clasificar, priorizar, enrutar, validar, filtrar, puntuar… preguntas cerradas, a gran volumen y en tiempo real.'],
          [h('b', null, 'LLM: '), 'redactar, resumir, conversar y razonar en abierto.'],
          [h('b', null, 'Juntos: '), 'Decision-1 decide qué, quién y cuándo; el LLM solo trabaja donde aporta (caso 4).'],
        ]),
      ),
      note(
        '🤖',
        'Decision-1 dentro de los agentes',
        noteList([
          [h('b', null, 'Patrón: '), 'el LLM ejecuta; Decision-1 decide, filtra y enruta antes y valida después. Hay 7 plantillas listas en el laboratorio.'],
          [h('b', null, 'Medido: '), '12 archivos ordenados en 0,3 s, 6 reglas comprobadas en 0,5 s y 10 mensajes compactados en 0,4 s; ~0,00003 € por llamada.'],
          [h('b', null, 'Ya en la demo: '), 'el caso 4 es un skill picker de negocio y el caso 5, rule enforcement.'],
          [h('b', null, 'Ojo: '), 'Decision-1 también puede fallar. Para bloquear o aprobar, combínalo con comprobaciones deterministas.'],
        ]),
      ),
      note(
        '⌨️',
        'Atajos',
        h(
          'div',
          { class: 'keys' },
          [
            ['← →', 'anterior / siguiente'],
            ['0–5', 'portada y casos'],
            ['L', 'laboratorio'],
            ['Espacio', 'procesar'],
            ['C', 'carrera'],
            ['B', 'lote / uno a uno'],
            ['R', 'reiniciar'],
            ['N', 'mostrar u ocultar notas'],
          ].map(([k, t]) => h('div', null, h('kbd', null, k), ' ', t)),
        ),
      ),
    ),
  );
}
