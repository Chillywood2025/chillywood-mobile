# Automatic commerce access cutover

This is a separate, source-only preparation tool for the twelve PR 683
migrations plus the forward-only `20261106170725_tip_commerce_gate_entry`
correction on `bmkkhihfbmsnnmcqkoly`. It does not alter either the historical
25-migration creator rollout or the sandbox cashout deployment manifest. It
does not connect to a service, retrieve credentials, deploy Edge functions,
change providers, activate money, seed eligibility, assert a legal declaration,
or grant a qualification.

The application source is frozen at
`abed523a21535d7854b3dbad51f1aa8b70bdb17d`, tree
`808ba06732ae32caac4276465df269ae7a75015a`, plus the separately hash-bound
forward correction of the two omitted tip gate entry points. The *tooling* must additionally be
committed, independently reviewed, and pass exact-head Required Validation.
Every requested SQL payload is bound to that committed tooling head. Local
capture files supply definition bytes, but are not trusted: every function and
migration must match the committed hashes before preparation.

## Qualification status

`contract.json` deliberately fails closed until every qualification record is
complete. Native concurrency-semantics proof is distinct from the full native
Supabase-schema rehearsal, the catalog/metadata match, the complete caller and
policy closure review, and exact-head CI. None substitutes for the others.
The committed qualification artifacts describe local native proof and a
read-only target baseline. They do not certify hosted CI, UI payload acceptance,
provider transport, or execution of a production deployment.

## Why two phases

`CREATE OR REPLACE FUNCTION` does not terminate an already executing function
frame. Table locks alone can leave that old frame waiting and let it resume
after the new functions and triggers commit. A census immediately before
commit also leaves a window for another old entry. A shared advisory gate has
the same race when an old bridge frame is paused before its first instruction.

The temporary bridge therefore **always raises**, without entering its old
domain logic, even if the frame resumes after the final commit:

- PL/pgSQL gets an outer block that raises SQLSTATE `55P03` before the original
  `DECLARE` block, initializers, or exception handlers.
- SQL gets a first statement `SELECT 1 / 0`. The multi-statement body cannot be
  inlined and always raises `22012` before the original statements. SQL language,
  volatility, strictness, parallel setting, result type, defaults and security
  mode remain unchanged. This includes SQL/STABLE and immutable functions.
- Existing OIDs, owner, ACL, search path and all other function attributes are
  checked and retained. There is no new callable compatibility endpoint.
- A private, ungranted trigger helper raises before statement-level authority
  writes on the fifteen existing authority relations, including Auth users and
  sessions and profiles. The new declaration/observation relations do not yet
  exist. Final source creates its own fifteen-relation protocol atomically.

The conservative bridge scope is the 407 exact existing function signatures
identified by the changed targets plus recursive deployed function callers.
Textual/dynamic dependencies and RLS/view callers require independent closure
review. The tool must not claim completeness merely because all 407 hashes
match. Arbitrary privileged SQL, disabled triggers, or concurrent administrative
DDL are outside the application protocol and are not authorized by this tool.

## Observable impact and bounds

The bridge causes retryable failures for affected commerce, creator setup,
purchase/refund/recovery, related read/projection and authorization callers.
Its policy callers also include room real-time send/receive, video storage and
social/feed reads. This is a broad, brief application retry window, not merely
a checkout pause.
Auth user/session writes and profile writes also fail during this short window,
so login, refresh, logout, signup and profile actions can need retry. Existing
tokens or sessions are not revoked. Unrelated traffic is not deliberately
paused. HTTP handlers may expose these as errors rather than a uniform 503.
No provider delivery is acknowledged by the bridge and no provider is paused.
Existing durable receipt identities must be reused on eventual redelivery.

Each write request has a 3-second lock timeout, a 50-second server statement
timeout and a 15-second idle-transaction timeout. All mutations and their checks
are inside one outer DO statement. The 50-second budget is stricter than the
SQL Editor's documented one-minute timeout, but it is **not a whole HTTP-request
or downtime guarantee**. Other statements, transport, UI verification and the
time between requests are not covered by it. A UI timeout always requires
independent readback, even with this stricter server budget. Native fixture
phase timings provide local headroom, not a live performance guarantee.

Prepare and verify bridge, finalization, readback and restoration payloads before
installing the bridge. A present operator and immediately available recovery
buffer are mandatory. If the UI supports separately prepared buffers, verify
each in advance rather than copying and researching during the pause. Set a
two-minute wall-clock decision deadline beginning when bridge execution starts.
If finalization is not confirmed by then, stop new finalization attempts, classify
the current state by readback, and promptly restore only if it is exactly bridged.
Never restore an uncertain or already applied state. This is an operator decision
deadline, not a guaranteed maximum outage; UI failures can still prolong recovery.
A manual pause can otherwise leave the bridge active;
there is intentionally no unreviewed automatic timer or background restoration.

## Ordered operation

1. Verify current target identity, baseline history, all function metadata,
   controls, caller closure and expected affected catalog. Prepare and hash all
   bridge, finalization, recovery and readback payloads in advance.
2. Through a reviewed project-bound executor described below,
   install the bridge atomically with bounded authority/history/control locks.
   Read back its exact catalog. It does not create a fake migration version.
3. Finalization rechecks the complete bridge and baseline before any DDL. It
   requires `pg_read_all_stats` visibility (or superuser), prepared transactions
   disabled/absent, and no other current-database virtual transaction. This
   includes idle/read-only transactions and background workers, not just
   clients or transactions with permanent XIDs. Hidden activity is failure,
   never evidence of a drain. Nobody is canceled or disconnected.
4. After that positive drain, acquire bounded relation locks and recheck. Any
   newly arriving affected function call can only enter a permanently failing
   bridge frame. A direct DML statement queued before acquiring its authority
   relation lock can instead begin under the final statement triggers after
   commit; it must obey the final entry protocol. Restore the originals and remove the temporary triggers/helper,
   then execute all thirteen bodies and insert all thirteen original history rows
   in **one transaction**. Only the exact outer `begin;` / `commit;` wrappers
   are removed from execution. History retains each complete original file,
   original version and original name, byte for byte.
5. Verify the expected final affected catalog, the unchanged remainder, exact
   history, unchanged controls, and disabled/empty observation seed before
   commit. Read back again through a new read-only request before continuing
   Edge deployment or announcing completion.

`apply_migration` is unsuitable here because it owns a transaction and adds its
own generated history identity. Do not wrap the thirteen originals in an
untracked migration, replay aliases/old rollups, use blanket `db push`, or
silently substitute a different transport. Two explicit execution surfaces may
carry these same reviewed transaction bytes: the existing canonical exact-deploy
Management Query executor, or the official authenticated Supabase SQL Editor UI.
The SQL Editor route requires the exact project, Primary database and `postgres`
role to be visibly verified, the entire editor buffer's UTF-8 byte length and
SHA256 to match the prepared payload, and no partial selection when Run is used.
Before copying the editor buffer for verification, replace the clipboard with
a distinct non-payload marker. Copy the entire editor buffer using the normal
UI, then verify the copied text is not that marker and exactly matches the
prepared bytes. This prevents a failed copy from falsely passing by retaining
the original paste payload. Clear the selection before running the whole query.
Verify whole-buffer acceptance before starting the bridge; an editor limit,
unverifiable buffer, truncation, splitting, UI timeout, or uncertain execution is a hold, never a reason
to split a transaction or resend it. Do not call undocumented browser APIs or
retrieve credentials. Transport acceptance and independent post-execution
readback are separate from local SQL qualification. Missing transport
authority/access is a blocker, not permission to create credentials.

The connected, project-bound Supabase `execute_sql` read surface may carry the
separate readback only if its read-only multi-statement transport is verified.
That payload uses transient shared advisory synchronization and SELECTs inside
READ ONLY, with explicit READ COMMITTED validation; it performs no DDL or
persistent data write. Never send bridge, finalization or restoration through
this read-only route. Its JSON result is small even though its request contains
the complete expected constants. This can avoid additional large editor copies
during the retry window, but it does not establish write-transport authority.

For SQL Editor execution, decline automatic RLS additions, AI edits, role
impersonation or any other option that rewrites the prepared SQL or appends
executable statements. A transport probe must independently verify the exact
UTF-8 prepared prefix and allow only a bounded inert line-comment suffix; do not
accept a suffix merely because its byte length resembles earlier metadata.

## Recovery and uncertain outcomes

- A known failed bridge transaction leaves the original state intact.
- A failed finalization transaction leaves the exact bridge intact. Do not
  retry a write automatically. Read back; then either make a newly verified
  attempt or atomically restore the originals with the prepared recovery SQL.
- A lost response is not failure. Read history, catalog, controls and bridge
  state. Readback first takes the same operation gate in shared transaction mode
  using a fail-fast separate statement, then reads a fresh READ COMMITTED
  snapshot while retaining that gate. An active bridge/finalization/recovery
  operation blocks classification instead of exposing its prior committed state.
  A 15-second idle-transaction limit bounds an abandoned readback gate holder.
  Exact `original`, `bridged`, or `applied` snapshots are the only acceptable
  classifications. Partial, different, busy or unreadable state means hold and
  investigate. This serializes only against operations that have claimed the
  gate. It cannot prove a transport/backend request paused before gate acquisition
  will never start later. A prior-state snapshot alone does not settle an uncertain
  dispatch. Never automatically resend an uncertain write.
- Once the thirteen migrations commit, they are immutable. Recovery is a newly
  reviewed forward-only correction. Do not delete migration history, drop the
  new tables, reverse paid-access delivery, or re-enable providers.
- A failed provider event remains unresolved until its authoritative receipt
  and redelivery are checked. Neither a retry response nor deployment success
  proves payment, payout, refund or recovery completion.

## Local native tests

`test-native.mjs` uses real PostgreSQL 17+ on loopback and creates/deletes only a
generated disposable database. It accepts no remote database target. Set
`CUTOVER_PG_BINDIR` to the official native installation and `CUTOVER_PG_PORT`
to the local port. Start the local server and run tests within the same executor
lifetime when background processes do not survive a tool call. Do not call an
emulator run a native concurrency proof.

The full schema proof additionally checks the exact 407 deployed definitions
against source reconstruction, performs all thirteen migrations, and compares
catalogs captured before and after **in the same database history**. A pg_dump
restore can normalize ACLs or constraint parentheses; those differences must
not be incorrectly approved as migration effects.

For a clean reproducible run, use `node ops/automatic-commerce-cutover/run-native.mjs
--local-bin /absolute/official/postgres/bin`. CI uses the same runner with
`--docker supabase_db_chillywood-mobile`: it borrows the existing local CLI
container's official binaries but initializes a separate temporary cluster,
replays source, derives its own baseline definitions and runs both native suites.
It does not alter the existing Supabase cluster. Product CI imports the unit and
hidden-source-mutation tests through `tests/automatic-commerce-cutover.test.mjs`.
Missing native infrastructure fails the test; there is no emulator fallback or
skip-on-missing path. The complete bounded-payload local run took about 106 seconds. The
existing Database job timeout is unchanged.

## Compact, byte-bound expected constants

The generator enforces a 900,000-byte maximum for every bridge, finalization,
restoration and readback request, below Studio's current 0.98 MiB source guard.
This is a size budget, not a promise that a hosted request will succeed.
Function metadata, catalog-key arrays and original migration source strings are
included once as immutable expected constants with independent byte hashes.
Large text is rendered as flat arrays of safely quoted, codepoint-aware chunks,
joined with `pg_catalog.array_to_string(...,'')`. Every physical payload line is
limited to 2,048 UTF-8 bytes. Dollar characters are isolated so source data cannot
terminate the enclosing DO quote. The renderer reconstructs the exact original
text, including whitespace, escapes, Unicode and migration comments; it does not
minify SQL, use a deep concatenation expression or encode source as base64.
Only expected data is shared. Actual catalog, history and control queries still
run afresh at every original boundary, including after locks and after DDL.
Missing, NULL, empty or duplicate expected function records fail closed.

The migration loop follows explicit JSON ordinality. It verifies each original
source and stripped execution body by byte count and SHA256 before EXECUTE, then
inserts exactly one original source string into history. It never minifies or
removes comments from migration bytes. Native tests compare expanded and compact
function/history/catalog predicates in original, bridged, restored and final
states; reject malformed constants and history arrays; and prove atomic failure,
recovery and unchanged state after a server statement timeout. The short timeout
negative may fail during prechecks; separate injected DDL failures prove partial
transaction rollback. No persistent staging object or extra public helper exists.

## Catalog precision and historical comments

This is a selected catalog contract, not exhaustive whole-database catalog
coverage. It binds the listed functions, relations, columns, constraints,
indexes, policies, triggers, sequences, roles and settings. Enum/domain
definitions and extension membership/version metadata are not captured. The
thirteen transition bodies do not change those objects; they use built-in
scalar types and existing relation rowtypes whose columns are covered. Arbitrary
concurrent administrative DDL remains outside the application protocol.

Catalog hashes are computed in PostgreSQL over JSONB, never by round-tripping
numeric catalog values through JavaScript. Identity-sequence limits exceed
JavaScript's exact integer range. Role/database configuration arrays are hashed
server-side because custom settings can contain secrets. Storage-object and
real-time message policy/role bindings are included in unchanged metadata.

Two renamed legacy room-access helpers retain earlier production comments from
`20260824034109_creator_money_authority_integrity_closeout.sql`; chronological
source replay carries later descriptions. `catalog.preservedComments` binds
only those two existing descriptions and records their rename/repair provenance.
Definitions, owner and ACL are identical. Qualification adjusts only the local
fixture's descriptions to that historical baseline. Production SQL does not
change these comments, and original/bridge/final hashes all preserve them.
