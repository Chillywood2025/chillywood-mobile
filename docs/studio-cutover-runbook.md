# Studio / Audience held-migration preparation

This is a **manual operator evidence gate**, not a deployment mechanism. It
prepares only the unchanged bytes of
`supabase/migrations/20261015073423_platform_studio_publication_and_audience_authority.sql`.
It never applies SQL, changes provider settings, creates credentials, pauses a
service, distributes a build, or authorizes production action. Source/PR approval
does not authorize any of those actions.

## Why the migration remains held

Historical Brand clients cannot distinguish draft saves from intended publish
writes reliably, and some old UI paths report success after a rejected write.
The same migration changes Audience request review from direct UPDATE to an RPC.
An empty current request table does not establish old-client compatibility.
There is no safe implicit legacy bridge here. Complete upgraded/retired client
coverage is mandatory. Public, unbounded, unknown or unverifiable cohorts stay
blocked; the gate is only for a finite, closed internal tester cohort.

The database cohort is a floor, not device discovery:

- Canonical subject-level role/Premium helpers identify potential profile
  writers without incorrectly using the capturing operator's auth session.
- All existing Brand asset owners, storage prefix owners, preserved profile
  owners and staff reviewers are included. Legacy asset helpers do not share
  the newer Premium/session gates. Profile preservation can overinclude an
  account that has no current write authority.
- All nondeleted auth subjects and existing Audience channel owners are
  included, because any account can become a channel reviewer. Only IDs are
  read from auth users; sessions and tokens are not read.
- Privileged human, service, job and credential holders must be independently
  inventoried from actual operational records. The database cannot discover
  every credential holder, installed binary, cached session or offline device.

## Operator workflow

1. Obtain the separate authorization required for the eventual external apply.
   Use a reviewed, committed clean checkout. Do not edit the held migration.
   Run `node --test tests/studio-cutover-preflight.test.mjs` plus the selected
   Required Validation and historical compatibility regressions.
2. Prepare private original build/install/staging artifacts and a complete
   account/client/privileged-holder roster outside the checkout. Never commit
   real identities, connection secrets, private receipts or capture output.
   Receipt hashes establish integrity, **not authenticity or completeness**.
   A trusted operator must inspect the referenced original sources. A forged
   evidence JSON can fool a local operator gate; it is not a security boundary.
3. Establish and independently verify a bounded pause (maximum 15 minutes)
   covering all Studio/Audience creation, review, writes, asset/storage updates,
   deletes, privileged jobs, eligibility/role changes, account reactivation,
   new installations and offline-client resumption. Keep it through apply and
   verification. If any of this cannot be established, do not prepare/apply.
   This CLI does not establish or enforce that pause.
4. Use an **already configured** read-authorized `psql` connection. This tool
   never obtains or configures credentials. Supported endpoints are direct
   `PGHOST=db.PROJECT.supabase.co`, `PGUSER=postgres`, or Supabase session pooler
   `PGHOST=aws-REGION.pooler.supabase.com`, `PGUSER=postgres.PROJECT`.
   `PGDATABASE=postgres`, port 5432 (or omitted), and existing
   `PGSSLMODE=verify-full` are required. `PGHOSTADDR`, `PGSERVICE` and
   `PGSERVICEFILE` overrides are rejected. Unsupported connection modes remain
   blocked; do not weaken TLS or change credentials/settings to satisfy this
   runbook. Never put a password or URL containing one in a command/history.
5. After the pause starts, capture a new private baseline:

   `node scripts/studio-cutover-preflight.mjs capture PROJECT /PRIVATE/baseline.json`

   The extractor uses one repeatable-read, read-only transaction. It captures
   the entire migration ledger; schema/function/policy/trigger/index/ACL/role
   catalog; computed cohort; and deterministic SHA256 metadata-state digests
   of Brand profiles/assets, Brand storage rows, Audience requests/followers.
   The digests detect same-actor state changes between captures without
   exporting raw rows or downloading stored objects. Null/noncanonical subjects block. A held
   migration ledger record or any newly introduced held object blocks partial
   as well as complete duplicate apply. Later unrelated migration versions
   are allowed; full local history parity is not historically reliable.
6. Review that exact baseline against the source and prerequisites. Create the
   private evidence manifest and receipt wrappers below, bound to its exact
   `binding`. Review and currentness evidence must be within five minutes.
   Preserve original historical artifact/test times; do not relabel them as
   newly executed. Build/staging/source observations can be older when their
   immutable artifacts are freshly reviewed. Client installed-version and
   roster/current-access checks must be fresh while the pause is established.
7. Immediately before the external apply operation, run:

   `node scripts/studio-cutover-preflight.mjs prepare PROJECT /PRIVATE/evidence.json /PRIVATE/baseline.json /PRIVATE/payload.sql`

   `prepare` performs a **second actual database read**, compares the complete
   binding, and requires more than one minute left in the pause. It creates a
   new mode-0600 file only after all checks pass; it never overwrites files.
   It writes a private temporary file and atomically publishes it with an
   exclusive hard link, so a failed write cannot expose partial SQL. All
   freshness deadlines are checked again after the final database read.
   Success means only that this payload passed this evidence gate.
8. There is **no existing production apply CLI integrated with this gate**.
   The separately authorized operator must immediately re-read/compare live
   state while the pause remains active and use only this exact emitted
   payload with their external apply tool. If time passes, a capture changes,
   the source changes, or any new eligibility/client/privileged activity is
   discovered, abort and recreate evidence. Never use an old payload following
   a failed rerun. An existing payload is not revoked/deleted by failure.
   These separate operations have a TOCTOU window; no atomic deployment lock
   is claimed. Privileged manual Supabase application can bypass this gate.
9. Before lifting the pause, verify applied migration/catalog and run an
   authorized production canary on upgraded clients: truthful draft save,
   explicit publication and public snapshot isolation, truthful failure display in upgraded clients,
   deletion/storage behavior, and Audience approve/decline with persisted
   result and visible failure. Historical installed clients must remain
   retired. If verification fails, retain the hold and investigate; do not
   roll back by reintroducing unsafe compatibility writes or edit applied SQL.

## Private evidence format (schema 1)

`tests/studio-cutover-preflight.test.mjs` builds a complete **synthetic-only**
example and invokes the real CLI. Do not turn its fabricated receipts into
production evidence. No fixture file contains real users or deployment proof.

The manifest contains:

- `schema: 1`, `binding`: exact baseline binding, `reviewer`: accountable
  operator reference, `reviewedAt`: current ISO timestamp.
- `cohortScope`: exact statement
  `Finite closed internal tester cohort; no public rollout, unknown clients or unenumerated account access`.
- `baselineReview.statement`:
  `Reviewed live project, migration ledger and catalog against this exact source; required predecessors are present and the held migration is absent`.
  Its `receipt` has kind `baseline-review` and claims `{liveSha256}`.
- `privilegedInventory.statement`:
  `All privileged humans, services, jobs and credential holders with Studio/Audience mutation access are enumerated`.
  `holders` is a nonempty, unique array of private subject references; the
  `receipt` kind is `privileged-inventory`, claims `{holders}`. Include the
  applying privileged operator, scheduled workers and backend services.
- `accounts`: exactly one entry per union of every extracted cohort and
  privileged holder, with no duplicate, missing or extra subjects.
  Each has `subject`, `statement`:
  `Every installed, cached, offline and automated Studio/Audience-capable client for this account is listed; no unknown clients remain`,
  `clients`, and `rosterReceipt` (kind `client-roster`, claims
  `{subject, clients: [{id, state}, ...]}`).
- Every client has unique private `id` and `state`. An `upgraded` client
  includes exact `sourceCommit`, `build`, `runtime`, `platform`, and `behavior`:
  `Exact-source disposable post-migration Studio/Audience tests passed; installed client verified pre-cutover truthful failure`.
  Each of `sourceReceipt`, `buildReceipt`, `runtimeReceipt`, `installReceipt`
  and `behaviorReceipt` is a receipt of that same kind with claims
  `{subject, client, sourceCommit, build, runtime, platform, behavior}`.
  Installed client source may be an ancestor of gate HEAD only when **every**
  changed path is in the CLI's exact gate/tests/runbook allowlist. Changes to
  app, native, package/configuration or migration source are rejected. An
  ancestor alone or a label saying “latest” is insufficient. Disposable
  post-migration testing does not pretend that production already has the RPC.
- A `retired` client has `retirement`:
  `Cannot resume Studio/Audience actions, including cached/offline sessions`,
  plus `retirementReceipt` (kind `retirement`, claims
  `{subject, client, retirement}`). Mere OTA publication, a logout assertion
  or an account marked inactive without evidence is not device retirement.
- Empty `clients` is allowed only with `disposition`:
  `No client provisioned; dormant account cannot resume or obtain a client during cutover`,
  plus `dormancyReceipt` (kind `dormancy`, claims `{subject, disposition}`).
  The empty roster still needs its reviewed `rosterReceipt`.
- `pause` has exact `scope`:
  `All Studio/Audience creation, review, writes and deletes, storage, privileged automation, eligibility and role changes, account reactivation, new installs and offline client resumption`,
  `subjects`: complete union, `startedAt`, `expiresAt`, and `receipt` (kind
  `pause`, claims `{scope, subjects, startedAt, expiresAt}`).

Every receipt reference is `{file, sha256}`. Files resolve relative to the
private manifest and must resolve outside the checkout. Receipt JSON contains
`schema: 1`, exact `binding`, matching `reviewer`, exact `kind` and `claims`,
`observedAt`, fresh `reviewedAt`, meaningful `observation`, and a private
`sourceReference` to independently inspected evidence. It also requires a
nonempty `sourceEvidence` array of `{file, sha256}` references to actual private
original evidence files, resolved relative to the receipt. These files must be
nonempty and match their hashes; the wrapper, manifest and baseline cannot be
used as their own original evidence. Observation cannot be
after review. Install, roster, dormancy, privileged inventory and pause
observations must also be fresh and occur after the pause began. Other observation times retain their true
historical value. Wrappers do not authenticate the underlying evidence; the
operator is responsible for that review. Unknown/malformed/stale/mismatched
input, nonzero psql exit or timeout produces no new payload.

## Validation limits

The executable tests exercise successful exact-byte output, private file mode,
non-overwrite, CLI failures for missing/stale/future/wrong-source evidence,
roster and client omissions, legacy/unretired clients, weak pause, connection
overrides, live history/catalog/cohort drift and dirty source. A separate
PGlite test executes the real extractor SQL over synthetic PostgreSQL tables,
including owner-only/storage/reviewer coverage and partial-apply detection.
These are local tests, not proof of live installations, provider compatibility,
an actual production pause, or production cutover completion.
