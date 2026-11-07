# Isolated sandbox commerce, generation 1

**Inactive implementation work. Not a production migration, deployable release,
or completed replacement for PR #683/#684.** The Library links to dedicated
sandbox tip authoring/history routes. Checkout is visibly unavailable. No
existing webhook, money dispatcher or delivery endpoint activates this bundle.

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
* `history.sql` supplies the dedicated tip RPC: current capabilities, bounded
  studio and offer pages, retained buyer/creator history, exact request recovery,
  offer retirement and abandonment of an undispatched attempt. History survives
  loss of creator Premium and generation retirement. Unknown outcomes remain
  unknown; the durable app journal cannot turn missing evidence into a retry.
  Resource previews contain at most ten offers; owner continuation pages contain
  at most fifty. Historical economics come from immutable intent fields, not
  current titles or prices. See `HISTORY.md` for the cursor and recovery contract.
* `resource-graphs.sql` and `delivery-authority.sql` define the eleven non-tip
  resource graphs, private grant settlement and resource-specific delivery
  candidates. They cover immutable media incarnations/scans, finite memberships,
  event/replay windows, auction claims, separate room admission/seat authority,
  capacity and test-only merch reservation. These private functions are not
  granted to runtime roles. They do not ingest non-tip provider receipts, upload
  assets, sign media, issue room tokens or dispatch shipments. A candidate
  explicitly reports that it is not an authorization proof or issued access.
* The separate `../receipt-router-v1` bundle stores authenticated encrypted
  evidence with immutable original ownership and honest multi-subject transfer
  children. Its default-disabled Edge handler acknowledges only exact TEST
  events. Real events remain pending/HTTP503 until all effective consumers and
  reconciliation paths enforce the scoped negative evidence. Merely storing a
  hold is not access control. Nothing redirects the current provider webhook.

The only publication path currently implemented is `creator_tip`, and even that
requires an independently qualified catalog/provider binding. Other kinds can
be authored as isolated draft metadata but cannot publish. No catalog or route
is enabled by this bundle. There is no generic setter that treats a client's
URL, readiness flag or hash as provider/resource qualification.

## Integration work that remains

Full scope includes Paid Videos, creator subscriptions, VIP, events and replays,
watch parties, Live Stage entry and speaking-seat eligibility, merch, and event
and room-seat auctions. The new private graphs describe those distinct terms;
their authoring, provider admission and actual delivery are still incomplete:

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
* Dedicated pre-purchase app routes, Library discovery, durable authoring
  recovery and retained tip history exist. Actual provider/native checkout,
  non-tip product screens and installed-device delivery remain incomplete.
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
including Auth/session activity. Each public RPC wrapper arms
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

The canonical source CI has a required `Validation / Isolated Sandbox Native
PostgreSQL 17.6` job whenever database validation applies. It builds the official
17.6 archive after checking its pinned SHA-256, runs the native harnesses
sequentially, generates fresh actual-SQL command/history responses, and requires
the exact per-suite Node counts with zero skips, cancellations or TODOs. The
runner's `--plan` reports the current complete stage list and expected counts.
Native results must report verified cleanup and matching source hashes.
An applicable missing or non-successful job blocks Results and the protected
publisher. Ordinary product/sensitive Node globs do not replace this native job;
standalone client tests without actual-SQL fixture variables explicitly skip
their bridge cases. The sensitive job also typechecks the actual router Edge
entry and its imports with Deno, without starting it.

Run from the repository root with an existing PostgreSQL 17.6 binary directory.
The evidence directory must be new and inside the checkout; the runner creates
both actual-SQL response fixtures there and verifies their hashes through the
client suites:

```sh
export SANDBOX_TEST_PG_BIN=/absolute/path/to/postgresql-17.6/bin
node scripts/ci/isolated-sandbox-native.mjs --plan
node scripts/ci/isolated-sandbox-native.mjs --local-bin "$SANDBOX_TEST_PG_BIN" --output-dir "$PWD/isolated-sandbox-native-evidence"
```

CI retains per-suite JSON/stdout/stderr, actual response fixtures and a source
manifest for 14 days, including partial evidence on failure. Build failures
remain in the job log; they cannot produce a passing qualification summary.
These tests use no production/provider credentials and authenticate no real
provider payloads. Mounted component tests exercise the actual app source with
synthetic transport and actual local-SQL response fixtures, not installed devices.
Hosted managed-schema compatibility, actual Auth/gateway/pool behavior and
provider delivery still require their separate qualification.

For local fixtures only, the ordered SQL is core, Premium authority, authority,
commands, receipts, history, resource graphs, delivery authority, then
`permissions-finalize.sql`, all in one transaction. The receipt router has its
own ordered installation contract; its source bridge is not a legacy cutover.
There is intentionally no production execution command here. Full repository
validation and a complete real integration rehearsal are required before
release qualification.

The existing production metadata denial remains in force. None of these files
authorizes a retry, equivalent read through another route, provisioning,
provider configuration, migration, Edge deployment or a maintenance window.
