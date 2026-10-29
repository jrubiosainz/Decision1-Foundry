// Translations: introduction and Lab (intro.js, lab.js).
export default {
  // intro.js · sample request and response
  'Cliente: "Huele a gas en el portal desde esta mañana. Tengo dos niños pequeños en casa."': 'Customer: "There has been a smell of gas in the building lobby since this morning. I have two small children at home."',
  '¿Qué equipo debe atender el ticket?': 'Which team should handle the ticket?',
  'Averías y emergencias': 'Faults and emergencies',
  'Facturación': 'Billing',
  'Otros': 'Other',
  '¿Con qué urgencia hay que actuar?': 'How urgently do we need to act?',
  'Baja': 'Low',
  'Media': 'Medium',
  'Alta': 'High',
  'Crítica': 'Critical',
  '¿Hay riesgo para la seguridad de las personas?': "Is there a risk to people's safety?",

  // intro.js · figures
  'más rápido que GPT-6 Sol en latencia p50': 'faster than GPT-6 Sol in p50 latency',
  'benchmarks (~{n} preguntas) con la mejor precisión media': 'benchmarks (~{n} questions) with the best average accuracy',
  'por millón de tokens de entrada; la salida es gratis': 'per million input tokens; output is free',
  'de decisiones cambian ante perturbaciones; 0 al reordenar o parafrasear opciones': 'of decisions change under perturbations; 0 when options are reordered or paraphrased',
  'preguntas por llamada: un lote entero en una sola petición': 'questions per call: a whole batch in a single request',
  'más barato que GPT-6 Sol en Xbox Research, con calidad comparable': 'cheaper than GPT-6 Sol on Xbox Research, with comparable quality',
  'p50 por llamada (Spain Central, DataZone UE)': 'p50 per call (Spain Central, DataZone EU)',
  'decisiones principales correctas en los casos 1 a 5': 'main decisions correct in cases 1 to 5',
  'por lote de 12 a 16 elementos, en ~1 s': 'per batch of 12 to 16 items, in ~1 s',
  'más rápido (en caliente) y más barato que GPT-6 Sol con el mismo lote': 'faster (warm) and cheaper than GPT-6 Sol on the same batch',

  // intro.js · Decision-1 inside an agent
  '🧭 Skill': '🧭 Skill',
  '📂 Archivos': '📂 Files',
  '🗜️ Contexto': '🗜️ Context',
  '🛡️ Reglas': '🛡️ Rules',
  '🔍 Revisión': '🔍 Review',
  '🌐 Siguiente test': '🌐 Next test',
  '📋 Cobertura': '📋 Coverage',
  'Probar en el laboratorio': 'Try it in the lab',
  '👤 Usuario': '👤 User',
  'Pide un cambio': 'Asks for a change',
  '«El botón Pagar no funciona en Safari»': '“The Pay button doesn’t work in Safari”',
  '⚡ Decision-1 · antes': '⚡ Decision-1 · before',
  'Decide': 'Decides',
  '🧠 LLM principal': '🧠 Main LLM',
  'Ejecuta': 'Executes',
  'Lee, razona y escribe el código: segundos o minutos': 'Reads, reasons and writes the code: seconds or minutes',
  '⚡ Decision-1 · después': '⚡ Decision-1 · after',
  'Valida': 'Validates',
  '✅ Resultado': '✅ Result',
  'Entrega': 'Delivers',
  'Revisado, probado y conforme a las reglas': 'Reviewed, tested and compliant with the rules',
  'No todas las decisiones de un agente necesitan razonamiento generativo: elegir, filtrar, ordenar y validar son preguntas cerradas. Pulsa una etiqueta para probarla en el laboratorio.':
    'Not every decision an agent makes needs generative reasoning: choosing, filtering, sorting and validating are closed questions. Click a tag to try it in the lab.',

  // intro.js · page
  'Caso {n}': 'Case {n}',
  'Nuevo en Microsoft Foundry': 'New in Microsoft Foundry',
  'Microsoft-Decision-1: decisiones en milisegundos': 'Microsoft-Decision-1: decisions in milliseconds',
  'No genera texto: **decide**. Recibe un estado y preguntas cerradas y devuelve, en una sola pasada, cada respuesta con su probabilidad calibrada. Rápido, barato y consistente para las miles de microdecisiones que hoy hacen personas o LLMs caros.':
    'It does not generate text: it **decides**. It takes a state and closed questions and returns, in a single pass, every answer with its calibrated probability. Fast, cheap and consistent for the thousands of micro-decisions that people or expensive LLMs make today.',
  '▶ Empezar por el caso 1': '▶ Start with case 1',
  '🧪 Laboratorio': '🧪 Lab',
  '🐢 Sistema 2 · LLM generativo': '🐢 System 2 · Generative LLM',
  'Razona y escribe token a token': 'Reasons and writes token by token',
  'Segundos por respuesta': 'Seconds per answer',
  'Pagas cada token de salida': 'You pay for every output token',
  'Texto libre que hay que validar': 'Free text you have to validate',
  'Puede cambiar de opinión entre llamadas': 'May change its mind between calls',
  '⚡ Sistema 1 · Decision-1': '⚡ System 1 · Decision-1',
  'Una sola pasada, sin generar texto': 'A single pass, no text generation',
  'Cientos de milisegundos': 'Hundreds of milliseconds',
  'Salida gratis, entrada a {precio}/M tokens': 'Output is free, input at {precio}/M tokens',
  'Probabilidad calibrada en cada respuesta': 'Calibrated probability on every answer',
  'Estable: misma entrada, misma decisión': 'Stable: same input, same decision',
  '📈 Datos del lanzamiento': '📈 Launch figures',
  '🔬 Medido en esta demo': '🔬 Measured in this demo',
  '🧩 Así es una llamada': '🧩 What a call looks like',
  'Petición: estado + preguntas': 'Request: state + questions',
  'Respuesta: decisión + probabilidades': 'Response: decision + probabilities',
  '🗂️ Los seis casos': '🗂️ The six cases',
  '🤖 Y dentro de tus agentes de IA': '🤖 And inside your AI agents',

  // intro.js · notes
  'Introducción · notas para el presentador': 'Introduction · presenter notes',
  'Mensajes clave': 'Key messages',
  '**Nuevo paradigma:** un modelo que decide, no que escribe. Se integra en línea con cada evento del proceso.':
    '**New paradigm:** a model that decides, not one that writes. It plugs in inline with every event in the process.',
  '**Coste casi cero:** salida gratis y {precio} por millón de tokens de entrada. Miles de decisiones por céntimos.':
    '**Near-zero cost:** free output and {precio} per million input tokens. Thousands of decisions for cents.',
  '**Velocidad de Sistema 1:** cientos de milisegundos. 20 decisiones encadenadas caben en ~2 s.':
    '**System 1 speed:** hundreds of milliseconds. 20 chained decisions fit in ~2 s.',
  '**Confianza calibrada:** un {pct} acierta 9 de cada 10. El umbral decide qué se automatiza y qué revisa una persona.':
    '**Calibrated confidence:** a {pct} answer is right 9 times out of 10. The threshold decides what gets automated and what a person reviews.',
  '**Tiempo real:** en el caso 6 Decision-1 y un LLM juegan a la vez a Space Invaders. El mundo no espera: la latencia se convierte en puntos.':
    "**Real time:** in case 6, Decision-1 and an LLM play Space Invaders at the same time. The world doesn't wait: latency turns into points.",
  'Disponibilidad': 'Availability',
  '**Esta demo:** {region} · {sku} · {rpm} RPM': '**This demo:** {region} · {sku} · {rpm} RPM',
  '**DataZone UE (7):** Spain Central, Sweden Central, West Europe, France Central, Germany West Central, Italy North y Poland Central.':
    '**DataZone EU (7):** Spain Central, Sweden Central, West Europe, France Central, Germany West Central, Italy North and Poland Central.',
  '**DataZone EE. UU. (9)** y **Global Standard (31 regiones).**': '**DataZone US (9)** and **Global Standard (31 regions).**',
  '**Cuota:** con pocas RPM, el modo lote mete hasta 255 preguntas en una llamada. El caso 6 pide una decisión por segundo a cada modelo: necesita ~60 RPM.':
    '**Quota:** with few RPM, batch mode packs up to 255 questions into one call. Case 6 asks each model for one decision per second: it needs ~60 RPM.',
  '¿Decision-1 o un LLM?': 'Decision-1 or an LLM?',
  '**Decision-1:** clasificar, priorizar, enrutar, validar, filtrar, puntuar… preguntas cerradas, a gran volumen y en tiempo real.':
    '**Decision-1:** classifying, prioritizing, routing, validating, filtering, scoring… closed questions, at high volume and in real time.',
  '**LLM:** redactar, resumir, conversar y razonar en abierto.': '**LLM:** drafting, summarizing, conversing and open-ended reasoning.',
  '**Juntos:** Decision-1 decide qué, quién y cuándo; el LLM solo trabaja donde aporta (caso 4).':
    '**Together:** Decision-1 decides what, who and when; the LLM only works where it adds value (case 4).',
  'Decision-1 dentro de los agentes': 'Decision-1 inside agents',
  '**Patrón:** el LLM ejecuta; Decision-1 decide, filtra y enruta antes y valida después. Hay 7 plantillas listas en el laboratorio.':
    '**Pattern:** the LLM executes; Decision-1 decides, filters and routes before, and validates after. There are 7 ready-made templates in the lab.',
  '**Medido:** 12 archivos ordenados en {a}, 6 reglas comprobadas en {b} y 10 mensajes compactados en {c}; ~{coste} por llamada.':
    '**Measured:** 12 files sorted in {a}, 6 rules checked in {b} and 10 messages compacted in {c}; ~{coste} per call.',
  '**Ya en la demo:** el caso 4 es un skill picker de negocio y el caso 5, rule enforcement.':
    '**Already in the demo:** case 4 is a business skill picker and case 5 is rule enforcement.',
  '**Ojo:** Decision-1 también puede fallar. Para bloquear o aprobar, combínalo con comprobaciones deterministas.':
    '**Heads up:** Decision-1 can also get it wrong. To block or approve, combine it with deterministic checks.',
  'Atajos': 'Shortcuts',
  'anterior / siguiente': 'previous / next',
  'portada y casos': 'home and cases',
  'laboratorio': 'lab',
  'Espacio': 'Space',
  'procesar · jugar o pausar': 'process · play or pause',
  'carrera': 'race',
  'lote / uno a uno': 'batch / one by one',
  'reiniciar': 'reset',
  'mostrar u ocultar notas': 'show or hide notes',

  // lab.js · validation errors
  'Las preguntas no son un JSON válido: {detalle}': 'The questions are not valid JSON: {detalle}',
  'Las preguntas deben ser un objeto JSON: { "nombre": { "type": "choice" | "score" | "noul", … } }':
    'The questions must be a JSON object: { "name": { "type": "choice" | "score" | "noul", … } }',
  'Escribe un estado: el texto o el JSON sobre el que decidir.': 'Enter a state: the text or JSON to decide on.',

  // lab.js · results
  'Ranking': 'Ranking',
  '{n} de {total} · {yes} si ≥ {umbral}': '{n} of {total} · {yes} if ≥ {umbral}',
  'Decision-1 está decidiendo…': 'Decision-1 is deciding…',
  '⚡ Elige una plantilla o escribe la tuya': '⚡ Pick a template or write your own',
  'Pulsa Decidir (Ctrl+Enter). Verás cada respuesta con sus probabilidades, la latencia y el coste.':
    "Click Decide (Ctrl+Enter). You'll see every answer with its probabilities, the latency and the cost.",
  'Latencia': 'Latency',
  '{ms} de reloj': '{ms} wall-clock',
  '1 sola llamada': 'Just 1 call',
  'Tokens': 'Tokens',
  'entrada → salida': 'input → output',
  'Coste': 'Cost',
  '{coste} por {n} llamadas': '{coste} per {n} calls',

  // lab.js · page
  'Preguntas en JSON': 'Questions in JSON',
  '⚡ Decidir': '⚡ Decide',
  'Pruébalo con tus propios datos': 'Try it with your own data',
  'Un estado y unas preguntas cerradas: Decision-1 responde a todas a la vez, cada una con su probabilidad.':
    'A state and some closed questions: Decision-1 answers them all at once, each with its probability.',
  '📚 Plantillas': '📚 Templates',
  'Estado · texto o JSON': 'State · text or JSON',
  'Preguntas · JSON con type choice, score o noul': 'Questions · JSON with type choice, score or noul',
  '{ } Formatear': '{ } Format',

  // lab.js · notes
  'Laboratorio · notas para el presentador': 'Lab · presenter notes',
  'Cómo usarlo con el cliente': 'How to use it with the customer',
  'Pide un ejemplo real (anonimizado) de su proceso: un ticket, una reseña, un correo o una conversación.':
    'Ask for a real (anonymized) example from their process: a ticket, a review, an email or a conversation.',
  'Formula en voz alta las decisiones que hoy toma una persona y escríbelas como preguntas cerradas.':
    'Say out loud the decisions a person makes today and write them down as closed questions.',
  'Pulsa Decidir: en menos de un segundo tienes todas las respuestas, con su probabilidad.':
    'Click Decide: in under a second you get all the answers, each with its probability.',
  'Dentro de un agente de IA': 'Inside an AI agent',
  '**Capa de decisiones:** el LLM principal ejecuta; Decision-1 elige skill, archivos y contexto antes, y valida reglas, riesgo y siguiente test después.':
    '**Decision layer:** the main LLM executes; Decision-1 picks the skill, files and context before, and validates rules, risk and the next test after.',
  '**~{s} y ~{coste} por llamada:** cabe en un hook en cada paso del agente.': '**~{s} and ~{coste} per call:** fits in a hook at every step of the agent.',
  '**Ojo:** para bloquear o aprobar, combínalo con comprobaciones deterministas (tests, linters, permisos).':
    '**Heads up:** to block or approve, combine it with deterministic checks (tests, linters, permissions).',
  'Tres tipos de pregunta': 'Three question types',
  '**choice:** elige una opción. criteria = { clave: descripción }.': '**choice:** picks one option. criteria = { key: description }.',
  '**score:** nivel en una escala ordenada. criteria = [de menor a mayor].': '**score:** a level on an ordered scale. criteria = [from lowest to highest].',
  '**noul:** sí o no, sin criteria. Devuelve la probabilidad de «sí».': '**noul:** yes or no, no criteria. Returns the probability of “yes”.',
  'Límites': 'Limits',
  '**API:** hasta 255 preguntas por llamada y {tokens} tokens.': '**API:** up to 255 questions per call and {tokens} tokens.',
  '**Este laboratorio:** 32 preguntas y {chars} caracteres de estado.': '**This lab:** 32 questions and {chars} characters of state.',
  '**Estado:** texto libre o JSON (por ejemplo, un ticket con sus campos).': '**State:** free text or JSON (for example, a ticket with its fields).',
  'Buenas preguntas': 'Good questions',
  'Una decisión por pregunta, con instrucciones concretas.': 'One decision per question, with specific instructions.',
  'Describe bien cada opción: el modelo decide con esa descripción.': 'Describe each option well: the model decides based on that description.',
  'Usa la confianza: automatiza por encima del umbral y revisa el resto.': 'Use the confidence: automate above the threshold and review the rest.',
};
