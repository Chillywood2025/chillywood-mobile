# Money Admin Authority Activation Governance

Final store/release readiness and Play submission packet alignment is documented in `docs/release/FINAL_STORE_RELEASE_READINESS_PLAY_SUBMISSION_PACKET.md`. The release packet does not activate money: live_money_enabled remains OFF, Creator-money remains OFF, Premium public purchase remains OFF, Premium monthly public purchase remains a separate owner-approved proof lane, Premium annual remains Google Play base-plan provider-blocked, Creator Channel Subscription remains Google Play base-plan provider-blocked, payouts/payable balances/withdrawals/cash-out/transfers/Stripe Connect/merch checkout/payout movement remain OFF, provider refunds remain manual/external, and no Google Play, RevenueCat, Stripe, payout, purchase, refund, or provider mutation happened.

Status: Money admin authority and activation governance: Closed / Partial / Blocked.

Verdict: Closed for repo-side authority governance. Partial for future public money activation because Premium monthly, creator-money, live money, payouts, Stripe Connect live use, merch checkout, and provider refund automation still require separate owner-approved lanes or provider readiness. This lane does not activate money.

Audit log integrity and privileged action evidence governance: Closed for current repo-side money audit governance. Money switch changes or attempts are audited where backed, emergency money kill switch use is First Owner/Owner-controlled and audited, audit metadata is minimized, and no raw provider payloads, payment credentials, tax IDs, bank details, tokens, signed URLs, or secrets are stored in proof artifacts.

Public non-money feature enablement is tracked in `docs/PUBLIC_NON_MONEY_FEATURE_ENABLEMENT_SWITCHBOARD.md`. That lane enables safe public app systems only and keeps Premium monthly public purchase, Premium annual, Creator Channel Subscription, creator-money, `live_money_enabled`, payouts, Stripe Connect, merch checkout, and provider refund automation off, blocked, or pending separate owner-approved proof. No Google Play, RevenueCat, Stripe, payout, purchase, refund, or provider mutation happened.

Emergency controls, incident response, and kill-switch governance is documented in `docs/ops/EMERGENCY_CONTROLS_INCIDENT_RESPONSE_KILL_SWITCH_GOVERNANCE.md`. Money incidents keep `live_money_enabled`, creator-money, Premium public purchase, payouts, Stripe Connect, merch checkout, purchases, refunds, transfers, and provider mutation OFF unless a separate owner-approved lane changes that.

Provider dashboard ownership and access governance is documented in `docs/ops/PROVIDER_DASHBOARD_OWNERSHIP_ACCESS_GOVERNANCE.md`. Provider dashboard ownership does not activate money: dashboard roles must be least-privilege, MFA/2FA is required where supported, provider support tickets are tracked with sanitized references, provider decisions are mirrored into repo docs with sanitized facts, and dashboard access proof remains owner-confirmation-required where repo cannot verify it.

This document defines who can approve, view, record, pause, freeze, override, or kill-switch money-related systems in the app. It does not create provider products, mutate Google Play, mutate RevenueCat, enable payouts, enable Stripe Connect, enable merch checkout, execute purchases, execute provider refunds, or turn on public money behavior.

Required launch truth:

- First Owner / Owner controls activation authority.
- Premium monthly activation requires separate owner-approved purchase proof lane.
- Premium annual remains provider-blocked.
- Creator-money remains OFF.
- live_money_enabled remains OFF.
- Payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, and payout movement remain OFF.
- Provider refunds remain manual/external.
- Manual refund support status can be recorded only with exact scope and audit.
- Admin can view/manage only exact money-support scopes.
- Moderator cannot activate money.
- Provider transaction/customer/order data is masked/scoped.
- Access grant revoke/removal requires exact scope, reason, target, and audit.
- Dual approval is required for future payout activation.
- Dual approval is required for future live_money_enabled.
- Emergency money kill switch is First Owner/Owner-controlled and audited.
- No Google Play, RevenueCat, Stripe, payout, purchase, refund, or product mutation happened.

## Money Authority Matrix

| Money surface/action | Current status | Who can approve | Who can execute | Required role | Required scope | Dual approval required? | Reason required? | Audit required? | Provider mutation? | Currently enabled? | Public launch allowed? | Notes/blockers |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Premium public activation | OFF | First Owner / Owner | Future activation lane only | First Owner / Owner | Owner-approved Premium activation proof | Owner decision required; dual approval recommended for public launch | Yes | Yes | No mutation in this lane | No | No | Requires separate owner-approved purchase proof lane. |
| Premium monthly activation proof | Provider monthly verified; public purchase OFF | First Owner / Owner | Future proof operator under Owner approval | First Owner / Owner | Premium activation proof scope | Owner decision required | Yes | Yes | No mutation in this lane | No | No | Premium monthly activation requires separate owner-approved purchase proof lane. |
| Premium annual activation | Provider-blocked | First Owner / Owner after provider readiness | Future provider/product lane only | First Owner / Owner | Premium annual provider readiness | Yes before public use | Yes | Yes | Not in this lane | No | No | Premium annual remains provider-blocked until Google Play base plan and RevenueCat mapping exist. |
| Creator-money activation | OFF | First Owner / Owner | Future activation lane only | First Owner / Owner | Creator-money activation proof | Yes before public use | Yes | Yes | Not in this lane | No | No | Creator-money remains OFF. |
| live_money_enabled | OFF | First Owner / Owner | Future audited switch lane only | First Owner / Owner | Live-money activation authority | Yes | Yes | Yes | No provider mutation by switch alone | No | No | live_money_enabled remains OFF. |
| Provider product activation | Blocked/readiness-only | First Owner / Owner | Future provider lane only | First Owner / Owner | Provider product activation proof | Owner decision required | Yes | Yes | Not in this lane | No | No | No Google Play or RevenueCat mutation happened. |
| Manual refund support step | Manual/external record-only | Owner/First Owner grants scopes | Admin or Moderator only with exact support scope | Admin or Moderator | `admin.refund_status.record` or approved support equivalent | No | Yes | Yes | No | Record-only | Yes for support records only | Provider refunds remain manual/external. |
| Provider refund execution | Not integrated / forbidden | Future Owner lane only | No in-app executor | None in current app | Not available | Future lane would require approval | Yes | Yes | Would be provider mutation, not present | No | No | Provider refunds remain manual/external. |
| Access grant revoke | Scoped/audited path only | First Owner / Owner | Owner/Admin with exact scope; Moderator only if future exact support scope explicitly allows record-only triage | Owner/Admin | Access support or content/access removal scope | No by default | Yes | Yes | No refund or money movement | Only if backed path allows | Yes only as support/access action | Preserves evidence and payment/access history. |
| Paid access removal | Scoped/audited path only | First Owner / Owner | Owner/Admin with exact scope | Owner/Admin | Content/access removal scope | No by default | Yes | Yes | No refund or money movement | Only if backed path allows | Yes only as moderation/support action | Must not execute provider refunds or payouts. |
| Provider transaction ID visibility | Masked/scoped summary only | First Owner / Owner grants scopes | Owner/Admin; Moderator only with exact safe-summary scope | Owner/Admin/Scoped Moderator | Payment status/support summary scope | No | Case/support reason where sensitive | Yes for access/readback where supported | No | Read-only | Yes for scoped support use | Raw provider IDs are not public UI copy. |
| RevenueCat customer visibility | Masked/scoped summary only | First Owner / Owner grants scopes | Owner/Admin; Moderator only with exact safe-summary scope | Owner/Admin/Scoped Moderator | Payment status/support summary scope | No | Case/support reason where sensitive | Yes where supported | No | Read-only | Yes for scoped support use | No private RevenueCat customer data is exposed. |
| Google Play order visibility | Masked/scoped summary only | First Owner / Owner grants scopes | Owner/Admin; Moderator only with exact safe-summary scope | Owner/Admin/Scoped Moderator | Payment status/support summary scope | No | Case/support reason where sensitive | Yes where supported | No | Read-only | Yes for scoped support use | No full Google Play order data is exposed. |
| Creator payout approval later | Future-only | First Owner / Owner | Future payout lane only | First Owner / Owner | Payout activation authority | Yes | Yes | Yes | Future provider mutation; absent now | No | No | Payouts remain OFF. |
| Payout pause | Future-only / kill-switch governed | First Owner / Owner | Future audited owner lane only | First Owner / Owner | Payout risk/kill-switch authority | Owner decision required | Yes | Yes | No provider mutation by pause alone | No live payout state | No current payout launch | Payouts are already OFF. |
| Creator balance freeze later | Future-only | First Owner / Owner | Future audited owner/risk lane only | First Owner / Owner | Payout risk authority | Owner decision required | Yes | Yes | No provider mutation by freeze alone | No | No | Creator balances are not payable. |
| Payout risk flag view | Readiness/foundation only | First Owner / Owner grants scopes | Owner/Admin with exact risk scope; Moderator only with exact safe-summary support scope | Owner/Admin/Scoped Moderator | Risk/payment-support scope | No | Case/reason where sensitive | Yes where supported | No | Read-only | Yes for scoped review | Provider details stay masked/scoped. |
| Payout risk flag clear | Future-only | First Owner / Owner | Future owner/risk lane only | First Owner / Owner | Risk override authority | Yes when money movement could be affected | Yes | Yes | No provider mutation by clear alone | No | No | Moderator cannot clear payout risk flags. |
| Fraud rule override | Future owner-controlled path | First Owner / Owner | Future audited owner/risk lane only | First Owner / Owner | Fraud/risk override authority | Yes when money movement could be affected | Yes | Yes | No provider mutation by override alone | No | No | Admin/Moderator cannot override fraud rules for money activation. |
| Emergency money kill switch | Documented fail-closed governance | First Owner / Owner | First Owner / Owner | First Owner / Owner | Emergency money kill-switch authority | One Owner can disable; activation still needs approval | Yes | Yes | No refunds, provider products, or payouts | OFF surfaces remain OFF | Yes as safety shutdown only | Emergency money kill switch is First Owner/Owner-controlled and audited. |
| Stripe Connect enablement | Future/OFF | First Owner / Owner | Future provider/payout lane only | First Owner / Owner | Payout/Stripe Connect activation authority | Yes before public use | Yes | Yes | Not in this lane | No | No | Stripe Connect live use remains OFF. |
| Merch checkout enablement | Future/OFF | First Owner / Owner | Future merch lane only | First Owner / Owner | Merch activation authority | Owner decision required | Yes | Yes | Not in this lane | No | No | Merch checkout remains OFF. |

## Role / Scope Matrix

| Role | Money authority | Allowed current actions | Forbidden current actions |
| --- | --- | --- | --- |
| First Owner | Ultimate money authority and emergency kill-switch owner. | Approve future activation lanes, require or perform dual approval, view governance audit, operate emergency shutdown. | Cannot bypass provider readiness, legal/support/risk proof, audit, or evidence preservation. |
| Owner | Money activation authority unless a First Owner-only policy applies. | Approve future activation lanes, operate emergency kill switch if policy allows, view money governance audit, grant exact money-support scopes. | Cannot treat readiness docs as activation or bypass dual-approval requirements for future payout/live-money activation. |
| Admin | Product-facing Admin, backend `operator`, exact-scope only. | View money support/readiness/status, record manual/external refund/access support status, review masked provider summaries when scoped. | Cannot activate Premium public purchases independently, creator-money, live_money_enabled, payouts, Stripe Connect live use, merch checkout, or provider refunds. |
| Moderator | Separate from Admin/operator, exact support/moderation scope only. | Triage support cases and record manual/external support status only when exact scopes allow. | Cannot activate money, see raw provider customer/order details by default, clear payout risk flags, execute refunds, or enable Premium/creator-money/live-money/payout systems. |
| Creator | No platform money admin authority. | Configure eligible future creator settings only when separate rails are enabled and scoped. | Cannot force provider activation, bypass payout holds, override fraud rules, or enable public money systems. |
| User | No money admin authority. | Request support or appeal through support workflows. | Cannot access provider/admin/payout/risk controls. |

## Activation Governance Model

Money activation is never implied by proof, readiness, draft products, sandbox purchases, provider readback, or Admin UI visibility. Public activation requires a separate lane with owner approval, provider readiness, support readiness, fraud/risk readiness, legal/privacy/Data Safety alignment, rollback plan, audit, and validation.

Premium monthly can proceed only through a separate owner-approved purchase proof lane. Premium annual cannot proceed until the Google Play base plan exists and RevenueCat mapping is complete. Creator-money cannot proceed until provider products/base plans/mappings are production-ready and owner-approved. live_money_enabled requires Owner/First Owner approval and dual approval before public use.

## Provider Visibility / Masking Model

Provider transaction/customer/order data is masked/scoped. Owner/Admin can see only the minimum support-safe summaries needed for payment, access, refund-support, or readiness review. Moderator visibility is limited to exact safe-summary support scopes. Raw provider secrets, API keys, tokens, service-role keys, full payment credentials, tax IDs, bank details, private dashboard data, raw provider account IDs, and private provider customer/order records are never exposed.

## Manual Refund / Access Support Model

Provider refunds remain manual/external. Manual refund support status can be recorded only with exact scope and audit. Recording a support status does not execute a Google Play refund, RevenueCat refund, Stripe refund, payout, withdrawal, cash-out, transfer, payable-balance change, or provider product mutation.

Access grant revoke/removal requires exact scope, reason, target, and audit. Paid access removal preserves evidence and payment/access history, uses safe support copy, and does not move money or refund automatically.

## Payout / Fraud / Risk Future Governance

Payouts are future-only. Dual approval is required for future payout activation. Payout pause, creator balance freeze, payout risk flag clearing, and fraud/risk overrides are First Owner/Owner-controlled or dual-approved future paths. Admin can review readiness and risk summaries only with exact scope. Moderator cannot clear payout risk flags, override fraud rules, approve payouts, pause payouts, or activate payout systems.

## Emergency Money Kill Switch Model

The emergency money kill switch is First Owner/Owner-controlled and audited. It is a fail-closed safety control for disabling public money surfaces when a provider, fraud, legal, tax, support, fulfillment, security, or safety incident requires shutdown. The kill switch preserves evidence and payment/access history. It does not issue refunds, move money, create payout records, change Google Play products/base plans, change RevenueCat mappings, enable Stripe Connect, or create merch checkout.

## Audit / Dual Approval Model

Every money admin action must be audited with actor, target, action, reason, timestamp, before/after where practical, and result. High-risk money state changes require confirmation and reason. Future payout activation requires dual approval. Future live_money_enabled requires dual approval. Provider/product/payout/refund execution is not present in this lane.

## Admin Command Center / UI Status

The Owner/Admin Command Center remains the single production-labeled staff entry point. Money Center UI is read-only/readiness-focused for provider status, money switches, audit events, fraud/risk foundation, and payout readiness. Money activation controls remain disabled/read-only unless a future activation lane enables them. Premium annual and Creator Channel Subscription remain provider-blocked. One-time creator products remain Draft/OFF/readback verified. Provider refunds remain manual/external. Payout, Stripe Connect live use, and merch checkout remain future/OFF. Admin/Moderator cannot activate money from the UI.

## Backend / RPC Enforcement Summary

Current switch defaults and Money Center read models remain fail-closed. `live_money_enabled` defaults OFF; payout and creator-money rails are OFF or sandbox-only; provider webhooks and provider readiness are readiness/audit surfaces. Existing support/refund/status scopes are scoped permission records, not product roles. This lane adds no backend role values, no provider mutations, no purchase execution, no refund execution, no payout execution, and no RLS or auth changes.

## Proof Status

Money admin authority and activation governance is closed for repository-side governance once `proof:money-admin-authority-activation-governance` and `guard:money-admin-authority-policy` pass with the existing legal/account/takedown/reporting/staff proof chain.

## Remaining Owner Actions

- Decide whether and when to open the separate Premium monthly owner-approved purchase proof lane.
- Resolve the Google Play annual/channel base-plan provider blocker before annual/channel activation.
- Name dual approvers for future payout activation and future live_money_enabled activation.
- Confirm emergency money kill-switch owner coverage before any public money activation.
- Keep provider refunds manual/external until a separate owner-approved refund execution lane changes that.

## Launch Status

Current launch status: money governance ready; public money activation remains blocked/off by design. No money/provider/payout behavior changed.
