# Chi'llywood Owner Admin + Rachi Control Implementation Spec

2026-05-06 current-route note: creator owner controls live in Platform Studio on `/channel-studio`; `/channel-settings` remains compatibility. Platform/operator controls live in Admin Command Center on `/admin`.

## 1. Purpose And Scope
This document defines Chi'llywood's owner-admin / admin-workflow / Rachi-control chapter.

It is implementation doctrine, not a promise that every admin or AI-ops control already exists.

It exists to:
- preserve clear authority boundaries between owner, staff admin, and Rachi
- define the bounded admin/control architecture using current route truth
- define what current repo truth already supports
- define what must remain owner-only
- define how future staff/admin roles and Rachi-control layers should expand without turning `/admin` into a messy god-panel

This chapter does not:
- rewrite public/product route doctrine
- let Rachi outrank owner authority
- pretend automation, emergency controls, or business tools are real when they are not
- put raw owner credentials in repo code, docs, or client bundles

## 2. Current Doctrine That Must Be Preserved

### 2.1 Locked Route Truth
| Route | Owner File | Doctrine |
| --- | --- | --- |
| `/admin` | `app/admin.tsx` | Canonical platform owner/operator Admin Command Center. |
| `/channel-studio` | `app/channel-studio/index.tsx` | Preferred creator control center, not the platform admin console. |
| `/channel-settings` | `app/channel-settings.tsx` | Compatibility route for older owner Platform Studio links. |
| `/profile/[userId]` | `app/profile/[userId].tsx` | Canonical personal/social Profile route, including official-platform identities like Rachi. |
| `/channel/[userId]` | `app/channel/[userId].tsx` | Canonical public Platform route; must not expose platform admin controls. |
| `/chat`, `/chat/[threadId]` | `app/chat/index.tsx`, `app/chat/[threadId].tsx` | Canonical Chi'lly Chat routes, including official-platform thread continuity. |

Do not create route proliferation in this chapter.

### 2.2 Authority Rules
- Owner / Super Admin is above Rachi.
- Rachi is an internal AI operations layer, never the final authority.
- Creator-facing controls stay separate from admin-facing controls.
- Owner-only controls must not leak to general admins or creators.
- Meaningful admin and Rachi actions should remain auditable where current truth supports it.
- `/admin` stays bounded; deeper sections should remain current-route-compatible if added later.
- Do not create duplicate admin routes such as `/admin-command-center`.

### 2.3 Three-Mode Structure
Chi'llywood should preserve three distinct modes:

1. `User / Creator Mode`
   - public/product and creator/channel workflows
   - canonical owners remain `/profile/[userId]`, `/channel/[userId]`, `/channel-studio`, `/channel-settings` compatibility, title/player, chat, and room routes

2. `Admin Mode`
   - bounded staff/operator workflows
   - review, queue, content/config visibility, and platform operations that current truth really supports
   - current owner remains `/admin`

3. `Emergency / Super-Admin Mode`
   - highest-authority owner-only controls
   - reserved for emergency/system authority, Rachi overrides, and other irreversible or platform-wide actions
   - not currently implied by the existing operator/moderator model

## 3. Current Owner / Admin / Rachi Truth Already In Repo

### 3.1 Current Admin Truth
Current repo truth supports Admin Command Center V1A through:
- `app/admin.tsx`
- `_lib/moderation.ts`
- `platform_role_memberships`
- current app configuration and content-management controls already present in `/admin`

Currently real:
- role-aware access into `/admin`
- moderation queue visibility for active `operator` / `moderator` memberships
- privileged admin writes gated more tightly than simple admin visibility
- content/programming/config management already living on `/admin`
- creator monetization grant controls already living on `/admin`
- Admin Command Center presentation on the canonical `/admin` route
- Admin Home with Platform Snapshot and Needs Attention
- section tabs for Home, Reports, Content, Roles, Audit, Rachi, Users, Premium, Kill Switches, Usage, Ads, Revenue, Payouts, Networks, Sponsors, Fraud, and System
- Reports, Content, Roles, Audit, and Rachi backed behavior preserved
- Users, Premium, Kill Switches, Ads, Revenue, Payouts, Networks, Sponsors, Fraud, and portions of Usage/System presented as read-only or foundation-only where backing is not connected
- Ads Launch Foundation V1A/V1B/V1C status in Admin Ads as read-only/foundation: placeholder/not-connected provider, Home native/feed placeholder foundation, placeholder interstitial controller foundation, launch caps, forbidden contexts, AppLovin MAX future direction, Unity through AppLovin MAX future direction, no AdMob-only doctrine, and CTV future-only copy
- Fraud Enforcement Foundation status in Admin Fraud as read-only/foundation: fraud holds, fraud reasons, evidence records, planned actions, review notes, appeal placeholders, and fraud audit logs are visible as counts only, with no active enforcement or risk score
- Immutable Admin Audit Log Foundation status in Admin Audit as read-only/foundation: latest `platform_admin_audit_logs` rows may be visible if connected, rows are append-only, and the derived role/safety summary remains separate
- Creator Payout Read-Only Dashboard Foundation belongs to Platform Studio, not Admin: creators can view read-only payout readiness/foundation rows for their own `creator_payout_ledger_entries` only, while Admin Payouts remains a platform/operator read-only foundation panel with no payout approval/release
- Stripe Connect Test-Mode Backend Functions are pushed and deployed as backend-only/test-mode functions: account, onboarding-link, account-sync, and webhook flows use internal auth validation where applicable, backend `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are configured by name/digest only, account creation/reuse, onboarding-link creation, account sync, signed webhook handling, and duplicate-event idempotency passed test-mode provider proof, invalid webhook signatures are rejected, Admin Payout Provider Dashboard is read-only counts/status only, Creator-facing Connect Stripe Setup Button Planning/Spec is recorded but no button is implemented, and these lanes add no Admin payout actions, transfer, payout, checkout session, production Stripe call, or live money behavior
- Payout Review Queue + Batch Draft Workflow Foundation status in Admin Payouts as read-only/foundation: payout review records, review notes, payout batches, batch items, provider transfers, holds, accounts, ledger entries, and audit rows may be visible as counts/foundation rows only; no payout can be approved, released, processed, marked paid, transferred, or treated as payable
- Provider Transfer Records Sync Foundation status in Admin Payouts as read-only/foundation: Provider Transfer Records, Sync Required, Synced/Test, and Failed Sync counts may be visible only as status import foundation; the backend sync function is admin/operator-only and test-mode only, and no transfer, payout, checkout session, Mark Paid, Retry Transfer, Send Money, Release Payout, Process Batch, fake paid status, payable balance, or live money movement exists
- Network Invoice Draft Workflow + Overage Warning/Readout Foundation status in Admin Networks as read-only/foundation: internal draft invoice, draft line item, warning-only overage, and review-required overage counts may be visible only as non-billing foundation; no invoice can be sent, no customer can be charged, no payment link exists, no overage can be billed, no fake revenue or unpaid balance exists, and provider reconciliation/trusted usage are required before real billing

Currently not real:
- audit row edit/delete/clear controls
- user search, ban, suspend, restrict, upload-disable, live-disable, or entitlement-edit tools
- manual Premium toggles or subscription editing
- working runtime kill switches beyond current Premium access logic labels
- real ad SDKs, real ad IDs, real ad provider initialization, real ad rendering, CTV inventory, or ad revenue
- fake MRR, ARR, creator earnings, sponsor revenue, payout balances, invoices, network billing, or payout execution
- creator Withdraw, Cash Out, Connect Stripe, KYC live flow, tax form flow, payout approval, payout release, payout batch processing, transfer creation, fake payable balance, or fake earnings
- creator-facing Stripe provider behavior, production Stripe account creation, production onboarding link creation, checkout sessions, transfers, payouts, Stripe SDKs in React Native, Stripe keys in repo, provider secrets, payment credentials, or live money actions
- sponsor checkout/upload/approval or payout split execution
- working/live fraud enforcement, payout pauses, account restrictions, upload restrictions, live restrictions, monetization disables, or risk scores
- bandwidth, LiveKit, participant-minute, storage billing, live revenue-ledger, live payout-ledger, live network-invoice, live sponsor-deal, or live fraud-enforcement systems

### 3.2 Current Creator-Side Safety/Admin Truth
Current creator-side summary truth already exists in:
- `_lib/channelReadModels.ts`
- `app/channel-settings.tsx`

This truth is summary-only:
- creator safety/admin visibility
- role-aware recent queue summary
- audience/admin adjacent summaries

It is not:
- the platform admin queue
- the owner console

### 3.3 Current Rachi Truth
Current Rachi truth is real but narrow:
- `_lib/officialAccounts.ts` defines Rachi as the protected official platform account
- Rachi already lives on canonical profile and Chi'lly Chat surfaces
- moderation/access helpers already recognize `official_platform` as a distinct actor role
- current trust posture is identity-level and audit-minded, not automation-control-level

Current Rachi truth does not yet mean:
- a rule engine
- an automation queue
- domain pause/resume controls
- autonomous enforcement powers

## 4. Exact Authority Model

### 4.1 Owner / Super Admin
Owner authority is the highest platform authority in this chapter.

Owner-only truth should eventually control:
- platform-wide admin access authority
- staff-role assignment / revocation
- Rachi global enable/disable
- Rachi domain-level approval/pause state
- emergency mode
- irreversible overrides
- protected bootstrap and credential recovery flows

Owner authority must stay above:
- operator
- moderator
- creator/channel owner
- Rachi

Current autonomous approval backing is live for bounded Level 3/4 autonomous-operation review. Role truth is `platform_role_memberships`; `owner` and `super_admin` memberships may approve or deny autonomous approval requests from the canonical `/admin` route or the trusted approval backend. Approval is not execution: the requesting operator must re-run fresh preflight, prove exact system/action/write-scope match, verify the request is unexpired, verify emergency stop is not active, and write audit before execution can be marked complete.

This live approval path is a control framework only. It does not add manual Premium entitlement controls, billing/provider mutations, payout/cashout controls, broad auth/RLS rewrites, public/private exposure changes, R2/media behavior changes, LiveKit routing-policy changes, or destructive DB authority. Those remain separate high-risk actions governed by the autonomous systems registry and owner/external confirmation rules.

Rachi can create or recommend an approval request through a trusted path, but Rachi cannot approve its own request. Autonomous operators cannot approve their own requests. Owner/Super Admin authority remains final.

Money Flow Control is now registered as `money_flow_control` in the autonomous systems registry. It is a scoped-write control plane for Premium revenue readback, RevenueCat/Google Play receipt readback, Stripe Connect foundation, creator payout ledger, payout review queue, payout batches, provider transfer records, network billing, sponsor deals, fraud holds, usage metering, refunds/disputes future scope, and tax/compliance future scope. Read-only reconciliation plus safe status/review/audit writes can be autonomous through `money_operator_events`, `money_reconciliation_runs`, `money_reconciliation_findings`, `money_provider_sync_status`, `money_duplicate_event_detections`, `money_required_review_flags`, `money_flow_health_snapshots`, `money_operator_learning_state`, and Level 3/4 approval-request creation. Real money mutation requires Level 3/4 approval. Real money movement requires Level 4 owner/super-admin approval plus external provider confirmation/readback. The guard enforces no manual Premium grant, no fake revenue, no fake creator earnings, no fake payable balance, no fake paid status, no fake transfer complete, no payout release without provider confirmation, no charge/transfer/cashout/payment-link/invoice creation, no provider product mutation, and no test-mode data described as production. Rachi can recommend/request, not approve.

### 4.2 Staff Admin
Staff admin is below owner and should split into bounded role layers over time.

Near-term honest roles:
- `operator`
- `moderator`

Future roles may expand later, but current doctrine should not pretend they already exist.

### 4.3 Rachi
Rachi is an internal AI operations layer and official platform identity.

Allowed maturity ladder:
- `Observe Only`
- `Assist / Recommend`
- `Limited Auto-Action`
- higher-trust automation later only if explicitly backed

Rachi must never become:
- final authority over owner decisions
- an unreviewed enforcement engine by default
- a hidden control plane with no audit trail

## 5. What Stays Owner-Only
- owner bootstrap and owner-role assignment
- staff-role assignment and revocation
- platform-wide Rachi enable/disable
- domain-level Rachi pause/resume
- emergency-mode entry/exit
- irreversible overrides
- owner-only audit visibility if future deeper audit trails land
- any cross-domain kill-switch behavior

These must not leak to:
- ordinary creators
- moderators
- general operators unless current truth explicitly permits it
- Rachi itself

## 6. Future Staff/Admin Roles And Boundaries

### 6.1 Current Honest Roles
- `operator`
  - can access `/admin`
  - can manage currently supported privileged admin writes
  - can review moderation queue where backed

- `moderator`
  - can review moderation queue where backed
  - should not implicitly inherit owner/system powers

### 6.2 Later-Phase Roles
Later only, unless future work proves otherwise:
- support staff
- monetization reviewers
- creator-review staff
- analytics staff
- owner delegates with partial system power

Do not pretend these are already real.

## 7. Rachi Domains
Rachi domains should remain separable at minimum:
- Moderation
- Support
- Monetization Review
- Creator Review
- Live Room Risk

Current doctrine:
- domain separation is approved
- real domain controls must not appear until backing truth exists

## 8. Current Source-Of-Truth Already In Repo
- `app/admin.tsx` for current bounded admin/operator surface
- `_lib/moderation.ts` for moderation access, queue, actor-role, and review truth
- `_lib/officialAccounts.ts` for canonical Rachi identity truth
- `app/profile/[userId].tsx` and `app/chat/*` for canonical official-platform route continuity
- `platform_role_memberships` for current staff-role membership truth
- `_lib/channelReadModels.ts` and Platform Studio (`app/channel-settings.tsx` implementation, `app/channel-studio/index.tsx` route) for creator-side admin/safety summary truth
- `app/admin.tsx` for Admin Command Center V1A section structure and foundation-only copy
- Ads V1A foundation source files: `_lib/ads/adConfig.ts`, `_lib/ads/adEligibility.ts`, `_lib/ads/adProvider.ts`, `_lib/ads/providers/placeholder.ts`, `_lib/ads/adSession.ts`, `hooks/useAdEligibility.ts`, and `hooks/useActiveBrowsingTime.ts`
- Ads V1B source files: `components/ads/NativeAdSlot.tsx`, Home placement in `app/(tabs)/index.tsx`, native/feed cap proof support in `_lib/ads/adSession.ts`, and read-only/foundation Admin Ads copy in `app/admin.tsx`
- Ads V1C source files: `components/ads/InterstitialController.tsx`, root mount in `app/_layout.tsx`, and read-only/foundation Admin Ads copy in `app/admin.tsx`
- Admin Usage Metering Foundations 37-39 plus Admin Usage Metering Foundation V1 source files: `_lib/platformUsage.ts`, read-only Admin Usage copy in `app/admin.tsx`, remote-applied migrations `supabase/migrations/202605070003_platform_usage_metering_foundation.sql` and `supabase/migrations/202605070004_admin_usage_metering_v1.sql`, and generated usage/provider table types in `supabase/database.types.ts`
- Ledger Systems 4A-4D finance foundation source files: `_lib/platformFinance.ts`, read-only Admin Revenue/Payouts/Networks/Sponsors/Fraud copy in `app/admin.tsx`, and migration `supabase/migrations/202605070005_platform_finance_ledger_foundation.sql`
- Network Billing Foundation source files: `_lib/platformFinance.ts`, read-only Admin Networks copy in `app/admin.tsx`, generated database types, and migration `supabase/migrations/202605080003_network_billing_foundation.sql`
- Network Invoice Draft Workflow + Overage Warning/Readout Foundation source files: `_lib/platformFinance.ts`, read-only Admin Networks copy in `app/admin.tsx`, and migration `supabase/migrations/202605080011_network_invoice_overage_foundation.sql`
- Sponsor Checkout Foundation source files: `_lib/platformFinance.ts`, read-only Admin Sponsors copy in `app/admin.tsx`, generated database types, and migration `supabase/migrations/202605080004_sponsor_checkout_foundation.sql`
- Sponsor Review/Disclosure/Payment Foundation source files: `_lib/platformFinance.ts`, read-only Admin Sponsors copy in `app/admin.tsx`, generated database types, and migration `supabase/migrations/202605080012_sponsor_monetization_foundation.sql`
- Fraud Enforcement Foundation source files: `_lib/platformFinance.ts`, read-only Admin Fraud copy in `app/admin.tsx`, generated database types, and migration `supabase/migrations/202605080005_fraud_enforcement_foundation.sql`
- Creator Revenue Share Ledger / Fraud Hold Enforcement Foundation source files: `_lib/platformFinance.ts`, read-only Admin Revenue/Fraud copy in `app/admin.tsx`, generated database types, and migration `supabase/migrations/202605080013_revenue_share_fraud_hold_enforcement_foundation.sql`
- Immutable Admin Audit Log Foundation source files: `_lib/platformAudit.ts`, read-only Admin Audit copy in `app/admin.tsx`, generated database types, and migration `supabase/migrations/202605080006_immutable_admin_audit_log_foundation.sql`
- Creator Payout Read-Only Dashboard Foundation source files: `app/channel-settings.tsx`, `_lib/creatorPayouts.ts`, and policy-only migration `supabase/migrations/202605080007_creator_payout_dashboard_read_policy.sql`
- Provider Transfer Records Sync Foundation source files: `supabase/functions/stripe-connect-transfer-sync/index.ts`, shared helper `supabase/functions/_shared/stripe-connect.ts`, `supabase/config.toml`, `_lib/platformFinance.ts`, read-only Admin Payouts copy in `app/admin.tsx`, generated database types, and migration `supabase/migrations/202605080010_provider_transfer_sync_foundation.sql`
- Admin V1B2A source files: `app/(auth)/signup.tsx` and read-only/foundation Admin Kill Switches copy in `app/admin.tsx`; New Accounts is enforced on signup only
- Admin V1B2B source files: `app/channel-settings.tsx` and read-only/foundation Admin Kill Switches copy in `app/admin.tsx`; Uploads is enforced on new creator-video upload submit only
- Autonomous Systems Contract live approval files: `_lib/autonomousSystemsRegistry.ts`, `_lib/autonomousApprovalRequests.ts`, `_lib/platformOwnerAuthority.ts`, `docs/AUTONOMOUS_SYSTEMS_SCOPE_REGISTRY.md`, `/admin` System > Autonomous Approvals in `app/admin.tsx`, migrations `supabase/migrations/20260711173119_autonomous_approval_requests.sql`, `supabase/migrations/20260711185503_autonomous_approval_live_flow.sql`, and `supabase/migrations/20260711193000_money_flow_control_approval_scope.sql`, deployed Edge Function `supabase/functions/autonomous-approval-request/index.ts`, `scripts/guard-autonomous-systems-contract.mjs`, `scripts/proof-autonomous-systems-contract.mjs`, and `scripts/proof-autonomous-approval-live-flow.mjs`. This protects `media_automation`, `livekit_operator`, and `money_flow_control`; future scope can be added only through registry entries. Level 3/4 actions create owner/admin approval requests backed by `platform_role_memberships` owner/super-admin authority, `/admin` review, approval/denial RPCs, audited events, emergency-state checks, and fresh-preflight execution gating. Rachi can recommend/request but cannot approve itself, and owner authority remains above Rachi/operator.
- Money Flow Control Plane guard/operator files: `_lib/moneyFlowControl.ts`, `_lib/moneyExternalConfirmation.ts`, `supabase/functions/money-operator/index.ts`, `docs/MONEY_FLOW_CONTROL_RUNBOOK.md`, `scripts/proof-money-flow-control.mjs`, `scripts/proof-money-operator-write-scope.mjs`, `scripts/proof-money-external-confirmation.mjs`, `scripts/guard-money-flow-control.mjs`, and `/admin` Money Center > Money Flow Control in `app/admin.tsx`. This registers `money_flow_control` as scoped-write guarded scope for reconciliation/status/review/audit only. It does not create payout release, charges, cashout, production checkout, provider mode switches, fake revenue, fake payable balances, or manual Premium toggles.
- Provider Access Broker files: `_lib/providerAccessBroker.ts`, migration `20260712013340_provider_access_broker.sql`, Money Operator actions `provider_access_status`, `provider_access_probe`, `provider_dashboard_readback`, `provider_test_delivery_plan`, `provider_test_delivery_run`, `provider_repair_request`, and `provider_access_report`, `scripts/proof-provider-access-broker.mjs`, `scripts/proof-provider-dashboard-access-policy.mjs`, and `scripts/guard-provider-access-broker.mjs`. This gives Money Operator controlled readback/status/approval-request authority for RevenueCat, Google Play, Stripe Connect, and Stripe merch provider reliability without pasted secrets. Provider dashboard mutation, product changes, live-mode changes, secret rotation, and any money movement still require owner/super-admin approval at the proper Level 3/4 boundary.

## 9. Missing Truth That Still Needs To Be Built
- explicit owner / super-admin bootstrap UX beyond existing backend role truth
- expanded owner-only gate truth outside the autonomous approval framework
- installed owner-session proof for autonomous Level 3/4 approval review
- additional Admin V1B kill switches backed by schema/config/enforcement and real reads from affected app surfaces; current real enforcement is limited to `new_accounts_enabled` on signup and `uploads_enabled` on new creator-video upload submit
- dangerous-action audit write integration beyond current immutable foundation rows
- real Rachi-control state and domain controls
- real emergency/system controls
- real user search and user restriction tools
- real Admin Ads write controls backed by schema/config/enforcement and real app-surface reads
- real AppLovin MAX integration after external account/app/ad-unit setup
- real revenue, payout execution, network billing, sponsor-deal, fraud-hold, bandwidth, storage, LiveKit, and participant-minute ledger systems

## 10. Safe Owner Bootstrap Doctrine
- raw owner credentials must not be committed to source, docs, screenshots, or client code
- test admin credentials may remain active for future proof sessions, but must never be stored, printed, logged, hard-coded, or committed
- bootstrap must happen only through:
  - a safe server-side/admin bootstrap path
  - or a clearly isolated local setup path that reads credentials from ephemeral input or environment
- if first-login password rotation can be supported honestly, it should be wired
- if it cannot be supported yet, the exact manual follow-up must be documented outside committed secrets
- no client-bundled owner bootstrap path is allowed

## 11. Exact Surface Areas For This Chapter

### 11.1 Must Stay Public/Product
- `/profile/[userId]`
- `/channel-settings`
- title/player
- room routes
- `/chat`

These must not become admin consoles.

### 11.2 Canonical Admin Surface
- `/admin`

`/admin` should grow in bounded sections, not into an undifferentiated all-powerful page.

Target section families for phased rollout:
- Home
- Reports
- Content
- Roles
- Audit
- Rachi
- Users
- Premium
- Kill Switches
- Usage
- Ads
- Revenue
- Payouts
- Networks
- Sponsors
- Fraud
- System

Admin V1A already presents these sections, but many are foundation-only. Current doctrine does not imply every section is active or backed.

## 12. Exact Phased Implementation Order
1. Admin Command Center V1A is pushed: canonical `/admin`, backed admin behavior preserved, and missing business systems shown honestly as foundation-only.
2. Ads Launch Foundation V1A is pushed: provider-neutral config, eligibility, placeholder provider, active browsing time, session/daily caps, and read-only/foundation Admin Ads status; no SDK, real ad IDs, provider initialization, real rendering, CTV inventory, or fake revenue.
3. Ads V1B Native/feed placeholder placement is pushed: one labeled placeholder/native slot on Home only, respecting Premium no ads, V1A eligibility/caps, and forbidden contexts, with normal runtime hidden because `ads_enabled=false`.
4. Ads V1C Interstitial controller is pushed: placeholder interstitial first, safe transitions only, no app-launch ad, 180-second first delay, 600-second spacing, session/daily caps, forbidden contexts, no SDK, no real IDs, no real rendering, and no fake revenue.
5. Real AppLovin MAX integration later only after external setup is ready; keep provider wrapper architecture and no AdMob-only path.
6. Admin V1B Kill Switches only after a dedicated schema/config/enforcement plan.
7. Admin Usage Metering Foundations 37-39 plus Admin Usage Metering Foundation V1 are pushed and applied remotely: schema/helper/read-only Admin Usage foundation for future `bandwidth_bytes`, `participant_minutes`, `storage_bytes`, internal usage events/summaries, provider usage imports, provider billing snapshots, and future reconciliation. Storage must show only as metadata estimate, participant-minutes only as DB estimate, provider imports/reconciliation only as schema/foundation, and bandwidth still `Not connected yet` unless future real metering rows exist.
8. Usage event writers, provider import jobs, provider billing imports, and reconciliation jobs later only under a separately authorized Supabase/app-surface/backend prompt.
9. Ledger Systems 4A-4D finance foundation is pushed: schema/helper/read-only Admin foundation for future finance ledger events, creator payout ledger entries, network billing accounts, network invoice records, sponsor deal records, and platform fraud holds. Its migration is `supabase/migrations/202605070005_platform_finance_ledger_foundation.sql`. Network Billing Foundation, Network Invoice Draft Workflow + Overage Warning/Readout Foundation, Sponsor Checkout Foundation, Sponsor Review/Disclosure/Payment Foundation, Fraud Enforcement Foundation, Creator Revenue Share Ledger / Fraud Hold Enforcement Foundation, Immutable Admin Audit Log Foundation, Creator Payout Read-Only Dashboard Foundation, Stripe Connect Schema Foundation, Payout Review Queue + Batch Draft Workflow Foundation, and Provider Transfer Records Sync Foundation are also pushed through migrations `supabase/migrations/202605080003_network_billing_foundation.sql`, `supabase/migrations/202605080011_network_invoice_overage_foundation.sql`, `supabase/migrations/202605080004_sponsor_checkout_foundation.sql`, `supabase/migrations/202605080012_sponsor_monetization_foundation.sql`, `supabase/migrations/202605080005_fraud_enforcement_foundation.sql`, `supabase/migrations/202605080013_revenue_share_fraud_hold_enforcement_foundation.sql`, `supabase/migrations/202605080006_immutable_admin_audit_log_foundation.sql`, `supabase/migrations/202605080007_creator_payout_dashboard_read_policy.sql`, `supabase/migrations/202605080008_stripe_connect_schema_foundation.sql`, `supabase/migrations/202605080009_payout_review_batch_foundation.sql`, and `supabase/migrations/202605080010_provider_transfer_sync_foundation.sql`. Admin Revenue, Networks, Sponsors, Fraud, Audit, and Payouts show read-only counts/latest rows only, and Platform Studio shows creator payout readiness as read-only/not active. Creator revenue share adds only foundation rules and zero-value ledger rows; no real source money import, fake creator earnings, payable balance, or payout ledger entry creation from those rows exists. Fraud hold enforcement adds only foundation policies and non-executable action readiness fields; no runtime hooks, payout pause, monetization disable, upload restriction, live restriction, sponsor restriction, account restriction, or fake risk score exists. Sponsor review/disclosure/payment adds only foundation review queue, disclosure/moderation, and payment planning rows; no sponsor approval, activation, checkout, payment link, brand charge, creator payout split execution, fake sponsor revenue, or fake payable balance exists. Network invoice/overage adds only internal draft invoice and warning-only overage readout foundation; no invoice send, customer charge, payment link, overage billing, fake revenue, unpaid balance, or customer obligation exists. Stripe Connect S2 adds only provider/config/capability/readiness, onboarding-session, provider-webhook-event, payout-eligibility/readiness, and immutable-audit-linkage schema. Stripe Connect S3C adds deployed backend-only/test-mode Edge Functions for account, onboarding-link, account-sync, and webhook flows; backend Stripe secret names are configured by digest only, and account/reuse, onboarding link, account sync, signed webhook handling, and duplicate-event idempotency have test-mode proof. Payout Review/Batch adds only foundation review records/notes, draft batch items, and zero-cent proof rows. Provider Transfer Sync adds only admin/operator backend status import for existing local test-mode provider transfer records. No production Stripe call, creator-facing Connect Stripe UI, payout approval/release, batch processing, transfer creation, payout creation, checkout session, payout execution, invoice send, customer charge, payment link, sponsor checkout, sponsor approval, payout split execution, fraud enforcement action, payout pause, account restriction, upload restriction, live restriction, monetization disable, audit mutation UI, fake risk score, fake revenue, fake paid status, fake payable balance, fake earnings, or fake unpaid balance is active.
10. Finance remote migration/type refresh and provider/event writers later only under a separately authorized Supabase/provider prompt.
11. Future dangerous finance/fraud/admin writes must write immutable audit rows before/when they execute.
12. Real Rachi-control state and domain controls later only when backed.
13. Advanced owner/super-admin controls only if justified by real backing and proof.

## 13. What Not To Do
- do not build a messy god-panel
- do not let Rachi outrank owner authority
- do not fake queue processing, rule-engine powers, or emergency switches
- do not hardcode raw owner credentials into code or docs
- do not store, print, log, hard-code, or commit test admin credentials
- do not expose Supabase service-role keys, LiveKit secrets, RevenueCat secrets, app-store keys, provider secret keys, or any other secret
- do not bypass RLS or weaken `platform_role_memberships`
- do not expose owner-only controls to ordinary admins
- do not collapse creator routes into admin routes
- do not create `/studio*` or other route sprawl
- do not create duplicate admin routes such as `/admin-command-center`

## 14. Current Doctrine Vs Later-Phase Ideas

### 14.1 Current Doctrine
Current doctrine supports:
- bounded `/admin`
- current operator/moderator role truth
- official Rachi identity on canonical profile/chat surfaces
- creator-side safety/admin summary truth
- audit-minded moderation context

### 14.2 Later-Phase Ideas
Later only, unless future work proves otherwise:
- super-admin emergency system tools
- real Rachi automation queues and approvals
- richer audit workflow views
- staffed support operations
- refund/dispute flows
- deeper monetization review tools
- broader role hierarchy
