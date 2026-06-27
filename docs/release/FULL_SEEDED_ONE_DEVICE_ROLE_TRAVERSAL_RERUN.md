# Full Seeded One-Device Role Traversal Rerun

Full seeded one-device role traversal rerun: Closed / Partial / Blocked.

Verdict for this lane: Partial.

This rerun used one attached device, `R5CR120QCBF`, and only the installed Google Play internal/closed testing app. Installed package metadata was package `com.chillywood.mobile`, installer `com.android.vending`, versionName `1.0.0`, versionCode `57`. EAS update group under test: `d7aac53c-65bb-4bf7-ae69-04bfea248e0a`.

Stable seeded proof account pack: Closed. The stable seeded proof account pack was Closed before rerun, and all seeded account credential keys were present without printing values.

No service-role was used in this rerun. No accounts were created or recreated in this rerun. No seeded account passwords were modified. Current First Owner was not touched.

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

| Account label | Role/state | Credential/readback status | Installed traversal status |
| --- | --- | --- | --- |
| signed-out | signed-out public routes | n/a | Pass for launch, login, signup, forgot password, legal/support, and signed-out Admin denial routes |
| `proof_normal_001` | normal | Backend auth readback Pass | Blocked: installed login showed app-side Login Error / Invalid login credentials |
| `proof_creator_001` | creator | Backend auth readback Pass | Blocked: installed login could not reach login field after prior app login error state |
| `proof_moderator_001` | moderator | Backend auth readback Pass | Blocked: installed login could not reach login field after prior app login error state |
| `proof_admin_operator_001` | admin/operator | Backend auth readback Pass | Blocked: installed login could not reach login field after prior app login error state |
| `proof_owner_001` | owner | Backend auth readback Pass | Blocked: installed login could not reach login field after prior app login error state |
| `proof_restricted_001` | restricted | Backend auth readback Blocked as restricted credential/login failed | Blocked: installed login blocked |
| `proof_blocked_a_001` | blocked pair A | Backend auth readback Pass | Blocked: installed login could not reach login field after prior app login error state |
| `proof_blocked_b_001` | blocked pair B | Backend auth readback Pass | Blocked: installed login could not reach login field after prior app login error state |
| `proof_premium_001` | Premium | Backend auth readback Pass | Blocked: installed login could not reach login field after prior app login error state |
| `proof_nonpremium_001` | non-Premium | Backend auth readback Pass | Blocked: installed login could not reach login field after prior app login error state |

Missing roles are not called passed.

## Automation Method

The rerun used normal device actions only: app launch, app force-stop/reopen for update pickup, app UI sign-out attempts, app UI sign-in attempts, deeplinks, taps, screenshots, log capture, Android hierarchy capture, and Maestro hierarchy fallback where Android `uiautomator dump` was killed by the device. No service-role, account bootstrap, APK install, sideload, uninstall, reinstall, clear-data, cache wipe, Play track change, or production submission happened.

The runner is `scripts/local-run-full-seeded-one-device-role-traversal-rerun.mjs`. It writes sanitized artifacts and does not print credential values. Maestro command-line secret passing was abandoned because it exposes secrets in the process list; the final recorded artifact uses redacted output and the lane remains Partial rather than forcing an unsafe credential path. The harness now blocks that path by default and requires explicit local opt-in before any Maestro command-line credential passing can run.

## Flow Matrix

| Role | Account label | Route/screen | Visible control | Expected outcome | Actual outcome | Status | Screenshot/log reference | Fix reference | Final result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| signed-out | signed-out | launcher | app launch | Installed Play internal app launches without fatal crash | No fatal crash marker found in captured launch log window | Pass | `/tmp/app-full-seeded-one-device-role-traversal-rerun-20260627000509/launch-logcat-redacted.txt` | none | Pass |
| signed-out | signed-out | `/login` | route open | Login screen visible | `auth-login-email-input` visible | Pass | `signed-out-login-initial.txt` | none | Pass |
| signed-out | signed-out | `/signup` | route open | Signup entry visible | Signup legal acceptance copy visible | Pass | `signed-out-signup-initial.txt` | none | Pass |
| signed-out | signed-out | `/forgot-password` | route open | Forgot password visible | Forgot password email input visible | Pass | `signed-out-forgot-password-initial.txt` | none | Pass |
| signed-out | signed-out | `/privacy` | route open | Privacy page visible | Privacy marker visible | Pass | `signed-out-privacy-initial.txt` | none | Pass |
| signed-out | signed-out | `/terms` | route open | Terms page visible | Terms marker visible | Pass | `signed-out-terms-initial.txt` | none | Pass |
| signed-out | signed-out | `/support` | route open | Support page visible | Support marker visible | Pass | `signed-out-support-initial.txt` | none | Pass |
| signed-out | signed-out | `/admin` | route open | Signed-out Admin route denial/access-required behavior | Login screen visible | Pass | `signed-out-admin-initial.txt` | none | Pass |
| normal | `proof_normal_001` | `/login` | `auth-login-submit-button` | Normal user signs in and reaches normal app | App-side Login Error / Invalid login credentials after installed login attempt, while backend auth readback passed | Blocked | `proof_normal_001-post-login.xml` | none | Blocked |
| creator | `proof_creator_001` | `/login` | `auth-login-submit-button` | Creator signs in and reaches creator routes | Login field was not reachable after prior app login error state, while backend auth readback passed | Blocked | `proof_creator_001-maestro-login-output.txt` | none | Blocked |
| moderator | `proof_moderator_001` | `/login` | `auth-login-submit-button` | Moderator signs in and reaches scoped moderation/support tools | Login field was not reachable after prior app login error state, while backend auth readback passed | Blocked | `proof_moderator_001-maestro-login-output.txt` | none | Blocked |
| admin/operator | `proof_admin_operator_001` | `/login` | `auth-login-submit-button` | Admin/operator signs in and reaches scoped Admin Command Center | Login field was not reachable after prior app login error state, while backend auth readback passed | Blocked | `proof_admin_operator_001-maestro-login-output.txt` | none | Blocked |
| owner | `proof_owner_001` | `/login` | `auth-login-submit-button` | Proof Owner signs in and reaches Owner/admin routes without touching First Owner | Login field was not reachable after prior app login error state, while backend auth readback passed | Blocked | `proof_owner_001-maestro-login-output.txt` | none | Blocked |
| restricted | `proof_restricted_001` | `/login` | `auth-login-submit-button` | Restricted account proves fail-closed behavior | Backend auth readback and installed login were blocked | Blocked | `proof_restricted_001-maestro-login-output.txt` | none | Blocked |
| blocked pair | `proof_blocked_a_001` / `proof_blocked_b_001` | profile/chat/live routes | blocked relationship checks | Block behavior proves profile/chat/live denial where supported | Simultaneous/pair behavior could not be fully proved because installed sign-in was blocked | Blocked | flow matrix artifact | none | Blocked |
| Premium | `proof_premium_001` | Premium routes | Premium status | Premium proof account reaches Premium-gated surfaces | Installed sign-in was blocked, backend auth readback passed | Blocked | `proof_premium_001-maestro-login-output.txt` | none | Blocked |
| non-Premium | `proof_nonpremium_001` | Premium routes | Premium gate/status | Non-Premium proof account reaches upgrade/status paths | Installed sign-in was blocked, backend auth readback passed | Blocked | `proof_nonpremium_001-maestro-login-output.txt` | none | Blocked |
| multi-user realtime | one-device limitation | live/chat/watch-party simultaneous behavior | simultaneous participant behavior | Prove realtime two-user behavior | Not fully provable on one attached device | Two-device required | n/a | none | Two-device required |

## Pass / Fail / Blocked Summary

| Status | Count |
| --- | ---: |
| Pass | 10 |
| Human review | 13 |
| Blocked | 10 |
| Two-device required | 4 |
| Fail | 0 |

No visible dead controls are accepted as final. Installed signed-out route traversal passed. Installed role traversal remains Partial because seeded role sign-in did not complete through the installed app, despite backend auth readback passing for every non-restricted proof account.

## Passed Flows

- Play-installed app launch with no fatal crash marker.
- Signed-out login route.
- Signed-out signup route.
- Signed-out forgot-password route.
- Signed-out privacy route.
- Signed-out terms route.
- Signed-out support route.
- Signed-out Admin route denial/access-required behavior.
- Stable seeded account backend auth readback for normal, creator, moderator, admin/operator, owner, blocked A, blocked B, Premium, and non-Premium.

## Failed Flows

No hard app crash or raw-leak failure was recorded. The rerun is Partial due Blocked installed sign-in flows, not because a role route passed incorrectly.

## Blocked Flows

- `proof_normal_001` installed sign-in showed Login Error / Invalid login credentials even though backend auth readback passed.
- Subsequent role sign-in attempts could not reach the login field after the app-side login error/transition state.
- `proof_restricted_001` backend auth readback failed as restricted and installed sign-in was blocked.
- Owner/Admin/Moderator installed role traversal was not closed through UI in this rerun.

## Two-Device Required Items

Two-device proof still required:

- two-device live video participant visibility;
- two-device chat call media;
- two-device Watch-Party sync;
- real multi-user simultaneous participant state.

## Bugs Fixed

No app feature code was changed in this lane. Proof harness fixes were made only to:

- add a dedicated local rerun runner;
- add Maestro hierarchy fallback after Android `uiautomator dump` returned status 137;
- block Maestro command-line proof credential passing by default after identifying the process-argument exposure risk;
- add proof/guard scripts for this rerun;
- keep credentials out of docs, artifacts, command output, and git.

## Proof Results

`npm run proof:full-seeded-one-device-role-traversal-rerun` validates this document, installed Play metadata, seeded account labels, role coverage, flow matrix, two-device limitation, and safety wording.

## Guard Results

`npm run guard:full-seeded-one-device-role-traversal-policy` guards against service-role use, account creation/recreation claims, sideload, APK install proof, destructive device action, production submission, provider mutation, money activation, First Owner mutation, false role pass, false two-device closeout, and secret/private-data exposure.

## Artifact Path

- `/tmp/app-full-seeded-one-device-role-traversal-rerun-20260627000509/`

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
- liveMoneyEnabled remains OFF.
- Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF.
- Missing roles are not called passed.
- Two-device proof still required for simultaneous realtime behavior.

## Remaining Blockers

- Installed seeded role login did not complete through the Play-installed app.
- Owner/Admin/Moderator role UI traversal remains blocked by installed sign-in state, even though account pack and backend auth readback are closed for those accounts.
- Restricted account remains blocked by design/credential state and needs a dedicated fail-closed installed proof path if owner wants UI traversal for a restricted account that can still authenticate.
- Two-device realtime proof remains required.

## Owner Action Items

- Decide whether to fix the installed app login path for proof accounts or provide an owner-approved non-secret login automation path that does not expose credentials in process args.
- After installed seeded role login is fixed, rerun only affected role flows.
- Run two-device live/watch-party/chat-call proof after one-device role traversal closes.

## Next Lane Recommendation

Fix the installed seeded login blocker, then rerun only affected role traversal flows.
