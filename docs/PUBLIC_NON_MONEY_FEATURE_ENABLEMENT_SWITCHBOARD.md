# Public Non-Money Feature Enablement Switchboard

Public non-money feature enablement: Closed for app-controlled public switchboard, route/copy cleanup, and guard coverage. Full public launch remains conditional on store release operations, owner decisions, and provider blockers that are outside this lane.

Status vocabulary: Public non-money feature enablement: Closed / Partial / Blocked. This document marks the app-controlled non-money switchboard Closed, while separately listing Partial or Blocked systems that must remain disabled.

This lane enables safe public app systems only. `live_money_enabled` remains OFF. Creator-money remains OFF. Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF. Provider refunds remain manual/external. Premium annual remains provider-blocked. Creator Channel Subscription remains provider-blocked. Premium monthly public purchase remains separate owner-approved proof unless explicitly activated in a separate lane. No Google Play, RevenueCat, Stripe, payout, purchase, refund, or provider mutation happened. Admin/staff routes remain scoped. Reporting, blocking, account restriction, legal/support/account deletion, and monitoring remain aligned.

Plain wording for guard/readback: live_money_enabled remains OFF.

No secrets committed; no raw provider/payment/tax/bank/token/signed URL/private evidence exposure is introduced.

This switchboard removes public proof-style money copy where found, keeps safe public routes reachable, and keeps unsupported or money-moving features disabled or honestly unavailable.

## Public Feature Enablement Matrix

| System | Public enabled now? | Should be enabled now? | Depends on live_money_enabled? | Depends on provider blocker? | Required gate/scope | User-facing copy | Proof status | Action taken | Launch status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Auth | Yes | Yes | No | No | Auth provider/session | Sign in / create account | Existing auth/reset docs and route guards | Verified route presence | Closed |
| Forgot password / reset password | Yes | Yes | No | No | Auth provider recovery | Forgot password / reset password | Password reset provider proof remains referenced | Verified route presence | Closed |
| Profile | Yes | Yes | No | No | Account status/privacy guards | Profile | Profile production guard remains referenced | Verified route presence | Closed |
| Creator profile/channel | Yes | Yes | No | No | Visibility/account guards | Platform / creator page | Platform brand/profile guards remain referenced | Verified route presence | Closed |
| Creator uploads | Yes, gated | Yes, where scan/storage gates pass | No | No | Upload runtime control, scan gate, auth/account status | Upload unavailable when blocked | Malware/scan/upload policies remain referenced | Verified safe runtime defaults | Closed |
| Home | Yes | Yes | No | No | Public/session-aware rails | Home | Final readiness proof remains referenced | Verified route presence | Closed |
| Search/Browse | Yes | Yes | No | No | Public search policy and privacy guards | Search / Browse | Public user search guard remains referenced | Verified route presence | Closed |
| Title pages | Yes | Yes | No | No | Content visibility/access rules | Title details | Player/title routes remain present | Verified route presence | Closed |
| Player | Yes | Yes | No for free playback | No | Content visibility, unavailable states, entitlement gates | Safe unavailable states | Runtime/player guards remain referenced | Disabled paid-video checkout while money off | Closed |
| Favorites | Yes | Yes | No | No | Signed-in user | Favorites / My List | Runtime defaults enabled | Verified route presence | Closed |
| Continue watching | Yes | Yes | No | No | Signed-in user | Continue watching | Runtime defaults enabled | Verified enabled default | Closed |
| Chi'lly Chat | Yes | Yes | No | No | Auth, block/account status, chat controls | Sign in to open Chi'lly Chat | Chat/call moderation guard remains referenced | Verified route presence | Closed |
| Chat calls | Yes, gated | Yes, where chat/call proof applies | No | No | Auth, block/account status, call/ring controls | Safe call/ring states | Chat/call proof remains referenced | Verified route presence | Closed |
| Watch-Party Live | Yes, gated | Yes, non-money entry only | No for non-money entry | No | Auth, Premium/runtime gates, room controls | Premium/access required where applicable | Live/Watch-Party guards remain referenced | Disabled Seat Pass checkout while money off | Closed |
| Live Watch-Party | Yes, gated | Yes, non-money entry only | No for non-money entry | No | Auth, Premium/runtime gates, LiveKit authority | Premium/live access copy | LiveKit/live moderation guards remain referenced | Verified route presence | Closed |
| Live Stage / Live Room | Yes, gated | Yes, non-money room flow only | No for non-money room flow | No | Auth, Premium/runtime gates, LiveKit token issuer | Safe unavailable/live copy | Live room incident proof remains referenced | Public purchase/pass copy made unavailable | Closed |
| Reporting | Yes | Yes | No | No | Signed-in/report throttles | Report | Reporting and event/chat affordance proofs remain referenced | Verified closed truth | Closed |
| Blocking | Yes | Yes | No | No | Account/block guards | Block / unblock where supported | Chat/live/account guards remain referenced | Verified closed truth | Closed |
| Account restriction | Yes | Yes | No | No | Account status backend checks | Access unavailable / appeal support | Account restriction proof remains referenced | Verified closed truth | Closed |
| Legal/support/account deletion | Yes | Yes | No | No | Public and settings links | Terms, Privacy, Support, Account Deletion | Legal/Data Safety proof remains referenced | Verified route presence | Closed |
| Settings | Yes | Yes | No | No | Auth/session state | Settings | Account deletion/settings proof remains referenced | Verified route presence | Closed |
| Notifications | Yes, privacy-gated | Yes, where proved | No | Provider delivery only | Notification privacy/rate-limit controls | Minimal notification copy | Monitoring/chat notification proofs remain referenced | Verified closed truth | Closed |
| Admin Command Center | Yes for staff only | Yes for scoped staff only | No | No | Owner/Admin/Moderator exact scopes | Admin access requires platform role | Command Center proof remains referenced | Verified `canAccessAdminConsole` guard | Closed |
| Admin Search | Yes for scoped staff only | Yes for scoped staff only | No | No | Exact admin/search scopes | Search scoped, minimized, audited | Admin Search governance proof remains referenced | Verified closed truth | Closed |
| Premium gate/readiness | Yes | Yes, entitlement/readiness only | No for entitlement readback | Monthly owner proof pending | Premium entitlement/gate helpers | Premium features stay locked without entitlement | Premium proof docs remain referenced | Purchase remains unavailable by default | Closed |
| Premium monthly purchase | No public purchase | No, not in this lane | No live_money switch, but owner proof required | Owner-approved purchase proof pending | Separate owner-approved proof lane | Premium purchases temporarily unavailable | Premium monthly provider path verified separately | Kept `premiumPurchaseEnabled=false` | Partial |
| Premium annual | No | No | No | Yes | Future annual base plan and mapping | Not available | Google Play base-plan blocker documented | Kept unavailable | Blocked |
| Creator tips | No | No | Yes | Product readiness future | Creator-money activation lane | Not available yet | Creator-money OFF proof referenced | Kept disabled | Blocked |
| Paid creator video | No public checkout | No | Yes | Provider/product readiness future | Creator-money/live-money gates | Not available yet | Content takedown/access guard referenced | Disabled unlock action while money off | Closed for off-state |
| Paid Watch-Party ticket | No public checkout | No | Yes | Provider/product readiness future | Creator-money/live-money gates | Not available yet | Live/Watch-Party guard referenced | Disabled Seat Pass setup/purchase while money off | Closed for off-state |
| Channel Subscription | No | No | Yes | Yes | Future base plan and mapping | Not available right now | Provider-blocked docs referenced | Kept provider-blocked | Blocked |
| VIP | No public checkout | No | Yes | Provider/product readiness future | Creator-money/live-money gates | Not available yet | Creator-money OFF docs referenced | Kept disabled by backend/runtime gates | Closed for off-state |
| Paid event | No public checkout | No | Yes | Provider/product readiness future | Creator-money/live-money gates | Not available yet | Event/report docs referenced | Kept disabled | Closed for off-state |
| Payouts | No | No | Yes | Future payout readiness | Owner/First Owner future lane | Not available | Money governance proof referenced | Kept disabled | Blocked |
| Stripe Connect | No | No | Yes | Future Stripe lane | Owner/First Owner future lane | Not available | Money governance proof referenced | Kept disabled | Blocked |
| Merch checkout | No | No | Yes | Future Stripe/merch lane | Owner/First Owner future lane | Not available | Money governance proof referenced | Kept disabled | Blocked |
| Provider refunds | No automation | No automation | Yes for automation | Future provider-refund lane | Manual/external support | Support can review | Money/legal/support proofs referenced | Kept manual/external | Closed for off-state |

## Enabled Public Systems

The app-controlled non-money public systems are enabled or verified behind their existing guards: authentication, forgot/reset password, profile, creator Platform pages, creator upload surfaces with storage/scan/account gates, Home, browse/search, title pages, player playback, favorites, continue watching, Chi'lly Chat, direct messages, chat calls, Watch-Party Live, Live Watch-Party, Live Stage/Live Room, reporting, blocking, account restriction fail-closed behavior, legal/support/account deletion links, settings, scoped Admin Command Center, scoped Admin Search, monitoring/runtime diagnostics, privacy-safe notifications, and safe unavailable/degraded states.

## Intentionally Disabled Systems

These systems remain disabled because they require live money, provider setup, or a separate owner-approved lane: `live_money_enabled`, creator tips, paid creator videos, paid Watch-Party rooms/tickets, Creator Channel Subscription, VIP paid passes, paid creator events, creator payouts, payable creator balances, withdrawals, cash-out, transfers, Stripe Connect, Stripe live payout/merch, merch checkout, provider refund automation, automatic refunds, Premium annual, and public Premium monthly purchase.

## Route And Navigation Proof Summary

Public route files exist for auth, reset, profile, channel, Home, explore, library, title, player, chat, watch-party, live-stage, settings, support, legal, account deletion, Premium terms, DMCA/copyright, and admin. Admin/staff routes remain scoped and deny normal users through `canAccessAdminConsole`, active platform role membership, exact permissions, beta/access state, and fail-closed UI copy.

Watch-Party/Live routes remain available only through existing auth, Premium, runtime control, account restriction, blocked-user, and LiveKit authority gates. Direct/deep links either resolve to the guarded route or show safe unavailable/login copy.

## Disabled Copy Cleanup Summary

User-facing monetization proof copy was replaced with public-safe unavailable copy. Paid creator video and Watch-Party Seat Pass buttons now disable with "Not Available Yet" copy unless live money and paid checkout runtime switches are explicitly enabled by a separate approved lane. Provider product identifiers are no longer shown in that public monetization unavailable card.

## Remaining Blockers

- Premium monthly public purchase remains pending a separate owner-approved purchase proof lane.
- Premium annual remains provider-blocked until Google Play annual base plan setup and RevenueCat mapping are complete.
- Creator Channel Subscription remains provider-blocked until the Google Play base-plan issue is resolved.
- Creator-money and all payout/Stripe/merch/refund automation systems remain future lanes.

## Owner Action Items

- Decide whether to run a separate Premium monthly public purchase proof lane.
- Resolve Google Play annual/channel base-plan blockers before showing annual or channel subscription as buyable.
- Keep creator-money, payouts, Stripe/merch, live-money, and provider refund automation off until separate owner-approved lanes prove them.

## Proof References

Existing proofs and guards remain part of this switchboard boundary: Money admin authority governance, Admin Search privacy/export governance, legal/privacy/Data Safety alignment, monitoring analytics crash diagnostics, account restriction appeals, reporting/moderation workflow, event/chat report affordances, content takedown decisions, live-room moderation incident response, chat/call moderation notification abuse, staff role hierarchy, role terminology lock, Admin role scope, Moderator role scope, First Owner authority, Owner/Admin Command Center UI, Watch-Party LiveKit, old-room handling, refresh policy, profile production policy, Rachi official policy, critical UX polish, platform brand studio, clip studio, creator video Circle visibility, and creator feed fanout.
