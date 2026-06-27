# Full Seeded One-Device Role Traversal Rerun

Full seeded one-device role traversal rerun: Closed / Partial / Blocked.

Verdict for this lane: Partial.

This rerun used one attached device, `R5CR120QCBF`, and only the installed Google Play internal/closed testing app. Installed package metadata was package `com.chillywood.mobile`, installer `com.android.vending`, versionName `1.0.0`, versionCode `57`. EAS update group under test: `d7aac53c-65bb-4bf7-ae69-04bfea248e0a`.

Installed Play metadata anchor: package `com.chillywood.mobile`, installer `com.android.vending`, versionName `1.0.0`, versionCode `57`.

Stable seeded proof account pack: Closed. Credential values remain stored only in ignored `.env.browserstack-monetization.local`. The stable seeded proof account pack was Closed before rerun, and all seeded account credential keys were present without printing values.

No service-role was used in this rerun. No accounts were created or recreated in this rerun. No seeded account passwords were modified. Current First Owner was not touched.

The harness now uses the secure local `MAESTRO_` environment bridge. The installed-login blocker was traced to automation credential injection failure: Maestro YAML used `${CHILLYWOOD_E2E_*}` placeholders without a secure environment bridge, so the installed app received bad literal/empty credentials and showed Login Error / Invalid login credentials even though backend auth readback passed. Secondary harness issues were also fixed: Settings logout preparation now expands the Account section, and XML redaction no longer corrupts Android hierarchy `password="false"` attributes.

## Device / Install Metadata

| Field | Result |
| --- | --- |
| Device | `R5CR120QCBF` |
| Installed source | Google Play internal/closed testing |
| Package | `com.chillywood.mobile` |
| Installer | `com.android.vending` |
| Version | `1.0.0` |
| versionCode | `57` |
| EAS update group | `d7aac53c-65bb-4bf7-ae69-04bfea248e0a` |
| Sideload | No sideload was used |
| APK install | No APK install was used as tester proof |
| Destructive device action | No uninstall/reinstall/clear-data happened |

## Seeded Account Pack Status

| Account label | Role/state | Credential/readback status | Installed login status |
| --- | --- | --- | --- |
| signed-out | signed-out public routes | n/a | Pass |
| `proof_normal_001` | normal | Backend auth readback Pass | Pass |
| `proof_creator_001` | creator | Backend auth readback Pass | Pass |
| `proof_moderator_001` | moderator | Backend auth readback Pass | Pass |
| `proof_admin_operator_001` | admin/operator | Backend auth readback Pass | Pass |
| `proof_owner_001` | owner | Backend auth readback Pass | Pass |
| `proof_restricted_001` | restricted | Backend auth readback Blocked by account state | Pass: expected fail-closed |
| `proof_blocked_a_001` | blocked pair A | Backend auth readback Pass | Pass |
| `proof_blocked_b_001` | blocked pair B | Backend auth readback Pass | Pass |
| `proof_premium_001` | Premium | Backend auth readback Pass | Pass |
| `proof_nonpremium_001` | non-Premium | Backend auth readback Pass | Pass |

Missing roles are not called passed.

## Role Traversal Summary

Roles tested: signed-out, normal, creator, moderator, admin/operator, owner, restricted, blocked pair, Premium, and non-Premium.

Status counts: Pass `75`, Human review `28`, Blocked `5`, Two-device required `4`, Fail `0`.

| Role | Result |
| --- | --- |
| signed-out | Pass for launch, sign-out prep, login, forgot password, signup, legal/support, and signed-out Admin denial route. |
| normal | Installed login passed. Home, Explore, Settings, Support, Account Deletion, Watch-Party, Live Stage, and Premium route markers passed. `/chat` and `/admin` route markers remained Blocked and need targeted route-marker/denial-copy follow-up. |
| creator | Installed login passed. Creator monetization, Watch-Party, Channel Subscription status, VIP, and Premium routes passed. `/channel-studio`, `/creator-monetization-setup`, and `/payouts` route markers remained Blocked and need targeted creator route-marker/status-copy follow-up. |
| moderator | Installed login passed. Scoped Admin route marker passed. Moderator did not gain Admin/Owner proof authority in this rerun, and broader seeded authority proof remains covered by the Owner/Admin/Moderator proof lane. Several tab/control selectors require Human review because the expected test IDs were not visible in the captured hierarchy. |
| admin/operator | Installed login passed. Admin Command Center, Admin Search input tap, Admin Money sandbox route, and Settings markers passed. Some tab selectors require Human review because expected test IDs were not visible in the captured hierarchy. |
| owner | Installed login passed. Owner/Admin route and Settings markers passed. Owner tab/security/staff selectors require Human review because expected test IDs were not visible in the captured hierarchy. Current First Owner was not touched. |
| restricted | Restricted expected fail-closed. Backend readback blocked with restricted account state, installed login did not grant private traversal, and private route traversal was recorded as Pass: fail-closed. |
| blocked pair | Installed login passed for both blocked proof accounts. Profile, chat, chat search tap, and Watch-Party single-device checks passed. True simultaneous pair behavior remains two-device proof. |
| Premium | Installed login passed. Premium, Watch-Party, and Live Stage route markers passed. Restore button selector requires Human review because expected test ID was not visible in the captured hierarchy. |
| non-Premium | Installed login passed. Premium and Watch-Party route markers passed. Purchase/restore/annual/ticket selectors require Human review because expected test IDs were not visible in the captured hierarchy. |

## Flow Matrix

The complete flow matrix is in `/tmp/app-full-seeded-one-device-role-traversal-rerun-20260627012145/flow-matrix.md`.

## Pass / Fail / Blocked Summary

| Category | Count | Notes |
| --- | ---: | --- |
| Pass | 75 | Installed Play launch, signed-out routes, seeded login bridge, role route markers, supported taps, and restricted fail-closed checks. |
| Human review | 28 | Expected test IDs or controls were not visible in Android hierarchy for the captured role/state; these are not called pass. |
| Blocked | 5 | Normal `/chat`, normal `/admin`, creator `/channel-studio`, creator `/creator-monetization-setup`, creator `/payouts`. |
| Fail | 0 | No hard app crash, raw-leak failure, provider mutation, or unsafe money action was recorded. |
| Two-device required | 4 | True simultaneous realtime behavior remains outside one-device proof. |

## Passed Flows

- Installed Play internal app launch with no fatal crash marker.
- Signed-out launch, login, signup, forgot-password, privacy, terms, support, and Admin denial.
- Installed UI login for `proof_normal_001`, `proof_creator_001`, `proof_moderator_001`, `proof_admin_operator_001`, `proof_owner_001`, `proof_blocked_a_001`, `proof_blocked_b_001`, `proof_premium_001`, and `proof_nonpremium_001`.
- Restricted proof account failed closed instead of gaining private traversal.
- Owner/Admin/Moderator proof accounts reached their scoped installed route markers without touching current First Owner.
- Admin/operator reached Admin Search input and Admin Money sandbox readback/status surface without money settlement.
- Blocked A/B single-device profile/chat/watch-party route checks passed where one-device proof can observe them.
- Premium and non-Premium Premium/status routes loaded without opening purchase sheets.

## Failed Flows

No hard Fail rows were recorded.

## Blocked Flows

- `proof_normal_001` `/chat`: expected `chat-inbox-screen` marker was not visible.
- `proof_normal_001` `/admin`: expected `not authorized` marker was not visible.
- `proof_creator_001` `/channel-studio`: expected `Channel` marker was not visible.
- `proof_creator_001` `/creator-monetization-setup`: expected `monetization` marker was not visible.
- `proof_creator_001` `/payouts`: expected `payout` marker was not visible.

These are route-marker/control-proof blockers, not credential blockers. Installed UI login is no longer the blocker for non-restricted proof accounts.

## Two-Device Required Items

Two-device proof still required:

- two-device live video participant visibility;
- two-device chat call media;
- two-device Watch-Party sync;
- real multi-user simultaneous participant state.

These are not falsely called closed by this one-device lane.

## Bugs Fixed

No app feature code was changed. Proof harness fixes were made only to:

- pass seeded login values to Maestro through the local process environment with `MAESTRO_CHILLYWOOD_LOGIN_EMAIL` and `MAESTRO_CHILLYWOOD_LOGIN_PASSWORD`;
- keep command-line credential passing out of the process list;
- expand the Settings Account section before logout attempts;
- stop redacting Android XML `password="false"` attributes into malformed hierarchy output;
- treat `proof_restricted_001` as expected fail-closed instead of a proof-account readiness failure.

## Proof Results

`npm run proof:full-seeded-one-device-role-traversal-rerun` validates this document, installed Play metadata, update group, stable account pack status, all required seeded labels, role coverage, flow matrix, status summary, two-device limitation, and safety wording.

## Guard Results

`npm run guard:full-seeded-one-device-role-traversal-policy` guards against service-role use, account creation/recreation claims, sideload, APK install proof, destructive device action, production submission, provider mutation, money activation, First Owner mutation, false role pass, false two-device closeout, command-line password injection, and secret/private-data exposure.

## Artifact Path

- `/tmp/app-full-seeded-one-device-role-traversal-rerun-20260627012145/`

The artifact includes device/install metadata, seeded account pack status without passwords, role traversal command logs, flow matrix, screenshots/logs, blockers, proof output, guard output, validation output, safety confirmation, and secret scan result. It does not include passwords, service-role keys, tokens, provider secrets, signed URLs, raw storage paths, raw IPs, private messages, private evidence, tax IDs, bank details, or provider transaction/customer/order records.

## Safety Confirmation

- No service-role was used in this rerun.
- No accounts were created or recreated in this rerun.
- No seeded account passwords were modified.
- Current First Owner was not touched.
- No real users were modified.
- No sideload was used.
- No APK install was used as tester proof.
- No uninstall/reinstall/clear-data happened.
- No cache wipe, device reset, Play track change, or Play production submission happened.
- No Play production submission happened.
- No provider dashboard mutation happened.
- No Google Play product/base-plan mutation happened.
- No RevenueCat mapping change happened.
- No Stripe mutation happened.
- No purchases were executed.
- No provider refunds were executed.
- No auth bypass was added.
- No RLS/account-status gate weakening happened.
- liveMoneyEnabled remains OFF.
- Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF.
- Missing roles are not called passed.
- Two-device proof still required for simultaneous realtime behavior.

## Remaining Blockers

1. Fix or retest the five blocked route-marker/control-proof items listed above.
2. Review the Human review control selectors that were not visible in the captured Android hierarchy.
3. Run two-device live/watch-party/chat-call proof for true simultaneous media/state behavior.

## Owner Action Items

1. Keep `.env.browserstack-monetization.local` local and ignored; it stores stable proof credentials for repeat use.
2. Do not paste seeded passwords into docs, artifacts, chat, or command lines.
3. After targeted route-marker/control fixes, rerun only affected role flows.

## Next Lane Recommendation

Fix remaining route-marker/control blockers, then rerun only affected role traversal flows. After one-device route/control blockers close, run two-device live/watch-party/chat-call proof.
