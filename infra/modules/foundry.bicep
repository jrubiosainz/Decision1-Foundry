@description('Región del recurso de Foundry.')
param location string
param tags object
param resourceToken string
param decisionSku string
param decisionCapacity int
param comparisonModels string
param comparisonSku string
param comparisonCapacity int
@description('LLM del caso 6 (Space Invaders), con SKU y capacidad propios. "none" = no desplegarlo.')
param gameModel string
param gameSku string
param gameCapacity int

var accountName = 'aif-decision1-${resourceToken}'
var projectName = 'decision1-demo'

// Versiones conocidas de los LLMs de comparación. Usa "nombre:versión" en COMPARISON_MODELS para otras.
var knownVersions = {
  'gpt-5.4-mini': '2026-03-17'
  'gpt-6-sol': '2026-09-22'
  'gpt-6-luna': '2026-09-22'
}

var comparisonList = filter(map(split(comparisonModels, ','), m => trim(m)), m => !empty(m))
var comparisonDefs = [
  for m in comparisonList: {
    name: first(split(m, ':'))
    version: contains(m, ':') ? last(split(m, ':')) : (knownVersions[?m] ?? '')
  }
]
var comparisonNames = map(comparisonDefs, d => d.name)

var gameName = first(split(trim(gameModel), ':'))
var gameVersion = contains(gameModel, ':') ? last(split(gameModel, ':')) : (knownVersions[?gameName] ?? '')
// Si el LLM del juego ya está en la lista de comparación, no se vuelve a desplegar.
var deployGame = !empty(gameName) && toLower(gameName) != 'none' && !contains(comparisonNames, gameName)

resource account 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: accountName
  location: location
  tags: tags
  kind: 'AIServices'
  sku: {
    name: 'S0'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    allowProjectManagement: true
    customSubDomainName: accountName
    // Sin claves: todo el acceso es con Entra ID (managed identity / az login).
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
      virtualNetworkRules: []
      ipRules: []
    }
  }
}

resource project 'Microsoft.CognitiveServices/accounts/projects@2025-06-01' = {
  parent: account
  name: projectName
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    displayName: 'Decision-1 demo'
    description: 'Demo de decisiones rápidas con Microsoft-Decision-1'
  }
}

// El nombre del despliegue no puede contener la palabra reservada "Microsoft".
resource decision 'Microsoft.CognitiveServices/accounts/deployments@2025-06-01' = {
  parent: account
  name: 'decision-1'
  sku: {
    name: decisionSku
    capacity: decisionCapacity
  }
  properties: {
    model: {
      format: 'Microsoft'
      name: 'Microsoft-Decision-1'
      version: '1'
    }
    versionUpgradeOption: 'OnceNewDefaultVersionAvailable'
  }
  dependsOn: [
    project
  ]
}

// Los despliegues de una misma cuenta deben crearse de uno en uno.
@batchSize(1)
resource comparison 'Microsoft.CognitiveServices/accounts/deployments@2025-06-01' = [
  for m in comparisonDefs: {
    parent: account
    name: m.name
    sku: {
      name: comparisonSku
      capacity: comparisonCapacity
    }
    properties: {
      model: {
        format: 'OpenAI'
        name: m.name
        version: empty(m.version) ? null : m.version
      }
      versionUpgradeOption: 'OnceNewDefaultVersionAvailable'
    }
    dependsOn: [
      decision
    ]
  }
]

// Va después de la comparación: los despliegues de una misma cuenta se crean de uno en uno.
resource game 'Microsoft.CognitiveServices/accounts/deployments@2025-06-01' = if (deployGame) {
  parent: account
  name: gameName
  sku: {
    name: gameSku
    capacity: gameCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: gameName
      version: empty(gameVersion) ? null : gameVersion
    }
    versionUpgradeOption: 'OnceNewDefaultVersionAvailable'
  }
  dependsOn: [
    comparison
  ]
}

output accountName string = account.name
output projectName string = project.name
output endpoint string = 'https://${accountName}.services.ai.azure.com'
output decisionDeployment string = decision.name
output comparisonDeployments string = join(concat(comparisonNames, deployGame ? [gameName] : []), ',')
