# Cognitive Level 0/1 deferred-Supabase continuation

Status: `OWNER_ASSISTED_ACTIVE`

Isolated runtime: `ISOLATED_AUTONOMOUS_PENDING`

This report is source truth for the continuation branch. It does not activate
an isolated runtime, authenticate a remote baseline, enable a switch or
schedule, or claim unattended operation.

## Change control

- Objective: continue app inspection, inert infrastructure readiness, sandbox
  canaries, bounded draft fixes, scheduler dry-runs, and evidence preparation
  while the Supabase `net` boundary remains open to `PUBLIC`.
- Branch:
  `codex/cognitive-level01-deferred-supabase-continuation`.
- Base: latest verified descendant
  `0a69bbf400151b5136c2dda070aeb586cd846171` of implementation PR #30.
- Owner approval: the continuation request explicitly authorized this bounded
  draft work.
- Product-facing source allowlist:
  `_lib/cognitiveAdminStatus.ts`,
  `components/admin/cognitive-control-center.tsx`, and
  `supabase/functions/cognitive-governance-control/index.ts`.
- Supporting allowlist:
  `scripts/test-cognitive-collective-governance.mjs`,
  `scripts/validate-cognitive-deferred-evidence-manifest.mjs`,
  `config/intelligence/cognitive-level01-deferred-evidence-manifest-v1.json`,
  `package.json`, and this report.
- Before hashes for the three product-facing paths:
  `f35b0ee694b00dcf0314f6e536534405f1f8d38a1950a9ea842442002d94baba`,
  `600ed8e70fb1922db82f6afbe13bf954bb14652c639abd94651f759e39f731e0`,
  and
  `45dbf11450c8075ff1d8172dd39c56d2a4b5e6a86fe339c28ba189780c96ccc5`.
- Test plan: focused governance/status tests, deferred-manifest validation and
  import planning, inherited cognitive checks, TypeScript, lint, Expo Doctor,
  deterministic architecture generation, `git diff --check`, and GitHub CI.
- Rollback: close the stacked draft PR and delete only its unprotected branch.
  No deployed migration or provider state must be rolled back because this
  continuation does not deploy them.

## Provider and free-plan truth

Supabase ticket `SU-431426` preserves the exact request for project
`bmkkhihfbmsnnmcqkoly`: remove `PUBLIC USAGE` from provider-owned schema
`net` while retaining the explicit direct grants required by trusted Supabase
roles and functions.

Current state:

`WAITING_FOR_SUPABASE_NET_SCHEMA_PROVIDER_ADMIN`

The Free Supabase plan has no guaranteed custom provider administration or
email-support SLA. No Supabase upgrade was purchased. No runtime LOGIN
password or Hyperdrive database credential was created. The ten available
Cloudflare Free Hyperdrive slots remain a reserved capacity budget only; zero
configurations exist.

Cloudflare remains on Free. The credential-free gateway and ten private
services are deployed only as `INERT_READINESS_ONLY`. Private services have no
public or preview route. The gateway has ten exact Service Bindings, no
database binding, no provider credential, no schedule, and no background task.
The sanitized readiness evidence records:

- source
  `a4519f33e685fb3b85b3019e87323d3fef935d32` and tree
  `404f326bed9c0deab92e084fa83084fe1283bc60`;
- local runtime `128/128`;
- remote negative security `18/18`;
- zero Worker secrets;
- zero Hyperdrive bindings;
- direct private-route denial;
- missing and wrong Access denial;
- wrong service token, target, and binding denial;
- malformed, oversized, and unsupported-operation denial.

Configuration identifiers remain represented by hashes in committed evidence.
No paid Cloudflare feature was enabled.

## App, LiveKit, research, GitHub, and scheduler results

Android Google Play Internal build 84 remained installed from
`com.android.vending`; no rebuild, reinstall, OTA, or publication occurred.
Two route passes covered Home, Explore, Library, Profile, Settings, Chat, Live,
content/player, and the Watch Party entry surface. Home, Explore, Library, and
Live resolved; Search remained visible and interactable; the old missing
Search-node result remains classified as an automation false positive. The
Watch Party route truthfully resolved to the existing Premium gate. No
unresolved loading state, crash, or ANR was observed. Background/foreground
and process-stop/relaunch preserved the signed-in session. A separate
UI-driven sign-out/sign-in journey completed and returned to the signed-in
Home state.

The Home main-tab target remained reproducible at approximately
`102.86dp × 23.24dp`, below the Android 48dp recommended height. Source binding:
`components/haptic-tab.tsx#HapticTab`, source hash
`eeb1860d6e4edb647e1ebeb116ff81393ec50e2d721560c1fe2d686716a518f8`.
The separate Owner-assisted source canary is draft-only.

LiveKit used the preview sandbox, two approved synthetic users, a temporary
non-private room, and deterministic media. Both headless clients obtained the
bounded host/speaker grants, connected, published deterministic audio/video,
and subscribed in both directions before the reviewed reconnect simulation
timed out waiting for the first reconnect event. Cleanup removed the temporary
synthetic room and memberships through the ordinary QA-user boundary. The installed
build did not enter the room because the existing Premium entitlement gate
remained in force; no right was changed. Therefore:

- the initial backend token/room/two-way-media seam was observed;
- background/foreground recovery is blocked by the reconnect timeout;
- installed LiveKit UX is blocked by the existing entitlement of the approved
  QA observer;
- no healthy-server result is represented as a full installed UX pass;
- a caller-labelled healthy run was not accepted as the bounded failure
  fixture.

The signed pinned-host research canaries attempted the React Native update,
public repository architecture/UX, and Android security lanes. TLS verified,
but the exact Caddy path returned 404. All three HMAC requests failed closed as
`RESEARCH_PINNED_TRANSPORT_REQUIRED`. The correct classification is
`LOCAL_ADVISORY_CANARY_BLOCKED`, not
`REMOTE_AUTONOMOUS_RESEARCH_ACTIVE`. Local pinned-transport tests passed
76/76, the Worker adapter passed 4/4, and authority parity passed 30/30. The
single external blocker is `PINNED_RESEARCH_HOST_EXTERNAL_ROUTE_INACTIVE`.

The repository-specific GitHub App evidence is:

- PR #32: App-created provider canary, draft and unmerged; branch/file/commit/
  push/draft creation passed; merge was denied by the protected ruleset and
  self-approval was denied.
- PR #33: test-only canary, draft and unmerged; only
  `scripts/test-haptic-tab-touch-target-canary.mjs`.
- PR #34: low-risk source canary, draft and unmerged; only
  `components/haptic-tab.tsx`; adds a 48dp minimum height.

The App has no workflow or release permission, is not a ruleset bypass actor,
and cannot satisfy the required human review. No force push, protected-branch
deletion, workflow write, release, merge, or deployment was authorized.
PRs #33 and #34 each passed all 13 required checks. This lane records:

`OWNER_ASSISTED_GITHUB_CANARIES_COMPLETE`

The five scheduler definitions passed the source suite 9/9 and a current-state
dry-run. All emitted `dispatchDecision=no_work`, created no child task, and
performed no remote mutation. Per-definition activation blockers are:

- `daily_non_personal_support_observability`:
  `PUBLIC_RESEARCH_MEMORY_REQUIRED`;
- `daily_platform_policy_security`:
  `FRESH_RESEARCH_CANARIES_REQUIRED`,
  `PUBLIC_RESEARCH_MEMORY_REQUIRED`;
- `weekly_architecture_dependency`:
  `FRESH_ARCHITECTURE_DEPENDENCY_EVIDENCE_REQUIRED`,
  `PUBLIC_RESEARCH_MEMORY_REQUIRED`;
- `weekly_experiment_outcome`:
  `GOVERNED_DRAFT_PR_CANARIES_REQUIRED`,
  `PUBLIC_RESEARCH_MEMORY_REQUIRED`;
- `weekly_ux_route_dead_control`:
  `INSTALLED_VISUAL_SENTINELS_REQUIRED`,
  `PUBLIC_RESEARCH_MEMORY_REQUIRED`.

The dry-run state is `SCHEDULE_DRY_RUN_READY`. The master switch and all five
definitions remain off. Blocked-noise policy is
`notify_on_blocker_digest_change_only`.

## Baseline and deferred evidence

The source-selected Option C baseline remains:

`SOURCE_BASELINE_SELECTED`

Hash:
`34007790b5b8a94eac209292971a54d4ddbdca543dca01a8b184227d1d660cba`

The authenticated remote state remains:

`REMOTE_BASELINE_APPROVAL_DEFERRED`

The constitution still has
`ownerApprovalVersion=null` and `approvedBaselineHash=null`. Local measurement
may compare dimensions, density, aspect ratio, spacing, creator identity, Live
state, accessibility, and route consistency. It may not emit an
approved-baseline finding.

The append-only sanitized manifest is
`config/intelligence/cognitive-level01-deferred-evidence-manifest-v1.json`.
It contains eleven entries covering Cloudflare readiness, Android traversal,
the Home touch target, GitHub draft canaries, Android lifecycle, installed
LiveKit gating, headless LiveKit recovery, pinned research, scheduler
dry-runs, the installed sign-out/sign-in journey, and process-scoped
crash/ANR observation. Raw XML, screenshots, tokens, room identifiers, account
identifiers, and private provider evidence stay outside Git.

`scripts/validate-cognitive-deferred-evidence-manifest.mjs` validates exact
entry shape, hash-only metrics, ordering, uniqueness, expiry, retention, and
mode truth. Its `--plan` mode emits deterministic `futureImportKey`
idempotency keys, preserves original observation time, keeps import time null,
uses conflict-as-no-op duplicate handling, and requires stale evidence to be
reevaluated. It does not connect to or mutate the remote database.

## Narrow unlock handoff

When, and only when, the provider confirms the `net` ACL change:

1. Re-read the `net` ACL and prove `PUBLIC` usage is absent.
2. Verify required trusted-role grants remain.
3. Run trusted-function regression.
4. Provision ten runtime passwords privately.
5. Create ten Hyperdrive configurations.
6. Bind each configuration to only its matching Worker.
7. Run cross-principal remote tests.
8. Reevaluate expired or stale deferred evidence and import eligible evidence
   through the reviewed isolated intake path.
9. Preserve original observation time and record a distinct import time.
10. Record authenticated Option C approval.
11. Enable eligible switches one at a time and run live canaries.
12. Enable only eligible schedules.

If Supabase refuses or requires Pro, do not upgrade automatically. Preserve
Owner-assisted mode and compare continued Free assisted operation, a separate
isolated PostgreSQL cognitive runtime, and Supabase Pro for cost, effort, risk,
and migration impact.

Enabled remote switches: `0`.

Enabled remote schedules: `0`.

iOS remains:

`IOS_TESTFLIGHT_DEVICE_PROOF_DEFERRED_TO_FINAL_GATE`

No iOS build or OTA was started.

## Explicit continuation attestation

- Work continued without waiting for Supabase administration.
- No Supabase or Cloudflare paid upgrade occurred.
- No runtime login password was provisioned while `PUBLIC` retained `net`
  usage.
- No Hyperdrive database credential was created.
- No remote autonomous switch or schedule was enabled.
- Owner-assisted inspection and draft fixes continued.
- All GitHub canaries remained draft and unmerged.
- No public release, OTA, or build occurred.
- No money, rights, platform/auth/Owner/staff roles, auth/RLS, moderation,
  ranking, or provider configuration/product mutation occurred. Temporary
  synthetic room-participant state existed only for the LiveKit canary and was
  removed through ordinary app-user permissions.
- User-derived memory remained off.
- Level 2 remained off.
- No secret or private evidence was committed.
- No generated `android/` or `ios/` directory was committed.
- `deno.lock` remained untracked and unstaged.

## Post-closeout plan-status amendment — 2026-07-25

This amendment records provider-plan truth after the original PR #35
closeout. It does not rewrite the historical attestation above: no paid
upgrade existed when that closeout completed.

- The Supabase organization was upgraded to Pro after the original closeout.
- Cloudflare remains on its existing plan with no plan change.
- Ticket `SU-431426` was updated to record the Pro organization status.
- The provider-admin response for removal of `PUBLIC USAGE` from the
  provider-owned `net` schema remains pending.
- Micro compute and the Dedicated Pooler may be enabled separately by the
  Owner. Those compute and pooling changes do not themselves change the
  `net` schema ACL.
- No cognitive runtime LOGIN password or password-bearing Hyperdrive database
  credential exists.

Current state remains:

`WAITING_FOR_SUPABASE_NET_SCHEMA_PROVIDER_ADMIN`

`OWNER_ASSISTED_ACTIVE`

`ISOLATED_AUTONOMOUS_PENDING`
