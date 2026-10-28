# Profile/feed internal rollout plan — 2026-10-27

Status: DRAFT FOR REVIEW; source and CI remain unfrozen. This document does not
record a deployment, provider change, signed artifact verification, or physical
qualification. Scope is PR627 profile/feed repairs only, not monetization,
payouts, public release, new credentials, or provider configuration. No Mac use.

## Freeze and authority

Review the final complete diff, run the conservative required-validation plan,
focused regressions and full database suite, and require exact-head
`Chi'llywood / Required Validation`. Verify the merged protected-main SHA/tree.
Do not infer this from the initial PR head or this mutable local checkout.
Run `scripts/release-review-gate.mjs` with supported authenticated GitHub context
before release; the OTA publisher does not invoke it itself.

## Backend: exact targeted forward migrations

Production project: `bmkkhihfbmsnnmcqkoly`. Freeze source SHA-256 for each final
file, then apply only these migrations in the listed dependency order through the
supported Supabase migration tool; never broad-push the unrelated pending queue.
The filenames below are candidate identities, not predicted deployed versions:

1. `20261027210217_profile_relationship_feed_cursor.sql`
2. `20261027211112_profile_public_read_role_isolation.sql`
3. `20261027214412_profile_engagement_sharded_counters.sql`
4. `20261027221629_profile_feed_guarded_candidate_fastpath.sql`

Final qualification includes the source transaction-local lock and statement
budgets being added before publication. Require native canonical authorization,
policy/ACL drift fallback, cursor equivalence, transaction/concurrency and timeout
proof against those exact final bytes before freezing or applying them.

Before applying, re-read remote migration history including statement hashes;
verify exact prerequisites and preserve every existing version/name/body. Record
affected function definitions/owners/ACL/security/search paths, policies, indexes,
triggers, RLS/FORCE RLS, table sizes and current activity. Capture unchanged
catalog fingerprints. Stop on drift, unknown history, missing prerequisites or
an unexpectedly already-applied version; reconcile before retrying.

This is not an online migration claim. Cursor indexes are ordinary builds;
counter backfill locks likes/comments in SHARE ROW EXCLUSIVE mode through trigger
installation. Review fresh measured relation sizes and activity, a bounded
maintenance window, and explicit lock/statement budgets before action. Do not
automatically increase timeouts. The intended source-local budgets are a
five-second lock timeout and sixty-second statement timeout, confined to each
migration transaction; these are not persistent provider settings. Submit only
the exact tested SQL payload, including its transaction boundaries and budgets.
If another wrapper becomes necessary, stop for exact-byte review and qualification
rather than silently changing the deployed payload. Historical October16 payload
guards cannot be reused.

A read-only preflight at 23:12 UTC on October 27 observed PostgreSQL 17.6,
two-minute default statement timeout, zero default lock timeout, affected
relations below 250 KB and no other active transactions at that instant. These are
time-bounded observations, not a maintenance-window or zero-lock guarantee.
Repeat the checks immediately before application; do not extrapolate them to
later traffic, table size or transaction state.

### Connector-assigned versions and source reconciliation

The current MCP `apply_migration` accepts `project_id`, `name` and `query`, not a
source version. The [official Management API](https://supabase.com/docs/reference/api/v1-apply-a-migration)
also exposes no version argument. The MCP implementation reports `success: true`,
not the assigned timestamp; do not guess it or embed the candidate timestamp in
the name expecting version control. Supabase's acknowledged
[version-parameter issue](https://github.com/supabase/mcp/issues/241) remained open
when checked October 27.

1. Preserve the final merged source commit and exact SQL hash before applying.
   Use the descriptive snake_case name without the candidate timestamp.
2. Apply one approved payload once. Read remote history immediately afterwards,
   comparing against the preflight snapshot to identify its actual new
   version/name. Require exactly one unambiguous matching row, the complete
   stored statement payload, byte count and SHA-256 equal to the submitted SQL,
   plus expected installed object definitions. A success flag alone is not proof.
3. Rename only that source migration to the verified installed version/name,
   keeping SQL bytes unchanged. Do not leave both filenames, mark the old local
   version applied, rewrite/delete remote history, or use migration repair to
   manufacture parity. Stop on a collision or unexpected ordering dependency.
4. Update exact filename references, migration inventories and audit mappings in
   a narrow source-only reconciliation PR. Preserve qualification artifact hashes
   and document the candidate-to-installed identity mapping rather than falsely
   claiming old evidence ran under a new filename. Rerun required validation and
   merge the exact reconciliation head before client publication.
5. Verify the remote history delta contains only the four approved payloads in
   the intended order, prior history is unchanged, and Git has one byte-identical
   file for each deployed identity. Any unrelated pending migrations remain held.

This repository has exact prior source-reconciliation precedents in commits
`fea9a9220d16bfa0e7b7d814bf81773b6041d02b` and
`e44f88b361e12be0ef8511fb8a4a49087dc1a0df`. Read-only verification on October 27
confirmed the former's installed hold migration still matches its renamed Git
file byte-for-byte: one 1,554-byte statement and SHA-256
`033a73ec64f7ed5ab5233a1d87ca6f2998d845eb9a79949826a504de344c72e2`.
The reconciliation above preserves that approach; it is not a claim that the
connector automatically synchronizes source filenames.

After each migration, re-read history before proceeding. After all four, verify
exact new history rows, prior history unchanged, approved object definitions,
grants and policies, index validity, trigger bindings, private counter RLS and
denied app-role writes. Read-only parity must show sharded totals equal actual
likes and comments eligible under deleted/moderation predicates. Verify anonymous
and authenticated public/private/blocked source access, omitted inaccessible
posts, cursor contract and bounded reads using approved non-mutating probes.
Do not manufacture production users/posts to run fixture tests. Confirm unrelated
catalog, held Studio/monetization migrations and project health unchanged.

## Forward-only recovery plan (requires exact SQL review before use)

* Failed, timed-out or disconnected call: establish the actual outcome using
  both history and installed catalog/counter/trigger state before retrying.
  These payloads have explicit transaction boundaries; a tool error or missing
  success response does not prove every change rolled back or that history was
  recorded. Stop on a partial or ambiguous outcome. Never blindly reapply or
  insert/delete ledger rows to conceal uncertainty. A retry is appropriate only
  after proving the intended payload did not commit and its preconditions remain
  valid. Committed state requires verified identity reconciliation or a separately
  reviewed forward correction, not replay by assumption.
* After commit but before OTA: hold client publication. Preserve all committed
  history and user data. Diagnose and prepare a NEW timestamped corrective
  migration, test it on the frozen canonical fixture and re-review its exact diff.
* If only the optimized counter reader is wrong/slow: a candidate correction can
  restore the prior invoker/RLS-authorized batch reader definition while retaining
  counter schema and triggers. This is a design, not executable rollback SQL;
  prove old/new client signature compatibility and latency before selecting it.
* If triggers themselves block legitimate writes: retaining triggers is not a
  sufficient rollback. Prepare one atomic forward correction that replaces the
  reader with validated source-based counts and removes/replaces only the exact
  implicated trigger bindings. Preserve private counter rows as evidence, never
  expose them, and label them stale if maintenance stops. Do not drop user data,
  relax RLS/grants, clamp negative counters, or silently bypass authorization.
* Cursor/RLS corrections must preserve existing APIs and authenticated policy
  semantics; never undo anonymous isolation by granting staff-role helpers to
  anon. Re-run denial and old-client compatibility regressions.
* After corrective commit, verify exact changed definitions/history and unchanged
  unrelated catalog. Only then reconsider OTA. Backend schema is not reverted
  merely because a client update is withdrawn.

## Internal client route and prerequisite evidence

Current authority is `config/release/internal-native-generation.json`, not older
V2 examples in `docs/release/CONTROL_PLANE_RUNBOOK.md` or historical manifests.

| Platform | Runtime | Channel/branch | Audience |
| --- | --- | --- | --- |
| Android | `1.0.0-android-production-v17` | `android-internal-v2` | Play internal |
| iOS | `1.0.0-ios-production-v17` | `ios-internal-v2` | Chillywood Internal |

Both use production environment, app-owned activation, native automatic
activation disabled. Expected git-native-inputs/v1 cohort digests:

* Android: `28e24d43df2d6c787874d3e7e4854017f74bab5a0311504f548cedebf982b623`
* iOS: `bc52288a220e86ed22d7ce0b4f30a99e68969b1f8545450fab6968c7fe8658cf`

User's October26 report identifies Android111/iOS42 as available V17 builds; it
does not supply artifact IDs/digests. Obtain authoritative build identity,
successful status, platform/profile/runtime/channel, exact source SHA/tree,
signed artifact SHA-256 and validity/revocation evidence. Retain private signed
download URLs outside logs/docs. A build number or native source digest is NOT
an artifact hash. iOS receipt must include `ios-native-calls` capability.

Through an authenticated official EAS CLI, use read-only `whoami`, `project:info`,
`build:list`, exact `build:view`, `channel:view android-internal-v2`,
`channel:view ios-internal-v2`, and branch-filtered `update:list` to resolve and
verify the targets. Filter/redact output before reporting; raw build JSON may
contain artifact URLs. Independently verify store internal availability if that
claim is needed; EAS build success alone is not Play/TestFlight availability.

Run native compatibility verification against the actual signed binary's source
objects and final merged source. Retain the previous compatible update identity
and backend-compatibility evidence before publishing. If no previous compatible
update exists, explicitly establish a compatible embedded/forward-fixed recovery
path; do not assume older runtime OTA can serve V17. Any rollback action must
use separately reviewed canonical controls, never raw channel remapping.

From clean exact protected main, with externally stored approved nonsecret JSON
receipts, use only:

```sh
npm run ota:internal-v2 -- --platform android --message "Profile/feed repair" --binary-receipt /approved/android.json
npm run ota:internal-v2 -- --platform ios --message "Profile/feed repair" --binary-receipt /approved/ios.json
```

Publisher performs local and EAS production-environment validation, rechecks
source before mutation, binds source/tree/plan in the message and validates exact
returned platform/runtime/branch/update identity. Read back provider state after
each publication and reconcile uncertain outcomes before retrying. Preserve
update ID/group/source/tree/plan hash. Publication is not installed uptake.

Existing GitHub iOS production/TestFlight and Android public/preview workflows
target different profiles; do not substitute them for the V17 internal OTA lane.
No new native build is justified solely by these JS/DB changes when actual
native compatibility proves equal.

## Own-cloud access observations and remaining gates

As checked October27: public expo.dev, api.expo.dev and npm registry endpoints
responded HTTP200 from this cloud. No EAS executable/local binary, EXPO_TOKEN,
or default Expo auth-state path was found (presence checks only; no secrets read).
No Expo connector was exposed. Targeted Library search and currently attached
historical cloud-task outcomes yielded no exact V17 signed receipt. These are
bounded observations, not proof no receipt exists anywhere.

Official [EAS CLI reference](https://docs.expo.dev/eas/cli/) supports browser login
and `eas login --device`, allowing sign-in from another device. Thus a cloud
login route is possible without the Mac. EAS CLI 26.0.0 was subsequently installed
and its device-login help verified in an isolated temporary directory without
repository dependency changes. Workspace replacement at 22:54 UTC removed that
temporary installation; reinstall the pinned official CLI when needed.
Initiating its device-login flow is awaiting the user's approval; authentication
has never started. Do not ask for a password/token in chat, create credentials,
or copy auth-state files.
After login, perform read-only target resolution before any release action.

Current gates: final source/CI not frozen; production preflight and recovery SQL
not yet reviewed; exact signed receipts and current channel mappings not read
back; cloud EAS authentication absent. Physical-device smoke tests remain unrun.
