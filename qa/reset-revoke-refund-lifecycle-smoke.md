# Reset, Revoke, And Refund Lifecycle Smoke

This lane proves scoped cleanup. Provider refund lifecycle remains manual-assisted unless Google Play/RevenueCat tooling is safely available.

## Fixture Reset

- Sandbox tester grant active.
- Sandbox tester revoke.
- Social graph reset removes synthetic follow/Circle/block/subscriber/VIP rows.
- Owner visibility returns to public after social graph reset.

## Access Revoke

- Premium restore state: read existing provider-backed state only; do not fake Premium.
- Creator subscription revoke: subscriber loses subscription-only access only.
- VIP revoke: VIP loses VIP access only.
- Paid video access revoke: viewer loses only that video access.
- Ticket access revoke: viewer loses only that room/ticket access.
- Event pass revoke: viewer loses only that event access.

## Provider Lifecycle

- Google Play refund/provider lifecycle is manual-assisted unless safe provider order tooling exists.
- RevenueCat/Google Play ownership cleanup notes must identify the tester/product and not expose secrets.

## Money Safety

- No payout after revoke/refund.
- No payable ledger after revoke/refund.
- No unrelated product access revoked.
- No fake refund or fake provider completion.
