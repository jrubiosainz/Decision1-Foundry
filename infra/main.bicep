targetScope = 'subscription'

@minLength(1)
@maxLength(40)
@description('Nombre del entorno de azd. Se usa para nombrar el resource group (rg-<nombre>).')
param environmentName string

@description('Región. Debe ofrecer Microsoft-Decision-1 en el SKU elegido (DataZoneStandard en UE: spaincentral, swedencentral, westeurope, francecentral, germanywestcentral, italynorth, polandcentral).')
@allowed([
  'spaincentral'
  'swedencentral'
  'westeurope'
  'francecentral'
  'germanywestcentral'
  'italynorth'
  'polandcentral'
  'eastus'
  'eastus2'
  'centralus'
  'northcentralus'
  'southcentralus'
  'westcentralus'
  'westus'
  'westus2'
  'westus3'
])
@metadata({ azd: { type: 'location' } })
param location string

@description('Object ID de quien despliega (azd lo rellena). Recibe acceso keyless para ejecutar la app en local.')
param principalId string = ''

@allowed(['User', 'ServicePrincipal', 'Group'])
param principalType string = 'User'

@allowed(['DataZoneStandard', 'GlobalStandard'])
@description('SKU del despliegue de Microsoft-Decision-1. DataZoneStandard mantiene el procesamiento dentro de la zona de datos (UE).')
param decisionSku string = 'DataZoneStandard'

@minValue(1)
@description('Capacidad del despliegue de Microsoft-Decision-1, en peticiones por minuto (RPM). El caso 6 (Space Invaders) pide una decisión por segundo y modelo, así que necesita unas 60; con menos funciona, pero más despacio.')
param decisionCapacity int = 60

@description('LLMs opcionales para la carrera comparativa, separados por comas ("nombre" o "nombre:versión"). Cadena vacía = sin comparativa.')
param comparisonModels string = 'gpt-5.4-mini,gpt-6-sol'

@allowed(['DataZoneStandard', 'GlobalStandard'])
param comparisonSku string = 'DataZoneStandard'

@minValue(1)
@description('Capacidad (miles de TPM) de cada LLM de comparación.')
param comparisonCapacity int = 50

@description('LLM del caso 6 (Space Invaders), que juega contra Decision-1. "none" = no desplegarlo: el caso 6 usará un LLM de la lista de comparación.')
param gameModel string = 'gpt-6-luna'

@allowed(['DataZoneStandard', 'GlobalStandard'])
@description('SKU del LLM del caso 6. GlobalStandard tiene más cuota, pero el procesamiento puede salir de la zona de datos de la UE (el juego no usa datos personales).')
param gameSku string = 'GlobalStandard'

@minValue(1)
@description('Capacidad (miles de TPM) del LLM del caso 6.')
param gameCapacity int = 100

@description('SKU del plan de App Service que aloja la web de la demo.')
param appServiceSku string = 'B1'

@secure()
@description('Código de acceso de la web (?code= en la URL). El hook preprovision lo genera si no existe. Vacío = web abierta.')
param demoAccessCode string = ''

var tags = {
  'azd-env-name': environmentName
  workload: 'decision1-demo'
}
var resourceToken = toLower(uniqueString(subscription().id, environmentName, location))

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'rg-${environmentName}'
  location: location
  tags: tags
}

module foundry 'modules/foundry.bicep' = {
  name: 'foundry'
  scope: rg
  params: {
    location: location
    tags: tags
    resourceToken: resourceToken
    decisionSku: decisionSku
    decisionCapacity: decisionCapacity
    comparisonModels: comparisonModels
    comparisonSku: comparisonSku
    comparisonCapacity: comparisonCapacity
    gameModel: gameModel
    gameSku: gameSku
    gameCapacity: gameCapacity
  }
}

module web 'modules/web.bicep' = {
  name: 'web'
  scope: rg
  params: {
    location: location
    tags: tags
    resourceToken: resourceToken
    appServiceSku: appServiceSku
    demoAccessCode: demoAccessCode
    appSettings: {
      AZURE_AI_ENDPOINT: foundry.outputs.endpoint
      DECISION_DEPLOYMENT: foundry.outputs.decisionDeployment
      DECISION_SKU: decisionSku
      DECISION_RPM: string(decisionCapacity)
      COMPARISON_DEPLOYMENTS: foundry.outputs.comparisonDeployments
      AZURE_LOCATION: location
      SCM_DO_BUILD_DURING_DEPLOYMENT: 'true'
      ENABLE_ORYX_BUILD: 'true'
    }
  }
}

module rbac 'modules/rbac.bicep' = {
  name: 'rbac'
  scope: rg
  params: {
    accountName: foundry.outputs.accountName
    principals: [
      { id: web.outputs.principalId, type: 'ServicePrincipal' }
      { id: principalId, type: principalType }
    ]
  }
}

output AZURE_LOCATION string = location
output AZURE_TENANT_ID string = tenant().tenantId
output AZURE_RESOURCE_GROUP string = rg.name
output AZURE_AI_ACCOUNT_NAME string = foundry.outputs.accountName
output AZURE_AI_PROJECT_NAME string = foundry.outputs.projectName
output AZURE_AI_ENDPOINT string = foundry.outputs.endpoint
output DECISION_DEPLOYMENT string = foundry.outputs.decisionDeployment
output DECISION_SKU string = decisionSku
output COMPARISON_DEPLOYMENTS string = foundry.outputs.comparisonDeployments
output WEB_APP_NAME string = web.outputs.name
output WEB_URL string = web.outputs.url
