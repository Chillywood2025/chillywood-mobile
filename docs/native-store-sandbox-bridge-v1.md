# Native store sandbox bridge v1: preparatory intake only

This separate protocol is for normal Apple/Google store evidence. It does not
change the existing normal RevenueCat SDK identity owner, existing webhook,
legacy entitlements, Test Store V3 DEBUG restrictions, or any provider setting.
There is no new deployed endpoint, purchase path or grant writer. The companion
`isolated-runtime/native-store-sandbox-v1` package now supplies a source-only,
default-off durable journal, tested in disposable PostgreSQL, not installed in
the app's backend.

`prepareNativeStoreSandboxIntakeV1` authenticates the exact configured shared
secret and retains bounded original bytes using the existing lossless encrypted
envelope. Configuration is server-owned and snapshotted before asynchronous
work. Scope includes the version, project, app, native store and SANDBOX. The
project comes from the authenticated connection, not the payload. A connection
revision must immutably pin its app/store configuration in future persistence.
The inherited AES AAD binds connection revision and project, not the bridge,
app and store tuple directly. A future registry must enforce that immutable
mapping and revalidate it on replay. `scopeKey` alone is not cryptographic proof.

The result is worker-private: observation fields, reconciliation subjects and
the base64 observation metadata contain plaintext or easily decoded identities.
Only the original raw receipt bytes are encrypted. Never log the result or
return it to a client; a future HTTP handler needs a separate minimal response.

A syntactically matching initial one-time purchase is `purchase_unqualified`,
not a verified purchase. All other events need project-level reconciliation.
Productless transfers retain both sides, original/current identities, aliases
and ambiguous identities. These are opaque evidence, not account ownership.
Malformed authenticated data is retained rather than acknowledged or discarded.
The output never grants access, dispatch, financial or acknowledgement authority.

## Immutable catalog preparation

`snapshotNativeStoreSandboxCatalogV1` validates a one-time, USD, quantity-one
binding to the existing isolated paid-video resource/asset contract and hashes
every field in canonical order. It uses a distinct `nssv1_catalog_` identity,
never a Test Store registration. The content digest is not a signature. Server
persistence must retain it immutably with the binding revision and purchase
intent before use. Do not trust a client-supplied expected digest.

`compareNativeStoreSandboxCatalogV1` compares an explicitly selected binding
and retained digest to exact project/app/store/environment/wire-product fields.
It never searches by buyer/SKU or guesses Google base-plan encodings. Multiple
resources can share a SKU without becoming interchangeable. A catalog match
still leaves correlation unsupported and all positive authority false. Actual
provider price/currency, transaction ownership and intent correlation remain
separate unimplemented checks, not consequences of a catalog match.

## Remaining integration, not hidden enablement flags

1. The companion journal retains raw receipts, deliveries, conflict variants and
   an explicitly held native-store consumer disposition. Its native regression
   exercises duplicates, concurrency, timeout rollback and revocation fences.
   Shared HTTP ingress and the remaining consumer dispositions still need wiring
   before acknowledgement is permitted. Durable storage alone is not a receipt
   acknowledgement or positive purchase qualification.
2. Qualify actual initial one-time Apple and Google sandbox events against the
   exact purchase invocation and server-owned immutable catalog. Observe the
   actual offering/correlation representation, transaction chain, identity,
   store and environment. Never choose the latest pending purchase by SKU/user.
   Offered IDs, SDK success, client hints or synthetic fixtures are not proof.
3. Implement immutable correlation and transaction ownership, negative-event
   reconciliation across old and new access paths, and isolated grant projection
   before wiring media delivery. Unknown purchases remain unknown, not retried.
4. Exercise cancellation, transfer, late/duplicate events, session changes,
   rollback and retained recovery on qualified installed builds.

Read-only inspection of already delivered provider events is sufficient to
learn their wire shape, but not to establish a new end-to-end purchase chain.
A new observation requires an explicitly authorized installed sandbox flow and
verified no-charge store account. Google internal-track membership alone is not
license-testing proof and may charge a real card. Do not create products,
change routing/keys, activate money, purchase or deploy to obtain evidence under
source-only authorization. Apple TestFlight and Google internal-store builds
must not be replaced by Test Store V3 debug side-loading without a user decision.

## Local regression

`node --test tests/creator-money/native-store-sandbox-bridge-v1.test.mjs`

These synthetic authentication/encryption tests run in the existing Required
Validation creator-money test glob. They are not provider/device qualification.
