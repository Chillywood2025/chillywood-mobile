# Staff Role Hierarchy Proof

Staff role hierarchy proof: Closed.

This document reconciles the final production role hierarchy for the app across docs, migrations, RPCs, Edge functions, UI labels, proof scripts, and guards.

## Final Product-Facing Hierarchy

1. First Owner
2. Owner
3. Admin
4. Moderator
5. Creator
6. User

No separate Operator or Support product roles exist.

operator is the internal/backend alias for Admin. support is not a backend role. Moderator is separate from Admin/operator.

## Backend / Internal Role Mapping

| Product-facing role | Backend/internal representation | Staff authority |
| --- | --- | --- |
| First Owner | `owner` plus active `platform_first_owner_authority` marker | Highest authority; controls Owner succession and Break Glass |
| Owner | `owner` | Platform authority layer above Admin and Moderator |
| Admin | `operator` | `operator` is the internal/backend alias for Admin; Admin is the product-facing role |
| Moderator | `moderator` | Real scoped production role below Admin; support-duty-capable by exact scopes |
| Creator | User/profile/content ownership, not a platform staff role | No platform staff authority |
| User | No staff role | No platform staff authority |

No backend role values were renamed. The backend role normalizer preserves `owner`, `operator`, and `moderator`. `support` is not a backend role.

## Authority Matrix

| Capability | First Owner | Owner | Admin/internal `operator` | Moderator | Creator/User |
| --- | --- | --- | --- | --- | --- |
| Grant Owner | Yes | No | No | No | No |
| Revoke Owner | Yes, not self through normal path | No | No | No | No |
| First Owner succession | Yes | No | No | No | No |
| Break Glass | Yes | No | No | No | No |
| Grant Admin | Yes through Owner authority | Yes where backed | No unless Owner grants and backend policy allows lower-role work; cannot grant Owner | No | No |
| Grant Moderator | Yes | Yes | Yes only with `manage_moderators` and backend policy | No | No |
| Staff permission assignment | Yes | Yes | Scoped where backed; cannot alter Owner/First Owner authority | No | No |
| Support duties | Yes | Yes | Yes with exact support scopes | Yes with exact support scopes | No |
| Moderation duties | Yes | Yes | Yes with exact moderation scopes | Yes with exact moderation scopes | No |
| Account suspend/restore | Yes | Yes | Yes with `admin.user.suspend` / `admin.user.restore` | No by current policy | No |
| DMCA/legal case work | Yes | Yes | Yes with exact scopes | Yes with exact scopes | No |

First Owner authority remains above all staff roles. Admin and Moderator cannot alter Owner or First Owner authority.

## Permission-Scope Summary

Admin and Moderator use scoped permissions. Missing scopes fail closed. Admin can perform admin/support/moderation duties only with exact Owner/First Owner-granted scopes. Moderator includes support duties only through exact scopes.

Support is not a backend role. Support is a work area and permission group. Support scopes include `support_inbox`, `creator_support`, `billing_support_read`, `admin.support.view`, `admin.support.manage`, `admin.payment_status.view`, and `admin.refund_status.record`.

Moderator support-duty scopes and moderation scopes are documented in `docs/admin/MODERATOR_ROLE_SCOPE_AND_SUPPORT_DUTIES.md`. Admin scopes are documented in `docs/admin/ADMIN_ROLE_SCOPE_AND_PERMISSIONS.md`.

## Forbidden Action Matrix

| Forbidden action | Admin/internal `operator` | Moderator |
| --- | --- | --- |
| Grant/revoke Owner | Forbidden | Forbidden |
| Alter First Owner succession | Forbidden | Forbidden |
| Remove, demote, delete, deactivate, or suspend First Owner | Forbidden | Forbidden |
| Grant/revoke Admin/operator | Forbidden unless Owner/First Owner path; not Moderator-capable | Forbidden |
| Create Support as a role | Forbidden | Forbidden |
| Enable Premium public activation | Forbidden | Forbidden |
| Enable creator-money switches | Forbidden | Forbidden |
| Enable `live_money_enabled` | Forbidden | Forbidden |
| Enable payouts, payable balances, withdrawals, cash-out, transfers, Stripe Connect, merch checkout, or payout movement | Forbidden | Forbidden |
| Create/edit/activate Google Play products/base plans | Forbidden | Forbidden |
| Change RevenueCat mappings | Forbidden | Forbidden |
| Execute purchases, provider refunds, or payout actions | Forbidden | Forbidden |
| Expose raw storage paths, signed URLs, tokens, secrets, service-role keys, payment keys, OAuth tokens, provider account IDs, tax IDs, bank details, raw IPs, proof passwords, private dashboard screenshots, local env files, or plaintext passcodes | Forbidden | Forbidden |

Admin and Moderator cannot enable money/provider/payout systems. Admin and Moderator cannot execute provider refunds.

## Protection Summary

First Owner is unique. First Owner is Owner plus the active First Owner marker. Only First Owner can grant/revoke Owner. First Owner cannot remove himself as last active Owner. First Owner succession requires successor, password re-auth, generated single-use passcode, typed confirmation, reason, and audit. Break Glass is First Owner-controlled and audited.

Owner is above Admin and Moderator. Owner/First Owner grants roles and scopes. Owner controls Admin/Moderator permission assignment where backed. Owner cannot be removed by Admin/Moderator, and Owner succession remains First Owner-controlled.

Admin maps to backend/internal `operator`. Admin is a real production role. Admin uses scoped permissions. Admin buttons are wired or honestly disabled. Admin cannot grant/revoke Owner, alter First Owner succession, remove/demote/delete/deactivate/suspend First Owner, enable money/provider/payout systems, or execute provider refunds.

Moderator maps to backend/internal `moderator`. Moderator is a real production role, separate from Admin/operator. Moderator uses scoped permissions and can perform support duties only with exact support scopes. Moderator buttons/support tools are wired or honestly disabled. Moderator cannot grant/revoke Owner, grant/revoke Admin/operator, alter First Owner succession, remove/demote/delete/deactivate/suspend First Owner, enable money/provider/payout systems, or execute provider refunds.

Creator and User are not staff roles. Creator can own creator surfaces but not platform staff authority. User has no staff authority. Creator/User cannot call staff RPCs/functions directly.

## UI Copy Summary

The user-facing role name is Admin, not Operator. Admin Command Center remains the product-facing surface. Operator is not presented as a product role. Support appears as support workflow/case work, not a staff role.

## Backend / RPC Enforcement Summary

Relevant backend sources:

- `platform_staff_normalize_role` maps `admin` to `operator`, preserves `operator`, preserves `moderator`, and does not map `support`.
- `platform_role_memberships` role constraints allow `owner`, `operator`, and `moderator`.
- `has_platform_permission` supports active `operator` and `moderator` staff permission grants.
- First Owner RPCs require First Owner for Owner grant/revoke/succession.
- Staff grant/revoke RPCs forbid Moderator staff management and preserve First Owner owner-revoke routing.
- Admin account suspend/restore requires Owner or scoped `operator` and protects First Owner.
- DMCA/legal case helpers allow Owner or exact-scoped Admin/Moderator.

## Proof And Guard Summary

Required proof/guard coverage:

- `proof:first-owner-authority`
- `guard:first-owner-authority-policy`
- `proof:admin-role-scope`
- `guard:admin-role-scope-policy`
- `proof:moderator-role-scope`
- `guard:moderator-role-scope-policy`
- `proof:role-terminology-lock`
- `guard:role-terminology-policy`
- `proof:staff-role-hierarchy`
- `guard:staff-role-hierarchy-policy`

## Remaining Production Owner Actions

- Apply any pending migrations in the target production environment before relying on the latest role behavior there.
- Select real Admin/Moderator accounts intentionally.
- Grant exact permission scopes needed for each staff member.
- Keep Support as a work area and permission group.
- Return to final production readiness checklist and app-controlled launch blockers, excluding known Google Play base-plan provider blocker.

## Launch Status

Staff role hierarchy proof: Closed. The hierarchy is internally consistent repo-side after validation. Live staffing and role grants remain owner actions. No money/provider/payout behavior is activated by this proof.
