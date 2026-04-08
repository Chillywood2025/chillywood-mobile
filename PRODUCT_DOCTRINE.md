# PRODUCT DOCTRINE

## Purpose
`PRODUCT_DOCTRINE.md` is the single governing home for Chi'llywood's cross-cutting monetization, compliance, product-phase, and profile/channel-platform truth.

It works alongside:
- `MASTER_VISION.md` for identity-level product truth
- `ARCHITECTURE_RULES.md` for architectural constraints and file-placement rules
- `ROOM_BLUEPRINT.md` for room-specific implications only
- `ROADMAP.md` for the current phased planning split

This file does not replace or reinterpret the locked Chi'lly Chat communication doctrine or the locked Rachi official-account doctrine. Those remain carried forward through `MASTER_VISION.md`, `ARCHITECTURE_RULES.md`, `CURRENT_STATE.md`, and `NEXT_TASK.md`.

If older active docs contain scattered cross-cutting monetization, compliance, product-phase, or profile/channel-platform statements that conflict with this file, this file wins unless a narrower room-specific rule in `ROOM_BLUEPRINT.md` intentionally governs that room.

## Monetization Core
- creators can choose whether content is free or paid
- preset price tiers are preferred over arbitrary pricing
- Chi'llywood Premium gates Watch-Party Live and other recurring premium value
- creators keep 100% of tips
- tips are anonymous to other users but fully traceable in backend and admin records
- Chi'llywood should not take a direct percentage cut from tips
- Chi'llywood's main platform percentage should come from paid content sales
- creator payouts should be calculated from net receipts actually received after app-store fees, taxes, refunds, chargebacks, and adjustments, not gross sticker price
- if app currency is used for tipping, it should be treated as internal app coins or credits, not crypto or blockchain tokens
- the current preferred Chi'llywood platform cut for paid content is 20% of net receipts

## Compliance Standing Rule
- future monetization guidance must proactively stay compliant with Apple and Google billing rules, creator payouts, tax reporting, moderation requirements, and country rollout constraints
- compliance-sensitive design choices must be called out before implementation decisions are made
- app-store billing decisions and creator payout decisions must be evaluated together, but they must not be collapsed into the same system

## Payout Direction
- standard scheduled creator payouts remain free
- the monetized fee lane is `Instant Payout` / `Instant Cash Out`
- `up to $25`: about `$0.50-$0.75`
- `$25.01-$200`: `$1.99`
- `above $200`: small percentage with a cap rather than a flat fee; the preferred example is `1.5%` capped at `$4.99`
- the fee must be clearly labeled and clearly disclosed as `Instant Payout` / `Instant Cash Out`
- creator payout infrastructure should assume Stripe Connect or an equivalent marketplace payout layer
- creator payouts must remain separate from app-store billing and separate from RevenueCat

## Ads Direction
- ads are a secondary revenue stream, not the core business model
- Premium remains ad-free
- a free tier can include light ads
- rewarded ads and carefully integrated native ads are preferred over disruptive formats
- aggressive or unexpected full-screen interstitials are not approved doctrine
- room-specific ad cautions belong in `ROOM_BLUEPRINT.md`, not here

## Profile / Channel Platform Direction
- profiles remain Chi'llywood's social identity hubs
- every user can have the option to build their own mini streaming platform or channel inside Chi'llywood, but platform-building is optional
- users who do not want to build a full channel or platform should still have meaningful profile customization
- customizable branding, layout, featured rows, sections, and channel identity are approved direction inside the canonical profile/channel system
- platform-inspired creator surfaces are approved; direct copies of third-party streaming services are not
- creator-channel customization is preferred over relying on third-party streaming account connections
- users should be able to start with the base profile experience and expand later without losing that base experience
- profiles remain social identity hubs even when creator-platform mode grows deeper

## Public Product Phasing
- Public v1 should focus on the core social streaming experience, not the full long-term platform vision
- Public v1 includes login/settings/logout, home/discovery, customizable basic profiles, standalone player, Watch-Party Live core flow, Live Watch-Party / Live Stage core flow, comments/reactions/basic social interaction, basic Chi'lly Chat or simple direct messaging, Premium subscription gating, moderation basics, and analytics/error monitoring/admin visibility
- Post-v1 can expand into heavier creator monetization rollout, a fuller creator mini-platform builder, deeper room personalization, instant payout lane foundations, and light compliant ad systems
- Later phase holds Game Live rollout beyond the Public v1 window, Game Watch-Party after Game Live, advanced payouts and tax automation, overseas creator payouts, and broader ad systems
- `ROADMAP.md` should operationalize the active Public v1 / Post-v1 / Later phase split and the current dependencies, blockers, and compliance-sensitive areas
