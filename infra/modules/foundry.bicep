@description('Region of the Foundry resource.')
param location string
param tags object
param resourceToken string
param decisionSku string
param decisionCapacity int
param comparisonModels string
param comparisonSku string
param comparisonCapacity int
@description('LLM for case 6 (Space Invaders), with its own SKU and capacity. "none" = do not deploy it.')
param gameModel string
param gameSku string
param gameCapacity int

var accountName = 'aif-decision1-${resourceToken}'
var projectName = 'decision1-demo'

// Known versions of the comparison LLMs. Use "name:version" in COMPARISON_MODELS for others.
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
// If the game LLM is already in the comparison list, it isn't deployed again.
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
    // No keys: all access goes through Entra ID (managed identity / az login).
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
    description: 'Fast-decision demo with Microsoft-Decision-1'
  }
}

// The deployment name can't contain the reserved word "Microsoft".
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

// Deployments in the same account must be created one at a time.
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

// Goes after the comparison deployments: deployments in the same account are created one at a time.
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
