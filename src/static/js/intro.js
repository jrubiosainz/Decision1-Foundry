// Portada: qué es Decision-1, por qué es un nuevo paradigma y acceso a los seis casos.
import { h, fmt, rich, jsonHtml } from './util.js';
import { S, regionLabel, skuLabel } from './core.js';
import { t, N_, locale } from './i18n.js';
import { note, noteList } from './notes.js';
import { pickTemplate } from './lab.js';

// Cifras con formato según el idioma: precio de entrada por millón de tokens (0,042 $ · $0.042) y segundos.
const inputPrice = () =>
  new Intl.NumberFormat(locale(), { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol', minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(0.042);
const secs = (v) => `${fmt.num(v, 1)} s`;

// Los nombres de las preguntas y las claves de las opciones son identificadores: solo se traduce el texto.
function sampleRequest() {
  return {
    model: 'decision-1',
    state: t('Cliente: "Huele a gas en el portal desde esta mañana. Tengo dos niños pequeños en casa."'),
    questions: {
      cola: {
        type: 'choice',
        instructions: t('¿Qué equipo debe atender el ticket?'),
        criteria: { averias: t('Averías y emergencias'), facturacion: t('Facturación'), otros: t('Otros') },
      },
      urgencia: { type: 'score', instructions: t('¿Con qué urgencia hay que actuar?'), criteria: [t('Baja'), t('Media'), t('Alta'), t('Crítica')] },
      riesgo_seguridad: { type: 'noul', instructions: t('¿Hay riesgo para la seguridad de las personas?') },
    },
  };
}

// Respuesta real de Decision-1 a la petición de arriba (valores redondeados).
function sampleResponse() {
  return {
    model: 'microsoft-decision-1',
    answers: {
      cola: { type: 'choice', choice: 'averias', confidence: 0.987, probabilities: { averias: 0.9913, facturacion: 0.0002, otros: 0.0086 } },
      urgencia: {
        type: 'score',
        score: 2.9998,
        confidence: 0.9997,
        legend: { 0: t('Baja'), 1: t('Media'), 2: t('Alta'), 3: t('Crítica') },
        probabilities: { 0: 0.000005, 1: 0.00001, 2: 0.0002, 3: 0.9998 },
      },
      riesgo_seguridad: { type: 'noul', noul: 0.9998 },
    },
    usage: { input_tokens: 125, output_tokens: 3 },
  };
}

const facts = () => [
  ['×35', t('más rápido que GPT-6 Sol en latencia p50')],
  ['36', t('benchmarks (~{n} preguntas) con la mejor precisión media', { n: fmt.int(150000) })],
  [inputPrice(), t('por millón de tokens de entrada; la salida es gratis')],
  [fmt.pct(0.013, 1), t('de decisiones cambian ante perturbaciones; 0 al reordenar o parafrasear opciones')],
  ['255', t('preguntas por llamada: un lote entero en una sola petición')],
  ['×200', t('más barato que GPT-6 Sol en Xbox Research, con calidad comparable')],
];

const measured = () => [
  ['~300 ms', t('p50 por llamada (Spain Central, DataZone UE)')],
  ['74/74', t('decisiones principales correctas en los casos 1 a 5')],
  [`< ${fmt.eur(0.001)}`, t('por lote de 12 a 16 elementos, en ~1 s')],
  ['×10 · ×30+', t('más rápido (en caliente) y más barato que GPT-6 Sol con el mismo lote')],
];

// Decision-1 como capa de decisiones de un agente: cada etiqueta abre su plantilla del laboratorio.
const FLOW_BEFORE = [
  ['agente-skill', N_('🧭 Skill')],
  ['agente-archivos', N_('📂 Archivos')],
  ['agente-compactacion', N_('🗜️ Contexto')],
];
const FLOW_AFTER = [
  ['agente-reglas', N_('🛡️ Reglas')],
  ['agente-revision', N_('🔍 Revisión')],
  ['agente-navegador', N_('🌐 Siguiente test')],
  ['agente-cobertura', N_('📋 Cobertura')],
];

function agentFlow() {
  const chips = (list) =>
    h(
      'div',
      { class: 'flow-chips' },
      list.map(([id, label]) => h('a', { class: 'flow-chip', href: '#lab', title: t('Probar en el laboratorio'), onclick: () => pickTemplate(id) }, t(label))),
    );
  const step = (cls, kicker, title, body, foot) =>
    h('div', { class: `flow-step ${cls}` }, h('div', { class: 'flow-kicker' }, kicker), h('b', { class: 'flow-title' }, title), body, h('small', null, foot));
  const arrow = () => h('span', { class: 'flow-arrow', 'aria-hidden': 'true' }, '→');
  return [
    h(
      'div',
      { class: 'flow' },
      step('user', t('👤 Usuario'), t('Pide un cambio'), null, t('«El botón Pagar no funciona en Safari»')),
      arrow(),
      step('d1', t('⚡ Decision-1 · antes'), t('Decide'), chips(FLOW_BEFORE), `~${secs(0.3)}`),
      arrow(),
      step('llm', t('🧠 LLM principal'), t('Ejecuta'), null, t('Lee, razona y escribe el código: segundos o minutos')),
      arrow(),
      step('d1', t('⚡ Decision-1 · después'), t('Valida'), chips(FLOW_AFTER), `~${secs(0.3)}`),
      arrow(),
      step('done', t('✅ Resultado'), t('Entrega'), null, t('Revisado, probado y conforme a las reglas')),
    ),
    h(
      'p',
      { class: 'flow-caption' },
      t('No todas las decisiones de un agente necesitan razonamiento generativo: elegir, filtrar, ordenar y validar son preguntas cerradas. Pulsa una etiqueta para probarla en el laboratorio.'),
    ),
  ];
}

export function mountIntro(stage, notes) {
  const cases = S.scenarios.map((sc) =>
    h(
      'a',
      { class: 'case-card', href: `#${sc.id}` },
      h('span', { class: 'cc-icon' }, sc.icon),
      h('span', { class: 'cc-num' }, t('Caso {n}', { n: sc.order })),
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
        h('div', { class: 'case-kicker' }, t('Nuevo en Microsoft Foundry')),
        h('h1', null, t('Microsoft-Decision-1: decisiones en milisegundos')),
        h(
          'p',
          { class: 'lead' },
          rich(
            t(
              'No genera texto: **decide**. Recibe un estado y preguntas cerradas y devuelve, en una sola pasada, cada respuesta con su probabilidad calibrada. Rápido, barato y consistente para las miles de microdecisiones que hoy hacen personas o LLMs caros.',
            ),
          ),
        ),
        h(
          'div',
          { class: 'hero-cta' },
          h('a', { class: 'btn primary', href: `#${S.scenarios[0]?.id || 'lab'}` }, t('▶ Empezar por el caso 1'), ' ', h('kbd', null, '→')),
          h('a', { class: 'btn', href: '#lab' }, t('🧪 Laboratorio')),
        ),
      ),
      h(
        'div',
        { class: 'versus' },
        h(
          'div',
          { class: 'vs-card slow' },
          h('div', { class: 'vs-title' }, t('🐢 Sistema 2 · LLM generativo')),
          h(
            'ul',
            null,
            [t('Razona y escribe token a token'), t('Segundos por respuesta'), t('Pagas cada token de salida'), t('Texto libre que hay que validar'), t('Puede cambiar de opinión entre llamadas')].map((txt) => h('li', null, txt)),
          ),
        ),
        h(
          'div',
          { class: 'vs-card fast' },
          h('div', { class: 'vs-title' }, t('⚡ Sistema 1 · Decision-1')),
          h(
            'ul',
            null,
            [
              t('Una sola pasada, sin generar texto'),
              t('Cientos de milisegundos'),
              t('Salida gratis, entrada a {precio}/M tokens', { precio: inputPrice() }),
              t('Probabilidad calibrada en cada respuesta'),
              t('Estable: misma entrada, misma decisión'),
            ].map((txt) => h('li', null, txt)),
          ),
        ),
      ),
      h('div', { class: 'section-title' }, h('span', null, t('📈 Datos del lanzamiento'))),
      h('div', { class: 'facts' }, facts().map(([b, txt]) => h('div', { class: 'fact' }, h('b', null, b), h('span', null, txt)))),
      h('div', { class: 'section-title' }, h('span', null, t('🔬 Medido en esta demo'))),
      h('div', { class: 'facts measured' }, measured().map(([b, txt]) => h('div', { class: 'fact' }, h('b', null, b), h('span', null, txt)))),
      h('div', { class: 'section-title' }, h('span', null, t('🧩 Así es una llamada'))),
      h(
        'div',
        { class: 'sample' },
        h('div', null, h('div', { class: 'im-label' }, t('Petición: estado + preguntas')), h('pre', { class: 'json', html: jsonHtml(sampleRequest()) })),
        h('div', null, h('div', { class: 'im-label' }, t('Respuesta: decisión + probabilidades')), h('pre', { class: 'json', html: jsonHtml(sampleResponse()) })),
      ),
      h('div', { class: 'section-title' }, h('span', null, t('🗂️ Los seis casos'))),
      h('div', { class: 'case-cards' }, cases),
      h('div', { class: 'section-title' }, h('span', null, t('🤖 Y dentro de tus agentes de IA'))),
      ...agentFlow(),
    ),
  );

  const d = S.config?.decision || {};
  notes.replaceChildren(
    h(
      'div',
      { class: 'notes-case' },
      h('div', { class: 'notes-kicker' }, t('Introducción · notas para el presentador')),
      note(
        '🎤',
        t('Mensajes clave'),
        noteList([
          rich(t('**Nuevo paradigma:** un modelo que decide, no que escribe. Se integra en línea con cada evento del proceso.')),
          rich(t('**Coste casi cero:** salida gratis y {precio} por millón de tokens de entrada. Miles de decisiones por céntimos.', { precio: inputPrice() })),
          rich(t('**Velocidad de Sistema 1:** cientos de milisegundos. 20 decisiones encadenadas caben en ~2 s.')),
          rich(t('**Confianza calibrada:** un {pct} acierta 9 de cada 10. El umbral decide qué se automatiza y qué revisa una persona.', { pct: fmt.pct(0.9) })),
          rich(t('**Tiempo real:** en el caso 6 Decision-1 y un LLM juegan a la vez a Space Invaders. El mundo no espera: la latencia se convierte en puntos.')),
        ]),
      ),
      note(
        '🌍',
        t('Disponibilidad'),
        noteList([
          rich(t('**Esta demo:** {region} · {sku} · {rpm} RPM', { region: regionLabel(d.location), sku: skuLabel(d.sku, d.location), rpm: fmt.int(d.rpm || 60) })),
          rich(t('**DataZone UE (7):** Spain Central, Sweden Central, West Europe, France Central, Germany West Central, Italy North y Poland Central.')),
          rich(t('**DataZone EE. UU. (9)** y **Global Standard (31 regiones).**')),
          rich(t('**Cuota:** con pocas RPM, el modo lote mete hasta 255 preguntas en una llamada. El caso 6 pide una decisión por segundo a cada modelo: necesita ~60 RPM.')),
        ]),
      ),
      note(
        '⚖️',
        t('¿Decision-1 o un LLM?'),
        noteList([
          rich(t('**Decision-1:** clasificar, priorizar, enrutar, validar, filtrar, puntuar… preguntas cerradas, a gran volumen y en tiempo real.')),
          rich(t('**LLM:** redactar, resumir, conversar y razonar en abierto.')),
          rich(t('**Juntos:** Decision-1 decide qué, quién y cuándo; el LLM solo trabaja donde aporta (caso 4).')),
        ]),
      ),
      note(
        '🤖',
        t('Decision-1 dentro de los agentes'),
        noteList([
          rich(t('**Patrón:** el LLM ejecuta; Decision-1 decide, filtra y enruta antes y valida después. Hay 7 plantillas listas en el laboratorio.')),
          rich(
            t('**Medido:** 12 archivos ordenados en {a}, 6 reglas comprobadas en {b} y 10 mensajes compactados en {c}; ~{coste} por llamada.', {
              a: secs(0.3),
              b: secs(0.5),
              c: secs(0.4),
              coste: fmt.eur(0.00003),
            }),
          ),
          rich(t('**Ya en la demo:** el caso 4 es un skill picker de negocio y el caso 5, rule enforcement.')),
          rich(t('**Ojo:** Decision-1 también puede fallar. Para bloquear o aprobar, combínalo con comprobaciones deterministas.')),
        ]),
      ),
      note(
        '⌨️',
        t('Atajos'),
        h(
          'div',
          { class: 'keys' },
          [
            ['← →', t('anterior / siguiente')],
            ['0–6', t('portada y casos')],
            ['L', t('laboratorio')],
            [t('Espacio'), t('procesar · jugar o pausar')],
            ['C', t('carrera')],
            ['B', t('lote / uno a uno')],
            ['R', t('reiniciar')],
            ['N', t('mostrar u ocultar notas')],
          ].map(([k, txt]) => h('div', null, h('kbd', null, k), ' ', txt)),
        ),
      ),
    ),
  );
}
