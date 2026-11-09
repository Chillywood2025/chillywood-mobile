# Normal-app native store sandbox preparation

Feature scope: `native-store-sandbox-command-v1`, the preparation portion of
`native-store-sandbox-bridge-v1.md`. This is source integration, not an enabled
purchase flow, deployed endpoint, provider qualification or installed proof.

## Surfaces and authority

- Normal non-Test-Store sandbox-video offers link to
  `/sandbox-videos/native-offer/[offerId]`.
- `NativeStoreSandboxQuoteScreen` uses `nativeStoreSandboxQuote.ts` for exact
  offer reads, saved-selection preparation and original-request recovery.
- Any active signed-in account can use the route, subject to the backend's
  existing buyer, session, resource, offer and media checks. No admin role gate.
- The client snapshots the initiating user/account/session; a session gap
  permanently retires that owner. Late replies cannot rebind to another account.
- iOS maps to APP_STORE and Android to PLAY_STORE. Web and all isolated Test
  Store flavors are excluded. Existing V3 routes and SDK ownership are unchanged.

## Failure and recovery

Authentication, local storage and network work have bounded waits. An original
request and full quote are saved before preparing remotely. A failed or delayed
write cannot be replaced by another mounted owner. Once saved, the screen offers
read-only recovery, not a new prepare. Unknown replies remain unknown.

The server reply must match the exact actor, command, request, native store,
quote, original request/session and negative authority flags. Neither a quote
nor a selection enables a store call, access grant, playback, earnings or payout.
This client imports no RevenueCat SDK. It sends only to the new command endpoint.

## Dormant callback capture

`captureCallback` accepts a callback only against the same client's server-confirmed
prepared or recovered selection. It snapshots and persists the exact transaction
and product identifiers before sending an explicit client assertion. It stores
neither purchase tokens nor raw receipts. A missing transaction identifier cannot
fall back to a token or inferred user/SKU match. `recoverClaim` preserves the
original request across process restart and a new active session of the same
account; uncertain writes never authorize a replacement claim or purchase.

This sink is not connected to a purchase button or SDK invocation. Its result
remains `client_assertion` with settlement disabled, even if identifiers match.
It must not be used as evidence that a callback came from a sandbox transaction.

## Accessibility, rollback and proof limits

The screen has a header, back action, labeled buttons with disabled state,
48-point minimum controls, a live status announcement and scrollable content.
It uses the shared Chi’llywood branded background and visual tokens, transparent
safe area, and the existing back-or-Library navigation fallback in every state.
Removing the normal-offer link or leaving the source endpoint uninstalled
returns the flow to unavailable without affecting existing purchases or grants.

Client and mounted React tests exercise preparation/recovery, account changes,
unmount, late replies, uncertain storage, concurrent owners and separate debug
flavors. Native provider purchase, refund/restore, signed build and installed
device behavior remain unproved. Before claiming checkout works, qualify both
platforms' initial one-time sandbox correlation and test real installed user
flows, interruption/relaunch, account switch, receipt delay and negative events.

## Dormant original-purchaser evidence retention

The shared RevenueCat purchase owner accepts an optional local evidence retainer.
It snapshots that callback and the initiating authority before asynchronous work,
then retains only exact product and transaction identifiers before post-SDK account
validation can reject a retired session. Restore never invokes this seam. Existing
callers without a retainer keep their purchase behavior. The seam has no active
normal-app caller, does not invoke an SDK itself, and grants no dispatch permission.

`createCallbackRetainer(selectionId, consumedEvidence)` must be captured while the
original account is active, against its exact server-confirmed selection,
reservation, retained local request and quote. It freezes the consumed-attempt
identity and returns a local-only sink. Supplied consumed evidence is NOT server
attestation or provider qualification; there is no authenticated consumed-attempt
issuer connected to this client. A supplied `consumed` state does not admit an SDK
call. The sink remains able to save original-account evidence after disposal or
an account switch, without reading current authentication or making a network call.

The local SavedClaim version 2 record contains only the transaction/product
whitelist, existing original-account/request/selection scope, and consumed-attempt
linkage. It stores no raw receipt, purchase token, signature or SDK customer data.
Exact duplicate callbacks share the same persistence promise; conflicting evidence
cannot replace the original. Local writes and wrapper retention are bounded.
A timeout or rejected write is reconciliation-required, never a harmless canceled
purchase or permission to buy again. A late write may still complete. Changes to
SDK identifiers while retention is pending cause the wrapper to reject rather
than return identifiers different from the retained evidence.

Only a later authenticated session of the same original account can use existing
claim recovery/resend. The public claim payload remains selection, transaction and
product only: local consumed-attempt linkage is not presented as server-validated
purchase evidence. The assertion remains unqualified, correlation unsupported and
settlement disabled. Evidence retention does not solve process death before a
callback arrives; durable reservation/consumption fences must preserve that
uncertainty. Real provider receipt correlation and installed no-charge qualification
are still required before any purchase dispatcher can be enabled.

Focused tests exercise the actual shared wrapper with synthetic deferred SDK
results, retirement during SDK work and persistence, immutable identifier checks,
controlled retention deadlines, strict UTF-8 limits, original-account local storage,
exact/conflicting callbacks and original-account-only recovery. These are source
proofs, not successful purchases or hosted deployment evidence.

### Explicit app evidence and draft dispatch wire contract

The normal client now has a bounded, explicit `readNativeSandboxAppEvidence` read of
its actual native adapter. It never runs during catalog lookup/startup, returns only
whitelisted app fields, rejects account gaps and native permission claims, and remains
nonqualifying on iOS; Android is unsupported. No caller supplies the native evidence.

The existing authenticated command endpoint recognizes `dispatch-consume` and
`dispatch-recover` with only selection/reservation IDs and an immutable request ID.
It routes to `native_store_sandbox_dispatch_v1`, whose qualification/consume SQL is
in the fixed 42-module, default-off source closure. No real qualification record is
seeded, and this does not establish hosted installation or provider readiness. A missing
RPC stays uncertain and never retries a purchase. The pure response validator binds first consume to the
current session and exact request/reservation; replay/recovery never allows dispatch.
Android remains blocked even with an operator qualification row. Qualification fields
are trusted server evidence, not caller assertions or proof of an executing build.
A future iOS dispatcher must separately read actual native Sandbox app evidence and
compare its local build/version and signed app-version string; local Bundle values are not server attestation.

`dispatchPreparedNativeSandboxPurchase` now supplies the dormant normal-client
orchestration. The normal screen first exposes a read-only qualification check; the
explicit checkout action remains disabled unless exact server metadata is available
and the existing build gate is already enabled. It never enables that build gate. It creates its own authenticated client,
recovers the exact selection, discovers qualification without writes, explicitly reads actual native app evidence,
and checks existing SDK identity/payment capability/product price. No caller supplies
qualification or an app-evidence boolean. Only after discovery and local preflight may
an explicit checkout create a new reservation; missing qualification does not strand
a fresh selection in a permanent reservation. Consume revalidates current evidence. A persisted request precedes server consume;
a committed first-consume response is followed by durable `consumed` and `sdk_started`
markers before the existing SDK owner is invoked. Missing qualification, wrong local
build/version, wrong scope, storage failure, or uncertain consume response prevents SDK
invocation. An uncertain server reply is recovered using the exact original request;
replay/recovery cannot return permission. No consumed/started record can repurchase. The per-offer marker currently prevents a
later legitimate replacement selection too; a future explicit terminal-disposition
protocol is required, never a timeout reset or rearm.

The optional recovery-only mode performs no OS/SDK reads or purchase, and may read
historical server state after a same-account session change. Callback evidence remains
bound to its original account even when that account retires during the SDK result.
SDK result success does not settle or grant access. `sdkVersion` currently means the
exact JavaScript `react-native-purchases` dependency, 10.15.1. Android stays unsupported:
normal internal track is not no-charge proof, and no current billing-account attestation
API is invented here. No real SDK call was made; tests use the real wrapper and client
with a synthetic SDK boundary, never an installed no-charge purchase.


Local PostgreSQL integration now executes the real normal client, shared Edge handler,
actual qualification/reservation/consumption SQL, existing SDK owner wrapper with a
synthetic SDK boundary, durable callback retainer, and actual assertion claim SQL.
Seven cases prove no reservation on missing qualification, write-before-SDK ordering,
private callback whitelisting, no replay purchase, lost-before/after-commit recovery
with the same request across sessions, and original-account retention after retirement.
The combined qualification harness passes 34 cases plus 33 normal-command cases.
This is not an observed provider purchase or callback/webhook mapping qualification;
settlement still requires a separate real-observation qualification and projection.

### Signed app version is an independent observed value

The operator qualification requires `signedAppVersion`, the exact raw
`AppTransaction.appVersion` observed for the qualified app transaction. It is
not inferred from either unsigned `CFBundleVersion` (`nativeBuild`) or unsigned
`CFBundleShortVersionString` (`nativeVersion`). All three comparisons remain
independent; missing or mismatched signed values block dispatch. No real value
is seeded by this source change.

Apple's [appVersion documentation](https://developer.apple.com/documentation/storekit/apptransaction/appversion)
describes a machine-readable Xcode version but does not establish equality to
the marketing version. Its [originalAppVersion documentation](https://developer.apple.com/documentation/storekit/apptransaction/originalappversion)
says that property is comparable to appVersion and uses CFBundleVersion on
non-macOS platforms. We therefore do not assume a mapping. OriginalAppVersion's
sandbox constant is not used as current appVersion evidence. Synthetic tests
intentionally use different signed, build and marketing values; they are not
installed-app qualification or signed-build attestation.

### Terminal disposition client boundary

The existing authenticated command endpoint now routes `cancel-preparation`
and `terminal-recover` to the distinct service-only terminal RPC. The client
persists the original cancellation UUID before sending and reuses it after an
uncertain response; it never erases the saved selection, reservation, callback,
or SDK marker. Cancellation is a server request to prove no consumption, not
interpretation of an SDK cancellation. All terminal responses keep dispatch
false. An allocated terminal carries an exact grant identifier for a future
fresh gateway check, not cached access permission. Refunded-before-allocation
terminals carry no grant. A cancellation before any reservation can have a null
reservation ID without creating a slot merely to abandon preparation.

Successor storage is append-only: a fresh authenticated terminal for the exact
old selection permits a deterministic successor pointer, never deletion or
rearming of the original quote, callback, cancellation or SDK record. Captured
clients pin their generation. Late original writes therefore cannot overwrite a
new generation. The shared-SKU marker advances by the same terminal-backed
rule, including across offers. Reads revalidate terminal evidence, are bounded,
and stop closed on missing/conflicting records. This is a local device fence;
server active-slot/consumption locking remains authoritative across devices.

The normal branded screen exposes explicit terminal read, abandon-unconsumed,
and new-selection actions. Consumed/uncertain attempts cannot be abandoned by
interpreting an SDK cancellation. Allocated terminals still require fresh media
access checks; refunded-before-allocation terminals grant no access. Dispatcher
markers are now per selection; any matching original per-offer marker remains a
fallback fence. No timeout resets or purchase retries are introduced. Synthetic
client/mounted/orchestrator tests pass; actual backend terminal integration and
native playback qualification remain separate checks, not claimed here.

### Distinct native playback UI

Only an authenticated `allocated` terminal supplies the normal screen's native
playback reference: exact grant ID, resource ID and retained native quote. That
reference is not permission to read bytes. Explicit Open obtains a fresh private
range lease through `native-store-paid-video-range-v1`; Play remains a separate
user action. Cancelled or refunded-before-allocation terminals expose no player.
The normal shared background stays in place, and the native player uses the
shared visual tokens. The Test Store V3 player and quote parser are unchanged.

The native component retires its exact player on route blur, backgrounding,
account/session changes, held/expired gateway lease, native errors and unmount.
It disables caching, ambient/background playback, external playback and picture
in picture. Clearing/releasing the player does not claim buffered bytes were
physically erased. Mounted tests use the actual native adapter/component with
synthetic network and native player boundaries, not an installed-device playback
or provider observation. Real allocation/gateway proof remains separately scoped.
### Dormant ingress and service reconciliation runtimes

`native-store-ingress-v1` and `native-store-reconcile-v1` are source-only,
independently default-off boundaries. Neither is configured or deployed by these
changes. Both prepared bundles include the function-local frozen Deno lock and
Supabase SDK 2.110.6. Mandatory Deno 2.9.6 tests use synthetic credentials and
loopback-only networking with application environment variables stripped.

Ingress requires its exact configured connection revision and provider secret.
Even a durable retained delivery returns non-2xx: dedicated provider routing and
acknowledgement remain unqualified. It never retries a persistence operation.
Reconciliation requires the exact configured legacy service-role Bearer key,
not a decoded role claim or a new-format secret-key fallback. JWT verification
remains enabled for that service endpoint. Its bounded POST body contains only
`rawReceiptId`. The worker reads the original immutable registry and key ID;
missing original key material never falls back to the latest connection revision.
Only generic processing status is returned, not retained identities, raw receipts,
keys, private effects or access authority. Unknown writes remain uncertain.

The enable variables are `NATIVE_STORE_INGRESS_ENABLED` and
`NATIVE_STORE_RECONCILE_ENABLED`; both require the literal `true`. Server-owned
`NATIVE_STORE_CONNECTIONS_JSON` is parsed strictly and is never supplied by a
request. No real values are included or installed. There is no scheduler,
provider fetch, live-money activation or automatic acknowledgement.
