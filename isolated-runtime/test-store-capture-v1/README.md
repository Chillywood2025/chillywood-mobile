# Independent Test Store capture

Source-only, disabled by default. This package records authenticated provider
bytes; it does not qualify RevenueCat, enable checkout, grant access, change
Premium, create earnings, or enable payments, payouts or cashout. No deployed
receiver URL exists as a consequence of these files.

The installer creates only a new `rc_qualification_capture_v1` schema, three
restricted roles and one service-only public ingest function. It does not install
the commerce bundle, inspect deployed function bodies, replace existing
functions, or lock live/Auth tables. Existing observer functions are outside its
source and install scope. Its own controls and reservation rows provide the
serialization boundary.

## Project separation is irreversible

`configure_capture` reserves the entire RevenueCat project for capture before
intake starts. That reservation never becomes economic, including after a clean
seal or if capture never starts. This package conservatively reserves the whole
project to isolate intentionally ambiguous qualification histories, including
productless transfer evidence. App-level separation does not satisfy this
design's reservation contract. This is our safety design, not a universal
RevenueCat requirement; actual Test Store payloads and complete provider
inventory remain unqualified.

An operator must explicitly choose a qualification project before configuration.
Do not use an intended economic sandbox project merely because it is empty.
This package neither creates a project nor seeds any real project/app/connection
identifier. Reusing a capture project economically requires a separate reviewed,
evidence-preserving successor; no such promotion exists here.

The private `reserve_economic_project(project, binding)` function uses the same
reservation registry and control-row fence. The capture package grants it to
**no operator, consumer, service or user role**. A future combined installation
must separately grant only that function to its reviewed economic registrar.
It records permanent exclusion ownership, not provider qualification or economic
authority. Capture configuration and economic registration cannot win the same
project, including concurrent requests and missing-row races.

Economic registration, capture configuration and capture transitions each arm
their own transaction timer and require a zero incoming transaction timeout.
Run each as its own separately authorized bounded configuration transaction after
the disabled installation commits. They cannot be nested inside the installer's
already timed transaction. Consumer admission/history helpers instead require
the future caller's already armed budget and never reset it.

## Future combined runtime contract

Nothing in published V2 has been modified to consume this package. The following
composition is required before a future economic runtime can use this registry:

Capture and its future consumers must run in the **same PostgreSQL database and
transaction domain**. A separate RevenueCat qualification project is compatible
with this requirement. A capture schema in another database queried through HTTP
would lose the atomic lock fence and is not supported by this contract.

1. Register its project using a fixed server-owned consumer binding under the
   separately reviewed economic registration capability. No client-supplied
   binding or readiness flag may select or create a reservation.
2. Grant `rcq_v1_consumer` only to the reviewed future runtime owner. It receives
   execution of two private functions, with no table access or capture controls.
3. Arm the existing single-entry five-second transaction budget, then call
   `commerce_admission(project, binding)` before every positive economic path and
   current-access path. Require exactly `protocol=rcq-commerce-admission-v1`, the
   requested identities, `status=not_capture`, null reason and false authority
   flags. Missing/malformed results, missing state, a capture reservation,
   binding mismatch, or lock contention must stop positive work.
4. The exact project-reservation row lock remains held through the caller's transaction.
   Do not release it in a savepoint, reset its timeout or perform network I/O
   while holding it. An unregistered project is unavailable, never implicitly
   outside capture. The result is only an exclusion verdict; all existing
   provider, legal, session, media and economic gates remain necessary.
5. Retain authenticated raw receipts and negative/unknown observations through
   the existing receipt state machine. `history_gate(project, raw, event,
   original, transaction, customer)` preserves replay, event-conflict and lineage
   classifications. It is not positive admission: even `not_qualification`
   requires `commerce_admission`. Do not discard terminal or transfer negatives
   merely because a project or identity is excluded; they can veto an owner.

A committed economic reservation is immutable. A capture connection's generated
UUID binding and constant `capture` purpose must reference that exact reservation
through a composite foreign key; even a faulty future configuration wrapper
cannot attach a capture connection to an economic reservation. Admission locks
only the requested reservation. History for a proven economic reservation can
return `not_qualification` without touching capture controls. Thus another
project's capture start/seal does not obstruct already-dispatched economic work.
Missing or uncommitted reservations return `project_unreserved`; row contention
raises an unavailable result. These are uncertainty, not evidence of permanent
capture exclusion. Existing capture claims remain permanently excluded regardless
of capture-control phase or availability. Capture history still uses its own
bounded control lock and never grants positive admission.

For the upcoming V3 runtime this includes `test_store_v3_scope_exclusive`,
preparation authority and offer/prepare, command bind/allocate, dispatch claim,
provisioning mutation permits, receipt positive settlement and current access.
Equivalent V1/V2 paths must be covered or remain disabled. The existing
qualification gate and its locks must remain until an exact reviewed successor
composes both histories. A new deployment of this package alone does not make
those changes or attest that other consumers of a provider project are absent.

## Exact source and installation scope

`source-manifest.json` binds the package and reused crypto/handler source. The
donor is published V2 commit `0d1d3b3a959295dfc44a6485ab8f7067d933bb43`,
whose exact source tree is `5e9b8f86792c2fab606ed216037aec916f094b7c`.
The two TypeScript shared modules remain unchanged. The SQL retains the donor's
normalization, encrypted evidence, budgets, immutable histories and seal logic;
schema/roles, own timeout/service helpers, advisory lock namespace and the
capture-owned reservation/admission contract are independent.

`node isolated-runtime/test-store-capture-v1/install.mjs --plan` validates those
hashes and prints an exact install digest. `--emit-sql --expected-digest DIGEST`
emits that reviewed transaction only. The tool has no network, credential,
database execution or deployment mode. There is no force, skip, replace,
`IF NOT EXISTS`, migration-ledger edit or collision-recovery option.

The SQL transaction uses a 250 ms lock timeout and five-second statement and
transaction limits. Existing object-name collisions abort the transaction. A
late error rolls back the fresh roles/schema/RPC. The owner is NOLOGIN,
NOINHERIT, NOSUPERUSER, NOCREATEROLE, NOCREATEDB and NOBYPASSRLS. All seven tables
have FORCE RLS and owner-only policies. PUBLIC and ordinary roles cannot access
private tables or helpers. Only `service_role` can call the public ingest RPC.
Temporary public-schema CREATE and installer SET/inherited owner authority are
removed before commit; retained administration of fresh roles does not enable
capture. Later operator access needs a separate explicit bounded role grant.

The local canonical migration is
`supabase/migrations/20261107233954_isolated_test_store_capture_v1.sql`.
`reviewedCaptureMigration()` verifies its exact bytes against the emitted
transaction, independently of its manifest hash. The disposable PostgreSQL
harness executes those verified migration bytes and records the migration path,
digest and complete source identity. A changed migration fails parity even if
someone refreshes its manifest digest. This is local source parity, not deployed
migration-history verification or permission to apply the file.

Actual installation needs action-specific authorization for these exact new
objects and source digest, managed PostgreSQL 17 capability, database/schema
creation and fresh-role administration. It must use an expressly permitted
target-verification process. Local modeled permissions do not prove current
managed-role, event-trigger, gateway, pool or transaction behavior. This package
does not authorize broad production metadata access, a maintenance window,
another migration chain, or a fresh Supabase project.

## Edge configuration and provider prerequisites

Deploy only the new `isolated-test-store-capture-v1` function with the reviewed
per-function fragment in `function-config.toml`. The provider request has no
Supabase user JWT; the unchanged handler checks its exact dedicated Authorization
value before reading the body. Disabling gateway JWT checks does not bypass that
provider authentication.

The following separate environment names are required; none have default values:

| Name | Meaning |
| --- | --- |
| `RCQ_CAPTURE_V1_ENABLED` | Exact `true` enables the Edge boundary; absent stays off |
| `RCQ_CAPTURE_V1_CONNECTION_ID` / `CONNECTION_REVISION` | Immutable UUID and positive integer revision |
| `RCQ_CAPTURE_V1_PROJECT_ID` / `APP_ID` | Explicit qualification project and Test Store app |
| `RCQ_CAPTURE_V1_AUTH_KEY_VERSION` / `AUTHORIZATION_VALUE` | Version and exact dedicated provider secret |
| `RCQ_CAPTURE_V1_STORAGE_KEY_ID` / `STORAGE_KEY_BASE64` | Retained version and canonical base64 of a 32-byte key |

Every shortened name in the table retains the `RCQ_CAPTURE_V1_` prefix. The
database connection row stores identifiers, not the two secret values. Keep
secret values and raw evidence out of Git, logs, app configuration and reports.
Retain encryption key versions for future private readback. The Edge adapter
uses built-in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` solely for its fixed
RPC; it rejects non-HTTPS URLs, redirects, missing credentials, oversized results
and unexpected acknowledgement shapes. This backend credential remains broad
platform authority, not a custom least-privilege database credential.

The receiver needs no RevenueCat management API key, public SDK key, Stripe key
or user session. A public Test Store SDK key belongs only in the separately
validated DEBUG qualification app descriptor; putting one here cannot enable
purchases. Provider webhook configuration, secure key placement, function
deployment, target readback and actual provider delivery remain separate actions.

Configuration requires explicit budgets (at most 256 entries, 1024 deliveries
and 64 MiB stored envelope/observation bytes), then the one-way
`disabled -> capturing -> sealed` transition. SQL configuration and Edge enable
are independent; either missing makes intake unavailable. A 200 response means
only exact committed record-only storage. A failed or timed-out response can
represent an uncertain commit; retry the same provider bytes, never manufacture
a replacement identity. Sealed exact retries reference existing retained evidence
without appending or reopening capture.

## Recovery and verification

Before installation commits, rollback removes only newly created objects. After
configuration or evidence exists, recovery is forward-only: disable new intake,
seal under the bounded operator transition, preserve the schema/reservation,
ciphertext, exclusion keys, conflicts, source manifest and encryption-key versions.
There is no delete, truncate, reset, promotion or destructive uninstall API.
Use an expressly authorized bounded readback of these owned capture objects for
private decryption and seal verification; the Edge exposes no evidence-read RPC.

Run `node --test isolated-runtime/test-store-capture-v1/tests/edge.test.mjs` and
`node isolated-runtime/test-store-capture-v1/tests/capture.native.mjs --local-bin
/absolute/path/to/postgresql-17.6/bin`. The native harness creates only a private
Unix-socket disposable cluster, models a non-superuser installer, installs no
Auth/commerce fixtures, exercises real SQL with synthetic authenticated bytes,
and checks shutdown/removal. It records source hashes and all executed cases.
These checks do not establish an installed provider/device integration. Actual
target permissions, gateway authorization, durable provider delivery, private
decrypt/readback and retry/seal behavior must pass before activation claims.
