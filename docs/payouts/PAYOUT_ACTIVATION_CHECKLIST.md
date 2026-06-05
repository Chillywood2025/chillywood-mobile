# Payout Activation Checklist

Status: future activation checklist. No payout activation is approved by this document.

Required before changing payout switches:

- `live_money_enabled` reviewed;
- `payouts_enabled` reviewed;
- `cashout_enabled` reviewed;
- Stripe live keys configured server-side, never committed;
- Stripe Connect live platform approved;
- Stripe live webhook endpoint verified;
- KYC/tax requirements documented;
- tax/legal approval attached;
- payout terms accepted;
- refund/chargeback workflow attached;
- fraud/risk holds attached;
- support workflow attached;
- negative balance and reserve plan attached;
- rollback/kill-switch plan attached;
- Owner approval attached;
- no single-click activation.

Approval must be scoped, audited, reversible, and separately validated on device and backend.
