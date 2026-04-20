# Chi'llywood Access / Entitlement Implementation Spec

## 1. Purpose And Scope
This document defines Chi'llywood's current access and entitlement architecture.

It is implementation doctrine, not UI code.

It exists to:
- preserve the current public-v1 route and label doctrine while the platform moves into a shared access chapter
- describe the access truth that already exists across channel defaults, creator permissions, monetization, titles, and room/session flows
- separate current truth from missing truth and later-phase ideas
- define one canonical shared resolver layer so access decisions stop scattering across public surfaces and room owners
- set the phased implementation order for the access/entitlement chapter

This spec does not:
- change schema
- change remote DB state
- change route truth
- change UI behavior directly
- invent fake purchase, ticketing, or event truth

## 2. Current Doctrine That Must Be Preserved

### 2.1 Locked Route Truth
| Route | Owner File | Doctrine |
| --- | --- | --- |
| `/profile/[userId]` | `app/profile/[userId].tsx` | Canonical public profile/channel surface. |
| `/channel-settings` | `app/channel-settings.tsx` | Canonical owner control center. |
| `/title/[id]` | `app/title/[id].tsx` | Canonical title detail and title-entry gate surface. |
| `/player/[id]` | `app/player/[id].tsx` | Canonical standalone player surface. |
| `/watch-party/[partyId]` | `app/watch-party/[partyId].tsx` | Canonical Party Room route. |
| `/watch-party/live-stage/[partyId]` | `app/watch-party/live-stage/[partyId].tsx` | Canonical Live Room / Live Stage route. |
| `/chat` and `/chat/[threadId]` | `app/chat/index.tsx`, `app/chat/[threadId].tsx` | Canonical Chi'lly Chat routes. |

Do not create `/studio*` route drift inside this chapter.

### 2.2 Locked Label Doctrine
| Locked Label | Meaning |
| --- | --- |
| `Watch-Party Live` | Title/player-driven watch-together entry and shared playback context. |
| `Live Watch-Party` | Live-room mode and live-social viewing context. |
| `Live First` | Creator/live-room-first broadcast posture. |
| `Chi'lly Chat` | Canonical messaging layer, separate from room gating and profile identity. |

Do not mix `Watch-Party Live` and `Live Watch-Party`.

### 2.3 Current Product Rules To Preserve
- Profile/channel stays closed as an implementation chapter unless a real regression is proved.
- Content Studio stays closed enough to move on; this chapter must not reopen content programming work.
- Access must not become a scattered mix of per-screen guesses.
- Official presence is not a creator paywall.
- Room access, content access, and future event access may share language, but they are not the same source-of-truth today.

## 3. Canonical Access Levels And Meanings
The table below defines the platform vocabulary this chapter should use.

| Access Level | Meaning | Current Status |
| --- | --- | --- |
| `public` | Open access with no entitlement requirement. | Current truth |
| `private` | Host-controlled or identity-gated entry where public access is not open. Today this is mostly join-policy or room-membership truth, not a full purchase/subscriber system. | Current truth |
| `subscriber access` | Channel-level summary posture for member-style access. Today this is a summary label, not a single entitlement type: it currently means both room-default paths are gated instead of open. | Current doctrine, partial truth |
| `mixed access` | Channel-level summary posture when some channel surfaces are open and others are gated. | Current doctrine, partial truth |
| `premium-only` | Premium entitlement required. Currently backed for premium titles and some room/live paths through monetization/runtime truth. | Current truth |
| `one-time purchase` | One-time paid unlock for content or event access. | Later-phase only; no fake truth yet |
| `invite-only` | Access only through host control, existing membership, or future explicit invite truth. Today this is approximated by locked join policy and membership checks, not a dedicated entitlement system. | Current doctrine, partial truth |
| `Watch-Party Live access` | Access posture for title-linked or hybrid watch-together room/session entry. | Current truth |
| `Live Watch-Party access` | Access posture for live-room viewing mode. Current live-room access still comes from room/session truth, not a scheduled event model. | Current truth, event model missing |

## 4. Exact Surfaces Where Access Truth Must Apply

### 4.1 Channel
Channel-level access truth must apply to:
- `/profile/[userId]`
- `/channel-settings`
- owner-facing channel summaries
- visitor-facing channel posture summaries

### 4.2 Tab / Block / Shelf
Access truth must eventually apply to:
- profile/channel public tabs
- channel-home blocks
- future locked shelves or blocks
- teaser-visible vs fully locked content groupings

This layer is not yet fully built.

### 4.3 Content Item
Content-level access truth must apply to:
- `/title/[id]`
- `/player/[id]`
- title cards where lock state must be shown honestly
- future title-detail gating labels and preview behavior

### 4.4 Room / Session
Room/session access truth must apply to:
- Party Waiting Room
- Party Room
- Live Waiting Room
- Live Room / Live Stage
- communication-room lobby and room owners where compatibility surfaces still exist

### 4.5 Event / Live
Event/live access truth must eventually apply to:
- scheduled creator events
- scheduled Watch-Party Live
- scheduled Live Watch-Party
- replay availability and expiration

This surface is later because the event model is not yet canonical.

## 5. Current Source-Of-Truth Already In Repo

### 5.1 Channel Defaults In `user_profiles`
`_lib/userData.ts` already exposes channel-default access truth from `user_profiles`:
- `defaultWatchPartyJoinPolicy`
- `defaultWatchPartyContentAccessRule`
- `defaultWatchPartyCapturePolicy`
- `defaultCommunicationContentAccessRule`
- `defaultCommunicationCapturePolicy`

This is the current channel-default posture foundation.

### 5.2 Creator Capability Truth In `creator_permissions`
`_lib/monetization.ts` already owns creator grant truth through `creator_permissions`:
- `canUsePartyPassRooms`
- `canUsePremiumRooms`
- `canPublishPremiumTitles`
- `canUseSponsorPlacements`
- `canUsePlayerAds`

This is what currently decides whether requested gated defaults are allowed to persist or must fall back to open.

### 5.3 Monetization And Entitlement Truth
`_lib/monetization.ts` already owns monetization snapshot truth through:
- RevenueCat snapshot state
- monetization target definitions
- active entitlements
- available offerings
- current purchase/restore helpers

Current monetization target posture already exists for:
- `premium_subscription`
- `paid_title_access`
- `premium_live_access`
- `premium_watch_party_access`

Current gate reasons already exist:
- `allowed`
- `premium_required`
- `party_pass_required`

### 5.4 Title Access Truth
`titles.content_access_rule` is already current source-of-truth for title gating.

Current title truth is narrow:
- `open`
- `premium`

`_lib/monetization.ts` already exposes:
- `sanitizeCreatorTitleAccessRule(...)`
- `evaluateTitleAccess(...)`

`app/title/[id].tsx` and `app/player/[id].tsx` already depend on that truth directly.

### 5.5 Room / Session Access Truth
`_lib/roomRules.ts` and `_lib/watchParty.ts` already own room/session gating truth.

Current room truth includes:
- `joinPolicy`: `open` or `locked`
- `contentAccessRule`: `open`, `party_pass`, or `premium`
- `capturePolicy`
- room membership state: `active`, `reconnecting`, `left`, `removed`
- room access reasons:
  - `allowed`
  - `identity_required`
  - `room_locked`
  - `removed`
  - `party_pass_required`
  - `premium_required`

`evaluatePartyRoomAccess(...)` already resolves current watch-party room access.

`_lib/communication.ts` already sanitizes communication-room `content_access_rule` from channel defaults plus creator permissions, and communication-room owners already respect the same `room_locked` / `removed` / monetization gate outcomes.

### 5.6 Audience And Visibility Truth
`_lib/channelReadModels.ts` already owns audience-visibility truth for:
- `publicActivityVisibility`
- `followerSurfaceEnabled`
- `subscriberSurfaceEnabled`

This is related to access posture, but it is not yet the same as a general entitlement resolver.

### 5.7 Current Channel Access Summaries
`app/profile/[userId].tsx` and `app/channel-settings.tsx` already derive channel access summary labels from current room defaults:
- `Official Access`
- `Loading Access`
- `Subscriber Access`
- `Private`
- `Public`
- `Mixed Access`

They also already show detail values such as:
- `Public`
- `Party Pass`
- `Premium`

This is current doctrine, but the logic is still local to those surfaces.

## 6. What Is Still Scattered Or Missing

### 6.1 Scattered Access Decisions
Access decisions are still split across:
- `_lib/monetization.ts`
- `_lib/roomRules.ts`
- `_lib/watchParty.ts`
- `_lib/communication.ts`
- `app/profile/[userId].tsx`
- `app/channel-settings.tsx`
- `app/title/[id].tsx`
- `app/player/[id].tsx`
- room and lobby owners

Current problems:
- channel summaries derive their own labels locally
- title/player use content access directly
- room owners use room access directly
- there is no single place that answers "what is this surface's effective access state and why?"

### 6.2 Missing Truth
The following truth is still missing or incomplete:
- one shared resolver for channel, content, room, and later event access
- canonical preview visibility rules for locked surfaces
- canonical lock reason and CTA guidance shared across surfaces
- canonical tab/block/shelf access truth
- formal event access truth for scheduled live/watch-party events
- real one-time purchase truth for content or event unlocks
- explicit ticketed-event truth
- explicit invite-only entitlement truth beyond locked join policy and membership rules

### 6.3 Current Doctrine Vs Missing Truth
Current doctrine already supports:
- public access
- premium content access
- room access with open, locked, party-pass, and premium semantics
- channel-level summary posture labels

Current doctrine does not yet support:
- full purchase-system truth
- event ticketing
- stable content-preview policy across all locked surfaces
- full cross-surface resolver reuse

## 7. Why A Shared Resolver Layer Is Required
Chi'llywood now has enough access-related truth that per-surface derivation is becoming unsafe.

One shared resolver layer is required because:
- profile/channel already summarizes access posture
- title/player already gate content
- watch-party and communication already gate room/session entry
- live/event scheduling is next after access, so event access semantics need a stable contract before that chapter starts

Without a shared resolver:
- labels drift
- lock reasons drift
- preview visibility drifts
- route owners keep re-implementing the same gating logic
- monetization, room policy, and channel posture stay mentally coupled but technically scattered

## 8. Proposed Shared Resolver APIs
The shared resolver layer should live in:
- `_lib/accessEntitlements.ts`

### 8.1 Core Functions
- `resolveChannelAccess(...)`
- `resolveContentAccess(...)`
- `resolveRoomAccess(...)`
- `resolveEventAccess(...)`
- `getAccessLabel(...)`
- `canPreviewLockedSurface(...)`

### 8.2 Current-Truth Responsibility By Function
| Function | Responsibility | Current-Lane Support |
| --- | --- | --- |
| `resolveChannelAccess(...)` | Resolve channel-level public/private/mixed/member-style posture from `user_profiles`, `creator_permissions`, audience visibility, and official-account truth. | Ready now |
| `resolveContentAccess(...)` | Resolve title/content gating from `titles.content_access_rule`, monetization snapshot truth, and creator permission constraints. | Ready now |
| `resolveRoomAccess(...)` | Resolve room/session gating from room policy, membership state, and monetization/runtime truth. | Ready now |
| `resolveEventAccess(...)` | Resolve scheduled event access once event truth exists. | Contract only for now |
| `getAccessLabel(...)` | Turn canonical resolved access into stable UI labels without each surface inventing its own phrasing. | Ready now |
| `canPreviewLockedSurface(...)` | Decide whether a locked surface can show teaser/preview state vs full hidden state. | Ready now, but policy will start narrow |

### 8.3 Resolver Output Requirements
The shared resolver should eventually return:
- effective access level
- specific lock reason
- source-of-truth owner
- whether access is available now
- whether a teaser preview is allowed
- what CTA family is appropriate
- what label family should be used
- whether a state is current truth, missing truth, or later-phase

## 9. Exact Phased Implementation Order For The Access Chapter

### Phase A — Doctrine / Spec
Create and land this document.

This pass is complete when:
- current truth is recorded
- missing truth is explicit
- the first exact implementation lane is safe to choose

### Phase B — Shared Resolver Foundation
Create `_lib/accessEntitlements.ts` as a narrow current-truth resolver foundation.

This first implementation lane should:
- define canonical access types
- implement `resolveChannelAccess(...)`
- implement `resolveContentAccess(...)`
- implement `resolveRoomAccess(...)`
- implement `getAccessLabel(...)`
- implement `canPreviewLockedSurface(...)`
- keep `resolveEventAccess(...)` as contract-only or explicit later

This lane should not:
- adopt the resolver into screen owners yet
- change route truth
- invent event access truth

### Phase C — Channel + Content Adoption
Adopt the shared resolver into:
- `app/profile/[userId].tsx`
- `app/channel-settings.tsx`
- `app/title/[id].tsx`
- `app/player/[id].tsx`

Goal:
- remove local label derivation drift
- keep channel/content surfaces honest without changing route truth

### Phase D — Room / Session Adoption
Adopt the shared resolver into:
- watch-party waiting/room owners
- communication lobby/room owners
- live-stage room/session owners only where current room truth already applies

Goal:
- unify room/session access labels and lock reasons
- keep `Watch-Party Live` and `Live Watch-Party` semantics separate

### Phase E — Event Access Extension
Only after the live/event scheduling chapter creates canonical event truth:
- implement real `resolveEventAccess(...)`
- extend channel/content/room adoption where event cards or reminders need it

Do not pull event logic forward before the event model exists.

## 10. What Not To Do
- do not scatter new gating logic across screen owners
- do not mix `Watch-Party Live` and `Live Watch-Party` semantics
- do not invent fake purchase or ticket truth
- do not pretend one-time purchase exists where it does not
- do not treat locked join policy as a full subscription system
- do not drift route ownership away from the current canonical owners
- do not reopen profile/channel or content-management chapters during this resolver foundation
- do not fake preview visibility rules; if preview policy is unresolved, mark it narrow and explicit

## 11. Current Doctrine Vs Later-Phase Ideas

### 11.1 Current Doctrine
Current doctrine already supports:
- open vs gated title access
- open vs locked room entry
- party-pass vs premium room gating
- channel-level access posture summaries
- creator grant sanitization for gated defaults
- monetization-sheet handoff for currently supported monetization gates

### 11.2 Later-Phase Ideas
Later-phase ideas are allowed only after backing truth exists:
- ticketed event access
- one-time content purchase beyond current placeholder target definitions
- explicit invite-only entitlement flows
- bundle/coupon logic
- shelf-level paid-access compositions
- replay-specific paid access
- richer teaser-preview rules
- audience-role-linked access tiers

Later-phase ideas must not be shipped early as fake labels or fake gates.

## 12. Exact Next Implementation Lane
The first exact implementation lane after this doctrine/spec pass should be:

**narrow access/entitlement shared resolver foundation pass**

Owner:
- `_lib/accessEntitlements.ts`

Goal:
- centralize current channel/content/room access truth into one shared resolver layer without changing UI or routes yet

Out of scope:
- schema changes
- event model work
- live/event scheduling implementation
- UI adoption
- purchase-system expansion
