# Refund / Credit / Payout-Hold Foundation

Updated: August 31, 2026

Money admin authority update: provider refunds remain manual/external; manual refund support status can be recorded only with exact scope and audit; future payout activation and future `live_money_enabled` require dual approval; no provider refund, payout, purchase, or money movement happened.

The forward closure in `20260831130000_creator_money_refund_settlement_doctrine_closure.sql` separates Chi'llywood standard remedies from authoritative provider/store/legal reversals and adds server-owned settlement, obligation-completion, reserve, negative-adjustment readback, and payout-allocation protection. It does not call a provider, move money, execute a payout, or enable live money.

Deployment status is tracked by the exact migration history and closure report. Production money and payouts remain off.

## Owner Files

- `_lib/moneyRefundPolicy.ts`
- `supabase/migrations/20260621091458_refund_credit_payout_hold_foundation.sql`
- `supabase/migrations/20260831130000_creator_money_refund_settlement_doctrine_closure.sql`
- `scripts/guard-refund-credit-payout-hold-policy.mjs`

## Product Truth

- Live money remains off.
- Payouts remain off.
- No real refunds are executed by this closure.
- No payout release or external transfer is executed by this closure.
- No provider calls are made by this foundation.
- Pending and Reserved money cannot be allocated to payout.
- Creator cash-out and withdrawal remain off.
- Credits are not cash, not transferable, not withdrawable, not payable, and not production-spendable.
- Refund review records do not prove provider refunds.
- Provider refund completion requires future provider evidence.
- Ordinary creator earnings use a server-owned seven-day hold from immutable verified provider `occurred_at`.
- Watch-Party and Event earnings require canonical completion plus 48 hours.
- Ten percent of otherwise eligible creator earnings remains Reserved for 30 days.
- Late authoritative reversals append lifecycle/recovery evidence, never erase the original transaction, and block unsafe payout.
- Refund, credit, and payout-hold records must not grant LiveKit publish.
- Refund, credit, and payout-hold records must not grant host power.
- Refund, credit, and payout-hold records must not grant speaker authority.
- Refund, credit, and payout-hold records must not grant moderator/admin authority.
- Refund, credit, and payout-hold records must not grant payout access.
- Refund, credit, and payout-hold records must not grant room authority or safety/privacy bypass.

## Policy Matrix

| Policy key | Product | Standard policy | Remedy foundation | Creator obligation | Payout hold |
| --- | --- | --- | --- | --- | --- |
| `premium_subscription` | Chi'llywood Premium | No ordinary Chi'llywood refund. Canceling stops future renewal; paid-through access follows provider truth. Provider/store/legal/fraud/duplicate/unauthorized reversals remain authoritative. | Provider/legal reconciliation is separate from standard refund. | Not applicable. | Never enters creator settlement. |
| `creator_tip` | Creator Tip | Final and non-refundable through Chi'llywood. Tips unlock nothing. Authoritative fraud, duplicate, unauthorized, chargeback, provider, and legal reversals still reconcile. | No ordinary refund path. | Not applicable to viewer access. | Seven days, then reserve rules. |
| `paid_creator_video` | Paid Creator Video | Refund/credit review if access never worked, content removed before meaningful use, or admin finds misrepresentation. No standard refund after playback/access is consumed. | Cash refund or credit review. | Delivery/access must be met. | Required until delivery and refund-risk window clear. |
| `watch_party_ticket` | Watch-Party Seat Pass | Remedy review before meaningful entry for cancellation, unavailability, or creator/platform failure. No standard refund after successful use. | Cash remedy review; authoritative reversal remains separate. | Successful canonical room completion required. | Completion plus 48 hours, then reserve rules. |
| `live_watch_party_access_pass` | Live Watch-Party Access Pass | Refund review if access never worked or target canceled before entry. No standard refund after viewer/listener entry unless platform fault. | Cash refund or credit review. | Access/session obligation must clear. | Required. |
| `live_watch_party_seat_pass` | Live Watch-Party Seat Pass | Refund or credit review if seat opportunity is never provided or host never reviews/approves within policy window. No standard refund if approved, used, rule-violating, or removed for valid moderation/safety. | Credit-first review with cash only where required. | Seat outcome must be known. | Required. |
| `channel_subscription` | Platform Subscription | Canceling stops future renewal. No standard prorated refund for an already-started paid period; paid-through access follows provider truth. | Backed-access failure may enter remedy review. | Exact creator and billing period remain bound. | Seven days per verified billing/renewal period, then reserve rules. |
| `vip_pass` | VIP Pass | Exact-creator 30-day access. No standard refund after valid delivery; failed delivery, early removal, or material misrepresentation may be reviewed. | Cash remedy review; authoritative reversal remains separate. | Exact creator and immutable activation remain bound. | Seven days, separate from the 30-day access term, then reserve rules. |
| `event_pass` | Event Pass | Remedy review before attendance for cancellation, material unavailability/change, or delivery failure. No standard refund after successful attendance. | Cash remedy review; authoritative reversal remains separate. | Successful canonical event completion required. | Completion plus 48 hours, then reserve rules. |
| `merch_physical_good` | Physical Merch | Refund/return to original payment method according to merch return policy if not shipped, defective, not delivered, canceled, or eligible return. | Provider refund/return review. | Fulfillment/return obligation must clear. | Required until fulfillment and return/refund window clear. |
| `payout_readiness` | Payout Readiness | Setup/status only. Refund/credit rules must not make money payable while live money is off. | None. | Not applicable. | Not applicable. |

## Decision Examples

- Premium after normal renewal: no standard refund; cancellation is not a refund; an authoritative reversal remains mandatory provider reconciliation and creates no creator payout hold.
- Tip after support is sent: no standard refund; tips unlock nothing; creator payout hold remains required until fraud/chargeback/reversal windows clear.
- Paid creator video before playback when access failed: refund/credit review eligible; creator payout hold required.
- Paid creator video after playback started: no standard refund unless platform/provider/legal/admin review requires it.
- Watch-Party Seat Pass before room entry when room is canceled: cash refund review eligible; payout held.
- Watch-Party Seat Pass after room entry: no standard refund unless platform fault or provider/legal/admin decision.
- Live Watch-Party access pass before entry when target canceled: cash refund review eligible; no speaking/publish authority is created.
- Live Watch-Party seat pass while host review never happens: credit/refund review eligible; host approval and LiveKit token rules still win.
- Platform Subscription when creator materially fails delivery during paid period: remedy review; no standard prorated refund for a normally started period.
- VIP when access is removed early: credit/refund review; VIP remains separate from Premium and subscription.
- Event pass when event is canceled before attendance: cash refund review eligible; payout held until event/review window clears.
- Physical merch before shipment when canceled: provider refund/return review; no digital access unlock.
- Payout readiness setup: no refund, no credit, no payout, no cash-out, no withdrawal.

## Database Foundation

The foundation and forward closure add:

- `money_refund_policy_rules`
- `money_refund_review_records`
- `money_credit_ledger_entries`
- `creator_obligation_review_records`
- `creator_payout_hold_records`
- `creator_money_settlement_policies`
- `creator_money_obligation_completion_receipts`
- immutable settlement/reserve fields on `creator_earnings_ledger`

The migration also adds dry-run/readback functions:

- `resolve_money_refund_policy(...)`
- `resolve_creator_payout_hold_policy(...)`
- `create_refund_review_dry_run(...)`
- `get_my_refund_credit_summary()`
- `admin_get_refund_readiness_summary()`

These functions do not call providers and do not move money. Caller booleans cannot release payout. Exact provider receipt consumers derive ordinary timing from provider `occurred_at`; service-only completion evidence starts Event/Watch-Party timing. Payout allocation is capped at server-computed Available money after reserve.

## Security And RLS

- Tables are RLS-enabled.
- Anonymous access is revoked.
- Authenticated access is explicitly granted only with RLS boundaries.
- Owner/operator can inspect policy/readback rows but authenticated sessions cannot directly mutate policy, credits, obligations, or payout holds.
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
