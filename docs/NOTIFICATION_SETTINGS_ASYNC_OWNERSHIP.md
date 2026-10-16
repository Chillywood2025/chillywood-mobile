# Settings notification async ownership repair

## Scope and boundaries

- Feature registry: `notifications-fcm`; route: `/settings`, Notifications accordion.
- Owner files: `app/settings.tsx` and `_lib/notifications.ts`.
- Account states: active, signed out, restore-only, same-user session replacement,
  account replacement, equivalent authority reconciliation, and transient authority
  revocation without a session-hook rerender.
- Lifecycle: focused, blurred, foreground, background, and unmounted.
- Android and iOS registration APIs keep their existing provider policy. No native
  module, channel, permission policy, delivery service, schema, RLS, Premium,
  payment, visual color, or background is changed.
- These are source/React/SDK transport tests. Native permission UI, push delivery,
  installed-device behavior, signed builds, and physical golden cases remain
  outside this evidence. No provider or production mutation, build, OTA, or
  release was performed.

## Reproduced defects and repair

The original `28a625179970c4caa8a0d1f40c66b54ab4cce37e` Settings source
passed the saved-value round trip but failed nine mounted ownership assertions.
It dispatched duplicate same-turn saves/refreshes; a held initial read could undo
a newer Register Device save; blur/refocus did not recover; a retired keyed
account/session could revoke its successor's install; and a retired registration
could enable preferences for a later owner.

Whole-helper tests additionally reproduced late permission/readback retargeting,
upsert after an awaited session lookup, and implicit missing-row creation after a
retired read. Actual installed Supabase SDK tests reproduced deferred bearer
selection after the last UI check. An independently reviewed same-owner authority
republish also retired a valid save, and automatic read failure retained a stale
Registered display. Each has a retained regression test.

The repair gives notification operations one synchronous action latch, semantic
account/session identity, and generation ownership. Automatic reads can be
superseded by an accepted user action. Stale results, errors, follow-on actions,
and finalizers cannot affect another generation. Focus, foreground and authority
events retire old operations; equivalent authority objects do not.

Settings-owned preference reads/saves/implicit inserts and registration capture
the existing account-bound mutation subject, verify its exact account/session,
and explicitly bind the initiating bearer at the actual SDK dispatch. Ownership
is rechecked after awaited preparation. Both Android providers reuse the same
captured token. Ownerless request/automatic-refresh entry points now capture the
published owner before their first await, retain a revocation subscription that
cannot revive after ABA, and use the same exact token capture. Callers with a
longer preference-to-registration chain still must capture that original chain.

Independent review of `93ee830d19664cae0c4b2b770cf6195c189f57ba` reproduced
three further durable-ordering defects: a save committed after return while the
screen retained older values; a dispatched FCM registration committed after a
newer disable/revoke; and an old account's late provider could rebind the shared
install after another account registered. The followup retains a per-user
preference write lease until actual settlement and rereads current values after
retirement, including a same-user keyed remount. Its local action latch also
survives blur/background until settlement.

Registration has an install-wide lease across every public request/refresh
entry point. A verified Expo result can return early, but a second provider or
the actual 15-second deadline cannot release the lease. Settings explicitly
shows "Device change pending" and explains that changes are paused while an
earlier request remains unresolved. Both providers and any exact old-session
cleanup must settle before another registration or Settings mutation proceeds.
If a transport never settles, that uncertainty remains visible and overlapping
mutations remain blocked. The owner subscription belongs to that transport even
after screen unmount and is removed when it settles.

Credential-bound old-owner revocation and its retry ledger remain intact,
including malformed/rejected receipt handling. A nonempty revocation ledger
after retry blocks new registration, including an ABA return to the exact old
generation. A retired screen alone does not queue same-session cleanup that
could later undo a valid new registration.

The reverse ordering was independently reproduced at `482c27356`: an automatic
registration could start during a held disable save, then its late FCM commit
could follow the disable's revoke. The same install lease now surrounds the
entire Settings disable action, from synchronous entry through its final revoke
settlement, including the save-to-revoke microtask gap. Internal old-owner
cleanup does not recursively acquire that lease.

Permitted preference-enable/general-save overlap with automatic registration
retains a coalesced pending readback if the observer is temporarily blocked by a
local action or read. Natural settlement reconciles persisted and visible truth
without another click, including failed-save signals. The initiating handler's
own explicit registration/revocation receipt takes precedence over an older
generic readback, so a failed or queued result cannot be erased by success from
an unrelated status read.

### Finite in-process ordering matrix

E = preference enable/general preference save; R = explicit or automatic
registration; D = false preference followed by revoke; C = exact old-owner
cleanup/ledger retry. This matrix concerns client-observable settlement, not
unknown server commit or process restart.

| Ordering | Retained coverage |
| --- | --- |
| E → E/D | Synchronous Settings action latch rejects overlapping callbacks. |
| E → automatic R | Safe overlap; both settlement orders, failed E with successful R, generic Messages variant, exactly one natural readback. |
| R → E/D/R | Held dispatched FCM, both-provider deadline, never-settled uncertainty; captured UI and ownerless helper attempts cannot overtake. |
| D → R | Both registration entry points during held preference, save-settlement microtask, and held revoke. |
| D → E/D/R after retirement | Held preference and held revoke across keyed same-user replacement, blur/return, background/return, and authority ABA. |
| D failure → retry | Failed save never revokes; failed revoke retains the ledger gate; confirmed cleanup allows retry without a later stale revoke. |
| R ↔ C | Install-wide cross-account/session settlement; exact old-owner cleanup completes before retry; queued cleanup blocks same-generation ABA. |
| External R → active read/action | One deferred readback, both natural settlement orders, stale-owner suppression, and newer explicit failure-receipt precedence. |

Held revoke through return/unmount retains explicit uncertainty and releases its
subscription on settlement. Other notification preferences keep their existing
per-user ownership; no destructive logout/deletion caller was changed.

Already-dispatched work is not claimed to be remotely canceled. A request may
settle with its initiating credentials; the screen suppresses stale completion.
Backend authority and RLS remain required and unchanged. The lease proves only
in-process ordering of outstanding client promises. A lost/rejected HTTP
response can settle the client without proving server non-commit, and a process
restart loses the registration lease. Universal server-side ordering or
exactly-once intent would require backend intent fencing/status or cancellation
receipts, which are not implemented or claimed here. The transport doubles
explicitly model a final rejection before commit in the retry test; that test
does not establish the outcome of an unknown server commit.

## Retained evidence

`tests/helpers/notification-settings-mounted-harness.mjs` mounts the entire actual
Settings function using React effects and production handlers. It loads the
whole notifications, authority, and account-bound capture helpers. It uses the
actual navigation-key function and a real keyed React remount at the production
account-boundary shape; it does not mount the complete Expo Router application.
Native and database boundaries are explicit doubles.
The helper uses the actual production deadline with controlled timers. Its
backend double separates request dispatch from durable commit and models exact
session-bound revocation, enabling held-provider ordering tests without real
provider or network actions.

- 21 mounted Settings cases: positive saves, first-action ownership, refresh,
  ringtone/ring controls, failure recovery, stale success/failure/finalizers,
  lifecycle, keyed replacement, authority revocation, and listener cleanup.
- 14 actual-helper transport cases: registration/revocation, held permission,
  held authority/storage, delayed native token, upsert/insert retirement, exact
  revocation receipt success, queued failure and retry.
- 11 actual Supabase SDK cases: save/register/implicit insert under same-user
  session replacement, another account, same-session token refresh, capture
  replacement, and unpublished wrong-session server readback.
- 22 durable-settlement cases: before/after refocus, foreground and keyed
  same-user replacement, missing-row insert, settled failure retry, backend
  ordering, the actual deadline, never-settled uncertainty, shared-install
  account replacement, queued-cleanup ABA, ownerless permission races, and
  replaceable pure reads that do not retain a mutation lease.
- 26 finite ordering-matrix cases covering the reverse disable ordering and
  natural readback/receipt precedence described above.
- 32 old-source/mutation controls, including retained `93ee830d` and `482c27356`
  defects. Child runs remove `NODE_TEST_CONTEXT`, require
  exit 1 plus the named `ERR_ASSERTION`/test-code failure, and reject loader,
  syntax, reference, type, unhandled-rejection, or cancellation false positives.
  All five historical source variants use checked-in deterministic reverse
  patches, with complete original/baseline source SHA-256 provenance and
  byte-exact verification against the original local blobs. The suite also
  passes with an invalid `GIT_DIR`; hosted CI needs no unpublished Git objects.
- 37 expanded-activity and 19 existing push-provider cases remain green. The old
  extracted Settings refresh test now executes the whole mounted screen.

## Validation

The focused command passed 182 tests, with no failures, skips, or cancellations:

```sh
node --test tests/notification-settings-mounted.test.mjs \
  tests/notification-settings-transport.test.mjs \
  tests/notification-settings-sdk-transport.test.mjs \
  tests/notification-settings-settlement.test.mjs \
  tests/notification-settings-ordering-matrix.test.mjs \
  tests/notification-settings-negative-controls.test.mjs \
  tests/notification-expanded-activity.test.mjs \
  tests/push-provider-registration.test.mjs
```

Also passed: `tsc --noEmit`, scoped ESLint on both changed source files,
`git diff --check`, and `node scripts/proof-ios-push-platform.mjs`.
The required-validation plan was inspected against `origin/main`; the larger
inherited branch still selects all conservative categories. This lane did not
rerun the full inherited product/database/native suite. Existing Product CI
discovers the new tests through `node --test tests/*.test.mjs` with full history.
The notification controls themselves do not depend on Git history.

Premium's independent mounted harness needs the authority subscription and four
pending-write/registration observation mocks, plus an inert
`withNotificationPushPreferenceChange` wrapper that awaits its callback. It must
also account for both Settings foreground listeners. Compatibility is coordinated with the parallel
Premium return lane.
