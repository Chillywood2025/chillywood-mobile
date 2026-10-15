# Live recovery regression coverage

This test-only follow-on closes two automated coverage gaps from the Live Stage,
Watch-Party Live and camera repair reviews. It does not change product behavior.

## What executes

- The required Sensitive lane now runs the 51 existing authority tests with the
  real Deno runtime and typechecks both complete Edge entry points. The existing
  Node/VM runner remains additional monitor-wiring coverage, not a replacement
  for Deno's real imports and typechecker. No production credentials are needed.
  Player, Watch-Party routes and shared Watch-Party helpers explicitly select
  Sensitive validation, so changing their source cannot omit these checks.
- A React root mounts minimal compositions of the actual Player and Stage
  production statements. State declarations, complete effects, callbacks,
  dependency arrays and cleanup are selected verbatim from source. The tests do
  not manually invoke or rerun effects. Native AppState, clocks, service
  responses and subscriptions are controlled external boundaries.
- Player cases exercise unchanged-authority transport recovery, the actual
  bounded retry policy, explicit retry, StrictMode effect replay, ownership
  changes, cancellation of still-pending timers and inertness of already-queued
  retired callbacks, plus background/unmount cleanup. Pure authority matching uses the
  actual production helper; JWT parsing is outside these mounted cases.
- Comment cases exercise React state updates from persisted insert/edit/delete,
  subscription resync, fallback polling, failed reads and retired room/account/
  session ownership.
- Stage cases execute its complete initialization effect and production state/
  refs through the final asynchronous snapshot, resource creation, heartbeat,
  room replacement, access revocation and unmount.
  The actual refresh callback is included: changing myUserId recreates it and
  React retires the first initialization before the replacement can publish
  resources. The service snapshot promises are the controlled boundary.

## Controls against false confidence

- Removing the actual retry-serial dependency stalls React recovery even though
  the real timer updates state. Removing the Stage post-await cleanup guard
  creates real test subscriptions/heartbeats after unmount. Both counterexamples
  are asserted alongside the passing current-source expectations.
- Three existing behavioral expectations are rerun against immutable merged
  pre-repair commit `985409b4c6cec9e5ed94e5f029894774a40fcc27`. They must fail with
  assertion errors for absent retry, missing persisted chat and orphaned Stage
  resources. Import, extraction and syntax failures do not count as evidence.
  The same three expectations must also pass current source. Product CI already
  checks out complete Git history for historical native compatibility tests.
- Workflow regressions require both exact canonical Deno commands in the
  non-optional required lane with an explicit fail-fast shell. Removal, optional
  execution, inert conditional wrappers, early exits, disabled error handling,
  shell overrides and swallowed-failure mutations are rejected.

## Boundaries of the claim

These are mounted production compositions, not complete routed-screen or
installed-device tests. They do not establish real Supabase Realtime transport,
LiveKit provider delivery, physical camera/lens behavior, remote RTP effects,
visual quality, performance, thermal behavior or store/distribution readiness.
Existing full database, real SDK and Android/iOS native compiler gates remain
in place. Source merge and successful CI do not establish those external or
physical outcomes.
