# One Attached Device Full App Automation Proof

One attached device full app automation proof: Closed / Partial / Blocked.

Verdict for this lane: Partial.

This lane used the installed Google Play internal/closed testing app only. No sideload was used. No APK install was used. No uninstall/reinstall/clear-data happened. No cache wipe, device reset, Play track change, Play production submission, or provider mutation happened.

The one attached device was `R5CR120QCBF` (`samsung SM-N986U1`, Android 11). Installed package metadata was verified as package `com.chillywood.mobile`, installer `com.android.vending`, versionName `1.0.0`, versionCode `57`, first install time `2026-06-26 01:26:01`, and last update time `2026-06-26 01:26:01`.

EAS update group under test: `d7aac53c-65bb-4bf7-ae69-04bfea248e0a`. Android update ID under test: `019f0533-920e-7fca-8f45-74b1f538040a`. Update uptake could not be read directly in-app, so uptake is inferred from the delivered branch/runtime and visible behavior. No fake update readback is claimed.

## Automation Method

Automation used the existing installed Play app on one attached Android device. ADB was used only for non-destructive close/reopen, launch, package metadata readback, screenshots, log tails, and Android VIEW intents. Maestro `2.3.0` was used with `--device R5CR120QCBF`, `--no-reinstall-driver`, and `clearState: false` for signed-out visible-surface checks. No target app reinstall or data reset was performed.

The app was safely force-closed and reopened to prompt EAS Update pickup. Launch screenshot and log tail were captured in `/tmp/app-one-attached-device-full-app-automation-20260626-152847/`. No fatal crash appeared in the captured launch log window.

## Seeded Account Readiness Table

| Account label | Email key present? | Password key present? | Role/state expected | Backend role/permission expected | Entitlement/state expected | Account status | Usable for automation? | Blocker reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| signed-out | n/a | n/a | signed-out public routes | none | none | available on device | Yes | none |
| `proof_normal_001` | No | No | normal user | no staff/admin/creator-only privileges | normal signed-in | missing credential pack | No | Blocked: missing seeded proof credential |
| `proof_creator_001` | No | No | creator | creator-ready profile/channel state | creator Platform, uploads, pricing/status | missing credential pack | No | Blocked: missing seeded proof credential |
| `proof_moderator_001` | Yes | Yes | Moderator | exact-scope moderation/support only | no money/live authority | local credentials present | Partial | Full traversal deferred to existing seeded authority proof; do not print credentials |
| `proof_admin_operator_001` | Yes | Yes | Admin/operator | exact-scope Admin tools | no Owner/First Owner authority | local credentials present | Partial | Full traversal deferred to existing seeded authority proof; do not print credentials |
| `proof_owner_001` | Yes | Yes | Owner proof account | Owner/staff/security/status surfaces safely | not current real First Owner | local credentials present | Partial | Full traversal deferred to existing seeded authority proof; current First Owner not touched |
| `proof_restricted_001` | No | No | restricted/suspended/disabled fail-closed | restricted account state | denied private/creator/live/chat/admin flows | missing credential pack | No | Blocked: missing seeded proof credential |
| `proof_blocked_a_001` | No | No | blocked-user pair A | block relationship participant | block state | missing credential pack | No | Blocked: missing seeded proof credential |
| `proof_blocked_b_001` | No | No | blocked-user pair B | block relationship participant | block state | missing credential pack | No | Blocked: missing seeded proof credential |
| `proof_premium_001` | No | No | Premium-entitled proof user | normal user | Premium-entitled/test entitlement state | missing credential pack | No | Blocked: missing seeded proof credential |
| `proof_nonpremium_001` | No | No | non-Premium proof user | normal user | non-Premium state | missing credential pack | No | Blocked: missing seeded proof credential |

No service-role bootstrap was used. Service-role bootstrap may only be used after explicit owner approval and only for proof account creation, not as proof of role/permission authority. The real backed Owner RPC staff grant path remains the role/permission authority proof path and is validated separately by `npm run proof:owner-rpc-staff-grant-path`.

## Role Account Status

| Role | Status |
| --- | --- |
| signed-out | Tested on attached Play-installed device. |
| normal user | Blocked: missing `CHILLYWOOD_E2E_NORMAL_EMAIL` and `CHILLYWOOD_E2E_NORMAL_PASSWORD`. |
| creator | Blocked: missing `CHILLYWOOD_E2E_CREATOR_EMAIL` and `CHILLYWOOD_E2E_CREATOR_PASSWORD`. |
| moderator | Credential keys present; role boundary remains covered by the seeded Owner/Admin/Moderator proof. |
| admin/operator | Credential keys present; role boundary remains covered by the seeded Owner/Admin/Moderator proof. |
| owner | Credential keys present; current real First Owner was not used or touched. |
| restricted | Blocked: missing `CHILLYWOOD_E2E_RESTRICTED_EMAIL` and `CHILLYWOOD_E2E_RESTRICTED_PASSWORD`. |
| blocked pair | Blocked: missing blocked A/B credential keys. |
| Premium | Blocked: missing `CHILLYWOOD_E2E_PREMIUM_EMAIL` and `CHILLYWOOD_E2E_PREMIUM_PASSWORD`. |
| non-Premium | Blocked: missing `CHILLYWOOD_E2E_NONPREMIUM_EMAIL` and `CHILLYWOOD_E2E_NONPREMIUM_PASSWORD`. |

## Flow Matrix

| Role | Account label | Route/screen | Visible control | Expected outcome | Actual outcome | Status | Screenshot/log reference | Fix reference | Final result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| signed-out | signed-out | launch/login | app launch | Open installed Play app without fatal crash | Package launched as `com.chillywood.mobile/.MainActivity`; no fatal crash found in launch log tail | Pass | `/tmp/app-one-attached-device-full-app-automation-20260626-152847/screenshots/launch-home.png`, `logs/launch-logcat-tail.txt` | none | Pass |
| signed-out | signed-out | login | Forgot password | Open password reset request screen | Maestro opened reset request screen and saw `Send reset link` plus `Password reset email` | Pass | `logs/maestro-signed-out-smoke-v2.log` | none | Pass |
| signed-out | signed-out | signup | Sign up | Open account creation screen and legal controls | Maestro opened `Create Account`; `Terms of Service` and `Privacy Policy` were visible | Pass | `maestro-output-v2/.../screenshot-...png` | assertion corrected from `Sign up` to `Create Account` | Pass |
| signed-out | signed-out | privacy | Privacy deep link | Open Privacy Policy | Android VIEW intent rendered `Privacy Policy` | Pass | `screenshots/adb-open-privacy.png`, `logs/adb-open-privacy.txt` | none | Pass |
| signed-out | signed-out | terms | Terms deep link | Open Terms of Use | Android VIEW intent rendered `Terms of Use` | Pass | `screenshots/adb-open-terms.png`, `logs/adb-open-terms.txt` | none | Pass |
| signed-out | signed-out | support | Support deep link | Open support/status flow | Android VIEW intent rendered Support & Feedback with sign-in support action | Pass | `screenshots/adb-open-support.png`, `logs/adb-open-support.txt` | none | Pass |
| signed-out | signed-out | admin | Admin route | Deny signed-out access and require sign-in | Maestro/route checks kept signed-out user on Sign In; `Admin Command Center` not visible | Pass | `logs/maestro-public-routes-v3.log` and screenshots | none | Pass |
| normal user | `proof_normal_001` | full normal app traversal | Home/Search/Profile/Chat/Live/Premium/etc. | Signed-in normal traversal | Not run | Blocked | account readiness table | none | Blocked: missing seeded proof credential |
| creator | `proof_creator_001` | creator Platform/Studio/Money Center | creator actions/status flows | Creator traversal | Not run | Blocked | account readiness table | none | Blocked: missing seeded proof credential |
| moderator | `proof_moderator_001` | moderation/support/admin denial | scoped Moderator traversal | Exact-scope Moderator only | Covered by existing seeded authority proof; not rerun manually in this lane to avoid credential exposure and because full pack is incomplete | Human review | `npm run proof:owner-admin-moderator-production-authority-seeded-device` validation | none | Partial |
| admin/operator | `proof_admin_operator_001` | Admin Command Center/Search | scoped Admin traversal | Exact-scope Admin only | Covered by existing seeded authority proof; not rerun manually in this lane to avoid credential exposure and because full pack is incomplete | Human review | `npm run proof:owner-admin-moderator-production-authority-seeded-device` validation | none | Partial |
| owner | `proof_owner_001` | Owner/staff/security | Owner proof traversal | Owner surfaces without touching First Owner | Covered by existing seeded authority proof; current real First Owner not touched | Human review | `npm run proof:owner-admin-moderator-production-authority-seeded-device` validation | none | Partial |
| restricted | `proof_restricted_001` | private/creator/live/chat/admin fail-closed | restricted denial | Denied private flows | Not run | Blocked | account readiness table | none | Blocked: missing seeded proof credential |
| blocked pair | `proof_blocked_a_001` / `proof_blocked_b_001` | profile/chat/live/room block behavior | blocked pair controls | Block-denial behavior | Not run | Blocked | account readiness table | none | Blocked: missing seeded proof credential |
| Premium | `proof_premium_001` | Premium-gated routes/status | Premium status/restore | Premium-entitled behavior | Not run | Blocked | account readiness table | none | Blocked: missing seeded proof credential |
| non-Premium | `proof_nonpremium_001` | Premium gates/status | upgrade/status/restore | non-Premium gate behavior | Not run | Blocked | account readiness table | none | Blocked: missing seeded proof credential |
| live/call/watch-party real-time | multiple users | real-time multi-user surfaces | two participant/media state | true simultaneous behavior | Not run on one device | Two-device required | two-device limitation | none | Two-device proof still required |

## Pass / Fail / Blocked Summary

| Category | Count | Notes |
| --- | ---: | --- |
| Passed one-device flows | 7 | Launch, forgot-password entry, signup entry, privacy, terms, support, signed-out admin denial. |
| Failed app flows | 0 | No app crash, Not Found, raw backend error, or dead signed-out control was confirmed. |
| Automation selector/tool mismatches | 2 | Maestro initially asserted `Sign up` instead of `Create Account`; Maestro `openLink` did not reliably navigate public legal routes while Android VIEW intents did. |
| Blocked role flows | 6 | Normal, creator, restricted, blocked pair, Premium, non-Premium credentials missing. |
| Human review / existing seeded proof | 3 | Moderator, Admin/operator, Owner credentials present but full pack incomplete; authority proof remains separately green. |
| Two-device required items | 3 | Two-device live video participant visibility, two-device chat call media, two-device Watch-Party sync. |

## Two-Device Required Items

This one attached device proof can close single-device navigation, route/button/sheet/status behavior, and permission UI behavior only. Two-device proof still required for true two-device live video participant visibility, two-device chat call media, Watch-Party sync, and real multi-user simultaneous participant state. These are not falsely called closed by this one-device lane.

## Bugs Fixed

No app code bugs were fixed in this lane. The only correction was to the temporary Maestro proof assertion, changing the expected signup title from `Sign up` to the visible production title `Create Account`.

## Safety Confirmation

- No sideload was used or recommended.
- No APK install was used as tester proof.
- No uninstall/reinstall/clear-data happened.
- No cache wipe or device reset happened.
- No Play production submission happened.
- No provider dashboard mutation happened.
- No Google Play product/base-plan mutation happened.
- No RevenueCat mapping change happened.
- No Stripe mutation happened.
- No provider refunds were executed.
- No payouts, cashout, withdrawals, or transfers happened.
- No Stripe Connect production onboarding happened.
- No payable balances were enabled.
- No real purchases outside approved tester/proof path happened.
- liveMoneyEnabled remains OFF.
- Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF.
- Premium annual remains provider-blocked.
- Creator Channel Subscription remains provider-blocked.
- Safe public non-money systems remain enabled.
- No secrets, passwords, tokens, service-role keys, signed URLs, raw storage paths, raw IPs, private messages, private evidence, tax IDs, bank details, or provider transaction/customer/order records are committed.
- Current First Owner was not touched.
- Missing roles are not called passed.
- Service-role bootstrap was not used as proof of role/permission authority.
- Dead visible controls are not accepted as final.

## Remaining Blockers

1. Stable seeded credentials are missing for normal, creator, restricted, blocked A/B, Premium, and non-Premium proof accounts.
2. Moderator/Admin/operator/Owner keys are present, but the full role pack is incomplete; deeper staff traversal should be run only after the complete pack is available or through the existing seeded authority proof lane.
3. Two-device live/watch-party/chat-call proof remains required for true multi-user media/state behavior.

## Owner Action Items

1. Provide or approve creation of the full stable proof account pack outside git.
2. Do not provide passwords in chat or commit them; place values only in ignored local env/secret manager.
3. If bootstrap is desired, explicitly approve proof-only account bootstrap and keep role/permission grants verified through the backed Owner RPC path where possible.
4. Rerun this one-device automation proof after the missing credentials are present.

## Release Recommendation

Current recommendation: Partial. The installed Play internal app launches, signed-out account/legal/support/admin-denial flows render, and no fatal crash appeared in captured logs. Full app automation cannot close until the seeded proof account pack is complete. Next lane: fix remaining failed visible controls if any appear after account-pack provisioning, then rerun this one-device automation proof. After that, run two-device live/watch-party/chat-call proof for real-time flows.
