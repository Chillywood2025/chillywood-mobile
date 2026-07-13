# Ads Sponsor Delivery Foundation Runbook

Status: foundation-only guarded.

System id: `ads_sponsor_delivery_operator`

Activation: `off`

Scheduler status: `no_scheduler_foundation_only`.

## Purpose

`ads_sponsor_delivery_operator` exists only to fence future ads and sponsor delivery. It documents readiness surfaces and routes future owner planning through Owner Command, but it cannot execute live ad/sponsor behavior.

## Foundation Scope

- ad provider readiness
- sponsor deal readiness
- sponsor checkout readiness
- ad inventory readiness
- brand safety readiness
- sponsor reporting readiness
- ad revenue future scope
- sponsor payout future scope

Allowed writes are owner-command requests for future approval planning only. There are no live write tables and no live writes.

## Forbidden

- no serving ads
- no live ad SDK behavior
- no sponsor checkout
- no sponsor upload or approval
- no sponsor payout split
- no ad revenue claim
- no fake sponsor revenue
- no fake ad impressions
- no provider config mutation
- no child/unsafe context ad serving
- no CTV inventory claim
- no live billing/payout

No Edge Function exists. No scheduler exists. No live writes exist. In lower-case policy terms: no Edge Function, no scheduler, and no live writes. Any future activation requires provider/business/billing readiness, Owner Command routing, Level 3/4 approval where applicable, fresh proof, and updated guards.

## Validation

- `npm run proof:ads-sponsor-delivery-foundation`
- `npm run guard:ads-sponsor-delivery-foundation`
