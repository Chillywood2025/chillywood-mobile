# Seven-Flow Production Prep Checklist

Date: 2026-06-25

Money admin authority update: this prep checklist does not activate money. Dual approval is required for future payout activation and future `live_money_enabled`; emergency money kill switch is First Owner/Owner-controlled and audited; no Google Play, RevenueCat, Stripe, payout, purchase, refund, or product mutation happened.

Verdict: Partial.

This checklist prepares the seven money/access flows for controlled production activation later. It does not activate live money, creator-money flows, payouts, payable balances, withdrawals, cash-out, transfers, provider refunds, or Premium product/pricing changes.

Seven-flow app-side proof: Closed.

Seven-flow production switchboard: Partial.

Seven-flow production prep: Partial. The flows are prepared behind explicit switches with documented provider mappings, owner activation steps, support/refund/dispute policy, monitoring/readback expectations, and rollback paths. Production activation remains blocked until owner approval and production provider verification are complete per flow.

Seven-flow provider verification: Partial. Provider verification used browser dashboard evidence. The configured product IDs are present in Google Play Console and RevenueCat and match the repo/app configuration; production activation remains blocked by owner approval and, for creator-money flows, owner decision on whether to keep sandbox-labeled configured IDs or replace them with production-labeled IDs.

Creator-money production-labeled products: Partial. Owner chose option B: clean production-labeled IDs are required before creator-money launch. The owner approved the recommended production IDs, recommended starting prices, Google Play-valid hyphenated purchase-option IDs, and United States only first. Google Play now has five one-time production-labeled Draft records (`cw_creator_tip_099`, `cw_paid_content_access_099`, `cw_watch_party_ticket_099`, `cw_vip_pass_499`, `cw_event_pass_099`), and RevenueCat imported those five as Draft consumables with no entitlement attachment and no Premium mapping. Google Play also has the channel subscription product record `cw_channel_subscription_monthly_499` / `Creator Channel Subscription`, but the required `monthly` base plan remains missing because Google Play marks the `Base plan ID` field invalid before Save on stale and clean forms. Channel Subscription base plan: Blocked. Channel Subscription RevenueCat import/mapping remains blocked until the matching Google Play base plan exists.

Creator-money production-labeled product IDs: Blocked.

Creator-money tax/legal/compliance plan: Partial.

Creator-money product creation: Partial.

Purchase-option IDs use Google Play-valid hyphenated values.

Codex must not guess tax/legal/compliance fields.

Real-money activation: Off by default unless owner explicitly enables each flow.

Creator payouts: Off unless separate payout lane enables them.

Provider refunds: Manual/external unless separate provider-refund lane enables automation.

Stripe payout and merch prep documented separately.

Stripe payouts remain OFF.

Stripe merch checkout remains OFF.

Premium-first launch candidate: Pending owner activation/provider final check.

Premium-first activation proof: Partial. Premium monthly: Verified at `$9.99/month`. Premium annual: Blocked at `$99.99/year`. Premium annual: Provider-blocked pending Google Play support/base-plan resolution. Google Play `premium_subscription` has active monthly base plan `monthly`, United States, `USD 9.99`; RevenueCat offering `premium` has package `$rc_monthly` mapped to `premium_subscription:monthly` and entitlement `premium`. The annual Google Play base-plan attempt reached approved values (`annual`, Yearly, United States only, `USD 99.99`) but Google Play kept `Base plan ID` invalid and returned `Your changes couldn't be saved`; no saved annual base plan and no RevenueCat `premium_subscription:annual` / `$rc_annual` mapping exists. No Premium purchase sheet was opened, no purchase was completed, and Premium public activation remains OFF. Premium launch still requires licensed/internal purchase proof and owner approval.

Creator-money flows: Prepared behind switches / OFF by default / activation requires owner/provider approval.

Creator-money activation remains a separate future lane.

Channel Subscription remains provider-blocked until Google Play base plan issue is resolved. Creator Channel Subscription: Provider-blocked pending Google Play support/base-plan resolution. Google Play support packet: Submitted through Google Play Console Help on 2026-06-25 at 12:25 CDT; case ID pending. No provider products/base plans were changed.

Provider verification used browser dashboard evidence. All activation switches remain OFF; production provider products are verified only where dashboard/API evidence exists.

Sandbox-labeled IDs remain sandbox/test-only unless owner explicitly approves otherwise.

Approved starting prices are launch defaults, not the only future prices.

Future custom pricing requires provider-backed price tiers/products/base plans/offers.

Unsupported custom amounts fail closed.

United States only first.

Do not activate creator-money until production-labeled IDs are verified, mapped, smoke-tested, and owner-approved.

## Current Defaults

| Flow | Switch | Default state | Production activation status |
| --- | --- | --- | --- |
| Premium | `premiumEnabled`; purchase shell `premiumPurchaseEnabled=false` | Entitlement read-only; purchase off | Pending owner activation/provider final check |
| Tips | `tipsEnabled` / `tips_enabled` | Off | Off; blocked pending owner/provider approval |
| Paid Video | `paidVideoEnabled` / `paid_content_enabled` | Off | Off; blocked pending owner/provider approval |
| Watch-Party Ticket | `watchPartyTicketEnabled` / `watch_party_tickets_enabled` | Off | Off; blocked pending owner/provider approval |
| Channel Subscription | `channelSubscriptionEnabled` / `digital_sales_enabled` | Off | Off; blocked pending owner/provider approval |
| VIP | `vipEnabled` / `digital_sales_enabled` | Off | Off; blocked pending owner/provider approval |
| Event Pass | `eventPassEnabled` / `digital_sales_enabled` | Off | Off; blocked pending owner/provider approval |

## Flow-By-Flow Readiness Matrix

| Flow | Required provider product ID | Provider type | Google Play status | RevenueCat status | Entitlement/access mapping | Route/surface | Exact access created | Exact access not created | Revoke behavior | Refund/support behavior | Rollback switch | Monitoring/readback | Launch owner decision needed | Remaining blocker |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Premium | `premium_subscription` | Subscription | Monthly verified active; annual blocked by Google Play save error | Monthly RevenueCat product, entitlement `premium`, and `premium` offering/package verified; annual missing | `user_entitlements.entitlement_key=premium` | `/subscribe`, Premium gates, Settings Premium management | App-wide Premium entitlement only | No creator access grant, creator earning, payout, paid video unlock, VIP, ticket, event pass, room authority, or LiveKit publish authority | `revoked_at` and provider entitlement readback block Premium | Store/provider plus app support; no instant refund promise | Keep purchase shell off | RevenueCat customer, Google Play subscription, entitlement row, restore/readback, revoke/readback | Yes | Resolve Premium annual provider blocker, then owner activation and final Premium smoke |
| Tips | `cw_creator_tip_099` | One-time product | Draft Google Play product exists with `tip-099`, US-only, USD 0.99 | Draft RevenueCat consumable imported; no entitlement | Ledger/readback only; no durable access | Public Platform tip/support sheet, Money Center | None | No Premium, paid video, ticket, subscription, VIP, event, badge, ranking, LiveKit, payout, or payable balance | No access revoke; support can mark/review local records only | Accidental/duplicate/unauthorized review is manual/external; no instant refund promise | `tips_enabled=off`; global `live_money_enabled=off` | Intent, provider event, ledger/readback, not-payable state, support case | Yes | Keep draft off; activation/provider smoke still required; payouts remain off |
| Paid Video | `cw_paid_content_access_099` | One-time product | Draft Google Play product exists with `paid-video-099`, US-only, USD 0.99 | Draft RevenueCat consumable imported; no entitlement | `paid_content_access` grant for one video/source | `/player/[id]` | Exact video/source access only | No Premium, other videos, subscription, VIP, ticket, event, LiveKit authority, payout, or payable balance | Revoke exact target grant; route/readback locks target | Manual/provider review for access failure, early removal, DMCA/removal, or platform fault | `paid_content_enabled=off`; global `live_money_enabled=off` | Paywall, intent, provider event, access grant, content grant, revoke/readback | Yes | Keep draft off; activation/provider smoke still required |
| Watch-Party Ticket | `cw_watch_party_ticket_099` | One-time product | Draft Google Play product exists with `ticket-099`, US-only, USD 0.99 | Draft RevenueCat consumable imported; no entitlement | `watch_party_live_ticket` grant for one Party Room / Watch-Party target | `/watch-party/[partyId]` | Same-room ticket access only | No Premium, other room, Live Stage route, LiveKit publish, host, speaker, moderator, paid video, VIP, subscription, event pass, payout, or payable balance | Revoke same-room grant/resolver | Manual/provider review for ended/failed/no-show/platform fault | `watch_party_tickets_enabled=off`; global `live_money_enabled=off` | Room id, offer id, intent, provider event, ticket row, grant, revoke/readback | Yes | Keep draft off; activation/provider smoke still required |
| Channel Subscription | `cw_channel_subscription_monthly_499:monthly` | Subscription | Google Play subscription product exists; `monthly` base plan blocked by Base plan ID validation before Save | Missing RevenueCat production product; entitlement `creator_channel_subscription` exists for sandbox product only | `channel_subscription` grant/subscription state for one creator channel | `/channel-subscription/[creatorId]`, Public Platform subscriber area, Money Center | Subscriber access for one creator channel | No Premium, VIP, paid video, ticket, event, other creator subscription, LiveKit authority, payout, or payable balance | Provider lifecycle/revoke/expiration and effective access resolver | Manual/provider review for missing entitlement, cancellation/expiration, creator inactivity, or subscriber-only access issue | `digital_sales_enabled=off`; global `live_money_enabled=off` | Product/base plan, subscription row, provider lifecycle event, access grant, effective access | Yes | Resolve Google Play Base plan ID validation blocker; lifecycle smoke still required |
| VIP | `cw_vip_pass_499` | One-time product | Draft Google Play product exists with `vip-499`, US-only, USD 4.99 | Draft RevenueCat consumable imported; no entitlement | `vip_pass` grant/pass state for one creator | `/vip-pass/[creatorId]`, creator VIP area, Money Center | VIP access for one creator | No Premium, channel subscription, paid video, ticket, event, other creator VIP, LiveKit authority, payout, or payable balance | Revoke exact creator VIP grant/pass | Manual/provider review for missing access, unavailable perks, early removal, or misrepresentation | `digital_sales_enabled=off`; global `live_money_enabled=off` | Creator id, offer id, provider event, VIP pass, access grant, revoke/readback | Yes | Keep draft off; activation/provider smoke still required |
| Event Pass | `cw_event_pass_099` | One-time product | Draft Google Play product exists with `event-099`, US-only, USD 0.99 | Draft RevenueCat consumable imported; no entitlement | `event_pass` grant/pass for one creator event | `/event/[eventId]`, Public Platform event cards, Money Center | Pass for one event only | No Premium, VIP, subscription, paid video, room ticket, other event, LiveKit authority, payout, or payable balance | Revoke exact event pass; canceled/ended policy still gates | Manual/provider review for canceled/rescheduled/ended/unavailable event | `digital_sales_enabled=off`; global `live_money_enabled=off` | Event id, offer id, provider event, pass row, access grant, cancel/expire/revoke readback | Yes | Keep draft off; activation/provider smoke still required |

## Provider Mapping Matrix

| Flow | Product ID in repo | Production product ID | Product type | Provider | Google Play check | RevenueCat check | Offering/package expectation | Entitlement/access mapping | Restore behavior | Revoke/refund behavior | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Premium | `premium_subscription` | Same unless owner approves a different product | Subscription | Google Play / RevenueCat | Monthly verified active; annual `annual` blocked by Google Play save error after approved values | Monthly product, offering `premium`/package `$rc_monthly`, entitlement `premium` verified; annual `premium_subscription:annual` missing | Premium offering/package exposes the active monthly Google Play product; annual package pending | `user_entitlements` Premium only | RevenueCat restore plus backend entitlement readback | Manual/provider refund; entitlement revoke/readback | Monthly verified; annual blocked; owner activation pending |
| Tips | `cw_creator_tip_sandbox_099` | Owner decision: keep sandbox-labeled ID or replace | One-time product | Google Play / RevenueCat | Verified active configured product | Verified product; no entitlement | Not applicable for current direct product flow | Ledger/readback only | Not restorable as access | Manual/external; no access revoke | Verified for configured sandbox-labeled product; owner decision pending |
| Paid Video | `cw_paid_content_access_sandbox_099` | Owner decision: keep sandbox-labeled ID or replace | One-time product | Google Play / RevenueCat | Verified active configured product | Verified product; no entitlement | Not applicable for current direct product flow | Exact `paid_content_access` target | Route/readback restores access from backend grant | Manual/external refund; exact revoke | Verified for configured sandbox-labeled product; owner decision pending |
| Watch-Party Ticket | `cw_watch_party_live_ticket_sandbox_099` | Owner decision: keep sandbox-labeled ID or replace | One-time product | Google Play / RevenueCat | Verified active configured product | Verified product; no entitlement | Not applicable for current direct product flow | Exact `watch_party_live_ticket` target | Route/readback restores access from backend grant | Manual/external refund; exact revoke | Verified for configured sandbox-labeled product; owner decision pending |
| Channel Subscription | `channel_subscription_sandbox_monthly_499:monthly` | Owner decision: keep sandbox-labeled ID/base plan or replace | Subscription | Google Play / RevenueCat | Verified active configured subscription/base plan | Verified product and entitlement `creator_channel_subscription` | Not applicable for current direct product fallback unless owner requires a package | Exact creator `channel_subscription` | Provider lifecycle + backend effective access | Manual/external refund; lifecycle revoke/expire | Verified for configured sandbox-labeled product; owner decision pending |
| VIP | `cw_vip_pass_sandbox_499` | Owner decision: keep sandbox-labeled ID or replace | One-time product | Google Play / RevenueCat | Verified active configured product | Verified product; no entitlement | Not applicable for current direct product flow | Exact creator `vip_pass` | Backend exact-target readback; provider ownership prevents duplicate purchase | Manual/external refund; exact revoke | Verified for configured sandbox-labeled product; owner decision pending |
| Event Pass | `cw_event_pass_sandbox_099` | Owner decision: keep sandbox-labeled ID or replace | One-time product | Google Play / RevenueCat | Verified active configured product | Verified product; no entitlement | Not applicable for current direct product flow | Exact `event_pass` target | Backend exact-target readback | Manual/external refund; exact revoke/expire | Verified for configured sandbox-labeled product; owner decision pending |

Provider-doc posture checked on 2026-06-25: Google Play subscriptions require subscription/base-plan setup and activation for availability, one-time products are separate from subscriptions, and RevenueCat products should be attached to entitlements and grouped into offerings/packages where used. This prep lane records the required checks without changing provider products.

## Switch / Off-State Matrix

| Flow | OFF state CTA | Direct intent | Provider sheet | Access grant | Safe copy | Live-money/payout side effect | Emergency stop |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Premium | Purchase closed; entitlement/manage/restore only where safe | Blocked unless approved Premium purchase shell opens | Does not open for public/default purchase | No new Premium entitlement without provider verification | Premium purchase unavailable / restore/manage only | No creator payout or payable balance | Premium purchase hold stays separate; `live_money_enabled=off` remains global safety |
| Tips | Hidden/disabled | Blocked unless approved switch/tester/provider state passes | Does not open | None | Tips unavailable / setup pending | None | `live_money_enabled=off` stops new creator-money purchases |
| Paid Video | Disabled | Blocked unless switch/tester/provider state passes | Does not open | None | Paid video unavailable / setup pending | None | `live_money_enabled=off` stops new unlock purchases |
| Watch-Party Ticket | Disabled | Blocked unless switch/tester/provider state passes | Does not open | None | Ticket unavailable / room setup pending | None | `live_money_enabled=off` stops new ticket purchases |
| Channel Subscription | Disabled | Blocked unless switch/tester/provider state passes | Does not open | No new subscription/grant | Subscription unavailable / setup pending | None | `live_money_enabled=off` stops new subscription purchases |
| VIP | Disabled | Blocked unless switch/tester/provider state passes | Does not open | None | VIP unavailable / setup pending | None | `live_money_enabled=off` stops new VIP purchases |
| Event Pass | Disabled | Blocked unless switch/tester/provider state passes | Does not open | None | Event pass unavailable / setup pending | None | `live_money_enabled=off` stops new event pass purchases |

## Premium-First Launch Plan

Premium may be the first real-money launch candidate, but this lane does not turn it on.

Before Premium goes live:

- Owner explicitly approves Premium activation by product ID and rollout window.
- Google Play subscription and base plan are verified active/approved.
- RevenueCat product, offering/package, and entitlement `premium` are verified.
- Premium launch requires both monthly and annual unless the owner changes that decision. Monthly is verified at `$9.99/month`; annual is blocked at `$99.99/year` until Google Play saves base plan `annual` and RevenueCat maps `premium_subscription:annual` into offering `premium`.
- Premium purchase shell is intentionally opened only for the approved environment.
- Premium gates remain backed by provider/backend entitlement readback, not local UI state.
- Restore/manage/cancel behavior is smoke-tested on a Play-installed build.
- Support/refund copy is checked for manual/provider handling and no instant refund promise.
- Monitoring is checked for purchase open, purchase result, entitlement readback, restore, revoke, error, and support case events.
- Rollback path is checked: close Premium purchase shell, keep entitlement readback strict, preserve valid entitlements unless provider/revoke policy says otherwise.
- Final smoke checks: signed-out Premium gate, signed-in free gate, active Premium readback, revoked Premium readback, restore path, manage/cancel link, no creator product unlock.

What stays off:

- Tips, Paid Video, Watch-Party Ticket, Channel Subscription, VIP, and Event Pass remain off.
- `live_money_enabled` remains off for creator-money flows until a separate owner activation lane.
- `payouts_enabled` remains off.
- No payable balances, withdrawals, cash-out, transfers, or creator payout movement are enabled.

Premium must not unlock creator products. Premium creates only the Premium entitlement and must not grant paid video, ticket, channel subscription, VIP, event pass, creator earnings, payout, room authority, or LiveKit publish authority.

## Creator-Money Future Activation Plan

Creator-money flows remain off by default because production provider items, owner activation decisions, support staffing, and payout expectations are not complete in this lane.

Recommended conservative activation order:

| Order | Flow | Reason |
| --- | --- | --- |
| 1 | Tips | Lowest access complexity because tips unlock nothing. Payout expectations still need tight copy because payouts remain off. |
| 2 | Paid Video | Exact-target access is simple to read back and revoke, but content takedown/refund handling must be staffed. |
| 3 | Event Pass / Watch-Party Ticket | Time-bound access needs stronger operations coverage for canceled/rescheduled/failed events or rooms. |
| 4 | Channel Subscription | Subscription lifecycle and creator inactivity support make it more operationally complex. |
| 5 | VIP | Highest expectation risk because perks are creator-defined and support must police unavailable/misrepresented perks. |

Activation requirements for every creator-money flow:

- Owner approval naming the exact flow and product ID.
- Production Google Play product verified.
- Production RevenueCat product/offering/package verified where used.
- Creator eligibility gates confirmed.
- Payout expectations visible: creator earnings/payouts are not live unless a separate payout lane enables them.
- Money Center shows exact current state and not-payable state where applicable.
- Creator cannot withdraw, cash out, transfer, or request payout movement while payouts are off.
- Support/refund/dispute runbook staffed.
- Moderation/content takedown handling staffed.
- Rollback switch tested.
- Revoke path tested for exact-target access flows.
- No payout/live-money side effects confirmed after activation.

## Support / Refund / Dispute Matrix

| Flow | Support path | Refund path | Dispute path | Revoked access behavior | Canceled/expired/unavailable behavior | Creator expectation copy | Viewer expectation copy | What not to promise | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Premium | Store/provider support plus app missing-entitlement support | Manual/provider review | Verify provider receipt externally | Premium gates deny when entitlement revoked/inactive | Subscription cancellation/expiration follows provider/backend readback | Premium is not creator earnings | Premium is app-wide only | No instant refunds; no creator product unlock | Ready as policy; provider check pending |
| Tips | Support reviews accidental/duplicate/unauthorized tips | Manual/external only | Provider/store dispute external | No access to revoke | Not applicable | Creator earnings/payouts are not live; not payable | Tips unlock nothing | No instant refunds; no payout promise | Ready as policy; provider check pending |
| Paid Video | Support reviews missing access, early content removal, DMCA/removal, platform fault | Manual/provider review | Use video id, intent, provider event, grant/readback | Exact video locks after revoke | Removed/unavailable content reviewed by support | Sales not payable unless payouts separately enabled | Unlocks this video only | No Premium unlock; no instant refunds | Ready as policy; provider check pending |
| Watch-Party Ticket | Support reviews ended/failed/no-show/platform fault | Manual/provider review | Use room id, offer id, intent, provider event, grant | Exact room locks after revoke | Failed/ended room reviewed by support | Ticket revenue not payable while payouts off | Ticket grants this room only, no authority | No LiveKit authority; no instant refunds | Ready as policy; provider check pending |
| Channel Subscription | Support reviews missing entitlement, cancellation/expiration, creator inactivity | Manual/provider review | Use provider period, subscription row, effective access | Effective access denies after revoke/expiration | Cancellation/expiration follows provider lifecycle | Subscription revenue not payable while payouts off | Creator subscription is not Premium | No Premium unlock; no payout promise | Ready as policy; provider check pending |
| VIP | Support reviews missing VIP, unavailable perks, early removal, misrepresentation | Manual/provider review | Use creator id, provider event, VIP pass, grant/readback | Exact creator VIP locks after revoke | Unavailable perks reviewed manually | VIP sales not payable while payouts off | VIP is creator-specific | No Premium unlock; no guaranteed perks refund | Ready as policy; provider check pending |
| Event Pass | Support reviews canceled/rescheduled/ended/unavailable event | Manual/provider review | Use event id, offer id, provider event, pass/readback | Exact event locks after revoke | Canceled/rescheduled/ended event reviewed manually | Event pass sales not payable while payouts off | Pass unlocks this event only | No instant refunds; no LiveKit authority | Ready as policy; provider check pending |

## Monitoring / Readback Matrix

| Flow | Purchase intent readback | Access grant readback | Entitlement readback | Failure/error readback | Support/admin readback | Analytics/Crashlytics expectation | Dashboard/provider check | Post-activation health check |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Premium | Purchase-open and provider result | Not creator grant | `user_entitlements` Premium row | Provider unavailable, restore failed, entitlement inactive | Support sees entitlement and provider status | Gate, purchase open, purchase result, restore, revoke, error | RevenueCat customer, Google Play subscription/base plan | Free gate, active entitlement, revoked entitlement, restore/manage |
| Tips | Intent, provider event, ledger | None | None | Product unavailable, intent blocked, provider error | Support sees intent/ledger/not-payable state | Tip sheet, blocked CTA, provider result, support request | Google Play one-time product, RevenueCat package | Tip blocked/off, tip success in approved mode, no access created |
| Paid Video | Intent and provider event | Exact video/source grant | None | Product unavailable, missing source, revoke/locked | Support sees video id, grant, intent, provider event | Paywall, blocked CTA, unlock result, grant readback, revoke | Google Play product, RevenueCat package | Exact video unlock, other video denied, revoke locks |
| Watch-Party Ticket | Intent and provider event | Exact room/ticket grant | None | Room unavailable, product unavailable, direct intent blocked | Support sees room id, offer id, ticket/grant | Ticket gate, blocked CTA, provider result, room readback | Google Play product, RevenueCat package | Exact room entry, other room denied, no LiveKit authority |
| Channel Subscription | Intent, provider event, subscription lifecycle | Exact creator subscription/grant | Creator subscription entitlement/readback only | Product unavailable, lifecycle failure, expired access | Support sees provider period, row, effective access | Subscribe gate, lifecycle event, cancel/expire, error | Google Play subscription/base plan, RevenueCat package/entitlement | Active period access, expired denied, cancel/revoke processed |
| VIP | Intent and provider event | Exact creator VIP grant/pass | None | Product unavailable, already-owned, missing creator | Support sees creator id, VIP pass, grant | VIP gate, blocked CTA, provider result, revoke | Google Play non-consumable, RevenueCat package | Exact creator VIP, other creator denied, revoke locks |
| Event Pass | Intent and provider event | Exact event pass/grant | None | Event unavailable, product unavailable, capacity/ended/canceled | Support sees event id, pass, grant | Event gate, blocked CTA, provider result, cancel/revoke | Google Play product, RevenueCat package | Exact event access, other event denied, canceled/expired denied |

## Owner Activation Checklist

Every activation decision must be per-flow. A single blanket approval is not enough.

| Flow | Owner approval | Provider verified | Switch value to change | Dry-run/readback command | Play-installed smoke required | Support/refund copy checked | Monitoring checked | Rollback checked | Revoke path checked | No payout side effects confirmed | Post-activation support owner assigned |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Premium | Required | Required | Open approved Premium purchase shell only | `npm run proof:seven-flow-production-prep` plus Premium entitlement/readback smoke | Yes | Yes | Yes | Yes | Yes | Yes | Required |
| Tips | Required | Required | `tips_enabled=on` only with `live_money_enabled` owner-approved for this flow | `npm run proof:seven-flow-production-prep` plus intent/readback smoke | Yes | Yes | Yes | Yes | Not applicable | Yes | Required |
| Paid Video | Required | Required | `paid_content_enabled=on` only with approved live-money state | `npm run proof:seven-flow-production-prep` plus exact video readback smoke | Yes | Yes | Yes | Yes | Yes | Yes | Required |
| Watch-Party Ticket | Required | Required | `watch_party_tickets_enabled=on` only with approved live-money state | `npm run proof:seven-flow-production-prep` plus exact room readback smoke | Yes | Yes | Yes | Yes | Yes | Yes | Required |
| Channel Subscription | Required | Required | `digital_sales_enabled=on` only with approved live-money state | `npm run proof:seven-flow-production-prep` plus lifecycle/readback smoke | Yes | Yes | Yes | Yes | Yes | Yes | Required |
| VIP | Required | Required | `digital_sales_enabled=on` only with approved live-money state | `npm run proof:seven-flow-production-prep` plus exact creator readback smoke | Yes | Yes | Yes | Yes | Yes | Yes | Required |
| Event Pass | Required | Required | `digital_sales_enabled=on` only with approved live-money state | `npm run proof:seven-flow-production-prep` plus exact event readback smoke | Yes | Yes | Yes | Yes | Yes | Yes | Required |

## Rollback / Kill-Switch Matrix

| Flow | Disable path | Purchase creation stop | Access preservation/revoke behavior | Logs/readbacks support needs | What not to do | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Global money master | Set/keep `live_money_enabled=off` | Blocks new creator-money purchase creation immediately | Existing access preserved unless policy says revoke | Switch audit, intent blocks, provider errors | Do not create balances or payouts to compensate | Closed for switchboard; activation pending |
| Premium | Close Premium purchase shell / keep `premiumPurchaseEnabled=false` | Stops new Premium purchase sheet opening | Existing valid Premium entitlement remains; revoked/inactive denies | RevenueCat customer, entitlement row, restore/revoke | Do not weaken Premium gates | Prepared; provider check pending |
| Tips | Set `tips_enabled=off` | Stops new tip intents/sheets | No durable access to preserve | Intent, provider event, ledger, support case | Do not promise payout or instant refund | Prepared; provider check pending |
| Paid Video | Set `paid_content_enabled=off` | Stops new unlock intents/sheets | Preserve exact grants unless revoke/refund policy applies | Video id, grant, intent, provider event | Do not unlock all videos | Prepared; provider check pending |
| Watch-Party Ticket | Set `watch_party_tickets_enabled=off` | Stops new ticket intents/sheets | Preserve exact room access unless revoke/refund policy applies | Room id, offer id, ticket/grant, provider event | Do not grant LiveKit authority | Prepared; provider check pending |
| Channel Subscription | Set `digital_sales_enabled=off` | Stops new subscriptions | Existing access follows provider lifecycle/effective access | Product/base plan, subscription row, lifecycle event | Do not manually fake active periods | Prepared; provider check pending |
| VIP | Set `digital_sales_enabled=off` | Stops new VIP purchases | Preserve exact creator VIP unless revoke/refund policy applies | Creator id, VIP pass, grant, provider event | Do not grant platform-wide VIP | Prepared; provider check pending |
| Event Pass | Set `digital_sales_enabled=off` | Stops new event pass purchases | Preserve exact event pass until expiration/cancel/revoke policy | Event id, pass row, grant, provider event | Do not grant all events | Prepared; provider check pending |

## Proof Command

Run:

```sh
npm run proof:seven-flow-production-prep
```

The proof is read-only/dry-run by default. It makes no real purchases, no provider refund calls, no payout calls, no transfers, no withdrawals, and prints no provider secrets or private user data. It writes sanitized artifacts to:

```text
/tmp/app-seven-flow-production-prep-proof-YYYYMMDD-HHMMSS/
```
