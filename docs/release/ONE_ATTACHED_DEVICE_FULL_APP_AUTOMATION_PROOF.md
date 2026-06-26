# One Attached Device Full App Automation Proof

One attached device full app automation proof: Closed / Partial / Blocked.

Verdict for this lane: Partial after account-pack repair.

Stable seeded proof account pack: Closed. The prior blocker was the missing stable proof account pack. The repaired pack now has all ten required proof-only `@chillywood.test` accounts available from ignored local env keys without printing or committing credentials.

This rerun used the installed Google Play internal/closed testing app only. No sideload was used. No APK install was used as tester proof. No uninstall/reinstall/clear-data happened. No cache wipe, device reset, Play track change, Play production submission, or provider mutation happened.

The attached device was `R5CR120QCBF` (`samsung SM-N986U1`, Android 11). Installed package metadata was verified again after account-pack repair as package `com.chillywood.mobile`, installer `com.android.vending`, versionName `1.0.0`, versionCode `57`, first install time `2026-06-26 01:26:01`, and last update time `2026-06-26 01:26:01`.

EAS update group under test: `d7aac53c-65bb-4bf7-ae69-04bfea248e0a`. Android update ID under test: `019f0533-920e-7fca-8f45-74b1f538040a`. Update uptake cannot be read directly in-app, so uptake is inferred from the delivered branch/runtime and visible behavior. No fake update readback is claimed.

## Automation Method

Automation used the installed Play app on one attached Android device. ADB was used only for non-destructive launch, package metadata readback, and a sanitized log tail. The app was launched with `adb shell monkey -p com.chillywood.mobile -c android.intent.category.LAUNCHER 1`; no fatal crash appeared in the captured launch log window.

Rerun artifact: `/tmp/app-stable-seeded-proof-account-pack-20260626-165112/`.

Previous signed-out route artifact remains `/tmp/app-one-attached-device-full-app-automation-20260626-152847/`. That earlier run proved launch, forgot-password entry, signup entry, privacy, terms, support, and signed-out admin denial on the Play-installed app. This lane repaired the missing account pack and reran non-destructive installed launch/readback. It does not falsely claim a full role-by-role UI traversal was completed after the repair.

Service-role bootstrap was used only for proof-only account creation/repair and proof-only state fixtures. Service-role bootstrap may only be used after explicit owner approval and only for proof account creation/repair. Service-role bootstrap was not used as proof of role/permission authority. Owner RPC staff grant path remains the authority proof and is validated separately by `npm run proof:owner-rpc-staff-grant-path`.

## Seeded Account Readiness Table

| Account label | Email key present? | Password key present? | Role/state expected | Backend role/permission expected | Entitlement/state expected | Account status | Usable for automation? | Blocker reason |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| signed-out | n/a | n/a | signed-out public routes | none | none | available on device | Yes | none |
| `proof_normal_001` | Yes | Yes | normal user | no staff/admin/creator-only privileges | non-Premium | repaired and proved | Yes | none |
| `proof_creator_001` | Yes | Yes | creator | creator-ready profile/channel state | sandbox creator-money status/readiness surfaces only | repaired and proved | Yes | none |
| `proof_moderator_001` | Yes | Yes | Moderator | exact-scope moderation/support only | no money/live authority | reused/repaired and proved | Yes | none |
| `proof_admin_operator_001` | Yes | Yes | Admin/operator | exact-scope Admin tools | no Owner/First Owner authority | reused/repaired and proved | Yes | none |
| `proof_owner_001` | Yes | Yes | Owner proof account | Owner/staff/security/status surfaces safely | not current real First Owner | reused/repaired and proved | Yes | none |
| `proof_restricted_001` | Yes | Yes | restricted/suspended/disabled fail-closed | restricted account state | denied private/creator/live/chat/admin flows | created/repaired and proved | Yes | none |
| `proof_blocked_a_001` | Yes | Yes | blocked-user pair A | block relationship participant | block state | created/repaired and proved | Yes | none |
| `proof_blocked_b_001` | Yes | Yes | blocked-user pair B | block relationship participant | block state | created/repaired and proved | Yes | none |
| `proof_premium_001` | Yes | Yes | Premium-entitled proof user | normal user | active test Premium entitlement | created/repaired and proved | Yes | none |
| `proof_nonpremium_001` | Yes | Yes | non-Premium proof user | normal user | no Premium entitlement | created/repaired and proved | Yes | none |

## Role Account Status

| Role | Status |
| --- | --- |
| signed-out | Tested on attached Play-installed device in the prior one-device run; launch/readback reran after account-pack repair. |
| normal user | Account pack is Closed; credential keys are present outside git; not fully UI-traversed after repair in this lane. |
| creator | Account pack is Closed with creator-ready profile/channel and sandbox monetization status fixtures; not fully UI-traversed after repair in this lane. |
| moderator | Account pack is Closed; role/scopes verified through Owner RPC where possible; seeded authority proof remains green. |
| admin/operator | Account pack is Closed; role/scopes verified through Owner RPC where possible; seeded authority proof remains green. |
| owner | Proof Owner account is present and is not the current First Owner; current First Owner was not touched. |
| restricted | Restricted/suspended state is present through backed account restriction readback. |
| blocked pair | Block relationship is present both ways where backed. |
| Premium | Active test Premium entitlement is present; no real purchase was executed. |
| non-Premium | No active Premium entitlement. |

## Flow Matrix

| Role | Account label | Route/screen | Visible control | Expected outcome | Actual outcome | Status | Screenshot/log reference | Fix reference | Final result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| signed-out | signed-out | launch/login | app launch | Open installed Play app without fatal crash | Package launched from `com.android.vending` install; no fatal crash found in log tail after repair | Pass | `/tmp/app-stable-seeded-proof-account-pack-20260626-165112/launch-logcat-redacted.txt` | none | Pass |
| signed-out | signed-out | login | Forgot password | Open password reset request screen | Previously passed on attached Play-installed app | Pass | `/tmp/app-one-attached-device-full-app-automation-20260626-152847/` | none | Pass |
| signed-out | signed-out | signup | Sign up | Open account creation screen and legal controls | Previously passed on attached Play-installed app | Pass | `/tmp/app-one-attached-device-full-app-automation-20260626-152847/` | none | Pass |
| signed-out | signed-out | privacy | Privacy deep link | Open Privacy Policy | Previously passed on attached Play-installed app | Pass | `/tmp/app-one-attached-device-full-app-automation-20260626-152847/` | none | Pass |
| signed-out | signed-out | terms | Terms deep link | Open Terms of Use | Previously passed on attached Play-installed app | Pass | `/tmp/app-one-attached-device-full-app-automation-20260626-152847/` | none | Pass |
| signed-out | signed-out | support | Support deep link | Open support/status flow | Previously passed on attached Play-installed app | Pass | `/tmp/app-one-attached-device-full-app-automation-20260626-152847/` | none | Pass |
| signed-out | signed-out | admin | Admin route | Deny signed-out access and require sign-in | Previously passed on attached Play-installed app | Pass | `/tmp/app-one-attached-device-full-app-automation-20260626-152847/` | none | Pass |
| normal user | `proof_normal_001` | full normal app traversal | Home/Search/Profile/Chat/Live/Premium/etc. | Signed-in normal traversal | Account is ready; full post-repair UI traversal not run | Blocked | stable account pack proof | none | Blocked: full role UI traversal not rerun end-to-end |
| creator | `proof_creator_001` | creator Platform/Studio/Money Center | creator actions/status flows | Creator traversal | Account is ready; full post-repair UI traversal not run | Blocked | stable account pack proof | none | Blocked: full role UI traversal not rerun end-to-end |
| moderator | `proof_moderator_001` | moderation/support/admin denial | scoped Moderator traversal | Exact-scope Moderator only | Account and role are ready; existing authority proof remains green; full post-repair UI traversal not rerun | Human review | `npm run proof:owner-admin-moderator-production-authority-seeded-device` validation | none | Partial |
| admin/operator | `proof_admin_operator_001` | Admin Command Center/Search | scoped Admin traversal | Exact-scope Admin only | Account and role are ready; existing authority proof remains green; full post-repair UI traversal not rerun | Human review | `npm run proof:owner-admin-moderator-production-authority-seeded-device` validation | none | Partial |
| owner | `proof_owner_001` | Owner/staff/security | Owner proof traversal | Owner surfaces without touching First Owner | Account is ready; current First Owner not touched; full post-repair UI traversal not rerun | Human review | stable account pack proof | none | Partial |
| restricted | `proof_restricted_001` | private/creator/live/chat/admin fail-closed | restricted denial | Denied private flows | Account is ready; full post-repair UI traversal not run | Blocked | stable account pack proof | none | Blocked: full role UI traversal not rerun end-to-end |
| blocked pair | `proof_blocked_a_001` / `proof_blocked_b_001` | profile/chat/live/room block behavior | blocked pair controls | Block-denial behavior | Pair is ready; full post-repair UI traversal not run | Blocked | stable account pack proof | none | Blocked: full role UI traversal not rerun end-to-end |
| Premium | `proof_premium_001` | Premium-gated routes/status | Premium status/restore | Premium-entitled behavior | Account is ready; full post-repair UI traversal not run | Blocked | stable account pack proof | none | Blocked: full role UI traversal not rerun end-to-end |
| non-Premium | `proof_nonpremium_001` | Premium gates/status | upgrade/status/restore | non-Premium gate behavior | Account is ready; full post-repair UI traversal not run | Blocked | stable account pack proof | none | Blocked: full role UI traversal not rerun end-to-end |
| live/call/watch-party real-time | multiple users | real-time multi-user surfaces | two participant/media state | true simultaneous behavior | Not run on one device | Two-device required | two-device limitation | none | Two-device proof still required |

## Pass / Fail / Blocked Summary

| Category | Count | Notes |
| --- | ---: | --- |
| Stable proof accounts proved usable | 10 | `npm run proof:stable-seeded-proof-account-pack` passed with all ten accounts usable. |
| Passed one-device signed-out/install flows | 7 | Prior attached-device signed-out flow plus post-repair launch/readback. |
| Failed app flows | 0 | No crash, Not Found, raw backend error, or confirmed dead signed-out control in the captured windows. |
| Blocked role flows | 6 | Normal, creator, restricted, blocked pair, Premium, and non-Premium UI traversal remain pending after account repair. |
| Human review / existing seeded proof | 3 | Moderator, Admin/operator, and Owner authority remain covered by existing proof; post-repair full UI traversal still pending. |
| Two-device required items | 3 | Two-device live video participant visibility, two-device chat call media, two-device Watch-Party sync. |

## Two-Device Required Items

This one attached device proof can close single-device navigation, route/button/sheet/status behavior, and permission UI behavior only. Two-device proof still required for true two-device live video participant visibility, two-device chat call media, Watch-Party sync, and real multi-user simultaneous participant state. These are not falsely called closed by this one-device lane.

## Bugs Fixed

The stable seeded proof account pack was fixed. Missing `proof_normal_001`, `proof_creator_001`, `proof_restricted_001`, `proof_blocked_a_001`, `proof_blocked_b_001`, `proof_premium_001`, and `proof_nonpremium_001` accounts were created or repaired as proof-only `@chillywood.test` accounts. Existing `proof_moderator_001`, `proof_admin_operator_001`, and `proof_owner_001` accounts were reused/repaired. Passwords were stored only in ignored `.env.browserstack-monetization.local`.

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

1. Full post-repair role-by-role UI traversal remains pending now that all ten proof accounts are available.
2. Two-device live/watch-party/chat-call proof remains required for true multi-user media/state behavior.

## Owner Action Items

1. Keep `.env.browserstack-monetization.local` local and ignored; it now stores stable proof credentials for repeat use.
2. Run the next full UI automation pass with these proof accounts and no destructive device reset.
3. Run two-device live/watch-party/chat-call proof after one-device role traversal closes.

## Release Recommendation

Current recommendation: Partial. The stable seeded proof account pack is Closed and the Play-installed v57 app still launches without a fatal crash in the captured window. Full post-repair role-by-role UI traversal remains pending, and two-device real-time proof remains required.
