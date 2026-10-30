# Creator pricing and event checkout repairs

Base: `a47c0cbbd4e6d448c1ca9ece25ce7660bc209306`.

## Source changes

- Share exact iOS channel subscription slot validation between supported-price preflight and purchase-intent validation. The catalog still contains eight distinct monthly USD 4.99 slots; this is not new price provisioning.
- Reject fractional and unsafe minor-unit amounts instead of truncating them to a finite iOS tier.
- Filter tip options by this build's exact supported provider/product/amount mapping, current buyer, recipient and applicable creator bounds. Re-read recipient-specific catalog availability before creating the store intent.
- Display supported USD amounts rather than unchecked or stale localized price labels. The actual store quote must still match before invoking a purchase.
- Reject stale creator status in the tip sheet and explain unavailable options without suggesting arbitrary amounts are purchasable.
- Present rescheduled sold-out events as sold out, rather than suggesting free admission.
- Preserve pending recovery for uncertain event claims and unverified purchases; suppress another purchase action without granting entry or releasing an uncertain reservation.

## Evidence and limits

Tests execute production pricing and purchase functions with simulated store/RPC boundaries, plus mounted event/tip surfaces and negative controls. They cover exact supported identities, wrong buyer/product/currency, fractions, stale availability, lost claims and future Sunday 8 PM events on both platform branches. These are not physical-device or real-provider purchase receipts.

The historical `proof-creator-monetization-route-button-wiring.mjs` reports 23 failures on both the unchanged base and this repair tree. They are not relabeled passing. Exact-head CI is authoritative for merge readiness; local attempts interrupted by resource exhaustion are not successful tests.

## Still unfinished

- Android's only implemented tip product is USD 0.99, while normalized creator policy requires a minimum of USD 1.00. This repair hides that unavailable option; it does not weaken policy or create a new product.
- Additional creator subscription prices require approved catalog configuration and matching product identity on both stores. Removing a duplicate hard-coded condition does not make arbitrary prices available.
- Store account agreements, product review/activation, US alternative-payment program eligibility, Stripe creator-platform approval, RevenueCat web/Connect compatibility, and physical provider delivery remain separate verification work.
- Auction settlement, pricing bounds, refund economics and delayed-payment capacity policy require explicit decisions and provider qualification. VIP auctions remain unavailable.

No database migration, provider configuration, live-money or payout activation, native build, OTA, or public release is part of this patch. OTA verification remains on owner hold. Financial history and existing subscriber terms are preserved.
