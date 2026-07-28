# Engineering notes

Design decisions behind this dashboard, written down at the time they were made rather
than reconstructed afterwards. Each section is dated and describes what changed, why, and
what was deliberately left out.

These notes were originally written as pull request descriptions during development. They
are kept here because the reasoning is the point, and a pull request list is not a stable
place to keep anything.

---

## 25 July 2026 · Repairing the published demo after a rename

Renaming the repository left the published demo serving a blank page. The Vite `base`
option was hardcoded to the old repository name, so GitHub Pages returned the HTML while
every asset request resolved to a path that no longer existed.

What the diagnosis actually looked like, since a status code alone would have been
misleading: the HTML answered `200`, and the asset it referenced answered `404`. The old
URL answered `404` with no redirect, because GitHub redirects a renamed repository but not
its project site.

**The fix was to stop hardcoding the name at all.** `base` became `'./'`, so asset paths
resolve relative to wherever the page is served from. This is immune to any future rename
rather than merely correct for the current one. It is safe here specifically because the
application is a single page with no router; a routed application would need a different
approach.

Verification worth repeating on any similar fix: the built output was served locally under
the exact Pages subpath, then under an unrelated subpath. Both resolved every asset. A
build that only works under one prefix has not been fixed, it has been re-pinned.

---

## 25 July 2026 · Rebuilding as an industrial supervision screen

The dashboard displayed home automation metrics for two generically named devices. It was
rebuilt around a plant: eight machines with tags of the kind used on a shop floor
(`PRESS-01`, `SPINDLE-02`), each carrying metrics appropriate to its kind rather than a
uniform row.

**Asymmetry is deliberate.** A press reports pressure and cycle counts; a spindle reports
speed. Giving every machine an identical set of readings is what makes a demonstration
look synthetic, because real plants are not uniform.

The first four machines mirror a companion telemetry server, operating limits included, so
both projects describe one plant rather than two unrelated ones. A test asserts that
mapping, so the two cannot silently drift apart.

### Alarms are earned, not seeded

Alarms used to be two hardcoded rows. They are now raised by a reading leaving its limits,
and each one carries its peak value, its duration, and the specific limit it crossed. The
lifecycle has four states, including the case where a reading recovers before anyone has
acknowledged it.

**Acknowledging is a state transition, not a deletion.** The row stays and is restated as
acknowledged; it leaves only once it has both cleared and been acknowledged. This is the
behaviour operators expect, and the opposite of what the original implementation did,
which removed the row on acknowledgement. An `Inject fault` control on each tile drives a
metric past its limit for a bounded window, so the entire path can be demonstrated on the
published demo without any backend.

### Rendering follows supervision conventions, not dashboard conventions

- Desaturated base. Colour is spent only on warning and alarm states. No per-metric colour
  coding, no green for healthy: if everything is coloured, nothing is signal.
- State carries a written label and a distinct shape in addition to colour, so it never
  depends on colour alone.
- Trends draw the warning line, the alarm line, and the exceedance band.
- Tabular figures with fixed decimals, so digits do not shift horizontally as values
  update. No web fonts.
- Sharp, dense borders rather than large rounded cards with shadows.

This also fixed a real defect: the previous chart hardcoded dark colours while the
stylesheet followed the operating system setting, so charts degraded badly on a light
system.

### Two guards worth calling out

`src/lib/contrast.test.ts` computes WCAG contrast ratios for every ink and surface pair in
the palette and fails below 4.5:1. It caught a genuine defect during development: muted
ink measured 4.38:1 against the raised surface, and the palette was corrected rather than
the threshold lowered.

`src/constants/theme.test.ts` asserts that the stylesheet colours match the TypeScript
palette, so the two copies cannot drift.

### On the test suite

The original tests asserted against the old domain, so they were rewritten rather than
frozen. Every one has an equivalent in the new suite and none was silently dropped. One
was deliberately inverted: the old suite asserted that acknowledging an alert removed it,
and the new suite asserts that the row stays and is restated. That inversion is the
behaviour change, not a regression.

Removed rather than left stale: screenshots of the previous interface, which no longer
showed this application. Regeneration is pending a capture tooling decision, and a README
pointing at a live demo is more honest in the meantime than one showing an interface that
no longer exists.

---

## 28 July 2026 · A live MCP data source alongside the simulator

A data source selector in the header. **Simulated stays the default**, so the published
demo runs with nothing installed and nothing configured. **MCP live** reads a real
telemetry MCP server through a small local bridge, calling its tools directly.

### How it is wired

`bridge/` is a separate Node package with its own manifest and lockfile. It speaks MCP
over stdio using the official SDK and exposes what it receives on loopback. There is no
hand-written JSON-RPC framing anywhere: line-oriented framing written by hand is where the
bugs live that break a live demonstration, and an official SDK exists.

The path to the server comes from the environment. The bridge exits with a configuration
error rather than guessing, so a misconfiguration is never reported as a connection
failure. No machine-specific path is committed.

`useMcpData` returns the simulated hook's shape plus a `connection` field, so no
presentational component had to change to accept either source.

**The browser bundle gains no dependency.** The SDK belongs to the bridge process; the
dashboard uses `fetch`.

### Degradation is stated, never silent

A server that is absent, stopped, or failing produces a banner naming the actual reason, a
header source reading `SIMULATED (FALLBACK)`, and simulated readings labelled as
simulated. The bridge answers `503` with the reason it received, never `200` with
substitute data.

This is the rule that mattered most in this change: presenting fabricated readings as real
ones would be worse than showing nothing at all.

### Alarm identity, and a defect found by looking

Alarms are matched to reported excursions by overlap on machine and metric, not by the
identifier the server returns.

The reason is a property of the server rather than a preference: it has no alarm
lifecycle. It re-scans a sliding window on every call, so its identifiers and boundaries
move between polls. The first implementation keyed on them, and the panel climbed to three
and then four open alarms for a single continuous fault, while a fault that had already
ended was reported again for as long as it stayed inside the window.

This was observed in a browser, not deduced from the code. Two tests now pin each symptom.

### A limit stated plainly

**MCP live works locally and not from the published demo.** A page served over `https`
cannot call `http://localhost`; this is browser mixed content policy, not a bug. Selecting
MCP live on the published demo will always report the server as unavailable, with the
banner explaining why.

### Testing approach

The suite runs as two projects: the application under a DOM emulation layer, the bridge
under Node. Bridge logic is driven by a fake child process with a real SDK server on the
far end of an in-memory pipe, so no process is spawned and no socket is opened during
tests.

---

## A note on the numbers

Test counts and coverage percentages have been deliberately omitted from these notes. The
continuous integration pipeline proves that the suite passes; it does not independently
attest to its size or its coverage ratio, and quoting a figure that has not been measured
independently would be exactly the kind of unverified claim these notes exist to avoid.

Run the suite yourself if the numbers matter to you.
