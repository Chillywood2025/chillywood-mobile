# Refund / Credit / Payout-Hold Foundation

Updated: June 21, 2026

This is a foundation-only policy and schema lane. It does not execute real refunds, call Google Play, RevenueCat, Stripe, Stripe Connect, or merch provider refund APIs, create spendable credits, release payout holds, create payable creator balances, or enable live money.

## Owner Files

- `_lib/moneyRefundPolicy.ts`
- `supabase/migrations/20260621091458_refund_credit_payout_hold_foundation.sql`
- `scripts/guard-refund-credit-payout-hold-policy.mjs`

## Product Truth

- Live money remains off.
- Payouts remain off.
- No provider calls are made by this foundation.
- No payout release exists in this foundation.
- Creator cash-out and withdrawal remain off.
- Credits are not cash, not transferable, not withdrawable, not payable, and not production-spendable.
- Refund review records do not prove provider refunds.
- Provider refund completion requires future provider evidence.
- Creator payout holds cannot release payable money while payouts or live money are off.
- Refund, credit, and payout-hold records must not grant LiveKit publish.
- Refund, credit, and payout-hold records must not grant host power.
- Refund, credit, and payout-hold records must not grant speaker authority.
- Refund, credit, and payout-hold records must not grant moderator/admin authority.
- Refund, credit, and payout-hold records must not grant payout access.
- Refund, credit, and payout-hold records must not grant room authority or safety/privacy bypass.

## Policy Matrix

| Policy key | Product | Standard policy | Remedy foundation | Creator obligation | Payout hold |
| --- | --- | --- | --- | --- | --- |
| `premium_subscription` | Chi'llywood Premium | Generally non-refundable after purchase/renewal. Exceptions: law, store/provider/admin decision, fraud, duplicate charge, unauthorized purchase, or platform technical failure. | Admin/provider review only. | Not applicable. | Not applicable. Premium is platform revenue, not creator income. |
| `creator_tip` | Creator Tip | No standard refunds. Exceptions: fraud, duplicate charge, unauthorized purchase, provider/legal/admin decision, or platform/creator abuse. Tips unlock nothing. | Admin/provider review only. | Pending until fraud/reversal window clears. | Required. |
| `paid_creator_video` | Paid Creator Video | Refund/credit review if access never worked, content removed before meaningful use, or admin finds misrepresentation. No standard refund after playback/access is consumed. | Cash refund or credit review. | Delivery/access must be met. | Required until delivery and refund-risk window clear. |
| `watch_party_ticket` | Watch-Party Ticket | Refund review if buyer has not entered/used the room and room is canceled/unavailable or platform fault blocks access. No standard refund after entry/use unless platform fault or provider/legal/admin decision. | Cash refund or credit review. | Room obligation must be met. | Required until room obligation and refund window clear. |
| `live_watch_party_access_pass` | Live Watch-Party Access Pass | Refund review if access never worked or target canceled before entry. No standard refund after viewer/listener entry unless platform fault. | Cash refund or credit review. | Access/session obligation must clear. | Required. |
| `live_watch_party_seat_pass` | Live Watch-Party Seat Pass | Refund or credit review if seat opportunity is never provided or host never reviews/approves within policy window. No standard refund if approved, used, rule-violating, or removed for valid moderation/safety. | Credit-first review with cash only where required. | Seat outcome must be known. | Required. |
| `channel_subscription` | Channel Subscription | Credit-first remedy when creator obligations are not met during paid period. Cash refund only if required by law, store/provider, or admin decision. | Credit-first review. | Creator-specific subscription obligation must clear. | Required. |
| `vip_pass` | VIP Pass | Credit/refund review if creator deactivates/removes VIP early, misrepresents VIP, or admin finds obligation failure. No standard refund after valid access period/use unless platform/admin/legal/provider decision. | Credit-first review. | VIP obligation period/risk window must clear. | Required. |
| `event_pass` | Event Pass | Refund review if event canceled, materially changed, unavailable, or buyer has not entered/attended before cutoff. No standard refund after attendance/entry unless platform fault or provider/legal/admin decision. | Cash refund or credit review. | Event must complete or be reviewed. | Required until event completion plus review/refund window. |
| `merch_physical_good` | Physical Merch | Refund/return to original payment method according to merch return policy if not shipped, defective, not delivered, canceled, or eligible return. | Provider refund/return review. | Fulfillment/return obligation must clear. | Required until fulfillment and return/refund window clear. |
| `payout_readiness` | Payout Readiness | Setup/status only. Refund/credit rules must not make money payable while live money is off. | None. | Not applicable. | Not applicable. |

## Decision Examples

- Premium after normal renewal: refund eligibility false by default; admin/provider/legal review required for exceptions; no creator payout hold.
- Tip after support is sent: no standard refund; tips unlock nothing; creator payout hold remains required until fraud/chargeback/reversal windows clear.
- Paid creator video before playback when access failed: refund/credit review eligible; creator payout hold required.
- Paid creator video after playback started: no standard refund unless platform/provider/legal/admin review requires it.
- Watch-Party ticket before room entry when room is canceled: cash refund review eligible; payout held.
- Watch-Party ticket after room entry: no standard refund unless platform fault or provider/legal/admin decision.
- Live Watch-Party access pass before entry when target canceled: cash refund review eligible; no speaking/publish authority is created.
- Live Watch-Party seat pass while host review never happens: credit/refund review eligible; host approval and LiveKit token rules still win.
- Channel subscription when creator materially fails delivery during paid period: credit-first review; cash refund only where required.
- VIP when access is removed early: credit/refund review; VIP remains separate from Premium and subscription.
- Event pass when event is canceled before attendance: cash refund review eligible; payout held until event/review window clears.
- Physical merch before shipment when canceled: provider refund/return review; no digital access unlock.
- Payout readiness setup: no refund, no credit, no payout, no cash-out, no withdrawal.

## Database Foundation

The migration adds:

- `money_refund_policy_rules`
- `money_refund_review_records`
- `money_credit_ledger_entries`
- `creator_obligation_review_records`
- `creator_payout_hold_records`

The migration also adds dry-run/readback functions:

- `resolve_money_refund_policy(...)`
- `resolve_creator_payout_hold_policy(...)`
- `create_refund_review_dry_run(...)`
- `get_my_refund_credit_summary()`
- `admin_get_refund_readiness_summary()`

These functions do not call providers and do not move money. `create_refund_review_dry_run(...)` can create only a setup/dry-run review record under RLS. It does not mark a provider refund complete, create spendable credit, or release payout.

## Security And RLS

- Tables are RLS-enabled.
- Anonymous access is revoked.
- Authenticated access is explicitly granted only with RLS boundaries.
- Owner/operator can inspect/administer foundation rows.
- Requesters/buyers/creators can read only scoped safe summaries where policy allows.
- Normal users cannot directly insert refund approvals, spendable credits, provider-refund completion, payout hold release, or payable money.
- Metadata checks block secret-like/provider-private values including service-role keys, private keys, webhook secrets, API keys, raw payloads, access tokens, refresh tokens, card data, and bank data.

## Future Production Requirements

Before any real refund, production credit, or payout hold release can become active, Chi'llywood needs a separately approved lane with:

- Google Play / RevenueCat / Stripe / merch provider production refund rules and evidence paths.
- Legal/store/provider approval.
- Support playbook and owner/admin review flow.
- Fraud, chargeback, reversal, and abuse policy.
- Immutable provider evidence and audit.
- RLS/server-action review.
- Credit spend switch and legal treatment.
- Payout hold release switch, KYC/tax/fraud/payout readiness, and owner approval.
- Installed-device/admin proof.
- Confirmation that no payment record grants LiveKit publish, host, speaker, moderator, admin, payout, or safety authority.
