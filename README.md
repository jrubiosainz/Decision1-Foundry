# Microsoft-Decision-1 · demo en Microsoft Foundry

Web lista para desplegar con `azd up` que enseña, en vivo y con datos de ejemplo, qué aporta **Microsoft-Decision-1**, el nuevo modelo de decisiones rápidas de Microsoft Foundry. **No escribe, decide:** recibe un estado (un ticket, una reseña, la acción de un agente…) y preguntas cerradas, y en unos cientos de milisegundos devuelve cada respuesta con su probabilidad calibrada.

![Caso 2, «Voz del huésped»: 16 reseñas en una llamada y carrera contra GPT-6 Sol](docs/img/02-hoteles-carrera.png)

## Por qué es un nuevo paradigma

| | LLM generativo (sistema 2) | Microsoft-Decision-1 (sistema 1) |
|---|---|---|
| Qué devuelve | Texto que hay que interpretar y validar | Una de las opciones que defines, con su probabilidad |
| Latencia | Segundos por respuesta | Cientos de milisegundos por llamada, con decenas de decisiones dentro |
| Precio | Entrada y salida (la salida es lo caro) | 0,042 $ por millón de tokens de entrada; la salida es gratis |
| Control | Difícil decidir cuándo fiarse | Un umbral de confianza decide qué se automatiza y qué revisa una persona |

Muchas decisiones de negocio no necesitan generar texto: clasificar, priorizar, enrutar, filtrar o aprobar. Con Decision-1 cuestan céntimos por cada mil y se aplican **a cada evento y en línea**, no a una muestra ni en diferido. El LLM queda para lo que de verdad aporta: redactar, resumir y razonar en abierto.

## Qué incluye

Una web de tres columnas pensada para presentar:

- **Izquierda:** introducción, los 5 casos de uso y un laboratorio.
- **Centro:** la demo en vivo de cada caso, con KPIs (latencia, coste, automatización y acierto) y una vista visual distinta por caso.
- **Derecha:** notas visibles para la audiencia. Incluyen el reto, la solución, por qué es un nuevo paradigma, dónde aplica, el resultado de la ejecución y una **proyección mensual de ahorro** con supuestos editables.

| # | Caso | Sector | Qué decide Decision-1 | Elementos × preguntas | Latencia (1 llamada) | Coste del lote | Acierto |
|---|---|---|---|---|---|---|---|
| 1 | ⚡ Triage de tickets | Energía y utilities | Cola, urgencia, riesgo para la seguridad, cliente vulnerable y riesgo de baja de cada ticket (kanban por colas) | 16 × 5 | 0,93 s | 0,00033 € | 16/16 |
| 2 | 🏨 Voz del huésped | Hoteles y resorts | Acción, sentimiento, 7 aspectos y elogios a empleados de cada reseña (mapa de calor por hotel y alertas) | 16 × 10 | 0,68 s | 0,00053 € | 16/16 |
| 3 | ✈️ Asistencia 24/7 | Viajes y turoperación | Equipo, urgencia, si el viajero ya está en destino y si hay oportunidad de venta (bandeja priorizada) | 16 × 4 | 0,75 s | 0,00031 € | 16/16 |
| 4 | 🔀 Router de modelos GenAI | Transversal | A dónde va cada petición: respuesta predefinida, modelo pequeño, modelo grande o persona | 14 × 4 | 0,50 s | 0,00019 € | 14/14 |
| 5 | 🛡️ Guardarraíles para agentes | Transversal | Si cada acción de un agente se permite, pide aprobación humana o se bloquea (prompt injection, datos sensibles, límites) | 12 × 5 | 0,56 s | 0,00019 € | 12/12 |

Estas cifras se midieron el 10 de octubre de 2026 en la web desplegada (Spain Central, DataZone UE), con todo el caso en una sola llamada. Las empresas de los casos (Nexa Energía, Brisa Hotels & Resorts y Alisio Travel Group) son ficticias, y los datos son de ejemplo.

Además:

- **Modo lote o uno a uno (tecla B).** En modo lote, todo el caso viaja en **una sola llamada** de hasta 255 preguntas. En modo uno a uno, se hace una llamada por elemento.
- **Umbral de confianza.** Lo que no lo supera pasa a revisión humana.
- **Carrera (tecla C).** Resuelve el mismo lote con las mismas preguntas, a la vez, con Decision-1 y con un LLM desplegado (GPT-6 Sol o GPT-5.4 mini, con salida JSON). En el caso 2 se midió 0,8 s frente a 10,1 s de GPT-6 Sol: ×13 más rápido, ×34 más barato y la misma decisión principal en 16 de 16.
- **Detalle de cada elemento y petición real.** Haz clic en un elemento para ver todas sus probabilidades. «Ver petición» y «Ver respuesta» muestran el JSON real intercambiado con Foundry.
- **Laboratorio (tecla L).** Prueba tu propio texto con tus preguntas, o parte de una de las 12 plantillas. Hay 5 de negocio (calidad de llamadas, datos personales, relevancia para RAG, moderación de redes y una desde cero) y 7 de agentes.

| Tecla | Acción |
|---|---|
| ← → | Página anterior o siguiente |
| 0 · 1–5 · L | Introducción, caso 1–5 o laboratorio |
| Espacio | Procesar el caso |
| C | Carrera contra un LLM |
| B | Cambiar entre lote y uno a uno |
| R | Reiniciar el caso |
| N | Mostrar u ocultar las notas |
| Ctrl + Enter | Decidir en el laboratorio |
| ? | Ver los atajos |

## Decision-1 dentro de un agente

No todas las decisiones de un agente necesitan razonamiento generativo. Muchas son clasificaciones, selecciones o evaluaciones de riesgo. El patrón que propone la demo es que **el LLM ejecuta y Decision-1 decide, filtra y enruta**, antes y después de cada paso:

```text
Petición  →  Decision-1: skill · archivos · riesgo  →  LLM implementa  →  Decision-1: reglas · revisión · siguiente test
```

La introducción muestra este flujo, y cada etapa abre su plantilla en el laboratorio. Todas usan un repositorio ficticio de reservas de hotel:

| Plantilla | Qué decide | Preguntas |
|---|---|---|
| 🧭 Skill picker | Qué skill ejecutar (o ninguna), con qué modelo y si hay que pedir aclaración | 2 de elección, 1 sí/no y 1 escala |
| 📂 Archivos relevantes | Qué archivos abrir antes de tocar el código | 12 sí/no, ordenadas como ranking |
| 🗜️ Compactación de contexto | Qué mensajes conservar al compactar la conversación | 10 sí/no |
| 🛡️ Reglas del proyecto | Si un cambio infringe reglas (secretos, SQL, datos personales…); bloquea con un 80 % de confianza o más | 6 sí/no |
| 🔍 Revisión adaptativa | Qué riesgos tiene un cambio y qué nivel de revisión necesita | 7 sí/no y 1 de elección |
| 🌐 Testing en navegador | Siguiente acción en la página, si se cumplió el objetivo y si hay error | 1 de elección y 2 sí/no |
| 📋 Requisitos sin tests | Qué requisitos funcionales no tienen test | 6 sí/no |

Cada decisión tarda entre 0,3 y 0,5 s y cuesta milésimas de céntimo. Decision-1 no sustituye a las validaciones deterministas (tests, linters o escáneres de secretos). Úsalo para priorizar y filtrar, y combina los bloqueos con reglas deterministas.

## Despliegue

### Requisitos

- Una suscripción de Azure con cuota de Microsoft-Decision-1 (consulta [Regiones y cuota](#regiones-y-cuota)).
- Permiso para crear asignaciones de roles, como Owner o Contributor más Role Based Access Control Administrator. La web y tu usuario reciben el rol *Cognitive Services User* sobre la cuenta de Foundry.
- [Azure Developer CLI (azd)](https://aka.ms/azd-install) y [Azure CLI](https://aka.ms/azcli). Se probó con azd 1.34.
- En Windows, PowerShell 7 (`pwsh`) para los hooks de azd.
- Python 3.10 o superior, solo para ejecutarlo en local.

### Pasos

```bash
git clone https://github.com/jrubiosainz/Decision1-Foundry.git
cd Decision1-Foundry
azd auth login
azd env new decision1-demo                # crea el resource group rg-decision1-demo
azd env set AZURE_LOCATION spaincentral
azd up
```

Tarda unos 10 minutos: unos 2 de infraestructura y entre 5 y 8 de despliegue de la web, porque App Service instala las dependencias en el primer arranque. Al terminar, azd muestra el enlace con el código de acceso:

```text
Demo lista -> https://app-xxxxxxxxxxxxx.azurewebsites.net/?code=d1-xxxxxxxx
```

Abre ese enlace una vez. El navegador guarda el código y lo quita de la barra de direcciones, así que no se ve al proyectar. Para recuperarlo, ejecuta `azd env get-value DEMO_ACCESS_CODE`. Para cambiarlo, ejecuta `azd env set DEMO_ACCESS_CODE <nuevo>` y después `azd provision`.

Qué se despliega:

- Una cuenta de Microsoft Foundry con un proyecto, con la autenticación local desactivada (solo Entra ID, sin claves).
- El despliegue `decision-1` de Microsoft-Decision-1 y los LLMs de la carrera (`gpt-5.4-mini` y `gpt-6-sol`).
- Un App Service Linux B1 con Python 3.12 e identidad administrada.
- El rol *Cognitive Services User* para la identidad de la web y para tu usuario.

### Configuración

Cambia estos valores con `azd env set <VARIABLE> <valor>` antes de ejecutar `azd up` o `azd provision`.

| Variable | Valor por defecto | Para qué sirve |
|---|---|---|
| `AZURE_LOCATION` | `spaincentral` | Región de la cuenta de Foundry y de la web |
| `DECISION_SKU` | `DataZoneStandard` | `DataZoneStandard` procesa dentro de la zona de datos (UE o EE. UU.); `GlobalStandard` puede procesar en cualquier región de Azure |
| `DECISION_CAPACITY` | `17` | Capacidad de Decision-1, en peticiones por minuto (RPM) |
| `COMPARISON_MODELS` | `gpt-5.4-mini,gpt-6-sol` | LLMs para la carrera, separados por comas (`nombre` o `nombre:versión`). Si la dejas vacía, no hay carrera |
| `COMPARISON_SKU` | `DataZoneStandard` | SKU de los LLMs de la carrera |
| `COMPARISON_CAPACITY` | `50` | Miles de tokens por minuto de cada LLM de la carrera |
| `APP_SERVICE_SKU` | `B1` | Plan de App Service de la web |
| `DEMO_ACCESS_CODE` | Se genera (`d1-…`) | Código de acceso a la web |

### Regiones y cuota

Microsoft-Decision-1 está disponible (octubre de 2026) en:

| SKU | Regiones |
|---|---|
| DataZone UE (7) | spaincentral, swedencentral, westeurope, francecentral, germanywestcentral, italynorth y polandcentral |
| DataZone EE. UU. (9) | eastus, eastus2, centralus, northcentralus, southcentralus, westcentralus, westus, westus2 y westus3 |
| GlobalStandard | 31 regiones |

La cuota DataZone **se comparte entre todas las regiones de la zona**. En nuestra suscripción de pruebas hay 17 RPM para toda la UE con DataZone y 50 RPM con GlobalStandard. Por eso la web trabaja en modo lote, con una llamada por caso. Si la suscripción ya tiene otro despliegue DataZone de Decision-1 en la UE, usa GlobalStandard:

```bash
azd env set DECISION_SKU GlobalStandard
azd env set DECISION_CAPACITY 50
```

Para consultar tu cuota:

```bash
az cognitiveservices usage list -l spaincentral --query "[?contains(name.value,'Decision')]" -o table
```

Si no tienes cuota de GPT-6 Sol, ejecuta `azd env set COMPARISON_MODELS gpt-5.4-mini`.

## Ejecutar en local

```bash
./scripts/run-local.sh       # macOS o Linux
./scripts/run-local.ps1      # Windows
```

El script carga las variables del entorno de azd, crea un entorno virtual `.venv` y arranca la web en <http://127.0.0.1:8000>, que en local no pide código. Se autentica con tu sesión de `az login` o `azd auth login`, mediante Entra ID y sin claves. Requiere haber ejecutado `azd up` o `azd provision` antes.

## Llamar a la API directamente

Es una sola petición HTTP, sin SDK:

```bash
ENDPOINT=$(azd env get-value AZURE_AI_ENDPOINT)
TOKEN=$(az account get-access-token --resource https://cognitiveservices.azure.com --query accessToken -o tsv)

curl -s "$ENDPOINT/providers/microsoft/v1/systemone" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "model": "decision-1",
    "state": { "canal": "WhatsApp", "mensaje": "Huele mucho a gas en el portal y no sé a quién llamar" },
    "questions": {
      "cola": { "type": "choice", "instructions": "¿A qué equipo debe ir el ticket?",
                "criteria": { "averias": "Averías y emergencias", "facturacion": "Facturación y pagos", "otros": "Cualquier otra consulta" } },
      "urgencia": { "type": "score", "instructions": "¿Con qué urgencia hay que atenderlo?",
                    "criteria": ["Puede esperar", "Hoy", "Inmediata"] },
      "seguridad": { "type": "noul", "instructions": "¿Hay riesgo para la seguridad de las personas?" }
    }
  }'
```

Respuesta, resumida:

```json
{
  "model": "microsoft-decision-1",
  "answers": {
    "cola":      { "type": "choice", "choice": "averias", "confidence": 0.92,
                   "probabilities": { "averias": 0.946, "facturacion": 0.001, "otros": 0.053 } },
    "urgencia":  { "type": "score", "score": 2.0, "confidence": 0.99,
                   "legend": { "0": "Puede esperar", "1": "Hoy", "2": "Inmediata" },
                   "probabilities": { "0": 0.00003, "1": 0.00002, "2": 0.99994 } },
    "seguridad": { "type": "noul", "noul": 0.9996 }
  },
  "usage": { "input_tokens": 130, "output_tokens": 3 }
}
```

Hay tres tipos de pregunta:

- **`choice`:** elige entre las opciones de `criteria`, un diccionario de clave y descripción.
- **`score`:** una escala ordenada; `criteria` es la lista de niveles.
- **`noul`:** una pregunta de sí o no que devuelve la probabilidad de «sí».

Admite hasta 255 preguntas por llamada, un estado de hasta 64.000 tokens y un cuerpo de hasta 1 MiB. El token se pide para `https://cognitiveservices.azure.com` y no hace falta `api-version`.

## Costes

- **Decision-1:** 0,042 $ por millón de tokens de entrada; la salida es gratis. Cada lote de la demo cuesta entre 0,0002 € y 0,0005 €, es decir, de 0,01 € a 0,03 € por cada 1.000 elementos.
- **LLMs de la carrera:** se paga por uso. Una carrera con GPT-6 Sol cuesta unos 0,02–0,03 €.
- **App Service B1 Linux:** unos 11,5 € al mes en Spain Central. Es el único coste fijo mientras exista.

Los precios que usan los cálculos de la web están en `src/pricing.json`. Para borrarlo todo, ejecuta `azd down --purge`; `--purge` elimina la cuenta de Foundry definitivamente y libera la cuota.

## Adaptar un caso a tu cliente

Cada caso es un JSON en `src/scenarios/`:

| Campo | Contenido |
|---|---|
| `context` | Descripción del negocio que acompaña a cada elemento |
| `questions` | Las preguntas (`choice`, `score` o `noul`) con sus `criteria` |
| `primary` | La pregunta principal, de tipo `choice`, que alimenta los KPIs y el acierto |
| `items` | Los ejemplos, con `expected` para medir el acierto |
| `state_fields` | Qué campos de cada elemento se envían al modelo |
| `view` | La vista del centro: `kanban`, `heatmap`, `inbox`, `router` o `guardrails` |
| `notes` | Los textos del panel derecho y los supuestos de ahorro (`savings`: volumen al mes, minutos por elemento y coste por hora) |

Lo más sencillo es copiar el caso más parecido y cambiar el contexto, las opciones y los ejemplos, sin cambiar los nombres de las preguntas que usa su vista. Después mide el acierto con el evaluador y despliega:

```bash
set -a; eval "$(azd env get-values)"; set +a
.venv/bin/python scripts/evaluar.py energia                       # acierto frente a "expected"
.venv/bin/python scripts/evaluar.py energia --llm gpt-5.4-mini    # comparado con un LLM
azd deploy
```

El entorno virtual `.venv` lo crea `scripts/run-local`.

## Seguridad

- **Sin claves.** La cuenta de Foundry tiene la autenticación local desactivada. La web usa su identidad administrada y, en local, tu sesión de Entra ID.
- **El código de acceso** solo evita que cualquiera con la URL consuma tu cuota; no autentica a los usuarios. Si la demo va a durar, activa la autenticación de App Service con Entra ID.
- **Residencia de datos.** Con DataZoneStandard, el procesamiento se queda dentro de la zona de datos de la UE.

## Solución de problemas

| Síntoma | Causa y solución |
|---|---|
| `Insufficient quota … Available: 0` al volver a ejecutar `azd provision` | Es un falso positivo: esa cuota la consume tu propio despliegue. Continúa |
| `InsufficientQuota` en un entorno nuevo | La cuota DataZone de la zona ya está en uso en la suscripción. Usa GlobalStandard o elimina el otro despliegue |
| azd avisa de que no ha visto cambios de estado en 5 minutos | El primer arranque de App Service es lento. La web queda lista igualmente; compruébalo en `/healthz` |
| La web pide un código | Abre el enlace con `?code=`, o recupéralo con `azd env get-value DEMO_ACCESS_CODE` |
| Error 502 de Foundry con estado 401 o 403 recién desplegado | El rol de la identidad administrada tarda unos minutos en propagarse. Espera y recarga |
| Error 429 | Se han superado las RPM de Decision-1 y se agotaron los reintentos automáticos. Espera unos segundos o usa el modo lote; la cabecera de la web muestra las RPM disponibles |
| La primera decisión tarda unos 3 s | El modelo está en frío tras unos minutos sin uso. La web lo calienta cada vez que cambias de página, así que normalmente ya está en caliente al pulsar «Procesar» |

## Estructura

```text
├── azure.yaml                  # azd: servicio web y hooks
├── infra/                      # Bicep: Foundry, modelos, App Service y roles
├── scripts/
│   ├── codigo-acceso.sh|ps1    # hook preprovision: genera el código de acceso
│   ├── run-local.sh|ps1        # ejecuta la web en local
│   └── evaluar.py              # mide el acierto de los casos
├── src/
│   ├── app.py                  # API (FastAPI) y web estática
│   ├── decision_client.py      # cliente de Foundry (Decision-1 y LLMs) con Entra ID
│   ├── demo.py                 # peticiones, lotes y costes
│   ├── scenarios/*.json        # los 5 casos: contexto, preguntas, ejemplos y notas
│   ├── lab.json                # plantillas del laboratorio
│   ├── pricing.json            # precios para los cálculos
│   └── static/                 # web en HTML, CSS y JavaScript, sin compilación
└── docs/
    ├── GUION-DEMO.md           # guion para presentar la demo
    └── img/                    # capturas de una ejecución real
```

Para presentar la demo, sigue el [guion](docs/GUION-DEMO.md).

## Más información

- [Microsoft-Decision-1: Our model for fast decision-making](https://commandline.microsoft.com/microsoft-decision-1-model-foundry/): anuncio del modelo.
- [Microsoft-Decision-1 en el catálogo de Microsoft Foundry](https://ai.azure.com/catalog/models/Microsoft-Decision-1).
