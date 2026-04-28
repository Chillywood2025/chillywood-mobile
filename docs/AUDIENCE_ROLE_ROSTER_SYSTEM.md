# Audience Role Roster System

Date: 2026-04-26

## Purpose

The Audience Role Roster System is Chi'llywood's channel-owned relationship layer between a Channel and the users around it. It answers who belongs to a channel audience, what saved relationship they have to the channel, and which channel-level privileges or restrictions apply.

This system belongs under Channel, not under Player, Party Room, Live Room, or creator upload storage. It should eventually support followers/members, channel subscribers, VIPs, moderators, co-hosts, bans, private access, and creator teams. Public v1 should stay much smaller: backed follower/request/block/subscriber-summary truth, honest owner/public/admin UI, and no dependency on unbuilt role machinery for creator upload security.

## Boundaries

Audience Role Roster is not:

- account-tier Premium entitlement truth
- platform staff/admin role truth
- room-local membership state
- LiveKit token or publishing authority
- creator upload ownership
- comment media upload
- native game/video streaming
- payouts, paid media, or subscriber-only creator media

Audience Role Roster owns saved channel-to-user relationships. Room routes own live session membership and temporary participant roles. Creator Media owns upload, storage, metadata, and owner/public visibility for videos.

## Current Audit Truth

Backend-backed behavior exists for:

- `channel_followers`: follower rows keyed by channel and follower.
- `channel_subscribers`: creator/channel subscriber rows keyed by channel and subscriber, distinct from account-tier Premium.
- `channel_audience_requests`: follow and `subscriber_access` request rows with pending/reviewed state.
- `channel_audience_blocks`: channel-owned blocked audience rows.
- `user_profiles.public_activity_visibility`, `follower_surface_enabled`, and `subscriber_surface_enabled`: channel visibility posture flags.
- `platform_role_memberships`: platform owner/operator/moderator roles for admin and review visibility, not channel audience roles.
- `watch_party_room_memberships` and `communication_room_memberships`: room-local roles and state, not durable channel roster roles.

Current UI behavior:

- `/channel-settings` shows backed follower, subscriber, request, and blocked counts.
- `/channel-settings` supports owner/operator actions for request review, follower removal, and block/unblock.
- `/channel-settings` already marks subscriber mutation and VIP/mod/co-host workflows as later or unsupported.
- `/profile/[userId]` can show audience posture and follower/subscriber surface visibility copy from profile-backed truth.
- `/admin` owns platform role and safety-review visibility, not channel audience roster management.

Not backed yet:

- unified `channel_audience_members`
- channel VIP roles
- channel moderators
- channel managers or creator team roles
- durable channel co-host roles
- channel invites
- role permission tables
- channel role audit logs
- paid/subscriber creator media access
- public/private/subscriber shelf access for uploaded creator videos

Security-sensitive gaps:

- Public v1 creator upload security must not depend on any unbuilt audience roster role.
- `channel_audience_blocks` is a channel safety boundary candidate, but it is not a full ban system yet.
- Room moderation must not rely on channel roles until room membership and LiveKit authority are explicitly linked.
- Subscriber rows exist, but creator-side subscriber mutation and paid/subscriber media access are not product-ready.
- VIP/mod/co-host labels must remain clearly later unless backed by schema, RLS, helper APIs, UI, and audit logs.

## System Relationships

Profile / Channel System:

- Profile is the public identity and channel surface on `/profile/[userId]`.
- Channel Settings is the owner control surface on `/channel-settings`.
- Audience Role Roster feeds channel audience posture, counts, relationship controls, and later role management.

Creator Media System:

- Public v1 creator videos use owner/public visibility in `videos` and `creator-videos` storage.
- Drafts stay owner-only; public videos can be read publicly.
- Audience roles must not gate creator upload security in Public v1.
- Subscriber-only or VIP-only uploaded videos are post-v1.

Player System:

- Player opens platform titles and creator uploads.
- Player should not infer channel role access for creator uploads until subscriber/private creator media is explicitly built.
- Watch-Party Live for creator uploads remains blocked until uploaded-video room linking exists.

Watch-Party System:

- Watch-Party rooms use room records and room membership rules.
- Channel follower/subscriber/VIP state may influence future room invitations or defaults, but does not currently grant room authority.
- Party Room must keep its own host and membership truth.

LiveKit / Live Room System:

- Live Room and Live Stage use room-local roles such as host, viewer, speaker, and listener.
- Durable channel co-host or moderator roles are later and must be mapped explicitly before they can affect LiveKit tokens, publishing, moderation, or seat promotion.

Comment System:

- Current comments are text-only in room/chat contexts.
- Comment media upload is post-v1.
- Future comment moderation may reference channel roles, but v1 should not fake moderator powers in comments.

Admin System:

- Admin uses platform roles for owner/operator/moderator access.
- Platform roles are not channel audience roles.
- Channel/content ownership does not create platform Admin access.
- Rachi is an official platform concierge/presence, not a channel audience role and not a platform Admin role.
- Admin may later inspect channel-role audit logs, but current admin audit visibility is limited to platform role records and safety reports.

Monetization Later:

- Account-tier Premium, creator/channel subscribers, paid media, payouts, and ticketed access are distinct systems.
- Subscriber/VIP/private paid access for creator media is post-v1 and compliance-sensitive.
- Creator payouts stay separate from RevenueCat/app-store billing.

## Public V1 Scope

Public v1 should include only the audience behavior that is already backed or narrowly safe:

- Channel Settings summary cards for followers, subscribers, requests, and blocked audience counts.
- Owner/operator request review for `follow` requests.
- Owner/operator follower removal.
- Owner/operator block/unblock.
- Public Profile audience posture copy from `user_profiles` visibility fields.
- Honest unavailable/later copy for VIP, moderator, co-host, manager, subscriber mutation, and paid/private creator media.
- Creator upload security based on owner/public/RLS only.

Public v1 must not require:

- `channel_audience_members`
- VIP/mod/co-host tables
- channel team management
- subscriber-only creator uploads
- paid creator media
- payouts
- native game/video streaming
- comment media upload

## Post-V1 Scope

Post-v1 can introduce the full Audience Role Roster System:

- `channel_audience_members` as the canonical unified channel-to-user roster.
- `channel_role_permissions` for configurable role capability sets.
- `channel_invites` for channel-level invitations and team/audience onboarding.
- `channel_bans` for durable bans distinct from lightweight blocks.
- `channel_role_audit_log` for role grants, revocations, ban changes, moderation-sensitive changes, and admin/operator actions.
- Durable manager, moderator, co-host, VIP, subscriber, and creator-team roles.
- Subscriber/VIP/private content access only after RLS, UI, billing/entitlement, and moderation posture are designed.

## Role Model

| Role | Public v1 status | Meaning |
| --- | --- | --- |
| Owner | Backed by account/channel ownership | Full channel owner. Can manage own Channel Settings, creator videos, and current audience actions. |
| Manager | Later | Creator-team operator for channel settings/content workflows. |
| Moderator | Later for channel roster | Channel-level moderation helper. Current platform moderators are admin roles, not channel audience roles. |
| Co-host / speaker | Room-local now, durable channel role later | Temporary room/stage capability today; durable saved channel co-host role later. |
| Member / follower | Partly backed | Follower relationship exists through `channel_followers`. "Member" should not imply paid or elevated rights yet. |
| Subscriber | Rows exist, mutation/access later | `channel_subscribers` exists for creator/channel subscriber truth, but creator-side mutation and paid/private access are not v1. |
| VIP | Later | Special audience/supporter role after roster and permissions exist. |
| Blocked / banned | Blocks backed, bans later | `channel_audience_blocks` exists; a stronger `channel_bans` system is later. |

## Status Model

Current statuses:

- `active`: follower/subscriber or platform role state where applicable.
- `pending`: audience request awaiting review.
- `approved`: reviewed request accepted.
- `declined`: reviewed request rejected.
- `canceled`: request canceled by requester/owner/operator.
- `blocked`: implied by `channel_audience_blocks`.
- `grace_period`, `canceled`, `expired`, `revoked`: subscriber row states.

Later statuses:

- invited
- accepted
- suspended
- banned
- role_revoked
- expired_invite

## Suggested Tables

Current/v1-backed tables:

- `channel_followers`
- `channel_subscribers`
- `channel_audience_requests`
- `channel_audience_blocks`
- `user_profiles` audience visibility fields

Post-v1 tables:

- `channel_audience_members`: canonical channel roster with `channel_user_id`, `user_id`, relationship type, primary role, status, source, timestamps.
- `channel_role_permissions`: role-to-capability mapping for manager/moderator/co-host/VIP/subscriber privileges.
- `channel_invites`: durable invite records for audience, VIP, moderators, co-hosts, and creator teams.
- `channel_bans`: stronger ban records with reason, actor, scope, duration, and appeal/review state.
- `channel_role_audit_log`: immutable role, invite, ban, and permission action log.

## Permission Matrix

| Capability | Owner | Manager later | Moderator later | Co-host/speaker later | Follower/member | Subscriber later | VIP later | Blocked/banned |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| View public profile/channel | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Limited by block/ban policy |
| Upload/manage creator videos | Yes | Later if granted | No | No | No | No | No | No |
| View public creator videos | Yes | Yes | Yes | Yes | Yes | Yes | Yes | No if blocked/banned policy gates it later |
| View drafts | Yes | Later if granted | No | No | No | No | No | No |
| Review follow requests | Yes | Later if granted | Later if granted | No | No | No | No | No |
| Remove followers | Yes | Later if granted | Later if granted | No | No | No | No | No |
| Block/unblock audience | Yes | Later if granted | Later if granted | No | No | No | No | N/A |
| Manage subscriber rows | No in creator UI | Later | No | No | No | Later billing/admin path | No | No |
| Manage VIP/mod/co-host roles | Later | Later if granted | No unless granted | No | No | No | No | No |
| Affect LiveKit publishing | Room-local only | Later explicit mapping | Later explicit mapping | Later explicit mapping | No | No | No | No |
| Moderate comments | Later | Later if granted | Later if granted | No | No | No | No | No |

## UI Behavior

Channel Settings:

- Show backed follower/subscriber/request/block counts.
- Allow only backed owner/operator actions: review requests, remove follower, block/unblock.
- Mark subscriber mutation, VIP, moderator, co-host, manager, and creator-team tools as later until backed.
- Do not show fake private/subscriber creator media controls.

Owner Profile:

- May show owner-facing audience posture and upload/manage CTAs.
- Should not show unbacked roster management.
- Draft/private creator videos stay owner-only through creator media truth, not audience roles.

Public Profile:

- Show only public relationship posture and public creator media.
- Never show owner controls.
- Do not imply public viewers have subscriber/VIP/private content access unless backed.
- Public empty states should stay polished and honest.

Admin:

- Keep platform roles separate from channel audience roles.
- Current admin can show platform role and safety-review posture.
- Admin UI should remain a private Operator Center and must not be treated as a Channel Settings or Rachi surface.
- Future admin can inspect channel role audit logs, bans, and sensitive role changes after schema exists.

## Backend And RLS Behavior

Public v1 backend/RLS expectations:

- Followers: viewers can create/remove their own follow relationship; owners/operators can remove follower rows.
- Requests: requesters create/cancel own pending requests; owners/operators review channel requests.
- Blocks: owners/operators create/remove channel block rows; blocked users, owner, and operators may read relevant rows per current policy.
- Subscribers: rows are readable to subscriber, owner, or operator; mutation stays operator/billing/manual-backed and not creator-side UI.
- Creator videos: owner CRUD, public read only for public videos, drafts owner-only.

Post-v1 backend/RLS expectations:

- Role grants and revocations must require owner or delegated manager authority.
- Moderator and co-host permissions must be explicit, scoped, and auditable.
- Subscriber/VIP/private media access must have RLS-backed entitlement checks before UI claims support.
- Bans must define scope, duration, actor, appeal/review state, and audit records.
- Room authority must be mapped from channel roles to room membership/LiveKit tokens deliberately.

## Effects On Current Systems

Creator uploads:

- Public v1 creator upload security remains owner/public/RLS based.
- Audience roles do not decide upload, edit, delete, draft, or publish permissions.

Player access:

- Creator uploads open in Player with `source=creator-video`.
- Player must not fall back to subscriber/VIP/private rules until those are backed.

Watch parties:

- Existing platform/admin title Watch-Party Live remains title/player-driven.
- Creator uploads remain blocked from Watch-Party Live until uploaded-video room linking exists.
- Future channel roles may help invites or room defaults, but not current room authority.

Live rooms:

- Current Live Room roles are room-local.
- Durable channel co-host/moderator roles must not affect LiveKit permissions until explicitly built.

Comments:

- Text comments/reactions stay where already backed.
- Comment media upload remains post-v1.
- Channel moderator comment powers are later and must be backed before shown.

## Must Not Be Faked In V1

- VIP, manager, moderator, or co-host roster controls.
- Subscriber-only creator videos.
- Private paid creator uploads.
- Channel-team permissions.
- Durable channel invites.
- Role audit logs.
- Bans beyond current block semantics.
- Comment media upload.
- Native game/video streaming.
- Payouts or paid media access.

## Implementation Phases

Phase 0: Documentation and audit

- Keep this system definition as the planning source.
- Cross-reference it from the Profile/Channel/Content audit.

Phase 1: Public v1 hardening

- Finish creator media public/draft and owner/non-owner runtime proof.
- Keep Channel Settings audience UI limited to backed follower/request/block/subscriber-summary truth.
- Confirm block/report basics are sufficient for Public v1 safety posture.

Phase 2: Unified roster foundation

- Add `channel_audience_members`.
- Migrate or read-model existing follower/subscriber/block/request truth into unified roster views.
- Keep old tables compatible until data migration and UI migration are proven.

Phase 3: Role permissions and audit

- Add role permission tables, invites, bans, and audit logs.
- Build manager/moderator/co-host/VIP role workflows.
- Add admin visibility for sensitive role changes.

Phase 4: Entitlements and monetized channel access

- Add subscriber/VIP/private creator media only after entitlement, billing, RLS, compliance, and moderation proof.
- Keep payouts separate from app-store subscription and RevenueCat entitlement plumbing.
