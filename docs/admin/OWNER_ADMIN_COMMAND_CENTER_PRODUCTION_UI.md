# Owner/Admin Command Center Production UI

Owner/Admin Command Center UI: Closed after validation.

Audit log integrity and privileged action evidence governance: Closed for current repo-side app/admin audit integrity. Every privileged action must create an audit log where backed; failed or denied privileged attempts are audited where supported; audit logs are append-only from app/admin paths; audit logs cannot be edited or deleted through normal app/admin flows; audit readback requires exact scope; Moderator/support-workflow users cannot browse broad audit history by default; final proof artifacts include only sanitized audit evidence.

Admin search privacy and export governance: Closed / Partial / Blocked. Current repo-side status is Closed for scoped Admin Search governance, support readback minimization, and export-default denial. Admin search requires exact scope; non-admin and unscoped attempts are denied; searches are audited with masked query preview; failed/denied searches are audited where supported; search results are minimized and bounded/paginated or safely limited; support-workflow readbacks are masked/minimized by default; Moderator does not see full email by default; Admin can see full email only with exact scope; private chat/content evidence search requires exact scope and case/report/legal context; payment/provider search is masked/scoped summary only; exports are disabled by default.

Emergency controls, incident response, and kill-switch governance: Closed / Partial / Blocked. Current repo-side status is Closed for governance in `docs/ops/EMERGENCY_CONTROLS_INCIDENT_RESPONSE_KILL_SWITCH_GOVERNANCE.md`; broad emergency controls remain First Owner/Owner-owned, Admin operates only exact-scope backed controls where explicitly allowed, and Moderator cannot operate broad emergency controls.

Staff access lifecycle, onboarding, and offboarding governance: Closed / Partial / Blocked. Current repo-side status is Closed for governance in `docs/admin/STAFF_ACCESS_LIFECYCLE_ONBOARDING_OFFBOARDING_GOVERNANCE.md`; staff add/remove remains Owner/First Owner-approved where backed, Support is not a backend role, support-workflow access is exact-scope permission work, shared staff accounts are forbidden, proof/test accounts stay separate from staff accounts, and provider dashboard offboarding is a manual checklist in this lane.

Moderation case operations completion is documented in `docs/legal/MODERATION_CASE_OPERATIONS_COMPLETION.md`. Command Center moderation assignment, internal notes, canned reason templates, coordinated-report signals, repeated-offender flags, malicious-report handling, and SLA escalation must remain exact-scope, case-bound, privacy-safe, audited where backed, and human-review only. No auto-ban, auto-delete, auto-suspend, auto-restrict, auto-hide, or auto-punishment is allowed from these surfaces.

The app has a single Command Center entry point: `/admin` in `app/admin.tsx`. The Command Center is production-labeled, role-scoped, backend-authorized, and fail-closed. It is not a new role hierarchy, provider-product, money activation, payout, Stripe, merch, or broad redesign lane.

Required production wording:

- Single Command Center entry point.
- Admin UI is production-labeled, not proof/debug-labeled.
- Unavailable tools open active setup/status/resolution, support/review, or access-status flows.
- Dangerous actions require confirmation.
- Destructive/sensitive actions require reason and audit where supported.
- Admin search results are privacy-safe and limited/paginated.
- Admin UI fails closed if backend functions are unavailable.
- Admin UI does not show raw backend errors.
- Admin UI does not expose service-role-only concepts.
- Admin UI does not expose raw storage paths, signed URLs, private provider IDs, token values, raw IPs, secrets, tax IDs, or bank details.
- Money/provider/payout actions open active readiness/status/manual/external review flows.

## Purpose

The Owner/Admin Command Center owns platform operations for Owner, First Owner, scoped Admin, and scoped Moderator workflows. Admin is the product-facing name. `operator` is the internal/backend alias for Admin. Support is a work area and permission group, not a staff role.

## Role-Specific Visibility

| Actor | Visible Command Center scope | Denial model |
| --- | --- | --- |
| First Owner | Owner succession, Break Glass, Owner Security, Admin/Moderator/scoped staff operations where backed | Backend remains authoritative |
| Owner | Owner/Admin operations below First Owner succession limits | Backend denies First Owner/Owner succession changes outside First Owner paths |
| Admin | Admin tools only with exact scopes granted by Owner/First Owner | Backend denies unscoped Admin calls |
| Moderator | Moderator and support-workflow tools only with exact support/moderation scopes | Backend denies unscoped Moderator calls |
| Creator/User | No staff tools | Route and backend fail closed |

## Tab / Tool Matrix

| Area | Production label | Scope | Status |
| --- | --- | --- | --- |
| Overview | Overview | Owner/Admin/Moderator according to visible scoped tabs | Connected to safe readbacks |
| Users / Roles | Users, Roles, Permission Templates | Owner/Admin-scoped; Moderator cannot manage staff | Backed or status/resolution with reason |
| Reports / Safety | Reports, Safety | Reports/moderation scopes | Backed report queue and safe audit rows |
| Legal / DMCA | Legal, DMCA | Legal/DMCA scopes | Case/context based |
| Content / Rachi | Content, Rachi | Content programming / official account scopes | Backed saves require reason and audit |
| Money Center | Money Center | Read-only/fail-closed unless separate owner-approved money lane exists | Money/provider/payout actions open readiness/status/manual-external review flows |
| Live Ops | Live Ops, Live Cost Guard, Ops Alerts | Live ops scopes | Actions require reason and audit; remediation remains approval-gated |
| Owner Security | Owner Security, Break Glass | First Owner / Owner security scope | Dangerous actions require confirmation and reason |
| System / Audit | System, Audit, Audit Explorer, Canary | Audit/security scopes | Safe readback only |

## Button Wiring / Active Status Tools

Visible controls are either wired to backed RPC/function/helper paths, active setup/status/resolution flows, support/review flows, or access-status explanations. No visible button should appear active while doing nothing.

Wired examples:

- Staff role grant/revoke and permission updates use backed role/permission functions and audit.
- Content programming saves require reason and immutable audit.
- Reports, DMCA, legal, live ops, Owner Security, First Owner, and money-switch confirmation paths use scoped helpers and sanitized failure copy.
- Search results open only tabs the current actor can access.

Active status examples:

- Money/provider/payout actions are read-only/manual/external unless a separate owner-approved lane enables them.
- Provider refunds are manual/external.
- Runtime/foundation controls show status and unavailable copy when writes are not connected.
- Backend-unavailable states show safe unavailable copy rather than raw errors.

## Dangerous Action Rules

Dangerous actions require confirmation. Destructive/sensitive actions require reason and audit where supported. Case/report context is required where applicable.

Dangerous action classes:

- suspend/deactivate/restore account;
- Owner/Admin/Moderator role changes;
- private evidence access;
- content hide/remove/restore;
- live room force-end or Live Ops actions;
- support/refund status recording;
- DMCA/legal handling;
- Break Glass;
- purge/de-identification related actions;
- money/provider/payout controls, even when routed to readiness/status flows.

Dangerous actions are visually separated through danger buttons, confirmation sheets, active status/reason panels, or Owner Security emergency panels. The UI shows target/action summaries before confirmation where backed.

## Audit / Readback Behavior

The Command Center shows safe audit/readback after action where supported:

- role and permission actions report audit-written success;
- report/DMCA/legal/security actions refresh backed lists when available;
- immutable audit and audit explorer show actor/action/target/reason/time summaries;
- before/after state appears where backed by the source read model;
- reversible/irreversible status is described honestly.

If audit readback is unavailable from a screen, the UI must show honest unavailable/readback copy instead of claiming success from hidden state.

## Search / Filter Privacy

Admin search results are privacy-safe and limited/paginated by bounded client/server read models. Search and filters use masked email/identity display, compact identifiers, and scoped result routing.

Search must not expose:

- raw backend errors;
- raw storage paths or object keys;
- signed URLs;
- token values;
- raw IPs;
- service-role-only concepts;
- private provider IDs;
- provider secrets;
- tax IDs;
- bank details;
- full private evidence outside case/report context.

Unsupported filters open access/status/resolution copy or remain backed confirmation gates; visible controls must not become dead ends.

## Reporting / Moderation Queue

Reporting and moderation workflow: Closed after validation. The Command Center Reports tab remains the scoped queue for normal moderation reports. DMCA/legal, support, money/refund/access support, security incidents, and appeals are separate work areas and must not be collapsed into one unsafe queue. Staff access requires exact scopes and case/report context. Reporter identity stays private by default. Reported users are not notified merely because a report was filed.

Reports can be marked reviewed, dismissed, escalated, or actioned against supported targets only with reason and audit. Reported items are reviewed before action unless high-risk policy requires urgent temporary hiding/escalation. No reporter identity, raw storage paths, signed URLs, raw IPs, tokens, provider secrets, tax IDs, bank details, or private provider IDs are exposed.

Content takedown decisions: Closed for production decision policy and current backed enforcement after validation. Target actions remain report-linked, scoped, reason-required, and audited. Unsupported target actions open status/escalation copy; standalone manual mutation remains locked behind selected `safety_reports` context because immutable audit requires it. Paid-content takedown preserves access history and routes refund/access questions through manual/external support without provider refund execution, payout movement, or money activation.

Live-room moderation and incident response: Closed for production policy, current backed host controls, LiveKit token authority, and incident-response proof after validation. Command Center live tools are incident/readback/escalation surfaces unless a backed live action exists. Force-end/remove/mute/revoke controls must require exact live scope, reason, report/case context where applicable, and audit. Staff UI must not grant LiveKit publish authority, bypass host/seat approval, weaken participant caps, revive stale rooms, or expose LiveKit tokens/raw room URLs.

Chat/call moderation and notification abuse controls: Closed after validation. Dedicated chat_thread report target: Closed after validation. Chat-message hide/remove/restore: Closed after validation. Command Center chat/call evidence and call metadata are report/case scoped. There is no arbitrary private-chat browser, no staff call audio/video visibility, no call recording, and no raw push token/LiveKit token exposure. Report-linked chat-message hide/remove/restore is backed only with exact scope, reason, case/report context, audit, and evidence preservation.

Account restriction and appeals operations: Closed for current production policy and existing backed enforcement. The Users read model remains inspect-only for broad account rows and does not expose generic destructive account controls. Backed account suspend/restore actions are scoped Owner/Admin support operations that require exact permission, reason, target, and audit. Unsupported broader account actions stay hidden, disabled, or escalated honestly.

## Fail-Closed Behavior

Admin UI fails closed if backend functions are unavailable. Admin UI fails closed when:

- runtime config disables an action;
- permission read fails;
- actor role is unknown;
- actor lacks permission;
- target is missing;
- reason is missing;
- case/report context is required but missing;
- backend function is unavailable;
- action is provider/money/payout activation and not allowed.

Admin UI does not show raw backend errors. Admin UI does not expose service-role-only concepts. Admin UI does not expose raw storage paths, signed URLs, private provider IDs, token values, raw IPs, secrets, tax IDs, or bank details.

## Money / Provider / Payout Boundary

Money/provider/payout actions remain active as readiness/status/manual/external review flows. The Command Center can show readiness, provider-status summaries, manual/external refund-support status, and fail-closed switch state. It cannot activate Premium public purchases, creator-money, `live_money_enabled`, payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, Google Play products/base plans, RevenueCat mappings, purchases, provider refunds, or payout actions.

## Every Visible Surface Active Wiring

Every visible surface active wiring audit: Closed. No visible clickable dead buttons are allowed. Nothing visible should be hidden or disabled. Every visible control works, routes correctly, opens a setup/status/resolution flow, opens a support/review flow, or starts a tester-safe flow. Permission scopes must unlock backed behavior.

Owner/Admin shared action buttons, section headers, and quick-link cards now open access/status explanations when scope or setup is missing instead of rendering inert locked controls. Dangerous actions still require confirmation, reason, and backend audit where backed. Moderator surfaces remain exact-scope and do not gain Admin/Owner powers.

Tester-visible monetization UX is separate from live money settlement. Premium monthly tester flow is reachable where Play internal/licensed tester/provider setup supports it. Premium annual opens an active provider-blocked status/resolution flow. Creator Channel Subscription opens an active provider-blocked status/resolution flow. liveMoneyEnabled remains OFF. Payouts, cashout, Stripe Connect production, payable balances, withdrawals, transfers, provider refunds, and automatic refunds remain OFF. No Google Play, RevenueCat, Stripe, payout, refund, purchase, or provider mutation happened.

## Proof Status

Owner/Admin Command Center UI: Closed after validation.

Proof/guard coverage:

- `proof:owner-admin-command-center-ui`
- `guard:owner-admin-command-center-ui-policy`
- First Owner, Admin, Moderator, role terminology, and staff hierarchy proofs and guards remain referenced.

## Launch Status

The Command Center is production-ready repo-side for current launch scope after validation. Live staffing, live operational use, provider actions, Premium public activation, creator-money activation, payouts, Stripe, merch, Google Play product/base-plan changes, RevenueCat mapping changes, and provider refunds remain separate owner-approved lanes.
