param accountName string

@description('Principales que reciben "Cognitive Services User" sobre la cuenta de Foundry: [{ id, type }].')
param principals array

// Cognitive Services User: permite invocar los modelos con Entra ID (sin claves).
var cognitiveServicesUser = 'a97b65f3-24c7-4388-baec-2e87135dc908'

resource account 'Microsoft.CognitiveServices/accounts@2025-06-01' existing = {
  name: accountName
}

resource assignments 'Microsoft.Authorization/roleAssignments@2022-04-01' = [
  for p in principals: if (!empty(p.id)) {
    name: guid(account.id, p.id, cognitiveServicesUser)
    scope: account
    properties: {
      principalId: p.id
      principalType: p.type
      roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesUser)
    }
  }
]
