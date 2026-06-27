# One Attached Device Full App Automation Proof

One attached device full app automation proof: Closed / Partial / Blocked.

Verdict for this lane: Closed for one-device route/control traversal after seeded installed-login bridge repair, role rerun, and affected-only closure of the five remaining route-marker/control-proof blockers. Two-device realtime behavior remains a separate proof lane.

Realtime follow-up: `docs/release/TWENTY_FIVE_SEEDED_PARTICIPANTS_REALTIME_PROOF.md` is now Partial. It closes the 25 proof-only participant identity pack and proves LiveKit/chat-call media through authenticated RTC-node diagnostic sessions, but Watch-Party realtime callback proof remains Partial and full installed-app realtime UI proof still needs a second Play-internal v57 active client.

Seeded account installed login bridge is tracked in `docs/release/SEEDED_ACCOUNT_INSTALLED_LOGIN_BRIDGE.md`. The root cause of the prior installed login blocker was automation credential injection failure, not app email validation, password mismatch, or account-profile readiness for the non-restricted accounts. The harness now uses the secure local `MAESTRO_` environment bridge and keeps credential values only in ignored `.env.browserstack-monetization.local`.

Full seeded one-device role traversal rerun is tracked in `docs/release/FULL_SEEDED_ONE_DEVICE_ROLE_TRAVERSAL_RERUN.md`. The rerun used device `R5CR120QCBF`, the installed Google Play internal/closed testing package `com.chillywood.mobile`, installer `com.android.vending`, versionName `1.0.0`, versionCode `57`, and EAS update group `d7aac53c-65bb-4bf7-ae69-04bfea248e0a`. Stable seeded proof account pack: Closed before rerun. No service-role was used in this rerun. No accounts were created or recreated in this rerun. Signed-out route traversal passed; backend auth readback passed for normal, creator, moderator, admin/operator, owner, blocked A, blocked B, Premium, and non-Premium. Installed UI login passed for every non-restricted seeded proof account, and `proof_restricted_001` failed closed as expected. The five remaining route-marker/control-proof blockers were fixed and rerun in `docs/release/FIVE_REMAINING_ONE_DEVICE_TRAVERSAL_BLOCKERS.md` with affected-only artifact `/tmp/app-five-remaining-one-device-traversal-blockers-20260626-215343/`. Updated one-device route/control counts: Pass `80`, Human review `28`, Blocked `0`, Two-device required `4`, Fail `0`. Missing roles are not called passed. Two-device proof still required.

EAS update group under test: `d7aac53c-65bb-4bf7-ae69-04bfea248e0a`.
Status counts: Pass `80`, Human review `28`, Blocked `0`, Two-device required `4`, Fail `0`.

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

## Seeded Account Readiness Table

Stable seeded proof account pack: Closed.
stable seeded proof account pack anchor: Closed.

| Account label | Email key present? | Password key present? | Role/state expected | Backend readback | Installed UI login |
| --- | --- | --- | --- | --- | --- |
| signed-out | n/a | n/a | signed-out public routes | n/a | Pass |
| `proof_normal_001` | Yes | Yes | normal user | Pass | Pass |
| `proof_creator_001` | Yes | Yes | creator-ready profile/channel | Pass | Pass |
| `proof_moderator_001` | Yes | Yes | scoped Moderator | Pass | Pass |
| `proof_admin_operator_001` | Yes | Yes | scoped Admin/operator | Pass | Pass |
| `proof_owner_001` | Yes | Yes | proof Owner, not current First Owner | Pass | Pass |
| `proof_restricted_001` | Yes | Yes | restricted/suspended fail-closed | Blocked by account state | Pass: expected fail-closed |
| `proof_blocked_a_001` | Yes | Yes | blocked-user pair A | Pass | Pass |
| `proof_blocked_b_001` | Yes | Yes | blocked-user pair B | Pass | Pass |
| `proof_premium_001` | Yes | Yes | active test Premium entitlement | Pass | Pass |
| `proof_nonpremium_001` | Yes | Yes | no Premium entitlement | Pass | Pass |

## Flow Matrix

The complete flow matrix is stored at `/tmp/app-full-seeded-one-device-role-traversal-rerun-20260627012145/flow-matrix.md`.

## Pass / Fail / Blocked Summary

| Category | Count | Notes |
| --- | ---: | --- |
| Pass | 80 | Installed Play launch, signed-out routes, installed seeded login, supported route markers/taps, five affected route-marker closures, and restricted fail-closed checks. |
| Human review | 28 | Expected controls/test IDs were not visible in the Android hierarchy for the captured role/state; these are not called passed. |
| Blocked | 0 | Five prior route-marker/control-proof blockers are closed in `docs/release/FIVE_REMAINING_ONE_DEVICE_TRAVERSAL_BLOCKERS.md`. |
| Fail | 0 | No hard app crash, raw-leak failure, provider mutation, or unsafe money action was recorded. |
| Two-device required | 4 | True simultaneous live/chat/watch-party behavior remains outside one-device proof. |

## Two-Device Required Items

This one attached device proof can close single-device navigation, route/button/sheet/status behavior, and permission UI behavior only. Two-device proof still required for true two-device live video participant visibility, two-device chat call media, Watch-Party sync, and real multi-user simultaneous participant state. These are not falsely called closed by this one-device lane.

## Bugs Fixed

No app feature code was changed. Proof harness fixes were made only to:

- use the secure local `MAESTRO_` environment bridge for installed login;
- avoid command-line credential passing;
- expand the Settings Account section before logout attempts;
- preserve valid Android hierarchy XML while redacting real secrets;
- treat restricted login denial as expected fail-closed.
- use path-style app links such as `chillywoodmobile:///chat` for Expo Router route openings;
- assert normal `/admin` as expected denial/access-status behavior, not staff access;
- assert non-Premium creator Platform Studio, setup, and payout compatibility routes as active Premium-required setup/status gates.

## Proof Results

`npm run proof:one-attached-device-full-app-automation` validates this doc and the one-device proof summary. `npm run proof:full-seeded-one-device-role-traversal-rerun` validates the detailed rerun doc.

## Guard Results

`npm run guard:one-attached-device-full-app-policy` and `npm run guard:full-seeded-one-device-role-traversal-policy` guard against sideload, APK tester proof, destructive device actions, false role pass, false two-device closeout, provider mutation, money activation, First Owner mutation, and secret/private-data exposure.

## Artifact Paths

- `/tmp/app-full-seeded-one-device-role-traversal-rerun-20260627012145/`
- `/tmp/app-five-remaining-one-device-traversal-blockers-20260626-215343/`
- `/tmp/app-seeded-account-installed-login-bridge-YYYYMMDD-HHMMSS/`

## Safety Confirmation

- No service-role was used in this rerun.
- No accounts were created or recreated in this rerun.
- No seeded account passwords were modified.
- Current First Owner was not touched.
- No real users were modified.
- No auth bypass was added.
- No RLS/account-status gate weakening happened.
- No sideload was used.
- No APK install was used as tester proof.
- No uninstall/reinstall/clear-data happened.
- No cache wipe or device reset happened.
- No Play production submission happened.
- No provider dashboard mutation happened.
- No Google Play product/base-plan mutation happened.
- No RevenueCat mapping change happened.
- No Stripe mutation happened.
- No purchases were executed.
- No provider refunds were executed.
- liveMoneyEnabled remains OFF.
- Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF.
- Missing roles are not called passed.
- Dead visible controls are not accepted as final.

## Remaining Blockers

1. Review Human review selector misses from the Android hierarchy; they are not blockers for the five-item closure.
2. Run two-device live/watch-party/chat-call proof.

## Next Lane Recommendation

Two-device live/watch-party/chat-call proof for real-time flows.
