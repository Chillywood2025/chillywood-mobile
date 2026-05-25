# Chi'llywood Profile / Platform Implementation Spec

2026-05-06 current-route note: this older implementation spec is superseded where it says Profile and Channel share one public route or where it treats `/channel-settings` as the primary studio route. Current truth is Profile = `/profile/[userId]`, public Channel = `/channel/[userId]`, owner Platform Studio = `/channel-studio`, and `/channel-settings` compatibility must remain.

2026-05-25 terminology note: user-facing Profile copy must say `Platform` for the public creator/channel surface and `Platform Studio` for owner tools. The internal `/channel/[userId]` route and channel-named database/helpers remain stable unless a separate migration/route lane proves a safe rename.

2026-05-25 viewer-state proof note: Android `R5CR120QCBF` proof closed the available signed-out, signed-in non-owner, owner-regression, public Platform routing, and Chi'lly Chat smoke. Signed-out public Profile has no owner controls/composer/Attach/delete/draft badges; Follow and Chi'lly Chat show sign-in-required handoffs; View Platform opens public Platform without Studio/drafts. Signed-in non-owner proof used the available authenticated account against the official Rachi Profile because no true second-account credential was available. Blocked/private runtime fixtures were unavailable and were not faked; the current source/guard proof relies on `resolveProfilePrivacyAccess`, `canViewFullProfile`, blocked Chi'lly Circle guards, public Platform `isViewerBlocked`, and `includeDrafts: false` until a safe-fixture lane runs. Validation passed with the requested type/runtime/Profile/payment/creator/Clip/Brand/Watch-Party/provider guard stack, targeted Profile grep/static proof, and diff whitespace checks.

## 1. Purpose And Scope
This document translates the full profile/channel product blueprint into the current Chi'llywood repo structure.

It is implementation doctrine, not UI code.

It exists to:
- preserve Profile as the canonical personal/social identity surface
- preserve public Platform as the canonical viewer-facing creator/channel surface
- preserve Platform Studio as the owner-only creator operating system
- keep `/channel-settings` compatibility working for older links
- map larger studio ideas into current sections and later-phase possibilities without silently making extra route families active
- preserve Chi'lly Chat, Watch-Party Live, and Live Watch-Party doctrine exactly as already locked
- define the exact phased build order for future implementation passes

This spec does not:
- change current route truth
- add UI implementation
- change schema or remote DB state
- create `/studio`, `/studio/identity`, `/studio/design`, `/studio/layout`, `/studio/content`, `/studio/access`, `/studio/audience`, `/studio/analytics`, or `/studio/safety` as active routes

## 2. Governing Current Route Truth
### 2.1 Canonical Current Routes
| Route | Current Owner File | Current Doctrine |
| --- | --- | --- |
| `/profile/[userId]` | `app/profile/[userId].tsx` | Personal/social Profile surface for self, other-user, and official identity. |
| `/channel/[userId]` | `app/channel/[userId].tsx` | Public viewer-facing Platform surface. |
| `/channel-studio` | `app/channel-studio/index.tsx` | Preferred owner-only Platform Studio. |
| `/channel-settings` | `app/channel-settings.tsx` | Compatibility route for older owner Platform Studio links. |
| `/chat` | `app/chat/index.tsx` | Canonical Chi'lly Chat inbox. |
| `/chat/[threadId]` | `app/chat/[threadId].tsx` | Canonical direct-thread and thread-based call surface. |
| `/watch-party/[partyId]` | `app/watch-party/[partyId].tsx` | Canonical Party Room route. |
| `/watch-party/live-stage/[partyId]` | `app/watch-party/live-stage/[partyId].tsx` | Canonical Live Room / Live Stage route. |

### 2.2 Locked Label And Surface Truth
| Locked Label | Meaning | Owner Surface |
| --- | --- | --- |
| `Watch-Party Live` | Title/player-driven watch-together flow | Player, title, party-flow entry |
| `Live Watch-Party` | Home/live-flow label and live social viewing mode | Home, Live Room |
| `Live First` | Creator/live-room style live mode | Live Room |
| `Chi'lly Chat` | Native messaging layer | `/chat`, `/chat/[threadId]`, profile communication entry |

Do not mix `Watch-Party Live` and `Live Watch-Party`.

### 2.3 Current Cross-Surface Preservation Rules
- `/profile/[userId]` is identity/social presentation, not a room and not an inbox.
- `/channel/[userId]` is public Platform presentation, not an owner console.
- `/channel-studio` is the owner Platform Studio; `/channel-settings` is compatibility.
- `/chat` and `/chat/[threadId]` remain the only canonical standalone Chi'lly Chat routes.
- `app/communication/index.tsx` and `app/communication/[roomId].tsx` remain compatibility-only, not new user-facing route truth.
- Rachi remains on canonical `/profile/[userId]` and canonical Chi'lly Chat routes.

## 3. Public Profile And Platform Surfaces
### 3.1 Route Ownership
Current Profile route owner:
- `app/profile/[userId].tsx`

Current public Platform route owner:
- `app/channel/[userId].tsx`

Owner Platform Studio route:
- `app/channel-studio/index.tsx`
- `app/channel-settings.tsx` implementation/compatibility

Future extraction is allowed only as supporting component files under those route owners. Route truth does not change.

### 3.2 Public Surface Purpose
`/profile/[userId]` is Chi'llywood's personal/social identity surface. `/channel/[userId]` is the public creator Platform surface.

Profile must answer:
1. Who is this person, creator, or official presence?
2. What social/Profile activity and identity signals are public-safe?
3. What should the visitor do next from the Profile?

Public Platform must answer:
1. What media, live/upcoming, audience signals, and about details define this Platform?
2. What public creator videos are playable?
3. What should the viewer do next from the Platform?

It must not become:
- a second inbox
- a hidden settings page
- a duplicate room
- a disconnected creator app

### 3.3 MVP Top-To-Bottom Section Order
The current unified public route should evolve toward this stable order:
1. Hero section
2. Identity and stats row
3. Primary action row
4. Owner-only ribbon or official ribbon when applicable
5. Tab strip
6. Active tab content

### 3.4 Hero Section
The hero section on `/profile/[userId]` owns:
- background artwork or branded image treatment
- avatar
- display name
- handle
- tagline
- official/live/linked-context badges
- short Platform identity framing

Hero rules:
- self, other-user, and official states must remain unmistakable
- official markers must stay explicit for Rachi and future protected official accounts
- linked room context may appear here, but the hero must not pretend profile is the room itself

### 3.5 Identity And Stats Row
The identity/stats row owns:
- role label or official identity signal
- current live or room-context signal
- meaningful real counts or real channel signals only
- no fake follower/subscriber inflation

Preferred real-signal order:
1. role or official identity
2. live or linked-room state
3. real content/community signal available in the route context

Examples of acceptable current-surface signals:
- creator video counts
- public creator event counts
- official/trusted markers
- room-linked readiness
- public content counts when real

### 3.6 Primary Action Row
The primary action row on `/profile/[userId]` owns:
- `Chi'lly Chat`
- live entry when real live context exists
- watch-party entry when real party context exists
- owner-only `Platform Studio` when the viewer is the owner

Primary action rules:
- messaging must hand off to `/chat` or `/chat/[threadId]`
- room entry must hand off to real party/live routes only when real room context exists
- owner management must hand off to `/channel-studio`
- no fake follow, subscribe, or monetization CTA should appear until backed by real doctrine and implementation

### 3.7 Tab Strip
The canonical Profile tab strip is:
- `Posts`
- `Platform`
- `Live`
- `Community`
- `About`

The tab strip stays on `/profile/[userId]`.
It does not create separate route truth by default.

### 3.8 Home Tab Responsibilities
The Home tab is the curated overview tab.

Curated block order for MVP:
1. Featured spotlight
2. Live module
3. Content shelves
4. Community preview
5. About snapshot

Home tab rules:
- this is the summary tab, not the exhaustive library tab
- it should guide the user into the right next surface quickly
- it should prefer real channel signals over filler

### 3.9 Content Tab Responsibilities
The Content tab owns the channel library behavior.

It should hold:
- channel-owned or channel-curated titles
- featured collections or rows
- liked/saved/public content relationships where policy allows
- honest empty states when a creator has not built deeper programming yet

Content tab rules:
- do not fake uploads or catalogs
- prefer real titles, saved items, liked items, public activity, or curated rows
- keep rendering behavior honest when content depth is still shallow

### 3.10 Live Tab Responsibilities
The Live tab owns live-specific surfaces without collapsing live and party doctrine.

It must separate:
- live presence and Live Watch-Party entry
- watch-together / Watch-Party Live entry and continuity

Live tab block order:
1. Live status module
2. Current or recent live-room module
3. Watch-party continuity module
4. live/archive or future live programming notes when real

Live tab rules:
- `Live Watch-Party` and `Watch-Party Live` stay distinct
- live blocks must not be renamed with watch-party wording
- watch-party blocks must not pretend to be live-stage blocks

### 3.11 Community Tab Responsibilities
The Community tab owns channel-community framing without replacing Chi'lly Chat.

It should hold:
- public community summary
- public-facing social relationships where policy allows
- room/community follow-up cues
- public activity or public interaction modules when real
- direct `Chi'lly Chat` entry as a bounded communication CTA

Community tab rules:
- it can preview or stage community interaction
- it must not become the standalone inbox
- thread persistence still belongs to `/chat` and `/chat/[threadId]`

### 3.12 About Tab Responsibilities
The About tab owns durable profile/channel identity details.

It should hold:
- longer bio or channel description
- role identity
- official/trust markers
- public channel facts
- creator identity framing
- public-safe room or content context

About tab rules:
- it should make the channel legible even when content depth is still light
- it should not turn into a hidden settings form

## 4. Owner Mode On `/profile/[userId]`
### 4.1 Current Route Rule
Owner mode stays on `/profile/[userId]`.
It does not move to a different route.

### 4.2 What Owner Mode Adds
Owner mode adds:
- owner stats ribbon
- owner quick actions
- owner setup prompts
- owner-only guidance cards
- self-only management CTA to `/channel-settings`

### 4.3 What Owner Mode Shares With Public View
Owner mode still shares:
- hero
- identity
- action-row structure
- tab strip
- public channel presentation

### 4.4 Current Route Split
Preserve this split:
- owner-vs-public view switching
- Profile owner/public actions stay on `/profile/[userId]`
- public Channel preview/presentation stays on `/channel/[userId]`
- owner stats and quick actions stay in `/channel-studio`

`/channel-studio` should own deeper editing controls, not the entire owner identity surface. `/channel-settings` remains compatibility.

## 5. `/channel-studio` As The Current Platform Studio Control Center
Current route owner:
- `app/channel-studio/index.tsx`
- `app/channel-settings.tsx`

This route is the current studio-equivalent control center.
It should expand through internal sections, not silent route proliferation.

### 5.1 Section Map
| Section | Meaning In Current Chi'llywood Structure | Status |
| --- | --- | --- |
| Identity | display name, tagline, avatar treatment, creator role, official-safe identity framing | current section |
| Design | hero/background direction, channel accent style, visible branding treatment | near-term section |
| Layout | homepage block order, featured rows, shelf emphasis, default tab emphasis | near-term section |
| Content | featured titles, content shelves, spotlight selection, public activity curation | near-term section |
| Access & Monetization | watch-party access defaults, communication access defaults, premium/party-pass positioning, future paid-content controls | near-term section |
| Audience | public activity visibility, community posture, audience controls, future follower/fan controls | later-phase section |
| Analytics | channel performance, conversion, room/content engagement, owner insight surfaces | later-phase section |
| Safety/Admin | report posture, official identity protections, moderation/admin links, creator safety tools | later-phase section |

### 5.2 Current Section Architecture Under `/channel-settings`
Current repo truth already includes:
- `Channel Identity`
- `Watch Party Defaults`
- `Communication Defaults`

Those sections should become the first durable anchors for:
- Identity
- Access & Monetization
- later channel-control growth

### 5.3 Platform Studio Translation Rule
If the larger blueprint uses "studio" language, translate it as:
- a current section inside `/channel-settings`
- or a clearly labeled later-phase route possibility only

Do not silently convert "studio" into active route truth now.

## 6. Exact Current Component / Section Breakdown
This section defines the intended boundaries for future implementation under the current route structure.

### 6.1 `/profile/[userId]`
- `ProfileRouteScaffold`
- `ProfileHeroSection`
- `ProfileIdentityStatsRow`
- `ProfilePrimaryActionRow`
- `ProfileOwnerRibbon`
- `ProfileOfficialRibbon`
- `ProfileTabStrip`
- `ProfileHomeTab`
- `ProfileFeaturedSpotlightBlock`
- `ProfileLiveModule`
- `ProfileContentShelvesBlock`
- `ProfileCommunityPreviewBlock`
- `ProfileAboutSnapshotBlock`
- `ProfileContentTab`
- `ProfileLiveTab`
- `ProfileCommunityTab`
- `ProfileAboutTab`
- `ProfileOwnerQuickActions`
- `ProfileOwnerSetupPromptStack`

### 6.2 `/channel-settings`
- `ChannelSettingsScaffold`
- `ChannelSettingsSectionList`
- `ChannelIdentitySection`
- `ChannelDesignSection`
- `ChannelLayoutSection`
- `ChannelContentSection`
- `ChannelAccessMonetizationSection`
- `ChannelAudienceSection`
- `ChannelAnalyticsSection`
- `ChannelSafetyAdminSection`

### 6.3 Communication/Room Cross-Surface Boundaries To Preserve
- `ProfileChannelCommunicationEntry` may launch Chi'lly Chat, but it does not own thread UI
- `ProfileLinkedLiveEntry` may launch live flow, but it does not own Live Room
- `ProfileLinkedWatchPartyEntry` may launch party flow, but it does not own Party Room

## 7. Exact Data / View-Model Layer Needed
### 7.1 Profile Route Context
`ProfileRouteContext`
- `viewerUserId`
- `targetUserId`
- `isSelf`
- `isOfficial`
- `identityKind`
- `hasLinkedRoomContext`
- `linkedPartyId`
- `linkedMode`
- `sourceRoute`

### 7.2 Public Channel Hero Model
`PublicChannelHeroModel`
- `displayName`
- `handle`
- `avatarUrl`
- `heroImageUrl`
- `tagline`
- `roleLabel`
- `officialBadge`
- `liveStateLabel`
- `linkedContextLabel`

### 7.3 Stats Model
`ProfileStatsModel`
- `primarySignal`
- `secondarySignal`
- `tertiarySignal`
- `contentCount`
- `savedCount`
- `publicActivityCount`
- `liveReadiness`

Rule:
- only real counts/signals
- no fabricated social proof

### 7.4 Action Row Model
`ProfileActionRowModel`
- `primaryAction`
- `secondaryAction`
- `tertiaryAction`
- `ownerManageAction`
- `isLiveEntryEnabled`
- `isWatchPartyEntryEnabled`
- `chatTarget`

### 7.5 Tab Model
`ProfileTabModel`
- `key`
- `label`
- `isDefault`
- `isVisible`
- `emptyStateTitle`
- `emptyStateBody`

### 7.6 Home Tab Models
- `FeaturedSpotlightModel`
- `LiveModuleModel`
- `ContentShelfModel[]`
- `CommunityPreviewModel`
- `AboutSnapshotModel`

### 7.7 Content Tab Models
- `ContentLibraryModel`
- `ContentFilterModel`
- `ContentShelfModel[]`
- `ContentEmptyStateModel`

### 7.8 Live Tab Models
- `LiveStatusModel`
- `LiveRoomModuleModel`
- `WatchPartyContinuityModel`
- `LiveEmptyStateModel`

### 7.9 Community Tab Models
- `CommunitySummaryModel`
- `CommunityPreviewItemModel[]`
- `CommunityActionModel`
- `CommunityVisibilityModel`

### 7.10 About Tab Models
- `AboutIdentityModel`
- `ChannelFactsModel`
- `TrustMarkerModel[]`
- `AboutLongformModel`

### 7.11 Owner Mode Models
- `OwnerModeModel`
- `OwnerStatsRibbonModel`
- `OwnerQuickActionModel[]`
- `OwnerPromptModel[]`
- `OwnerChannelSetupState`

### 7.12 `/channel-settings` Section Models
- `ChannelSettingsSectionModel`
- `ChannelIdentitySettingsModel`
- `ChannelDesignSettingsModel`
- `ChannelLayoutSettingsModel`
- `ChannelContentSettingsModel`
- `ChannelAccessMonetizationSettingsModel`
- `ChannelAudienceSettingsModel`
- `ChannelAnalyticsSettingsModel`
- `ChannelSafetyAdminSettingsModel`

### 7.13 Cross-Cutting Access / Monetization Models
- `ChannelAccessModel`
- `ProfileEntitlementBadgeModel`
- `WatchPartyAccessModel`
- `LiveAccessModel`
- `CreatorMonetizationSummaryModel`

### 7.14 Audience / Analytics / Safety Models
- `AudienceSummaryModel`
- `AudienceVisibilityModel`
- `ChannelAnalyticsSummaryModel`
- `ChannelSafetySummaryModel`
- `OfficialIdentityProtectionModel`

### 7.15 Stage 5 Prerequisite Read Models
Stage 5 UI must not ship until these canonical read models are backed by honest repo/schema truth.

#### `ChannelAudienceReadModel`
| Field | Source of truth | Status |
| --- | --- | --- |
| `channelUserId` | route/helper input | already supported |
| `generatedAt` | helper runtime timestamp | derivable now |
| `followerCount` | `channel_followers` | derivable now with helper work |
| `subscriberCount` | `channel_subscribers` filtered to current subscriber statuses | derivable now with helper work |
| `pendingRequestCount` | `channel_audience_requests` filtered to `status='pending'` | derivable now with helper work |
| `blockedAudienceCount` | `channel_audience_blocks` | derivable now with helper work |
| `vipCount` | channel audience-role relationship table | later-phase only; requires new schema |
| `moderatorCount` | channel audience-role relationship table | later-phase only; requires new schema |
| `coHostCount` | channel audience-role relationship table | later-phase only; requires new schema |
| `publicActivityVisibility` | `user_profiles.public_activity_visibility` | derivable now with schema + helper work |
| `followerSurfaceEnabled` | `user_profiles.follower_surface_enabled` | derivable now with schema + helper work |
| `subscriberSurfaceEnabled` | `user_profiles.subscriber_surface_enabled` | derivable now with schema + helper work |

Canonical rule:
- `user_subscriptions` is account-tier entitlement truth, not creator/channel subscriber truth
- room participant state is room-scoped, not channel audience truth

#### `CreatorAnalyticsReadModel`
| Field | Source of truth | Status |
| --- | --- | --- |
| `channelUserId` | route/helper input | already supported |
| `generatedAt` | helper runtime timestamp | derivable now |
| `watchPartySessionsHosted` | `watch_party_rooms` filtered by `host_user_id` and `room_type='title'` | derivable now with helper work |
| `liveSessionsHosted` | `watch_party_rooms` filtered by `host_user_id` and `room_type='live'` | derivable now with helper work |
| `communicationRoomsHosted` | `communication_rooms` filtered by `host_user_id` | derivable now with helper work |
| `activeHostedRooms` | `watch_party_rooms.is_active` plus active `communication_rooms.status` | derivable now with helper work |
| `latestHostedActivityAt` | max `last_activity_at` across owned room tables | derivable now with helper work |
| `profileVisits` | creator-facing profile-visit aggregate | requires new backend/schema truth |
| `followerCount` | `channel_followers` | derivable now with helper work |
| `subscriberCount` | `channel_subscribers` filtered to current subscriber statuses | derivable now with helper work |
| `liveAttendanceTotal` | room attendance aggregate by creator | requires new backend/schema truth |
| `contentLaunches` | creator-owned title launch aggregate | requires new backend/schema truth |
| `continueWatchingReturns` | creator-owned content return aggregate | requires new backend/schema truth |
| `gatedSurfaceViews` | monetization conversion aggregate | requires new backend/schema truth |

Canonical rule:
- analytics event emission is not the same thing as creator-facing analytics reads
- current event sinks may support future aggregation, but they are not current summary truth
- `titles` has no creator ownership or performance counters that can support creator content analytics today

#### `ChannelSafetyAdminReadModel`
| Field | Source of truth | Status |
| --- | --- | --- |
| `actorRole` | `getModerationAccess(...)` | already supported |
| `canAccessAdmin` | `getModerationAccess(...)` | already supported |
| `canReviewSafetyReports` | `getModerationAccess(...)` and `platform_role_memberships` | already supported |
| `platformRoles` | `readMyPlatformRoleMemberships()` | already supported |
| `recentSafetyReports` | `readSafetyReports()` | already supported for operator/moderator identities |
| `recentSafetyReportCount` | derived from `readSafetyReports()` | derivable now with helper work |
| `isOfficial` | official-account truth | already supported |
| `auditOwnerKey` | official-account truth / moderation access | already supported |

Canonical rule:
- safety/admin can proceed later with helper-only work
- safety/admin does not unblock full Stage 5 by itself

#### Stage 5 blocker summary
Current repo truth now supports:
- audience helper/read-model surfaces built on the landed channel-audience relationship tables
- audience visibility defaults through `user_profiles.public_activity_visibility`, `user_profiles.follower_surface_enabled`, and `user_profiles.subscriber_surface_enabled`
- the current creator analytics helper slice backed by room/session truth

Remaining later-phase data gaps:
- creator-facing analytics aggregates beyond the current room/session + audience-linked helper slice

#### Channel audience relationship foundation

##### `channel_followers`
- Purpose: canonical channel follower relationship truth.
- Primary key / uniqueness: composite primary key on `(channel_user_id, follower_user_id)`.
- Required columns:
  - `channel_user_id`
  - `follower_user_id`
- Timestamps:
  - `followed_at`
  - `updated_at`
- Indexes:
  - `(channel_user_id, followed_at desc)`
  - `(follower_user_id, followed_at desc)`
- Ownership rules:
  - follower inserts their own row
  - follower or channel owner may remove the relationship
  - raw rows are visible only to the follower, the channel owner, or platform operators
- Current doctrine support:
  - supports truthful follower counts now
  - does not overbuild audience-role systems

##### `channel_subscribers`
- Purpose: canonical creator/channel subscriber relationship truth, distinct from account-tier `user_subscriptions`.
- Primary key / uniqueness: composite primary key on `(channel_user_id, subscriber_user_id)`.
- Required columns:
  - `channel_user_id`
  - `subscriber_user_id`
  - `status`
  - `source`
- Timestamps:
  - `started_at`
  - `expires_at`
  - `updated_at`
- Status fields:
  - `active`
  - `grace_period`
  - `canceled`
  - `expired`
  - `revoked`
- Indexes:
  - `(channel_user_id, status, updated_at desc)`
  - `(subscriber_user_id, status, updated_at desc)`
- Ownership rules:
  - raw rows are visible only to the subscriber, the channel owner, or platform operators
  - mutation is operator/service-sync only for now so the app cannot forge paid audience truth
- Current doctrine support:
  - supports truthful channel subscriber counts now
  - keeps creator/channel subscriptions separate from account-tier premium entitlements

##### `channel_audience_requests`
- Purpose: canonical pending audience request truth for private or approval-based channel relationships.
- Primary key / uniqueness:
  - identity primary key `id`
  - partial unique index on `(channel_user_id, requester_user_id, request_kind)` for `status='pending'`
- Required columns:
  - `channel_user_id`
  - `requester_user_id`
  - `request_kind`
  - `status`
- Timestamps:
  - `created_at`
  - `reviewed_at`
  - `updated_at`
- Status fields:
  - `pending`
  - `approved`
  - `declined`
  - `canceled`
- Indexes:
  - `(channel_user_id, status, created_at desc)`
  - `(requester_user_id, status, created_at desc)`
- Ownership rules:
  - requester creates their own pending request
  - channel owner or platform operator reviews it
  - raw rows are visible only to the requester, the channel owner, or platform operators
- Current doctrine support:
  - supports truthful pending-request counts now
  - keeps richer audience-routing or VIP-style workflows in later phases

##### `channel_audience_blocks`
- Purpose: canonical blocked-audience truth for channel-owned audience safety boundaries.
- Primary key / uniqueness: composite primary key on `(channel_user_id, blocked_user_id)`.
- Required columns:
  - `channel_user_id`
  - `blocked_user_id`
  - `blocked_by_user_id`
- Timestamps:
  - `blocked_at`
  - `updated_at`
- Optional fields:
  - `reason`
- Indexes:
  - `(channel_user_id, blocked_at desc)`
  - `(blocked_user_id, blocked_at desc)`
- Ownership rules:
  - channel owner or platform operator creates/removes the block
  - raw rows are visible only to the blocked user, the channel owner, or platform operators
- Current doctrine support:
  - supports truthful blocked-audience counts now
  - does not claim broader audience-role or moderation CRM depth yet

## 8. Exact Phased Implementation Order
### Stage 1 - Profile And Public Channel Route Split
Goal:
- preserve personal/social Profile on `/profile/[userId]`
- preserve public Channel on `/channel/[userId]`

Exact route/file owner(s):
- `app/profile/[userId].tsx`
- `app/channel/[userId].tsx`
- presentational support components only if extraction becomes necessary

Exact sections/components to build:
- hero section
- identity/stats row
- primary action row
- tab strip
- `Home` tab
- `Content` tab
- `Live` tab
- `Community` tab
- `About` tab

Exact data/view models needed:
- `ProfileRouteContext`
- `PublicChannelHeroModel`
- `ProfileStatsModel`
- `ProfileActionRowModel`
- `ProfileTabModel`
- tab-specific public models from section 7

Explicitly out of scope:
- owner-only expansion beyond minimal self-aware branching
- `/channel-settings` expansion
- monetization feature rollout
- new `/studio*` routes
- schema work

Acceptance criteria:
- `/profile/[userId]` reads as a personal/social Profile surface
- `/channel/[userId]` reads as a public mini streaming/network Channel surface
- `Chi'lly Chat` handoff remains canonical
- live/watch-party labels remain correct
- no owner-control leakage to other-user view

Proof requirements before moving on:
- self Profile and own public Channel render without collapsing into settings
- other-user Profile and public Channel render without owner leakage
- official route still reads as official/protected
- room-linked entry preserves canonical live/watch-party handoff labels

Likely risk areas / doctrine drift risks:
- accidentally preserving the current split-view chips as the final doctrine
- inventing fake follower/community stats
- mixing `Watch-Party Live` and `Live Watch-Party`
- allowing profile to feel like an inbox

### Stage 2 - Owner Mode On The Same Route
Goal:
- add owner-only control depth without leaving `/profile/[userId]`

Exact route/file owner(s):
- `app/profile/[userId].tsx`
- owner-mode support components if needed

Exact sections/components to build:
- owner stats ribbon
- owner quick actions
- owner setup prompts
- owner-only helper cards

Exact data/view models needed:
- `OwnerModeModel`
- `OwnerStatsRibbonModel`
- `OwnerQuickActionModel[]`
- `OwnerPromptModel[]`

Explicitly out of scope:
- moving owner mode to a separate app
- replacing `/channel-studio`
- deep analytics or monetization consoles

Acceptance criteria:
- owner mode is visibly richer in Platform Studio
- self-only actions remain self-only
- public presentation remains shared with owner mode
- `Platform Studio` routes to `/channel-studio`

Proof requirements before moving on:
- self route shows owner-only additions
- other-user route does not leak them
- official route stays protected

Likely risk areas / doctrine drift risks:
- treating owner mode like a separate app
- letting settings swallow profile identity

### Stage 3 - Platform Studio Expansion
Goal:
- make `/channel-studio` the durable current Platform Studio control center while preserving `/channel-settings` compatibility

Exact route/file owner(s):
- `app/channel-studio/index.tsx`
- `app/channel-settings.tsx`

Exact sections/components to build:
- section map for Identity
- section map for Design
- section map for Layout
- section map for Content
- section map for Access & Monetization
- section map for Audience
- section map for Analytics
- section map for Safety/Admin

Exact data/view models needed:
- `ChannelSettingsSectionModel`
- all section models from section 7.12

Explicitly out of scope:
- activating `/studio*` routes
- full analytics dashboards
- schema rewrites

Acceptance criteria:
- `/channel-studio` reads as a coherent control center
- `/channel-settings` remains compatibility
- current sections stay intact
- near-term and later-phase sections are clearly labeled

Proof requirements before moving on:
- current settings still save cleanly
- no route proliferation occurred
- no studio-route doctrine drift occurred

Likely risk areas / doctrine drift risks:
- silently spawning `/studio*` routes
- mixing public channel presentation into private settings

### Stage 4 - Access And Monetization
Goal:
- add profile/channel-facing access and monetization truth without hiding the rules

Exact route/file owner(s):
- `app/profile/[userId].tsx`
- `app/channel-settings.tsx`
- monetization helper owners as needed

Exact sections/components to build:
- access badges
- monetization summary cards
- creator access settings inside `/channel-settings`
- public entitlement cues where relevant

Exact data/view models needed:
- `ChannelAccessModel`
- `ProfileEntitlementBadgeModel`
- `WatchPartyAccessModel`
- `LiveAccessModel`
- `CreatorMonetizationSummaryModel`

Explicitly out of scope:
- payouts
- full checkout tooling
- ad-system rollout
- route proliferation

Acceptance criteria:
- access rules are visible and honest
- premium/party-pass semantics are not hidden
- public and owner views stay consistent with rights-aware doctrine

Proof requirements before moving on:
- blocked vs allowed states are intelligible
- live/watch-party labels remain distinct
- no fake monetization claims appear

Likely risk areas / doctrine drift risks:
- burying access rules
- overextending monetization before compliance/product readiness

### Stage 5 - Audience / Analytics / Safety
Goal:
- grow channel-community depth and owner insight without breaking current product boundaries

Current blocker:
- do not start Stage 5 UI until the audience helper/read-model layer implied by section `7.15` and the remaining creator-analytics aggregate truth are landed

Exact route/file owner(s):
- `app/profile/[userId].tsx`
- `app/channel-settings.tsx`
- linked admin/safety owners where already canonical

Exact sections/components to build:
- audience summary
- audience visibility controls
- analytics summary surfaces
- safety/admin section

Exact data/view models needed:
- `AudienceSummaryModel`
- `AudienceVisibilityModel`
- `ChannelAnalyticsSummaryModel`
- `ChannelSafetySummaryModel`
- `OfficialIdentityProtectionModel`

Explicitly out of scope:
- broad creator CRM
- separate admin studio rewrite
- disconnected moderation persona systems

Acceptance criteria:
- audience, analytics, and safety surfaces are role-aware
- public/private boundaries remain clear
- official-account protections remain intact

Proof requirements before moving on:
- self vs other vs official distinctions remain intact
- safety and report posture remains canonical
- analytics does not leak into public identity improperly

Likely risk areas / doctrine drift risks:
- exposing private metrics publicly
- creating a second admin/profile identity system

## 9. What Not To Do
Do not:
- split profile and channel into separate apps
- force hard mode switching as the primary product model
- freeform-design too early before route ownership and component boundaries are stable
- hide access or monetization rules behind vague copy
- mix `Watch-Party Live` and `Live Watch-Party`
- bury owner tools across many menus when `/channel-studio` and `/channel-settings` compatibility already own them
- silently create route truth that conflicts with canonical doctrine
- turn profile into an inbox
- turn profile into a room
- treat `/channel-settings` as permission to spawn `/studio*` now
- fabricate follower/subscriber/community counts

## 10. Current Doctrine vs Near-Term vs Later-Phase Ideas
| Bucket | Items |
| --- | --- |
| Current doctrine / should build now | Personal/social Profile on `/profile/[userId]`; public Channel on `/channel/[userId]`; owner Platform Studio on `/channel-studio`; `/channel-settings` compatibility; Platform Studio tabs Home, Content, Live, Audience, Insights, Brand; public Channel sections Hero, Featured, Latest Uploads, Live & Upcoming, About; `Chi'lly Chat` as the communication entry; locked `Watch-Party Live` and `Live Watch-Party` semantics; official Rachi behavior on canonical profile/chat/channel surfaces. |
| Near-term but not current route truth | Deeper backed Platform Studio controls, richer owner stats only when backed, stronger curated public Channel shelves only when backed, and audience summary refinement under existing routes. |
| Later-phase / planned only | Additional `/channel-studio/*` child routes, advanced creator tooling beyond current doctrine, deep audience tooling, full analytics suite, broader safety/admin surfaces, advanced creator monetization rollout, and platform-builder depth such as uploads/clips/lists/partnership modules when product doctrine intentionally promotes them. |

## 11. Execution Boundary
This document is the durable source of truth for future profile/channel implementation passes until the control files intentionally change again.

Current route truth remains unchanged after this spec:
- `/profile/[userId]` is the Profile route
- `/channel/[userId]` is the public Channel route
- `/channel-studio` is the preferred owner Platform Studio route
- `/channel-settings` remains compatibility
- `/chat` and `/chat/[threadId]` remain canonical Chi'lly Chat routes
- `Watch-Party Live` and `Live Watch-Party` remain distinct and locked
