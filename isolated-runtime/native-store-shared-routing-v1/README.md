# Shared RevenueCat native sandbox routing

Source-only, default-off integration at the existing `revenuecat-webhook`.
This does not replace or repoint that provider webhook. It does not enable
purchasing, qualify an SDK/build/account, install an app, or enable live money.

## Consumer and acknowledgement contract

- Explicit active connection revisions route both `APP_STORE` and `PLAY_STORE`.
  Retained connection revisions and encryption keys remain available for replay.
  All active routes must share one authenticated project and credential.
- Existing bare, Bearer and explicit-secret-header authentication is preserved.
  Native intake normalizes only the authenticated header representation. The
  original body bytes and the legacy request's headers are unchanged.
- Reliably identified production traffic stays on the existing legacy path,
  including transfers, unconfigured apps and malformed identity quarantine.
- The server-owned manifest distinguishes native and known legacy products for
  each app/store. A product cannot appear in both lists. Known legacy traffic
  never enters the native journal's project-wide pending fence.
- Unknown, mixed, malformed or transfer deliveries retain original encrypted
  evidence and native holds. Legacy cleanup still runs; no native effects or
  shared success acknowledgement are inferred from a legacy HTTP 200.
- For a native candidate, the existing legacy dispatcher runs first. A strict
  atomic result with no product/intent/grant/ledger is only a *candidate* for
  exclusion, not sufficient proof. `exclusion.sql` independently checks current
  durable original bindings, catalog history, intents and sticky reservations.
  It rejects masked Premium/original or ambiguous-catalog collisions.
- Only matching immutable intake, exact-hash legacy exclusion and a validated
  completed native worker effect yield HTTP 200. Lost/late responses, conflicts,
  failed/unknown work and forged result shapes stay retryable. There is no
  automatic repeat write in one request.
- Shared ACK means the delivery is durably handled. It **does not resolve** the
  legacy `revenuecat_provider_reconciliation_obligations` row created for an
  ignored active event. The row stays `pending_reconciliation`, and the response
  explicitly reports `reconciliationComplete: false`. Any later resolution is
  separate work requiring authoritative evidence. No obligation is hidden,
  deleted or falsely marked refunded/no-charge by this integration.

## Additional source deployment prerequisite

`exclusion.sql` creates one service-only, read-only SECURITY DEFINER RPC with an
empty search path and NOWAIT locks over the relevant inventories. It writes no
tables and changes no existing SQL functions or roles. It is a separate forward
extension, **not** an edit/re-run of the installed native 48-module bundle.

Before activation, prepare and review an exact forward deployment packet, read
the target migration/catalog state, apply only with action-specific deployment
authority, and verify function body/owner/ACL readback. The handler remains held
if the proof RPC is absent or unavailable. Source tests are not deployment proof.

## Configuration prerequisites, not activation instructions

`NATIVE_STORE_SHARED_ROUTING_ENABLED` defaults off. An enabled configuration also
requires the existing native intake and reconciliation switches and the exact
server-owned connection inventory. None are modified by this change.

`NATIVE_STORE_SHARED_ROUTES_JSON` has a `routes` array. Each entry contains only:
`connectionId`, `connectionRevision`, `nativeProducts`, and `legacyProducts`.
All product IDs are exact wire identities. No prefix matching, offering-name
ownership, request-supplied project selection or newest-revision fallback exists.

Verify the complete historical catalog and intended consumer ownership before
configuring that manifest. Native SKUs must not overlap legacy catalog/intents
or any original-transaction authority. Keep retired native products classified
as native; moving them into legacy would omit their retained lifecycle consumer.
Unknown products remain held. This source does not manufacture that inventory
or provider proof. Catalog changes require the same coordinated verification.

Native dispatch and settlement qualification remain independent requirements.
In particular, generic Google sandbox history/internal-track membership is not
pre-purchase no-charge proof. Platform-specific normal-build, callback, receipt,
refund and recovery checks still apply.

## Local verification

`node --test --test-concurrency=1 tests/creator-money/revenuecat-shared-routing.test.mjs`
executes the actual shared entrypoint, config/authentication, encrypted intake,
legacy dispatcher and native worker. External native SQL boundaries are modeled.
It also replays the actual legacy migrations in disposable PostgreSQL/PGlite and
tests the exact new SQL proof, durable obligations/replay, privileges, refunds,
masked Premium collisions and ambiguous catalog rejection. This does not prove
live provider delivery, installed-device behavior or a remotely applied extension.

Existing standalone native ingress still always refuses a shared ACK. Its
contract and deployment controls are unchanged.
