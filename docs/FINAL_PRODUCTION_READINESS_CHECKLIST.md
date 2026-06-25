# Final Production Readiness Checklist

Date: 2026-06-25

Verdict: Partial / conditional go for the current launch mode.

This checklist excludes the known Google Play subscription base-plan provider blocker from app-controlled launch blocker classification. It does not activate Premium, creator-money, live money, payouts, Stripe, merch, withdrawals, cash-out, transfers, payable balances, provider refunds, or provider product changes.

## Current Launch Mode

- Broad app readiness: Conditional go, with no remaining app-controlled launch blocker found in this audit.
- Premium monthly: Verified at `$9.99/month`; may move to an owner-approved licensed/internal purchase proof lane before public activation.
- Premium annual: External/provider-blocked at `$99.99/year` pending Google Play support response and saved annual base plan.
- Creator-money: OFF. Five one-time products are Draft/readback verified; Creator Channel Subscription is provider-blocked by the same Google Play base-plan issue.
- Payouts, Stripe payouts, merch checkout, withdrawals, cash-out, transfers, payable balances, and refund automation: OFF/manual.
- Role terminology: Locked. Admin is the product-facing role backed by internal `operator`; Support is a work area, not a staff role; Moderator is separate from Admin/operator and can receive support duties through scoped permissions. Moderator role scope: Closed.

## Production Readiness Matrix

| Area | Status | Evidence | Blocker? | Next action |
| --- | --- | --- | --- | --- |
| Store/release | Partial | Package `com.chillywood.mobile`, Android `versionCode 55`, `versionName 1.0.0`; Play/internal installed proof exists in prior launch docs; Google Play support ticket submitted for subscription base plans. | No app-controlled blocker; external provider blocker remains for annual/channel subscription. | Keep release notes, app access instructions, store listing, Data Safety, content rating, target audience/ads disclosure, and Play review materials aligned before production rollout. |
| Auth/account lifecycle | Closed for current launch scope | Final go/no-go and closeout docs record sign-in, sign-out, reset, account deletion, disabled/deactivated denial, purge/de-identification, support/admin audit, and invalid/expired reset safety. | No. | Keep support/admin audit readback in final release smoke. |
| Public/private route safety | Closed for current launch scope | Production guards cover Profile, creator visibility, feed fanout, security context, route/deep-link safety, blocked/private fail-closed behavior, and no raw token/signed URL leakage. | No. | Rerun route/security guards before release cut. |
| Profile/Platform/Brand Studio | Closed | Profile production, Platform Brand Studio, creator video Circle visibility, and creator feed fanout guards are closed; public Platform excludes drafts and Circle-only/private creator content. | No. | Preserve Profile/Platform separation and owner-only draft controls in future work. |
| Creator media/VOD/uploads | Partial but launch-safe with gates | Upload, scan-pending hidden, clean scanned visible, malware/blocked hidden, safe playback resolver, and no raw storage path exposure are guarded; real rendition ladder and some installed attachment-heavy proof remain qualified future proof. | No current launch blocker if claims stay qualified. | Keep malware/content guards passing; finish real rendition/large attachment proof before marketing advanced media quality. |
| LiveKit/watch-party | Closed for current launch scope | Watch-Party LiveKit guard, old-room handling, refresh policy, Live Stage contracts, 4 active camera/mic cap, token authority, and no unauthorized publish authority are enforced. | No. | Real-device passive/TURN/cellular scale proof remains a future capacity lane, not a current active-seat launch blocker. |
| Chat/calls/notifications | Closed for current launch scope | Chi'lly Chat/call/push policies and final readiness docs cover inbox/thread, direct thread, blocked denial, call/ring dispatch, dedupe, disabled-user denial, and push safety. | No. | Include message/call/push sanity in release smoke. |
| Monetization/Premium/creator-money | Partial | Premium monthly verified; Premium annual provider-blocked; creator-money switchboard OFF; five one-time creator products Draft/readback verified; Creator Channel Subscription provider-blocked; no creator product maps to Premium. | Premium-first blocker until licensed/internal purchase proof and owner approval; creator-money future blocker. | Do not activate. Wait for owner-approved Premium monthly proof and Google response for annual/channel base plans. |
| Support/refund/dispute | Partial but policy-ready | Final operations runbook covers Premium support, creator-money support, manual/external provider refunds, disputes, paid-content unavailable states, event/room no-show handling, account deletion support, DMCA/support privacy, and scoped support workflows. Support is not a staff role; Moderator or Admin may receive support scopes. | No for non-money or Premium proof preparation; money launch needs staffed support ownership. | Assign support workflow owner before Premium activation; keep refund execution manual/external. |
| Security/privacy/abuse | Closed for current launch scope | RLS posture, service-role boundary, admin/operator controls, DMCA/support privacy, abuse/report/upload/chat/call/room throttles, trusted-network/security context proof, and no secret exposure are guarded. | No. | Keep guard and secret scans in every release lane. |
| Role operations | Closed for current launch scope | First Owner authority, Admin role scope, role terminology lock, and Moderator role scope are closed. Support is a work area, not a role; Moderator support duties require exact scopes and backend enforcement. | No. | Owner must grant real staff roles/scopes intentionally before live operations. |
| First Owner authority | Enabled after validation | First Owner authority: Closed / Partial / Blocked. Only First Owner can grant or revoke Owner. First Owner cannot remove himself as the last active Owner. First Owner self-step-down requires successor, password re-auth, generated single-use passcode, typed confirmation, reason, and audit. Normal Owner dashboard viewing is not Break Glass. Break Glass is documented and audited when used. | No app-controlled blocker after migration apply; blocked only if production cannot seed exactly one First Owner marker from existing active Owner state. | Run `proof:first-owner-authority` and `guard:first-owner-authority-policy`; apply migration before production use. |
| Monitoring/analytics/crash | Partial | Firebase/Crashlytics/performance/runtime unavailable/root error boundary/support diagnostics are documented in final runbooks; no PII/public raw error leakage is allowed. | No app-controlled blocker found. | Run release health checklist and monitor Crashlytics/analytics after any public rollout. |
| Legal/policy/moderation | Partial / owner decision | Terms, Privacy, DMCA, Support, account deletion, creator upload rights posture, moderation/reporting, and public legal build status are documented; final legal signoff is owner-controlled. | Owner decision needed. | Owner/legal final review before production store rollout. |
| UX polish/copy | Closed for guarded scope | Critical UX polish guard is passing; docs require no proof/dev/debug copy, no fake readiness claims, clear Premium and creator-money OFF copy, safe unavailable states, empty states, labels/test IDs. | No. | Keep copy guard passing and do not advertise annual/creator-money readiness before provider proof. |
| Build/validation/release gates | Pending this lane validation | Required proof scripts, production guards, typecheck, runtime validation, old-room, refresh, LiveKit, and diff checks are the release gate. Existing `proof:launch-candidate-installed` and `guard:big-app-qa-coverage` are available optional release gates. | Pending validation. | Run the full validation set and commit only if clean. |

## Detailed Checklist

### 1. Store / Release Readiness

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Play internal/closed track status | Partial | Owner decision needed | Prior Play-installed/internal v55 proof exists; final track/rollout decision remains owner-controlled. |
| Package/versionCode | Closed | Already closed | `com.chillywood.mobile`, `versionCode 55`, `versionName 1.0.0`. |
| Installer/readback proof | Closed for current proof | Already closed | Prior Play-installed proof recorded in final go/no-go and Premium proof docs. |
| Release notes | Needs final owner review | Owner decision needed | Prepare final non-provider-claiming release notes before production rollout. |
| Store listing basics | Needs final owner review | Owner decision needed | Confirm listing copy does not claim annual Premium or creator-money launch readiness. |
| Data Safety/privacy consistency | Needs final owner review | Owner decision needed | Ensure Premium/creator-money/Stripe off-state matches Data Safety before rollout. |
| App access instructions | Needs final owner review | Owner decision needed | Keep reviewer credentials and app access instructions current outside repo secrets. |
| Content rating alignment | Needs final owner review | Owner decision needed | No app-controlled mismatch found; owner must confirm Play Console rating. |
| Target audience/ads disclosure | Needs final owner review | Owner decision needed | No in-lane change; confirm store answers match runtime. |
| Google Play policy blockers | Partial | External/provider blocker | Base-plan support ticket submitted; annual/channel subscription remain blocked. |

### 2. Auth / Account Lifecycle

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Sign in / sign out / sign up | Closed | Already closed | Covered by final readiness and account guard history. |
| Password reset | Closed | Already closed | Provider reset proof and invalid/expired reset safety documented. |
| Account deletion / restore / controlled purge | Closed | Already closed | Account purge/de-identification and deletion restore lanes documented. |
| Disabled/deactivated account denial | Closed | Already closed | Disabled/admin denial proof recorded in final readiness docs. |
| Support/admin audit readback | Closed | Already closed | Admin/support audit boundaries documented and guarded. |

### 3. Public / Private Route Safety

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Signed-out public/private routes | Closed | Already closed | Public/private route safety and Profile production guard are closed. |
| Deep-link / notification handoff safety | Closed | Already closed | Route contracts and final readiness docs cover fail-closed handoffs. |
| Blocked/deleted/scheduled-deletion denial | Closed | Already closed | Block/private/deleted content fail-closed behavior is guarded. |
| Token/signed URL leakage | Closed | Already closed | Security context and creator media guards forbid raw token/storage URL exposure. |

### 4. Profile / Platform / Brand Studio

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Profile vs Platform separation | Closed | Already closed | `guard:profile-production-policy` and Platform Brand Studio guard closed. |
| Public Platform draft exclusion | Closed | Already closed | Creator visibility and feed fanout guards closed. |
| Profile privacy/blocked behavior | Closed | Already closed | Profile production guard closed. |
| Profile media safety | Closed | Already closed | Guarded raw-path and private-safe rendering contracts. |
| Brand Studio draft/publish/readback | Closed | Already closed | Platform Brand Studio guard closed. |

### 5. Creator Media / VOD / Uploads

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Upload path and non-zero media proof | Partial | Post-launch polish | Current gates are launch-safe; broader installed media proof remains qualified. |
| Draft/private/public visibility | Closed | Already closed | Creator Circle visibility and feed fanout guards closed. |
| Scan-pending/clean/malware behavior | Closed for current launch scope | Already closed | Scan gates hide pending/blocked and allow clean scanned media. |
| Deletion/cleanup | Closed for current launch scope | Already closed | Final closeout docs cover deletion/cleanup posture. |
| Playback resolver / raw path safety | Closed | Already closed | Public resolver must not return raw playback URL, storage path, or object key. |
| Rendition/quality and heavy attachments | Partial | Post-launch polish | Do not overclaim quality ladder or attachment-heavy readiness until final installed proof. |

### 6. Watch-Party Live / LiveKit

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Route ownership and Live Stage flow | Closed | Already closed | Watch-Party LiveKit and Live Stage guards cover route ownership. |
| Shared player / old room handling | Closed | Already closed | Old-room handling guard required in validation. |
| Seat request/approval and 4 active cap | Closed | Already closed | Live Stage seat approval and active camera/mic cap are guarded. |
| Token authority / metrics | Closed | Already closed | LiveKit authority and metrics guards are part of proof history. |
| Passive viewer proof | Partial | Post-launch polish | Synthetic/passive proof closed; larger real-device capacity proof remains future. |

### 7. Chi'lly Chat / Calls / Notifications

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Inbox/thread/direct message basics | Closed | Already closed | Final readiness docs and chat/call/push guard history. |
| Blocked chat denial | Closed | Already closed | Block enforcement remains required and guarded. |
| Call/ring dispatch and dedupe | Closed | Already closed | Call/push policy guard history covers dispatch/dedupe. |
| Disabled/deactivated denial and push safety | Closed | Already closed | Disabled user denial and private-data-safe push posture documented. |

### 8. Monetization / Premium / Creator-Money

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Premium monthly | Verified | Already closed | Google Play `premium_subscription:monthly`, United States, USD 9.99; RevenueCat `$rc_monthly` maps to `premium`. |
| Premium annual | Provider-blocked | External/provider blocker | Google Play base-plan save/ID validation issue; support packet submitted, case ID pending. |
| Premium purchase proof | Pending | Premium-first blocker | Requires owner-approved licensed/internal purchase proof before public activation. |
| Creator-money switchboard | OFF | Already closed | All creator-money switches OFF; `live_money_enabled` OFF. |
| Five one-time creator products | Draft/readback verified | Creator-money future blocker | Products remain Draft; RevenueCat Draft consumables; no Premium mapping. |
| Creator Channel Subscription | Provider-blocked | External/provider blocker | Product exists; monthly base plan missing; RevenueCat mapping blocked. |
| Payouts/refunds/Stripe | OFF/manual | Already closed | Payouts and Stripe future-only; provider refunds manual/external. |

### 9. Refund / Support / Dispute Operations

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Premium support/restore/manage/cancel | Policy-ready | Premium-first blocker | Must be staffed and smoke-tested during licensed/internal purchase proof. |
| Creator-money support | Future-ready only | Creator-money future blocker | Do not activate creator-money until support/refund/dispute proof is run. |
| Manual/external refunds | Closed | Already closed | No provider refund execution or automation enabled. |
| Paid content unavailable / event no-show | Policy-ready | Creator-money future blocker | Keep manual support review until future activation lanes. |
| DMCA/support privacy | Closed | Already closed | Support privacy and DMCA posture documented. |

### 10. Security / Privacy / Abuse

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| RLS/service-role/admin boundaries | Closed | Already closed | No weakening in this lane; guards and docs require strict boundaries. |
| Abuse/report/upload/chat/call/room throttles | Closed | Already closed | No throttle removal; final guards cover abuse posture. |
| Trusted-network/security context | Closed | Already closed | Security context proxy proof guard closed. |
| No public raw IP/security context leakage | Closed | Already closed | Security context guard closed. |
| No committed secrets | Pending validation | Build/release gate | Secret scan artifact and diff review required before commit. |

### 11. Monitoring / Analytics / Crash

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Firebase Analytics / Crashlytics / Performance | Partial | Owner decision needed | Final runbooks define expectations; final production dashboard owner review remains. |
| PII-safe diagnostics | Closed | Already closed | Runtime unavailable and root error copy must stay sanitized. |
| Production health checklist | Policy-ready | Owner decision needed | Run immediately before and after any rollout. |

### 12. Legal / Policy / Content Moderation

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Terms / Privacy / DMCA / Support | Partial | Owner decision needed | Public legal surfaces must stay free of internal/proof copy; owner/legal final review required. |
| Account deletion policy | Closed for current launch scope | Already closed | Account lifecycle proof recorded. |
| Content rights and creator upload disclosure | Partial | Owner decision needed | Keep rights posture and moderation copy aligned before public creator expansion. |
| Moderation/reporting | Closed for current launch scope | Already closed | Reporting and moderation gates are part of production guard set. |

### 13. UX Polish / Production Copy

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| No proof/dev/debug copy | Closed for guarded scope | Already closed | Critical UX polish guard closed. |
| No user-facing entity leaks | Closed for guarded scope | Already closed | Critical UX polish guard closed. |
| No fake readiness claims | Closed for current docs after this lane | Already closed | Stale support-packet wording corrected from prepared to submitted. |
| Premium UI clarity | Partial | Premium-first blocker | Do not advertise annual until provider-backed; run licensed/internal proof before launch. |
| Creator-money OFF clarity | Closed | Already closed | Creator-money remains OFF and future-only in docs. |

### 14. Build / Validation / Release Gates

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Proof scripts | Pending validation | Build/release gate | Run required final proof commands in this lane. |
| Production guards | Pending validation | Build/release gate | Run required production guards in this lane. |
| Typecheck/runtime validation | Pending validation | Build/release gate | `npm run typecheck` and `npm run validate:runtime`. |
| Old-room/refresh/LiveKit guards | Pending validation | Build/release gate | Run requested guard set. |
| Diff checks | Pending validation | Build/release gate | `git diff --check` and `git diff --cached --check`. |
| Clean tracked tree / push status | Pending commit | Build/release gate | Commit only intended files if validation is clean. |

## Launch Blocker Matrix

| Blocker | Severity | Owner | App-controlled? | External/provider? | Recommended action |
| --- | --- | --- | --- | --- | --- |
| Premium annual base plan does not save | External/provider blocker | Owner / Google Play Support | No | Yes | Track submitted support ticket, capture case ID, retry only in a separate approved provider lane. |
| Creator Channel Subscription base plan does not save | External/provider blocker / creator-money future blocker | Owner / Google Play Support | No | Yes | Keep creator-money OFF; resolve with Google before channel subscription activation. |
| Premium licensed/internal purchase proof not yet run for launch | Premium-first blocker | Owner / app operator | Yes, after owner approval | Provider involved | Run bounded licensed/internal Premium monthly proof; do not public activate before proof. |
| Premium public activation decision | Owner decision needed | Owner | Yes | No | Owner approves rollout window, switch scope, support owner, monitoring owner, rollback owner. |
| Creator-money activation | Creator-money future blocker | Owner | Yes | Provider involved | Keep OFF until products are verified/active, mapped, smoke-tested, and owner-approved. |
| Payouts / Stripe / merch | Future blocker only | Owner | Yes | Provider involved | Keep OFF; run separate payout/merch lanes later. |
| Final legal/store review | Owner decision needed | Owner/legal | No | Store/legal involved | Owner/legal review store listing, Data Safety, legal surfaces, app access instructions. |
| Media quality/large attachment and passive-scale proof | Post-launch polish | App operator | Yes | Device/provider involved | Finish before marketing advanced media/scale claims; not a blocker for current gated launch mode. |

## Premium-First Recommendation

Do not publicly activate Premium in this lane. Premium monthly is provider-ready at `$9.99/month`, but Premium-first launch still needs an owner-approved licensed/internal purchase proof covering product load, purchase sheet, licensed tester purchase, RevenueCat entitlement readback, restore/manage/cancel, gated feature unlock, revoke/expiration denial where possible, rollback, monitoring, and support ownership.

Premium annual remains external/provider-blocked. A monthly-only Premium launch can be considered only if the owner explicitly accepts launching without annual and the app does not advertise annual availability.

## Creator-Money Recommendation

Do not activate creator-money. Tips, Paid Video, Watch-Party Ticket, VIP, and Event Pass remain Draft/readback verified but OFF. Creator Channel Subscription cannot activate until Google Play creates the `monthly` base plan and RevenueCat imports/maps `cw_channel_subscription_monthly_499:monthly` without Premium mapping. Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and provider refund automation remain OFF/manual.

## Owner Decision List

1. Track the Google Play support ticket and record the case ID when provided.
2. Decide whether Premium monthly may move to licensed/internal proof while annual remains blocked, or whether Premium launch must wait for annual.
3. Approve the bounded Premium monthly licensed/internal proof lane, including tester account, rollout scope, support owner, monitoring owner, and rollback owner.
4. Complete final store/legal review: release notes, app access, Data Safety/privacy, content rating, target audience/ads answers, Terms, Privacy, DMCA, Support, and account deletion surfaces.
5. Keep creator-money, payouts, Stripe payouts, merch, and refund automation in future owner-approved lanes.

## Fixes Applied

- Added this final production readiness checklist.
- Corrected stale docs that said the Google Play support packet was only prepared; it was submitted through Google Play Console Help on 2026-06-25 at 12:25 CDT, with case ID pending.

## Safety Confirmation

- No provider dashboard mutation.
- No Premium public activation.
- No creator-money switches enabled.
- No `live_money_enabled`.
- No payouts, payable balances, withdrawals, cash-out, transfers, payout batches, Stripe Connect, or merch checkout.
- No provider refunds.
- No RevenueCat mapping change.
- No Premium product, pricing, entitlement, or offering change.
- No RLS weakening.
- No LiveKit authority loosening.
- No auth/reset weakening.
- No scan-gate weakening.
- No abuse-throttle removal.
- No block-enforcement weakening.
- No secrets committed.
- First Owner controls are enabled for authenticated First Owner after validation.
- No plaintext passcodes stored.
- No raw IP/token/signed URL exposure added.

## Admin Role Scope Closeout

| Check | Status | Severity | Evidence / next action |
| --- | --- | --- | --- |
| Admin role scope | Closed | Already closed | Admin is a real production role backed by `platform_role_memberships.role = 'operator'` and scoped grants. |
| Admin permissions | Closed | Already closed | Admin permissions are scoped and granted by Owner/First Owner through `platform_staff_permission_grants`. |
| Backend denial | Closed | Already closed | Backend denies non-admin and unscoped-admin attempts even if UI is bypassed. |
| Owner/First Owner boundary | Closed | Already closed | Admin cannot grant or revoke Owner, cannot alter First Owner succession, and cannot remove, demote, delete, or deactivate First Owner. |
| Money/provider boundary | Closed | Already closed | Admin cannot enable money/provider/payout systems and cannot execute provider refunds. |
| Refund status boundary | Closed | Already closed | Admin can record manual/external refund status only with permission; provider refunds remain manual/external. |
| Destructive actions | Closed | Already closed | Admin destructive actions require permission, reason, confirmation, and audit. |
| Admin UI buttons | Closed | Already closed | Broken Admin buttons are wired or honestly disabled. |
| Private data safety | Closed | Already closed | No secrets, tokens, signed URLs, raw IPs, tax IDs, bank details, or provider secrets are exposed. |
