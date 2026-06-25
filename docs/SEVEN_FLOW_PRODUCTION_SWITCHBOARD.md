# Seven-Flow Production Switchboard

Date: 2026-06-25

Verdict: Partial.

This is a production-readiness switchboard for the app. It does not activate live money, creator payouts, payable balances, withdrawals, cash-out, transfers, provider refunds, Premium product changes, Premium gate weakening, RLS weakening, LiveKit authority changes, participant-cap changes, auth/reset changes, scan-gate weakening, abuse-throttle removal, or block-enforcement removal.

Seven-flow app-side proof: Closed.

Seven-flow production switchboard: Partial. The explicit switch catalog, default-safe governance, support policy, rollback policy, and dry-run proof artifacts are in place. Production activation remains blocked by owner decision, provider production product approval/mapping, and a separate live-money activation lane.

Seven-flow production prep: Partial. The production-prep checklist now records flow-by-flow provider mapping, owner activation steps, support/refund/dispute policy, monitoring/readback expectations, and rollback paths in `docs/SEVEN_FLOW_PRODUCTION_PREP_CHECKLIST.md`. It keeps activation blocked pending owner approval and provider production verification per flow.

Creator-money production-labeled products: Partial. Owner chose option B: sandbox-labeled creator-money product IDs remain sandbox/test-only, and clean production-labeled IDs must be created before creator-money launch. The owner approved the recommended production IDs, recommended starting prices, and United States only first. Google Play now has the channel subscription product record `cw_channel_subscription_monthly_499` / `Creator Channel Subscription`, but the `monthly` base plan remains missing. The five one-time products remain blocked by product icon and age rating requirements plus tax/compliance and purchase-option setup. RevenueCat import/mapping remains blocked until matching Google Play products/base plans exist. See `docs/CREATOR_MONEY_PRODUCTION_PROVIDER_PRODUCTS.md`.

Creator-money production-labeled product IDs: Partial.

Creator-money tax/legal/compliance plan: Partial.

Creator-money product creation: Partial.

Codex must not guess tax/legal/compliance fields.

Real-money activation: Off by default unless owner explicitly enables each flow.

Creator payouts: Off unless separate payout lane enables them.

Provider refunds: Manual/external unless separate provider-refund lane enables automation.

Stripe payout and merch prep documented separately.

Stripe payouts remain OFF.

Stripe merch checkout remains OFF.

Approved starting prices are launch defaults, not the only future prices.

Future custom pricing requires provider-backed price tiers/products/base plans/offers.

Unsupported custom amounts fail closed.

United States only first.

Do not activate creator-money until production-labeled IDs are verified, mapped, smoke-tested, and owner-approved.

## Current Repo Truth

- Branch at lane start: `main`.
- HEAD at lane start: `a8a2d28d83c3465000b825cda47dbbfa7bcc33a6`.
- Working tree at lane start: existing untracked `artifacts/`, `deno.lock`, and `supabase/.temp/`; this lane leaves unrelated untracked files alone.
- Seven-flow proof status: Closed for app-side/sandbox proof across Premium, Tips, Paid Video, Watch-Party Ticket, Channel Subscription, VIP, and Event Pass.
- Provider configuration status: sandbox product mappings and Play/RevenueCat proof exist. Production product approval/readiness is not proved in this lane.
- Kill switch / feature flag system: `platform_money_kill_switches`, `_lib/moneyFeatureFlags.ts`, `_lib/featureFlags.ts`, and `_lib/sevenFlowSwitchboard.ts`.
- Firebase Remote Config/runtime config usage: Firebase Remote Config exists for non-money app feature flags and algorithm weights. Money activation uses backend money switches, not Firebase Remote Config.
- Current Play/RevenueCat product mapping status: sandbox mappings are documented below; production mappings require provider dashboard/owner approval before activation.
- Current default state: creator-money flows off; `live_money_enabled=off`; `payouts_enabled=off`; Premium entitlement readback remains available but `premiumPurchaseEnabled=false` and the Premium purchase shell is on hold.

## Switch Levels

| Switch level | Current source | Default | Behavior |
| --- | --- | --- | --- |
| Global money master | `live_money_enabled` | Off | Blocks live-money claims and production money movement. |
| Premium | `premiumEnabled` catalog plus `premiumPurchaseEnabled=false` / Premium shell hold | Entitlement read-only; purchase off | Keeps Premium gates/readback intact while purchase creation stays closed unless owner opens it later. |
| Tips | `tipsEnabled` -> `tips_enabled` | Off | Blocks public tip activation. |
| Paid Video | `paidVideoEnabled` -> `paid_content_enabled` | Off | Blocks paid-content live activation. |
| Watch-Party Ticket | `watchPartyTicketEnabled` -> `watch_party_tickets_enabled` | Off | Blocks paid Watch-Party ticket live activation. |
| Channel Subscription | `channelSubscriptionEnabled` -> `digital_sales_enabled` plus provider product readiness | Off | Blocks creator subscription live activation. |
| VIP | `vipEnabled` -> `digital_sales_enabled` plus provider product readiness | Off | Blocks VIP live activation. |
| Event Pass | `eventPassEnabled` -> `digital_sales_enabled` plus provider product readiness | Off | Blocks event pass live activation. |
| Environment | sandbox/internal/production labels in product rows, tester grants, runtime/provider state | Sandbox/internal only | Sandbox proof can run for approved testers; production purchases require a separate activation lane. |
| Creator eligibility | Premium/tool eligibility, creator setup rows, sandbox tester/internal access, owner/operator gates | Restricted | Unapproved creators see setup/unavailable state. |
| Provider availability | RevenueCat/Google Play product/readiness checks | Required | Missing provider product disables CTA with honest copy. |
| Emergency stop | `live_money_enabled=off` | Off | Stops new live purchase creation immediately; existing access is preserved unless the flow refund/revoke policy says to revoke. |

## Seven-Flow Switch Matrix

| Flow | Switch exists | Default state | Off behavior | Sandbox behavior | Production readiness | Emergency stop | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Premium | Yes, `premiumEnabled`; purchase switch is `premiumPurchaseEnabled=false` | Entitlement read-only; purchase off | Purchase CTA unavailable; Premium gates stay strict | Sandbox subscription/restore/webhook proof exists | Blocked until owner opens Premium purchase shell and provider production readiness is approved | `live_money_enabled` remains off; Premium revoke/readback still works | Partial |
| Tips | Yes, `tipsEnabled` | Off | CTA hidden/disabled; direct intent blocked for non-approved tester; no access grant | Sandbox ledger only, no durable access | Blocked pending production product approval and owner live-money decision | New tips blocked; no existing access to revoke | Partial |
| Paid Video | Yes, `paidVideoEnabled` | Off | Unlock CTA disabled; direct intent blocked; no provider sheet | Exact video access grant only; revoke/readback works | Blocked pending production product mapping/approval | New unlocks blocked; existing access preserved unless revoked | Partial |
| Watch-Party Ticket | Yes, `watchPartyTicketEnabled` | Off | Ticket CTA disabled; direct intent blocked; no provider sheet | Exact Party Room target grant only; no LiveKit authority | Blocked pending production product mapping/approval | New tickets blocked; existing ticket access stable unless revoked | Partial |
| Channel Subscription | Yes, `channelSubscriptionEnabled` | Off | Subscribe CTA disabled; direct intent blocked | Creator-channel access only; effective access handles expiration/revoke | Blocked pending production base plan/product approval | New subscriptions blocked; lifecycle/readback governs existing access | Partial |
| VIP | Yes, `vipEnabled` | Off | VIP CTA disabled; direct intent blocked | Creator-specific VIP only; no Premium/global unlock | Blocked pending production product approval | New VIP purchases blocked; existing VIP stable unless revoked | Partial |
| Event Pass | Yes, `eventPassEnabled` | Off | Event pass CTA disabled; direct intent blocked | Exact event pass only; canceled/ended policy still gates | Blocked pending production product approval | New passes blocked; expiration/cancel/revoke policy governs existing access | Partial |

## Provider Product Matrix

| Flow | Product ID | Provider type | Configured? | Production-ready? | Restore/revoke behavior | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Premium | `premium_subscription` | Google Play / RevenueCat subscription | Sandbox proved | Pending owner/provider activation | RevenueCat restore; backend `user_entitlements` with `revoked_at` safety | Partial |
| Tips | `cw_creator_tip_sandbox_099` | Google Play / RevenueCat one-time consumable | Sandbox proved | Missing production product approval | No durable restore; support/manual provider review | Partial |
| Paid Video | `cw_paid_content_access_sandbox_099` | Google Play / RevenueCat one-time consumable | Sandbox proved | Missing production product approval | Access grant readback/revoke for exact video | Partial |
| Watch-Party Ticket | `cw_watch_party_live_ticket_sandbox_099` | Google Play / RevenueCat one-time consumable | Sandbox proved | Missing production product approval | Access grant readback/revoke for exact room | Partial |
| Channel Subscription | `channel_subscription_sandbox_monthly_499:monthly` | Google Play / RevenueCat subscription | Sandbox proved | Missing production base plan/product approval | Renewal/cancellation/expiration/refund/revocation lifecycle; stale rows fail effective access | Partial |
| VIP | `cw_vip_pass_sandbox_499` | Google Play / RevenueCat one-time non-consumable | Sandbox proved | Missing production product approval | Provider ownership reset/revoke proved for sandbox; local access remains creator-specific | Partial |
| Event Pass | `cw_event_pass_sandbox_099` | Google Play / RevenueCat one-time consumable | Sandbox proved | Missing production product approval | Access grant/pass readback/revoke for exact event | Partial |

Safe price/currency recording: sandbox tiers are safe to record where already public in repo proof (`099`, `499`, `$9.99/month`, `$99/year`). Production prices/products must not be changed by this lane.

Current official provider-doc check on 2026-06-25: Google Play Billing separates subscriptions from one-time products, and one-time products may be consumable or non-consumable. RevenueCat products are grouped into offerings for presentation, and entitlements represent purchase-backed access. The switchboard follows that model: Premium and Channel Subscription are subscription-shaped, Tips/Paid Video/Watch-Party Ticket/Event Pass are consumable one-time product-shaped, VIP is non-consumable one-time product-shaped, and access remains scoped by backend entitlement/grant/readback rather than by local UI state.

## Flow Definitions

### Premium

- Default state: entitlement readback on; purchase shell off.
- Required provider product IDs: `premium_subscription`; RevenueCat entitlement `premium`.
- Required backend tables/config: `user_entitlements`, RevenueCat webhook, Premium helpers, `premiumPurchaseEnabled=false` until approved.
- Required app route/surface: `/subscribe`, Premium gates, Settings Premium management.
- Exact access created: app-wide Premium entitlement only.
- Exact access not created: creator revenue, paid video, ticket, subscription, VIP, event pass, payout, payable balance, LiveKit publish, host, speaker, moderator, or admin authority.
- Refund/revoke behavior: provider/manual support; backend entitlement revoke/readback blocks access.
- Kill switch behavior: Premium purchase shell can remain closed without weakening Premium gates.
- Rollback behavior: close purchase shell; preserve active entitlements unless provider/revoke policy says otherwise.
- Support policy: store/provider support plus app support for missing entitlement/restore.
- Creator-facing copy: Premium is platform access/tooling, not creator earnings.
- Viewer-facing copy: Premium is app-wide and does not include creator purchases unless explicitly stated.
- Analytics events: Premium gate, purchase open, restore, manage, entitlement readback.
- Dashboard/readback requirements: RevenueCat/Google Play status, entitlement row, revoke/readback.
- Launch owner decision required: Yes.

### Tips

- Default state: off.
- Required provider product IDs: `cw_creator_tip_sandbox_099` for sandbox; production product pending.
- Required backend tables/config: money purchase intents, provider events, ledger/readback, `tips_enabled`, `live_money_enabled`, `payouts_enabled=off`.
- Required app route/surface: Public Platform support/tip sheet, Money Center.
- Exact access created: none.
- Exact access not created: Premium, paid content, room ticket, subscription, VIP, event pass, badge, ranking, LiveKit, payout, or payable balance.
- Refund/revoke behavior: no access revoke; accidental/duplicate/unauthorized support path is manual/external.
- Kill switch behavior: hide/disable CTA and block direct intent.
- Rollback behavior: set `tips_enabled=off`; no access to revoke.
- Support policy: support reviews accidental tips; no instant refund claim.
- Creator-facing copy: creator earnings/payouts are not live; sandbox rows are not payable.
- Viewer-facing copy: tips unlock nothing.
- Analytics events: tip sheet open, amount selected, purchase intent, provider event readback, support/refund request.
- Dashboard/readback requirements: provider event, intent, ledger row, not-payable state.
- Launch owner decision required: Yes.

### Paid Video

- Default state: off.
- Required provider product IDs: `cw_paid_content_access_sandbox_099` for sandbox; production product pending.
- Required backend tables/config: `creator_content_prices`, `money_purchase_intents`, `access_grants`, `content_access_grants`, ledger/readback, `paid_content_enabled`.
- Required app route/surface: `/player/[id]`.
- Exact access created: one video/source target only.
- Exact access not created: Premium, other videos, subscription, VIP, ticket, event, LiveKit authority, payout, or payable balance.
- Refund/revoke behavior: refund/credit review if access never worked, content removed before meaningful use, DMCA/removal, or platform fault; revoke blocks exact target.
- Kill switch behavior: CTA disabled and direct intent blocked.
- Rollback behavior: stop new unlocks; keep existing access stable unless policy revokes.
- Support policy: manual support/provider review.
- Creator-facing copy: paid video rows are sandbox/not payable unless live money and payouts are separately enabled.
- Viewer-facing copy: unlocks this video only.
- Analytics events: paywall viewed, unlock intent, provider result, access readback, revoke/readback.
- Dashboard/readback requirements: exact video id, provider event, intent, grant, content grant, ledger.
- Launch owner decision required: Yes.

### Watch-Party Ticket

- Default state: off.
- Required provider product IDs: `cw_watch_party_live_ticket_sandbox_099` for sandbox; production product pending.
- Required backend tables/config: ticket offers, purchase intents, `access_grants`, ticket tables, ledger/readback, `watch_party_tickets_enabled`.
- Required app route/surface: `/watch-party/[partyId]`.
- Exact access created: same Party Room / Watch-Party target only.
- Exact access not created: Premium, other room, Live Stage, LiveKit publish, host, speaker, moderator, paid video, subscription, VIP, event, payout, or payable balance.
- Refund/revoke behavior: review if unused and canceled/unavailable/platform fault; revoke blocks same-room resolver.
- Kill switch behavior: CTA disabled, direct intent blocked, no provider sheet.
- Rollback behavior: stop new tickets; preserve existing access unless revoke/refund policy applies.
- Support policy: room ended/failed/no-show support path is manual/external.
- Creator-facing copy: ticket revenue is not live/not payable while payouts are off.
- Viewer-facing copy: ticket grants this room entry only and no room authority.
- Analytics events: ticket gate viewed, intent created, provider result, room access readback, revoke.
- Dashboard/readback requirements: room id, offer id, intent, provider event, grant, ticket row, ledger.
- Launch owner decision required: Yes.

### Channel Subscription

- Default state: off.
- Required provider product IDs: `channel_subscription_sandbox_monthly_499:monthly` for sandbox; production product/base plan pending.
- Required backend tables/config: subscription offers, subscription rows, transactions, lifecycle handling, access grants, effective access resolver.
- Required app route/surface: `/channel-subscription/[creatorId]`, Public Platform subscriber area, Money Center.
- Exact access created: subscriber status for one creator channel.
- Exact access not created: Premium, VIP, paid video, ticket, event, other creator subscription, LiveKit authority, payout, or payable balance.
- Refund/revoke behavior: cancellation/expiration/revoke lifecycle; stale active rows do not unlock.
- Kill switch behavior: subscribe CTA disabled and direct creation blocked.
- Rollback behavior: stop new subscriptions; provider lifecycle governs existing access.
- Support policy: cancellation/expiration/missing entitlement/creator inactivity path is manual/external.
- Creator-facing copy: subscription revenue is not payable until live money/payouts are separately enabled.
- Viewer-facing copy: creator subscription is not Premium and applies only to this creator.
- Analytics events: subscribe gate viewed, purchase intent, lifecycle event, access readback, cancel/expire.
- Dashboard/readback requirements: product/base plan, provider event, subscription row, access grant, effective access.
- Launch owner decision required: Yes.

### VIP

- Default state: off.
- Required provider product IDs: `cw_vip_pass_sandbox_499` for sandbox; production product pending.
- Required backend tables/config: VIP offers, VIP passes, VIP transactions/events, access grants, creator-specific resolver.
- Required app route/surface: `/vip-pass/[creatorId]`, Public Platform VIP area, Money Center.
- Exact access created: VIP status for one creator.
- Exact access not created: Premium, channel subscription, paid video, room ticket, event pass, other creator VIP, LiveKit authority, payout, or payable balance.
- Refund/revoke behavior: provider ownership reset/revoke proved in sandbox; local revoke blocks exact creator VIP.
- Kill switch behavior: CTA disabled and direct intent blocked.
- Rollback behavior: stop new VIP purchases; preserve existing VIP unless revoke/refund policy applies.
- Support policy: unavailable perks, early removal, or missing VIP handled manually.
- Creator-facing copy: VIP sales are not payable until live money/payouts are separately enabled.
- Viewer-facing copy: VIP is creator-specific and does not unlock Premium.
- Analytics events: VIP gate viewed, intent, provider event, VIP readback, revoke.
- Dashboard/readback requirements: creator id, offer id, VIP pass, provider event, access grant, ledger/readback.
- Launch owner decision required: Yes.

### Event Pass

- Default state: off.
- Required provider product IDs: `cw_event_pass_sandbox_099` for sandbox; production product pending.
- Required backend tables/config: event offers, event passes, transactions/events, access grants, capacity/ended/canceled policy.
- Required app route/surface: `/event/[eventId]`, Public Platform event cards, Money Center.
- Exact access created: pass for one creator event.
- Exact access not created: Premium, VIP, subscription, paid video, room ticket, other event, LiveKit authority, payout, or payable balance.
- Refund/revoke behavior: canceled/rescheduled/ended/unavailable event support path; revoke blocks exact event access.
- Kill switch behavior: CTA disabled and direct intent blocked.
- Rollback behavior: stop new passes; expiration/cancel/revoke policy governs access.
- Support policy: canceled/rescheduled/ended event support path is manual/external.
- Creator-facing copy: event pass sales are not payable while payouts/live money are off.
- Viewer-facing copy: pass unlocks this event only.
- Analytics events: event gate viewed, intent, provider result, pass readback, cancel/revoke.
- Dashboard/readback requirements: event id, offer id, provider event, pass row, access grant, ledger/readback.
- Launch owner decision required: Yes.

## Support / Refund / Dispute Matrix

| Flow | Support policy | Refund policy | Dispute policy | Creator expectation | Status |
| --- | --- | --- | --- | --- | --- |
| Premium | Store/provider support plus app missing-entitlement support | Manual/provider review; no instant refund promise | Verify provider receipt externally | Platform revenue, not creator earnings | Closed for manual/external |
| Tips | Accidental/duplicate/unauthorized support path | No standard refund; manual/provider review only | Provider/store dispute external | Tips unlock nothing; payouts not live | Closed for manual/external |
| Paid Video | Access failure/content removal/DMCA/platform fault review | Manual/provider review; no standard refund after consumed playback unless required | Use video id, provider event, grant/readback | Not payable unless payouts live | Closed for manual/external |
| Watch-Party Ticket | Room ended/failed/no-show/platform fault review | Manual/provider review if unused/canceled/unavailable | Use room id, intent, provider event, grant | Not payable unless payouts live | Closed for manual/external |
| Channel Subscription | Missing entitlement, expiration, cancellation, inactivity | Credit-first/manual provider review | Use provider period/subscription/effective access | Not payable unless payouts live | Closed for manual/external |
| VIP | Missing VIP, unavailable perks, early removal | Credit/refund manual/provider review | Use creator id, VIP pass, access grant | Not payable unless payouts live | Closed for manual/external |
| Event Pass | Canceled/rescheduled/ended/unavailable event | Manual/provider review for eligible cases | Use event id, pass, provider event/readback | Not payable unless payouts live | Closed for manual/external |

No flow may promise instant provider refunds. No flow may promise creator payout unless payouts are separately enabled. No flow may imply Premium unlock unless it is Premium.

## Creator Expectation Controls

For Tips, Paid Video, Watch-Party Ticket, Channel Subscription, VIP, and Event Pass:

- Creator earnings/payouts are not live while `payouts_enabled=off`.
- Sandbox mode must say test/sandbox only.
- Money Center must say not payable for sandbox/setup rows.
- Creator cannot withdraw, cash out, transfer, or request payout movement from these flows.
- Support/refund path is manual/external.
- Exact current status must be visible to creator through Money Center/readback.

## Rollback Matrix

| Flow | Disable path | Proof result | Access preservation/revoke behavior | Status |
| --- | --- | --- | --- | --- |
| Global money master switch | Keep or set `live_money_enabled=off` | Proved by defaults and dry-run script | New live purchases blocked; existing access preserved unless policy revokes | Closed |
| Premium | Keep `premiumPurchaseEnabled=false` / Premium shell hold | Proved by source | Existing entitlements remain strict/revocable | Partial |
| Tips | Set `tips_enabled=off` | Proved by switch catalog/defaults | No access to preserve | Partial |
| Paid Video | Set `paid_content_enabled=off` | Proved by switch catalog/defaults | Preserve existing access unless revoke/refund policy applies | Partial |
| Watch-Party Ticket | Set `watch_party_tickets_enabled=off` | Proved by switch catalog/defaults | Preserve existing room access unless revoke/refund policy applies | Partial |
| Channel Subscription | Set `digital_sales_enabled=off` and keep provider activation closed | Proved by switch catalog/defaults | Existing access follows provider lifecycle/effective access | Partial |
| VIP | Set `digital_sales_enabled=off` and keep provider activation closed | Proved by switch catalog/defaults | Preserve existing VIP unless revoke/refund policy applies | Partial |
| Event Pass | Set `digital_sales_enabled=off` and keep provider activation closed | Proved by switch catalog/defaults | Existing pass follows expiration/cancel/revoke policy | Partial |

## Incident Response

For every flow:

1. Disable the flow switch or keep it off.
2. Confirm `live_money_enabled=off` for emergency stop.
3. Stop purchase creation before touching access.
4. Read support dashboard rows: provider event, purchase intent, access grant, ledger/readback, user/creator/source id.
5. Preserve existing valid access during provider outage where possible.
6. Revoke bad access only through the proved revoke path and only when policy/support review says to revoke.
7. Do not execute provider refunds from the app.
8. Do not create payable balances, payout batches, transfers, withdrawals, cash-out, or fake credits.
9. Do not weaken Premium gates, RLS, LiveKit authority, scan gates, auth/reset safety, abuse throttles, or block enforcement.

## Analytics And Dashboard Requirements

Minimum events/readbacks for each flow:

- gate viewed / CTA unavailable;
- purchase intent requested/blocked;
- provider product unavailable;
- provider sheet opened only when allowed;
- provider event received;
- access grant created/read/revoked when applicable;
- ledger/readback state with sandbox/not-payable/live-money-off labels;
- support/refund request created;
- owner switch changed with immutable audit and reason.

Dashboards must show sanitized provider ids and statuses only. They must not show provider secrets, payment keys, service-role keys, webhook secrets, push tokens, LiveKit tokens, signed URLs, proof passwords, private dashboard screenshots, or private user data.

## Proof

Run:

```sh
npm run proof:seven-flow-production-switchboard
npm run proof:seven-flow-production-prep
```

The script is dry-run by default. It performs no real purchases, no provider refund calls, no provider secret printing, no payout calls, no transfer calls, no withdrawal/cash-out calls, and writes sanitized artifacts to:

```text
/tmp/app-seven-flow-production-switchboard-proof-YYYYMMDD-HHMMSS/
/tmp/app-seven-flow-production-prep-proof-YYYYMMDD-HHMMSS/
```

Expected artifacts:

- `README.md`
- `flow-switch-matrix.json`
- `provider-mapping-matrix.json`
- `kill-switch-proof-output.json`
- `support-refund-dispute-policy-matrix.json`
- `creator-expectation-matrix.json`
- `rollback-matrix.json`
- `secret-token-scan-result.json`

## Launch Owner Decision

The owner must explicitly approve each flow before it can move from readiness to production activation. Approval must name the flow, product id, provider readiness evidence, support/refund policy, rollback owner, activation time, monitoring owner, and whether the flow remains sandbox/internal/closed testing or production. A single global approval is not enough to enable all flows.
