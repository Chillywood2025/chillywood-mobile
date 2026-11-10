# Android Play test-sheet handoff extension

**Source only. Not installed. Not enabled. No real enrollment or provider setup.**

`handoff.sql` is a new, forward-only extension after the existing immutable
48-module native-store closure. It is deliberately absent from that closure's
installer and deployment tooling. This source is not authorization to install,
enable, enroll accounts, configure a provider, or make a purchase.

## Scope and trust

Any ordinary active app account can be explicitly enrolled. No administrator or
allowlisted-user role is required. The original account/session/legal, media,
catalog, connection, reservation, one-shot consume and project-pending controls
remain in force. Service-role entry points remain a trusted authenticated
backend boundary, not a client-provided identity or device attestation.

Google's billing sheet is the user's final confirmation surface. The server
cannot inspect the phone's current Google account or payment instrument before
`launchBillingFlow`. A qualification always says `automaticNoChargeProof: false`
and `userStoreConfirmationRequired: true`. Neither a setup evidence digest nor
an old `play_license_account` row proves a no-charge purchase automatically.
The client must match the qualified native build/version/SDK to its runtime,
show the warning, and require the user to inspect and confirm the actual Google
test sheet. Cancel if the expected test purchase information is absent.

## Private records

- A separate `native_store_play_handoff_control` starts disabled.
- Immutable setup revisions bind exact catalog binding/revision, quote digest,
  connection/revision, reviewed protocol digest, Android build/version and
  RevenueCat SDK 10.15.1.
- Immutable enrollment revisions bind a buyer to a setup revision, a review
  evidence digest and a finite expiry. They contain no Google email, credential,
  payment instrument or plaintext provider payload.
- Append-only setup/enrollment revocations withdraw authority. Multiple
  unrevoked matching enrollment revisions, even expired ones, are ambiguous and
  rejected. Revoke the superseded revision explicitly.
- Each consumed attempt retains its enrollment ID/revision. The original
  attempt retains its buyer and session generation.

All new tables use forced RLS and owner-only policies. App roles and service
role cannot read or write raw rows or invoke private helpers. The public wrapper
routes by a server-stored buyer-owned selection, never a caller's platform flag.
The installed Apple implementation is retained without changing its body.

## Commit and recovery

Only the first committed consume can return `dispatchAllowed: true`. Discovery
and recovery make no writes. Repeated consume, recovered/lost replies, refreshes
and cancelled/uncertain purchase results never rearm the attempt. Recovery
returns the original enrollment and original attempt session, while its actor
shows the currently authenticated session. Historical recovery remains possible
after control disablement or enrollment revocation; it never grants permission.

Fresh consume locks controls and revocations through commit, retains the
existing project/account/reservation fences, and revalidates the complete quote.
Enrollment, buyer/session, seller and resource-owner authority must outlive the
original absolute five-second transaction deadline. Near-expiry authority is
held or rejected. The timer is never reset; a deferred commit check adds another
guard even when an operator changes a control in the same transaction.

`handoff.sql` does not add receipt, grant or refund authority. The separate
settlement extension, if present, must validate original provider receipts and
preserve the existing identity, allocation and refund controls. A successful
handoff is not proof of purchase, sandbox provider observation or entitlement.

## Local verification

Run a disposable local PostgreSQL 17.6 fixture:

```sh
node isolated-runtime/native-store-play-handoff-v1/handoff.native.mjs \
  --local-bin /absolute/path/to/postgresql-17.6/bin
```

This installs the exact existing 48-module profile into a fresh local cluster
under a managed nonsuperuser installer, then installs the new source in a
separate transaction. Synthetic ordinary accounts, media, provider metadata and
enrollments exercise default-off admission, account/session boundaries,
expiration, revocations, ambiguity, catalog/connection checks, read-only
discovery/recovery, concurrency, transaction rollback and Apple compatibility.
Malformed build/platform/SDK values are rejected; actual runtime build matching
belongs to the client integration tests, not PostgreSQL device attestation.

The optional `--settlement-proof` installs `settlement.sql` and runs
`settlement.native-cases.mjs` in the same disposable fixture. No test contacts a
hosted database, invokes a purchase SDK or changes any provider configuration.
