# Owner/Admin Money Center Surface Audit

Last updated: May 27, 2026

This audit records the Admin Command Center money surfaces consolidated into the single Owner/Admin Money Center. The consolidation is UI/control-plane only: no live money, checkout, payout, transfer, fake balance, fake earnings, fake sponsor payment, fake ad revenue, fake fraud clearance, or provider secret exposure is activated.

## Consolidation Map

| Previous surface | Current purpose | Data source | Owner/admin only | Creator-facing | Provider readiness | Kill switches | Decision |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Admin tab `Premium` | Premium entitlement count and subscription readiness copy | `readAdminUsageReadModel`, entitlement rows, RevenueCat/Google Play readiness | Yes | No | Yes, through sanitized readiness summary | `revenuecat_google_play_enabled`, `provider_webhooks_enabled`, `live_money_enabled` | Moved into Owner/Admin Money Center > Premium / RevenueCat / Google Play. |
| Admin tab `Kill Switches` | Runtime app controls plus Money switch controls | `app_configurations`, Money switch RPCs | Yes | No | Money switches pair with readiness | All money switches | Money switch screen moved into Owner/Admin Money Center > Kill Switches; legacy runtime controls remain their own non-money foundation branch if opened. |
| Admin tab `Ads` | Ad provider placeholder/caps/future ad readiness | `app_config.adsLaunch`, placeholder ad provider | Yes | No | Ads readiness rows when available | `ads_revenue_enabled`, `sponsorships_enabled`, `live_money_enabled` | Moved into Owner/Admin Money Center > Sponsors / Ads. |
| Admin tab `Revenue` | Finance/revenue/source-import foundation counts | `readAdminFinanceReadModel`, finance foundation tables | Yes | No | Internal policy/provider readiness for imports | `creator_revenue_imports_enabled`, `creator_balance_visible`, `live_money_enabled` | Moved into Owner/Admin Money Center > Creator Balance / Ledger. |
| Admin tab `Payouts` | Payout ledger/account/review/batch/transfer foundation counts | `readAdminFinanceReadModel`, payout foundation tables, Stripe Connect readiness | Yes | No | Stripe Connect and payout readiness rows | `payouts_enabled`, `stripe_connect_enabled`, `creator_balance_visible`, `tax_kyc_collection_enabled`, `live_money_enabled` | Moved into Owner/Admin Money Center > Payouts / Stripe Connect. |
| Admin tab `Sponsors` | Sponsor foundations, review queue, disclosures, payments, payout split planning | `readAdminFinanceReadModel`, sponsor foundation tables | Yes | No | Ads/sponsor readiness where available | `sponsorships_enabled`, `ads_revenue_enabled`, `live_money_enabled` | Moved into Owner/Admin Money Center > Sponsors / Ads. |
| Admin tab `Fraud` | Fraud holds, reasons, evidence, planned actions, queues, appeals | `readAdminFinanceReadModel`, fraud foundation tables, immutable audit readout | Yes | No | Internal policy readiness later | Payout/live-money switches fail closed; no dedicated fraud switch yet | Moved into Owner/Admin Money Center > Fraud & Risk. |
| Admin tab `Usage` | Provider usage/foundation cost observability | Usage read model and provider usage foundation | Yes | No | Not a money activation source | Not a money kill-switch source | Kept separate because it is platform usage/cost observability, not creator money activation. |
| Admin tab `Live Cost Guard` | LiveKit/TURN cost guard observe-only controls | Live Cost Guard settings/events/actions | Yes | No | Not a money provider source | Separate Live Cost Guard controls | Kept separate under Live Ops because it protects live infrastructure and does not create creator revenue/payouts. |
| Admin tab `Networks` | Network billing/invoice foundation | Network billing foundation tables | Yes | No | Future network provider readiness | Future billing switches | Kept separate for now; not part of creator Money Center activation and remains foundation-only. |
| Creator Platform Studio `Monetization` | Creator-facing Money Center | Sanitized Money switch summary plus provider readiness | No | Yes | Yes | Sanitized creator-safe states only | Kept as the creator source of truth; must agree with Admin Money Center states. |

## Current Owner/Admin Money Center Sections

- Overview
- Kill Switches
- Premium / RevenueCat / Google Play
- Sponsors / Ads
- Fraud & Risk
- Digital Sales
- Tips / Watch-Party Seats / Paid Content
- Merch
- Creator Balance / Ledger
- Payouts / Stripe Connect
- Provider Webhooks
- Tax & Legal
- Audit Trail
- Technical Checks

## Deep-Link Compatibility

The Admin route now reads `tab`, `section`, and `focus` query params. Old money tab params map into the consolidated Money Center:

| Old param | New section |
| --- | --- |
| `admin?tab=premium` | Money Center > Premium / RevenueCat / Google Play |
| `admin?tab=kill-switches` | Money Center > Kill Switches |
| `admin?tab=ads` | Money Center > Sponsors / Ads |
| `admin?tab=sponsors` | Money Center > Sponsors / Ads |
| `admin?tab=fraud` | Money Center > Fraud & Risk |
| `admin?tab=revenue` | Money Center > Creator Balance / Ledger |
| `admin?tab=payouts` | Money Center > Payouts / Stripe Connect |
| `admin?tab=money-center&section=provider-webhooks` | Money Center > Provider Webhooks |

The visible Admin tab row no longer lists separate `Premium`, `Kill Switches`, `Ads`, `Revenue`, `Payouts`, `Sponsors`, or `Fraud` tabs.

## Kill Switch Groups

- Global Money: `money_center_visible`, `creator_monetization_enabled`, `provider_webhooks_enabled`, `live_money_enabled`
- Digital Purchases: `digital_sales_enabled`, `tips_enabled`, `watch_party_seats_enabled`, `paid_content_enabled`, `revenuecat_google_play_enabled`
- Physical / Merch: `merch_enabled`
- Payouts: `creator_balance_visible`, `stripe_connect_enabled`, `payouts_enabled`, `tax_kyc_collection_enabled`
- Sponsors / Ads: `sponsorships_enabled`, `ads_revenue_enabled`
- Fraud / Risk: no dedicated switch yet; payout, provider, and live-money switches still block any money action.

High-risk changes require confirmation, reason text, backend permission, RPC write, and immutable audit. `revenuecat_google_play_enabled` is included in the high-risk set with the other money activation-adjacent switches.

## Safety Result

- Provider readiness remains the readiness source of truth.
- Creator Money Center and Admin Money Center use the same Money switch helper and readiness helper.
- Android digital goods remain Google Play / RevenueCat.
- Stripe Connect remains creator payout setup/readiness only.
- Physical merch remains separate from digital app access.
- Sponsor/ads/fraud sections are read-only/foundation until later provider and policy proof exists.
- No live money was activated.
- No fake money, fake sponsor payment, fake ad revenue, fake fraud clearance, checkout, payout, transfer, withdrawal, balance, or provider secret was added.
