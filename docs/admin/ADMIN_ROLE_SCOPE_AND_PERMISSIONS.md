# Admin Role Scope And Permissions

Status: Admin role scope: Closed.

Audit log integrity and privileged action evidence governance: Closed / Partial / Blocked. Admin destructive and sensitive actions require exact scope, reason, target, timestamp, result, and audit where backed. Audit readback requires exact scope, audit logs are append-only from app/admin paths, and Admin cannot edit or delete audit logs through normal app/admin flows.

Admin search privacy and export governance: Closed / Partial / Blocked. Admin can use search/readback only with exact scope; Admin can see full email only with exact user/support scope; payment/provider search is masked/scoped summary only; private chat/content evidence search requires exact scope and case/report/legal context; exports are disabled by default and require a future Owner-approved audited lane.

This document defines the production Admin role for the app. Admin is a real production role, not a UI label. The backend represents public Admins as active `operator` rows in `platform_role_memberships`, and operational authority is granted through explicit rows in `platform_staff_permission_grants`.

Role terminology is locked in `docs/admin/ROLE_TERMINOLOGY_LOCK.md`: `operator` is only the internal/backend alias for product-facing Admin, there is no separate product Operator role, Support is a work area and permission group rather than a staff role, and Moderator is separate from Admin while support-duty-capable through exact scopes. Moderator role scope is documented separately in `docs/admin/MODERATOR_ROLE_SCOPE_AND_SUPPORT_DUTIES.md`.

Admin permissions are scoped and granted by Owner/First Owner. Missing permission fails closed. Backend denies non-admin and unscoped-admin attempts even if UI is bypassed.

## Owner Vs Admin

Owner/First Owner controls platform authority, Owner succession, First Owner succession, ultimate security, and money/provider activation gates.

Admin manages app operations only through explicit permission scopes. Admin is below Owner. Admin cannot grant or revoke Owner. Admin cannot alter First Owner succession. Admin cannot remove, demote, delete, or deactivate First Owner.

## Production Representation

| Layer | Production source | Notes |
| --- | --- | --- |
| Admin role | `platform_role_memberships.role = 'operator'` | Existing internal operator role is the public Admin role. |
| Permission grants | `platform_staff_permission_grants.permission_key` | Active, non-expired grants only. |
| Permission checks | `has_platform_permission(...)` and backed RPC/function checks | Owner is always true; Admin/Moderator need active scope. |
| Audit | `platform_staff_role_audit`, `platform_staff_permission_audit`, `platform_admin_audit_logs` | Destructive and sensitive actions require reason and audit. |
| UI | `/admin` Staff & Roles and scoped tool tabs | Buttons are wired to backed paths or honestly disabled. |

## Admin Permission Matrix

| Scope | Admin can do with scope | Backend/read path | Notes |
| --- | --- | --- | --- |
| `admin.user.search` | Search users for operational work. | Existing user lookup/admin search read models; legacy alias `user_lookup`. | Search is audited/masked. |
| `admin.user.view` | View support-safe user summaries. | Existing user/admin read models; legacy aliases `user_lookup`, `support_inbox`. | No secrets or raw tokens. |
| `admin.user.suspend` | Temporarily suspend/deactivate accounts. | `admin_suspend_account_for_support`. | Requires reason, audit, not First Owner. |
| `admin.user.restore` | Restore supported suspended accounts. | `admin_restore_account_for_support`. | Requires reason, audit, not First Owner. |
| `admin.support.view` | View support inbox/readback. | Existing support/admin read surfaces; legacy alias `support_inbox`. | Minimum necessary data. |
| `admin.support.manage` | Manage support workflow state where backed. | Existing support/creator-support surfaces; legacy aliases `support_inbox`, `creator_support`. | Does not execute refunds. |
| `admin.dmca.view` | View DMCA cases. | DMCA RLS/RPC paths; legacy aliases `dmca_review`, `copyright_review`, `legal_review`. | Private evidence stays protected. |
| `admin.dmca.manage` | Manage DMCA case workflow and supported content actions. | DMCA RPCs and audit. | Requires reason on actions. |
| `admin.payment_status.view` | View payment/provider summary status. | Existing payment/readiness summary functions; legacy alias `billing_support_read`. | No provider secrets. |
| `admin.refund_status.record` | Record manual/external refund support status. | Record-only support/audit path. | Admin cannot execute provider refunds. |
| `admin.profile_private.view` | View private profile data for operational case context. | Existing support/legal read paths; aliases `support_inbox`, `legal_review`. | Requires reason/case context where sensitive. |
| `admin.room_private.view` | View private room/report evidence for operations. | Report/live-ops read paths; aliases `reports_review`, `live_ops`. | No LiveKit authority change. |
| `admin.chat_evidence.view` | View private chat/report evidence for support, safety, DMCA, or legal cases. | Legal/evidence paths; aliases `legal_review`, `evidence_preview`. | Case-scoped and audited where sensitive. |
| `admin.content.hide` | Hide supported content. | Report/DMCA moderation RPCs; alias `content_moderation`. | Prefer reversible state. |
| `admin.content.restore` | Restore supported hidden content. | Report/DMCA moderation RPCs; alias `content_moderation`. | Requires reason/audit. |
| `admin.content.remove` | Remove supported content where backed. | Report/DMCA moderation RPCs; alias `content_moderation`. | Hard purge is not expanded. |
| `admin.comment.moderate` | Moderate supported comments. | Report moderation RPCs; alias `content_moderation`. | Reason/audit required. |
| `admin.room.moderate` | Moderate supported rooms. | Live/report operations; aliases `live_ops`, `reports_review`. | No unauthorized publish authority. |
| `admin.live.force_end` | Force-end backed live operations where implemented. | Live-ops paths; alias `live_ops`. | Does not loosen LiveKit authority. |
| `admin.audit.view` | View audit logs. | Audit Explorer/read models; aliases `audit_review`, `security_review`. | Raw IPs remain masked/summarized. |
| `admin.lower_role.manage` | Manage lower non-owner roles where backed. | Existing staff role paths; alias `manage_moderators`. | Admin cannot grant/revoke Owner or First Owner. |

## Forbidden Admin Actions

Admin cannot grant or revoke Owner. Admin cannot alter First Owner succession. Admin cannot remove, demote, delete, or deactivate First Owner. Admin cannot enable money/provider/payout systems. Admin cannot execute provider refunds.

Forbidden or Owner-only scopes remain outside Admin authority:

- `owner.grant`
- `owner.revoke`
- `first_owner.succession`
- `first_owner.break_glass`
- `money.provider.activate`
- `premium.public.activate`
- `creator_money.activate`
- `live_money.enable`
- `payouts.enable`
- `stripe.connect.enable`
- `provider.refund.execute`
- `hard_purge.execute` except existing Owner-controlled purge/de-identification policy

## Role And Permission Grant Rules

Owner/First Owner can grant Admin role. Owner/First Owner can revoke Admin role. Owner/First Owner can grant or revoke Admin permission scopes.

Admin can grant or revoke lower non-owner roles only if explicitly granted the safe lower-role scope and only where the existing backend path allows it. Admin cannot grant/revoke Owner, cannot grant/revoke First Owner, and cannot edit First Owner succession.

Admin role and permission changes require reason text and audit. Non-admin and unscoped-admin attempts are denied and audited through the existing role/permission audit paths.

## Support, DMCA, Payment, And Refund Boundaries

Admin can view support tickets with permission. Admin can view DMCA reports with permission. Admin can view payment/provider status summaries with permission.

Admin can record manual/external refund status only with permission. Admin cannot trigger Google Play refunds, RevenueCat refunds, Stripe refunds, payouts, withdrawals, cash-out, transfers, payable balances, creator-money switches, or `live_money_enabled`.

Provider refunds remain manual/external. Premium public activation and creator-money activation remain outside Admin authority.

Support is not a separate role. Support permissions are work-area scopes that can be granted to Admin or Moderator according to Owner/First Owner policy.

## Private Data Boundary

Admin can view private data only with exact permission and operational reason/case context. Admin private-data access should be case-scoped where possible and audited for support, safety, DMCA, legal, chat, private room evidence, payment support, or Break Glass-style sensitive access.

No secrets, tokens, signed URLs, raw IPs, tax IDs, bank details, or provider secrets are exposed. Raw IP/security context remains masked or summarized under the existing security-context policy. Admin must never see service-role keys, access tokens, refresh tokens, raw provider secrets, raw payment keys, raw bank/tax data, local environment values, or plaintext passcodes.

## Destructive Actions

Admin destructive actions require permission, reason, confirmation, and audit. Audit records must include actor, target, reason, time, and before/after state where practical.

The app prefers reversible soft-delete, hide, restore, suspend, or quarantine over hard delete. Hard deletion/purge remains controlled by the existing account-purge/de-identification policy and is not expanded by this lane.

## UI And Backend Denial Model

The UI hides or disables tools when the authenticated account lacks permission, and disabled tools use production copy. Broken Admin buttons are wired or honestly disabled.

The backend remains authoritative. Non-admin, disabled, deactivated, deleted, scheduled-purge, and unscoped Admin attempts fail closed even if a user bypasses the UI.

## Proof Status

Admin role scope: Closed.

Account restriction and appeals operations: Closed for current production policy and existing backed enforcement. Admin can suspend or restore accounts only with exact backed scope (`admin.user.suspend` / `admin.user.restore`), reason, target, and audit. Admin cannot suspend, deactivate, delete, restore, or restrict First Owner. Provider refunds remain manual/external, and payouts and money movement remain disabled.

Proof validates that:

- Admin is a real production role.
- Admin permissions are scoped and granted by Owner/First Owner.
- Admin cannot grant or revoke Owner.
- Admin cannot alter First Owner succession.
- Admin cannot remove, demote, delete, or deactivate First Owner.
- Admin cannot enable money/provider/payout systems.
- Admin cannot execute provider refunds.
- Admin destructive actions require permission, reason, confirmation, and audit.
- Backend denies non-admin and unscoped-admin attempts even if UI is bypassed.
- Broken Admin buttons are wired or honestly disabled.
- No secrets, tokens, signed URLs, raw IPs, tax IDs, bank details, or provider secrets are exposed.

## Launch Status

Admin role scope is production-ready repo-side after validation. Owner staffing and live operational use remain owner decisions. Premium public activation, creator-money activation, payouts, Stripe, merch, provider product changes, and provider refunds remain separate lanes.
