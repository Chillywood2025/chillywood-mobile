# Isolated sandbox commerce, generation 1

**Inactive implementation work. Not a production migration, deployable release,
or completed replacement for PR #683/#684.** No existing screen, webhook, money
dispatcher or delivery endpoint imports this implementation.

This work avoids replacing the existing commerce functions. A fresh private
schema owns its resources, requests, offers, purchase attempts and provider
receipts. Installation refuses collisions rather than overwriting anything.
The lifecycle starts disabled and permits only disabled → active → retired (or
disabled → retired). Retired generations cannot be reactivated. Historical
status and receipt reconciliation remain separate from new initiation.

## Implemented boundaries

* `core.sql` defines private, FORCE-RLS tables and the irreversible lifecycle.
  Ordinary runtime roles cannot access tables or transition the lifecycle.
  There are no cross-schema foreign keys or writes to legacy authority tables.
* `premium-authority.sql` and `authority.sql` implement source-derived reads of
  the current account, exact Auth session, legal acceptance, finite Premium
  receipt/grant graph and negative creator evidence. Free buyers need no
  Premium. Creator admission retains the existing all-active-sessions consent
  rule. Declarations do not accept terms or create financial authority.
* The authority adapter fences 20 shared tables with `SHARE NOWAIT`. Its static
  functions are created under a fresh role with closed ACLs, then assigned to
  the existing privileged database owner. Only the private core can call the
  authority entry point; it returns a bounded decision, not private records.
  No existing function body, role setting, table grant or policy is replaced.
  Installation explicitly grants the existing `postgres` installer membership
  in the two fresh owner roles, plus rights on the new schema. CREATEROLE alone
  is insufficient on a managed non-superuser installation. No runtime caller is
  made a member of those roles. Finalization removes inherited/SET access and
  schema CREATE, retaining only ADMIN membership for future explicit
  provisioning, schema USAGE, and SELECT/MAINTAIN on the new declaration table.
* `commands.sql` implements exact-account/session request binding, idempotent
  draft authoring, explicit negative declarations, publication/checkout holds,
  immutable offer capture and historical status. It uses the actual Auth
  session UUID as `sessionGeneration`, not a local counter. The client module
  `_lib/isolatedSandboxCommerce.ts` keeps the frozen token and pending operation
  through actual transport settlement; it does not retry uncertain work.
  Accepted declaration changes have private append-only history. Positive
  changes are limited to ten per rolling 24 hours; identical current declarations
  do not consume quota. New negative evidence is exempt from this quota, so
  throttling cannot preserve an outdated positive decision. Existing account,
  session, legal and active-generation requirements still apply. Alternating
  negative declarations can grow history; this is deliberately not a general
  abuse limit. Request replay reports current eligibility without restoring its
  old declaration. History has no runtime deletion path; retention/account-deletion
  integration needs separate qualification before release.
* `receipts.sql` is a narrowly scoped tip-receipt state machine, not a general
  fulfillment engine. Its provider routes start empty. Service ingress requires
  an independently authenticated, exact provider observation; the pure provider
  classifier does not establish that authentication. Tips never create access
  grants, Premium, payable earnings, payouts or cashout.

The only publication path currently implemented is `creator_tip`, and even that
requires an independently qualified catalog/provider binding. Other kinds can
be authored as isolated draft metadata but cannot publish. No catalog or route
is enabled by this bundle. There is no generic setter that treats a client's
URL, readiness flag or hash as provider/resource qualification.

## Integration work that remains

Full scope includes Paid Videos, creator subscriptions, VIP, events and replays,
watch parties, Live Stage entry and speaking-seat eligibility, merch, and event
and room-seat auctions. Each needs its actual immutable terms and resource
graph. A generic paid grant is insufficient:

* Native SDK purchases currently carry a product rather than an app intent ID.
  Receipt ownership must be unambiguous across old and new intent namespaces.
  Missing-product terminal events require original-transaction ownership.
  The existing RevenueCat webhook can quarantine authority before product
  routing. A second webhook with distinct SKUs alone does not prove isolation.
* Media needs new immutable object incarnations, scan/provenance/moderation and
  retention records, plus an authenticated upload pipeline and exact signer.
  Existing player/photo endpoints consume legacy resource graphs.
* Rooms need independent room/session/membership generations, provider room
  names, admission capacity, seat/host approval and token-role enforcement.
  An admission grant must never imply speaking or publishing authority.
* Events need reservation, cancellation/replay terms and a signed spectator
  proxy. Subscriptions and VIP need their distinct periods and inclusion rules.
  Auctions need exact winner/claim/deadline state; merch needs inventory,
  reservation, photo ownership, shipping-data privacy and test-only fulfillment.
* Dedicated app routes and actual provider/native delivery remain absent.
  Current main targets V19; this work does not permit publishing it as V18.

These are unresolved implementation/integration requirements. They are not
represented by successful mock receipts or by automatically enabled flags.

## Permission, concurrency and availability limits

Every new initiation takes a nonwaiting shared lock on the new lifecycle row.
Retirement requires its exclusive counterpart and returns busy while admitted
work runs. Authority uses fresh READ COMMITTED reads after its nonwaiting table
fences; other isolation levels reject. Each effect and final result must remain
within the earliest session, entitlement, legal-change or five-second decision
deadline. Creator deadlines and buyer deadlines are both checked.

The shared-table locks temporarily block **all** writes to the selected tables,
including Auth/session activity. Each of the four public RPC wrappers arms
a PostgreSQL 17 transaction-local timeout once, before taking any lifecycle or
authority lock. It uses the remaining five-second transaction budget and
persists through function return until commit/rollback. A nonzero incoming
transaction timeout rejects before locks: PostgreSQL's displayed value may
disagree with an already-active alarm, so the guard never resets/re-arms it.
The decision deadline remains a separate correctness check. The separately
authorized operator transition API uses the same guard for its lifecycle write
lock; this does not constrain a trusted administrator executing arbitrary SQL.

This requires one direct public RPC invocation per transaction. None of its
function callers may have a `SET transaction_timeout` clause, disable the timer,
prepare the transaction or perform network work while locks are held. A second
RPC in the same transaction rejects. No shared role default is changed. Existing
statement/lock/idle timeout settings are retained; implicit own-key waits have
the transaction-wide cap. Timeout processing is not a hard real-time guarantee.
Actual hosted PostgreSQL/PostgREST/pool behavior, interrupt/cleanup latency and
contention under load still require qualification. A timeout can leave the
client uncertain about commit; reconcile using the same request identity.

The tests use PostgreSQL 17.6 and synthetic projections of source tables. They
do not establish the target's privileged owner, event-trigger behavior, gateway
authentication, current source/ACL identity or full schema compatibility.
Creation under a fresh owner, FORCE RLS before creation, restricted runtime
roles, owner transfer and rollback are tested locally; they do not replace
target qualification through an expressly permitted process.

## Local verification

The native harnesses accept only `--local-bin /absolute/postgres/bin`. They create
their own loopback-only clusters, supply synthetic data and verify shutdown and
removal. They do not accept a database URL. The minimum fixtures are **not** a
fresh-project bootstrap for the repository's held/deferred migration inventory.

Run from the repository root, using absolute paths to a local PostgreSQL 17.6
binary directory and a disposable response file:

```sh
export SANDBOX_TEST_PG_BIN=/absolute/path/to/postgresql-17.6/bin
export ISOLATED_SANDBOX_COMMAND_FIXTURE=/absolute/path/to/synthetic-responses.json
node isolated-runtime/sandbox-commerce-v1/tests/premium-authority.native.mjs --local-bin "$SANDBOX_TEST_PG_BIN"
node isolated-runtime/sandbox-commerce-v1/tests/authority.native.mjs --local-bin "$SANDBOX_TEST_PG_BIN"
node isolated-runtime/sandbox-commerce-v1/tests/managed-install.native.mjs --local-bin "$SANDBOX_TEST_PG_BIN"
node isolated-runtime/sandbox-commerce-v1/tests/availability.native.mjs --local-bin "$SANDBOX_TEST_PG_BIN"
node isolated-runtime/sandbox-commerce-v1/tests/core.native.mjs --local-bin "$SANDBOX_TEST_PG_BIN"
node isolated-runtime/sandbox-commerce-v1/tests/declarations.native.mjs --local-bin "$SANDBOX_TEST_PG_BIN"
node isolated-runtime/sandbox-commerce-v1/tests/receipts.native.mjs --local-bin "$SANDBOX_TEST_PG_BIN"
node --test tests/isolated-sandbox-commerce-client.test.mjs tests/isolated-sandbox-delivery-policy.test.mjs tests/creator-money/isolated-sandbox-provider.test.mjs
```

The core harness writes synthetic responses from the actual SQL for the client
integration test. Without that environment variable, the client bridge case
explicitly skips; the native SQL cases are not run by the existing CI Node-test
glob. Preserve the separate native results when reviewing this work. These
fixtures do not authenticate provider payloads or exercise real app screens.

For local fixtures only, the ordered SQL is core, Premium authority, authority,
commands, receipts, then `permissions-finalize.sql`, all in one transaction.
There is intentionally no production execution command here. Full repository
validation and a complete real integration rehearsal are required before
release qualification.

The existing production metadata denial remains in force. None of these files
authorizes a retry, equivalent read through another route, provisioning,
provider configuration, migration, Edge deployment or a maintenance window.
