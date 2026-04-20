# Chi'llywood Creator Analytics / Conversion Implementation Spec

## 1. Purpose And Scope
This document defines Chi'llywood's creator analytics / conversion chapter.

It is implementation doctrine, not UI code.

It exists to:
- preserve current route truth while Chi'llywood deepens creator-facing analytics
- separate raw event emission from actual creator-facing aggregate truth
- define what analytics and conversion signals already exist in the repo today
- define the support-status discipline that prevents fake metrics
- define how analytics truth must relate to `/channel-settings`, `/profile/[userId]`, live/event truth, audience truth, monetization/access truth, and internal operator/admin surfaces
- define the phased implementation order for the chapter

This spec does not:
- change route truth
- create `/studio*` routes
- implement analytics UI directly
- change schema directly
- invent fake funnels, profile visits, attendance counts, or revenue reporting

## 2. Current Doctrine That Must Be Preserved

### 2.1 Locked Route Truth
| Route | Owner File | Doctrine |
| --- | --- | --- |
| `/channel-settings` | `app/channel-settings.tsx` | Canonical creator-side analytics summary owner today. |
| `/profile/[userId]` | `app/profile/[userId].tsx` | Canonical public profile/channel route. Not a creator analytics console. |
| `/chat` | `app/chat/index.tsx` | Canonical Chi'lly Chat inbox route. |
| `/chat/[threadId]` | `app/chat/[threadId].tsx` | Canonical Chi'lly Chat direct-thread route. |
| `/watch-party/[partyId]` | `app/watch-party/[partyId].tsx` | Canonical Party Room route. |
| `/watch-party/live-stage/[partyId]` | `app/watch-party/live-stage/[partyId].tsx` | Canonical Live Room / Live Stage route. |
| `/title/[id]` | `app/title/[id].tsx` | Canonical title detail surface. |
| `/player/[id]` | `app/player/[id].tsx` | Canonical standalone player surface. |

Do not create route proliferation in this chapter.

### 2.2 Current Product Rules To Preserve
- `/channel-settings` remains the current creator-side control center and current creator analytics summary owner.
- `/profile/[userId]` remains a public identity/channel surface, not a private creator analytics dashboard.
- Chi'lly Chat unread/read truth stays messaging-owned truth, not creator analytics by default.
- Access/entitlement truth remains access truth, not a conversion dashboard by default.
- Live/event scheduling truth remains event truth, not attendance analytics by default.
- Public programming truth remains content truth, not content-performance truth by default.
- Raw event emitters must not be presented as creator-facing analytics just because they log data.

### 2.3 Current Creator Analytics Boundary
Current creator analytics doctrine is intentionally narrow:
- only show creator-facing aggregates when the repo already has backed aggregate truth
- keep unsupported creator metrics explicit
- do not zero-fill missing fields
- do not imply a funnel exists just because runtime monetization events are emitted

## 3. Exact Metric Buckets And Meanings

### 3.1 Profile
Profile analytics means creator-facing aggregate truth about the public profile/channel surface.

Examples:
- profile visits
- profile CTA opens
- profile-to-chat conversions
- profile-to-content conversions

Current doctrine:
- later unless backed aggregate truth exists
- raw route opens or `trackScreen(...)` calls are not enough on their own

### 3.2 Audience
Audience analytics means creator-facing truth about audience relationships and changes over time.

Examples:
- follower count
- subscriber count
- follower growth
- subscriber growth
- audience request flow outcomes

Current doctrine:
- current follower and subscriber counts are backed
- growth curves, cohorting, and audience lifecycle reporting are not yet backed

### 3.3 Live / Events
Live/event analytics means creator-facing aggregate truth about hosted rooms and scheduled events.

Examples:
- watch-party sessions hosted
- live sessions hosted
- communication sessions hosted
- active hosted rooms
- latest hosted activity
- live attendance totals
- reminder enrollment totals
- replay interactions

Current doctrine:
- room/session counts and latest hosted activity are backed
- attendance totals, reminder conversion funnels, and replay-performance analytics are not yet backed

### 3.4 Content
Content analytics means creator-facing performance truth for titles, programming, shelves, and content launches.

Examples:
- content launches
- hero clicks
- featured row clicks
- top-row performance
- content completion and return behavior

Current doctrine:
- title/programming truth is backed
- creator-facing content performance aggregates are not yet backed

### 3.5 Monetization / Conversion
Conversion analytics means creator-facing aggregate truth about access, purchase, restore, unlock, and other monetization outcomes.

Examples:
- gate views
- purchase starts
- purchase success rate
- restore success rate
- unlock conversions
- paid-title conversions
- subscription conversions

Current doctrine:
- runtime monetization outcomes and analytics events exist
- creator-facing conversion aggregates do not yet exist
- access truth and monetization truth must stay separate from aggregated creator reporting

## 4. Metric Support-Status Discipline

Every creator analytics metric must declare one support status:

| Status | Meaning |
| --- | --- |
| `available` | The metric is backed by current repo truth and can be shown as creator-facing truth now. |
| `missing` | The metric is conceptually in scope for the current chapter, but the repo does not yet have the aggregate truth needed to show it honestly. |
| `later` | The metric belongs to a later chapter or later-phase infrastructure and should not be treated as an active implementation target yet. |

Rules:
- do not coerce `missing` into `0`
- do not relabel `later` as `missing` when the product or infrastructure chapter does not exist yet
- do not show aggregate creator metrics without a backing read-model path

## 5. Exact Surfaces Where Analytics Truth Must Apply Now

### 5.1 Creator Surface
Creator analytics truth must apply to:
- `/channel-settings`
- creator summary cards
- creator support-status messaging
- later creator analytics sections when aggregates are real

### 5.2 Public Surface
`/profile/[userId]` may only reflect analytics truth where doctrine already supports it:
- public-safe identity and programming truth
- public-safe event and reminder truth

`/profile/[userId]` must not become a creator analytics surface.

### 5.3 Internal Operator / Admin Surfaces
Operator/admin surfaces may use internal operational truth when it is already real:
- moderation queue truth
- safety report truth
- app/admin operational summaries

But:
- operator/admin operational truth is not automatically creator-facing analytics
- creator analytics should not be inferred from admin counts alone

## 6. Current Source-Of-Truth Already In Repo

### 6.1 Raw Analytics Event Emission
Current raw event-emission truth exists in:
- `_lib/analytics.ts`
- `_lib/firebaseAnalytics.ts`
- route owners and runtime surfaces that call `trackEvent(...)` or `trackScreen(...)`

Current emitted event families include:
- auth events
- beta events
- room create/join events
- playback events
- monetization gate / purchase / restore / unlock events
- moderation action events
- runtime and fatal error events
- chat thread/call/message events

This is instrumentation truth, not creator-facing analytics truth.

### 6.2 Current Creator Aggregate Read Truth
Current creator aggregate read truth already exists in:
- `_lib/channelReadModels.ts`
- `readCreatorAnalyticsSummary(channelUserId)`

Current backed creator fields:
- `watchPartySessionsHosted`
- `liveSessionsHosted`
- `communicationRoomsHosted`
- `activeHostedRooms`
- `latestHostedActivityAt`
- `followerCount`
- `subscriberCount`

Current intentionally missing creator fields:
- `profileVisits`
- `liveAttendanceTotal`
- `contentLaunches`
- `continueWatchingReturns`
- `gatedSurfaceViews`

### 6.3 Current Creator-Facing Summary Surface
Current creator-facing analytics summary already exists in:
- `app/channel-settings.tsx`

That route currently:
- renders only backed creator analytics cards
- marks unsupported aggregates as unavailable/missing
- keeps analytics adjacent to audience and safety/admin summaries

### 6.4 Current Audience Signals
Audience-linked analytics inputs already exist in:
- `channel_followers`
- `channel_subscribers`
- `_lib/channelReadModels.ts`
- audience summary surfaces in `/channel-settings`

Current honest use:
- follower count
- subscriber count

Current missing use:
- audience growth
- churn
- request-flow analytics

### 6.5 Current Live / Event Signals
Live/event source truth already exists in:
- `watch_party_rooms`
- `communication_rooms`
- `creator_events`
- `_lib/liveEvents.ts`
- current creator/public live-event surfaces

Current honest creator analytics use:
- hosted room/session counts
- latest hosted activity

Current missing creator analytics use:
- attendance totals
- reminder conversion
- replay engagement

### 6.6 Current Monetization / Conversion Inputs
Monetization/conversion-adjacent truth already exists in:
- `_lib/monetization.ts`
- `components/monetization/access-sheet.tsx`
- runtime route owners that emit monetization events

Current honest meaning:
- purchase/runtime events and local outcomes exist
- creator-facing conversion aggregates do not

### 6.7 Current Content / Programming Inputs
Content/programming truth already exists in:
- Content Studio
- public programming consumers on Home and `/profile/[userId]`
- title/player owners

Current honest meaning:
- content selection and programming truth are backed
- creator-facing content-performance analytics are not yet backed

## 7. What Is Only Emission Vs Actual Aggregate Truth

### 7.1 Emission Only
Emission-only truth currently includes:
- `trackEvent(...)` calls
- Firebase Analytics forwarding
- route opens
- purchase-start / purchase-success / purchase-failure events
- gate-shown events
- room join/create events
- chat opened/sent/call events

These are not sufficient to render creator-facing analytics by themselves.

### 7.2 Actual Aggregate Truth
Actual creator-facing aggregate truth currently includes:
- hosted watch-party session count
- hosted live session count
- hosted communication room count
- active hosted rooms
- latest hosted activity
- follower count
- subscriber count

Everything else stays `missing` or `later` until a real read model exists.

## 8. Missing Truth That Still Needs To Be Built
- creator analytics support-status discipline that distinguishes `available`, `missing`, and `later`
- broader creator aggregate read model beyond the current narrow room/audience slice
- profile analytics aggregates
- content-performance aggregates
- live attendance aggregates
- reminder conversion aggregates
- monetization/conversion aggregates
- explicit creator-facing reporting boundaries between operational/admin truth and creator truth

## 9. Exact Helper / Read-Model Layer Needed

### 9.1 Current Owners To Preserve
- `_lib/analytics.ts` remains the raw event-emission owner
- `_lib/firebaseAnalytics.ts` remains the Firebase sink/bootstrap owner
- `_lib/channelReadModels.ts` remains the current creator summary read-model owner for now

### 9.2 Required Chapter Direction
The analytics chapter needs one dedicated creator-analytics read-model path.

Current safe path:
- deepen the existing creator analytics model first inside `_lib/channelReadModels.ts`

Later, if the creator analytics surface outgrows the shared channel summary owner:
- extract a dedicated `_lib/creatorAnalytics.ts`

Do not start by scattering creator analytics logic across screen owners.

### 9.3 First Honest Expansion Rule
Before adding new creator metrics:
- define the metric bucket
- define its support status
- prove the backing source truth
- only then surface it in `/channel-settings`

## 10. Exact Phased Implementation Order For The Chapter

### Phase A — Doctrine / Spec
Create and land this document.

This pass is complete when:
- current route truth is preserved
- current analytics truth vs missing truth is explicit
- the next exact implementation lane is safe to choose

### Phase B — Support-Status Normalization
Normalize creator analytics support-status discipline in the current read-model owner.

This phase should:
- expand creator analytics status from the current two-state posture into:
  - `available`
  - `missing`
  - `later`
- align `/channel-settings` summary messaging with that status discipline
- keep current backed metrics unchanged

### Phase C — Aggregate Truth Audit
Audit candidate creator metrics one bucket at a time:
- profile
- audience
- live/events
- content
- monetization/conversion

This phase should decide:
- what is already truly aggregatable
- what remains `missing`
- what belongs to a later chapter or later infrastructure

### Phase D — Narrow Aggregate Expansion
Add only the smallest honest new creator-facing aggregates proven by Phase C.

Examples of possible narrow expansions:
- reminder-interest totals if creator-facing aggregate posture is finalized
- room-family breakdown refinements
- audience delta/growth only if a backed aggregate path exists

### Phase E — Surface Adoption Deepening
Deepen `/channel-settings` analytics only as new backed creator aggregates land.

Do not widen public profile, rooms, or inbox surfaces into creator analytics dashboards by default.

### Phase F — Chapter Closeout Audit
Audit whether the creator analytics / conversion chapter is complete enough to move on or whether one final narrow batch is justified.

## 11. What Not To Do
- do not fake metrics
- do not fake conversion funnels
- do not treat raw event emitters as creator-facing analytics
- do not zero-fill unsupported creator metrics
- do not create route drift or `/studio*` route truth
- do not collapse operational/admin truth into creator analytics
- do not collapse audience relationship truth into conversion truth
- do not collapse monetization runtime outcomes into finished creator reporting

## 12. Current Doctrine Vs Later-Phase Ideas

### Current Doctrine
Current doctrine already supports:
- a narrow creator analytics summary in `/channel-settings`
- room/session-hosted counts
- latest hosted activity
- follower count
- subscriber count
- explicit unsupported analytics messaging

### Later-Phase Ideas
Later-phase analytics / conversion ideas may include:
- profile visits
- content launches
- hero/featured/top-row performance
- continue-watching returns
- live attendance totals
- reminder conversion rates
- paywall-to-purchase conversion funnels
- revenue reporting
- audience cohorts and retention

These remain later until the repo has a real aggregate read path for them.
