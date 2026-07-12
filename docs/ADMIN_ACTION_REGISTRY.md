# Admin Action Registry

Status: Closed source contract.

The source registry is `_lib/adminActionRegistry.ts`. It is the contract for active owner/admin/moderator taps on `/admin`: every action-like visible tap must have a stable `testID`, action id, required role, permission key where applicable, backing surface, approval level, reason/audit requirement, privacy sensitivity, denial copy, success copy, and current status.

## Current Active / Backed Groups

| Section | Action class | Status | Boundary |
| --- | --- | --- | --- |
| Admin Search | masked user/report search and local clear actions | live | Admin/operator/owner scope only; moderator does not get broad search. |
| Owner Command Center | classify, plan, dry-run, safe submit | live | Owner/super_admin only; routes through owner-command operator and target autonomous systems. |
| Autonomous Approvals | refresh, approve, deny, cancel, emergency pause/resume | live | Owner/super_admin only; Level 3/4 execution still needs fresh preflight and exact scope. |
| Roles | role/permission confirm paths | live but high-risk | Owner/super_admin gated, reason/audit required; no moderator role grant. |
| Reports | mark reviewed, dismiss, escalate, scoped hide/restore | live/scoped | Exact moderation scope, reason, confirmation, case context, and audit where backed. |
| Reports | remove target | approval_request_only | Not a direct moderator/admin destructive action. |
| Money Center | provider/money status | read_only | No money movement, Premium grant, payout, mark-paid, charge, invoice, or payment link. |
| Operators/System | scoped autonomous status sections | read_only | Status/finding/readback only; high-risk work routes to approval. |

## Forbidden Direct Buttons

The registry must not contain active direct actions for manual Premium grant/edit, payout release, mark paid, process batch, send money, cashout, production charge, invoice, payment link, checkout session, production OTA publish/rollback, auth/RLS mutation, owner-role mutation, broad push campaigns, hidden enforcement, ban/restrict, or destructive content deletion.

High-risk controls may appear only as read-only status, blocked reason, Owner Command plan, or autonomous approval request workflow.

## Guard Coverage

- `proof:admin-action-registry`
- `guard:admin-action-registry`
- `proof:owner-admin-moderator-tap-matrix`
- `guard:owner-admin-moderator-tap-policy`
