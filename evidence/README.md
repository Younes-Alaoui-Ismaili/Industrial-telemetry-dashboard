# Demonstration and acceptance evidence

The API acceptance recordings below use synthetic measurements, a real local SQL Server Developer database, a Fastify API and a real Edge browser. They are personal demonstrations, not customer or production deployments. These local recordings are distinct from the [actual Azure execution records](azure/README.md), which document the separate cloud journey and its remaining recording limits.

## Current Azure proof

[Play the new frontend on Azure](https://younes-alaoui-ismaili.github.io/Industrial-telemetry-dashboard/azure-proof.webm?v=azure-20260920), [retained file](azure/azure-frontend-20260920.webm), [verification](azure/azure-frontend-20260920.json). This 45.72-second English recording uses real Azure App Service authentication, API traffic and SQL storage with synthetic measurements. It shows an actual Operator acknowledgement and reload. A separate Operator read verifies persistence. A fresh Reader-only check remains outstanding; see the explicit limitation in the [Azure evidence index](azure/README.md).

## Current front-end walkthrough

[Play the current front-end demo](https://younes-alaoui-ismaili.github.io/Industrial-telemetry-dashboard/frontend-demo.webm?v=scenario-en-20260920), [retained file](local/frontend-scenario-20260920.webm), [provenance](local/frontend-scenario-20260920.json). A 30.28-second operator scenario recorded from the public browser simulator: graphs visible immediately, PRESS-01 overheating, threshold inspection, acknowledgement while active, and return to normal. English scene captions identify the narrative operator role and synthetic data. Waiting sections are explicitly marked x3 and x4; inspection and acknowledgement remain at x1. An unrecorded gap between inspection and acknowledgement is cut. Screen pixels come from actual browser captures; captions occupy a separate strip. No physical sensors, SQL, Azure, authenticated role demonstration or generated UI frames. Silent. The previous 59.84-second recording remains archived as `local/frontend-walkthrough-20260920.webm`.

## Recorded API paths

- [Operator view](local/dashboard-operator.png) and [Reader view](local/dashboard-reader.png).
- [Role and acknowledgement recording](local/roles-and-acknowledgement.webm), with [machine-readable assertions](local/roles-and-acknowledgement.json). The packaged application serves both UI and API on the same local origin. An HTTP 200 acknowledgement survives reload and is observed from a second Reader session. Reader has no acknowledgement control.
- [Database outage and recovery](local/database-outage.webm), [unavailable view](local/database-unavailable.png), [recovered view](local/database-recovered.png), and [results](local/database-outage.json). The owned SQL container is stopped and restarted. API status changes from 200 to 503 and back to 200. Unavailable counts and availability are explicitly unknown.
- [Export/import recovery](local/recovery.tap): current data exported and imported into a new empty database, digest equality checked, altered digest refused and second import refused. The destination is left intact.

The sibling mcp-live-telemetry evidence records the same data digest before and after application and database restarts.

## Reproduce and explain

Follow [local setup and report formulas](../docs/persistent-telemetry.md). Start the API, publish the finite MCP scenario, then run the browser proof from this repository with LOCAL_READER_TOKEN and LOCAL_OPERATOR_TOKEN set in the process environment:

```sh
node scripts/prove-browser.cjs
```

DASHBOARD_URL defaults to http://127.0.0.1:4100. A fresh unacknowledged synthetic alarm is required. The command performs one human-operator test acknowledgement and records new timestamped evidence. Playwright Core uses installed Edge by default. Set BROWSER_EXECUTABLE to another installed browser executable if needed. Video recording also requires Playwright FFmpeg: install it with the already installed Playwright Core CLI.

For the outage exercise, stop only your demonstration SQL container, observe the 503 and unknown UI values, restart that container and verify 200 plus recovered readings. Never run this exercise against a shared database.

Explain why event IDs prevent duplicate counting, why acknowledgement belongs to SQL, how the report excludes unresolved observations from completed-duration averages, and why an additive migration supports application rollback. [Azure procedures and outstanding verification](../docs/azure-operations.md) cover the actual cloud step.
