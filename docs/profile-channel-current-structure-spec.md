# Chi'llywood Profile / Channel Current-Structure Spec

## Purpose
This document saves the repo-aligned profile/channel doctrine and current-structure implementation spec for Chi'llywood without changing route ownership or app structure.

It is doctrine/spec text only.

It does not:
- create `app/studio/*`
- create `app/admin/*`
- invent a separate profile model
- invent a separate channel tree
- promote `/communication` into canonical room architecture

This document works alongside:
- `MASTER_VISION.md`
- `ARCHITECTURE_RULES.md`
- `PRODUCT_DOCTRINE.md`
- `CURRENT_STATE.md`
- `NEXT_TASK.md`
- `docs/public-v1-blueprint.md`

## Locked Truth
- `app/profile/[userId].tsx` stays the single canonical public-facing profile/channel owner.
- `app/channel-settings.tsx` stays the current management / studio-equivalent owner.
- `/chat` and `/chat/[threadId]` stay the only canonical Chi'lly Chat routes.
- `/watch-party/[partyId]` and `/watch-party/live-stage/[partyId]` stay the live/watch-party targets opened from profile actions.
- `/communication` stays compatibility-only and must not become the canonical room or chat architecture.
- Profile and channel remain one identity system. Current truth is still `UserProfile` plus `UserChannelProfile`, not a second profile model.
- Rachi stays on the canonical profile/chat system via the official-account layer in `_lib/officialAccounts.ts`.

## Governing Repo Truth Restatement
- Chi'llywood remains one premium social streaming platform with locked Party / Live / Profile / Chi'lly Chat semantics.
- Profiles remain Chi'llywood's social identity hubs and may grow into each user's mini streaming platform or creator channel without replacing the base profile experience.
- Chi'lly Chat remains the native messenger system on `/chat` and `/chat/[threadId]`; profile should hand off into that system, not absorb it.
- `Watch-Party Live`, `Live Watch-Party`, and `Live First` remain distinct labels with distinct meanings.
- Party and Live room entry must stay on their current canonical watch-party routes.
- Runtime/admin config must not rename locked product labels such as `watchPartyLabel`, `liveRoomTitle`, or `partyRoomTitle`.

## Current Screen Map
- Public profile/channel owner: `app/profile/[userId].tsx`
- Current management / studio-equivalent owner: `app/channel-settings.tsx`
- Chi'lly Chat inbox: `app/chat/index.tsx`
- Chi'lly Chat direct thread: `app/chat/[threadId].tsx`
- Party Room target: `app/watch-party/[partyId].tsx`
- Live Room / Live Stage target: `app/watch-party/live-stage/[partyId].tsx`
- Settings target: `/settings`
- Support target: `getSupportRoutePath()` from `_lib/runtimeConfig.ts`

## Current Backend / Data Truth
The current structure already has enough truth to support a unified profile/channel surface without inventing a new model.

### Identity And Channel Objects
Current identity/channel truth in `_lib/userData.ts`:

```ts
type UserProfile = {
  username: string;
  avatarIndex: number;
  displayName?: string;
  avatarUrl?: string;
  tagline?: string;
  channelRole?: "viewer" | "host" | "creator";
  defaultWatchPartyJoinPolicy?: JoinPolicy;
  defaultWatchPartyReactionsPolicy?: ReactionsPolicy;
  defaultWatchPartyContentAccessRule?: ContentAccessRule;
  defaultWatchPartyCapturePolicy?: CapturePolicy;
  defaultCommunicationContentAccessRule?: ContentAccessRule;
  defaultCommunicationCapturePolicy?: CapturePolicy;
};

type UserChannelProfile = {
  id: string;
  displayName: string;
  avatarUrl?: string;
  tagline?: string;
  role: "viewer" | "host" | "creator";
  isLive: boolean;
  identityKind: "member" | "official_platform";
  officialBadgeLabel?: string;
  platformOwnershipLabel?: string;
  platformRoleLabel?: string;
  isProtectedFromClaim: boolean;
  handle?: string;
  auditOwnerKey?: string;
};
```

### Official Platform Account Truth
Current official-account truth in `_lib/officialAccounts.ts`:

```ts
type OfficialPlatformAccount = {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  handle: string;
  tagline: string;
  channelRole: "viewer" | "host" | "creator";
  officialBadgeLabel: string;
  platformOwnershipLabel: string;
  platformRoleLabel: string;
  auditOwnerKey: string;
  conciergeHeadline: string;
  trustSummary: string;
  starterWelcomeBody: string;
  starterPrompts: readonly string[];
  guidanceTopics: readonly string[];
};
```

### Creator Access / Monetization Capability Truth
Current creator-capability truth in `_lib/monetization.ts`:

```ts
type CreatorPermissionSet = {
  userId: string;
  canUsePartyPassRooms: boolean;
  canUsePremiumRooms: boolean;
  canPublishPremiumTitles: boolean;
  canUseSponsorPlacements: boolean;
  canUsePlayerAds: boolean;
  updatedAt: number;
};
```

### App Config Truth
Current feature and branding truth in `_lib/appConfig.ts`:

```ts
type AppConfig = {
  theme: AppThemeConfig;
  home: HomeConfig;
  branding: BrandingConfig;
  features: AppRuntimeFeatures;
  monetization: AppMonetizationRuntimeFeatures & {
    defaultSponsorLabel: string;
    premiumUpsellTitle: string;
    premiumUpsellBody: string;
  };
  roomDefaults: RoomDefaultConfig;
};
```

## Current Owner Responsibilities

### `app/profile/[userId].tsx`
This route already acts as the unified public-facing profile/channel owner.

Current route truth already supports:
- self profile
- other-user public profile
- official platform profile
- owner-only controls on the same canonical route
- Chi'lly Chat handoff
- linked room re-entry when live/party context exists

Current in-file state and models that should remain the seed of the public profile/channel implementation:
- `profile`
- `channelSignals`
- `channelHelper`
- `quickActions`
- `profileSections`
- `contentSections`
- `ownerSections`
- `activeProfileView`

Current top-level route mode truth:

```ts
type ProfileScreenMode = "owner" | "profile" | "channel";
```

This route should continue to own:
- the public channel home
- the owner hybrid view on the same route
- official-platform presentation
- live/watch-party re-entry buttons
- Chi'lly Chat entry

This route should not become:
- a separate settings app
- a separate inbox
- a ghost room
- a second creator app

### `app/channel-settings.tsx`
This route stays the current management / studio-equivalent owner.

Current exact panel truth already present:
- `Channel Identity`
- `Watch Party Defaults`
- `Communication Defaults`

Current save flow truth:
- reads and writes `UserProfile`
- respects `CreatorPermissionSet`
- sanitizes room access defaults against backend creator permissions

This route should remain the place where the current structure grows toward:
- identity
- access & monetization
- design
- layout
- content
- audience
- analytics
- safety

without inventing `app/studio/*`.

## Current-Structure Public Profile / Channel Spec

### Route
- `/profile/[userId]`

### Route Purpose
One canonical public-facing identity surface that combines:
- the person
- their public channel identity
- their live/watch-party context when applicable
- owner-mode controls when the viewer is the owner

### Top Bar
This remains owned by `app/profile/[userId].tsx`.

Current-structure interpretation:
- left: back
- center: compact channel/profile title
- right: profile/share/report/settings/manage-channel actions depending on self/other/official state

### Hero
This remains inside the canonical profile route.

Current-structure hero responsibilities:
- avatar or identity mark
- display name
- handle
- tagline
- role label
- official label when applicable
- live status badge
- linked-room badge when applicable

This hero should continue evolving toward a premium channel-destination feel without splitting profile into a second route tree.

### Identity / Stats Row
In the current structure this should extend the existing `channelSignals` grid rather than inventing a second stats subsystem first.

Near-term row contents should map onto currently available truth:
- role
- saved count for self owner mode
- continue-watching count for self owner mode
- room linked / live / official state

Later profile/channel counters can expand here:
- followers
- subscribers
- posts
- clips
- live sessions

### Primary Action Row
This remains in `app/profile/[userId].tsx`.

Current structure already supports:
- `Manage Channel`
- `Join Live`
- `Watch Party`
- `Chi'lly Chat`
- `Settings`
- `Support`
- `Report`

This row should become the high-value conversion and transition surface for:
- live entry
- watch-party entry
- message entry
- subscribe / premium access later

without moving those actions to a second app shell.

### Public Channel Tabs
Do not create new routes for these. Keep them as internal tab state inside the canonical profile owner.

Recommended current-structure tab state:

```ts
type ChannelPublicTab = "home" | "content" | "live" | "community" | "about";
```

These tabs should live inside `activeProfileView === "channel"` rather than replacing the existing route.

### Home Tab
This should become the curated channel front page within the same route.

Bounded block order for current structure:
1. Hero
2. Identity / stats row
3. Primary action row
4. Featured spotlight
5. Live module
6. Clips shelf
7. Collections shelf
8. Premium / subscriber shelf
9. Community preview
10. About block

### Content Tab
This should remain an internal channel tab on `/profile/[userId]`.

Current-structure role:
- organized media and relationship catalog
- future clips / collections / replays / premium labels
- owner-side feature / lock / archive controls later

### Live Tab
This should remain an internal channel tab on `/profile/[userId]`.

Current-structure role:
- live now state
- upcoming sessions later
- watch-party session distinctions
- replay / past session inventory later

The tab must preserve the repo-locked label distinctions:
- `Watch-Party Live`
- `Live Watch-Party`

### Community Tab
This should remain an internal channel tab on `/profile/[userId]`.

Current-structure role:
- posts
- social updates
- reactions
- community preview and community identity

It should keep profile as a social hub rather than collapsing the surface into a storefront.

### About Tab
This should remain an internal channel tab on `/profile/[userId]`.

Current-structure role:
- bio / channel summary
- tags and category identity later
- access model explanation later
- subscription / premium explanation later
- rules and channel expectations later

## Owner Mode On The Same Profile Route
Owner mode should stay on the same `/profile/[userId]` owner and should not require a route-mode split into a second app.

Current route already supports an owner-specific surface through:
- `activeProfileView === "owner"`
- owner quick actions
- manage-channel CTA
- settings CTA
- support CTA
- owner-only helper copy

Near-term owner-mode extensions should stay here:
- owner stats ribbon
- quick action cards
- alerts / incomplete setup prompts
- Studio entry pointing to `/channel-settings`

This preserves the current doctrine:
- public page and owner desk are one canonical route
- messaging stays separate in Chi'lly Chat
- settings stay separate from profile identity

## Current-Structure Management / Studio-Equivalent Spec

### Route
- `/channel-settings`

### Route Purpose
Current management / studio-equivalent owner for creator/channel configuration in the existing app structure.

### Current Panels
- `Channel Identity`
- `Watch Party Defaults`
- `Communication Defaults`

### Next Sections To Add On This Same Route
These should be additive subsections or segmented sections on `app/channel-settings.tsx`, not new routes.

- Identity
- Access & Monetization
- Design
- Layout
- Content
- Audience
- Analytics
- Safety

### Exact Current-Structure Mapping
- `Identity` maps directly onto current `UserProfile` identity fields.
- `Access & Monetization` maps onto `CreatorPermissionSet` plus access defaults already sanitized by `_lib/monetization.ts`.
- `Design` and `Layout` are approved future sections on the same route, using current app-config/theme/profile truth rather than a second channel tree.
- `Content`, `Audience`, `Analytics`, and `Safety` are future sections that should grow on this same owner until the repo doctrine intentionally changes.

## Route Targets That Must Remain Unchanged
- Messaging target from profile: `/chat` or `/chat/[threadId]`
- Live target from profile: `/watch-party/live-stage/[partyId]`
- Watch-party target from profile: `/watch-party/[partyId]`
- Settings target from profile: `/settings`
- Support target from profile: `getSupportRoutePath()`
- Manage Channel / current Studio target from profile: `/channel-settings`

## Recommended Component Extraction Within Current Structure
These are component names for future extraction only. They do not change route structure.

### Public Profile / Channel Owner Components
- `components/profile/profile-top-bar.tsx`
- `components/profile/profile-hero-card.tsx`
- `components/profile/profile-stats-row.tsx`
- `components/profile/profile-primary-action-row.tsx`
- `components/profile/profile-mode-switch.tsx`
- `components/channel/channel-tab-strip.tsx`
- `components/channel/channel-home-tab.tsx`
- `components/channel/channel-content-tab.tsx`
- `components/channel/channel-live-tab.tsx`
- `components/channel/channel-community-tab.tsx`
- `components/channel/channel-about-tab.tsx`
- `components/channel/channel-signal-grid.tsx`
- `components/channel/channel-helper-card.tsx`
- `components/channel/channel-section-card.tsx`
- `components/channel/channel-quick-actions-card.tsx`

### Current Management / Studio-Equivalent Components
- `components/channel-settings/channel-settings-header.tsx`
- `components/channel-settings/channel-identity-panel.tsx`
- `components/channel-settings/watch-party-defaults-panel.tsx`
- `components/channel-settings/communication-defaults-panel.tsx`
- `components/channel-settings/channel-access-panel.tsx`
- `components/channel-settings/channel-design-panel.tsx`
- `components/channel-settings/channel-layout-panel.tsx`
- `components/channel-settings/channel-audience-panel.tsx`
- `components/channel-settings/channel-analytics-panel.tsx`
- `components/channel-settings/channel-safety-panel.tsx`

These names are structure-safe because they preserve the current owners:
- public owner stays `app/profile/[userId].tsx`
- management owner stays `app/channel-settings.tsx`

## Current-Structure View Models
These additive view models fit the current route ownership without inventing a new backend model.

```ts
type ProfileRouteContext = {
  userId: string;
  currentUserId: string;
  isSelfProfile: boolean;
  isOfficialProfile: boolean;
  hasLiveRouteContext: boolean;
  partyId?: string;
  mode?: string;
  source?: string;
};

type ProfileHeroModel = {
  profile: UserChannelProfile;
  roleLabel: string;
  channelLabel: string;
  channelHandle: string;
  liveStateLabel: string;
  routeContextLabel: string;
};

type ProfileStatsModel = {
  savedTitleCount?: number;
  continueWatchingCount?: number;
  followersCount?: number | null;
  subscribersCount?: number | null;
  postsCount?: number | null;
  clipsCount?: number | null;
};

type ProfileActionModel = {
  label: string;
  kind:
    | "manage_channel"
    | "studio"
    | "settings"
    | "support"
    | "message"
    | "live"
    | "watch_party"
    | "report";
  targetRoute?: string;
  disabled?: boolean;
};

type ChannelSectionModel = {
  id: string;
  title: string;
  kicker: string;
  body?: string;
  accent?: "default" | "live" | "official" | "locked";
};
```

## Important Current Gaps Vs Your Blueprint
- Current profile data does not yet carry banner image, motion hero, video avatar, bio, city/region, tags, follower count, subscriber count, posts, clips, collections, or community feed as first-class route-ready fields.
- Current profile route is still driven mainly by route params plus `buildUserChannelProfile(...)`, with owner-only saved/resume counts from `_lib/userData.ts`.
- Current management route only persists identity plus room-default fields through `readUserProfile()` and `saveUserProfile()`.
- Current creator monetization-capability truth is still `readCreatorPermissions()`; it is not yet a full channel monetization CMS.
- Current app config can influence feature and branding visibility, but locked product naming cannot be runtime-overridden.
- So the supplied profile/channel blueprint is valid doctrine, but in the current structure it must land as additive UI/view-model work on the same two owners, not as:
  - a new `/studio` tree
  - a separate channel app
  - a second profile model
  - a separate channel table/tree

## Screen-By-Screen Translation Into Current Structure

### `/profile/[userId]`
- Keep `owner / profile / channel` as the top-level route mode.
- Inside `channel`, build the public `Home / Content / Live / Community / About` strip as internal state.
- Keep:
  - hero
  - identity/stats
  - primary action row
  - featured
  - live module
  - premium
  - community preview
  - about
  all on this same canonical route.
- `Studio` on this route should remain a CTA that opens `/channel-settings` until route doctrine changes.

### `/channel-settings`
- This remains the current studio-equivalent owner in repo truth.
- It should grow by sections and panels rather than by new routes.
- Add:
  - identity
  - access & monetization
  - design
  - layout
  - content
  - audience
  - analytics
  - safety
  as additive management sections here.

### `/chat` and `/chat/[threadId]`
- Remain the only messaging targets opened from the profile action row.

### `/watch-party/[partyId]` and `/watch-party/live-stage/[partyId]`
- Remain the only live/watch-party destinations opened from the profile action row.

## Best Current-Structure Build Order
- Stage 1: expand `app/profile/[userId].tsx` with public channel tabs and the MVP public block order inside `activeProfileView === "channel"`
- Stage 2: strengthen existing owner mode on that same route with stats, quick actions, and setup prompts
- Stage 3: expand `app/channel-settings.tsx` into the current management / studio-equivalent owner
- Stage 4: add access and monetization sections there using `CreatorPermissionSet` and `AppConfig`
- Stage 5: add audience, analytics, and safety there, still without changing route structure

## Final Doctrine Check
This current-structure spec preserves all repo truth:
- one canonical `/profile/[userId]`
- one current management owner at `/channel-settings`
- no `app/studio/*`
- no separate profile model
- no separate channel tree
- no `/communication` promotion
- no change to canonical Chi'lly Chat routes
- no change to canonical watch-party/live targets
