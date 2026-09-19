targetScope = 'resourceGroup'
param location string = resourceGroup().location
@minLength(3)
@maxLength(40)
param appName string
param sqlServerName string
param databaseName string = 'telemetry'
param entraClientId string
param entraTenantId string = tenant().tenantId
param sqlAdminObjectId string
param sqlAdminDisplayName string
@secure()
param entraClientSecret string

resource plan 'Microsoft.Web/serverfarms@2024-11-01' = {
 name: '${appName}-plan'
 location: location
 kind: 'linux'
 sku: { name: 'F1', tier: 'Free', capacity: 1 }
 properties: { reserved: true }
}
resource sqlServer 'Microsoft.Sql/servers@2025-01-01' = {
 name: sqlServerName
 location: location
 properties: {
  version: '12.0'
  minimalTlsVersion: '1.2'
  publicNetworkAccess: 'Enabled'
  administrators: {
   administratorType: 'ActiveDirectory'
   azureADOnlyAuthentication: true
   login: sqlAdminDisplayName
   sid: sqlAdminObjectId
   tenantId: entraTenantId
  }
 }
}
resource database 'Microsoft.Sql/servers/databases@2025-01-01' = {
 parent: sqlServer
 name: databaseName
 location: location
 sku: { name: 'GP_S_Gen5', tier: 'GeneralPurpose', family: 'Gen5', capacity: 2 }
 properties: {
  useFreeLimit: true
  freeLimitExhaustionBehavior: 'AutoPause'
  minCapacity: json('0.5')
  autoPauseDelay: 60
  maxSizeBytes: 34359738368
  requestedBackupStorageRedundancy: 'Local'
 }
}
resource firewall 'Microsoft.Sql/servers/firewallRules@2025-01-01' = {
 parent: sqlServer
 name: 'AllowAzureServices'
 properties: { startIpAddress: '0.0.0.0', endIpAddress: '0.0.0.0' }
}
resource app 'Microsoft.Web/sites@2024-11-01' = {
 name: appName
 location: location
 kind: 'app,linux'
 identity: { type: 'SystemAssigned' }
 properties: {
  serverFarmId: plan.id
  httpsOnly: true
  siteConfig: {
   linuxFxVersion: 'NODE|22-lts'
   appCommandLine: 'node dist/index.js'
   alwaysOn: false
   ftpsState: 'Disabled'
   minTlsVersion: '1.2'
   appSettings: [
    { name: 'NODE_ENV', value: 'production' }
    { name: 'AUTH_MODE', value: 'entra' }
    { name: 'REQUIRE_PLATFORM_AUTH', value: 'true' }
    { name: 'ENTRA_TENANT_ID', value: entraTenantId }
    { name: 'ENTRA_AUDIENCE', value: entraClientId }
    { name: 'AZURE_AUTH_SECRET', value: entraClientSecret }
    { name: 'SQL_SERVER', value: sqlServer.properties.fullyQualifiedDomainName }
    { name: 'SQL_DATABASE', value: database.name }
    { name: 'SCM_DO_BUILD_DURING_DEPLOYMENT', value: 'false' }
   ]
  }
 }
}
resource auth 'Microsoft.Web/sites/config@2024-11-01' = {
 parent: app
 name: 'authsettingsV2'
 properties: {
  platform: { enabled: true }
  globalValidation: {
   requireAuthentication: true
   unauthenticatedClientAction: 'Return401'
   excludedPaths: ['/', '/assets/*', '/healthz', '/api/v1/openapi.json']
  }
  identityProviders: {
   azureActiveDirectory: {
    enabled: true
    registration: {
     clientId: entraClientId
     clientSecretSettingName: 'AZURE_AUTH_SECRET'
     openIdIssuer: '${environment().authentication.loginEndpoint}${entraTenantId}/v2.0'
    }
    validation: { allowedAudiences: [entraClientId, 'api://${entraClientId}'] }
   }
  }
  login: { tokenStore: { enabled: false } }
  httpSettings: { requireHttps: true }
 }
}
output appUrl string = 'https://${app.properties.defaultHostName}'
output managedIdentityObjectId string = app.identity.principalId
output sqlHost string = sqlServer.properties.fullyQualifiedDomainName
output databaseResourceId string = database.id
