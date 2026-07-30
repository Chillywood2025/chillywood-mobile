# CURRENT STATE

Generated from `config/assurance/current-truth-v1.json`. Do not hand-edit.

- Main SHA observed at this assurance checkpoint: `268b15f3f23c444e083c1587f83f1a7ec9a9c802`.
- Latest merged implementation: PR #90, `5cc9b4fed9a5b4eccb6dd904681a2a1bbe83ba5d`; merge `016eb44be9856afbe16dc38a53d88721b1f2a38f`.
- Assurance program: PR-B-BLOCKED-AND-PR-C-SUCCESSOR-BINDING; completed: PR-A, CURRENT-TRUTH-SYNCHRONIZATION-PR-56, CURRENT-TRUTH-GUARD-CORRECTION-PR-58, CURRENT-TRUTH-SYNCHRONIZATION-PR-60, FEATURE-DOMAIN-SCOPE-GUARD-PR-62, CURRENT-TRUTH-SYNCHRONIZATION-PR-67, CURRENT-TRUTH-SYNCHRONIZATION-PR-86, CURRENT-TRUTH-HEAD-BINDING-PR-90, CURRENT-TRUTH-SYNCHRONIZATION-PR-97.
- Android internal: build 86, runtime `1.0.0-android-chat-call-action-v1`, channel `android-chat-livekit-qa`, update `e3379ac9-61f0-40db-a014-81975be123e5`.
- iOS internal: build 8, runtime `1.0.0-iosqa1`, channel `ios-qa`, update `019fb099-f7c3-7130-97aa-a4bb1c49792f`.
- Remote migration head: `20260730161737`.
- Enabled Cognitive switches: `cognitive_android_visual_sentinel`, `cognitive_ios_visual_sentinel`.
- Cognitive schedules: 0/5 enabled. Effective baseline count: 1.
- Cognitive LiveKit: 0 formal runs, 0 findings, 0 enabled switches.
- PUBLIC schema `net` USAGE: denied. User-derived memory: off. Level 2 repair: off.
- Chi'llywood autonomous app operating model is now documented and guarded at `docs/CHILLYWOOD_AUTONOMOUS_APP_OPERATING_MODEL.md`; Level 0/1 work does not require owner approval, while Level 3/4 boundaries do.
- Installed Product QA closure retained: chillywood-installed-qa-firebase-smoke.timer_daily_cost_capped; proof rows `ff81956d-94e3-49e9-8c80-fae2c12b0dd8`, `1dc00369-b5ca-4289-92bc-daf5bae00222`, `282fb154-101c-402b-9539-d3fb8080de51`; current matrix state `POLL_HTTP_FAILED`; the daily timer is enabled.
- RevenueCat provider readback is closed: dashboard TEST returned HTTP `200` / `test_received` with `premiumGranted=false`, `liveMoneyAction=false`, and `moneyMoved=false`.
- Evidence timestamp: `2026-07-30T20:49:00Z`; freshness deadline: `2026-07-31T20:49:00Z`; live provider readback: false.

## Open implementation PRs

- PR #52 at `2b7f9fa491180cb1f2b9a883c07b317eb39ae43a`: open-draft; reconcile-then-supersede-unmerged.
- PR #64 at `6fbb96f9502932bf4c0a83c32e71b0e621ca4187`: open-draft-frozen; run-four-fresh-exact-reviews-and-one-full-ci-after-this-sync.
- PR #69 at `a5a37296800419a50c9bb271d99e505f6ad7a056`: open-draft-blocked-internal; do-not-merge-forward-only-authority-correction-required.
- PR #70 at `6d05b2bd2e56695e76a7bcfb0890303bf768cb8e`: open-draft-blocked-internal; do-not-merge-final-source-cross-binding-correction-required.
- PR #75 at `bded4793b26e8e2e8bd2331df7f5b3fcc55f141b`: open-draft-blocked-internal; do-not-merge-null-auth-fail-closed-correction-required.

## Open review-only PRs

- PR #53 at `67d78b4bdaad3ddc02f90391d46a9e03c430bb0b`: open-draft-stale, reviews `e05c3e82a293a8836cd9f87a9b48059b2ae5421d`; never-merge.
- PR #55 at `aff39b454a53a09cd028c0d84d39e836f808e3d1`: open-draft-current, reviews `cc4d4582743cc7201785cdb784134663b4fd0e1b`; never-merge.
- PR #57 at `c4557aaea42db104050c9a0d4dc0458ea9f433d9`: open-draft-current, reviews `8308e0b34050735fd75efe6ff3415cde1f39144a`; never-merge.
- PR #59 at `919188a43823071498cbfe62a22fd31c633c0e02`: open-draft-current, reviews `b170c4ed99a9e2cc2b33b19fdf5e78b33f126157`; never-merge.
- PR #61 at `85a34c1d5c072364d53890c30956548b6be94558`: open-draft-current, reviews `3f4615f3584ede3c1159b64296231bca0b7e3e09`; never-merge.
- PR #65 at `096f35c44bb916edf41714ca3d6a7aa3d8410e35`: open-draft-current, reviews `08ca9b11b28677268f7db932086256645d29c794`; never-merge.
- PR #66 at `2ab51ce74a0ed80551407aab66b1d44192056120`: open-draft-current, reviews `08ca9b11b28677268f7db932086256645d29c794`; never-merge.
- PR #68 at `6ec5e3ada27cb7eb71125f1f668b615a22a84fba`: open-draft-current, reviews `9f88725268dbbbf4780570e71c2c6d640b443173`; never-merge.
- PR #71 at `34dc488b0d461d486c9e36c102aa5cc051f516d0`: open-draft-blocking, reviews `a5a37296800419a50c9bb271d99e505f6ad7a056`; never-merge.
- PR #72 at `56992ff76891088116b9bcf7d9ec1efb3c9c63e2`: open-draft-blocking, reviews `a5a37296800419a50c9bb271d99e505f6ad7a056`; never-merge.
- PR #73 at `05ae25604c83627272128c75bdeeb0d2d3436a05`: open-draft-blocking, reviews `a5a37296800419a50c9bb271d99e505f6ad7a056`; never-merge.
- PR #74 at `2b6e01177721a361c8b5bd790a05ef6efc19285d`: open-draft-blocking, reviews `6d05b2bd2e56695e76a7bcfb0890303bf768cb8e`; never-merge.
- PR #76 at `2979921987c6955905d71537ca37a07499a622c2`: open-draft-blocking, reviews `6d05b2bd2e56695e76a7bcfb0890303bf768cb8e`; never-merge.
- PR #77 at `0df8313c4f3652540b8ef3a7baba27804790aabe`: open-draft-blocking, reviews `bded4793b26e8e2e8bd2331df7f5b3fcc55f141b`; never-merge.
- PR #78 at `a7b15f08fc84d4f38c6ed4ebc8e7666e2ea9619d`: open-draft-blocking, reviews `bded4793b26e8e2e8bd2331df7f5b3fcc55f141b`; never-merge.
- PR #79 at `ce155bdd7a7cba093c7f67a9bd48c5c3b2577382`: open-draft-blocking, reviews `bded4793b26e8e2e8bd2331df7f5b3fcc55f141b`; never-merge.
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
- PR #99 at `0853a6e2fa6154b28c5f61bcc5055468debfd636`: open-draft-stale, reviews `00355bd94d5a7e401d424bc7a8298017c46357d8`; never-merge.
- PR #100 at `739a57db896369f1e1029e3ac45a715fb9bde23a`: open-draft-stale, reviews `00355bd94d5a7e401d424bc7a8298017c46357d8`; never-merge.
- PR #101 at `c8d0288feb9562ef91d43cfcb243df96638db8f8`: open-draft-stale, reviews `00355bd94d5a7e401d424bc7a8298017c46357d8`; never-merge.
- PR #102 at `332f1d5fbd757ab2c1412abea1a0fc6f13ddc67d`: open-draft-stale, reviews `00355bd94d5a7e401d424bc7a8298017c46357d8`; never-merge.

## Current external blockers

- Apple PushKit: BLOCKED_EXTERNAL — iOS terminated/background incoming-call physical delivery. Resume: Use a separately authorized current signed iOS artifact and physical device window; do not retry delivery in this program.

Historical proof belongs in Git history and scoped reports, not this hot path.
