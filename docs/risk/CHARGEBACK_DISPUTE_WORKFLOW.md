# Chargeback And Dispute Workflow

Status: draft operations workflow. Production money and payout execution are not active.

## Intake

Capture provider dispute id, product type, source id, user id, creator/host id, amount, currency, reason, deadline, and current access/fulfillment state.

## Evidence

Collect as applicable:

- provider event and purchase intent logs;
- access grant and resolver result;
- content access logs;
- event/room state logs;
- merch order, fulfillment, tracking, delivery, and support messages;
- refund/support history;
- account risk signals;
- creator policy/safety status.

## Decision

Owner/Admin or designated support lead decides whether to accept, refund, respond, hold creator proceeds, revoke access, reverse ledger rows, or escalate legal/risk review.

## Follow-Through

Record audit reason, update support ticket, apply access revocation/reversal where backed, place payout hold if needed, and update risk notes. Do not mark sandbox/setup rows payable.
