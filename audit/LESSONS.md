# Local integration findings

- September 19 recheck: ARM Running did not establish HTTP availability. The first browser/API request returned 503; startup logs showed an initial SQL connection ETIMEOUT after 15000 ms and process exit. The next automatic platform startup succeeded, with the historical acknowledgement intact. Record both attempts and verify authenticated readiness. The prior paused SQL state is context, not proof of causation. No resource upgrade or configuration change was required.

- A successful button click did not imply a persisted acknowledgement. The first browser attempt returned HTTP 403 because the development proxy rewrote Host while keeping the original Origin. The proof now checks the POST status, server timestamp and a second Reader session. The proxy preserves Host.
- Stopping SQL exposed an unhandled connection-pool error that terminated the API. A sanitized pool error handler was added. The actual outage exercise then returned 503, kept the API alive and recovered to 200 after SQL restarted.
- An empty source previously displayed 100 percent availability and zero open alarms. Tests reproduced both misleading values. Unknown counts and no-data timestamps now distinguish unavailable data from a healthy empty fleet.
- During simultaneous local model inference, the existing browser-unit tests exceeded their five-second deadline. The failed attempts were retained in the local execution log. Verification must report the actual rerun outcome; increasing a test threshold is not a functional correction.
