// Intro page of the "OpenAI Decisions API" tab: what it adds compared with Decision-1, a real call and the five cases.
import { h, fmt, rich, jsonHtml } from '../util.js';
import { S, regionLabel } from '../core.js';
import { t, N_, locale } from '../i18n.js';
import { note, noteList } from '../notes.js';
import { DX, mediaChip, stamp, cascadeColumns } from './common.js';

// Price per million tokens formatted for the language: 0,10 $ · $0.10.
const usd = (v, d = 2) => new Intl.NumberFormat(locale(), { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol', minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
const price = (key, fallback) => DX.data?.pricing?.[key] ?? fallback;
const secs = (v) => `${fmt.num(v, 1)} s`;

// Step C of claim 1 as it was sent (abridged) and the answer the API returned.
function sampleRequest() {
  return {
    model: DX.data?.model || 'gpt-6-luna',
    input: [
      { role: 'developer', content: t('Eres el sistema de triaje de reclamaciones posventa de Northwind Hogar…') },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: t('Foto enviada por el cliente:') },
          { type: 'input_image', image_url: 'data:image/jpeg;base64,…' },
          { type: 'input_text', text: t('Relato del cliente: «Me han llegado tres de las seis copas rotas…»') },
        ],
      },
    ],
    questions: [
      { type: 'predicate', name: 'danio_visible', instructions: t('¿Se ve un daño físico en el producto?') },
      {
        type: 'choice',
        name: 'tipo',
        instructions: t('¿Qué tipo de daño se ve?'),
        choices: [
          { value: 'rotura', description: t('Piezas rotas o cristales hechos añicos.') },
          { value: 'grieta', description: t('Fisura o grieta.') },
          { value: 'aranazo', description: t('Rayas o arañazos.') },
          { value: 'abolladura', description: t('Golpe o deformación.') },
          { value: 'ninguno', description: t('No se ve ningún daño.') },
        ],
      },
      { type: 'score', name: 'gravedad', instructions: t('¿Cómo afecta el daño al uso del producto?'), levels: [{ label: t('Leve') }, { label: t('Moderada') }, { label: t('Inutilizable') }] },
      { type: 'predicate', name: 'relato_cuadra', instructions: t('¿Cuadra lo que cuenta el cliente con la foto?') },
    ],
  };
}

function sampleResponse() {
  const zero = (value) => ({ value, probability: 0 });
  return {
    model: DX.data?.model || 'gpt-6-luna',
    answers: [
      { type: 'predicate', name: 'danio_visible', probability: 1 },
      { type: 'choice', name: 'tipo', choice: 'rotura', probabilities: [{ value: 'rotura', probability: 1 }, zero('grieta'), zero('aranazo'), zero('abolladura'), zero('ninguno')], confidence: 1 },
      {
        type: 'score',
        name: 'gravedad',
        score: 1.44,
        probabilities: [
          { value: 0, label: t('Leve'), probability: 0.02 },
          { value: 1, label: t('Moderada'), probability: 0.52 },
          { value: 2, label: t('Inutilizable'), probability: 0.46 },
        ],
        confidence: 0.28,
      },
      { type: 'predicate', name: 'relato_cuadra', probability: 0.97 },
    ],
    usage: { input_tokens: 1419, input_tokens_details: { cached_tokens: 0 }, output_tokens: 0 },
  };
}

const facts = () => [
  ['×10', t('más rápida que GPT-6 Luna con la Responses API, según el lanzamiento')],
  ['400', t('preguntas por llamada: sí/no, opciones o escalas')],
  ['128', t('imágenes y hasta 32 MB por petición')],
  [usd(price('input', 0.1)), t('por millón de tokens de entrada; la salida es gratis')],
  [usd(price('cached_input', 0.01)), t('por millón de tokens en caché: el contexto repetido cuesta una décima parte')],
  ['1024', t('tokens de prefijo común bastan para activar la caché implícita')],
];

const measured = () => [
  ['211/211', t('decisiones como se esperaba en los cinco casos')],
  [`~${secs(2)}`, t('mediana por llamada con imágenes o documentos; {a}–{b} en los pasos de solo texto', { a: secs(0.4), b: secs(0.7) })],
  [fmt.pct(0.37), t('menos coste gracias a la caché en la evaluación completa')],
  [`< ${fmt.eur(0.01)}`, t('las 55 llamadas de la evaluación completa')],
];

const MEDIA = [
  ['image', '🖼️', N_('Imagen')],
  ['text', '📝', N_('Texto')],
  ['json', '{ }', N_('JSON')],
  ['rule', '⚙️', N_('Regla determinista')],
];

export const mediaLegend = () =>
  h(
    'div',
    { class: 'dx-legend' },
    MEDIA.map(([media, icon, label]) => h('span', { class: `dx-media m-${media}` }, icon, ' ', t(label))),
  );

/** The case 1 cascade drawn in columns from its steps: each column is one call, with the outcomes on the right. */
function cascadeFlow() {
  const sc = DX.cases.find((c) => c.kind === 'cascade');
  if (!sc) return null;
  const cols = cascadeColumns(sc);
  const node = (s) =>
    h(
      'a',
      { class: 'dxf-node', href: `#dx-${sc.id}` },
      h('span', { class: 'dxf-id' }, s.id),
      h('b', null, `${s.icon} ${s.title}`),
      h(
        'span',
        { class: 'dxf-media' },
        s.inputs.map((k) => mediaChip(sc, k, { short: true })),
      ),
    );
  const arrow = () => h('span', { class: 'flow-arrow', 'aria-hidden': 'true' }, '→');
  const parts = [];
  cols.forEach((col, i) => {
    if (i) parts.push(arrow());
    parts.push(h('div', { class: 'dxf-col' }, col.map(node)));
  });
  parts.push(arrow());
  parts.push(
    h(
      'div',
      { class: 'dxf-col dxf-out' },
      Object.values(sc.outcomes).map((o) => stamp(o, 'sm')),
    ),
  );
  return [
    h('div', { class: 'dx-flow' }, parts),
    h('div', { class: 'dxf-foot' }, mediaLegend(), h('p', { class: 'flow-caption' }, t('Cada columna es una llamada a la API y su respuesta elige la siguiente. Los pasos con imagen tardan 1–3 s; los de solo texto, medio segundo. Lo dudoso pasa a una persona.'))),
  ];
}

export function mountDxIntro(stage, notes) {
  const first = DX.cases[0];
  const cards = DX.cases.map((sc) =>
    h(
      'a',
      { class: 'case-card', href: `#dx-${sc.id}` },
      h('span', { class: 'cc-icon' }, sc.icon),
      h('span', { class: 'cc-num' }, t('Caso {n}', { n: sc.order })),
      h('b', { class: 'cc-title' }, sc.title),
      h('span', { class: 'cc-head' }, sc.headline),
      h('span', { class: 'cc-sector' }, `${sc.sector} · ${sc.brand}`),
    ),
  );
  const list = (items) => h('ul', null, items.map((txt) => h('li', null, txt)));
  stage.replaceChildren(
    h(
      'div',
      { class: 'intro dx-intro' },
      h(
        'section',
        { class: 'hero' },
        h('div', { class: 'case-kicker' }, t('Ahora en Microsoft Foundry')),
        h('h1', null, t('OpenAI Decisions API: decisiones sobre imágenes, documentos y datos')),
        h(
          'p',
          { class: 'lead' },
          rich(
            t(
              'La misma idea que Decision-1, preguntas cerradas con su probabilidad y salida gratis, ahora **con imágenes**, documentos largos **en caché** y hasta 400 preguntas por llamada. Y como cada decisión tarda un segundo, se pueden **encadenar**: la respuesta de una elige la siguiente.',
            ),
          ),
        ),
        h(
          'div',
          { class: 'hero-cta' },
          first ? h('a', { class: 'btn primary', href: `#dx-${first.id}` }, t('▶ Empezar por el caso 1'), ' ', h('kbd', null, '→')) : null,
          h('a', { class: 'btn', href: '#intro' }, t('⚡ Volver a Decision-1')),
        ),
      ),
      h(
        'div',
        { class: 'versus' },
        h(
          'div',
          { class: 'vs-card fast' },
          h('div', { class: 'vs-title' }, t('⚡ Microsoft-Decision-1')),
          list([
            t('Texto y JSON'),
            t('~300 ms por llamada'),
            t('{precio}/M tokens de entrada', { precio: usd(0.042, 3) }),
            t('Hasta 255 preguntas por llamada'),
            t('Para volumen masivo y tiempo real'),
          ]),
        ),
        h(
          'div',
          { class: 'vs-card dx' },
          h('div', { class: 'vs-title' }, t('🖼️ OpenAI Decisions API')),
          list([
            t('Imágenes, texto y JSON en la misma petición'),
            t('1–3 s con imagen; ~0,5 s solo con texto'),
            t('{precio}/M tokens de entrada; {cache}/M en caché', { precio: usd(price('input', 0.1)), cache: usd(price('cached_input', 0.01)) }),
            t('Hasta 400 preguntas por llamada'),
            t('Para fotos, documentos y cascadas de decisiones'),
          ]),
        ),
      ),
      h('div', { class: 'section-title' }, h('span', null, t('📈 Datos del lanzamiento'))),
      h(
        'div',
        { class: 'facts' },
        facts().map(([b, txt]) => h('div', { class: 'fact' }, h('b', null, b), h('span', null, txt))),
      ),
      h('div', { class: 'section-title' }, h('span', null, t('🔬 Medido en esta demo'))),
      h(
        'div',
        { class: 'facts measured' },
        measured().map(([b, txt]) => h('div', { class: 'fact' }, h('b', null, b), h('span', null, txt))),
      ),
      h('div', { class: 'section-title' }, h('span', null, t('🔗 Una cascada de decisiones (caso 1)'))),
      cascadeFlow(),
      h('div', { class: 'section-title' }, h('span', null, t('🧩 Así es una llamada')), h('span', { class: 'muted small' }, t('Paso C de la reclamación 1: {ms} y {n} tokens de entrada', { ms: fmt.ms(2424), n: fmt.int(1419) }))),
      h(
        'div',
        { class: 'sample' },
        h('div', null, h('div', { class: 'im-label' }, t('Petición: imagen, texto y preguntas')), h('pre', { class: 'json', html: jsonHtml(sampleRequest()) })),
        h('div', null, h('div', { class: 'im-label' }, t('Respuesta: cada decisión con su probabilidad')), h('pre', { class: 'json', html: jsonHtml(sampleResponse()) })),
      ),
      h('div', { class: 'section-title' }, h('span', null, t('🗂️ Los cinco casos'))),
      h('div', { class: 'case-cards' }, cards),
    ),
  );

  const d = S.config?.decision || {};
  const model = DX.data?.model || 'gpt-6-luna';
  notes.replaceChildren(
    h(
      'div',
      { class: 'notes-case' },
      h('div', { class: 'notes-kicker' }, t('OpenAI Decisions API · notas para el presentador')),
      note(
        '🎤',
        t('Mensajes clave'),
        noteList([
          rich(t('**Ahora también con imágenes:** la misma forma de decidir que Decision-1, preguntas cerradas con su probabilidad, sobre fotos, documentos y JSON.')),
          rich(t('**Contexto en caché:** políticas, guías y contratos se leen una vez; las llamadas siguientes los pagan a {precio}/M tokens, una décima parte.', { precio: usd(price('cached_input', 0.01)) })),
          rich(t('**Cascadas:** cada decisión tarda 1–3 s con imagen y medio segundo con texto, así que se encadenan: la respuesta de una elige la siguiente (caso 1).')),
          rich(t('**Salida gratis y sin texto que validar:** cada respuesta es sí/no, una opción o un nivel, con su probabilidad.')),
          rich(t('**Reglas deterministas alrededor:** el modelo responde y la acción la deciden las reglas de la empresa: plazos, política o matriz de riesgos.')),
        ]),
      ),
      note(
        '⚖️',
        t('¿Decision-1 o Decisions API?'),
        noteList([
          rich(t('**Decision-1:** texto y JSON, ~300 ms y {precio}/M tokens. Volumen masivo y tiempo real.', { precio: usd(0.042, 3) })),
          rich(t('**Decisions API:** imágenes, documentos largos en caché y hasta 400 preguntas. Fotos, inspecciones y revisiones.')),
          rich(t('**Juntas:** Decision-1 filtra y enruta el texto; la Decisions API mira las imágenes y los documentos.')),
        ]),
      ),
      note(
        '🌍',
        t('Disponibilidad'),
        noteList([
          rich(t('**Esta demo:** despliegue {model} en el recurso de Foundry de {region}.', { model, region: regionLabel(d.location) })),
          rich(t('**Llamada:** POST /openai/v1/decisions con Microsoft Entra ID; el campo model es el nombre del despliegue.')),
          rich(t('**Entrada:** texto, imágenes y JSON en los mensajes de usuario; los mensajes developer solo admiten texto.')),
          rich(t('**Caché implícita:** se reutiliza el inicio común de la entrada a partir de 1024 tokens; las preguntas no cuentan.')),
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
            ['0–5', t('portada y casos')],
            [t('Espacio'), t('procesar el caso')],
            ['R', t('reiniciar')],
            ['N', t('mostrar u ocultar notas')],
            ['?', t('todos los atajos')],
          ].map(([k, txt]) => h('div', null, h('kbd', null, k), ' ', txt)),
        ),
      ),
    ),
  );
  return {};
}
