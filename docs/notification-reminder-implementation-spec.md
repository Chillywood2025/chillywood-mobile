# Chi'llywood Notification / Reminder Implementation Spec

## 1. Purpose And Scope
This document defines Chi'llywood's notifications / reminders chapter.

It is implementation doctrine, not UI code.

It exists to:
- preserve the current route and owner doctrine while Chi'llywood adds honest notification and reminder truth
- define what notification-adjacent truth already exists in the repo today
- separate current doctrine, missing truth, and later-phase ideas clearly
- define how notification/reminder truth must relate to `/channel-settings`, `/profile/[userId]`, `/chat`, live/event helpers, moderation/admin surfaces, and current access/monetization outcomes
- define the phased implementation order for the chapter

This spec does not:
- change route truth
- create `/studio*` routes
- implement push delivery
- implement a fake notification center
- invent background infrastructure that current repo truth does not support

## 2. Current Doctrine That Must Be Preserved

### 2.1 Locked Route Truth
| Route | Owner File | Doctrine |
| --- | --- | --- |
| `/profile/[userId]` | `app/profile/[userId].tsx` | Canonical public profile/channel route. Owner mode stays on the same route. |
| `/channel-settings` | `app/channel-settings.tsx` | Canonical creator control center and future creator-side reminder/notification-adjacent owner where truthful. |
| `/chat` | `app/chat/index.tsx` | Canonical Chi'lly Chat inbox route. |
| `/chat/[threadId]` | `app/chat/[threadId].tsx` | Canonical Chi'lly Chat direct-thread route. |
| `/watch-party/index` | `app/watch-party/index.tsx` | Waiting-room owner for live and party entry. |
| `/watch-party/[partyId]` | `app/watch-party/[partyId].tsx` | Canonical Party Room route. |
| `/watch-party/live-stage/[partyId]` | `app/watch-party/live-stage/[partyId].tsx` | Canonical Live Room / Live Stage route. |

Do not create route proliferation in this chapter.

### 2.2 Current Product Rules To Preserve
- `/profile/[userId]` remains a public profile/channel route, not a notification inbox.
- `/channel-settings` remains the creator-side control center, not a new studio route family.
- `/chat` and `/chat/[threadId]` remain the canonical messaging routes for message-state truth.
- `Watch-Party Live`, `Live Watch-Party`, and `Live First` remain distinct.
- access/entitlement truth already exists and must not be reopened or faked through notifications.
- reminder-ready state is not the same thing as reminder enrollment or delivery.
- analytics event emission is not notification truth.

### 2.3 Locked Notification / Reminder Boundaries
- no fake push delivery
- no fake unread counts outside real backed read-state owners
- no fake reminder enrollment
- no fake payment/access confirmations when no real notification record exists
- no fake moderation/admin notices outside real backed moderation truth

## 3. Current Doctrine Vs Missing Truth

### 3.1 Current Doctrine Already Supports
Current repo doctrine already supports:
- creator-event reminder-ready truth on `creator_events`
- creator and public event summary reads in `_lib/liveEvents.ts`
- public reminder-ready surface cues on `/profile/[userId]`
- creator reminder-ready control and summary cues on `/channel-settings`
- Chi'lly Chat unread/read truth via `chat_thread_members.last_read_at` and `unread_count`
- moderation/admin source truth through safety reports and platform-role access
- monetization/access action outcomes as local runtime feedback

### 3.2 Current Doctrine Does Not Yet Support
Current repo doctrine does not yet support:
- canonical notification records
- a notification type/category model
- read/dismiss notification state outside chat thread membership
- reminder enrollment per user/event
- notification deep-link contract
- notification preferences
- push token or background delivery infrastructure
- an in-app notification center

## 4. Canonical Notification / Reminder Categories And Meanings

### 4.1 Creator Went Live
Meaning:
- a creator event has transitioned into live state
- it is event-driven, not inferred from vague presence

Current doctrine:
- later until canonical notification records exist
- must eventually map to real live-event truth, not runtime guesswork alone

### 4.2 Upcoming Event Reminder
Meaning:
- a user enrolled in a reminder for a specific scheduled creator event
- reminder is tied to real reminder-ready event truth plus real enrollment truth

Current doctrine:
- reminder-ready event truth exists now
- reminder enrollment and delivery do not yet exist

### 4.3 New Message
Meaning:
- a direct Chi'lly Chat thread has unread messages for the current member

Current doctrine:
- already real through `chat_thread_members.last_read_at` and `unread_count`
- currently owned by chat thread/inbox surfaces, not by a global notification table yet

### 4.4 Access Granted
Meaning:
- a user gained real access to a creator/channel/content/event surface through a backed access change

Current doctrine:
- later until notification records exist
- access truth itself is real today through the access/entitlement layer, but notification records are not

### 4.5 Content Dropped
Meaning:
- newly available content became public or surfaced for a user

Current doctrine:
- later until notification records exist
- content publication truth is real today, but notification records are not

### 4.6 Reply / Comment
Meaning:
- a user received a meaningful response or interaction that current product doctrine treats as notify-worthy

Current doctrine:
- later until the underlying reply/comment source-of-truth and notification records are aligned

### 4.7 Moderation / Admin Notice
Meaning:
- a user or operator-facing notice tied to real safety/moderation truth

Current doctrine:
- moderation source truth exists today
- notification records do not yet exist
- future notices must stay audit-minded and must not be faked from generic error toasts

### 4.8 Payment / Access Confirmation
Meaning:
- a real monetization or access action completed and resulted in confirmed state

Current doctrine:
- local action outcomes exist today
- durable notification records do not yet exist
- do not fabricate confirmations beyond the current paywall/access-sheet runtime feedback

## 5. Exact Surfaces Where Notification / Reminder Truth Must Apply

### 5.1 Creator Surface
Notification/reminder truth may apply to `/channel-settings` for:
- creator event reminder-readiness controls
- creator visibility into reminder enrollment or reminder interest when backed
- creator notification-adjacent summaries only when backed by canonical data

`/channel-settings` must not become a fake notification inbox before canonical records exist.

### 5.2 Public Surface
Notification/reminder truth may apply to `/profile/[userId]` only where already honest:
- reminder-ready event posture
- future reminder enrollment controls only when real enrollment truth exists
- no creator-side notification management

### 5.3 Chat Surfaces
Notification-adjacent truth already applies to:
- `/chat`
- `/chat/[threadId]`

Current honest scope:
- unread thread counts
- mark-read behavior
- direct-thread status cues

Chat surfaces must not be rewritten into a generic notifications system.

### 5.4 Live / Event Surfaces
Live/event surfaces may later consume notification/reminder truth for:
- reminder enrollment entry
- live-now transitions
- event re-entry cues

But:
- live and party routes remain room owners
- notifications must point into those routes, not replace them

### 5.5 Admin / Moderation Surfaces
Admin/moderation surfaces may later consume:
- moderation/admin notices
- audit-minded review alerts

But:
- admin notices require real backed moderation truth
- they must not be fabricated from analytics or client warnings

## 6. Current Source-Of-Truth Already In Repo

### 6.1 Event Reminder-Ready Truth
Current reminder-adjacent truth already exists in:
- `creator_events.reminder_ready`
- `_lib/liveEvents.ts`
- `/channel-settings`
- `/profile/[userId]`

Current honest meaning:
- an event is eligible for reminder adoption when it is scheduled, has a real start time, and is marked reminder-ready

This is not yet reminder enrollment or delivery truth.

### 6.2 Chat Unread / Read Truth
Current message notification-adjacent truth already exists in:
- `chat_thread_members.last_read_at`
- `chat_thread_members.unread_count`
- `_lib/chat.ts`
- `/chat`
- `/chat/[threadId]`

This is real unread/read state, not a generalized notification table.

### 6.3 Moderation / Admin Source Truth
Current moderation/admin notice source truth already exists in:
- `_lib/moderation.ts`
- `safety_reports`
- `platform_role_memberships`
- `app/admin.tsx`

This is source truth only, not a canonical notification system.

### 6.4 Monetization / Access Outcome Truth
Current monetization/access outcome truth already exists in:
- `_lib/monetization.ts`
- `components/monetization/access-sheet.tsx`
- current runtime purchase/restore/manage flows

This currently produces runtime feedback, not durable notification records.

### 6.5 Analytics Event Emission
Current analytics event emission exists in:
- `_lib/analytics.ts`
- `_lib/firebaseAnalytics.ts`

This is not notification truth and must not be treated as a notification system.

## 7. Missing Truth That This Chapter Must Build
- canonical notification records
- notification type/category truth
- read/dismiss notification state
- minimal deep-link/target-route contract
- reminder enrollment truth for users and events
- helper-layer ownership for reading notification lists/summaries and mutating read/dismiss/reminder state
- small, route-owner-aligned reminder/notification-adjacent surfaces where current doctrine honestly supports them

## 8. Exact Helper / Data Layer Needed

### 8.1 Current Owners To Preserve
- `_lib/liveEvents.ts` remains the creator-event owner
- `_lib/chat.ts` remains the Chi'lly Chat read/write owner
- `_lib/analytics.ts` remains analytics-only

### 8.2 Required New Owner
The chapter needs a dedicated notification/reminder helper owner:
- `_lib/notifications.ts`

This helper should eventually own:
- notification record parsing
- notification list/summary reads
- mark-read / dismiss actions
- reminder enrollment reads/writes
- route/deep-link normalization for notification targets

### 8.3 Ownership Rule
- event truth stays in `_lib/liveEvents.ts`
- chat truth stays in `_lib/chat.ts`
- notification/reminder aggregation and mutation should live in `_lib/notifications.ts`
- screen owners should consume those helpers instead of scattering notification logic locally

## 9. Exact Phased Implementation Order For The Chapter

### Phase A — Doctrine / Spec
Create and land this document.

This pass is complete when:
- current route truth is preserved
- current notification/reminder truth vs missing truth is explicit
- the next exact audit lane is safe to choose

### Phase B — Current Truth Audit
Audit current truth across:
- analytics emitters
- chat read/unread owners
- live/event helpers and creator/public event surfaces
- moderation/admin source truth
- monetization/access outcome truth

This pass should determine:
- what notification/reminder truth already exists
- what is only event emission rather than notification state
- whether a minimal foundation can be defined safely

### Phase C — Canonical Data Foundation
Create the smallest honest foundation needed for:
- notification records
- notification categories
- read/dismiss state
- reminder enrollment truth
- target/deep-link contract

This phase must stay minimal:
- no push provider logic
- no fake background delivery
- no route proliferation

### Phase D — Helper Read / Write Layer
Create `_lib/notifications.ts`.

This phase should:
- expose notification list/summary reads
- expose mark-read / dismiss actions
- expose reminder enrollment reads/writes where currently honest
- keep deep-link normalization narrow and route-owner aligned

### Phase E — First Surface Adoption
Adopt the first honest notification/reminder-adjacent surfaces.

This phase should stay narrow:
- `/channel-settings` for creator-side reminder visibility where backed
- `/profile/[userId]` or live surfaces only for real reminder enrollment or reminder status where backed
- chat surfaces only where direct unread/read truth already exists

### Phase F — Chapter Closeout Audit
After the foundation, helpers, and first safe surface adoption land:
- audit the remaining chapter seams
- decide whether one final narrow batch is justified
- otherwise close out the chapter and select the next major chapter

## 10. What Not To Do
- do not fake push delivery
- do not fake notification counts
- do not fake reminder enrollment
- do not fake payment/access confirmations
- do not treat analytics emission as notification state
- do not create `/studio*` or notification-only route proliferation
- do not turn `/profile/[userId]` into a notification inbox
- do not turn `/chat` into a generic notifications center
- do not reopen access, live/event, or audience chapters unless a real regression is proved

## 11. Current Doctrine Vs Later-Phase Ideas

### Current Doctrine
Current doctrine already supports:
- creator event reminder-ready truth
- public reminder-ready event summaries
- creator reminder-readiness controls
- Chi'lly Chat unread/read state
- moderation/admin source truth
- runtime monetization/access outcome feedback

### Later-Phase Ideas
Later-phase notification/reminder ideas may include:
- push notification delivery
- notification preferences
- grouped notification inbox surfaces
- digesting / batching
- creator marketing notifications
- ticketed/premium event reminder targeting
- richer moderation/admin alert routing

These remain later until canonical data truth and helper ownership exist.
