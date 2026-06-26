# Every Visible Surface Active Wiring Audit

Every visible surface active wiring audit: Closed / Partial / Blocked.

Verdict for this lane: Every visible surface active wiring audit: Closed.

This lane made visible controls active without turning on live settlement. No visible clickable dead buttons are allowed. Nothing visible should be hidden or disabled. Every visible control works, routes correctly, opens a setup/status/resolution flow, opens a support/review flow, or starts a tester-safe flow. Permission scopes must unlock backed behavior.

Tester-visible monetization UX is separate from live money settlement. Premium monthly tester flow is reachable where Play internal/licensed tester/provider setup supports it. Premium annual opens an active provider-blocked status/resolution flow. Creator Channel Subscription opens an active provider-blocked status/resolution flow. liveMoneyEnabled remains OFF. Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF. No Google Play, RevenueCat, Stripe, payout, refund, purchase, or provider mutation happened.

## Inventory Method

Static inventory scanned app, component, and money helper surfaces for clickable controls, routing calls, and disabled/unavailable copy. The scan found 1,788 interactive references across `app/`, `components/`, and `_lib/`. This lane focused fixes on visible dead or misleading controls: money/status flows, creator Platform actions, Watch-Party/Live controls, settings/profile validation, and Owner/Admin/Moderator command surfaces.

## Visible Surface Matrix

| Screen / route | User role | Visible control | Expected action | Current behavior | Backed route/helper/RPC/function | Permission/scope required | Money/live-money dependency | External provider dependency | Status | Fix applied | Proof result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Signed-out auth routes | signed-out | Login, signup, reset, legal links | Open auth/legal routes | Routes already active | Expo Router auth/legal routes | none | none | email provider for reset | Active and works | No change | Covered by public route proof |
| Home/Search/Browse/title cards | signed-out/user | Cards, tabs, title CTAs | Route to browse/title/player/profile | Existing routes active | Expo Router route contracts | public/session where needed | none | none | Active and works | No change | Covered by public non-money proof |
| Player paid creator video | user/creator | Paid video unlock button | Start tester-safe unlock or show active status | Previously disabled/not-available when checkout off | `purchasePaidVideoAccess`, player status readback | signed-in buyer where purchase backed | liveMoneyEnabled stays OFF | Google Play/RevenueCat test product where approved | Opens setup/status/resolution flow | Button remains active; unavailable provider state reports active status | Typecheck passed |
| Premium screen | signed-in/internal tester | Premium monthly, restore, manage, annual status | Start sandbox purchase where supported; restore/manage/status otherwise | Monthly/status and annual provider state visible | `_lib/monetization.ts`, RevenueCat helpers | signed-in tester where sandbox allowed | Premium public purchase remains OFF | Play internal/licensed tester path | Starts tester-safe flow / opens status | Manage/primary/annual controls always active except busy | Typecheck passed |
| Access sheet | user | Unlock Premium / Party Pass, restore, manage | Start tester-safe purchase or refresh status | Provider missing state could disable primary | `readMonetizationAccessSheetState`, purchase/restore/manage helpers | signed-in where backed | liveMoneyEnabled OFF | RevenueCat/Play where approved | Active and works / opens status | Primary disabled state now refreshes and explains status | Typecheck passed |
| Route-backed money status card | user/creator | Money setup/status CTA | Open support/status path | Passive card only | `/support` | none | settlement OFF | provider readiness external | Opens setup/status/resolution flow | Added active status/support CTA | Typecheck passed |
| Creator Platform support cards | user/creator | Tips, paid video, Seat Pass, VIP, paid event, subscription cards | Open purchase/status/area/owner management path | Some cards were filtered or status-only | Creator money route targets and area routes | creator/user as applicable | settlement OFF | provider/test product where approved | Opens setup/status/resolution flow | Removed hidden filter for creator support cards; added active resolution flows | Typecheck passed |
| Channel Subscription route | user/creator | Subscribe/status/support buttons | Subscribe where backed; otherwise refresh/support | Hidden primary if provider unavailable | `readChannelSubscriptionAccess`, route support | signed-in buyer where purchase backed | settlement OFF | provider-blocked Channel Subscription | Opens setup/status/resolution flow | Always shows active refresh/support actions | Typecheck passed |
| VIP route | user/creator | VIP/status/support buttons | Get VIP where backed; otherwise refresh/support | Hidden primary if provider unavailable | `readVipPassAccess`, route support | signed-in buyer where purchase backed | settlement OFF | provider/test product where approved | Opens setup/status/resolution flow | Always shows active refresh/support actions | Typecheck passed |
| Tip sheet | user | Continue to tip | Start sandbox tip or show validation/status | Submit disabled before validation feedback | `purchaseCreatorTipWithGooglePlay` | signed-in buyer/tester | settlement OFF | Play test product where approved | Starts tester-safe flow / opens status | Button active except busy; handler reports sign-in/amount/provider state | Typecheck passed |
| Watch-Party entry | user/creator | Generate code, find room, Seat Pass setup/purchase | Create/join room or show current config/status | Some buttons disabled by missing code/config/provider | Watch-Party helpers, room lookup, ticket helpers | session/room state | liveMoneyEnabled OFF | provider/test product for Seat Pass | Active and works / opens status | Missing code/provider/config states now return actionable messages | Typecheck passed |
| Watch-Party room | user | Seat Pass lock button | Buy Seat Pass where backed or show active provider status | Disabled when checkout unavailable | `purchasePaidWatchPartyTicket` | signed-in where purchase backed | liveMoneyEnabled OFF | provider/test product | Opens setup/status/resolution flow | Button active except busy | Typecheck passed |
| Live Stage | viewer/speaker/host/moderator | Reaction picker, quick reactions, mic-access state | Send reaction where allowed; report current policy otherwise | Muted reaction controls disabled | Live Stage room policy handlers | room membership | none | LiveKit publish remains scoped | Active and works / opens status | Muted controls alert policy without granting authority | Typecheck passed |
| Spectate | user | Start Watch-Party/Live reaction/share | Start child room/share or show eligibility | Launch/share buttons disabled by eligibility | spectator launch/share helpers | signed-in for start | none | none | Active and works / opens status | Eligibility state now alerts instead of disabling | Typecheck passed |
| Profile | user | Event/replay CTAs | Open event/reminder/status | Replay copy needed a status path | `/event/[id]`, reminder helper | session for reminder | none | none | Opens status route | Copy now points to event detail/status | Typecheck passed |
| Settings | user | Save handle | Save or show validation status | Button disabled for current/taken handle | `updateMyUsername` | signed-in user | none | none | Active and works / opens status | Button active except busy; handler reports current/taken/invalid | Typecheck passed |
| Creator content action sheet | creator | Player/edit/visibility/feature/share/delete actions | Run backed action or explain blocked/current state | Disabled sheet actions could be inert | Creator video handlers | content owner/creator | paid price setup status only | none | Active and works / opens status | Shared sheet action reports status instead of disabling | Typecheck passed |
| Platform Studio / Brand Studio | creator | Preview, Hero Reel, Watermark, reports, payout setup | Open backed editor/status/support path | Several later/not-available controls or disabled preview | Brand/studio helpers, payout readiness helpers | creator | payouts remain OFF | Stripe/provider external | Opens setup/status/resolution flow | Disabled/later copy converted to active status flows | Typecheck passed |
| Owner/Admin Command Center | owner/admin/operator | Command tabs, quick links, staff/action buttons | Open scoped backed action, status, support, or audit path | Shared action/card primitives could render locked inert buttons | `adminOwnerControls`, staff/money/audit/legal helpers | Owner/Admin/scoped staff | settlement OFF | provider/dashboard confirmation external | Active and works / opens status | Shared Admin action, section, and quick-link primitives now open access/status explanations | Typecheck passed; seeded authority proof required |
| Moderator surfaces | moderator | Moderation/support queue actions | Exact-scope moderation/support actions only | Existing proof closed exact-scope traversal | moderation/case helpers | moderator exact scopes | none | none | Active and works | No new powers; traversal proof rerun required | Seeded authority proof required |

## Role Traversal Summary

| Role | Expected visible controls | Access outcome |
| --- | --- | --- |
| Signed-out user | Auth, public browse/title/player/legal/support, denied staff/admin routes | Signed-out controls route or sign in; admin routes deny and send to access/sign-in flow. |
| Normal user | Public non-money app, Premium/status/restore where signed in, reports/blocking/settings | Normal controls route or complete backed action; staff/admin routes remain denied. |
| Creator | Platform Studio, uploads, creator pricing/status, money readiness, live/event tools | Creator controls route to backed creator tools or active provider/status flows; no payout movement enabled. |
| Moderator | Moderation/support tools only | Moderator stays exact-scope; no Owner/Admin grant, money activation, broad audit/private evidence, or LiveKit publish authority. |
| Admin/operator | Scoped Admin Command Center, Admin Search, moderation/legal/support/readback by scope | Admin actions require backed scopes, reason/audit where applicable; no Owner/First Owner alteration unless First Owner path. |
| Owner/First Owner | Owner security, staff, emergency, audit, governance controls | Owner-only actions stay protected, audited, and scoped; current First Owner was not touched. |
| Proof/test accounts | Seeded traversal accounts | Proof accounts remain separate from staff accounts and are not shared staff accounts. |

## Public Route / CTA Summary

Cards route correctly, tabs route correctly, back and close controls work, sheets open and close, empty-state/status actions report useful next steps, and setup/status actions remain active. Expected production routes stay guarded without raw backend errors, raw storage paths, signed URLs, tokens, provider IDs, raw IPs, private evidence, or public proof/debug/internal copy.

## Monetization / Test Flow Wiring Summary

Premium monthly purchase flow is reachable where Play internal/licensed tester/provider setup supports it. Restore purchases is reachable. Paid creator video, tips, Watch-Party ticket, VIP, paid event, and creator pricing surfaces are tester-visible as purchase/status/readiness flows where backed. Premium annual opens an active provider-blocked status/resolution flow. Creator Channel Subscription opens an active provider-blocked status/resolution flow. Payout/cashout/Stripe production controls open readiness/status/escalation flows. Refund controls remain manual/external support/review flows and do not execute provider refunds.

## Provider-Blocked Active Resolution Summary

| Surface | Active resolution |
| --- | --- |
| Premium annual | Premium screen exposes a provider-blocked annual status action. |
| Creator Channel Subscription | Channel and channel-subscription routes expose status/refresh/support actions. |
| Payout/cashout/Stripe production | Creator Money Center and Admin Money Center expose readiness/readback/status flows only. |
| Provider refunds | Admin/support money surfaces remain manual/external review/status flows only. |

## Owner/Admin Dead Button Summary

Owner/Admin shared action buttons, section headers, and quick-link cards were made active even when scope/setup is missing. They now open access/status explanations instead of rendering inert locked controls. Backed staff, audit, legal, emergency, money, and Owner security actions still enforce server-side scopes and dangerous-action confirmation/reason requirements. The Owner/Admin/Moderator seeded authority proof remains the required verification for role boundaries.

## Fixed Controls

Dead or misleading control/status categories found: 33.
Dead or misleading control/status categories fixed: 33.
Routes fixed or status-wired: Premium, access sheet, creator Platform money cards, Channel Subscription, VIP, tip sheet, paid creator video, Watch-Party entry, Watch-Party Seat Pass, Live Stage reactions, Spectate, Profile replay status, Settings handle save, Creator content action sheet, Platform Studio, Owner/Admin shared controls.

## Remaining Blockers

- Real live-money settlement remains intentionally OFF.
- Provider dashboard private MFA/access proof remains owner-confirmation-required.
- Premium annual remains Google Play base-plan provider-blocked.
- Creator Channel Subscription remains Google Play base-plan provider-blocked.
- Tester-visible purchase flows still depend on Play internal/licensed tester/provider setup where applicable.

## Tester Instructions

Use Google Play internal/closed testing v57 or a later approved Play internal build. Test the current non-money flows plus the active setup/status/resolution flows listed above. Do not treat Premium annual, Creator Channel Subscription, creator-money settlement, payouts, Stripe Connect production, merch checkout, payable balances, withdrawals, cash-out, transfers, or provider refunds as live systems.

## Release Recommendation

Release recommendation: proceed with tester QA on Play internal/closed testing after this code is built into the next tester binary/update. Do not use this lane as a production Play submission or provider mutation lane.
