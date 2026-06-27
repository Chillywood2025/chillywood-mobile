# Full Seeded One-Device Role Traversal Rerun

Full seeded one-device role traversal rerun: Closed / Partial / Blocked.

Verdict for this lane: Closed for one-device route/control traversal after the five affected blockers were fixed and rerun. Two-device realtime behavior remains a separate proof lane.

Realtime follow-up: `docs/release/TWENTY_FIVE_SEEDED_PARTICIPANTS_REALTIME_PROOF.md` is now Partial. It closes the 25 proof-only participant identity pack and proves LiveKit/chat-call media through authenticated RTC-node diagnostic sessions, but Watch-Party realtime callback proof remains Partial and full installed-app realtime UI proof still needs a second Play-internal v57 active client.

This rerun used one attached device, `R5CR120QCBF`, and only the installed Google Play internal/closed testing app. Installed package metadata was package `com.chillywood.mobile`, installer `com.android.vending`, versionName `1.0.0`, versionCode `57`. EAS update group under test: `d7aac53c-65bb-4bf7-ae69-04bfea248e0a`.

Installed Play metadata anchor: package `com.chillywood.mobile`, installer `com.android.vending`, versionName `1.0.0`, versionCode `57`.

Stable seeded proof account pack: Closed. Credential values remain stored only in ignored `.env.browserstack-monetization.local`. The stable seeded proof account pack was Closed before rerun, and all seeded account credential keys were present without printing values.

No service-role was used in this rerun. No accounts were created or recreated in this rerun. No seeded account passwords were modified. Current First Owner was not touched.

The harness now uses the secure local `MAESTRO_` environment bridge. The installed-login blocker was traced to automation credential injection failure: Maestro YAML used `${CHILLYWOOD_E2E_*}` placeholders without a secure environment bridge, so the installed app received bad literal/empty credentials and showed Login Error / Invalid login credentials even though backend auth readback passed. Secondary harness issues were also fixed: Settings logout preparation now expands the Account section, and XML redaction no longer corrupts Android hierarchy `password="false"` attributes.

The five remaining one-device traversal blockers were fixed and rerun in `docs/release/FIVE_REMAINING_ONE_DEVICE_TRAVERSAL_BLOCKERS.md`. Affected-only artifact: `/tmp/app-five-remaining-one-device-traversal-blockers-20260626-215343/`. The runner now opens Expo Router deep links with path-style URLs such as `chillywoodmobile:///chat`; normal `/admin` is asserted as expected denial/access-status behavior, not staff access; and non-Premium creator Platform Studio, creator monetization setup, and payout compatibility routes are asserted as active Premium-required setup/status gates. No service-role, account creation/recreation, sideload, uninstall/reinstall/clear-data, auth bypass, RLS/account-status weakening, provider mutation, purchase, refund, payout, or live settlement happened.

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

Status counts after affected-only closure: Pass `80`, Human review `28`, Blocked `0`, Two-device required `4`, Fail `0`.

| Role | Result |
| --- | --- |
| signed-out | Pass for launch, sign-out prep, login, forgot password, signup, legal/support, and signed-out Admin denial route. |
| normal | Installed login passed. Home, Explore, Settings, Support, Account Deletion, Chat, Watch-Party, Live Stage, Premium route markers, and normal `/admin` denial/access-status behavior passed. |
| creator | Installed login passed. Creator monetization, Watch-Party, Channel Subscription status, VIP, Premium routes, and the creator `/channel-studio`, `/creator-monetization-setup`, and `/payouts` compatibility/status gates passed for the non-Premium creator state. |
| moderator | Installed login passed. Scoped Admin route marker passed. Moderator did not gain Admin/Owner proof authority in this rerun, and broader seeded authority proof remains covered by the Owner/Admin/Moderator proof lane. Several tab/control selectors require Human review because the expected test IDs were not visible in the captured hierarchy. |
| admin/operator | Installed login passed. Admin Command Center, Admin Search input tap, Admin Money sandbox route, and Settings markers passed. Some tab selectors require Human review because expected test IDs were not visible in the captured hierarchy. |
| owner | Installed login passed. Owner/Admin route and Settings markers passed. Owner tab/security/staff selectors require Human review because expected test IDs were not visible in the captured hierarchy. Current First Owner was not touched. |
| restricted | Restricted expected fail-closed. Backend readback blocked with restricted account state, installed login did not grant private traversal, and private route traversal was recorded as Pass: fail-closed. |
| blocked pair | Installed login passed for both blocked proof accounts. Profile, chat, chat search tap, and Watch-Party single-device checks passed. True simultaneous pair behavior remains two-device proof. |
| Premium | Installed login passed. Premium, Watch-Party, and Live Stage route markers passed. Restore button selector requires Human review because expected test ID was not visible in the captured hierarchy. |
| non-Premium | Installed login passed. Premium and Watch-Party route markers passed. Purchase/restore/annual/ticket selectors require Human review because expected test IDs were not visible in the captured hierarchy. |

## Flow Matrix

The complete original flow matrix is in `/tmp/app-full-seeded-one-device-role-traversal-rerun-20260627012145/flow-matrix.md`. The affected-only closure matrix is in `/tmp/app-five-remaining-one-device-traversal-blockers-20260626-215343/flow-matrix.md`.

## Pass / Fail / Blocked Summary

| Category | Count | Notes |
| --- | ---: | --- |
| Pass | 80 | Installed Play launch, signed-out routes, seeded login bridge, role route markers, supported taps, five affected route-marker closures, and restricted fail-closed checks. |
| Human review | 28 | Expected test IDs or controls were not visible in Android hierarchy for the captured role/state; these are not called pass. |
| Blocked | 0 | The five prior blockers are closed in the affected-only rerun artifact. |
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

No one-device route-marker/control-proof blockers remain. The prior five items were closed as follows:

- `proof_normal_001` `/chat`: path-style deep link opened `chat-inbox-screen`, and `chat-search-input` tapped without crash/raw leakage.
- `proof_normal_001` `/admin`: normal user saw active denial/access-status copy; no Admin Command Center or staff data was exposed.
- `proof_creator_001` `/channel-studio`: non-Premium creator reached the active Premium-required Platform Studio status gate.
- `proof_creator_001` `/creator-monetization-setup`: legacy setup route reached the active Premium-required Platform Studio status gate.
- `proof_creator_001` `/payouts`: legacy payout route reached the active Premium-required Platform Studio status gate; no payout execution, payable balance, or provider mutation happened.

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
- treat `proof_restricted_001` as expected fail-closed instead of a proof-account readiness failure;
- use path-style app links such as `chillywoodmobile:///chat` for Expo Router route openings;
- assert normal `/admin` as expected denial/access-status behavior, not staff access;
- assert non-Premium creator `/channel-studio`, `/creator-monetization-setup`, and `/payouts` compatibility routes as active Premium-required setup/status gates.

## Proof Results

`npm run proof:full-seeded-one-device-role-traversal-rerun` validates this document, installed Play metadata, update group, stable account pack status, all required seeded labels, role coverage, flow matrix, status summary, two-device limitation, and safety wording.

## Guard Results

`npm run guard:full-seeded-one-device-role-traversal-policy` guards against service-role use, account creation/recreation claims, sideload, APK install proof, destructive device action, production submission, provider mutation, money activation, First Owner mutation, false role pass, false two-device closeout, command-line password injection, and secret/private-data exposure.

## Artifact Path

- `/tmp/app-full-seeded-one-device-role-traversal-rerun-20260627012145/`
- `/tmp/app-five-remaining-one-device-traversal-blockers-20260626-215343/`

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

1. Review the Human review control selectors that were not visible in the captured Android hierarchy; they are not blockers for this five-item closure.
2. Run two-device live/watch-party/chat-call proof for true simultaneous media/state behavior.

## Owner Action Items

1. Keep `.env.browserstack-monetization.local` local and ignored; it stores stable proof credentials for repeat use.
2. Do not paste seeded passwords into docs, artifacts, chat, or command lines.
3. Use the affected-only artifact as the closeout reference for the five route-marker/control-proof blockers.

## Next Lane Recommendation

Two-device live/watch-party/chat-call proof for real-time flows.
