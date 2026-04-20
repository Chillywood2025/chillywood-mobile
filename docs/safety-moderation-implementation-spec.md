# Chi'llywood Safety / Moderation Workflow Implementation Spec

## 1. Purpose And Scope
This document defines Chi'llywood's safety / moderation workflow deepening chapter.

It is implementation doctrine, not UI code.

It exists to:
- preserve current route truth while Chi'llywood deepens safety and moderation workflow
- separate creator-side safety summary truth from operator/admin moderation truth
- define what safety/moderation systems already exist in the repo today
- define what report intake, review access, and audit context are honestly supported now
- define what moderation workflow is still missing
- define the phased implementation order for this chapter

This spec does not:
- change route truth
- create `/studio*` routes
- invent fake enforcement systems
- invent fake strikes, dispute flows, appeal queues, or viewer audit systems
- change schema directly

## 2. Current Doctrine That Must Be Preserved

### 2.1 Locked Route Truth
| Route | Owner File | Doctrine |
| --- | --- | --- |
| `/channel-settings` | `app/channel-settings.tsx` | Canonical creator-side control center. May show creator/channel safety summary truth, but is not the platform moderation queue. |
| `/profile/[userId]` | `app/profile/[userId].tsx` | Canonical public profile/channel route. May open honest report intake, but is not a creator moderation console. |
| `/title/[id]` | `app/title/[id].tsx` | Canonical title detail route. May open honest report intake for title-owned context. |
| `/chat/[threadId]` | `app/chat/[threadId].tsx` | Canonical Chi'lly Chat thread route. May open honest report intake for message/thread context. |
| `/watch-party/[partyId]` | `app/watch-party/[partyId].tsx` | Canonical Party Room route. May open honest report intake for party-room context. |
| `/watch-party/live-stage/[partyId]` | `app/watch-party/live-stage/[partyId].tsx` | Canonical Live Room / Live Stage route. May open honest report intake for live-room context. |
| `/communication/[roomId]` | `app/communication/[roomId].tsx` | Canonical communication-room route. May open honest report intake for communication-room context. |
| `/admin` | `app/admin.tsx` | Canonical operator/admin moderation review owner. |

Do not create route proliferation in this chapter.

### 2.2 Product Rules To Preserve
- `/channel-settings` remains the creator-side owner for channel safety summary truth, not the global moderation queue.
- `/profile/[userId]` remains the public identity/channel route and must not become a creator moderation console.
- Report submission must remain grounded in actual target, route, and audit context.
- Official-platform identity truth and operator-role truth must remain separate but interoperable.
- Audience block truth is audience-management truth, not a substitute for platform moderation review.
- Access/entitlement restrictions, audience workflows, and moderation workflows must remain separate systems even when they interact around the same user/channel.

### 2.3 Current Safety Boundary
Current safety/moderation doctrine is intentionally narrow:
- report intake is real
- report context normalization is real
- operator/admin review access is real
- creator-side safety summary is real
- moderation resolution workflow is not yet fully real

That means:
- do not imply that a surfaced report is already triaged just because it is visible in `/admin`
- do not imply creator-side strike or dispute control where no backed workflow exists
- do not imply moderation state transitions that current schema and helpers do not support

## 3. Exact Surfaces Where Safety / Moderation Truth Must Apply Now

### 3.1 Creator-Side Surface
`/channel-settings` may show only creator/channel safety truth already backed today:
- moderation actor role
- admin access reach
- safety review reach
- official-account protection/audit-owner identity
- recent safety-report count only when report-review access is real

`/channel-settings` must not:
- become a platform moderation queue
- expose private report details without backed creator-side doctrine
- imply creator-owned strike, suspension, or dispute control

### 3.2 Public And Runtime Report-Entry Surfaces
The following route owners may open or submit safety reports where already real:
- `/profile/[userId]`
- `/title/[id]`
- `/chat/[threadId]`
- `/watch-party/[partyId]`
- `/watch-party/live-stage/[partyId]`
- `/communication/[roomId]`

These surfaces may:
- open the report sheet
- preserve target label and route context
- preserve audit-owner and platform-owned target hints

These surfaces must not:
- expose the moderation queue
- expose other reporters' data
- pretend report resolution exists on-device when it does not

### 3.3 Operator / Admin Surface
`/admin` is the canonical operator/admin moderation surface today.

Current doctrine allows it to show:
- current moderation actor role
- current platform-role memberships
- whether safety review is enabled
- recent safety reports when the signed-in identity can review them

Current doctrine does not yet allow it to claim:
- report state mutation
- assignment workflow
- strike workflow
- appeal/dispute workflow
- creator-visible enforcement history

## 4. Current Source-Of-Truth Already In Repo

### 4.1 Canonical Helper Owner
`_lib/moderation.ts` is the canonical current owner for:
- moderation access derivation
- safety-report context normalization
- safety-report intake
- active platform-role membership reads
- recent safety-report queue reads

Current helper exports already include:
- `getModerationAccess(...)`
- `buildSafetyReportContext(...)`
- `trackModerationActionUsed(...)`
- `readMyPlatformRoleMemberships()`
- `readSafetyReports(...)`
- `submitSafetyReport(...)`

### 4.2 Current Schema Truth
Current schema truth already exists in:
- `platform_role_memberships`
- `safety_reports`

Current honestly backed fields include:
- platform role
- role status
- granted timestamps
- report category
- report target type/id
- optional room/title references
- reporter user id
- arbitrary report context JSON

Current schema does not yet provide a first-class moderation workflow model for:
- review status transitions
- assignee ownership
- resolution notes
- strike / penalty / enforcement history
- appeal or dispute lifecycle

### 4.3 Current Read-Model Truth
`_lib/channelReadModels.ts` already exposes creator-facing safety/admin summary truth through:
- `readChannelSafetyAdminSummary(channelUserId)`

Current backed summary fields include:
- `actorRole`
- `canAccessAdmin`
- `canReviewSafetyReports`
- `platformRoles`
- `recentSafetyReports`
- `recentSafetyReportCount`
- `isOfficial`
- `auditOwnerKey`

This is creator/channel summary truth, not full moderation workflow truth.

### 4.4 Current Route-Level Report Intake Truth
Current report-entry owners already exist in:
- `app/profile/[userId].tsx`
- `app/title/[id].tsx`
- `app/chat/[threadId].tsx`
- `app/watch-party/[partyId].tsx`
- `app/watch-party/live-stage/[partyId].tsx`
- `app/communication/[roomId].tsx`

These owners already preserve:
- source surface
- source route
- target label
- target role label where relevant
- target audit owner key where relevant
- platform-owned target hints where relevant

### 4.5 Current Operator/Admin Review Truth
`app/admin.tsx` already exposes:
- role-aware access checks
- platform-role membership visibility
- recent safety-report queue visibility
- locked-state messaging when review access is absent

This is a real read surface, not yet a resolution workflow.

## 5. Current Supported Workflow Truth

### 5.1 Report Intake
Supported now:
- open report flow from canonical public/runtime owners
- submit report with category and note
- preserve route and audit context

Not supported yet:
- report acknowledgements with durable status history
- report result notifications
- reporter-side case tracking

### 5.2 Review Access
Supported now:
- operator/official-platform-aware moderation access
- active platform-role membership reads
- recent report queue visibility when review access is real

Not supported yet:
- review assignment
- review completion
- escalation lifecycle

### 5.3 Creator Safety Summary
Supported now:
- creator-side safety/admin summary in `/channel-settings`
- visibility of moderation actor role, review access, official protection, and recent report count

Not supported yet:
- creator-owned report review
- creator-owned enforcement queue
- creator strike/dispute control

## 6. Missing Truth That Still Needs To Be Built
- explicit moderation review-state truth
- operator review actions that mutate backed moderation state
- creator/operator boundary rules for what report detail may surface in creator context
- moderation workflow support-status discipline where useful
- operator queue shaping beyond a raw recent-report list
- durable enforcement history if the product later supports it

## 7. Exact Helper / Read-Model Layer Needed

### 7.1 Keep Current Ownership
- `_lib/moderation.ts` remains the core moderation helper owner
- `_lib/channelReadModels.ts` remains the creator-side safety/admin summary owner

### 7.2 Likely Next Narrow Layer
The next narrow implementation lanes in this chapter, if supported by audit truth, should stay within:
- `_lib/moderation.ts` for helper normalization or narrowly scoped operator actions
- `_lib/channelReadModels.ts` for creator summary normalization
- `app/admin.tsx` for operator workflow adoption
- `app/channel-settings.tsx` for creator-side summary adoption only where honest

Do not create a broad new moderation subsystem owner unless the audit proves the current owners cannot carry the next narrow workflow truth.

## 8. Exact Phased Implementation Order

1. Safety / moderation doctrine-spec pass.
2. Current safety/moderation truth audit.
3. Minimum foundation pass only if current helper/schema truth is insufficient for the next honest workflow slice.
4. Creator/operator surface adoption only for currently backed workflow.
5. Chapter closeout audit.
6. One final narrow moderation batch only if clearly justified.
7. Chapter closeout / next chapter handoff.

## 9. What Not To Do
- do not fake strikes
- do not fake appeals or disputes
- do not fake report resolution
- do not fake creator moderation controls
- do not imply that audience blocks are the moderation system
- do not create route drift
- do not create `/studio*` moderation routes
- do not imply queue state that current schema does not back
- do not expose private report or blocked-audience data on the public profile route

## 10. Current Doctrine Vs Later-Phase Ideas

### 10.1 Current Doctrine
Current doctrine supports:
- report intake
- route-aware report context
- operator/admin review gating
- creator-side safety/admin summary
- official-account audit identity

### 10.2 Later-Phase Ideas
Later only, unless explicitly backed by future chapter work:
- moderation case states and resolution workflow
- assignment and escalation queues
- creator-visible enforcement history
- strikes or penalty ladders
- disputes or appeals
- trust scores
- moderator notes and audit trails beyond current report context
