# Azure deployment and operations

This is the procedure for the approved zero-additional-spend demonstration. Infrastructure compilation and local tests do not establish account eligibility or a successful Azure deployment. See [the actual Azure evidence](../evidence/azure/README.md) for executed operations and limitations. The manual workflow checks for an active FreeTrial and spendingLimit On before accepting deployment; this protection must also be checked for CLI delivery.

## Account and cost gate

Create the Azure account only after local acceptance. Before creating resources, verify the subscription is eligible for App Service F1 and Azure SQL's free offer in the selected region. Keep the trial spending limit and do not upgrade to pay-as-you-go. If the required free configuration is unavailable, stop this deployment.

The Bicep template fixes F1, SQL useFreeLimit=true and freeLimitExhaustionBehavior=AutoPause. It adds no Application Insights, Log Analytics or paid monitoring service. These settings must be checked on the actual resources after deployment and before every later deployment.

Sources: [App Service pricing](https://azure.microsoft.com/en-us/pricing/details/app-service/linux/), [SQL free offer](https://learn.microsoft.com/en-us/azure/azure-sql/database/free-offer?view=azuresql), [trial spending protection](https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/avoid-charges-free-account).

## Bootstrap order

1. Choose an eligible region and dedicated resource group. Query Microsoft.Sql/locations/REGION/capabilities for this subscription and inspect status and reason, then run Bicep build, deployment validation and what-if. A successful validation does not guarantee regional provisioning permission. Keep the app and SQL in the same region. After a partial failure, inspect deployment operations and existing resources before retrying; preserve them and use distinct resource names if changing region. Review that only the intended resources are created.
2. Register a single-tenant Entra application for the demo. Define the Reader and Operator application roles from infra/entra-app-roles.json. Assign the intended users explicitly. Require assignment in the enterprise application.
3. Add the web callback https://APP.azurewebsites.net/.auth/login/aad/callback. Create the web application's credential through the portal and supply it as the secure entraClientSecret deployment parameter, never in a committed parameter file. Enable v2 access tokens for API clients and configure an API scope/audience for this application.
4. Deploy infra/main.bicep with the application, tenant, SQL administrator and name parameters. Record the deployment outputs and inspect the real cost settings.
5. Authenticate to SQL as the configured Entra SQL administrator. Run the versioned migration against the new database. Create a contained database user for the web application's managed identity, then grant only the runtime permissions needed below.
6. Package the app, deploy it, sign in as Reader and Operator, and execute the acceptance checks. The runtime never runs migrations automatically.

The application identity needs SELECT on dbo.devices, dbo.events, dbo.alarms and dbo.audit; INSERT on those four tables; and UPDATE on dbo.alarms. It does not need db_owner, schema changes or DELETE. Create the contained user with CREATE USER [APP] FROM EXTERNAL PROVIDER after verifying APP resolves to the intended managed identity. Use the principal object ID returned by Bicep to disambiguate duplicate display names.

If directory resolution is unavailable, Azure SQL also supports CREATE USER with SID and TYPE = E. Verify the managed identity through its principal object ID, retrieve its client/application ID, and convert that client ID to VARBINARY(16) for the service-principal SID. Check any existing database user matches this exact SID before granting permissions. This avoids granting Directory Readers merely to resolve the demo identity. See [CREATE USER without name validation](https://learn.microsoft.com/en-us/sql/t-sql/statements/create-user-transact-sql?view=azuresqldb-current#k-create-a-contained-database-user-from-a-microsoft-entra-principal-without-validation). Temporary administrator workstation firewall access must use the current address observed by SQL, with explicit authorization, and be removed after administrative operations.

For migration, backup or restore from an administrator's machine, set SQL_SERVER and SQL_DATABASE and authenticate with Azure CLI. The SQL driver's default Azure credential is used when no local SQL_CONNECTION_STRING is supplied. In App Service the same driver uses managed identity. Do not give migration privileges to the running application.

The template permits Azure-originated SQL connections through AllowAzureServices. Authentication and database grants still apply, but this firewall rule is broader than a private endpoint. It is an explicit limitation of this free demonstration.

## Package and manual delivery

Build both root and api packages, then run from the root:

```sh
npm run package:azure
```

The script creates a new .azure-package directory, installs production dependencies, includes SQL migrations and serves the frontend from public/. It refuses to overwrite an existing package. Keep packages outside Git.

The azure-manual workflow accepts an existing commit or tag and a deploy boolean, false by default. Configure the azure-demo GitHub environment with AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID, AZURE_RESOURCE_GROUP, AZURE_APP_NAME, AZURE_SQL_SERVER and AZURE_SQL_DATABASE.

The deployment identity is separate from the runtime identity. Configure GitHub OIDC federation for the exact repository and azure-demo environment, with only deployment permissions on this resource group. Do not store an Azure client secret in GitHub. Configure environment approval if desired before enabling the workflow.

[GitHub OIDC setup](https://learn.microsoft.com/en-us/azure/developer/github/connect-from-azure-openid-connect) and [App Service authentication](https://learn.microsoft.com/en-us/azure/app-service/overview-authentication-authorization) describe the platform setup. Local bearer tokens are deliberately disabled when running in App Service.

No repository publication or workflow execution is implied by these files.

## Operational exercises

Record the deployed revision, identity role, timestamps and synthetic scenario identifier for each exercise.

| Exercise | Action | Required observation |
| --- | --- | --- |
| Restart | Acknowledge an alarm, record its ID, restart App Service | Same alarm, actor and acknowledgement timestamp through the API, dashboard and MCP |
| Database unavailable | Temporarily deny only this demo application's SQL connection, then restore it | API returns 503 without sensitive details; dashboard displays unavailable without generated fallback; recovery restores the persisted records |
| Application rollback | Manually redeploy the preceding compatible application revision | Authenticated health and the same persisted records remain valid |
| Data recovery | Export the source, create a separate empty database, migrate it and import | Same data digest and counts; importing into a populated database is refused |
| Cost control | Inspect actual plan and SQL properties, subscription usage and spending limit | F1, free limit enabled, AutoPause at quota and no unapproved resources |

Do not apply an older application over an incompatible migration. Keep the previous package and a known test scenario for rollback. The first Azure deployment has no previous Azure application release; record that limitation until a second compatible version is deployed and rolled back.

From api/, with source SQL environment configured:

```sh
npm run backup -- PATH_TO_NEW_EXPORT.json
```

Switch the environment to the separate empty destination, run migrations, then:

```sh
npm run restore -- PATH_TO_EXPORT.json
```

Export includes equipment, observations, alarm lifecycle and audit events. It has a SHA-256 integrity digest and a versioned format. Protect the exported data; a checksum detects corruption, not malicious rewriting by someone who can replace the file.

This operation is an export/import recovery. It is not Azure point-in-time restore. [The free offer FAQ](https://learn.microsoft.com/en-us/azure/azure-sql/database/free-offer-faq?view=azuresql) documents the restore limitation.

## Observability and retirement

Fastify writes structured request logs with request IDs. Authorization and cookie headers are redacted; SQL details are not returned to callers. Use the built-in App Service log stream and metrics to observe response failures and resource usage, without adding a paid collector. Logs can contain user identifiers in audit data; demonstrations use dedicated accounts.

The public /healthz endpoint proves process liveness. Authenticated /api/v1/health checks SQL readiness. A stopped free database or suspended trial must remain visibly unavailable.

Before the trial ends, keep the recorded demo, revision, resource settings and recovery proof. No permanent cloud availability is promised. Any resource deletion is a separate approved operation; do not run a broad cleanup against a shared subscription.
