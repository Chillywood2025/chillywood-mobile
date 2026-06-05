# Money Kill Switch Runbook

Status: runbook draft. All production money switches remain off unless a future activation lane explicitly changes them.

## Core Switches

- `live_money_enabled`
- `payouts_enabled`
- `cashout_enabled`
- `production_merch_enabled`
- `production_paid_content_enabled`
- `production_tickets_enabled`
- `production_seats_enabled`
- `production_event_passes_enabled`
- `production_tips_enabled`

All default off. Sandbox/test switches do not imply production money.

## Activation Safeguards

- high-risk switch changes require Owner/Admin approval;
- reason and evidence required;
- legal/tax/fraud/support/refund/fulfillment readiness attached where relevant;
- provider live readiness attached;
- rollback owner assigned;
- no single-click activation;
- post-change backend readback and Android proof required.

## Emergency Disable

If fraud, provider failure, refund spike, safety issue, tax/legal issue, fulfillment failure, or data-safety issue occurs, disable relevant switch, document reason, notify support owner, preserve evidence, and start rollback review.
