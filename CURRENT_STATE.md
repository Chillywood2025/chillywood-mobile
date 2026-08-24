# CURRENT STATE

Generated from `config/assurance/current-truth-v1.json`. Do not hand-edit.

- Protected authority checkpoint: `5e595e684f4dcc9454eee5065066e1b48d20e3eb` / tree `e89be3a2987952152560ebb46bdffcf0ea094028`.
- Protected-main advancement is evaluated dynamically from exact Git history; the runtime-observed protected main is derived at execution and is not committed as authority after every merge.
- Ordinary protected advancement invalidates only affected task evidence. Terminal task or authority transitions require canonical synchronization.
- Latest merged implementation: PR #229, `698871780a7610f677fdec1929d85389594d080a`; merge `5e595e684f4dcc9454eee5065066e1b48d20e3eb`.
- Structured task-lease binding: feature `auth-session-password-recovery`, PR #229, admitted seed `6c135fa4f09b41687f5f9607d92e237b4d400ad6` / `35abbae7d5ea1429ce768f72052602a6f63af6ca`, phase `PREIMPLEMENTATION_ENGINEERING_CLEAR`, execution `PRE_RELEASE_WAVE_1_IMPLEMENTATION_AUTHORIZED`. Current candidate `698871780a7610f677fdec1929d85389594d080a` / `e89be3a2987952152560ebb46bdffcf0ea094028` is a non-authoritative read-only observation; final receipt, review, Phase 1, and merge provenance bind the frozen final head.
- Finite task lease: `ASSURANCE_FINITE_TASK_LEASE_V1`, admitted seed `6c135fa4f09b41687f5f9607d92e237b4d400ad6` / `35abbae7d5ea1429ce768f72052602a6f63af6ca`, protected admission PR #233, state `ACTIVE_IMPLEMENTATION`; descendant heads do not require another admission, source binding, or merge-provenance PR.
- Review policy: provider Codex Review is `OPTIONAL_ADVISORY`, is not a required status check, does not block progress or merge, and may become blocking only after independent repository validation; all 13 Phase 1 checks and repository-owned exact-head review remain required.
- Assurance program display text: WHOLE_APP_PRE_RELEASE_ENGINEERING_CLOSURE; completed: PR-A, CURRENT-TRUTH-SYNCHRONIZATION-PR-56, CURRENT-TRUTH-GUARD-CORRECTION-PR-58, CURRENT-TRUTH-SYNCHRONIZATION-PR-60, FEATURE-DOMAIN-SCOPE-GUARD-PR-62, CURRENT-TRUTH-SYNCHRONIZATION-PR-67, CURRENT-TRUTH-SYNCHRONIZATION-PR-86, CURRENT-TRUTH-HEAD-BINDING-PR-90, CURRENT-TRUTH-SYNCHRONIZATION-PR-97, CURRENT-TRUTH-SYNCHRONIZATION-PR-103, CURRENT-TRUTH-SYNCHRONIZATION-PR-109, PR-C-MODELS-PR-64, MIGRATION-READBACK-METADATA-PR-113, CURRENT-TRUTH-SYNCHRONIZATION-PR-123, BASE-SYNC-HEAD-BINDING-PR-125, BASE-SYNC-FIRST-PARENT-DISTANCE-PR-127, DETERMINISTIC-COGNITIVE-DB-LOCK-ORDER-PR-129, PR-B0-CHAT-CALL-REMOTE-HISTORY-PR-116, CURRENT-TRUTH-SYNCHRONIZATION-PR-131, CURRENT-TRUTH-SYNCHRONIZATION-PR-132, CURRENT-TRUTH-SYNCHRONIZATION-PR-135, PR-B1-LIVEKIT-SOURCE-BINDING-PR-70, CURRENT-TRUTH-SYNCHRONIZATION-PR-137, PR-B2-REVENUECAT-TRANSFER-PR-69, CURRENT-TRUTH-SYNCHRONIZATION-PR-139, CURRENT-TRUTH-SYNCHRONIZATION-PR-140, PR-B3-ROOM-HOST-BLOCK-CHECK-PR-75, CURRENT-TRUTH-SYNCHRONIZATION-PR-142, PR-52-PR-53-SOURCE-COVERAGE-DISPOSITION, PR-D1-OFFLINE-NATIVE-PROVIDER-RUNTIME-ARTIFACT-PARITY-PR-143, CURRENT-TRUTH-SYNCHRONIZATION-PR-151, CURRENT-TRUTH-SYNCHRONIZATION-PR-156, CURRENT-TRUTH-SYNCHRONIZATION-PR-161, CURRENT-TRUTH-SYNCHRONIZATION-PR-162, PR-D2C-IOS-NATIVE-CALL-ROUTE-PROVENANCE-PR-152, BOOTSTRAP-IMAGE-SIZE-SAFE-DEPENDENCY-PR-170, D2B-CURRENT-TRUTH-BINDING-PR-169, D2B-CURRENT-TRUTH-CORRECTIONS-PR-175-PR-177-PR-179-PR-181, PR-D2B-ANDROID-NATIVE-ACTION-ORIGIN-BACKUP-PR-164, E0-CURRENT-TRUTH-BINDING-PR-190, PR-E0-ASSURANCE-EFFICIENCY-PR-185, D2A-MICROPHONE-CORRECTION-PR-194, ASSURANCE-CONTROL-A1-PR-201, ASSURANCE-CONTROL-A1-LATE-REVIEW-REGISTRY-PR-205, ASSURANCE-CONTROL-RULESET-READBACK-PR-207, ASSURANCE-CONTROL-PROOF-TIER-CORRECTION-PR-208, CODEX-SECURITY-SCAN-RELIABILITY-S0-PR-206, LIVEKIT-MIC-POST-MERGE-CORRECTION-PR-210, FINITE-TASK-LEASE-RUNTIME-CORRECTION-PR-218, PR-D2A-LEGACY-WEBRTC-CORRECTION-PR-214, BRACE-EXPANSION-VERSION-LINE-CORRECTION-PR-220, FINITE-TASK-TERMINAL-HANDOFF-PR-223, PR-D2A-NATIVE-LIFECYCLE-PR-212, TERMINAL-PROTECTED-BASE-RESOLUTION-PR-225, WHOLE-APP-ENGINEERING-DOCTRINE-PR-226, TYPED-TASK-CONTEXT-TERMINAL-SUCCESSOR-PR-227.
- Android internal: build 86, runtime `1.0.0-android-chat-call-action-v1`, channel `android-chat-livekit-qa`, update `e3379ac9-61f0-40db-a014-81975be123e5`.
- iOS internal: build 8, runtime `1.0.0-iosqa1`, channel `ios-qa`, update `019fb099-f7c3-7130-97aa-a4bb1c49792f`.
- Historical provider value only: remote migration head `20260730161737`; current provider proof is not claimed.
- Historical provider snapshot only: enabled Cognitive switches recorded as `cognitive_android_visual_sentinel`, `cognitive_ios_visual_sentinel`; no current switch proof is claimed.
- Historical provider snapshot only: Cognitive schedules recorded as 0/5 enabled; effective baseline count recorded as 1.
- Historical provider snapshot only: Cognitive LiveKit recorded 0 formal runs, 0 findings, and 0 enabled switches.
- Historical provider/safety snapshot only: PUBLIC schema `net` USAGE recorded as denied; user-derived memory recorded as off; Level 2 repair recorded as off. None is current provider proof.
- Chi'llywood autonomous app operating model is now documented and guarded at `docs/CHILLYWOOD_AUTONOMOUS_APP_OPERATING_MODEL.md`; Level 0/1 work does not require owner approval, while Level 3/4 boundaries do.
- Installed Product QA closure is retained as historical evidence only: chillywood-installed-qa-firebase-smoke.timer_daily_cost_capped; proof rows `ff81956d-94e3-49e9-8c80-fae2c12b0dd8`, `1dc00369-b5ca-4289-92bc-daf5bae00222`, `282fb154-101c-402b-9539-d3fb8080de51`; last recorded matrix state `POLL_HTTP_FAILED`. It is not fresh installed or physical proof.
- RevenueCat closure values are historical only, not current provider proof: dashboard TEST recorded HTTP `200` / `test_received` with `premiumGranted=false`, `liveMoneyAction=false`, and `moneyMoved=false`.
- Current freshness claims: `repository-task-lease-pre-release-wave1` (REPOSITORY_TASK_LEASE, expires `2036-08-11T18:43:16.000Z`), `repository-task-lease-d2a-release-critical` (REPOSITORY_TASK_LEASE, expires `2036-08-09T00:04:54.000Z`), `repository-source-s0-exact-closure-reuse-final` (REPOSITORY_SOURCE, expires `2026-08-12T04:34:00Z`).
- Blocked freshness claims: `repository-source-a1-exact-carrier-full-history` (REPOSITORY_SOURCE, STALE_BLOCKED, expired `2026-08-11T04:07:31Z`), `repository-source-a1-complete-late-sentinel-inventory` (REPOSITORY_SOURCE, STALE_BLOCKED, expired `2026-08-11T03:25:40Z`), `repository-source-a1-post-merge-control-readback` (REPOSITORY_SOURCE, STALE_BLOCKED, expired `2026-08-11T03:16:55Z`), `repository-source-a1-late-review-owner-registry-bootstrap` (REPOSITORY_SOURCE, STALE_BLOCKED, expired `2026-08-11T02:48:20Z`), `repository-source-a1-assurance-control-final` (REPOSITORY_SOURCE, STALE_BLOCKED, expired `2026-08-11T02:37:45Z`), `provider-critical-b3-linked-readback` (PROVIDER_CRITICAL, STALE_BLOCKED, expired `2026-08-02T14:00:44Z`).
- Internally validated historical review sentinels: PR #195 reviewed `605039a1eec08e153f33380a2998ee1c4cef2a90` after merge with 3 unresolved findings; successor `codex/assurance-active-task-and-claim-freshness-a1`; PR #194 reviewed `c15a58039b67d65eabdcaa03a9422ebc8d6dd95e` after merge with 5 unresolved findings; successor `codex/d2a-livekit-mic-post-merge-review-correction`. Only protected-main registered finding sets block post-merge completion claims, unrelated successor work, release, and proof-tier promotion; unvalidated Codex commentary remains advisory triage.
- Document rendered at `2026-08-14T07:14:48Z`; document deadline `2026-08-13T18:46:27Z` is diagnostic only and grants no universal implementation authority. Claim-scoped freshness remains mandatory. Derived live provider readback: false.

## Engineering doctrine

- `WHOLE_APP_ENGINEERING_BEFORE_IMPLEMENTATION_DOCTRINE_V1` is `ACTIVE`; bounded definition `BOUND_COMPLETE_SOURCE_ONLY`.
- Graph `accaddf9c51ee6f8190cb1921cbf0ec3c992d3c4a0011afd8c34b2327b3d6b9d`; active packet `3843b22577a2230d5db5b712c1311487528af3698d938ef57e8185d2615d0591`; task lease `NO_ACTIVE_TASK`.
- Next permitted action: `WHOLE_APP_PRE_RELEASE_ENGINEERING_CLOSURE`. No domain readiness entry is a universal app-completion claim.

## Typed task-context architecture

- Contract `TYPED_TASK_CONTEXT_AND_TERMINAL_TRUTH_SUCCESSOR_V1`; architecture PR #243, source `5e44d1fd2a84f51b322eb40ca147c0882d1d664f` / `e1f6c2f2455bcf4dad747261e0b6e10ab7619dbc`, merge `f74a6d53948a37fc35ef3dbb87e3741ede5c8d76`.
- Pending terminal transitions: PR #243=`CONSUMED_BY_THIS_TERMINAL_TRUTH`; count after synchronization `0`.
- Product, provider, build, submission, OTA, and public-release authority remain closed.

## Pre-admission engineering seed capability

- Contract `OWNER_PRE_ADMISSION_ENGINEERING_SEED_V1` is `ACTIVE`; product mutation is `false` until finite lease admission through `FINITE_TASK_ADMISSION_TO_CLEARANCE_V1`.
- Static PR binding, source-binding PR, and provenance PR are not required. Immediate next action: `IMPLEMENT_PRE_RELEASE_WAVE_1_IDENTITY_ENTITLEMENT_AUTHORITY`.

## Finite-task admission-to-clearance capability

- Contract `FINITE_TASK_ADMISSION_TO_CLEARANCE_V1` is `ACTIVE`; admission and computed clearance share one protected transition: `true`.
- Product mutation before admission merge is `false`; a post-admission clearance PR is required: `false`. Source descendants retain the finite lease: `true`.

## Task-local governing-edge closure capability

- Contract `TASK_LOCAL_GOVERNING_EDGE_CLOSURE_V1` is `ACTIVE`; the baseline graph remains immutable: `true`.
- Task-local evidence requires independent verification: `true`; static edge allowlists and exclusion combinations are not required. Product mutation before admission remains `false`.

## Owner jurisdiction policy capability

- Contract `OWNER_JURISDICTION_CANONICAL_MODEL_V2` is `ACTIVE`; standing policy may be reused: `true`; domain coverage may be reused: `false`. Every task must enumerate exact domains: `true`.
- Legacy receipts retain their original semantics. External proof is never inherited, operational ownership is preserved, and this capability grants no product, provider, database-deployment, build, submission, OTA, or public-release authority.
- Current immutable policy source: comment #5296932596, standing-policy hash `16772f5aa32d6c2ba4d8a465ae447519ab5ff7219882ddcd614176410bcc817f`, status `ACTIVE_UNTIL_OWNER_SUPERSESSION_OR_REVOCATION`; task binding `d636937b9d63e21e51079ce0b3171fe3e57eea6fab2fe65919fb2d0f3a87efad` covers `9/9` exact domains.

## Assurance receipt lifecycle

- Contract `ASSURANCE_RECEIPT_LIFECYCLE_V2`; Owner task authorization survives exact in-scope descendants: `true`.
- Final-source attestation is required during development/self-host/review/Phase 1: `false`/`false`/`false`/`false`; it is issued after review and Phase 1 and required for merge. Historical invalid attestations are non-blocking when exactly one valid current attestation exists.

## Finite-task test-adaptation overlay

- Capability `FINITE_TASK_TEST_ADAPTATION_OVERLAY_V1` permits at most one immutable Owner receipt for one exact pre-existing fixture path and `500` fixture-only canonical changed lines.
- The implementation reservation remains independent; budget pooling, wildcard paths, product mutation, provider mutation, database deployment, build, submission, OTA, and public-release authority remain forbidden.

## Open implementation PRs

- None.

## Open review-only PRs

- PR #55 at `aff39b454a53a09cd028c0d84d39e836f808e3d1`: open-draft-current, reviews `cc4d4582743cc7201785cdb784134663b4fd0e1b`; never-merge.
- PR #57 at `c4557aaea42db104050c9a0d4dc0458ea9f433d9`: open-draft-current, reviews `8308e0b34050735fd75efe6ff3415cde1f39144a`; never-merge.
- PR #59 at `919188a43823071498cbfe62a22fd31c633c0e02`: open-draft-current, reviews `b170c4ed99a9e2cc2b33b19fdf5e78b33f126157`; never-merge.
- PR #61 at `85a34c1d5c072364d53890c30956548b6be94558`: open-draft-current, reviews `3f4615f3584ede3c1159b64296231bca0b7e3e09`; never-merge.
- PR #65 at `096f35c44bb916edf41714ca3d6a7aa3d8410e35`: open-draft-current, reviews `08ca9b11b28677268f7db932086256645d29c794`; never-merge.
- PR #66 at `2ab51ce74a0ed80551407aab66b1d44192056120`: open-draft-current, reviews `08ca9b11b28677268f7db932086256645d29c794`; never-merge.
- PR #68 at `6ec5e3ada27cb7eb71125f1f668b615a22a84fba`: open-draft-current, reviews `9f88725268dbbbf4780570e71c2c6d640b443173`; never-merge.
- PR #80 at `88febcee666b6a7ce003f8bbbd7e5ae21a8be16c`: open-draft-stale, reviews `179bb58089e5ae6500c23a63f899c0edf0906f86`; never-merge.
- PR #81 at `440ef729441f37a8ac6ad4ba828dca37c8584063`: open-draft-stale, reviews `179bb58089e5ae6500c23a63f899c0edf0906f86`; never-merge.
- PR #82 at `893d1615c2b42bc53273702b9175adaee5d15be8`: open-draft-stale, reviews `179bb58089e5ae6500c23a63f899c0edf0906f86`; never-merge.
- PR #83 at `7691073af7d2906702fe1b8e2a21e6a381967451`: open-draft-stale, reviews `01ad30e4e0143cc4586b6d1be93c650ed753fd38`; never-merge.
- PR #84 at `3718a57235d77bcb9456e0a1d3d73d7faac7a553`: open-draft-stale, reviews `01ad30e4e0143cc4586b6d1be93c650ed753fd38`; never-merge.
- PR #85 at `4c09735a9c548a5e0b5a7812f89bcb6094f45692`: open-draft-stale, reviews `01ad30e4e0143cc4586b6d1be93c650ed753fd38`; never-merge.
- PR #87 at `dd0a48c25b33fa0a420ba3ac92501ccaad2be8ae`: open-draft-current, reviews `90b65335e4b080daf5053a54d14e47c7b857c65c`; never-merge.
- PR #88 at `da9c1a92e59116b7b9fa858fa67cec67297686b0`: open-draft-stale, reviews `deabe3d7a89bfa3ca01ef5b8475c6577b35355a6`; never-merge.
- PR #89 at `e8bba00144fa599caa2a20f9c0774b26402d7fc6`: open-draft-stale, reviews `deabe3d7a89bfa3ca01ef5b8475c6577b35355a6`; never-merge.
- PR #91 at `7dd7259fc2106f74c9a42e6ea60bea9b017fc871`: open-draft-stale, reviews `ac8393d2b99d8f1145adfd2d39757cb78ae4d10e`; never-merge.
- PR #92 at `e8d97a6966f3b4a313914ad994f58755eccc1aba`: open-draft-stale, reviews `ac8393d2b99d8f1145adfd2d39757cb78ae4d10e`; never-merge.
- PR #93 at `e248724d042bf60d7efe8d11b7f624dcc49e2432`: open-draft-stale, reviews `66d024103a2791160214f4d03e7db5c67b7073fa`; never-merge.
- PR #94 at `9817e2687903a4be025a4b782c3e729600127fd1`: open-draft-stale, reviews `66d024103a2791160214f4d03e7db5c67b7073fa`; never-merge.
- PR #95 at `3e8f5b64d5f2de459b4dc7c986843669cc1abe86`: open-draft-current, reviews `5cc9b4fed9a5b4eccb6dd904681a2a1bbe83ba5d`; never-merge.
- PR #96 at `efc44e7b98051a4c5558488f11022d16191a91d3`: open-draft-current, reviews `5cc9b4fed9a5b4eccb6dd904681a2a1bbe83ba5d`; never-merge.
- PR #98 at `278eb5e2326d2a7b7d12b6ba8b373541640d4e90`: open-draft-current, reviews `867af2a2c446c4cea5b38cc990bd0143dac446c3`; never-merge.
- PR #104 at `a8f689702e83fab1b5c85119d9d638f8bfabda3b`: open-draft-current, reviews `2cf85211ca8f832bd929619423a04fb52dce275e`; never-merge.
- PR #110 at `d43b460cc2f82cb296668117a0bf73648dacd701`: open-draft-current, reviews `502f9e2659d96389ae418b11f83171b171b5a708`; never-merge.

## Current external blockers

- Apple PushKit: BLOCKED_EXTERNAL — iOS terminated/background incoming-call physical delivery. Resume: Use a separately authorized current signed iOS artifact and physical device window; do not retry delivery in this program.

Historical proof belongs in Git history and scoped reports, not this hot path.
