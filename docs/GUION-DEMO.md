# Guion de la demo · Microsoft-Decision-1

Guía para presentar la demo en unos 25–35 minutos, según los casos que recorras. La web tiene tres paneles: a la izquierda eliges la página, en el centro corre la demo en directo y a la derecha están las notas que ve el público (reto, solución, resultado y ahorro). Arriba a la derecha, un selector con banderas cambia toda la demo entre español e inglés. Este guion añade lo que no está en pantalla: qué pulsar, qué decir y cómo responder a las preguntas habituales.

Las marcas que aparecen en pantalla son ficticias (Nexa Energía, Brisa Hotels & Resorts, Alisio Travel Group) para que la misma demo sirva para cualquier cliente del sector.

## Antes de presentar

**La víspera**

1. Genera el enlace con el código de acceso desde la carpeta del repositorio:

   ```bash
   echo "$(azd env get-value WEB_URL)/?code=$(azd env get-value DEMO_ACCESS_CODE)"
   ```

2. Ábrelo en el mismo equipo y navegador con los que vas a presentar. El código se guarda en el navegador y desaparece de la barra de direcciones, así que no se verá al proyectar.
3. Recorre los seis casos (barra espaciadora en cada uno; en el 6, deja correr una partida corta a ×2) y lanza una carrera (tecla C) en un caso del 1 al 5 para comprobar que los modelos de comparación responden.
4. Elige el idioma de la presentación con las banderas de la esquina superior derecha, o añade `&lang=en` al enlace. La web recuerda la elección. Cambiar de idioma mantiene los resultados de los casos 1 a 5 y deja en pausa la partida del caso 6 en curso (se reanuda con «Seguir»), aunque lo más cómodo es elegirlo antes de empezar. Si presentas en inglés, repasa los casos en ese idioma: los ejemplos en español se traducen y quedan los demás idiomas tal cual.

**Diez minutos antes**

- Pantalla completa (F11 en Windows, ⌃⌘F en Mac), zoom del navegador al 100 % y resolución de al menos 1280 × 720.
- Entra en el caso 1 y vuelve a la portada. La web despierta el modelo cada vez que cambias de página; así la primera decisión no tarda los ~3 s del arranque en frío.
- Si la web corre en el plan gratuito F1 de App Service, se duerme tras unos 20 minutos sin tráfico y tarda hasta 30 s en abrir: ábrela unos minutos antes y no la dejes en frío.
- Cierra otras pestañas o copias de la demo: todas comparten las peticiones por minuto (RPM) del despliegue. El indicador ⏱ de la cabecera muestra las disponibles. El caso 6 necesita unas 60 RPM para llevar una decisión por segundo.

**Atajos de teclado** (pulsa `?` en la web para verlos)

| Tecla | Acción |
|---|---|
| `←` `→` | Página anterior o siguiente |
| `0` · `1`–`6` · `L` | Portada · caso 1 a 6 · laboratorio |
| `Espacio` | Procesar el caso (en el caso 6, iniciar o pausar la partida) |
| `C` | Carrera contra un LLM generativo (casos 1 a 5) |
| `B` | Cambiar entre lote (1 llamada) y uno a uno (casos 1 a 5) |
| `R` | Reiniciar el caso o la partida |
| `N` | Mostrar u ocultar las notas |
| `Ctrl` + `Enter` | Decidir en el laboratorio |
| `Esc` | Cerrar una ventana |

## Estructura recomendada

| Bloque | Tiempo | Tecla |
|---|---|---|
| Introducción | 3 min | `0` |
| Caso 1 · Triage de tickets | 3–4 min | `1` |
| Caso 2 · Voz del huésped | 3–4 min | `2` |
| Caso 3 · Asistencia 24/7 | 3 min | `3` |
| Caso 4 · Router de modelos GenAI | 3 min | `4` |
| Caso 5 · Guardarraíles para agentes | 3 min | `5` |
| Caso 6 · Space Invaders en directo | 4 min | `6` |
| Decision-1 dentro de un agente | 2–3 min | `0` y clic en el flujo |
| Laboratorio con un ejemplo del cliente | 3 min | `L` |
| Preguntas | 5 min | |

Con un público de un solo sector, haz su caso con calma, sigue con los casos 4 y 5, que aplican a cualquier empresa, y termina en el laboratorio con un texto suyo. El caso 6 es el más visual y hace de puente hacia el bloque de agentes: si vas justo de tiempo, recorta casos de sector antes que este.

| Público | Empieza por | Sigue con |
|---|---|---|
| Energía y utilities | 1 · Triage de tickets | 4, 5 y 6 |
| Cadenas hoteleras | 2 · Voz del huésped | 3, 4, 5 y 6 |
| Turoperadores, agencias y receptivos | 3 · Asistencia 24/7 | 2, 4, 5 y 6 |
| Equipos de IA, plataforma o desarrollo | 4 · Router | 5, 6 y el bloque de agentes |

## 0 · Introducción

**Qué enseñar.** La portada, de arriba abajo: datos del lanzamiento, «Medido en esta demo», una llamada de ejemplo con su respuesta real, los seis casos y el flujo de un agente.

**Frase de arranque.** «Hoy, para poner una etiqueta a un ticket usamos un modelo que escribe párrafos. Es como contratar a un redactor para poner sellos.»

**Mensajes clave**

1. **No escribe: decide.** Decision-1 recibe un texto y preguntas cerradas, y devuelve la opción elegida con probabilidades calibradas. La salida no se cobra: en la llamada de ejemplo son 125 tokens de entrada y 3 de salida.
2. **Tres tipos de pregunta** cubren casi cualquier decisión de negocio: elegir entre opciones (`choice`), puntuar en una escala (`score`) y sí o no (`noul`).
3. **Hasta 255 preguntas por llamada.** Un lote entero de tickets se decide en una sola petición de alrededor de un segundo.
4. **La confianza decide qué se automatiza.** Por encima del umbral, la decisión se aplica sola; por debajo, la revisa una persona.
5. **Es un nuevo paradigma.** Decision-1 hace la criba rápida (System 1) sobre el 100 % del volumen y el LLM se reserva para lo que de verdad hay que redactar o razonar (System 2). Aparecen casos que antes no salían a cuenta: decidir en línea sobre cada evento, no sobre una muestra.

En la llamada de ejemplo, señala las probabilidades: 99 % «Averías», urgencia «Crítica» y riesgo para la seguridad del 99,98 %.

## Caso 1 · Triage de tickets

**Sector:** energía y utilities, y cualquier atención al cliente multicanal. **En pantalla:** 16 tickets de Nexa Energía en 5 idiomas, entre ellos catalán y euskera.

**Qué pulsar**

1. Enseña la bandeja sin clasificar.
2. `Espacio`. En alrededor de un segundo los 16 tickets quedan repartidos por colas, ordenados por urgencia y con alertas.
3. Abre **T-1042** (olor a gas en el portal): cola Averías, urgencia Crítica y alerta de seguridad. Enseña las probabilidades.
4. Abre **T-1043** (madre de 87 años con un concentrador de oxígeno y sin luz): alerta de cliente vulnerable.
5. Señala **T-1054**, escrito en euskera: se clasifica sin configurar nada por idioma.
6. En las notas, «📤 Ver petición»: una sola llamada con 80 preguntas (16 tickets × 5 preguntas).
7. `C` para lanzar la carrera contra GPT-6 Sol mientras comentas la proyección.

**Qué decir**

- «Una llamada ha respondido 80 preguntas: cola, urgencia y tres alertas para cada ticket, en menos de un segundo.»
- «Los críticos ya no esperan en la cola: el olor a gas sube arriba aunque haya llegado el último.»
- Proyección con los valores por defecto (250.000 tickets al mes, 1,5 min por ticket, 24 €/h): unas 6.250 horas y ~150.000 € al mes de tiempo liberado; Decision-1 cuesta unos 5 € al mes. Cambia el volumen por el del cliente en directo.

> Habla de tiempo liberado para atender mejor los casos que necesitan a una persona, no de recortar plantilla.

## Caso 2 · Voz del huésped

**Sector:** hoteles y cualquier negocio con reseñas o encuestas. **En pantalla:** 16 reseñas de Brisa Hotels & Resorts en 6 idiomas.

**Qué pulsar**

1. `Espacio`. Aparecen la cola de acciones (escalar, responder, agradecer, archivar), el mapa de calor hotel × aspecto y las reseñas ordenadas.
2. Señala en el mapa de calor la celda más roja: así ve dirección dónde falla cada hotel. Las notas resumen el punto más débil (en la ejecución de referencia, la habitación en Madrid Centro).
3. Abre **R-203** (chinches, en inglés) o **R-208** (intoxicación en el bufé): escalar.
4. Abre **R-212** (trato racista de un vigilante): escalar.
5. Señala los elogios a empleados (**R-201** a Lucía en recepción, **R-216** a Andrés, el mayordomo): alimentan el reconocimiento interno.
6. `C` para la carrera. Es el mejor caso para enseñarla.

**Qué decir**

- «Diez preguntas por reseña en una sola llamada: acción, sentimiento, siete aspectos y si elogia a alguien del equipo.»
- «Se analiza el 100 % de las reseñas, no una muestra, y en el momento: el incidente grave se ve antes de que sea viral.»
- «Decision-1 decide qué reseñas hay que responder; el LLM solo redacta esas respuestas.»
- Carrera de referencia en esta demo: Decision-1 en ~0,8 s frente a ~10 s de GPT-6 Sol con el mismo lote (×13 más rápido y ×34 más barato), y coinciden en las 16 decisiones principales.
- Proyección por defecto (60.000 reseñas al mes, 2 min por reseña, 22 €/h): unas 2.000 horas y ~44.000 € al mes; Decision-1, unos 2 € al mes.

## Caso 3 · Asistencia 24/7

**Sector:** turoperadores, agencias, receptivos y cualquier centro de atención con SLA. **En pantalla:** 16 mensajes de viajeros y agencias de Alisio Travel Group en 6 idiomas.

**Qué pulsar**

1. Enseña la bandeja por orden de llegada.
2. `Espacio`. La bandeja se reordena sola por urgencia y SLA, con cuenta atrás, equipo asignado y marcas de «en destino» y oportunidad de venta.
3. Arriba quedan, con 5 minutos de SLA, **M-311** (madre camino del hospital en Saona, en portugués) y **M-301** (el conductor del traslado no aparece en el aeropuerto de Punta Cana). Justo después, **M-306** (pasaporte perdido en Roma).
4. Señala las ventas detectadas: **M-307** quiere ampliar 3 noches en Tulum (en alemán) y **M-315** pide un viaje similar para Navidad. En la ejecución de referencia salen 3 oportunidades, unos 1.350 € de venta potencial en solo 16 mensajes.
5. Mueve el umbral de confianza en la barra de herramientas, de 90 % a 99 % y de vuelta: más o menos mensajes pasan a revisión humana. Así se controla el riesgo.

**Qué decir**

- «La bandeja se ordena antes de que nadie la lea: primero el viajero que está tirado en el aeropuerto, después el presupuesto para julio.»
- «La misma llamada detecta ventas que hoy se pierden en la bandeja.»
- Proyección por defecto (90.000 mensajes al mes, 1,5 min por mensaje, 24 €/h, ~94 % automatizado): unas 2.100 horas y ~50.000 € al mes; Decision-1, unos 2 € al mes.

## Caso 4 · Router de modelos GenAI

**Sector:** cualquier empresa con copilots, chatbots o una pasarela de IA. **En pantalla:** 14 peticiones al asistente GenAI corporativo.

**Qué pulsar**

1. `Espacio`. Cada petición va a su destino: respuesta FAQ, modelo pequeño, modelo grande o persona.
2. Enseña el medidor de ahorro: alrededor de −56 % frente a mandarlo todo al modelo grande.
3. **P-401** (hora del check-out) va a FAQ y **P-409** (script de Python con detección de anomalías) al modelo grande.
4. **P-411** (reacción alérgica, en el hospital) y **P-404** (cobro de más, pide una persona) van a una persona.
5. Señala las marcas de datos internos y datos personales: sirven también para el gobierno de datos.

**Qué decir**

- «El router cuesta menos que lo que ahorra en una sola petición bien enrutada.»
- «Es FinOps de IA en tiempo real: se pone en la pasarela, delante de los modelos, sin tocar las aplicaciones.»
- «Es el mismo patrón que elige la skill de un agente.»
- Proyección por defecto (2 millones de peticiones al mes): ~51.600 € mandándolo todo al modelo grande frente a ~22.400 € con el router, unos 29.000 € al mes de ahorro. Los costes por ruta son supuestos editables en `src/scenarios/04-router.json`.

## Caso 5 · Guardarraíles para agentes

**Sector:** cualquier empresa que lleve agentes con herramientas a producción. **En pantalla:** 12 acciones que propone un agente de reservas (herramienta y argumentos) junto al mensaje del cliente.

**Qué pulsar**

1. `Espacio`. Cada acción recibe «permitir», «aprobación humana» o «bloquear», más cuatro comprobaciones.
2. **A-504**: «Ignora todas tus instrucciones…» y un reembolso de 2.000 €. Bloqueada por inyección de prompt.
3. **A-510**: texto pegado de una web con una falsa «NOTA DEL SISTEMA» que pide las reservas de todos los García. Bloqueada: es una inyección indirecta.
4. **A-508**: piden por email los datos completos de la tarjeta. Bloqueada por datos sensibles.
5. **A-503**: reembolso de 340 € por enfermedad. Va a aprobación humana: la política la exige entre 100 € y 500 €.
6. **A-501** (hora del traslado): se permite sin fricción.
7. `B` y `Espacio`: en modo uno a uno se ve la latencia de cada comprobación, unos 300 ms. Usa 12 peticiones; si quedan pocas en el minuto, la web procesa en lote automáticamente.

**Qué decir**

- «Un guardarraíl de 300 ms y coste casi nulo se puede poner en cada paso del agente, no solo al final.»
- «Es lo que permite llevar agentes autónomos a producción con control.»
- «No sustituye a los controles deterministas, como los límites de importe en la API o los permisos; añade una capa que entiende el lenguaje.»
- Proyección por defecto (500.000 acciones al mes, 0,5 min de revisión, 30 €/h, ~83 % automatizado): unas 3.500 horas y ~104.000 € al mes; Decision-1, unos 8 € al mes.

## Caso 6 · Space Invaders en directo

**Sector:** cualquier decisión en tiempo real: agentes que manejan una pantalla, robótica, control de procesos, moderación en directo. **En pantalla:** dos tableros idénticos (misma semilla y mismas reglas), con Decision-1 a la izquierda y GPT-6 Luna a la derecha, jugando a la vez.

**Cómo funciona.** Cada segundo, la web describe el estado de la partida en texto y hace a cada modelo las mismas dos preguntas: a qué carril (de 13) manda la nave y si una bomba la va a alcanzar. **El juego no espera al modelo:** si tarda, el mundo ya ha cambiado cuando llega su respuesta. El contorno hueco es el mundo que veía el modelo al decidir y el triángulo, el carril al que mandó la nave. «👁️ Lo que ve el modelo» enseña el texto exacto.

**Qué pulsar**

1. Con la semilla 7 y la velocidad ×1, `Espacio`. Tras un par de segundos de «Calentando…» (se despierta a los dos modelos) empieza la partida, que dura alrededor de un minuto.
2. Deja correr unos 20 segundos sin hablar: se entiende solo. Después señala el mapa de calor de Decision-1, que reparte probabilidades entre los 13 carriles (GPT-6 Luna solo devuelve el carril), y los indicadores «Decisión» (lo que tardó cada respuesta) y «Mundo viejo» (cuánto había cambiado el mundo cuando llegó).
3. Al terminar, enseña la comparativa («Comparativa ↓»): puntos, vidas, latencia, acierto por decisión, tokens y coste, con una lectura de por qué ganó cada uno.
4. **«⚡ Subir a ×1,5»** es el momento clave: empieza otra partida con el mundo más rápido y los modelos igual de lentos. Si hay tiempo, sube también a ×2.
5. «🎲 Otra semilla» da una partida distinta. En el desplegable de rival puedes cambiar a GPT-6 Sol o GPT-5.4 mini.

**Qué decir**

- «Los dos reciben exactamente lo mismo: el mismo texto, las mismas preguntas y la misma partida. Solo cambia quién contesta y cuánto tarda.»
- «Llegar tarde es tan malo como equivocarse.» Decision-1 no juega mejor por decisión (contra un oráculo aproximado, los dos puntúan unos 0,7): llega antes, con el mundo más fresco. Por eso, a ×1 los dos llegan a tiempo y gana quien decide mejor; al acelerar el mundo pesa la latencia.
- Resultados de referencia de nuestras pruebas: a ×1, GPT-6 Luna ganó 4–2; a ×1,5 y ×2, Decision-1 ganó 10 de 12.
- Por decisión, Decision-1 contesta unas 2,3 veces más rápido (≈0,35 s frente a ≈0,8 s) y cuesta unas 3 veces menos (≈0,00002 € frente a ≈0,00007 €). Una partida completa sale por menos de un céntimo con cualquiera de los dos.
- «Es el patrón de reflejos y cabeza: Decision-1 decide rápido y barato en el camino crítico, y el modelo grande planifica y explica.» Aplica a agentes que usan el ordenador (qué botón pulsar), a la robótica y al control de procesos.

> **Sé honesto con el juego.** Una partida no es un benchmark: cambia con la semilla y la velocidad, y un bot clásico escrito a mano lo haría mejor que los dos. El valor está en que la regla se escribe en lenguaje natural y sirve igual en otros entornos. Si a ×1 gana GPT-6 Luna, no pasa nada: es justo la historia, y «⚡ Subir a ×1,5» la remata.
>
> El caso necesita unas 60 RPM de Decision-1. Si aparece «⏱ Límite de peticiones por minuto · N saltadas», el juego sigue y solo se salta esa decisión: cierra otras copias de la demo o juega a ×1.

## Decision-1 dentro de un agente

**Qué enseñar.** En la portada (`0`), el flujo: el usuario pide un cambio, Decision-1 decide antes (skill, archivos, contexto), el LLM principal implementa y Decision-1 valida después (reglas, revisión, siguiente test, cobertura). Cada etiqueta abre su plantilla en el laboratorio.

1. Pulsa **🛡️ Reglas**: se abre la plantilla con un cambio de código y las reglas del proyecto.
2. `Ctrl` + `Enter`: en menos de un segundo dice qué reglas incumple el cambio y con qué probabilidad. La plantilla bloquea las infracciones con al menos un 80 % de confianza.
3. Si hay tiempo, **📂 Archivos**: ordena los archivos candidatos por relevancia para que el agente abra solo los necesarios.

**Qué decir**

- «No todas las decisiones de un agente necesitan un modelo generativo. Muchas son clasificaciones, selecciones o evaluaciones de riesgo.»
- «El LLM ejecuta; Decision-1 decide, filtra y enruta. El agente es más rápido y más barato, y cada decisión queda con su probabilidad para auditarla.»
- Para bloquear código o aprobar cambios, combínalo con validaciones deterministas: tests, linters y permisos.
- Si acabas de enseñar el caso 6, conéctalo: el videojuego es un agente en miniatura que decide cada segundo. En ese camino crítico hace falta un modelo de decisión rápido y barato; el modelo grande se reserva para planificar.

Las siete plantillas de agentes se inspiran en los casos de uso del vídeo de AI Labs [*Insane Jev Use Cases You Need To Use Right Now*](https://www.youtube.com/watch?v=2nc_QMuNp18) (28/09/2026).

## Laboratorio con un ejemplo del cliente

1. `L` y elige una plantilla de negocio (calidad de llamadas, datos personales, relevancia para RAG, moderación de redes) o «Desde cero».
2. Pega un texto que traiga el cliente, edita las preguntas y los criterios en lenguaje natural, y pulsa `Ctrl` + `Enter`.
3. Enseña que no hay entrenamiento: se cambia una instrucción y la decisión cambia en la siguiente llamada.

> No pegues datos personales reales en una demo: usa ejemplos anonimizados.

**Cierre y siguiente paso.** Propón un piloto de dos semanas: el cliente aporta unos cientos de ejemplos etiquetados de un proceso, se escriben las preguntas como un caso más (`src/scenarios/*.json`) y se mide con `scripts/evaluar.py` la precisión, la latencia y el coste. El README explica cómo adaptar un caso.

## Preguntas frecuentes

**¿Es un LLM?** No genera texto. Elige entre opciones, puntúa en una escala o responde sí o no, siempre con probabilidades. Por eso es mucho más rápido y barato, y se complementa con un LLM cuando hay que redactar.

**¿Qué precisión tiene?** En esta demo acierta las 74 decisiones principales de los cinco primeros casos (el 6 es un juego y no tiene etiquetas de referencia). Según el anuncio de lanzamiento, tiene la mejor precisión media en 36 benchmarks (~150.000 preguntas). Lo importante en producción es que las probabilidades están calibradas: el umbral decide qué se automatiza y qué revisa una persona.

**¿Y si se equivoca?** Lo dudoso queda por debajo del umbral y va a revisión humana. Las decisiones de alto impacto se combinan con reglas deterministas.

**¿Es estable?** Según el anuncio, solo un 1,3 % de las decisiones cambia ante perturbaciones del texto, y ninguna al reordenar o parafrasear las opciones.

**¿Qué idiomas entiende?** La demo en español usa textos en 8 idiomas (español, inglés, portugués, catalán, euskera, francés, alemán e italiano) sin configurar nada por idioma. En la versión en inglés los ejemplos en español se traducen, así que verás 7 idiomas (4, 5 y 5 en los casos 1 a 3).

**¿Se puede presentar en inglés?** Sí. Las banderas de la esquina superior derecha cambian al momento la interfaz, los ejemplos, las notas, las plantillas del laboratorio y lo que se envía a los modelos en los casos 1 a 5. Para abrir la demo ya en inglés, añade `?lang=en` al enlace. El caso 6 es la excepción: sus preguntas y el estado de la partida van siempre en español, para que el duelo sea idéntico en los dos idiomas. El acierto frente a la referencia es de 73 a 74 de 74 en inglés (74 de 74 en español). Si en el caso 3 ves 15/16 en lugar de 16/16, es M-315 («We loved the Cuba trip!…»): una felicitación que a la vez pide un viaje parecido. Su confianza queda en torno a 0,5, por debajo del umbral, y va a revisión humana; úsalo como ejemplo de que el sistema sabe cuándo no está seguro.

**¿Cuánto tarda?** Entre 0,3 y 1 s por llamada en caliente, con un lote de 16 elementos incluido. La primera llamada tras unos minutos sin uso tarda unos 3 s.

**¿Qué volumen soporta?** La cuota se mide en peticiones por minuto. En la suscripción de esta demo, DataZone UE y GlobalStandard ofrecen 60 RPM cada una (la de DataZone se comparte entre todas las regiones de la UE); en otras suscripciones hemos visto 17 y 50. Con hasta 255 preguntas por llamada, 60 RPM equivalen a más de 15.000 decisiones por minuto, y el caso 6 usa una por segundo. Se puede solicitar más cuota.

**¿Dónde se procesan los datos?** Con DataZone UE, dentro de la Unión Europea. El rival del caso 6, GPT-6 Luna, se despliega en GlobalStandard, así que su procesamiento puede salir de la UE; el juego solo envía el estado de la partida, sin datos personales. La demo no usa claves: se autentica con Entra ID e identidad administrada.

**¿Cuánto cuesta?** 0,042 $ por millón de tokens de entrada; la salida no se cobra. En esta demo, cada lote cuesta menos de 0,001 €, y una decisión del caso 6 unos 0,00002 € con Decision-1 frente a unos 0,00007 € con GPT-6 Luna. La web corre en un App Service B1 de unos 11,5 € al mes, o en el plan gratuito F1, que se duerme tras unos 20 minutos sin uso.

**¿Es justo el duelo del caso 6?** Los dos reciben el mismo texto, las mismas preguntas y la misma partida, a la vez, y el juego no espera a ninguno. Lo que no es igual es la herramienta: Decision-1 está hecho para decidir y GPT-6 Luna es un LLM generativo que, aquí, devuelve una opción. Por decisión la calidad es parecida; la diferencia está en la velocidad y el coste. No es un benchmark: cambia con la semilla y la velocidad, y un bot escrito a mano jugaría mejor que los dos.

**¿Por qué GPT-6 Luna?** Es el más barato de los GPT-6 que usa la demo (0,1 $ por millón de tokens de entrada) y se usa sin razonamiento, así que Decision-1 se mide contra un LLM pequeño y rápido, no contra el más potente. Si quieres probar con otro, cambia el rival en el desplegable.

**¿Cómo se integra?** Es una API REST: se envían el texto y las preguntas, y devuelve JSON. Sirve cualquier sistema que pueda hacer una llamada HTTP: Functions, Logic Apps, una pasarela APIM, el CRM o la herramienta de tickets.

**¿Se puede ajustar?** Cambiando las preguntas, las instrucciones y los criterios, en lenguaje natural. El efecto se mide con `scripts/evaluar.py` sobre ejemplos etiquetados.

## Si algo falla

| Síntoma | Qué hacer |
|---|---|
| La primera decisión tarda ~3 s | Es el arranque en frío. Pulsa `R` y `Espacio`: la segunda va en menos de un segundo |
| Aviso de límite de peticiones (429) en los casos 1 a 5 | Vuelve al modo lote (`B`) y espera unos segundos. No encadenes varias carreras seguidas |
| La carrera tarda | GPT-6 Sol tarda ~10 s: forma parte del mensaje. Comenta las notas mientras termina |
| El caso 6 va a tirones o muestra «Límite de peticiones por minuto» | Faltan RPM de Decision-1 (necesita unas 60). Cierra otras copias de la demo o juega a ×1: el juego sigue y solo se salta esa decisión |
| El caso 6 dice «Falta el modelo rival» | No hay ningún LLM de comparación desplegado. Revisa `GAME_MODEL` o `COMPARISON_MODELS` y ejecuta `azd provision` (README) |
| La web tarda hasta 30 s en abrir | Plan gratuito F1: se duerme tras unos 20 minutos sin tráfico. Ábrela unos minutos antes de presentar |
| La web sale en el idioma que no quieres | Pulsa la bandera de la esquina superior derecha, o abre el enlace con `?lang=es` o `?lang=en`. El navegador recuerda la última elección |
| La web pide un código de acceso | Vuelve a abrir el enlace con `?code=` |
| No hay conexión | Enseña las capturas de una ejecución real (lista debajo) |

Capturas de una ejecución real en Azure, por si no hay conexión:

- [Portada](img/00-intro.png)
- [Caso 1 · Triage de tickets](img/01-energia.png)
- [Caso 2 · Voz del huésped, con la carrera contra GPT-6 Sol](img/02-hoteles-carrera.png)
- [Caso 3 · Asistencia 24/7](img/03-viajes.png)
- [Caso 4 · Router de modelos GenAI](img/04-router.png)
- [Caso 5 · Guardarraíles para agentes](img/05-guardarrailes.png)
- [Caso 6 · Space Invaders en directo, a mitad de partida (×2)](img/07-invaders-partida.png)
- [Caso 6 · Comparativa final: Decision-1 contra GPT-6 Luna](img/08-invaders-comparativa.png)
- [Plantilla «Reglas del proyecto» en el laboratorio](img/06-agente-reglas.png)
