targetScope = 'subscription'

@minLength(1)
@maxLength(40)
@description('Name of the azd environment. Used to name the resource group (rg-<name>).')
param environmentName string

@description('Region. Must offer Microsoft-Decision-1 in the chosen SKU (DataZoneStandard in the EU: spaincentral, swedencentral, westeurope, francecentral, germanywestcentral, italynorth, polandcentral).')
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

@description('Object ID of the deployer (azd fills it in). Gets keyless access to run the app locally.')
param principalId string = ''

@allowed(['User', 'ServicePrincipal', 'Group'])
param principalType string = 'User'

@allowed(['DataZoneStandard', 'GlobalStandard'])
@description('SKU of the Microsoft-Decision-1 deployment. DataZoneStandard keeps processing within the data zone (EU).')
param decisionSku string = 'DataZoneStandard'

@minValue(1)
@description('Capacity of the Microsoft-Decision-1 deployment, in requests per minute (RPM). Case 6 (Space Invaders) requests one decision per second per model, so it needs about 60; it works with less, but more slowly.')
param decisionCapacity int = 60

@description('Optional LLMs for the comparison race, comma-separated ("name" or "name:version"). Empty string = no comparison.')
param comparisonModels string = 'gpt-5.4-mini,gpt-6-sol'

@allowed(['DataZoneStandard', 'GlobalStandard'])
param comparisonSku string = 'DataZoneStandard'

@minValue(1)
@description('Capacity (thousands of TPM) of each comparison LLM.')
param comparisonCapacity int = 50

@description('LLM for case 6 (Space Invaders), which plays against Decision-1. "none" = do not deploy it: case 6 will use an LLM from the comparison list.')
param gameModel string = 'gpt-6-luna'

@allowed(['DataZoneStandard', 'GlobalStandard'])
@description('SKU of the case 6 LLM. GlobalStandard has more quota, but processing may leave the EU data zone (the game uses no personal data).')
param gameSku string = 'GlobalStandard'

@minValue(1)
@description('Capacity (thousands of TPM) of the case 6 LLM.')
param gameCapacity int = 100

@description('SKU of the App Service plan that hosts the demo web app.')
param appServiceSku string = 'B1'

@secure()
@description('Access code for the web app (?code= in the URL). The preprovision hook generates it if it does not exist. Empty = open access.')
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
