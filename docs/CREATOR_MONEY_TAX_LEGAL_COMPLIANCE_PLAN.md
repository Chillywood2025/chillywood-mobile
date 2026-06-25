# Creator-Money Tax Legal Compliance Plan

Date: 2026-06-25

Verdict: Partial.

This is a provider compliance planning document for the six creator-money Google Play / RevenueCat products. It is not legal or tax advice. It does not activate creator-money, live money, payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, provider refunds, Premium, public purchase availability, or arbitrary custom checkout amounts.

Creator-money tax/legal/compliance plan: Partial. The plan is complete enough for owner/legal/tax review and lists each provider field, recommended value, owner-confirmation requirement, and Codex proceed/stop rule. Product creation remains Partial because Google Play still exposes owner-stop fields that Codex must not guess.

Creator-money product creation: Partial. Google Play already has subscription product record `cw_channel_subscription_monthly_499` / `Creator Channel Subscription`, but it has `0` active base plans and cannot be purchased. The five one-time products are not created. The one-time product form visibly requires or exposes Product ID, Name, Description, Icon, Product tax category, Age rating, Payment location restriction, purchase option, region, and pricing. Age rating remains an owner/legal/tax stop field. The Channel Subscription base-plan form visibly exposes immutable Base plan ID, base-plan Type, country/region availability, and price setup; US-only base-plan save was not completed.

United States only first.

Approved starting prices are launch defaults.

Future custom pricing requires provider-backed price tiers/products/base plans/offers.

Unsupported custom amounts fail closed.

Creator-money switches remain OFF.

Premium remains unchanged.

Stripe payouts remain OFF.

Stripe merch checkout remains OFF.

Provider refunds remain manual/external.

Creator-money activation still requires owner approval and controlled proof.

No creator-money product maps to Premium.

Codex must not guess tax/legal/compliance fields.

## Provider Docs Basis

Provider docs checked on 2026-06-25:

- Google Play Billing and Play Console separate one-time products from subscriptions/base plans; one-time products use purchase options/offers and regional availability.
- Google Play tax and compliance settings apply when managing prices for subscriptions and in-app products; selections can affect future transactions and tax treatment.
- Google Play Developer API exposes one-time product status, product listings, purchase type, and tax/compliance settings.
- RevenueCat requires real store products to match store identifiers, uses entitlements to represent access, and uses offerings/packages for presentation where needed.
- Stripe Connect and payouts are separate money-movement systems for connected accounts and external payout accounts; they are not used for these Android digital products in this lane.

## Global Proceed / Stop Rules

Codex may proceed only when the field value is already owner-approved, visible as a safe inherited default, reversible without public activation, and does not enable app purchase flow. Codex must stop when a field requires owner/legal/tax knowledge, could change public availability, could submit review/publishing, could imply payout/live creator earnings, or could create a money movement surface.

| Field / action | Recommended value | Owner-approved value available? | Codex may fill? | Owner must confirm? | Irreversible/hard to change? | Public/user-visible? | Tax/legal/compliance impact? | Proceed rule |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Product ID | Owner-approved IDs below | Yes | Yes | No, already approved | Yes, cannot change or reuse after creation | Indirect / provider product | Low legal, high operational | Proceed only for exact approved ID. |
| Product type | One-time for Tips/Paid Video/Watch-Party/VIP/Event; subscription for Channel Subscription | Yes | Yes | No, already approved | Hard to correct after creation | Indirect | Medium | Proceed only for exact approved type. |
| Product name | Owner-approved display names below | Yes | Yes | No, already approved | Editable but public | Yes | Medium | Proceed only with approved copy. |
| Short description | Owner-approved descriptions below | Yes | Yes | No, already approved | Editable but public | Yes | Medium | Proceed only with approved copy. |
| Icon / graphic | Existing shared app/product icon if Google Play accepts it | Yes, owner approved shared existing icon | Yes if already available and accepted by dashboard | Owner must provide/approve any new asset | Public asset can affect review | Yes | Medium | Proceed only with existing approved icon; stop if upload requires new creative/legal claim. |
| Product tax category | `Digital app sales` if inherited/visible as the current Play default for these digital items | Partially: visible default, not independently legal-reviewed here | No if dashboard requires active selection/change | Yes for any edit/change | Affects future transaction tax treatment | No direct marketing copy, but provider setting | High | Do not edit without owner/legal/tax confirmation. |
| Age/content rating | Must match owner-approved product-specific rating | No | No | Yes | Public/regulatory effect | Potentially visible in applicable US states | High | Stop. Options observed: `All ages`, `13+`, `16+`, `18+`, `Unspecified`. |
| Payment location restriction | No restriction unless owner/legal requires a restriction | No separate approval | No if dashboard asks for an active decision | Yes | Compliance effect | Not marketing copy | High | Stop if a restriction decision is required. |
| Country/region availability | United States only first | Yes | Yes only if the dashboard control can be conclusively scoped to US-only before save | No for US-only target; yes for any other country | Public availability | Yes by effect | High | Stop if UI risks all-region activation or is ambiguous. |
| Price/currency | `$0.99` one-time products; `$4.99/month` subscription, USD | Yes | Yes only after US-only availability is conclusively scoped | No for defaults | Public and billing effect | Yes | High | Proceed only for exact USD price in US-only setup. |
| Purchase option | Standard `Buy` / repeat-purchasable style for Tips; exact-access one-time product for others | Partially approved at concept level | No if Google Play presents unapproved variants or activation controls | Yes for final choice if labels differ | Billing/access behavior | Indirect | High | Stop if purchase-option form requires unapproved choice. |
| Consumable / non-consumable behavior | Tips consumable-style; Paid Video/Watch-Party/Event exact-access consumable-style if app consumes after grant; VIP exact creator access / non-consumable-style if supported | Partially approved; architecture-specific details require final owner confirmation | No if provider asks explicit irreversible selection | Yes | Access and restore behavior | Indirect | Medium/high | Stop if provider requires explicit consumable/non-consumable decision not matching app proof. |
| Subscription base plan ID | `monthly` | Yes | Yes for ID only | No, already approved | Yes, cannot change/reuse | Indirect | Medium | Proceed only for exact `monthly`. |
| Billing period | Monthly auto-renewing | Yes conceptually | Yes only if no additional unapproved settings are required | Owner must confirm any nonstandard period/mode | Billing/legal disclosure | Yes | High | Proceed only for standard monthly auto-renewing; stop on prepaid/installment/nonstandard mode. |
| Grace period | Google Play default only if inherited and no explicit choice required | No | No if prompted | Yes | Subscription lifecycle and support | Not direct marketing copy | High | Stop if required. |
| Renewal/cancellation disclosure | `$4.99/month`, renews monthly unless canceled, manage/cancel through Google Play/account subscription management, creator-specific scope | Supported by docs, owner should confirm final public copy | Docs only; do not submit unapproved legal copy | Yes for public/legal text | Public/legal disclosure | Yes | High | Stop if dashboard asks for legal copy not already approved. |
| Review/publishing/submission/activation | Do not submit or activate public purchase availability in this lane | Yes | No for public submit/activate | Yes | Potentially public/irreversible | Yes by effect | High | Stop. |
| RevenueCat import | Import exact Google Play product after product/base plan exists | Yes | Yes if product exists and import is purely config, no Premium mapping | Owner should verify before activation | Provider config, not public alone | No | Medium | Proceed only after matching Google Play product/base plan exists. |
| RevenueCat entitlement mapping | Channel Subscription only -> `creator_channel_subscription`; no one-time product -> `premium` | Yes | Yes if dashboard permits safe mapping | Owner final activation approval later | Access mapping impact | No | High | Proceed only if no Premium mapping and no payout behavior. |

## Must-Stop Field Matrix

| Stop field | Why Codex must stop | Current observed status | Owner action required |
| --- | --- | --- | --- |
| Unknown tax category or any edit to tax category | Affects transaction tax treatment and compliance. | One-time form and subscription details show `Digital app sales`; subscription details also show `Service`. | Owner/legal/tax must confirm any active change or certification. |
| Age/content rating | Product rating is distinct from app rating and may be shown in applicable US states. | One-time form options observed: `All ages`, `13+`, `16+`, `18+`, `Unspecified`. | Owner/legal/product must select a rating for each one-time product or approve a shared rating. |
| Country/region beyond United States | Launch scope is US-only first. | Base-plan form showed broad regional price grid; prior flow initially selected all regions. | Owner/operator must complete or approve exact US-only scoping. |
| Publishing/review/activation control | Could make products publicly available or submit provider review. | Channel subscription base plan not created; one-time product Next disabled until required fields. | Owner must authorize any publish/activate/review submission separately. |
| Bank/tax identity fields | Private provider account data and legal/tax identity are prohibited. | Not needed for this lane. | Owner handles directly. |
| Charity/donation/fundraising classification | Tips are not a charitable donation and no tax deduction is claimed. | No charity field used. | Stop if surfaced. |
| Gambling/contest/sweepstakes classification | The six products are not gambling/contest/sweepstakes products. | No such field used. | Stop if surfaced. |
| Medical/financial/legal service classification | The six products are digital support/access only. | No such field used. | Stop if surfaced. |
| Physical goods/external services classification | Android digital purchases stay on Google Play/RevenueCat; physical merch stays future Stripe lane. | No such field used. | Stop if surfaced. |
| Subscription grace period, renewal mode, offer, trial, intro price | These change lifecycle, support, and legal disclosure. | Base-plan type options observed; offers locked until base plan exists. | Owner must approve any nonstandard setting. |
| Required legal disclosure not covered by current policy | Public copy can create obligations. | Current approved descriptions are short product descriptions only. | Owner/legal must approve. |
| Field implying creator payouts/live earnings | Payouts remain OFF. | No payout field used. | Stop and correct copy before any provider save. |
| Any switch/app activation | This lane is provider planning/setup only. | All app switches remain OFF. | Separate owner-approved activation lane required. |

## Proceed Field Matrix

| Proceed field | Approved value | Conditions |
| --- | --- | --- |
| Tips product ID | `cw_creator_tip_099` | Only for Google Play one-time product creation; no activation. |
| Paid Video product ID | `cw_paid_content_access_099` | Only for Google Play one-time product creation; no activation. |
| Watch-Party Ticket product ID | `cw_watch_party_ticket_099` | Only for Google Play one-time product creation; no activation. |
| Channel Subscription product ID | `cw_channel_subscription_monthly_499` | Already created as product record; base plan missing. |
| VIP product ID | `cw_vip_pass_499` | Only for Google Play one-time product creation; no activation. |
| Event Pass product ID | `cw_event_pass_099` | Only for Google Play one-time product creation; no activation. |
| Display names | `Creator Tip`, `Paid Video Access`, `Watch-Party Ticket`, `Creator Channel Subscription`, `Creator VIP Pass`, `Creator Event Pass` | Public names are owner-approved; do not add `sandbox`, `test`, or `proof`. |
| Short descriptions | Owner-approved text in flow sections below | Public descriptions are owner-approved; do not add payout or Premium claims. |
| Starting prices | `$0.99`, `$4.99`, `$4.99/month` | Launch defaults only; future custom pricing must be provider-backed/fail-closed. |
| Country/region | United States only first | Proceed only if dashboard can be conclusively set to US-only before save. |
| Existing app/product icon | Shared existing app/product icon | Proceed only if dashboard accepts it without new claims. |
| Product type | One-time for five products; subscription for Channel Subscription | Already owner-approved. |
| Base plan ID | `monthly` | Proceed only if other base-plan fields remain standard/approved and US-only. |
| RevenueCat mapping | No creator product maps to `premium`; Channel Subscription maps only to `creator_channel_subscription` | Only after matching Google Play product/base plan exists. |
| Docs/proof updates | This plan and proof artifacts | Always allowed if no secrets/private data are included. |

## Flow Sections

### Tips

#### Product Classification

- Digital purchase: yes.
- One-time or subscription: one-time product.
- Repeat-purchasable: yes, recommended consumable-style support where Google Play setup supports repeat purchase.
- Scope: creator-specific contribution only.
- Unlocks content/access: no.
- Creates payout/payable balance now: no.
- Provider rail: Google Play / RevenueCat.
- Stripe separation: Stripe is not used because this is an Android digital purchase; Stripe remains future-only for creator payouts and physical merch.

#### Google Play Form Fields

| Field | Recommended / owner-approved value | Codex may fill? | Owner confirmation required? | Notes |
| --- | --- | --- | --- | --- |
| Product ID | `cw_creator_tip_099` | Yes | No | Immutable after creation. |
| Product type | One-time product | Yes | No | Owner-approved. |
| Product name | `Creator Tip` | Yes | No | Public/user-visible. |
| Short description | `Send optional support to a creator. Tips do not unlock content.` | Yes | No | Public/user-visible. |
| Icon/graphic | Existing shared app/product icon | Yes if accepted | No for existing icon; yes for new asset | Public. |
| Purchase option | Consumable-style support / repeat-purchasable if supported | Stop if provider labels require explicit unresolved choice | Yes for final provider-specific purchase option | Must not unlock access. |
| Consumable vs non-consumable | Consumable-style if explicit consumption required after receipt | Stop if uncertain | Yes if dashboard asks directly | Repeat support implies consumable-style, but exact provider selection must match architecture. |
| Price/currency | `$0.99` USD | Yes only with US-only scope | No | Public billing value. |
| Country/region availability | United States only first | Yes only if unambiguous | No for US-only | Stop on all-region ambiguity. |
| Product tax category | `Digital app sales` if inherited/default | No active edit | Yes for changes/certifications | No charity/nonprofit/donation tax deduction claim. |
| Age/content rating | Owner-selected value | No | Yes | Must-stop. |
| Legal/product disclosure | Contribution-only; no content unlock; no payout promise | Docs only | Yes for provider legal text | No charity, investment, gambling, donation deduction, or payout claim. |
| Review/publish/activation | Do not submit/activate | No | Yes | Activation is separate lane. |

#### Recommended Compliance Stance

Classify as optional digital creator support through Google Play. It unlocks no content, room, VIP, subscription, event, badge, payout, creator authority, or Premium. It is not a charity/nonprofit donation, not tax-deductible fundraising, not gambling, not an investment, and not a physical good. Owner must confirm any required tax category if Google Play asks for one that is not obvious or inherited from the app defaults.

#### RevenueCat Compliance Mapping

Import only after Google Play product exists. No entitlement is required for current direct-product support readback. It must not map to `premium`, must not create payout behavior, and must not move creator earnings. Verify product ID, Android package `com.chillywood.mobile`, no Premium entitlement, and no payout/payable behavior.

#### Refund / Support / Dispute Stance

Provider refunds remain manual/external. No instant refund promise and no in-app refund execution. Support can review accidental, duplicate, unauthorized, or platform-fault tips. There is no access revoke because tips unlock nothing. Creator sees not-payable / payouts off. Viewer sees purchase disabled/unavailable copy while switches are OFF.

### Paid Video

#### Product Classification

- Digital purchase: yes.
- One-time or subscription: one-time product.
- Repeat-purchasable: normally no for the same target after exact access exists; future price variants must map to provider-backed products/catalog entries.
- Scope: exact paid creator video/source target.
- Unlocks content/access: yes, one paid video only.
- Creates payout/payable balance now: no.
- Provider rail: Google Play / RevenueCat.
- Stripe separation: Stripe is not used because Android digital content access must remain on Google Play / RevenueCat in this lane.

#### Google Play Form Fields

| Field | Recommended / owner-approved value | Codex may fill? | Owner confirmation required? | Notes |
| --- | --- | --- | --- | --- |
| Product ID | `cw_paid_content_access_099` | Yes | No | Immutable after creation. |
| Product type | One-time product | Yes | No | Owner-approved. |
| Product name | `Paid Video Access` | Yes | No | Public. |
| Short description | `Unlock access to one paid creator video.` | Yes | No | Public. |
| Icon/graphic | Existing shared app/product icon | Yes if accepted | No for existing icon; yes for new asset | Public. |
| Purchase option | Exact-access one-time product | Stop if provider asks unapproved variant | Yes for final provider-specific option | Must support exact-target backend grant. |
| Consumable vs non-consumable | Use existing app architecture: if purchase is consumed after exact-target access grant, consumable-style; otherwise stop | No if uncertain | Yes if explicit | Do not guess. |
| Price/currency | `$0.99` USD | Yes only with US-only scope | No | Public billing value. |
| Country/region availability | United States only first | Yes only if unambiguous | No for US-only | Stop on all-region ambiguity. |
| Product tax category | `Digital app sales` if inherited/default | No active edit | Yes for changes/certifications | Digital content access. |
| Age/content rating | Owner-selected value | No | Yes | Must-stop. |
| Legal/product disclosure | Unlocks one paid creator video only | Docs only | Yes for provider legal text | No Premium, subscription, payout, or physical good claim. |
| Review/publish/activation | Do not submit/activate | No | Yes | Activation is separate lane. |

#### Recommended Compliance Stance

Classify as digital content access through Google Play. Access is exact-target for one paid creator video. It does not unlock Premium, other videos, room access, VIP, subscriptions, event passes, physical goods, or payout rights.

#### RevenueCat Compliance Mapping

Import only after Google Play product exists. Current architecture may use direct-product readback plus backend exact-target grants. Do not attach to `premium`. Verify no creator earnings movement and no app-wide entitlement.

#### Refund / Support / Dispute Stance

Provider refunds remain manual/external. No instant refund promise. Support path covers access never worked, content removed before meaningful use, DMCA/removal, or platform fault. Revokes are exact-target. Creator sees not-payable / payouts off. Viewer sees this-video-only copy when available and safe unavailable copy while OFF.

### Watch-Party Ticket

#### Product Classification

- Digital purchase: yes.
- One-time or subscription: one-time product.
- Repeat-purchasable: no for same ticket target unless owner creates a separate provider-backed ticket/offer.
- Scope: exact in-app Watch-Party room/ticket target.
- Unlocks content/access: yes, one ticketed room only.
- Creates payout/payable balance now: no.
- Provider rail: Google Play / RevenueCat.
- Stripe separation: Stripe is not used because this is an Android digital in-app access ticket, not physical/external ticketing.

#### Google Play Form Fields

| Field | Recommended / owner-approved value | Codex may fill? | Owner confirmation required? | Notes |
| --- | --- | --- | --- | --- |
| Product ID | `cw_watch_party_ticket_099` | Yes | No | Immutable. |
| Product type | One-time product | Yes | No | Owner-approved. |
| Product name | `Watch-Party Ticket` | Yes | No | Public. |
| Short description | `Unlock access to one ticketed Watch-Party room.` | Yes | No | Public. |
| Icon/graphic | Existing shared app/product icon | Yes if accepted | No for existing icon; yes for new asset | Public. |
| Purchase option | Exact-access one-time product | Stop if unresolved | Yes for final provider-specific option | Must not grant LiveKit authority. |
| Consumable vs non-consumable | Use existing app architecture; stop if explicit provider choice is uncertain | No if uncertain | Yes if explicit | Exact room grant remains backend source. |
| Price/currency | `$0.99` USD | Yes only with US-only scope | No | Public. |
| Country/region availability | United States only first | Yes only if unambiguous | No for US-only | Stop on all-region ambiguity. |
| Product tax category | `Digital app sales` if inherited/default | No active edit | Yes for changes/certifications | Digital in-app access. |
| Age/content rating | Owner-selected value | No | Yes | Must-stop. |
| Legal/product disclosure | Digital room access only; no external event admission | Docs only | Yes for provider legal text | No transportation/physical admission. |
| Review/publish/activation | Do not submit/activate | No | Yes | Activation is separate lane. |

#### Recommended Compliance Stance

Classify as a digital access ticket to one in-app Watch-Party room. It does not grant host, speaker, moderator, LiveKit publish authority, external event admission, transportation, physical goods, Premium, or payouts.

#### RevenueCat Compliance Mapping

Import only after Google Play product exists. No Premium entitlement. Direct-product fallback is acceptable only if backend exact-room grant remains the access source. Verify no LiveKit authority and no payout behavior.

#### Refund / Support / Dispute Stance

Provider refunds remain manual/external. Support path covers room ended/failed/no-show/platform fault. Revokes are exact room/ticket target only. Existing access remains stable during outage unless revoke/refund policy applies. Creator sees not-payable / payouts off. Viewer sees disabled/off copy while OFF.

### Channel Subscription

#### Product Classification

- Digital purchase: yes.
- One-time or subscription: subscription.
- Repeat-purchasable: recurring monthly auto-renewing subscription unless canceled.
- Scope: one creator's subscriber area.
- Unlocks content/access: yes, creator-channel subscriber access only.
- Creates payout/payable balance now: no.
- Provider rail: Google Play / RevenueCat.
- Stripe separation: Stripe is not used because Android digital subscriptions remain Google Play / RevenueCat products; Stripe Connect payouts remain future-only.

#### Google Play Form Fields

| Field | Recommended / owner-approved value | Codex may fill? | Owner confirmation required? | Notes |
| --- | --- | --- | --- | --- |
| Product ID | `cw_channel_subscription_monthly_499` | Already created | No | Product record exists; immutable. |
| Product type | Subscription | Already created | No | Owner-approved. |
| Product name | `Creator Channel Subscription` | Already created | No | Public. |
| Short description / benefits | `Monthly access to one creator's subscriber area.` | Docs only | Yes if dashboard asks for benefits/legal text | Product record currently shows Benefits `-`. |
| Base plan ID | `monthly` | Yes for ID only | No | Immutable after creation. |
| Base plan type | Auto-renewing | Yes only if no unresolved fields | Owner must confirm any nonstandard type | Prepaid/installments are not approved. |
| Billing period | Monthly | Yes only if standard monthly control | Owner must confirm if not standard | Must disclose `$4.99/month`. |
| Grace period | Google Play default only if inherited | No if prompted | Yes | Must-stop if required. |
| Renewal/cancellation disclosure | `$4.99/month`; renews monthly unless canceled; manage/cancel through Google Play/account subscriptions; one creator only | Docs only | Yes for public/legal text | Required before activation. |
| Price/currency | `$4.99/month` USD | Yes only with US-only scope | No | Public billing value. |
| Country/region availability | United States only first | Yes only if unambiguous | No for US-only | Stop on all-region ambiguity. |
| Tax/policy settings | Current product details show `Digital app sales` and `Service` | No active edit | Yes for changes/certifications | Tax/legal effect. |
| Offers/free trial/intro price | None in this lane | No | Yes | Offers are optional and not approved. |
| Review/publish/activation | Do not publish/activate | No | Yes | Base plan activation/public availability is separate. |

#### Recommended Compliance Stance

Classify as a recurring digital subscription to one creator's subscriber area. It must clearly disclose `$4.99/month`, monthly billing frequency, cancellation/manage path, and creator-specific scope. It does not unlock Premium, other creators, VIP, paid videos, room tickets, event passes, payout rights, or payable creator balances. Owner must approve any grace period, renewal mode, base-plan setting, tax category, or offer setting not already standardized by Google Play defaults.

#### RevenueCat Compliance Mapping

Import only after the Google Play base plan exists. Map only to `creator_channel_subscription`. Do not attach to `premium`. Direct-product fallback may remain documented if app architecture uses it, but entitlement/readback must be creator-specific and no payout behavior may be created.

#### Refund / Support / Dispute Stance

Provider refunds remain manual/external. No instant refund promise and no in-app refund execution. Support path covers missing entitlement, cancellation/expiration, creator inactivity, and subscriber-only access problems. Revokes/expiration are exact creator-subscription target only. Creator sees not-payable / payouts off. Viewer sees disabled/off copy while OFF.

### VIP

#### Product Classification

- Digital purchase: yes.
- One-time or subscription: one-time product.
- Repeat-purchasable: no for same creator access unless owner creates a provider-backed renewal/upgrade path.
- Scope: exact creator-specific VIP access.
- Unlocks content/access: yes, creator VIP only.
- Creates payout/payable balance now: no.
- Provider rail: Google Play / RevenueCat.
- Stripe separation: Stripe is not used because this is Android digital creator-specific access, not physical merch or payout.

#### Google Play Form Fields

| Field | Recommended / owner-approved value | Codex may fill? | Owner confirmation required? | Notes |
| --- | --- | --- | --- | --- |
| Product ID | `cw_vip_pass_499` | Yes | No | Immutable. |
| Product type | One-time product | Yes | No | Owner-approved. |
| Product name | `Creator VIP Pass` | Yes | No | Public. |
| Short description | `Unlock creator-specific VIP access.` | Yes | No | Public. |
| Icon/graphic | Existing shared app/product icon | Yes if accepted | No for existing icon; yes for new asset | Public. |
| Purchase option | Exact creator-specific VIP access product | Stop if unresolved | Yes for final provider-specific option | Must not imply Premium. |
| Consumable vs non-consumable | Non-consumable-style creator-specific pass if supported; stop if provider choice conflicts with app architecture | No if uncertain | Yes if explicit | VIP restore/ownership semantics must match exact creator access. |
| Price/currency | `$4.99` USD | Yes only with US-only scope | No | Public. |
| Country/region availability | United States only first | Yes only if unambiguous | No for US-only | Stop on all-region ambiguity. |
| Product tax category | `Digital app sales` if inherited/default | No active edit | Yes for changes/certifications | Digital access. |
| Age/content rating | Owner-selected value | No | Yes | Must-stop. |
| Legal/product disclosure | Creator-specific VIP access only | Docs only | Yes for provider legal text | No Premium, subscription, physical good, or payout claim. |
| Review/publish/activation | Do not submit/activate | No | Yes | Activation is separate lane. |

#### Recommended Compliance Stance

Classify as creator-specific digital VIP access. It unlocks exact creator VIP only. It does not unlock Premium, subscriptions, other creators, paid videos, rooms, events, physical goods, payout rights, or LiveKit authority.

#### RevenueCat Compliance Mapping

Import only after Google Play product exists. No Premium entitlement. Direct-product fallback is acceptable only if backend exact-creator VIP access remains the access source. Verify no payout/payable behavior.

#### Refund / Support / Dispute Stance

Provider refunds remain manual/external. Support path covers unavailable perks, early removal, misrepresentation, missing VIP access, or platform fault. Revokes are exact creator VIP only. Creator sees not-payable / payouts off. Viewer sees disabled/off copy while OFF.

### Event Pass

#### Product Classification

- Digital purchase: yes.
- One-time or subscription: one-time product.
- Repeat-purchasable: no for the same event target unless owner creates a provider-backed tier/offer.
- Scope: exact in-app paid creator event.
- Unlocks content/access: yes, one event only.
- Creates payout/payable balance now: no.
- Provider rail: Google Play / RevenueCat.
- Stripe separation: Stripe is not used because this is Android digital in-app event access, not physical/external ticketing or merch.

#### Google Play Form Fields

| Field | Recommended / owner-approved value | Codex may fill? | Owner confirmation required? | Notes |
| --- | --- | --- | --- | --- |
| Product ID | `cw_event_pass_099` | Yes | No | Immutable. |
| Product type | One-time product | Yes | No | Owner-approved. |
| Product name | `Creator Event Pass` | Yes | No | Public. |
| Short description | `Unlock access to one paid creator event.` | Yes | No | Public. |
| Icon/graphic | Existing shared app/product icon | Yes if accepted | No for existing icon; yes for new asset | Public. |
| Purchase option | Exact-access one-time product | Stop if unresolved | Yes for final provider-specific option | Must not imply physical event admission. |
| Consumable vs non-consumable | Use existing app architecture; stop if explicit provider choice is uncertain | No if uncertain | Yes if explicit | Exact event grant remains backend source. |
| Price/currency | `$0.99` USD | Yes only with US-only scope | No | Public. |
| Country/region availability | United States only first | Yes only if unambiguous | No for US-only | Stop on all-region ambiguity. |
| Product tax category | `Digital app sales` if inherited/default | No active edit | Yes for changes/certifications | Digital in-app access. |
| Age/content rating | Owner-selected value | No | Yes | Must-stop. |
| Legal/product disclosure | Digital in-app event access only | Docs only | Yes for provider legal text | No physical event admission, external ticketing, Premium, or payout claim. |
| Review/publish/activation | Do not submit/activate | No | Yes | Activation is separate lane. |

#### Recommended Compliance Stance

Classify as a digital access pass for one in-app paid creator event. It does not provide physical event admission, external ticketing, transportation, physical goods, Premium, payout rights, or other-event access.

#### RevenueCat Compliance Mapping

Import only after Google Play product exists. No Premium entitlement. Direct-product fallback is acceptable only if backend exact-event access remains the source of truth. Verify no payout/payable behavior.

#### Refund / Support / Dispute Stance

Provider refunds remain manual/external. Support path covers canceled, rescheduled, ended, unavailable, or platform-fault events. Revokes are exact event pass only. Creator sees not-payable / payouts off. Viewer sees disabled/off copy while OFF.

## RevenueCat Compliance Mapping Matrix

| Flow | Product import status | Entitlement / offering requirement | No Premium mapping | No payout behavior | Safe direct-product fallback | Post-Google Play verification |
| --- | --- | --- | --- | --- | --- | --- |
| Tips | Blocked until Google Play product exists | No entitlement required unless owner chooses package for presentation | Required | Required | Yes, receipt/support readback only | Product ID, package, no entitlement, no Premium. |
| Paid Video | Blocked until Google Play product exists | No entitlement required; backend exact grant remains access source | Required | Required | Yes | Product ID, exact target grant path, no Premium. |
| Watch-Party Ticket | Blocked until Google Play product exists | No entitlement required; backend exact room grant remains access source | Required | Required | Yes | Product ID, no LiveKit authority, no Premium. |
| Channel Subscription | Blocked until Google Play base plan exists | Map only to `creator_channel_subscription`; package/offering only if architecture requires | Required | Required | Yes, if entitlement/readback remains creator-specific | Product/base plan ID `cw_channel_subscription_monthly_499:monthly`, entitlement safe. |
| VIP | Blocked until Google Play product exists | No entitlement required unless owner chooses package for presentation | Required | Required | Yes | Product ID, exact creator access, no Premium. |
| Event Pass | Blocked until Google Play product exists | No entitlement required; backend exact event grant remains access source | Required | Required | Yes | Product ID, exact event access, no Premium. |

## Refund / Support / Dispute Matrix

| Flow | Support path | Refund path | Dispute path | Revoked/unavailable behavior | Creator expectation | Viewer off-state |
| --- | --- | --- | --- | --- | --- | --- |
| Tips | Accidental/duplicate/unauthorized/platform-fault support | Manual/external provider review only | Provider/store dispute handled externally | No access revoke; receipt/readback only | Payouts not live; not payable | Tip disabled/unavailable; tips unlock nothing. |
| Paid Video | Missing access, content unavailable, DMCA/removal, platform fault | Manual/external provider review only | Support verifies video id, intent, provider event, grant | Exact video revoke/lock only | Sales not payable | Paywall disabled/unavailable. |
| Watch-Party Ticket | Room ended/failed/no-show/platform fault | Manual/external provider review only | Support verifies room id, offer, ticket/grant | Exact room revoke/lock only | Ticket rows not payable | Ticket disabled/unavailable; no provider sheet. |
| Channel Subscription | Missing entitlement, cancellation/expiration, creator inactivity | Manual/external provider review only | Support verifies provider period, subscription row, effective access | Exact creator subscription lifecycle/revoke | Subscription rows not payable | Subscribe disabled/unavailable. |
| VIP | Missing VIP, unavailable perks, misrepresentation, platform fault | Manual/external provider review only | Support verifies creator id, provider event, VIP pass/grant | Exact creator VIP revoke only | VIP sales not payable | VIP disabled/unavailable. |
| Event Pass | Canceled/rescheduled/ended/unavailable/platform fault | Manual/external provider review only | Support verifies event id, pass/grant, provider event | Exact event revoke/expiration only | Event pass rows not payable | Event pass disabled/unavailable. |

## Stripe Separation

Stripe is reserved for future creator payouts and physical merch. No Android digital creator-money purchase uses Stripe in this lane. No Stripe Connect, payout, cash-out, transfer, payout batch, merch checkout, payable balance, or creator earnings movement is enabled. Stripe readiness remains a separate owner-approved lane. No Stripe API key, webhook secret, provider secret, bank detail, tax ID, customer data, or private dashboard screenshot may be committed.

## Dashboard Creation Attempt Result

| Provider | Result |
| --- | --- |
| Google Play one-time products | Product creation remains blocked. The form exposes a product-specific Age rating selector with options `All ages`, `13+`, `16+`, `18+`, and `Unspecified`; this is distinct from the app rating and is a must-stop owner/legal field. Product tax category is visible as `Digital app sales`; Codex did not edit it. Icon preview was visible, but age rating remains unresolved. No one-time product was submitted. |
| Google Play Channel Subscription | Product record `cw_channel_subscription_monthly_499` exists. Base-plan form exposes immutable Base plan ID, Type choices (`Auto-renewing`, `Prepaid`, `Installments`), country/region availability, and price setup. Codex did not save the base plan because US-only availability/pricing was not conclusively safe in the visible form. |
| RevenueCat | Import/mapping remains blocked until matching Google Play one-time products and the Channel Subscription base plan exist. |
| Stripe | Not used for Android digital products. Stripe payout/merch remains OFF and future-only. |

## Owner Action List

1. Choose the product age/content rating for each one-time product, or approve one shared rating for Tips, Paid Video, Watch-Party Ticket, VIP, and Event Pass.
2. Confirm that `Digital app sales` is the correct Google Play product tax category for all six digital creator-money products, and confirm whether the existing `Service` policy setting on the subscription is correct.
3. Confirm purchase-option details for each one-time product: repeat-purchasable/consumable-style for Tips and exact-access one-time behavior for Paid Video, Watch-Party Ticket, VIP, and Event Pass.
4. Confirm whether Paid Video, Watch-Party Ticket, Event Pass, and VIP should be consumed after backend exact-target grant or treated as non-consumable/owned access in Google Play/RevenueCat where provider setup asks explicitly.
5. Complete or approve exact US-only country/region scoping before any product/base plan save.
6. Create the five Google Play one-time products only after the stop fields above are approved.
7. Create the `monthly` base plan for `cw_channel_subscription_monthly_499` only after US-only availability, standard auto-renewing monthly type, grace-period/default lifecycle, and pricing are conclusively approved.
8. Import/map products into RevenueCat only after matching Google Play products/base plans exist.
9. Verify no creator-money product maps to `premium`.
10. Keep all creator-money switches, live money, payouts, Stripe payout/merch, and provider refund automation OFF until a separate activation/proof lane.
