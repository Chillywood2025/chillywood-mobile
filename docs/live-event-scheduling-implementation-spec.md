# Chi'llywood Live / Event Scheduling Implementation Spec

## 1. Purpose And Scope
This document defines Chi'llywood's live / event scheduling chapter.

It is implementation doctrine, not UI code.

It exists to:
- preserve the current Party / Live route doctrine while Chi'llywood adds real scheduled event truth
- define what live and event scheduling mean in the current repo without collapsing them into title metadata
- separate current doctrine, missing truth, and later-phase ideas clearly
- define how scheduled event truth must relate to `/profile/[userId]`, `/channel-settings`, the current watch-party/live routes, replay truth, reminder truth, and the access/entitlement resolver
- define the phased implementation order for the live/event chapter

This spec does not:
- change route truth
- create `/studio*` routes
- implement event access
- change schema directly
- create fake countdowns, reminders, replays, or discovery surfaces

## 2. Current Doctrine That Must Be Preserved

### 2.1 Locked Route Truth
| Route | Owner File | Doctrine |
| --- | --- | --- |
| `/profile/[userId]` | `app/profile/[userId].tsx` | Canonical public profile/channel route. Owner mode stays on the same route. |
| `/channel-settings` | `app/channel-settings.tsx` | Canonical creator control center and future creator event-management owner. |
| `/watch-party/index` | `app/watch-party/index.tsx` | Waiting-room entry owner for party and live flows. |
| `/watch-party/[partyId]` | `app/watch-party/[partyId].tsx` | Canonical Party Room route. |
| `/watch-party/live-stage/[partyId]` | `app/watch-party/live-stage/[partyId].tsx` | Canonical Live Room / Live Stage route. |
| `/title/[id]` | `app/title/[id].tsx` | Canonical title detail and `Watch-Party Live` launch surface. |
| `/player/[id]` | `app/player/[id].tsx` | Canonical standalone player and `Watch-Party Live` launch surface. |

Do not create route proliferation in this chapter.

### 2.2 Locked Label Doctrine
| Locked Label | Meaning | Owner Surface |
| --- | --- | --- |
| `Watch-Party Live` | Title/player-driven watch-together flow and party-facing scheduled-event type. | Title, player, party flow |
| `Live Watch-Party` | Live-room viewing mode and future live-event presentation type. | Home, Live Room |
| `Live First` | Creator/live-room-first broadcast posture and future creator-led live-event mode. | Live Room |

Do not mix `Watch-Party Live` and `Live Watch-Party`.

### 2.3 Current Product Rules To Preserve
- `/profile/[userId]` remains the canonical public profile/channel surface.
- Owner mode remains on `/profile/[userId]`.
- `/channel-settings` remains the current studio-equivalent owner/control center.
- The access/entitlement resolver remains the canonical owner for channel/content/room access truth already landed.
- Event access stays explicitly later until canonical event truth exists.
- Title publication scheduling and live/event scheduling are related but not the same source-of-truth.

## 3. Current Doctrine Vs Missing Truth

### 3.1 Current Doctrine Already Supports
Current repo doctrine already supports:
- live-room and party-room route ownership
- waiting-room entry for Party and Live flows
- in-room distinction between `Live First` and `Live Watch-Party`
- title publication scheduling in Content Studio through `status`, `is_published`, and `release_at`
- title/player `Watch-Party Live` launch posture
- profile/channel live-tab doctrine and current live/watch continuity framing
- access resolver groundwork for future event access, without implementing it yet

### 3.2 Current Doctrine Does Not Yet Support
Current repo doctrine does not yet support:
- canonical scheduled creator-event truth
- a dedicated scheduled-event data model separate from title metadata
- public upcoming-event truth on profile/channel
- creator-facing event scheduling inside `/channel-settings`
- replay availability and expiration truth for creator events
- reminder-ready truth for scheduled events
- event-access resolution

## 4. Live / Event Semantics

### 4.1 Canonical Event Families
The live/event chapter should eventually support three canonical scheduled event families:
- scheduled `Live First`
- scheduled `Live Watch-Party`
- scheduled `Watch-Party Live`

These must remain separate in meaning:
- `Live First` is creator-led live broadcasting
- `Live Watch-Party` is a live social viewing mode inside Live Room
- `Watch-Party Live` is a title/player-driven shared watch event

### 4.2 Current Relationship To Existing Routes
- Scheduled events do not create new user-facing route families.
- A future scheduled `Live First` or `Live Watch-Party` event should still resolve into the canonical live route owner on `/watch-party/live-stage/[partyId]` once it is live.
- A future scheduled `Watch-Party Live` event should still resolve into the canonical party flow and party-room owners instead of inventing a new event route.
- `/profile/[userId]` should surface live-event truth publicly when it becomes real, but it remains a profile/channel surface, not the live room itself.
- `/channel-settings` should own creator scheduling and event management when event truth becomes real.

### 4.3 Current Relationship To Content Publishing
Content Studio title scheduling is not the same thing as live/event scheduling.

Current title scheduling owns:
- when a title becomes published
- `draft` / `published` / `scheduled` / `archived` title status
- `release_at` for title publication truth

Future live/event scheduling must own:
- event type
- event timing
- event lifecycle state
- replay availability / expiration
- reminder readiness

Do not treat scheduled creator events as casual title metadata.

## 5. Exact Surfaces Where Live / Event Truth Must Apply

### 5.1 Creator Surfaces
Creator event truth must eventually apply to:
- `/channel-settings`
- creator control summaries
- creator scheduling and replay-setting controls

### 5.2 Public Surfaces
Public event truth must eventually apply to:
- `/profile/[userId]` Live tab
- profile/channel home/live modules when event truth is real
- home/live modules only after the canonical event model exists

### 5.3 Room Surfaces
Room/event truth must eventually apply to:
- Party Waiting Room when entering scheduled party events
- Party Room when running scheduled `Watch-Party Live`
- Live Waiting Room when entering scheduled live events
- Live Room / Live Stage when running scheduled `Live First` or `Live Watch-Party`

### 5.4 Resolver Relationship
Event truth must eventually apply to:
- the shared access resolver via future `resolveEventAccess(...)`

That is later in this chapter, not before canonical event truth exists.

## 6. Replay Truth

### 6.1 Current Truth
Current repo doctrine has:
- content replay as ordinary title playback
- live-room and party-room runtime state

Current repo doctrine does not yet have:
- canonical creator-event replay truth
- replay expiration truth for scheduled events
- replay-ready public summaries tied to scheduled events

### 6.2 Required Event Replay Model
When event truth becomes real, replay truth must answer:
- whether replay is allowed
- whether replay is available now
- whether replay is expired
- whether replay points to a title, a recorded artifact, or no replay at all

Do not fake replay availability before those answers exist.

## 7. Reminder Truth

### 7.1 Current Truth
Current repo doctrine supports reminder language in product planning and room blueprint direction, but reminder delivery is not currently real event truth.

### 7.2 Required Reminder Model
When event truth becomes real, reminder truth must answer:
- whether the event is reminder-ready
- whether users can subscribe to reminders
- whether reminder delivery is only planned or actually wired

Do not fake countdown or reminder systems before the underlying event truth exists.

## 8. Access / Entitlement Relationship

### 8.1 Current Resolver Boundary
`_lib/accessEntitlements.ts` already centralizes:
- `resolveChannelAccess(...)`
- `resolveContentAccess(...)`
- `resolveRoomAccess(...)`
- `getAccessLabel(...)`
- `canPreviewLockedSurface(...)`

### 8.2 Event Access Boundary
`resolveEventAccess(...)` remains contract-only until canonical event truth exists.

This chapter must:
- define the event truth that future event access can resolve against
- avoid implementing event access before that truth exists
- keep one-time purchase, ticketed access, and formal invite entitlements explicitly unsupported unless later stages prove them honestly

## 9. Current Missing Truth That This Chapter Must Build
- canonical scheduled-event data model
- canonical event status model
- event timing model
- replay availability / expiration truth
- reminder-ready truth
- creator event-management owner surface in `/channel-settings`
- public event summaries on `/profile/[userId]`
- future resolver inputs for event access

## 10. Canonical Event Model Requirements
The minimum future canonical event model should be able to represent:
- host / creator owner
- event title
- event type
- timing
- status
- replay rule
- replay availability / expiration
- reminder-ready state
- optional linked title when the event is content-driven
- optional future access rule field without implying event access is already implemented

The minimum event status family should support:
- `draft`
- `scheduled`
- `live_now`
- `ended`
- `replay_available`
- `expired`
- `canceled`

These are doctrine targets, not schema commands.

## 11. Exact Phased Implementation Order For The Chapter

### Phase A — Doctrine / Spec
Create and land this document.

This pass is complete when:
- current route truth is preserved
- current truth vs missing truth is explicit
- the next exact audit lane is safe to choose

### Phase B — Current Live / Event Truth Audit
Audit the current repo truth across:
- `/channel-settings`
- `/profile/[userId]`
- current waiting-room and room owners
- `_lib/watchParty.ts`
- `_lib/communication.ts`
- current title/admin scheduling truth

This pass should determine:
- what live/session truth already exists
- what title scheduling truth already exists
- what replay/reminder truth is real versus missing
- whether a minimal event model can be defined safely

### Phase C — Canonical Event Data Foundation
Create the smallest honest event data foundation needed for:
- scheduled `Live First`
- scheduled `Live Watch-Party`
- scheduled `Watch-Party Live`
- timing
- lifecycle status
- replay availability / expiration
- reminder-ready truth

This phase should stay separate from casual title metadata unless the audit proves otherwise.

### Phase D — Helper Read / Write Layer
Create narrow event helpers for:
- creating and updating events
- creator event summary reads
- public event summary reads
- replay availability reads
- reminder-ready reads

### Phase E — Creator Scheduling Surface
Adopt real creator event management into `/channel-settings` without creating `/studio*` route drift.

### Phase F — Public Event Surface Adoption
Adopt public event truth into `/profile/[userId]` and related current public surfaces only after the prior phases are real.

### Phase G — Event Access Extension
Only after the canonical event model exists should the access chapter extend into real event access through `resolveEventAccess(...)`.

This later phase must not:
- fake ticketed access
- fake one-time purchase access
- mix event access with content access casually

## 12. What Not To Do
- do not create new user-facing route families for events
- do not collapse scheduled events into title publication truth
- do not mix `Watch-Party Live`, `Live Watch-Party`, and `Live First`
- do not implement event access before canonical event truth exists
- do not fake replay truth
- do not fake reminder truth
- do not fake countdowns or public upcoming-event UI
- do not reopen the closed profile/channel, content-management, or access-adoption chapters unless a real regression is proved

## 13. Current Doctrine Vs Later-Phase Ideas

### 13.1 Current Doctrine / Should Build Now
- preserve current Party / Live route truth
- preserve `/profile/[userId]` and `/channel-settings` ownership
- define the canonical event model
- build creator scheduling inside `/channel-settings`
- build public live/upcoming/replay summary truth on existing surfaces only

### 13.2 Later Phase / Do Not Fake Yet
- event access implementation
- ticketed event access
- one-time event purchase
- formal invite-only event entitlements
- reminder delivery infrastructure
- push notifications
- discovery and recommendation systems for events
- large-scale premium event packages

## 14. Chapter Exit Rule
This chapter closes only when:
- event truth is canonical and real
- creator scheduling is real under `/channel-settings`
- public event summaries are real under existing public surfaces
- replay/reminder-ready truth is honest
- the repo can state clearly what remains missing versus later-phase
