# Owner/Admin Command Center Production UI

Owner/Admin Command Center UI: Closed after validation.

The app has a single Command Center entry point: `/admin` in `app/admin.tsx`. The Command Center is production-labeled, role-scoped, backend-authorized, and fail-closed. It is not a new role hierarchy, provider-product, money activation, payout, Stripe, merch, or broad redesign lane.

Required production wording:

- Single Command Center entry point.
- Admin UI is production-labeled, not proof/debug-labeled.
- Unavailable tools are hidden or honestly disabled.
- Dangerous actions require confirmation.
- Destructive/sensitive actions require reason and audit where supported.
- Admin search results are privacy-safe and limited/paginated.
- Admin UI fails closed if backend functions are unavailable.
- Admin UI does not show raw backend errors.
- Admin UI does not expose service-role-only concepts.
- Admin UI does not expose raw storage paths, signed URLs, private provider IDs, token values, raw IPs, secrets, tax IDs, or bank details.
- Money/provider/payout actions remain disabled/read-only/manual/external.

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
| Users / Roles | Users, Roles, Permission Templates | Owner/Admin-scoped; Moderator cannot manage staff | Backed or disabled with reason |
| Reports / Safety | Reports, Safety | Reports/moderation scopes | Backed report queue and safe audit rows |
| Legal / DMCA | Legal, DMCA | Legal/DMCA scopes | Case/context based |
| Content / Rachi | Content, Rachi | Content programming / official account scopes | Backed saves require reason and audit |
| Money Center | Money Center | Read-only/fail-closed unless separate owner-approved money lane exists | Money/provider/payout actions remain disabled/read-only/manual/external |
| Live Ops | Live Ops, Live Cost Guard, Ops Alerts | Live ops scopes | Actions require reason and audit; remediation remains approval-gated |
| Owner Security | Owner Security, Break Glass | First Owner / Owner security scope | Dangerous actions require confirmation and reason |
| System / Audit | System, Audit, Audit Explorer, Canary | Audit/security scopes | Safe readback only |

## Button Wiring / Disabled Tools

Visible controls are either wired to backed RPC/function/helper paths or hidden/disabled with honest copy. Unavailable tools are hidden or honestly disabled. No visible button should appear active while doing nothing.

Wired examples:

- Staff role grant/revoke and permission updates use backed role/permission functions and audit.
- Content programming saves require reason and immutable audit.
- Reports, DMCA, legal, live ops, Owner Security, First Owner, and money-switch confirmation paths use scoped helpers and sanitized failure copy.
- Search results open only tabs the current actor can access.

Disabled examples:

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
- money/provider/payout controls, even when disabled.

Dangerous actions are visually separated through danger buttons, confirmation sheets, disabled reason panels, or Owner Security emergency panels. The UI shows target/action summaries before confirmation where backed.

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

Unsupported filters are disabled, hidden, or routed to unavailable copy.

## Reporting / Moderation Queue

Reporting and moderation workflow: Closed after validation. The Command Center Reports tab remains the scoped queue for normal moderation reports. DMCA/legal, support, money/refund/access support, security incidents, and appeals are separate work areas and must not be collapsed into one unsafe queue. Staff access requires exact scopes and case/report context. Reporter identity stays private by default. Reported users are not notified merely because a report was filed.

Reports can be marked reviewed, dismissed, escalated, or actioned against supported targets only with reason and audit. Reported items are reviewed before action unless high-risk policy requires urgent temporary hiding/escalation. No reporter identity, raw storage paths, signed URLs, raw IPs, tokens, provider secrets, tax IDs, bank details, or private provider IDs are exposed.

Content takedown decisions: Closed for production decision policy and current backed enforcement after validation. Target actions remain report-linked, scoped, reason-required, and audited. Unsupported target actions are honestly disabled or escalated; standalone manual mutation remains locked because immutable audit requires a selected `safety_reports` row. Paid-content takedown preserves access history and routes refund/access questions through manual/external support without provider refund execution, payout movement, or money activation.

Live-room moderation and incident response: Closed for production policy, current backed host controls, LiveKit token authority, and incident-response proof after validation. Command Center live tools are incident/readback/escalation surfaces unless a backed live action exists. Force-end/remove/mute/revoke controls must require exact live scope, reason, report/case context where applicable, and audit. Staff UI must not grant LiveKit publish authority, bypass host/seat approval, weaken participant caps, revive stale rooms, or expose LiveKit tokens/raw room URLs.

Chat/call moderation and notification abuse controls: Partial for direct message hide/remove/restore mutation; Closed for current production reporting, evidence-access policy, blocked/restricted account denial, call/ring dedupe, chat-send rate limiting, attachment scan gating, notification privacy, and proof after validation. Command Center chat/call evidence and call metadata are report/case scoped. There is no arbitrary private-chat browser, no staff call audio/video visibility, no call recording, and no raw push token/LiveKit token exposure. Unsupported direct chat-message mutation remains honestly unavailable/escalated until an exact backend lane exists.

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

Money/provider/payout actions remain disabled/read-only/manual/external. The Command Center can show readiness, provider-status summaries, manual/external refund-support status, and fail-closed switch state. It cannot activate Premium public purchases, creator-money, `live_money_enabled`, payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, Google Play products/base plans, RevenueCat mappings, purchases, provider refunds, or payout actions.

## Proof Status

Owner/Admin Command Center UI: Closed after validation.

Proof/guard coverage:

- `proof:owner-admin-command-center-ui`
- `guard:owner-admin-command-center-ui-policy`
- First Owner, Admin, Moderator, role terminology, and staff hierarchy proofs and guards remain referenced.

## Launch Status

The Command Center is production-ready repo-side for current launch scope after validation. Live staffing, live operational use, provider actions, Premium public activation, creator-money activation, payouts, Stripe, merch, Google Play product/base-plan changes, RevenueCat mapping changes, and provider refunds remain separate owner-approved lanes.
