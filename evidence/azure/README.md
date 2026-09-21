# Actual Azure acceptance evidence

These records come from an actual App Service application and Azure SQL database. Measurements are synthetic, produced by a finite MCP scenario. This is a personal demonstration, with no customer or production deployment claim. Inference runs on the local workstation, not in Azure.

## New frontend on real Azure, September 20

[Play Azure proof](https://younes-alaoui-ismaili.github.io/Industrial-telemetry-dashboard/azure-proof.webm?v=azure-20260920), [retained video](azure-frontend-20260920.webm), [sanitized verification and provenance](azure-frontend-20260920.json).

The 45.72-second English film shows the new light frontend connected to Azure with Operator access and SQL history visible from the start. A finite 90-cycle publisher creates 360 measurements, including a 40-second PRESS-01 overheat starting at cycle 20. The threshold is inspected, the active alarm is acknowledged in the browser, the process returns to normal and the page is reloaded. Inspection, acknowledgement and the reload click run at normal speed. Only waiting sections are marked SPEED x3. Captions occupy a separate strip; empty capture padding is cropped. The source consists of actual browser screenshots, not generated UI. Unrecorded waits are cut and listed in the metadata.

The application log matches the recorded acknowledgement to HTTP 200. A separate Operator API session reads the same saved alarm after reload: `724ad7e4-51a1-4254-b15b-e6600f5ad7b5`, acknowledgement timestamp `1789950775515`. All 360 scenario event identifiers are found through the SQL-backed API, and all six pre-existing alarm states are unchanged. The older returned, unacknowledged temperature alarm visible in the film is intentionally preserved.

**Current Reader limitation:** both available authentication sessions carry Operator privileges. This run does not revalidate Reader-only reads or Reader write denial. The September 10 checks below remain historical evidence, not new acceptance results. No application role was changed for this run.

Anonymous API access returned 401; authenticated health returned 200 with `deployment=azure`. Spending protections were rechecked at 2026-09-21 00:07 UTC: active free trial, spending limit On, F1 plans, SQL free limit and AutoPause. No paid upgrade, new Azure resource or subscription cancellation was performed. The previous deployment package was retained. The new release adds bounded retries for transient initial SQL connection failures; it does not retry writes. Earlier browser request aborts are documented as a limitation, and permanent availability is not claimed.

## Historical Azure recording

[Download the retained Azure video](cloud-browser-20260919.webm). This historical recording uses the earlier dark interface. The public dashboard keeps the separate [current front-end walkthrough](https://younes-alaoui-ismaili.github.io/Industrial-telemetry-dashboard/frontend-demo.webm), a separate browser-simulator recording. Neither publishing a recording nor replacing that link cancels the Azure subscription. The historical navigation checks below describe the earlier live-link configuration.

## Browser recording and recheck, September 19

[Watch the cloud browser recording](cloud-browser-20260919.webm). The recording shows the real authenticated Azure dashboard with Operator access, two simulated alarms, an acknowledgement and a page reload. The acknowledged vibration alarm leaves the open list; the temperature alarm remains unacknowledged. [Independent API verification](cloud-browser-20260919.json) confirms the persisted acknowledgement. The recording starts after sign-in and does not show credential entry. It is silent and is not a recording of Younes operating the application.

Capture method: browser CDP screencast frames, encoded as WebM with their original timing at 25 fps. Idle lead-in was trimmed; no UI content was fabricated. The synthetic scenario uses the existing finite producer. [Readiness check](azure-readiness-20260919.json) also confirms that the September 10 acknowledgement remains unchanged.

The first request on September 19 returned HTTP 503. The retained startup log identifies an initial SQL connection ETIMEOUT after 15000 ms; the application exited and the next platform start succeeded. No configuration change or paid upgrade was used. A paused database had been observed before the request, but that observation alone does not establish the root cause of the timeout. Allow startup time before demonstrating the application; continuous availability is not claimed.

[Resource protections](azure-protections-20260919.json) were rechecked: active FreeTrial, spendingLimit On, F1 plans and SQL free-limit AutoPause retained. [Reported cost](azure-reported-cost-20260919.json) returned HTTP 200 after an initial 429, with 0.00 CAD on each reported day from September 9 through September 19. This is reported consumption, not a final invoice.

### Earlier acceptance checks, September 10

| Check | Retained evidence | Result |
| --- | --- | --- |
| Access | [Reader checks](azure-reader-checks-20260910.json) | Anonymous 401; Reader SQL health 200; Reader acknowledgement 403 |
| Producer and persistence | [Finite scenario](azure-finite-scenario-20260910.json), [data acceptance](azure-data-acceptance-20260910.json) | 80 events, four devices, two alarms; duplicate accepted zero times; invalid input 400 |
| Human acknowledgement | [Data acceptance](azure-data-acceptance-20260910.json) | Operator clicked Ack; reload retained it; independent Reader GET observed the same acknowledgement; retry returned 200 with the same timestamp |
| Restart and rollback | [Restart](azure-release-restart-20260910.json), [rollback](azure-release-rollback-20260910.json), [final release](azure-release-final-20260910.json) | The acknowledgement timestamp and actor remained unchanged; both application versions connected to SQL |
| Temporary SQL access interruption | [Incident](azure-outage-proof-20260910.json), [post-incident persistence](azure-release-post-outage-20260910.json) | HTTP 200, 503, then 200; only the demo runtime identity lost CONNECT; permission restored |
| Export/import recovery | [Recovery](azure-recovery-proof-20260910.json) | Four devices, 80 events, two alarms and nine audit rows imported into a distinct empty database; identical SHA-256; second import refused |
| Spending protections | [Actual resource settings](azure-final-protections-20260910.json), [initial usage query](azure-reported-cost-20260910.json), [successful usage query](azure-reported-cost-retry-20260910.json) | FreeTrial with spendingLimit On; F1 plans; both SQL databases useFreeLimit and AutoPause; temporary workstation firewall removed. One retry after 429 returned 0.00 CAD for each of September 9 and 10, as reported at 12:31 UTC; this is not a final invoice |

The first browser acknowledgement response was not captured directly. The retained evidence combines the observed UI action, reload, an independent Reader read and a separate successful idempotent POST. Do not relabel the retry as the original browser response.

## Cross-repository observations

The sibling mcp-live-telemetry records api-2026-09-10T11-53-15-256Z.json and api-2026-09-10T12-27-22-781Z.json have the same digest: 739136450bd6267daaa2565b1d5de24c1dbac16e1f1babd3eedd41079f3735b2. The latter was produced after restart, rollback and the SQL access incident. Each launches the actual MCP server over stdio, reads four devices, twenty press-01 measurements and two anomalies, and refuses simulator fault injection for the API source.

The sibling claude-copilot-kit record live-2026-09-10T12-13-14-827Z.json uses a Reader token against this Azure API and a local Qwen model. Its final report contains threshold 77, peak 87.9 and latest observed temperature 59.42 C with exact alarm and historical-window references. One repair turn was needed after a wrong initial answer; both answers are retained. An earlier failed run queried a recent window after the finite scenario had aged out. See that repository's evidence index for the correction and limits.

## Report and release interpretation

The report selects alarms raised in its explicit window. It reports two raised, one acknowledged and two cleared. Mean acknowledgement delay is 213869 ms (acknowledged_at minus raised_at for the completed acknowledgement). Mean completed exceedance duration is 9603 ms (cleared_at minus raised_at). Unacknowledged alarms are excluded from the first average; uncleared alarms are excluded from the second. These are averages over this scenario, not an operational SLA.

The UI report uses the last 15 minutes. After a finite scenario ages out, a zero recent count does not mean its historical alarms were deleted. The recorded acceptance query uses the scenario's explicit historical window. Latest temperature means the last observation in that window, not a current physical sensor reading.

The rollback actually replaced frontend asset index-D7N1ilKn.js with index-Cdidt9JL.js, checked SQL and acknowledgement persistence, then restored index-D7N1ilKn.js. Package SHA-256 values were 62429910c5ffee9e66487ec7598e6acd4183b0b39496e9210075b875f4117123 and 1910d1878f251b87ac6186901fbb70ed81d4ccdfdfb2b1d6c1eccfc2bbf944f6. These are local build artifacts, not published Git revisions.

## Reproduce and retain the limits

The [September 20 navigation check](cloud-navigation-20260920.json) verifies the corrected static Pages build served locally: Cloud opens the existing Azure dashboard, with Microsoft authentication and four synthetic devices visible. Browser API reads and an independent authenticated health check returned 200. The public Pages site was not updated during this check. An earlier timeout and 503 were followed by recovery without an Azure configuration change; this check does not establish their cause or promise continuous availability.

Follow [Azure operations](../../docs/azure-operations.md) and [API/report contracts](../../docs/persistent-telemetry.md). Use separate Reader and Operator sessions. Publish the finite scenario with the MCP producer, acknowledge an alarm in the browser, record its ID and timestamp, and run the MCP proof before and after the bounded operations. Use an empty, separately named free SQL destination for export/import recovery. Preserve the source and remove temporary workstation firewall access in a finally block.

The actual deployment used the Azure CLI. GitHub Actions with OIDC is prepared locally and has not been published, federated or executed. The SQL recovery was export/import, not point-in-time restore. AllowAzureServices remains a broad Azure-origin firewall rule, protected by Entra and restricted SQL grants; this is not a private endpoint architecture.

Browser operation and a recovered connected screen were observed. The September 10 cloud incident's unavailable UI was not captured during its short window. The September 19 cloud recording above closes the missing downloadable browser recording; it does not depict the September 10 SQL outage. The videos in ../local/ cover local SQL, and must not be presented as Azure recordings. An initial cold-start request timed out before a later health check succeeded.

No permanent availability is promised. No paid upgrade or service purchase was performed. Resource protections are a dated observation, not an invoice or a substitute for reviewing future changes. Raw access tokens, application secrets and the SQL export containing audit identifiers are excluded from this evidence directory.
