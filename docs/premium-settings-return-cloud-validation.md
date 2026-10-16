# Premium purchase / Restore → Settings: cloud source validation

Date: 2026-10-16. Base: `28a625179`.

## Reproduced defect and repair

For an account that already has authoritative active Premium, a failed Restore
returned `ok: false` and `Unable to restore purchases right now.` from the actual
monetization helper. Subscribe discarded that outcome because the shared cache
still correctly reported active access, and displayed `Purchases restored.
Premium is active.` instead.

The single production-source change requires `result.ok` before displaying the
Restore success notice. An unsuccessful Restore now retains its actual failure
message, while returning to Settings still displays the independently verified
active subscription. No entitlement, purchase gate, or provider behavior changes.

## Executable coverage

`tests/premium-settings-return-mounted.test.mjs` mounts the complete production
Settings and Subscribe functions, preserving their hooks and handlers. It invokes
the always-visible Manage Premium control, purchase / Restore controls, and Back,
with navigation focus transitions and one shared actual monetization module,
cache, and subscription owner. The returned React elements are inspected rather
than rendering native child components.

The 31 composed iOS cases cover:

- Purchase and Restore followed by independently modeled authoritative projection
  and settled active Settings truth, including exact product and account binding.
- Already-owned purchase recovery through the actual Restore helper.
- Failed reconciliation, a positive reconciliation response without a projection,
  and unknown account authority. A provider signal never becomes app access.
- Cancellation, purchase failure, Restore failure, and empty Restore.
- The reproduced active-account Restore false-success notice.
- Expiry discovered on return, a failed refresh, and genuine Refresh recovery.
- Held older inactive and active reads before navigation; held return reads
  resolving or failing after a newer expired shared snapshot.
- Same-user session and other-account replacement during held return reads,
  preserving successor loading until its own read settles.
- Purchase / Restore finishing after Back and notifying focused Settings without
  a manual refresh.
- Held purchase / Restore across same-user replacement, another account, and
  logout; retired operations do not reconcile a successor account.

`tests/premium-settings-return-negative-controls.test.mjs` retains 8 executable
counterexamples: the original Restore defect, missing return refresh, missing
cache notification, old cache read winning, provider-only access, bypassed
purchase handler, bypassed Restore handler, and retired completion clearing
successor loading. Every control must fail its named behavioral assertion, not
syntax, imports, a timeout, cancellation, or an empty subprocess test run. Child
runners explicitly clear `NODE_TEST_CONTEXT`.

## Validation

Passed:

- 156 scoped cases: `node --test tests/premium-settings-return-mounted.test.mjs
  tests/premium-settings-return-negative-controls.test.mjs
  tests/premium-subscribe-mounted.test.mjs tests/premium-settings-mounted.test.mjs
  tests/premium-current-state.test.mjs tests/access-sheet-lifecycle-mounted.test.mjs`
- `npm run typecheck`, including its existing guards.
- `EXPO_NO_TELEMETRY=1 npm run lint` with zero warnings. The initial telemetry-on
  invocation could not create the Expo home directory; telemetry-off lint passed.
- `git diff --check`.

The required-validation plan was inspected. Its aggregate selection includes
unrelated changes already present on the supplied branch, so the full product /
database / native aggregate was not duplicated in this bounded lane.

## Evidence boundary and remaining proof

Registered feature: `revenuecat-premium`. Scoped surfaces: `/settings`, `/subscribe`,
the actual monetization / entitlement-policy / purchase-closure modules, and
their account-session ownership. The iOS platform branch uses modeled
`ios-release` configuration and the actual sandbox-rail resolver. The public
purchase hold remains intact. Android return behavior is not newly qualified by
the iOS composition; existing shared-module and Android mounted regressions pass.

Account/session, database projection, SDK, and navigation boundaries are modeled.
Only the provider-authority poll clock is accelerated; all 12 production attempts
and their 1,250 ms requested delays remain exercised. No real provider transaction,
backend reconciliation, native SDK bridge, signed artifact, installed iPhone,
physical interaction, accessibility layout, or App Store purchase / Restore was
verified. Provider-backed iPhone golden cases remain outstanding. No device,
production service, release, build, OTA, migration, grant, or store setting was
changed. This is source regression evidence, not release qualification.
