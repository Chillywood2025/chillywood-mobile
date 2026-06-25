# Role Terminology Lock

Status: Closed.

This document locks production role names for the app. It is a terminology and planning lock only. It does not rename backend roles, migrations, RLS policies, RPCs, or guards.

## Product-Facing Hierarchy

1. First Owner
2. Owner
3. Admin
4. Moderator
5. Creator
6. User

## Backend / Internal Mapping

| Product-facing name | Backend/internal role | Notes |
| --- | --- | --- |
| First Owner | `owner` plus `platform_first_owner_authority` marker | Root platform authority and Owner succession authority. |
| Owner | `owner` | Platform authority layer. |
| Admin | `operator` | Operator is an internal/backend alias for Admin. Admin is the product-facing role name. There is no separate product Operator role. |
| Moderator | `moderator` | Moderator is separate from Admin/operator and can receive support duties through scoped permissions. |
| Creator | User/profile/content ownership, not platform staff role | Creator status does not grant Admin or Moderator authority. |
| User | No platform staff role | Normal app account. |

## Support Doctrine

Support is a work area, not a separate role.

Moderator includes support duties when granted exact support scopes. Admin may also have support scopes when granted by Owner/First Owner. Do not create a separate Support role. Do not add support to `platform_role_memberships`.

Support-related permission scopes and workflows include:

- `support_inbox`
- `creator_support`
- `billing_support_read`
- `admin.support.view`
- `admin.support.manage`
- `admin.payment_status.view`
- `admin.refund_status.record`

These are permission scopes or workflow areas, not staff roles.

## Operator Doctrine

Operator is an internal/backend alias for Admin. Admin is the product-facing role name. There is no separate product Operator role.

Do not rename old migrations. Do not rename the backend `operator` value. Do not break existing RLS, RPCs, guards, proof fixtures, or audit history that use `operator`.

## Moderator Doctrine

Moderator is separate from Admin/operator.

Moderator can receive `support_inbox`, `creator_support`, `billing_support_read`, `reports_review`, `content_moderation`, `live_ops`, and similar scoped permissions when Owner/Admin policy allows. Moderator can handle support inbox, creator support, billing support read/status, report case support, DMCA support handoff, and user support workflows only when granted exact scopes.

Moderator cannot perform Owner/First Owner/Admin-only actions unless explicitly allowed by Admin role policy. Moderator cannot touch Owner/First Owner authority. Moderator cannot enable money/provider/payout systems. Moderator cannot execute provider refunds. Moderator can record support status only if granted exact scope. Moderator cannot view private chat/profile/room evidence unless tied to a case/report and granted exact permission.

## Forbidden Role Drift

- Do not create a `support` backend role.
- Do not add `support` to `platform_staff_normalize_role`.
- Do not add `support` to `platform_role_memberships`.
- Do not rename `operator`.
- Do not expose Operator as a separate product-facing role.
- Do not merge Moderator with Admin/operator.
- Do not weaken Admin scope proof.
- Do not weaken First Owner authority or Owner succession.
- Do not let Moderator grant/revoke Owner, alter First Owner succession, deactivate First Owner, enable Premium public activation, enable creator-money, enable `live_money_enabled`, enable payouts, edit provider products, change RevenueCat mappings, execute purchases, execute refunds, or move payout money.

## Next Lane

Next lane: Moderator role scope including support duties.
