# Approved event policy follow-up

This source/test follow-up preserves green checkpoint
`d04f5aff41e3881e0fafce54c34a6295c2837e9f` in draft PR626. The parent verified
all 13 checks on that checkpoint. Those results do not qualify this new diff.
The earlier scheduled-show implementation and Stripe settlement repairs remain
separate checkpoints; this follow-up implements the owner's October27 policy
answers.

## Approved behavior

| Decision | Source behavior | Boundary |
| --- | --- | --- |
| D2, approved 08:52 UTC | Cancellation gives immediate provider refund-review eligibility. No actual verified show opening by advertised start +30 minutes gives no-show eligibility. An earlier start, cumulative delay of at least30 minutes, or event-local date change requires notice and explicit buyer choice. | Eligibility is separate from payment, access and completed refund. No provider refund is executed or guaranteed. |
| Buyer consent | Keep or request-review choices bind the exact purchase and schedule revision. Original terms, each accepted schedule/timezone, and choice history remain recorded. A stale revision or cancellation racing consent cannot be silently accepted. | Keeping a revision never removes later cancellation/no-show protection. Unknown mutation outcomes require a fresh read before another choice. |
| D3, approved 08:51 and09:33 UTC | Live-only is the default. A new replay offer needs creator-selected supported availability and expiry. The buyer sees both immutable times before payment. Missing promised availability gives provider refund-review eligibility that late delivery cannot erase. | No default date, duration or grace is invented. Historical indefinite/windowed rights and already-dispatched payment callbacks remain intact. Promised replay cannot become a recording fragment. |
| D4, approved 08:51 UTC | Existing finite creator-scoped qualification permits self-start of multiple owned shows without a separate manual approval for each show. | Current identity/age/KYC/host, privacy, room assignment, capacity, worker, finite cost and stop-deadline guards remain. No real qualification rows or roles are created. |

## Source changes

- [`20261027085819_creator_event_ticket_schedule_policy.sql`](../../supabase/migrations/20261027085819_creator_event_ticket_schedule_policy.sql)
  records immutable schedules, choices and verified opening facts, with durable
  purchaser notices. The exact-account wallet evaluates earned no-show protection
  on read, including charged pending purchases. Ticketed event rows are locked
  in canonical order. Legacy purchases without valid original schedule/timezone
  evidence retain unknown original terms; another ticket's terms are not borrowed.
- [`20261027085833_creator_event_explicit_replay_terms.sql`](../../supabase/migrations/20261027085833_creator_event_explicit_replay_terms.sql)
  validates event terms, immutable sale revisions, new intents and the first
  checkout-dispatch claim. A held pre-policy intent cannot start a new store
  call with unsupported replay promises. Existing dispatched attempts retain
  their identity and callback settlement path.
- [`20261027091942_creator_event_reconciliation_identity_order.sql`](../../supabase/migrations/20261027091942_creator_event_reconciliation_identity_order.sql)
  fixes a real pending-payment failure found during this validation. Reservation
  admission previously ran before exact intent binding, so a rescheduled show
  could leave a verified charge without its original intent. Admission now runs
  after unique account/product/provider/environment/purchase-time binding and
  before fulfillment. A failed admission still grants no ticket; its existing
  reconciliation obligation now retains the exact original intent.
- [`creatorEventTicketPolicy.ts`](../../_lib/creatorEventTicketPolicy.ts) and
  [`event-ticket-policy.tsx`](../../components/monetization/event-ticket-policy.tsx)
  provide account/session-bound review and explicit choices in Purchases and the
  event screen. Retired handlers cannot retry an uncertain outcome or submit a
  later revision. Creator controls describe server-determined thresholds rather
  than a creator checkbox deciding buyer eligibility.

## Delivery evidence and review corrections

An Egress preparation or host status alone does not prove that buyers could
enter the show. New opening facts require the actual `live_now` lifecycle plus
the exact active private playable projection and verified provider receipt.
Facts retain the advertised schedule/revision and survive terminal/replacement
attempts. A prior rehearsal cannot satisfy a later accepted schedule. New
ticketed shows cannot open before their advertised start to bypass reschedule
notice and consent.

Independent review also closed missing pre-purchase replay availability,
retained choice-handler retry after an uncertain result, and pre-policy held
intent first-dispatch gaps. The payment repair was independently compared to
both complete published predecessor functions: only reservation-check ordering
and its explanatory comments differ. Identity matching, source advisory locks,
accounting, idempotency, terminal/refund precedence and function ACLs remain.

## Validation and limits

Focused source/client/SQL, isolated native concurrency, catalog and ACL results
are recorded in the final handoff. Local managed-schema replay reports its
cron/net substitutes and two empty-data recovery skips separately from TAP
test skips. Exact-head CI remains the parent's responsibility after draft
publication; earlier green results are not reused for this head.

The owner approved missed promised-replay refund review at09:33 UTC. No grace
period, automatic refund or default replay duration is added. Historical absence
of captured delivery evidence remains unknown; it cannot establish that an old
show or replay was not delivered. Existing recorded remedies and purchased replay
rights remain preserved.

Provider connectivity/sandbox configuration were previously verified read-only
by the parent. Deployed migration parity, real payment lifecycle, private media
delivery, worker operation and physical-device qualification are separate and
remain unverified by these local tests. No merge, deployment, release, provider
write, credential change, live activation, charge, refund or payout occurred.
