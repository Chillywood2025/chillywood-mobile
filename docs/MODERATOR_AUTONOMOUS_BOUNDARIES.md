# Moderator Autonomous Boundaries

Status: Closed source contract.

Human moderators and `moderation_safety_operator` are related but not interchangeable.

## Human Moderator Scope

Moderators may review reports and perform exact, backed, case-scoped moderation/support work where the current `platform_role_memberships` role and permission grants allow it. Moderator actions require the relevant report/case context, reason and confirmation where applicable, and audit where backed.

Moderators cannot:

- approve autonomous Level 3/4 requests;
- use Owner Command Center;
- manage owner/admin roles;
- use broad Admin Search by default;
- view private evidence or reporter identity by default;
- move money, grant Premium, mutate providers, release payouts, mark paid, or create charges;
- publish or roll back releases;
- mutate auth/RLS or owner roles;
- trigger broad push campaigns;
- ban, suspend, restrict, delete content, or create hidden enforcement without a separately backed approval/audit/appeal lane.

## Autonomous Moderation Operator Scope

`moderation_safety_operator` is a scoped-write autonomous system. It can write health snapshots, stale case findings, duplicate report detections, required-review flags, safety recommendations, learning state, and autonomous approval requests.

It cannot directly ban/suspend/restrict users, delete content, disable uploads/live/account, enforce fraud holds, change user rights, hide enforcement, or bypass appeal/review. Those actions are Level 3/4 owner/super_admin approval work and must route through the existing autonomous approval path with fresh preflight and exact scope.

## Rachi And Operator Boundary

Rachi can recommend/request, not approve. Autonomous operators can request approval, not approve themselves. Owner/super_admin authority remains final.

## Guard Coverage

- `proof:moderator-autonomous-boundaries`
- `guard:moderator-autonomous-boundaries`
