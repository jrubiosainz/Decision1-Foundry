param location string
param tags object
param resourceToken string
param appServiceSku string
@description('App settings for the web app (name/value pairs).')
param appSettings object
@secure()
param demoAccessCode string = ''

var baseSettings = [
  for s in items(appSettings): {
    name: s.key
    value: s.value
  }
]

resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: 'plan-decision1-${resourceToken}'
  location: location
  tags: tags
  kind: 'linux'
  sku: {
    name: appServiceSku
  }
  properties: {
    reserved: true
  }
}

resource site 'Microsoft.Web/sites@2024-04-01' = {
  name: 'app-decision1-${resourceToken}'
  location: location
  tags: union(tags, { 'azd-service-name': 'web' })
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'PYTHON|3.12'
      // A single (async) worker: the RPM limiter and the session metrics live in memory.
      appCommandLine: 'gunicorn -w 1 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000 --timeout 120 app:app'
      alwaysOn: appServiceSku != 'F1'
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      http20Enabled: true
      appSettings: concat(baseSettings, empty(demoAccessCode) ? [] : [
        {
          name: 'DEMO_ACCESS_CODE'
          value: demoAccessCode
        }
      ])
    }
  }
}

output name string = site.name
output principalId string = site.identity.principalId
output url string = 'https://${site.properties.defaultHostName}'
