# Chi'llywood Audience Management Implementation Spec

## 1. Purpose And Scope
This document defines Chi'llywood's audience-management chapter.

It is implementation doctrine, not UI code.

It exists to:
- preserve the current profile/channel route doctrine while Chi'llywood deepens creator audience management
- define what audience relationships already exist in current repo truth
- separate current doctrine, missing workflow truth, and later-phase audience ideas clearly
- define how audience truth must relate to `/channel-settings`, `/profile/[userId]`, moderation/admin surfaces, and the access/entitlement chapter that already landed
- define the phased implementation order for the audience-management chapter

This spec does not:
- change route truth
- create `/studio*` routes
- implement audience UI directly
- change schema directly
- invent fake VIP, moderator, co-host, or CRM-style audience systems

## 2. Current Doctrine That Must Be Preserved

### 2.1 Locked Route Truth
| Route | Owner File | Doctrine |
| --- | --- | --- |
| `/profile/[userId]` | `app/profile/[userId].tsx` | Canonical public profile/channel route. Owner mode stays on the same route. |
| `/channel-settings` | `app/channel-settings.tsx` | Canonical creator control center and future audience-management owner. |
| `/chat` and `/chat/[threadId]` | `app/chat/index.tsx`, `app/chat/[threadId].tsx` | Canonical Chi'lly Chat routes. |
| `/watch-party/[partyId]` | `app/watch-party/[partyId].tsx` | Canonical Party Room route. |
| `/watch-party/live-stage/[partyId]` | `app/watch-party/live-stage/[partyId].tsx` | Canonical Live Room / Live Stage route. |

Do not create route proliferation in this chapter.

### 2.2 Current Product Rules To Preserve
- `/profile/[userId]` remains identity and channel presentation first, not a full creator CRM.
- `/channel-settings` remains the studio-equivalent owner for deeper creator controls.
- Chi'lly Chat stays the canonical follow-up and messaging layer; audience management must not turn profile or settings into a replacement inbox.
- The access/entitlement chapter already closed enough to move on; audience work should reuse that chapter's language where it affects subscriber and visibility posture, not reopen it.
- Creator/channel subscriber relationship truth is distinct from account-tier premium entitlement truth.
- Blocked-audience truth is a channel-owned safety boundary, not the same thing as platform moderation role or admin review access.

### 2.3 Locked Semantics To Preserve
| Audience Bucket | Meaning |
| --- | --- |
| `followers` | Audience members who follow a creator/channel relationship. |
| `subscribers` | Audience members who have an active creator/channel subscriber relationship. |
| `requests` | Pending audience requests for follow or subscriber-style access review. |
| `blocked` | Audience members explicitly blocked from a channel-owned audience boundary. |
| `VIP` | Later-phase only; not backed today. |
| `moderators` | Later-phase audience-role concept; distinct from current platform moderation roles. |
| `co-hosts` | Later-phase audience-role concept; distinct from current room-role or host truth. |

Do not collapse account-tier `premium` into creator/channel `subscriber`.

## 3. Current Doctrine Vs Missing Truth

### 3.1 Current Doctrine Already Supports
Current repo doctrine already supports:
- canonical audience relationship tables for followers, subscribers, pending requests, and blocked audience
- creator-facing audience summary counts and visibility summary in `/channel-settings`
- owner/operator-scoped audience read-model access through `_lib/channelReadModels.ts`
- public-activity visibility posture on `user_profiles`
- channel-level audience-linked analytics signals for follower/subscriber counts
- moderation/admin summary truth that can sit adjacent to audience work without becoming the same system

### 3.2 Current Doctrine Does Not Yet Support
Current repo doctrine does not yet support:
- a shared action helper layer for audience mutations
- creator-facing audience management workflows for approve/decline/block/unblock/remove
- public profile audience modules beyond light community framing
- VIP, moderator, or co-host audience-role truth
- richer audience segmentation, notes, tags, or CRM behavior
- event-linked audience workflows or premium/ticketed audience handling

## 4. Canonical Audience Buckets And Meanings

### 4.1 Followers
Followers are the lightest creator/channel audience relationship.

Current truth:
- table: `channel_followers`
- fields: `channel_user_id`, `follower_user_id`, `followed_at`, `updated_at`
- relationship is real today
- self-follow is disallowed

Meaning:
- a person follows a creator/channel
- follower counts can appear in creator summaries when backed
- follower relationship is not the same as paid entitlement

### 4.2 Subscribers
Subscribers are creator/channel subscriber relationships.

Current truth:
- table: `channel_subscribers`
- statuses: `active`, `grace_period`, `canceled`, `expired`, `revoked`
- sources: `manual`, `billing_sync`, `operator_grant`

Meaning:
- this is creator/channel subscriber truth
- active subscriber counts currently use `active` and `grace_period`
- this relationship is not the same as account-tier `premium_subscription` truth from `_lib/monetization.ts`

### 4.3 Requests
Requests are pending or reviewed audience relationship requests.

Current truth:
- table: `channel_audience_requests`
- kinds: `follow`, `subscriber_access`
- statuses: `pending`, `approved`, `declined`, `canceled`

Meaning:
- requests are the repo's current canonical place for approval-style audience posture
- they support review workflows later, but today mainly back count truth

### 4.4 Blocked
Blocked audience rows are the channel-owned audience safety boundary.

Current truth:
- table: `channel_audience_blocks`
- fields include `blocked_by_user_id`, `reason`, `blocked_at`

Meaning:
- blocked audience is real and countable today
- it is not the same thing as a platform-level moderation ban or operator action

### 4.5 VIP Later
VIP is later-phase only.

Current doctrine:
- not backed by schema
- not backed by helper truth
- must not be faked in UI

### 4.6 Moderators Later
Audience moderators are later-phase only.

Current doctrine:
- current platform moderation roles exist in `_lib/moderation.ts`
- that is not the same thing as creator/channel audience-role moderators
- do not fake channel moderator rosters from platform-role truth

### 4.7 Co-Hosts Later
Co-host audience roles are later-phase only.

Current doctrine:
- room host/participant truth exists for live and party rooms
- that is not the same thing as persistent creator/channel co-host audience truth

## 5. Exact Surfaces Where Audience Truth Must Apply

### 5.1 Creator Surface
Audience truth must apply to:
- `/channel-settings`
- creator audience summary cards
- future follower/subscriber/request/blocked management sections
- future visibility controls that are already backed by `user_profiles`

### 5.2 Public Surface
Audience truth may apply to `/profile/[userId]` only where already appropriate:
- public activity visibility posture
- follower/subscriber surface visibility when backed and intentionally adopted
- community framing that stays honest

`/profile/[userId]` must not become a creator-side audience management console.

### 5.3 Admin / Moderation Adjacency
Audience truth may relate to:
- operator-facing moderation/safety summary context
- blocked-audience posture
- request review posture when current truth supports it

But:
- creator audience roles are not the same as platform moderation roles
- audience management must not absorb the admin queue

## 6. Current Source-Of-Truth Already In Repo

### 6.1 Schema And Relationship Truth
Current audience relationship schema already exists in:
- `channel_followers`
- `channel_subscribers`
- `channel_audience_requests`
- `channel_audience_blocks`

This landed in:
- `supabase/migrations/202604190005_create_channel_audience_relationships.sql`
- `supabase/database.types.ts`

### 6.2 Audience Visibility Truth
Current audience visibility posture already exists on `user_profiles`:
- `public_activity_visibility`
- `follower_surface_enabled`
- `subscriber_surface_enabled`

This is audience presentation truth, not the full audience workflow system.

### 6.3 Helper / Read-Model Truth
`_lib/channelReadModels.ts` already owns:
- `ChannelAudienceReadModel`
- `readChannelAudienceSummary(channelUserId)`

Current audience read-model fields already support:
- `followerCount`
- `subscriberCount`
- `pendingRequestCount`
- `blockedAudienceCount`
- `publicActivityVisibility`
- `followerSurfaceEnabled`
- `subscriberSurfaceEnabled`

Current read-model fields explicitly still missing:
- `vipCount`
- `moderatorCount`
- `coHostCount`

### 6.4 Creator-Facing Surface Truth Already Landed
`app/channel-settings.tsx` already renders:
- follower count
- subscriber count
- pending request count
- blocked audience count
- public activity visibility
- follower surface visibility
- subscriber surface visibility
- explicit `Later` messaging for VIP / Mod / Co-Host

This is summary truth only, not management workflow truth.

### 6.5 Public Surface Truth Already Landed
`app/profile/[userId].tsx` already supports:
- community framing
- Chi'lly Chat entry
- public-safe identity/community posture

It does not yet render real audience management or backed public audience modules beyond that light framing.

### 6.6 Related Access / Moderation Truth
Related current truth already exists in:
- `_lib/accessEntitlements.ts`
- `_lib/monetization.ts`
- `_lib/moderation.ts`

Important distinctions:
- account-tier `premium_subscription` is not creator/channel subscriber truth
- platform moderation roles are not creator/channel audience-role moderators
- blocked audience is a channel-owned relationship boundary, not a global moderation verdict

## 7. Missing Truth That Still Needs To Be Built
- one shared audience action/helper layer for follow/unfollow, request handling, block/unblock, and creator review actions
- creator-facing audience management workflows in `/channel-settings`
- clearer public-surface adoption rules for when follower/subscriber visibility should render on `/profile/[userId]`
- consistent mutation-side distinction between creator/channel subscriber truth and account-tier premium truth
- later-phase audience roles (`VIP`, `moderators`, `co-hosts`) only when schema and helper truth exist

## 8. Exact Helper / Read-Model Layer Needed

### 8.1 Current Read Layer
Already landed:
- `_lib/channelReadModels.ts`
- `readChannelAudienceSummary(channelUserId)`

Keep this as the summary/read-model owner.

### 8.2 Required Next Helper Layer
The chapter needs a dedicated audience action helper owner:
- `_lib/channelAudience.ts`

This helper should eventually centralize:
- `followChannel(...)`
- `unfollowChannel(...)`
- `requestChannelAccess(...)`
- `cancelChannelAccessRequest(...)`
- `approveChannelAccessRequest(...)`
- `declineChannelAccessRequest(...)`
- `blockChannelAudienceMember(...)`
- `unblockChannelAudienceMember(...)`
- `removeChannelFollower(...)`

It should also expose small supporting reads when needed for management workflow:
- current viewer relationship to a channel
- pending request posture for the current viewer
- channel-owner audience list slices only when backed and necessary

### 8.3 Ownership Rule
- `_lib/channelReadModels.ts` owns read-model summaries
- `_lib/channelAudience.ts` should own mutation/workflow helpers
- screen owners should consume those helpers instead of scattering audience logic locally

## 9. Exact Phased Implementation Order For The Audience Chapter

### Phase A — Doctrine / Spec
Create and land this document.

This pass is complete when:
- current route truth is preserved
- current audience truth vs missing workflow truth is explicit
- the next exact foundation lane is safe to choose

### Phase B — Shared Audience Action Foundation
Create `_lib/channelAudience.ts` as the first mutation/workflow helper owner.

This phase should:
- centralize current supported audience actions only
- avoid fake VIP/mod/co-host behavior
- keep premium entitlement and creator/channel subscriber truth separate

### Phase C — Creator Audience Management Surface
Adopt the landed action/helper truth into `/channel-settings`.

This phase should:
- deepen the current summary cards into real creator workflow sections
- cover followers, subscribers, requests, and blocked
- preserve `/channel-settings` as the owner

### Phase D — Public Audience Surface Audit / Adoption
Audit whether `/profile/[userId]` should adopt any additional backed audience visibility beyond current community framing.

This phase should stay narrow:
- only backed public audience visibility
- no creator-side management UI on the public route

### Phase E — Chapter Closeout Audit
After creator workflows and any justified public adoption land:
- audit remaining audience seams
- decide whether one last narrow batch is needed
- otherwise close out the chapter and choose the next major chapter

## 10. What Not To Do
- do not fake VIP/mod/co-host systems
- do not drift route truth into `/studio*`
- do not scatter audience logic across screen owners
- do not pretend account-tier premium truth is the same as creator/channel subscriber relationship truth
- do not turn `/profile/[userId]` into a creator audience dashboard
- do not collapse blocked-audience truth into platform moderation truth
- do not reopen access, live/event, or broader analytics chapters unless a real regression is proved

## 11. Current Doctrine Vs Later-Phase Ideas

### Current Doctrine
Current doctrine already supports:
- followers
- creator/channel subscribers
- pending audience requests
- blocked audience
- visibility summary posture
- creator-facing audience summary cards in `/channel-settings`

### Later-Phase Ideas
Later-phase audience ideas may include:
- VIP rosters
- creator-managed moderator rosters
- persistent co-host assignments
- audience notes/tags
- richer public community modules
- deeper audience segmentation

These remain later until schema, helper truth, and product doctrine justify them honestly.
