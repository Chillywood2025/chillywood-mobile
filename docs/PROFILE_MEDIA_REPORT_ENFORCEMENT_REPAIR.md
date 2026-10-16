# Profile media report enforcement repair

The existing Admin report action for a Profile photo or background reaches
`apply_admin_report_target_action`, which validates staff scope, reason, report,
target and action. The later `guard_profile_media_client_authority` trigger then
rejects its server-owned status transition. Its provenance predicate also binds
ordinary profile writes to the media owner, so relaxing the status check alone
does not repair moderation of an uploaded object by another staff account.

The existing `profile-media-public` Edge handler authorizes each object download
through `resolve_profile_media_delivery`. That resolver checked exact object,
Profile visibility and clean scan, but omitted the moderation status. Hiding
only the rendered URL therefore did not revoke a previously known exact URL.

The forward migration `20261016113149_profile_media_report_enforcement_repair.sql`
changes exactly three existing functions and does not apply itself:

- The report RPC locks the exact Profile row and installs a temporary context
  only around its status update. The trigger remains SECURITY INVOKER and
  accepts that context only from an executing server role with a currently
  authorized actor/action, exact open report/target/media kind, expected status
  and timestamp, and an otherwise byte-for-byte equal old/new row. It restores
  the prior context before report/audit completion and rechecks authority after
  the audit. Error rollback restores both row state and temporary context.
- Profile actions check the exact hide/remove/restore permission. The old
  umbrella `content_moderation` reverse aliases accidentally allowed a hide-only
  grant to remove or restore too. Genuine broad moderation grants retain their
  existing aliases; other target types and the permission catalog are unchanged.
- Direct authenticated SQL, including an authorized staff account setting a
  counterfeit context, still uses the original owner/provenance/status/scan
  rules. The setting is not a secret or a standalone capability.
- The delivery resolver additionally requires that the exact media kind has
  `active` moderation status. Restoring moderation never marks malware clean,
  changes media identity, weakens privacy, or deletes stored evidence.

No new role, permission, function grant, RLS policy, table or provider action is
introduced. Deployed migration bodies are unchanged. Recorded remote history
is retained in `DATABASE_RUNTIME_AUTHORITY_DEPLOYMENT_2026_10_15.json`: deployed
runtime repair `20261015220128`, 426 history entries, Studio unapplied. This
source change neither redeploys that repair nor applies the held Studio SQL.

## Automated evidence

`tests/profile-media-report-enforcement.test.mjs` replays the real migration
chain in isolated PGlite, including the recorded production drift and runtime
repair. It restores the old guard/report action to require the original failure,
and restores the old delivery resolver after a genuine repaired hide to require
the old incorrect allow. It checks actual scoped RPC effects, exact owner-only
notification resolution, unchanged object/scan evidence, both media kinds,
ordinary and staff direct-context forgery, wrong target, missing reason,
out-of-scope action, retry, malware restore denial, late session loss, audit
failure, unexpected row mutation, temporary-context cleanup, and unchanged
catalog/grants/RLS plus idempotent migration application.

`supabase/tests/moderation_notification_activity_test.sql` now requires the real
Profile enforcement RPC and seventh notification/bell result. The former
synthetic observer-only Profile success is removed. It includes actual clean
storage references, direct-context denial and hidden-object delivery denial.

`scripts/profile-media-report-concurrency-cases.mjs` runs from the existing
native PostgreSQL concurrency runner inside its generated disposable local
clone. Six cases require observed blocking at the Profile row and audit insert,
with independently revoked actor sessions or exact scoped grants. Its positive queue checks exact
state/audit/event and context cleanup, then starts concurrent retries and
requires no duplicate effects. The shared local database is never modified by
these cases.

`tests/profile-media-report-mutation-controls.test.mjs` launches the real SQL
regression against removed delivery status, executing-role and final-authority
checks. Each child clears Node's inherited internal test-worker context and
must fail at its expected behavioral assertion; process failure alone does not
qualify. The root-level validation-wiring test checks discovery and required
Product/Database selection without changing workflow or review policy.

CI discovery is existing workflow behavior: Product runs `node --test
tests/*.test.mjs`; Database runs `supabase test db`, then
`scripts/test-database-runtime-authority-concurrency.mjs`, which imports the new
cases. Full database and native multi-session results must pass at the candidate
head; source and PGlite tests alone are not physical or provider qualification.

These source tests do not authorize production rollout, client delivery or
physical testing. The later database deployment is recorded below.

## Cloud validation boundary (2026-10-16)

The repaired full-chain PGlite behavior test and adjacent catalog/authority/media
client tests execute in the cloud with synthetic subjects. Verified locally:

- Real-SQL behavior plus three mutation controls: 4/4 pass.
- Adjacent runtime catalog/mutation and media-client suites: 14/14 pass,
  including both held and included Studio catalog fixtures.
- CI discovery/selection test: 1/1 pass; route/navigation checks: 13/13 pass.
- TypeScript and its chained guards, full app lint, focused test/script lint,
  runtime validation with the workflow's synthetic CI values, and diff checks pass.

Native PostgreSQL,
pgTAP and the full hosted database job were **unverified** in that cloud run: the workspace
has no Docker/PostgreSQL/Supabase CLI runtime. The native runner fails closed
at Docker discovery before connecting to any database. Authored native cases
are not execution evidence. Source validation does not grant permission to
merge, deploy, apply Studio SQL, build, publish an OTA or claim device proof.

## Production deployment receipt (2026-10-16)

The separately authorized repair was applied to `bmkkhihfbmsnnmcqkoly` as
`20261016113149_profile_media_report_enforcement_repair`. Readback at
`2026-10-16T11:33:56.556Z` confirmed one new migration row, 427 total, with all
426 earlier entries preserved. Exactly three approved function definitions
matched their expected hashes; their identities, OIDs, owners, ACLs, security
and search paths were unchanged. The other 1,102 app functions, 2,376 relation
records, 578 policies, 391 triggers and 71 Edge-function metadata records were
unchanged. Security advisors were unchanged and the project was `ACTIVE_HEALTHY`.
The invalid-identity read-only resolver probe denied access as expected.

The concise [deployment receipt](PROFILE_MEDIA_REPORT_ENFORCEMENT_DEPLOYMENT_2026_10_16.json)
records separate source and deployed-payload hashes. The source filename now
matches the deployed timestamp; its SQL bytes are unchanged. The exact
[stored deployment statement](deployments/20261016113149_profile_media_report_enforcement_repair.payload.sql)
is retained only as evidence, outside `supabase/migrations`. Its production-only
guards pin the predeployment 426-row history and function metadata: do not use
that wrapper for normal migration replay or redeployment. This alignment makes
no database change.

Studio remains unapplied. No real report action, app build, OTA, device or
provider behavioral qualification was performed by this deployment.
