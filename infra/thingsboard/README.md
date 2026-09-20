# Local ThingsBoard dashboard

This extension uses ThingsBoard Community Edition 4.3.1.5, PostgreSQL 18 and the existing Ubuntu WSL Docker engine. The application listens only on `127.0.0.1:18080`. PostgreSQL has no published host port. Data is stored in the dedicated `telemetry-thingsboard_postgres-data` volume.

## Reused sources

- [ThingsBoard repository](https://github.com/thingsboard/thingsboard/tree/v4.3.1.5), Apache-2.0. The upstream license is preserved in `LICENSE-ThingsBoard.txt`.
- [Official thermostats dashboard](https://github.com/thingsboard/thingsboard/blob/v4.3.1.5/application/src/main/data/json/demo/dashboards/thermostats.json), preserved as `upstream-thermostats.json`. SHA256: `603bc840759199c81ab40519149c548b0442a0de6f92e3dd5df8f0e435ca650f`.
- [Official Docker installation](https://thingsboard.io/docs/installation/docker/). Compose adapts the documented local demonstration configuration, with a private database and localhost-only application binding.

`dashboard.mjs` adapts native equipment table, alarm table and time-series charts. It removes the thermostat-specific maps, forms and custom device-management actions. It does not replace the React application or the Azure deployment.

## Data semantics

[Recorded local walkthrough](../../evidence/local/thingsboard-walkthrough-20260920.webm): equipment, temperature and vibration charts, then alarm details. This silent browser capture lasts about 59 seconds; idle gaps longer than six seconds are shortened. It shows retained historical synthetic data, without an Azure refresh or an alarm acknowledgement. [Capture and playback evidence](../../evidence/local/thingsboard-walkthrough-20260920.json).

`read-azure.ps1` reads the existing authorized Azure API using the existing Azure CLI login. It never writes to Azure. It retains each event timestamp, value, source identifier and simulated provenance. The initial view uses the actual historical measurement interval, not the current clock. The equipment table displays the measurement timestamp in UTC.

`provision.mjs` creates or updates the local ThingsBoard devices and alarm copies, imports temperature and vibration measurements, and checks stored values. Repeated synchronization reuses the saved dashboard and preserves changes made through its editor. `--rebuild` explicitly reapplies the source template. Local alarm copies have acknowledgement, clear and assignment actions disabled in the dashboard; they are not a control channel to Azure.

There is no continuous Azure polling. The retained local snapshot supports the demonstration without consuming more trial resources. A refresh is an explicit `start.ps1 -Sync` operation. This does not generate new industrial readings. The selected historical chart window can be changed using ThingsBoard's native time controls when new source measurements arrive.

## Operation on this workstation

The PowerShell helpers currently contain workstation-specific WSL and Azure CLI paths. A fresh clone does not include the database secret, authenticated Azure session or retained data snapshot. For another workstation, follow the official Docker installation above, set `TB_DB_PASSWORD` in a local `.env`, and adapt these paths before using the helpers. Importing `dashboard.json` alone imports the dashboard configuration, not its devices or historical measurements.

Run `start.ps1` to start the installed containers, or `start.ps1 -Sync` to start and refresh the Azure copy. The script maintains an idle local WSL process because systemd services alone do not keep WSL running ([Microsoft documentation](https://learn.microsoft.com/en-us/windows/wsl/systemd)). Open <http://127.0.0.1:18080>. The local demonstration uses the standard ThingsBoard demo tenant account documented in the official installation guide. The instance is not configured for public hosting.

Run `node verify.mjs` from this directory for a read-only comparison of the dashboard, every temperature/vibration value and timestamp, and the imported alarm states. Run `node --test dashboard.test.mjs` for the template checks.

The `.env` database secret, `*.local.json` source/state/verification files and logs are excluded by the repository's existing ignore rules. No Azure token is written into them. `dashboard.json` is the exported configured dashboard. `install.log` records initialization.

To stop the local application without deleting its data:

```powershell
wsl -d Ubuntu -- docker compose --project-directory /mnt/c/Users/client/Documents/Industrial-telemetry-dashboard/infra/thingsboard stop
```

The operational state and acceptance evidence are tracked in `C:/Users/client/Documents/LinkedIn/SUIVI.md`, entry LI-C14-13.
