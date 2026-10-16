# AccessSheet semantic-authority lifecycle repair

Date: 2026-10-16. Base: `50bf3db48496d8cca5f1b3b92063766247ea41c9`.

## Reproduced behavior

Account-authority readback can publish a new object with the same user, account,
session generation, active state, and restore-only fields. AccessSheet's
`currentSheet` callback depended on that object's reference. An equivalent
readback therefore rebuilt the focus callback, ran focus cleanup, incremented
the action epoch, and retired an otherwise-current operation.

Held Purchase, Restore, and Continue reproduced the failure: the busy state
could release before completion, purchase / Restore parent delivery was dropped,
and Continue feedback was discarded. The gate, presentation, focus, foreground,
and actual account binding had not changed.

## Bounded source change

The presentation scope retains the initiating semantic authority binding.
`currentSheet` and the authority subscription compare that binding with current
authority using the existing comparator. Equivalent readback does not rebuild
the focus owner. Real authority replacement or revocation still increments the
epoch immediately through the subscription, including revocation followed by
the original authority returning before a render. Account/gate/presentation
replacement, blur, background, dismissal, unmount, and single-flight action
guards remain in place.

No account authority, entitlement, money, navigation destination, provider, or
database policy changed.

## Retained regression evidence

`tests/access-sheet-lifecycle-mounted.test.mjs` runs the complete production
component and returned controls, with modeled external service boundaries:

- Seven equivalent-object republication cases: Purchase and Restore at mode,
  provider, and parent-callback boundaries, plus Continue's callback boundary.
  These require pending busy state, no redundant focus read, one operation,
  one parent delivery, preserved feedback, and proper busy-state release.
- Six no-rerender revocation cases: Purchase, Restore, and Continue, with both
  permanent revocation and a transient revoke/restore (ABA) sequence. Old
  controls and delayed results stay retired.
- All prior 76 mounted lifecycle cases continue to pass.

`tests/access-sheet-semantic-authority-negative-controls.test.mjs` executes three
source mutations: raw-object focus dependency, raw-object event comparison, and
removed real-revocation retirement. Each must produce the named assertion
failures for Purchase, Restore, and Continue. Child runners clear
`NODE_TEST_CONTEXT`; import errors, syntax errors, cancellation, and timeouts do
not count as evidence. Existing lifecycle mutation controls also pass.

## Validation

Passed 219 scoped cases:

```sh
node --test \
  tests/access-sheet-lifecycle-mounted.test.mjs \
  tests/access-sheet-semantic-authority-negative-controls.test.mjs \
  tests/premium-lifecycle-negative-controls.test.mjs \
  tests/player-watch-party-actions-mounted.test.mjs \
  tests/premium-settings-return-mounted.test.mjs \
  tests/premium-settings-return-negative-controls.test.mjs \
  tests/premium-subscribe-mounted.test.mjs \
  tests/premium-settings-mounted.test.mjs \
  tests/premium-current-state.test.mjs
```

Also passed `npm run typecheck`, `EXPO_NO_TELEMETRY=1 npm run lint` with zero
warnings, and `git diff --check`.

These are cloud source/lifecycle tests with actual React hooks, not installed
native UI, provider, backend, or physical-device proof. No remote write, build,
OTA, production mutation, or device action was performed. The separate composed
iOS Settings return tests retain their explicitly modeled provider/projection
boundary; no new App Store qualification is claimed.
