# Studio / Audience atomic rolling deployment

The supported rolling path applies these three migrations **in one transaction**:

1. `20261015073423_platform_studio_publication_and_audience_authority` — unchanged held bytes.
2. `20261019020049_platform_studio_rolling_brand_compatibility`.
3. `20261019020052_platform_studio_rolling_audience_compatibility`.

Use `scripts/studio-rolling-deploy.mjs`, with the reviewed hashes in
`scripts/studio-rolling-deployment-manifest.json`. Do not run `db push`, a
standalone `apply_migration`, or three separate requests for this bundle:
committing the held migration before its compatibility successors creates an
unsupported intermediate state. Deployed history remains immutable.

Source approval does not authorize production application. An operator needs
separate, explicit authorization for this exact database deployment. The command
uses an existing `SUPABASE_ACCESS_TOKEN` against the fixed project
`bmkkhihfbmsnnmcqkoly`; it does not create credentials, change provider settings,
publish an OTA, build an app, or retire accounts/installations.

## Behavior during a rolling update

- Current Studio clients publish the full profile and selected media atomically.
  Draft changes cannot replace the public snapshot. Public asset rows and Storage
  reads require a safe, visible committed snapshot reference, while owner/staff
  private access retains its existing authority checks.
- Historical Studio draft upserts may retain a publication timestamp recorded
  at cutover or by a later atomic Publish. The server preserves its current
  timestamp. An older pre-cutover cached timestamp that was never recorded
  requires reloading Studio before saving.
- **Historical Publish requires updating the app.** Unknown publication
  timestamps and standalone asset publication reject with
  `brand_publish_rpc_required`. Old UI can still display an incorrect success
  notice after that rejection, including its zero-asset path. The backend
  cannot repair already-installed UI; verify the public snapshot rather than
  trusting that notice. Do not describe old Publish as working.
- Historical Audience approval first performs a validated follower-insert
  preflight that creates no relationship. Its final exact-request-ID update
  commits the follower and reviewed request together and returns the persisted
  row. Current RPC approval uses the same transition guard. Subscriber approval
  remains unsupported; cancellation and ordinary requester self-follow retain
  their existing paths.
- The atomic guarantee begins at the deployment boundary. A relationship may
  already exist beside a pending request because of legitimate self-follow or
  a pre-cutover partial operation. The tool reports the aggregate count for
  operator context and does not delete or reinterpret those relationships.
  An in-flight historical final update can complete through the new guard.

These verified compatibility behaviors replace the complete-client-retirement
prerequisite **only for the exact atomic rolling path**. They do not establish
an installed-version inventory, make all historical actions compatible, revoke
previously downloaded media, or authorize removal of other protections.

## Rolling operator workflow

1. Review and merge the focused source PR after its exact-head Required
   Validation passes. Run the focused rolling legacy, database, native
   concurrency and deployment tests, including rollback after an intermediate
   migration failure. Run the required full database suite at the frozen head.
   Review migration parity and the precise client limitations above.
2. Use a clean committed checkout at the reviewed full commit SHA. Refresh
   `scripts/release-review-gate.mjs` with the existing authenticated GitHub
   context. The deployment manifest pins migration bytes, historical prerequisite
   statement hashes and final policy fingerprints; it intentionally contains no
   self-referential commit hash. Changes to those pins require source review.
3. Run the default read-only plan:

   `node scripts/studio-rolling-deploy.mjs --source FULL_COMMIT_SHA`

   `plan_ready` means all targets are absent, the prerequisite history and
   retained asset helper match, and the baseline was captured. The command emits
   hashes and aggregate status only. It sends no mutation. Mixed history,
   partial catalog, unexpected source bytes or prerequisite drift blocks.
4. After explicit deployment authorization, run:

   `node scripts/studio-rolling-deploy.mjs --source FULL_COMMIT_SHA --apply`

   The command rereads live state, rechecks immutable committed source and sends
   exactly one transaction. A transaction-scoped advisory lock serializes
   cooperating deployments; write-blocking table locks cover migration history,
   Audience requests/followers, Studio profiles/assets and Storage during seed
   and schema changes. Lock waits are bounded to five seconds and individual
   statements to 45 seconds. Existing writes finish before seeding or the apply
   aborts. Avoid concurrent privileged schema maintenance; an advisory lock
   cannot constrain an operator who ignores it.
5. Inside the transaction, baseline catalog/history are compared again, exact
   migration bodies and their individual history rows are applied, and function
   bodies/signatures, triggers, RLS/grants and policy fingerprints are checked
   before commit. PostgREST schema reload is notified at commit. Any SQL error
   rolls back the complete bundle and its history rows; no intermediate held-only
   state is published. Do not edit deployed versions or use a permissive fallback.
6. Every apply attempt is followed by read-only verification, including after a
   lost response. `applied_verified` confirms complete exact history and final
   catalog. `already_applied_verified` is an idempotent readback and sends no
   write. `apply_unconfirmed` or `not_applied_readback` is not success and does not
   authorize a retry: a timed-out request may still be running. Inspect the
   provider state and repeat only the default read-only command until the
   outcome is known. Never blindly retry a mutation.
7. Retain the command's safe receipt privately. Perform separately authorized
   production canaries for current draft/publication isolation, legacy draft
   handling and Publish rejection, public asset visibility, and both Audience
   review paths. Publication and schema verification are not installed-device
   proof. If behavior fails, investigate and use a reviewed forward correction.

## Standalone held-only preparation (not the rolling path)

This is a **manual operator evidence gate**, not a deployment mechanism. It
prepares only the unchanged bytes of
`supabase/migrations/20261015073423_platform_studio_publication_and_audience_authority.sql`.
It never applies SQL, changes provider settings, creates credentials, pauses a
service, distributes a build, or authorizes production action. Source/PR approval
does not authorize any of those actions.

## Why the standalone migration remains held

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
