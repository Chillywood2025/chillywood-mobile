# Fresh paid-video capture composition

This is a new, inactive source profile. It neither upgrades an existing runtime
nor provisions, reserves or activates a RevenueCat project. The prior combined
economic profile and its proofs remain unchanged. This profile additionally
includes the separately frozen prepared-checkout closure and current-grant
resolver and repaired operations-v2 SQL. Their previous individual proofs do not
qualify this new composition. The exact operating worker source and final combined
tests still require review before an installation can be proposed.

The independent capture SQL runs first in the **same PostgreSQL transaction
domain** as commerce. A separate RevenueCat capture project is compatible; a
remote HTTP admission check against another database is not equivalent. The
capture package permanently reserves an entire project, including after sealing.
An existing intended commerce project must not be reserved for capture. Neither
this profile nor its tests reserve any real project.

`admission.sql` grants only the existing capture consumer role to the new
`sbx_v1_core_owner`, with inheritance and without SET. That role grants USAGE and
EXECUTE of the two capture functions, not table access, schema CREATE, operator
access or economic registration. Capture's economic reservation function remains
ungranted. A separately reviewed administrative action must register the exact
server-owned V3 project under the fixed binding
`sandbox-commerce-v1:protocol-3:capture-composed-v1` before new work is available.
Registration is exclusion ownership; it does not qualify a provider or permit a
payment.

The admission helper requires exact JSON equality, including protocol, project,
binding, `status=not_capture`, null reason and both false authority flags. Missing,
malformed, inaccessible or contended capture state cannot produce a positive
result. A successful call retains the exact immutable project reservation SHARE lock through the
existing bounded transaction. No network I/O occurs while that lock is held.

The generated source has these explicit boundaries:

| Boundary | Admission behavior |
| --- | --- |
| Authoring capabilities, new reserve, PUT lease, finalize and publish | Current native profile resolves the server connection; gateway readiness requires capture admission. |
| Buyer offer/prepare, new customer binding, allocation and SDK claim | Exact current server connection must pass before new authority is issued. |
| Provisioning | Only new POST mutation permits require the new admission; GET reconciliation retains existing authority checks. |
| Authenticated receipt ingestion | Raw encrypted evidence and delivery are inserted before either capture-history decision. Missing gates do not erase negative evidence. A valid purchase with uncertain admission stays deferred. |
| Positive receipt projection and grant settlement | Both the raw projector and exact receipt-to-grant boundary independently require admission. |
| Refund/revocation and unknown evidence | Existing exact negative validation and holds remain; they do not require positive capture admission. |
| Range delivery and exact current-grant resolver | The current access path requires admission before and after origin I/O; the resolver calls that same path. |
| Recovery, history, consumed SDK replay and closure | These retain their existing read/retirement semantics and cannot mint new authority. |

The new history adapter consumes all independently retained customer identifiers,
including aliases and transfer subjects. Its `not_qualification` result is only
an exclusion classification and never replaces admission. Capture history from a
distinct project does not block a correctly reserved economic project.

`profile-guard.sql` proves there are no prior intents, receipts, V1/V2/V3 provider
connections or active generation before closing older positive entrypoints. It
keeps V1/V2 controls disabled and revokes old public normalized receipt, dispatch,
economic command and provisioning execution. The fresh legacy command wrapper
permits only authenticated `creator.declare` and `capability.read`, so creator
declarations retain their exact existing actor/session checks. This cannot retire an existing
generation with admitted work. Private core implementations remain available to
the reviewed V3 source; ordinary callers cannot call those helpers directly.

## Deferred local projection recovery

Transient admission uncertainty is distinct from permanent capture/binding
exclusion. An otherwise validated purchase retains its raw evidence and an
immutable `test_store_v3_capture_deferred` marker without creating an irreversible
hold or final effect. Identical authenticated redelivery or explicit local
reconciliation can recheck that exact evidence. A final effect is written once;
the marker is retained permanently. An intervening refund, revocation, transfer,
conflict or other hold still vetoes the positive projection.

Service-only PostgREST recovery is reachable through these two typed RPCs:

- `isolated_test_store_capture_pending_v3(p_expected_target jsonb, p_after uuid = null, p_limit integer = 16)`, maximum 32 retained ingress IDs.
- `isolated_test_store_capture_reconcile_v3(p_expected_target jsonb, p_ingress_id uuid)`, exactly one retained deferred ingress.

The exact target object contains `protocol=scv3-capture-recovery-target-v1`,
`installationId`, `sourceSha256`, `consumerBinding`, `projectId`, `connectionId`,
`connectionRevision` and `providerConfigurationDigest`. SQL compares the complete
object against immutable installation and connection rows **before** reading a
queue or applying a projection. Reconciliation loads only the original stored
envelope/observation, not replacement fields supplied by the operator. The server
result echoes the exact target and carries false authority flags.

`identity.sql` creates a random immutable installation UUID and the SHA256 of all
other ordered SQL inputs. Its own generated module is explicitly excluded from
that digest's preimage to avoid a circular hash; the full manifest separately
hashes it. `assemble.mjs --check` validates that derivation and every selected
published baseline source against its exact Git blob. The preparers read the
immutable tree `5e9b8f86792c2fab606ed216037aec916f094b7c`, available from published
commit `0d1d3b3a959295dfc44a6485ab8f7067d933bb43`; the historical local commit
record is provenance and need not exist in a clean checkout. No working-tree
baseline fallback is permitted.

The bounded `recovery.mjs` operator tool requires an explicitly captured local
witness file `{supabaseProjectRef, installationMode, expectedTarget}`, with mode
exactly `bootstrap` or `retained`. It never discovers or adopts
a target from the contacted endpoint. The witness source must match the local
reviewed source manifest. The service credential is supplied only through
`SCPV_CAPTURE_RECOVERY_SERVICE_ROLE_KEY`; it is never a CLI argument or output.
`pending --target /absolute/witness.json` performs one bounded read. `reconcile
<retained-ingress-uuid> --target /absolute/witness.json` performs one local
projection request. A lost response remains unknown; the tool never automatically
retries and never calls a provider API. Only an approved target readback should
supply that witness, and no such target operation is performed by these files.

`once --target /absolute/witness.json --state /private/directory/progress.json`
automatically processes one bounded page of at most eight IDs within a 30-second
pass. It persists each exact ingress identity before reconciliation and advances
the cursor even if admission remains unavailable, so later work is not starved.
End of queue resets the next sweep. A lost acknowledgement stops that pass,
retains the unknown ID and advances the next sweep cursor; a later sweep may
recheck only the same immutable local evidence. It never repeats provider work.
An interrupted process leaves its journaled identity; the next pass records its
uncertain result before advancing. Exclusive local lock files prevent overlapping
workers; a crashed lock requires confirmation that its process stopped before
operator retirement. The directory must be private, the target binding must match,
and state is replaced with fsync-backed writes. No scheduler or host is provisioned
here: a reviewed host, secret placement, permitted cadence, logging and failure
handling remain explicit operational prerequisites.

## An already installed capture dependency

The bootstrap profile installs capture and commerce in one fresh transaction.
`retained-source-manifest.json` is a separate, explicit execution plan for a
previously installed capture package. It substitutes `capture-dependency.sql`
for capture CREATE and uses a separately generated `retained-identity.sql` source
witness. There is no catch-collision fallback and no phase reset. The verifier
compares only newly owned capture schema/role/function/ACL/RLS/constraint/trigger
metadata against an exact contract derived from local PostgreSQL; it reads no
legacy function or capture evidence value. Active and populated/sealed capture
are compatible. A mismatch aborts only the new commerce install transaction.

The retained source digest covers its distinct executed SQL list (excluding its
own identity module) plus the exact required capture source dependency. The
operator must select retained mode and match that distinct source witness before
target adoption. `assemble-retained.mjs --check` verifies the generated dependency
verifier, identity and ordered execution manifest. Existing capture data and
configuration are never an install input to rewrite or seed again.

`generate.mjs --check` verifies exact derivation from the pinned frozen source;
`--write` writes only the new candidate files. No input file is rewritten and no
`CREATE OR REPLACE` is emitted. `source-manifest.json` records the full ordered
source profile, with selected published Git baseline identities. All modules
must be installed in one fresh bounded transaction with the final privilege
revocations and disabled-state checks intact.

Local tests use disposable PostgreSQL and explicit synthetic provider, scanner
and native facts. They do not establish target permissions, provider delivery,
device integration or deployment authority. A final combined Auth/PostgREST and
four-Edge-entry test must use the exact operations and capture-composed source
after those additional dependencies freeze.

## Recovery host contract (not installed)

Use an existing, operator-managed Node.js execution surface only after its owner
confirms secret storage, durable private disk and scheduled jobs. This repository
does not establish that such a host is currently available. Do not run this from
the mobile app or a provider webhook request. Deploy the reviewed source bundle
read-only and invoke `node recovery.mjs once --target /private/witness.json --state
/private/recovery/progress.json` once per minute. The host supplies the service
credential through `SCPV_CAPTURE_RECOVERY_SERVICE_ROLE_KEY` from its secret store,
not a command argument. Keep the approved, independently captured witness and
state directory mode 0700/files 0600; do not derive them from a queue response.

Each pass holds one exclusive local lock, processes at most eight IDs and ends
within 30 seconds. The scheduler must use the same durable state directory and
never overlap runners. After a crash, confirm the recorded process is absent on
that exact host and no scheduler invocation remains before an operator retires
the stale lock; preserve the lock/state as incident evidence. Never delete state
to retry an uncertain provider payment. Observe exit status, last completed pass,
last successful sweep, deferred age, unknown acknowledgements and cursor progress.
Alert after two missed scheduled passes or any unknown/lock/persistence failure;
log only bounded counts/status and opaque IDs, never credentials or raw receipts.

With an available gate and healthy host, a queue of N retained items normally
receives a complete sweep in at most `ceil(N/8) + 1` scheduled minutes, plus one
30-second pass budget. This is a capacity estimate, not a guaranteed settlement
deadline: timeouts, unavailable admission, lock conflicts and outages can extend
it indefinitely. Increase capacity only through a separately reviewed bounded
schedule; never ignore admission or dispatch a new provider purchase. No scheduler,
secret, target witness or host configuration has been installed by this work.
