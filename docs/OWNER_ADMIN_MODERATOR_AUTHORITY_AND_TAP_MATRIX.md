# Owner / Admin / Moderator Authority And Tap Matrix

Status: Closed source contract.

This document mirrors the source contract in `_lib/platformRoleActionMatrix.ts` and `_lib/adminActionRegistry.ts`.

## Route Truth

- `/admin` is the canonical platform owner/operator Admin Command Center.
- `/channel-studio` is the creator control center, not platform admin.
- `/channel/[userId]` and `/profile/[userId]` are public/user profile surfaces and must not expose platform admin controls.
- No duplicate `/admin-command-center` route is allowed.

## Role Hierarchy

Highest authority remains `owner` / `super_admin`. Admin is product-facing and maps to backend `operator`. Moderator is a separate scoped review/support role. Rachi is an official platform identity and AI operations actor, but not final authority. Autonomous operators are system actors with scoped writes, not human staff roles.

## Direct Authority Matrix

| Role | Admin | Reports | Search | Staff roles | Approvals | Owner Command | Money movement | Premium grant | Release publish/rollback | Auth/RLS | User restriction | Content delete |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| anonymous | No | No | No | No | No | No | No | No | No | No | No | No |
| signed_in_user | No | No | No | No | No | No | No | No | No | No | No | No |
| creator/channel_owner | No | No | No | No | No | No | No | No | No | No | No | No |
| moderator | Scoped | Scoped | No broad search | No | No | No | No | No | No | No | No direct | Scoped report action only |
| admin/operator | Yes | Yes | Scoped/audited | Scoped lower-role only where backed | No self-approval | No | No | No | No | No | Backed scope only | Scoped/audited only |
| super_admin | Yes | Yes | Yes | Yes | Yes | Yes | No direct | No | Approval-gated | Approval-gated | Approval-gated | Approval-gated |
| owner | Yes | Yes | Yes | Yes | Yes | Yes | No direct | No | Approval-gated | Approval-gated | Approval-gated | Approval-gated |
| Rachi | No | No | No | No | Request/recommend only | No | No | No | No | No | No | No |
| autonomous_operator | No human UI | No human UI | No human UI | No | Request only | No | No | No | No | No | No | No |

## Tap Behavior Rules

Every active `/admin` owner/admin/moderator tap that runs or plans an action must have:

- a stable `testID`;
- an action id in `_lib/adminActionRegistry.ts`;
- required role and permission metadata;
- approval level;
- reason/audit requirements when applicable;
- safe denial copy;
- backend/RPC/Edge Function backing status;
- external confirmation flag when applicable.

Unsupported actions must be hidden, read-only, disabled, or routed to Owner Command / Autonomous Approval. No fake success copy is allowed.

## High-Risk Boundaries

The following are never direct `/admin` taps:

- manual Premium grant or entitlement edit;
- payout release, mark paid, process batch, transfer, cashout, send money;
- production charge, invoice, payment link, checkout session;
- production OTA publish or rollback;
- auth/RLS or owner-role mutation without approved path;
- broad push campaign;
- hidden enforcement, ban/restrict, or content deletion without policy, reason, audit, appeal/review, and approval where required.

## Proof And Guard

- `proof:owner-admin-moderator-tap-matrix`
- `guard:owner-admin-moderator-tap-policy`
- `proof:admin-action-registry`
- `guard:admin-action-registry`
- `proof:moderator-autonomous-boundaries`
- `guard:moderator-autonomous-boundaries`
