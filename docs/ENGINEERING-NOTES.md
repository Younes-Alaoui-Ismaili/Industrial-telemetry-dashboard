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

## 3 August 2026 · Asset faceplates, and a trend zone that belongs to the fleet

The trend pane held two charts and was driven by whichever card had been clicked. A
machine with more metrics than that lost the remainder silently: clicking `PRESS-01`, which
carries temperature, vibration, pressure and a cycle count, drew two trends and gave no
sign that two more existed.

The cause was not a shortage of room. It was asset detail sitting inside an overview
screen. Supervision practice separates the two: an overview states plant condition and
deviation from it, and everything about one machine belongs a layer up, in a faceplate
called from the overview. This change puts the two layers where they belong.

### The faceplate

Clicking anywhere on a card opens a dialog over the running screen. It draws **one full
trend per metric the asset has**, in a two column grid whose row count comes from the
metric list itself. Nothing counts slots. A machine with five metrics would draw five
trends without a layout change, which is the property the previous version lacked.

Under the trends sits that machine's alarm list, filtered to it and stating plainly when
there are none. It is the same component as the fleet list, given three optional props,
rather than a second alarm renderer: the row is where the lifecycle is stated, and forking
it would be how the two copies start to disagree.

Written against the DOM rather than taken from a package. Escape, a close button, a press
outside, a focus trap and focus returned to the card that opened it are a few lines of
event handling; a dependency for that would be larger than the feature.

**Two details worth keeping.** The dialog reads the same state the cards read, so an alarm
raised while it is open appears in it without a reopen. And it renders from the asset
looked up by id, not from the id alone, so switching to the live source under an open
dialog closes it instead of crashing on a machine that no longer exists.

### The trend zone was repurposed, not removed

It now shows the two metrics closest to their limits **across the whole fleet**, coupled to
nothing. Removing it was considered and rejected: the boot sequence waits on a real fact
about the trend pane, and deleting the pane would have meant rewriting that fact and its
test to no benefit. Repurposing cost one line.

Ranking lives in a pure module. Level first, then how far a reading has travelled from its
nominal towards its limit as a fraction, which is what lets a temperature in C and a
vibration in mm/s be compared at all. Counters cannot be candidates: a cycle count has no
limit to approach.

**The incumbent keeps a small bonus.** Without it the zone reshuffles on nearly every two
second tick, because simulator noise moves normal candidates past each other by a few
percent, and charts that swap that often carry no information. An escalation still
preempts immediately, because level is compared before proximity.

### A defect the stated fix would not have caught

Stopping the inject button's click from reaching the card is the obvious half. The other
half is that activating that button from the keyboard fires a `keydown` that travels to the
card on its own, independently of the click it synthesises. The card would have opened a
dialog behind the fault. The wrapper now ignores any key event that did not originate on
it. Both halves are pinned by tests.

### Verified, and by what

The dialog was opened in a real browser, not only under the test DOM, because charts that
render in an emulated layout can still measure to nothing in a real one. `PRESS-01` draws
four trends, three of them carrying their warning and alarm lines with the values stated,
and the cycle count carrying neither.

Page height was measured on both branches at both resolutions rather than eyeballed. The
overlay adds nothing to the document, and the trend zone heading was folded onto one line
after the first version of it was measured 18 px taller than main.

### Left out deliberately

No body scroll lock, and no `inert` on the background: the page does not scroll at the
resolution it is laid out for, and `aria-modal` already removes the background from
assistive technology. Longer history windows stay on the roadmap; this change is about
which metrics are reachable, not how far back they go.

## 3 August 2026 · A connect guide instead of a failure report on first selection

On the published demo no local bridge can ever answer, by browser mixed content policy.
Clicking MCP live therefore always ended on a banner written like an outage report, for a
situation that is actually an optional install that has not been done. The demo was
underselling its best feature at the exact moment a visitor showed interest in it.

### Probe first, so there is nothing to roll back

Selecting the live source now asks the bridge's health route for an answer before anything
switches. A bridge that answers hands the switch to the live hook exactly as before. One
that does not opens a short connect guide, three numbered steps and a single action, and
the source never leaves the simulator. That ordering is the whole design: the selector, the
header and the absence of a banner after closing the guide are not three restorations, they
are one fact observed three ways. The health route was chosen over a snapshot because it
costs the bridge one MCP tool call instead of four.

The probe timeout is hand rolled with `AbortController` and `setTimeout` rather than
`AbortSignal.timeout`, because jsdom schedules the latter's timer outside the fake timers
the tests drive. A probe that comes back negative also drops any faceplate opened during
its window: two document level key handlers and two focus traps fighting over one Escape is
not a state the screen is allowed to reach.

### A closed vocabulary list, checked on rendered text

The guide's mandate carries a closed list of six words that must not appear anywhere in the
flow: they are the vocabulary of a product defect, and a missing optional install is not
one. The list is pinned by tests that sweep the rendered text of the whole screen, guide
open, guide closed, and link lost, rather than by grepping the source: identifiers such as
the `unavailable` status value are wire protocol, not prose, and stay.

The same list is why the degradation banner no longer renders the connection's raw detail
string. `Failed to fetch` is the browser's wording, not the dashboard's, and no sweep can
guarantee a string another program composes. The detail stays in the connection state for
anyone reading it from code; the banner states the substitution in its own words and says
that polling continues.

### The dialog shell is the faceplate's, not a second one

The guide reuses the faceplate's dialog mechanics, extracted into a shell component rather
than reimplemented. The extraction commit is the proof of its own safety: every faceplate
and App dialog test passed without a single edit. The honest labelling contract survives
untouched: a live session that loses its bridge still shows the banner and the
`SIMULATED (FALLBACK)` header label, and simulated readings are never presented as live.

---

## A note on the numbers

Test counts and coverage percentages have been deliberately omitted from these notes. The
continuous integration pipeline proves that the suite passes; it does not independently
attest to its size or its coverage ratio, and quoting a figure that has not been measured
independently would be exactly the kind of unverified claim these notes exist to avoid.

Run the suite yourself if the numbers matter to you.
