# Public V1 And Later Systems Plan

Date: 2026-04-26

## SECTION 1 - Executive Summary And System Purpose

This document is the durable planning source for six major Chi'llywood systems that must be kept distinct while Public v1 hardening continues:

- Premium / Access Gates
- Moderation / Safety
- Creator-upload Watch-Party Linking
- Billing / Subscriptions
- Monetization
- Native Game Streaming

Chi'llywood is not just a video player. It is one premium social streaming platform combining Profile, Channel, Creator Media, Player, Watch-Party, Live, Chi'lly Chat, Premium, Admin, Safety, and later monetization. The systems in this plan exist so future work does not blur those owners, fake product behavior, or pull later-phase ideas into Public v1 before the backing truth exists.

Every future pass should separate these concepts:

- A route owner is the screen/file responsible for route behavior.
- A system owner is the domain logic responsible for rules.
- A backend owner is the table, storage bucket, RLS policy, API, or edge function that enforces truth.
- Buttons and toggles are not owners. They only trigger behavior owned by routes, helpers, and backend enforcement.

Public v1 must be honest. Do not show fake controls, fake access, fake upload, fake Watch-Party, fake roles, fake moderation, fake payout, fake purchase success, or fake monetization. If a feature is not backed, the UI should either hide it or present clear coming-soon / not-ready copy.

Current Public v1 truth:

- Brand is `Chi'llywood`.
- Every account has Profile + Channel.
- Profile is the person/social identity.
- Channel is the creator's mini streaming platform inside Profile/Channel, not a separate public route today.
- User/creator Channels show creator-owned uploads, videos, events, live/watch-party content, and backed creator shelves only.
- Chi'llywood Originals/platform titles belong to Home, Explore, dedicated Originals surfaces, platform title/player routes, and admin-managed title surfaces, not inside user/creator Channels as filler.
- `/profile/[userId]` is the public Profile/Channel surface.
- `/profile/[userId]` can include an owner-only creator-video upload composer without leaving the Profile.
- Profile's current mobile shape is identity-first and mobile-social: compact identity header, backed text-only personal Posts/status updates, Channel tab for creator uploads, and clear owner/public quick actions. It may reference modern social profile patterns without copying third-party branding or showing unbacked engagement.
- `/channel-settings` is the deeper owner control and management surface.
- Creator Media System foundation exists.
- Creator upload is Public v1 required.
- Creator-uploaded videos upload, save metadata/storage, show on Profile/Channel, and open the standalone premium Player through `/player/[id]?source=creator-video`.
- Creator videos use the same premium Player shell as platform/admin titles.
- Following-based Home discovery now uses real `channel_followers` to show public clean creator uploads from followed creators.
- Creator-video text comments are backed for standalone creator-video Player only.
- Creator-upload Watch-Party linking is implemented in code/local schema, including focused local RLS tightening for anonymous room access and premium-room membership writes, but Public v1 runtime proof still requires the remote Supabase migration chain and Android proof.
- Profile post media, Profile post comments/reactions, media comments, nested replies, reposts, polls, full Friends, close friends, and friend-only privacy are post-v1.
- Comment media upload is post-v1.
- Native game/video streaming is later phase.
- Paid/subscriber media, tips, coins, payouts, VIPs, and advanced creator studio are later phase.
- Premium/access gate proof is required for Watch-Party Live.
- Basic moderation/safety is required before public launch because creator uploads exist.
- Supabase/RLS proof is required before public launch. Focused local proof now passes for the current creator media, premium/billing, moderation, creator-event, notification, reminder, and Watch-Party room policy lanes; live Supabase proof is still required.

This plan does not create a code-level god system. Docs define ownership; routes, libs, backend policies, and proof artifacts enforce it.

## SECTION 2 - System Ownership Principles

### Profile System

Owns:

- public identity
- social identity presentation
- public Profile/Channel discovery surface
- self vs public viewer distinction
- public/owner visibility presentation
- text-only Profile posts/status updates through backed `profile_posts`
- owner-only creator-video upload composer that uses the Creator Media helper path
- Chi'lly Chat handoff from profile
- links into backed content, live, and channel surfaces

Must not own:

- creator video storage
- creator video editing/deletion logic
- deep creator-video management
- Profile post comments/reactions/media unless backed by a separate profile feed/comment system
- billing validation
- payout rules
- LiveKit token rules
- room authority

Interacts with:

- `/profile/[userId]`
- `/channel-settings`
- `/player/[id]`
- `/chat/[threadId]`
- Watch-Party and Live routes only through backed links

Future Codex should avoid:

- making Profile a management console
- leaking owner controls to public viewers
- using Profile as a place to fake subscriber/VIP/private content access
- bypassing Channel Settings for deeper creator management
- showing fake text-only posts, comments, reactions, or attachment feeds before a backed profile feed/comment system exists

### Channel System

Owns:

- creator/network surface
- channel posture
- channel defaults
- audience summary display
- owner handoff into Channel Settings
- the public creator platform feeling inside Profile

Must not own:

- raw payment validation
- platform/admin title programming
- Chi'llywood Originals/platform-title filler for user/creator Channels
- LiveKit media rendering
- Player playback internals

Interacts with:

- `/profile/[userId]`
- `/channel-settings`
- `_lib/channelReadModels.ts`
- `_lib/channelAudience.ts`
- `_lib/userData.ts`

Future Codex should avoid:

- inventing a second public channel route unless doctrine changes
- renaming Profile and Channel into separate identities
- relying on unbacked audience roles for upload security

### Channel Settings

Owns:

- signed-in owner controls
- profile/channel editing controls
- deep creator upload/manage controls
- channel defaults
- backed audience actions
- backed safety/admin summary display

Must not own:

- public viewing experience
- Player shell
- direct billing SDK internals
- global admin moderation queue

Interacts with:

- `app/channel-settings.tsx`
- `_lib/creatorVideos.ts`
- `_lib/channelReadModels.ts`
- `_lib/channelAudience.ts`
- `_lib/monetization.ts`

Future Codex should avoid:

- turning Channel Settings into platform admin
- showing unsupported VIP/mod/co-host/subscriber mutation as real
- making a button appear before its backend owner exists

Example: the Profile Upload Video button is allowed to open an owner-only creator-video composer that calls `_lib/creatorVideos.ts` and refreshes the Channel tab. The Posts tab owns text-only `profile_posts` updates/status posts, while Channel owns creator uploaded videos. `/channel-settings` still owns deeper management such as edit, publish/unpublish, delete, thumbnail URL, channel settings, and library review. `_lib/creatorVideos.ts` owns creator-video upload/read/write/delete behavior; Supabase `videos` and `creator-videos` storage enforce metadata/storage truth.

Creator Channels are allowed to carry movie-sized uploads, not only short clips. The Public v1 standard upload lane targets files larger than 50 MB and currently sets app/bucket intent to 5 GiB; Supabase's project Storage global file-size limit must be configured to match. If the product requires uploads beyond the standard upload path or needs stronger long-network reliability, add a backed resumable/TUS or S3 multipart lane before claiming full-size movie proof.

### Creator Media System

Owns:

- creator video upload
- creator video metadata
- creator video storage path
- creator video listing
- creator video edit/publish/unpublish/delete
- creator-video source resolution for Player
- draft/public owner/public visibility

Must not own:

- platform/admin `titles`
- Player shell layout
- Watch-Party room creation
- billing validation
- paid/subscriber access
- comment media upload
- native game streaming

Interacts with:

- `_lib/creatorVideos.ts`
- `app/channel-settings.tsx`
- `app/profile/[userId].tsx`
- `app/player/[id].tsx`
- `videos`
- `creator-videos` storage bucket

Future Codex should avoid:

- falling back to bundled sample video for creator uploads
- treating creator uploads as platform titles
- unlocking Watch-Party Live before creator-upload linking exists

### Player System

Owns:

- standalone video watching
- premium Player shell
- platform/admin title playback
- creator-video playback when route source is `creator-video`
- honest missing-source/unavailable states
- Watch-Party Live CTA surface for eligible sources

Must not own:

- upload
- storage writes
- metadata management
- creator management
- room membership authority
- billing purchase internals

Interacts with:

- `app/player/[id].tsx`
- `_lib/mediaSources.ts`
- `_lib/creatorVideos.ts`
- `_lib/monetization.ts`
- `components/monetization/access-sheet.tsx`

Future Codex should avoid:

- making Player a ghost room
- making Player own uploads
- falling back from creator-video routes to platform/admin titles
- masking access-denied as "not found"

### Watch-Party System

Owns:

- title/content group watching
- Party Waiting Room to Party Room handoff
- Party Room membership
- shared playback state
- room access checks
- host-controlled watch-together behavior

Must not own:

- Live Stage camera room behavior
- creator upload/storage
- raw billing SDK calls
- LiveKit token minting for Live Stage unless deliberately routed through room authority

Interacts with:

- `app/watch-party/index.tsx`
- `app/watch-party/[partyId].tsx`
- `app/player/[id].tsx`
- `_lib/watchParty.ts`
- `_lib/roomRules.ts`

Future Codex should avoid:

- letting Watch-Party routes drift into Live Stage
- using `/watch-party/live-stage/[partyId]` for title watch-party playback
- creating a fake room when the source is missing

### Live Stage / LiveKit System

Owns:

- live camera rooms
- Live Room / Live Stage route behavior
- `Live First`
- `Live Watch-Party`
- LiveKit room connection
- participant camera/mic truth
- route-local stage lifecycle

Must not own:

- platform title playback
- creator uploaded video Watch-Party linking
- paid media
- creator video upload
- channel audience roster roles

Interacts with:

- `app/watch-party/live-stage/[partyId].tsx`
- `components/watch-party-live/livekit-stage-media-surface.tsx`
- `_lib/livekit/*`
- room membership tables

Future Codex should avoid:

- treating LiveKit token role as a durable channel audience role
- using Live Stage for Party Room playback
- assuming `500+` joined presence means `500+` equal camera feeds

### Premium / Access Gate System

Owns:

- signed-in access checks
- premium entitlement checks
- route guards
- deep-link protection
- expired/canceled handling
- blocked access copy

Must not own:

- raw payment SDK purchase internals
- creator upload
- Player shell
- LiveKit token minting
- admin title creation
- creator payouts

Interacts with:

- `_lib/monetization.ts`
- `_lib/revenuecat.ts`
- `_lib/roomRules.ts`
- `_lib/watchParty.ts`
- title/player/room route owners
- `components/monetization/access-sheet.tsx`

Future Codex should avoid:

- enforcing Premium only by hiding buttons
- trusting stale local cache for protected actions
- granting access when entitlement state is unknown

### Billing / Subscription System

Owns:

- purchase flow
- restore purchase
- receipt/token validation
- subscription status
- entitlement writes
- subscription event storage
- expiration/grace/revocation handling

Must not own:

- Player UI
- creator video upload
- room route behavior by itself
- creator payouts
- paid creator content access later

Interacts with:

- `_lib/revenuecat.ts`
- `_lib/monetization.ts`
- future `_lib/billing.ts`
- future backend receipt validation
- `user_subscriptions` today
- future entitlement tables

Future Codex should avoid:

- treating local store state as final authority
- putting service keys in the app
- collapsing app-store subscription billing into creator payout infrastructure

### Moderation / Safety System

Owns:

- report intake
- report context
- safety queue visibility
- admin review visibility
- block/ban/mute rules where backed
- moderation state
- takedown and restore workflows when built
- audit trail for safety-sensitive actions

Must not own:

- video upload itself
- Player shell
- billing
- creator payouts
- LiveKit media rendering

Interacts with:

- `_lib/moderation.ts`
- `components/safety/report-sheet.tsx`
- `app/admin.tsx`
- report-entry route owners
- `safety_reports`
- `platform_role_memberships`

Future Codex should avoid:

- pretending the current recent-report queue is a complete case-management system
- showing non-backed strikes/disputes/appeals
- letting creators remove reports against themselves

### Monetization System

Owns:

- full business model
- Premium positioning
- paid creator content later
- tips/coins later
- ads later
- platform revenue share later
- fee rules later
- creator earnings ledger later
- payouts later through a separate payout system

Must not own:

- raw payment validation alone
- video upload storage
- normal Player rendering
- basic Watch-Party routing
- moderation enforcement
- native game capture

Interacts with:

- `PRODUCT_DOCTRINE.md`
- `_lib/monetization.ts`
- future `_lib/creatorEarnings.ts`
- future `_lib/walletLedger.ts`
- future `_lib/payouts.ts`
- future admin monetization screens

Future Codex should avoid:

- fake tips
- fake balances
- fake paid unlocks
- fake payout readiness

### Native Game Streaming System

Owns later:

- screen/game capture
- stream start/end
- encoding/bitrate posture
- stream health
- viewer live source
- optional recording/VOD later

Must not own:

- normal creator video uploads
- platform title playback
- Watch-Party Live for videos
- billing itself
- payouts
- comment media upload

Interacts later with:

- future game live routes
- LiveKit or equivalent ingest
- Channel/Profile live entry points
- Live Room / Live Stage patterns
- moderation and stream health systems

Future Codex should avoid:

- adding native game streaming during Public v1 hardening
- breaking current LiveKit live-stage proof
- assuming Android and iOS capture requirements are the same

### Supabase / RLS Security System

Owns:

- backend truth enforcement
- row visibility
- owner/public/admin security
- storage object access
- signed URL boundaries
- service-role-only operations

Must not own:

- user-facing copy
- layout
- feature ambition beyond policy truth

Interacts with:

- `supabase/database.types.ts`
- `supabase/migrations/*`
- Supabase Storage buckets
- route/helper queries

Future Codex should avoid:

- claiming security from TypeScript alone
- relying on UI-only protection
- shipping creator upload, Premium, or admin flows without RLS proof

## SECTION 3 - Premium / Access Gate System

### Purpose

The Premium / Access Gate System determines whether a user can access premium features, including Watch-Party Live and later premium channel tools. It answers: "Can this signed-in identity use this protected feature right now, and what honest explanation should the app show if not?"

### A. System ownership

Current route/surface owners:

- `app/title/[id].tsx`: title-detail gate and Watch-Party Live entry copy.
- `app/player/[id].tsx`: standalone playback gate and Watch-Party Live CTA gate.
- `app/watch-party/[partyId].tsx`: Party Room direct-route access gate.
- `app/watch-party/live-stage/[partyId].tsx`: Live Room direct-route access gate.
- `app/channel-settings.tsx`: creator room-default access settings and creator grant summaries.

Current helper/component owners:

- `_lib/monetization.ts`: monetization snapshot, entitlement target definitions, creator permissions, title access evaluation, room access resolution hooks, purchase/restore helpers.
- `_lib/premiumEntitlements.ts`: backend-trusted entitlement reads for active/expired/revoked/pending account access.
- `_lib/revenuecat.ts`: RevenueCat configuration, customer info, offerings, purchases, restore, manage subscription handoff.
- `_lib/roomRules.ts`: room-level access decision for join policy and premium/party-pass content access.
- `_lib/watchParty.ts`: watch-party room persistence and room policy data.
- `components/monetization/access-sheet.tsx`: premium/party-pass gate sheet, purchase/restore/manage UI.

Suggested future helper owners:

- `_lib/accessGate.ts`: one shared resolver for route/content/room/event gate state.
- `_lib/subscriptionStatus.ts`: normalized user subscription/restore status.

Current backend owners:

- `user_entitlements`: backend-trusted account entitlement rows for `premium`, `premium_watch_party`, `premium_live`, and `paid_content`, including active/expired/canceled/revoked/pending state.
- `billing_events`: operator-backed billing/entitlement event audit anchor until real store receipt validation is fully wired.
- `user_subscriptions`: legacy `free` / `premium` row truth kept readable for compatibility, but ordinary users must not self-write it to unlock protected access.
- `watch_party_pass_unlocks`: legacy room-level party pass rows kept readable for compatibility, but ordinary users must not self-write them to unlock protected access.
- `creator_permissions`: creator ability to use premium rooms, party-pass rooms, premium titles, sponsor/ad hooks.
- `app_configurations`: runtime feature/config posture.
- `titles.content_access_rule`: platform/admin title access truth.
- `watch_party_rooms.content_access_rule`: room access truth.

Suggested future backend owners:

- `subscription_receipts`
- `premium_access_grants`
- backend receipt-validation edge function or API

Relationship to Billing / Subscription:

- Billing creates or refreshes entitlement truth.
- Premium / Access Gate reads entitlement truth and decides access.
- Billing handles purchase/restore/validation details; Access Gate handles "allowed or blocked" product decisions.

Relationship to Watch-Party:

- Watch-Party CTA checks access before room creation.
- Waiting Room checks access before entry.
- Party Room direct deep links check access before joining.
- Backend room/session creation must enforce premium requirements where applicable.

Relationship to Player:

- Player displays premium gate when protected playback is not allowed.
- Player must not grant Watch-Party Live entry based only on visible UI state.
- Player must not fake access or fall back to sample media when a protected creator source is unavailable.

Relationship to Creator Media:

- Public v1 creator videos use draft/public owner/public RLS, not premium/subscriber access.
- Paid/subscriber creator videos are later and must not be implied by current creator uploads.

### B. What it owns

- signed-in access checks
- premium entitlement checks
- route guards
- deep-link protection
- expired/canceled subscription handling
- upgrade/paywall routing
- restore purchase result checks
- feature flags for premium features
- blocked access copy
- "checking access" loading state
- distinction between access denied and resource not found

### C. What it must not own

- raw payment SDK purchase internals
- creator video upload
- creator video storage
- Player shell
- LiveKit token minting
- admin title creation
- creator payouts
- native game capture
- moderation review

### D. Public v1 behavior

Signed-out user:

- Block premium Watch-Party Live, Premium room, and protected direct-route access.
- Show sign-in-required copy when identity is required.
- Do not create room membership for anonymous users.
- Do not show "room not found" when the real issue is sign-in.

Signed-in non-premium user:

- Show premium gate for premium Watch-Party Live / room / title access.
- Offer Upgrade and Restore purchase actions if billing is configured.
- Preserve route context so the user can continue after entitlement refresh.
- Do not create protected sessions if premium entitlement is absent.

Premium user:

- Allow gated feature entry after entitlement check passes.
- Allow deep links only after rechecking entitlement.
- If entitlement is active but room state is invalid, show the room/resource error honestly.

Expired/canceled premium user:

- Treat as non-premium after backend/store truth refreshes.
- Block protected routes.
- Offer Restore or Manage subscription.
- Do not grant access from stale local premium cache.

Admin/operator:

- Admin/operator platform roles may access admin surfaces where backed.
- Channel/content ownership is separate from platform owner/operator/moderator authority; owning a Profile, Channel, or upload does not grant Admin access.
- Rachi is the official public platform concierge/presence on backed Profile/Chat/Support/onboarding surfaces, not Admin and not an operator role; backend-protected Admin may still manage or inspect Rachi official-account presence where backed.
- Admin/operator role is not a universal Premium bypass for consumer feature proof unless explicitly documented and backend-enforced.
- Operator test bypasses, if added later, must be visible in docs and impossible for ordinary users.

Deep link to premium Watch-Party:

- Load room/session enough to know it exists.
- Check signed-in state.
- Check membership state and premium/party-pass access.
- Block with access copy if entitlement fails.
- Do not report "room not found" for access-denied users.

Access check while auth is loading:

- Show "Checking access...".
- Do not grant access until auth state resolves.
- Do not create room membership while identity is unknown.

Access check when network fails:

- Block or retry.
- Show "Could not verify Premium access. Try again."
- Do not grant access from unknown state.

Restore purchase path:

- User taps Restore purchase.
- App asks store/RevenueCat for current purchase info.
- Backend/server entitlement truth must be refreshed when server validation exists.
- Gate rechecks entitlement after restore.
- Access unlocks only after trusted entitlement state changes.

### E. UI behavior

Required copy style:

- Premium gate title: "Watch-Party Live is a Premium feature."
- Primary action: "Upgrade"
- Utility action: "Restore purchase"
- Secondary action: "Back"
- Loading state: "Checking access..."
- Error state: "Could not verify Premium access. Try again."

Rules:

- Do not show "room not found" when the real issue is access.
- Do not show fake purchase success.
- Do not show a locked button without a path to explanation.
- If billing is unavailable in the build, say access is unavailable on this device/account rather than pretending purchase works.

### F. Backend/RLS/security behavior

- Never trust hidden buttons only.
- Route guard must check entitlement.
- Backend session or room creation must enforce entitlement where needed.
- Stale local premium cache must not grant access.
- Unknown state should block or retry, not grant access.
- Deep links must run the same access resolver as visible buttons.
- Store SDK public keys may live in app config; service keys must not.
- Access logs must not include signed URLs, tokens, receipts, or service secrets.

### G. Proof checklist

- Signed-out user is blocked from premium Watch-Party Live.
- Signed-in non-premium user is blocked.
- Non-premium direct deep link is blocked.
- Premium user is allowed.
- Expired/canceled user is blocked.
- Restore purchase path is tested.
- Route guards are tested.
- Backend/session creation action is tested.
- No UI-only premium enforcement remains for protected actions.
- Error copy is honest.
- Access denied is not mislabeled as room/resource not found.

### H. Public v1 vs later

Public v1 required:

- Watch-Party premium gate proof.
- Deep-link protection.
- Signed-out protection.
- Restore/entitlement truth if billing is live.
- Honest unavailable copy if billing is not configured.

Later:

- premium tiers
- ad-free expansion
- premium creator tools
- subscriber rooms
- VIP features
- ticketed rooms

## SECTION 4 - Moderation / Safety System

### Purpose

The Moderation / Safety System protects Chi'llywood from abusive users, bad uploads, harmful comments, unsafe live behavior, copyright problems, impersonation, scams, and platform policy failures. Creator uploads make this a Public v1 requirement, not an optional polish layer.

### A. System ownership

Current route/surface owners:

- `app/admin.tsx`: operator/admin visibility, platform title programming, bounded safety report queue, role-aware review access.
- `app/profile/[userId].tsx`: profile/channel report entry.
- `app/title/[id].tsx`: title report entry.
- `app/player/[id].tsx`: playback unavailable states, creator-video not-ready states, and creator-video report entry.
- `app/channel-settings.tsx`: creator/channel safety summary, moderated creator-video status display, and owner management constraints, not global moderation queue.
- `app/watch-party/[partyId].tsx`: Party Room report entry.
- `app/watch-party/live-stage/[partyId].tsx`: Live Room report entry.
- `app/chat/[threadId].tsx`: direct-thread report context where supported.

Current helper/component owners:

- `_lib/moderation.ts`: moderation access, safety-report context, report intake, report queue read model, platform role membership reads, bounded audit read model.
- `_lib/channelReadModels.ts`: creator-facing safety/admin summary.
- `components/safety/report-sheet.tsx`: report intake UI.

Suggested future helpers:

- `_lib/reporting.ts`: if report intake grows beyond current helper.
- `_lib/userBlocks.ts`: account-level blocks if built separately from channel audience blocks.
- `_lib/contentModeration.ts`: content state transitions when video moderation fields exist.

Current backend owners:

- `safety_reports`, including `creator_video` targets for uploaded creator videos.
- `platform_role_memberships`
- `channel_audience_blocks`
- `videos` owner/public visibility fields plus `moderation_status`, `moderated_at`, `moderated_by`, and `moderation_reason`.
- `creator-videos` storage select policy tied to public clean/reported `videos` rows or object owner access.

Suggested future backend owners:

- `content_reports`
- `user_reports`
- `moderation_actions`
- `user_blocks`
- `channel_bans`
- `admin_audit_log`
- comment reports
- room reports
- live stream reports

Relationship to Creator Media:

- Creator Media owns upload/edit/delete/unpublish.
- Moderation owns report/takedown/hidden/removed state and admin review.
- Creator cannot bypass admin takedown by republishing hidden/removed content.

Relationship to Player:

- Player should show unavailable/removed states honestly.
- Player must not play public content that moderation/RLS hides.
- Player must not fall back to sample/platform media for removed creator uploads.

Relationship to Admin:

- Admin owns review visibility and future enforcement actions.
- Admin access must be backend enforced through platform roles/RLS.
- Admin must not show fake workflow states.
- Admin UI should present a private Operator Center, not a public creator/channel owner surface.
- Admin UI may include a dedicated Rachi / Official Account section, but the Admin system itself must not be branded as Rachi or imply Rachi can self-authorize platform actions.

Relationship to Comments:

- Text comments/reactions stay fast and safe.
- Standalone creator-video text comments may ship in v1 only through `creator_video_comments` and clean public creator-video reads.
- Profile posts may ship in v1 only as text-only `profile_posts`.
- Comment media upload is post-v1.
- Future comment moderation should reuse reporting/safety primitives.

Relationship to Live/Watch-Party:

- Rooms need report user/room paths.
- Host controls and future moderator controls must be auditable when they affect others.
- Room-local moderation is distinct from durable channel roles.

Relationship to Audience Role Roster later:

- Current blocks are backed through `channel_audience_blocks`.
- Full channel bans/moderator roles are later.
- Channel roles must not be treated as room moderation authority until explicitly linked.

### B. What it owns

- report video
- report profile/channel
- report comment
- report chat message
- report live/watch-party behavior
- creator unpublish/delete own content boundary
- admin hide/remove bad content
- admin review queue
- moderation status
- block/ban/mute logic if backed
- audit trail
- safe error states
- safety copy for unavailable content

### C. What it must not own

- video upload itself
- Player playback shell
- billing
- creator payouts
- LiveKit media rendering
- route ownership outside safety actions
- creator channel design controls

### D. Content status model

Visibility:

- `draft`: owner-only draft. Public viewers cannot read or play it.
- `public`: intended for public discovery/playback.
- `private` later: owner/allowed-only content.
- `subscriber_only` later: audience/entitlement-gated creator content.

Moderation status:

- `clean`: no active moderation restriction.
- `pending_review`: awaiting review because of report, policy signal, or upload review.
- `reported`: report exists but final action is not complete.
- `hidden`: public access blocked by platform action, possibly restorable.
- `removed`: content removed from public access and owner publication path.
- `banned`: content/user/channel blocked from a scope by platform enforcement.

Owner action status:

- `active`: creator content is usable under its visibility/moderation status.
- `unpublished`: creator intentionally removed public access without deleting storage.
- `deleted`: creator removed metadata/storage or marked it as deleted where soft-delete exists.

Difference between fields:

- `visibility` is creator intent and access scope.
- `moderation_status` is platform safety enforcement.
- `owner_action_status` is creator management state.

Examples:

- `public + hidden` means the creator wanted public, but the platform hid it.
- `draft + clean` means owner-only draft.
- `public + removed` means no public playback.
- `public + reported` may remain public until policy or manual review decides otherwise, depending on future rules.

### E. Reporting behavior

Reportable targets:

- creator video
- platform title if needed
- profile/channel
- comment
- chat message
- live room
- watch-party room
- user account
- participant inside a room

Report reasons:

- nudity/sexual content
- harassment/bullying
- violence/threats
- hate/discrimination
- copyright
- spam/scam
- minor safety
- illegal content
- impersonation
- other

Current repo categories are narrower:

- `abuse`
- `harassment`
- `impersonation`
- `copyright`
- `safety`
- `other`

Future implementation should map richer product reasons into the backed category set or expand schema intentionally. Do not silently drop reason detail.

### F. Creator behavior

- Creator can delete own video where RLS and helper support it.
- Creator can unpublish own video by changing visibility/status where supported.
- Creator can edit metadata.
- Creator cannot remove reports.
- Creator cannot bypass admin takedown.
- Creator cannot make hidden/removed content public again unless admin allows it.
- Creator cannot see reporter private data unless a specific creator-facing report workflow is designed.

### G. Admin behavior

- Admin/operator can view reports when platform role/RLS allows.
- Admin/operator can inspect reported content where route/source data exists.
- Admin/operator can hide/remove content once moderation action schema exists.
- Admin/operator can restore content if policy allows and action schema supports it.
- Admin/operator can ban/block users if backed.
- Admin/operator must provide reason where appropriate.
- Destructive moderation actions should use confirmation copy and avoid raw backend/PostgREST errors in user-facing UI.
- Admin actions should be audited.
- Non-admin must be blocked by backend, not just hidden UI.

### H. Live/Watch-Party safety

Public v1 minimum:

- user can leave room
- user can report room/user
- host can end own room if supported
- platform can review reports through current admin visibility

Later:

- kick
- mute
- ban from room
- slow mode
- host/co-host moderator role
- comment filters
- admin live intervention
- stream termination

### I. V1 moderation minimum

Because creator uploads exist, v1 must include or clearly schedule before launch:

- report creator video
- creator delete/unpublish own upload
- admin hide/remove upload
- public cannot edit/delete others' uploads
- non-admin cannot use admin review actions
- hidden/removed content cannot play publicly
- no signed URLs/secrets in logs
- unsafe missing video sources show honest errors
- content policy/community rules exist

### J. Proof checklist

- Report path tested for creator video.
- Report path tested for profile/channel.
- Report path tested for room/user.
- Creator delete/unpublish tested.
- Admin removal tested or listed as blocker.
- Non-owner denial tested.
- Non-admin denial tested.
- Removed/hidden content not public.
- Logs do not leak signed URLs.
- Failure states are honest.

## SECTION 5 - Creator-upload Watch-Party Linking System

### Purpose

This system allows creator-uploaded videos to start Watch-Party sessions once the shared room source model is present in the backend. It is not the same as creator upload, standalone Player playback, Live Stage, or LiveKit camera rooms.

Current truth:

- Creator-uploaded videos open in standalone premium Player.
- Creator-upload Watch-Party linking is implemented in code with `watch_party_rooms.source_type/source_id`, normal Party Waiting Room routing, Party Room handoff, and Player resolution for `/player/[id]?source=creator-video`.
- Local Supabase migration proof passed for the source model and trigger behavior.
- Focused local RLS proof also tightened Watch-Party room policies in `202604260004_tighten_watch_party_room_rls.sql`: anonymous users can no longer read or create rooms, authenticated users can still join open rooms, locked rooms block non-host joins, and premium rooms require backend entitlement rows before membership insert.
- Live Android proof is pending because the remote Supabase project must apply migrations through `202604260004_tighten_watch_party_room_rls.sql` before room creation can persist creator-video source truth and enforce the tightened room policies.

### A. System ownership

Suggested future helper owners:

- `_lib/watchPartyContentSources.ts`
- `_lib/watchPartySessions.ts`
- `_lib/creatorVideoWatchParty.ts`

Current route owners that will interact:

- `app/player/[id].tsx`: creator-video Watch-Party CTA owns eligibility and normal waiting-room handoff.
- `app/watch-party/index.tsx`: current waiting room / room creation entry.
- `app/watch-party/[partyId].tsx`: Party Room shared playback owner.
- waiting room route files if split later.

Current backend owners:

- `watch_party_rooms`
- `watch_party_room_memberships`
- `watch_party_sync_events`
- `watch_party_room_messages`

Suggested later backend owners if the current `watch_party_rooms` source model grows too large:

- `watch_party_sessions`
- `watch_party_content_sources`
- `watch_party_participants`
- `watch_party_playback_state`

### B. What it owns

- deciding whether a creator video can start Watch-Party
- creating a room/session linked to creator video `source_type` / `source_id`
- mapping creator video source into shared party player
- host/viewer access checks
- premium checks
- draft/private restrictions
- creator-video Watch-Party CTA behavior
- playback sync for creator videos
- late join/rejoin source resolution
- invalid-source room blocking

### C. What it must not own

- video upload/storage
- basic creator video playback
- platform/admin title Watch-Party logic unless extending shared source model
- Live Stage camera rooms
- LiveKit token ownership
- billing purchase internals
- creator payout rules

### D. Source model

Shared source fields:

- `source_type = platform_title | creator_video`
- `source_id = id of platform title or creator video`
- `room_code`
- `host_user_id`
- `premium_required`
- `visibility`
- `playback_url` source resolution
- `moderation_status`
- `created_at`
- `expires_at`

Current `watch_party_rooms.title_id` remains the platform-title compatibility field. Creator uploads use `source_type = creator_video` and `source_id = videos.id`; do not overload `title_id` with creator-video ids.

### E. Eligibility rules

Creator video can start Watch-Party only if:

- video exists
- playback URL/storage source is valid
- video is public or viewer is owner/allowed
- video is not draft/private for a public room
- video is not hidden/removed/banned
- host is signed in
- premium gate passes if required
- creator-upload Watch-Party feature flag is enabled
- source resolver supports creator-video in Party Room player
- room session can persist `source_type` / `source_id`

### F. Route behavior

Correct route path:

- `/player/[id]?source=creator-video`
- Watch-Party Live CTA
- Party Waiting Room
- Party Room
- shared party player

Incorrect route path:

- Do not send creator-upload Watch-Party to `/watch-party/live-stage/[partyId]` unless explicitly building live-stage behavior.
- Do not fake Party Room with missing source.
- Do not fall back to platform title.
- Do not reuse Live Stage just because it has cameras.

### G. Draft/private behavior

- Draft video can be previewed by owner in Player.
- Draft video cannot start public Watch-Party.
- Private/subscriber videos later require audience/access checks.
- Public viewers cannot deep-link into draft/private creator Watch-Party.
- Deleted/unpublished creator source must block or end the room honestly.

### H. Sync behavior later

When built:

- host play/pause/seek controls global shared playback
- viewer sync follows host state
- late joiner receives current state
- rejoin restores source and position
- missing creator source ends/blocks room honestly
- creator upload deletion/unpublish invalidates or blocks room honestly
- no sample/platform fallback

### I. Current v1 recommendation

For Public v1, creator-upload Watch-Party may ship only after the remote migration chain through the tightened room RLS migration and Android runtime proof pass. Until then, failures must remain honest, for example:

`Watch-Party is unavailable for this video.`

Do not claim creator-upload Watch-Party support from TypeScript or local Supabase proof alone.

### J. Proof checklist when built

- Eligible creator video starts room.
- Draft/private creator video is blocked.
- Non-premium user is blocked if premium is required.
- Deep link is blocked when access/source is invalid.
- Host loads creator-video source.
- Viewer loads same creator-video source.
- No platform fallback occurs.
- Sync works for play/pause/seek.
- Leave/rejoin works.
- Deleted/unpublished creator upload invalidates or blocks room honestly.
- Platform title Watch-Party remains unchanged.

## SECTION 6 - Billing / Subscription System

### Purpose

Billing handles real purchases and turns them into server-trusted entitlements. It is separate from Premium gate decisions, creator payouts, and long-term monetization accounting.

### A. System ownership

Current owners:

- `_lib/revenuecat.ts`: RevenueCat SDK configuration, customer identity, offerings, purchase, restore, manage subscriptions.
- `_lib/monetization.ts`: monetization snapshot, purchase/restore helpers, entitlement target state, app-facing access state.
- `components/monetization/access-sheet.tsx`: purchase/restore/manage UI.

Suggested future owners:

- `_lib/billing.ts`
- `_lib/subscriptionStatus.ts`
- `_lib/premiumEntitlements.ts`
- `app/subscribe.tsx`
- `app/settings.tsx`
- Supabase edge function for receipt validation if used

Current backend owners:

- `user_subscriptions`
- `watch_party_pass_unlocks`

Suggested future backend owners:

- `billing_customers`
- `subscription_receipts`
- `subscription_events`
- `user_entitlements`
- `premium_access_grants`
- `billing_audit_log`

### B. What it owns

- purchase flow
- restore purchase
- receipt/token validation
- subscription status
- entitlement writes
- subscription event storage
- expiration handling
- grace-period handling
- revocation handling
- billing error states
- account/store identity reconciliation

### C. What it must not own

- Player UI
- Creator Media upload
- moderation
- Watch-Party route behavior alone
- creator payouts
- paid creator content access later
- platform title creation

### D. V1 subscription model

Likely first product:

- Chi'llywood Premium monthly

Later:

- annual plan
- premium tiers
- room-specific tickets
- creator channel subscriptions

Entitlement key:

- `premium`

Status model:

- `active`
- `trialing`
- `grace_period`
- `expired`
- `canceled`
- `revoked`
- `pending`

Premium may unlock:

- Watch-Party Live
- premium watch-party participation if required
- premium creator tools later
- ad-free later

### E. Purchase flow

- User taps premium feature.
- Access Gate checks entitlement.
- If missing, show subscribe/access sheet.
- User purchases through store billing.
- Receipt/token is sent to backend when server validation exists.
- Backend validates with platform/RevenueCat/store.
- Backend writes entitlement.
- App refreshes entitlement.
- User continues into the protected route/action.

### F. Restore flow

- User reinstalls or logs into new device.
- User taps Restore.
- App queries platform purchases / RevenueCat.
- Backend validates purchase when server validation exists.
- Entitlement refreshes.
- Access unlocks only after server-trusted truth updates.

### G. Failure states

Purchase canceled:

- Show non-error cancellation copy.
- Keep access blocked.

Billing service unavailable:

- Show "Could not verify purchase."
- Keep access blocked or offer retry.

Pending payment:

- Show pending state.
- Do not unlock until entitlement active.

Receipt validation failed:

- Show validation failure copy.
- Keep access blocked.
- Log safe diagnostic without token/receipt body.

Network error:

- Allow retry.
- Do not grant access from unknown state.

Purchase succeeded but entitlement write failed:

- Show "Purchase recorded, but access could not be verified. Restore or try again."
- Preserve recovery path.
- Do not silently grant protected backend actions.

Expired subscription:

- Block premium actions.
- Offer renew/manage/restore.

Chargeback/refund/revocation:

- Revoke entitlement after backend/store truth updates.
- Block protected actions.

User switches accounts:

- Sync RevenueCat/store identity to signed-in user.
- Do not carry one user's premium access to another account.

Local purchase state disagrees with backend:

- Backend/server-trusted entitlement wins for protected actions.
- Show retry/restore copy.

### H. Security rules

- Never trust local purchase state alone for protected actions.
- Backend entitlement is the source of truth for protected server actions.
- Unknown state does not grant access.
- Deep links still check entitlement.
- Buttons are not security.
- Client must not contain service keys.
- Logs must not include receipts, tokens, signed URLs, or payment provider secrets.

### I. Public v1 proof checklist

- Non-premium user is blocked.
- Subscribe/access sheet appears.
- Purchase path tested if billing is enabled.
- Restore path tested.
- Entitlement stored server-side or current limitation documented as launch blocker.
- Expired/revoked is blocked.
- Deep link cannot bypass.
- Premium route guard works.
- Billing errors show clear messages.

## SECTION 7 - Monetization System

### Purpose

Monetization is the full business model for Premium, ads, paid creator content, tips/coins, creator payouts, fees, and revenue reporting. It is larger than billing. Billing processes purchases; monetization defines what is sold, how revenue is shared, and what creators/users are promised.

### A. System ownership

Current doctrine owner:

- `PRODUCT_DOCTRINE.md`

Current partial implementation owners:

- `_lib/monetization.ts`
- `_lib/revenuecat.ts`
- `components/monetization/access-sheet.tsx`
- `app/admin.tsx` for creator permissions, app configuration, sponsor/ad hooks

Suggested future owners:

- `_lib/monetization.ts`
- `_lib/creatorEarnings.ts`
- `_lib/walletLedger.ts`
- `_lib/payouts.ts`
- `_lib/ads.ts`
- admin monetization screens
- creator dashboard later

Future backend tables:

- `creator_monetization_settings`
- `paid_content_access`
- `creator_earnings_ledger`
- `user_wallets`
- `coin_transactions`
- `tip_transactions`
- `payout_accounts`
- `payout_requests`
- `payout_events`
- `tax_profiles`
- `ad_events`
- `revenue_reports`

### B. What it owns

- pricing strategy
- premium tiers
- creator paid media later
- tips/coins later
- ad strategy later
- platform revenue share
- payout rules later
- fee rules later
- creator earnings ledger later
- revenue reporting
- monetization compliance posture

### C. What it must not own

- raw payment validation alone
- Player rendering
- video upload storage
- basic Watch-Party routing
- moderation enforcement
- native game streaming capture
- LiveKit token minting

### D. Public v1 monetization

Public v1:

- Premium subscription is the main v1 monetization path.
- Watch-Party Live is premium value.
- Creator uploads can exist without creator payouts in v1.
- No paid creator videos in v1 unless intentionally built and fully proved.
- No subscriber-only creator videos in v1.
- No tips/coins/payouts in v1.
- No ads in v1 unless intentionally integrated and compliant.

### E. Later monetization layers

Later layers:

1. Paid creator videos.
2. Subscriber-only videos.
3. Paid live events.
4. Paid watch parties.
5. Tips.
6. Chi'llywood coins or credits.
7. VIP access.
8. Ads.
9. Creator payouts.
10. Platform share.
11. Taxes/KYC/1099.
12. Chargebacks/refunds/holds.

### F. Known business rules to preserve

- Tips later may be 100% to creators.
- Chi'llywood should not take a direct percentage cut from tips.
- Platform share on paid content later can be 20% of net receipts.
- Net receipts means after app-store fees, taxes, refunds, chargebacks, and adjustments.
- Standard scheduled creator payouts remain free.
- Instant Payout / Instant Cash Out may have fees later.
- Withdrawal/transaction fees may exist later.
- These are later phase and must not be faked in v1.

### G. Ledger requirements later

- Never calculate creator balances only from UI.
- Use immutable ledger entries.
- Separate pending, available, withdrawn, held, and reversed balances.
- Handle refunds.
- Handle chargebacks.
- Handle tax withholding where required.
- Admin must audit ledger and payout events.
- Creator dashboard must not display withdrawable funds unless ledger truth supports it.

### H. Creator payout requirements later

- payout onboarding
- KYC/tax
- payout account
- fraud checks
- reserves/holds
- tax reporting
- payout fees
- international payout later
- admin support workflow
- payout failure handling

### I. Proof checklist before monetization launch

- Purchase creates entitlement.
- Paid access grants only after payment.
- Refund removes access.
- Ledger balances reconcile.
- Creator cannot withdraw fake balance.
- Admin audit works.
- Tax/KYC readiness is proved.
- Fee rules are tested.
- Payout failure is handled.
- Chargeback/reversal adjusts ledger.

## SECTION 8 - Native Game Streaming System

### Purpose

Native Game Streaming will let creators stream gameplay, screen, or video natively inside Chi'llywood. Current decision: Native game/video streaming is later phase. Do not build it for Public v1.

### A. System ownership

Future routes:

- `app/live/game-start.tsx`
- `app/live/game-stage/[streamId].tsx`
- `app/channel-settings.tsx` entry point
- `app/profile/[userId].tsx` live entry point

Future libs:

- `_lib/gameStreaming.ts`
- `_lib/liveBroadcasts.ts`
- `_lib/livekitScreenShare.ts`
- `_lib/streamHealth.ts`

Future backend:

- `live_broadcasts`
- `game_stream_sessions`
- `stream_health_events`
- `stream_recordings`
- `live_viewer_events`

### B. What it owns

- screen/game capture
- stream start/end
- encoding/bitrate behavior
- stream session state
- viewer live stream source
- stream health
- optional recording/VOD later
- game live mode routing
- capture permission lifecycle

### C. What it must not own

- normal creator video uploads
- platform title playback
- Watch-Party Live for videos
- premium billing itself
- payouts
- comment media upload
- platform/admin title creation

### D. Android requirements

- MediaProjection permission.
- Screen capture session.
- Foreground service.
- Audio capture rules.
- Encoder pipeline.
- Network resilience.
- Stop capture behavior.
- App background behavior.
- Device heat/battery management.
- Short-proof performance checks.
- Clear user-facing capture indicator.

### E. iOS requirements later

- ReplayKit broadcast extension.
- App group/shared container.
- Broadcast upload extension.
- Extra native setup.
- App Store policy considerations.
- Separate iOS proof lane.

### F. Architecture options

Option 1: LiveKit screen share.

- Best fit if compatible with current LiveKit stack.
- Reuses existing room/media direction.
- Needs careful mobile capture proof.

Option 2: RTMP ingest later.

- Better for creator-tool compatibility.
- Requires ingest infrastructure.
- Adds operational complexity.

Option 3: custom WebRTC ingest.

- Maximum control.
- Highest maintenance risk.
- Should not be first unless LiveKit cannot satisfy requirements.

Recommendation:

- Start later with LiveKit-based screen/game live if compatible with existing LiveKit stack.
- Add recording/VOD later.
- Add RTMP only if creator tools demand it.

### G. UX flow later

- Profile/Channel -> Go Live.
- Choose Camera Live / Game Live / Watch-Party Live.
- Game Live setup.
- Start screen capture permission.
- Stream opens.
- Viewers join.
- Chat/reactions run through safe live interaction paths.
- End stream.
- Optional save replay/VOD after recording support exists.

### H. Safety requirements

- report live stream
- admin end stream
- ban streamer where backed
- moderate chat
- age/sensitive content rules
- copyright complaints
- repeat abuse handling
- capture disclosure
- emergency stop path

### I. Monetization later

- tips
- subscriber-only streams
- paid game streams
- ads
- sponsor slots
- VIP chat
- not v1

### J. Proof checklist later

- Android capture starts.
- Permission prompt works.
- Viewer sees stream.
- Audio works or is intentionally disabled.
- Stream health logs exist.
- App background behavior is tested.
- Stream ends cleanly.
- Network loss is handled.
- Admin/report path exists.
- No crash/overheat in short proof.
- Current Live Stage and Watch-Party Live still work.

## SECTION 9 - Cross-System Integration Rules

### Premium + Billing

- Billing creates entitlement.
- Premium Gate checks entitlement.
- Route guards enforce entitlement.
- Backend enforces protected actions.
- Billing failure does not become access success.
- Restore updates entitlement before access unlocks.

### Premium + Watch-Party

- Watch-Party CTA checks premium.
- Waiting Room checks premium.
- Party Room checks premium.
- Deep links check premium.
- Backend session creation checks premium.
- Access denial uses access copy, not room-not-found copy.

### Creator Media + Watch-Party

- Creator uploads play in Player now.
- Creator-upload Watch-Party linking now uses `source_type` and `source_id`.
- Runtime support must stay unavailable until remote backend schema and route proof pass.
- Party Room must resolve creator-video source without platform fallback.

### Creator Media + Moderation

- Uploaded videos now support report intake, creator unpublish/delete, and owner/operator hide/remove/restore status.
- `moderation_status` affects public visibility and player access for creator uploads.
- Owner draft/public visibility is not enough for platform takedown.
- Creator cannot bypass admin removal.

### Moderation + Player

- Hidden/removed videos should not play publicly.
- Player shows honest unavailable/removed state.
- Missing creator source shows "Creator video unavailable."
- Player must not use bundled sample video for creator-upload failures.

### Monetization + Creator Media

- Paid/subscriber media later.
- Not Public v1.
- Do not show fake paid controls.
- Creator uploads can be free/public/draft without payout infrastructure.

### Audience Roles + Monetization

- Subscribers/VIPs later depend on Audience Role Roster.
- Audience Role Roster is not required for basic v1 creator upload.
- Channel subscribers are distinct from account-tier Premium.
- Subscriber-only media requires RLS-backed entitlement/access checks before UI.

### Native Streaming + LiveKit

- Future game streaming may use LiveKit.
- Do not break current live-stage/watch-party LiveKit proof.
- LiveKit token role is not the same as channel audience role.
- Screen share/capture requires separate native proof.

### Admin + All Systems

- Admin controls platform titles, reports, takedowns, configs, and later monetization support.
- Admin access must be backend enforced.
- Admin UI must not expose fake authority.
- Admin is the private Operator Center for backend platform roles; Channel Settings is the creator/content-owner surface.
- Rachi can have a backend-protected official-account management section inside Admin, but Rachi is not Admin and must not imply operator authority.
- Admin actions should gain audit records before sensitive mutation launch.

## SECTION 10 - Public V1 Required vs Post-v1

### Public v1 required

| Area | Required before public launch |
| --- | --- |
| Premium / Access Gates | Watch-Party Live premium gate proof, signed-out protection, deep-link protection, honest failure copy. |
| Creator Media | Runtime proof complete, public/draft proof, owner/non-owner proof, Player source proof preserved. |
| Supabase / RLS | Live schema/RLS proof for creator videos, admin, reports, rooms, premium-protected actions. |
| Moderation / Safety | Basic report path for uploaded videos, creator delete/unpublish, admin hide/remove or explicit blocker, non-owner denial. |
| Admin Protection | Non-admin blocked by backend/RLS, operator/admin role proof, no fake admin action. |
| Account Settings | Logout, account deletion link, support links, privacy/terms links. |
| Android Release | Release build proof and final route smoke test. |
| Watch-Party / Live | Existing platform/admin title Watch-Party and Live Stage proof preserved. |

### Public v1 optional

- creator-upload Watch-Party linking runtime proof
- more advanced audience roles
- push notifications
- deeper analytics
- richer channel shelves
- thumbnail file upload

### Post-v1 / later

- comment media uploads
- native game streaming
- paid creator videos
- subscriber-only videos
- tips/coins
- payouts
- ads
- VIPs
- moderators/co-hosts at scale
- full Audience Role Roster
- advanced creator studio
- automatic transcoding
- creator-upload Watch-Party linking follow-up if runtime proof is not completed for Public v1

## SECTION 11 - Failure Behavior Standards

Every system must fail honestly.

Global failure rules:

- no fake playback
- no fallback to sample/platform video for creator uploads
- no hidden premium bypass
- no silent upload failures
- no fake audience controls
- no fake monetization controls
- no logs with signed URLs/secrets
- no unhandled route dead ends
- no misleading "room not found" when access is denied
- no fake report review completion
- no fake payout balance

User-facing failure copy style:

| System | Copy style |
| --- | --- |
| Premium | "Premium required." |
| Billing | "Could not verify purchase." |
| Upload | "Upload failed. Try again." |
| Player | "Creator video unavailable." |
| Watch-Party linking | "Watch-Party is unavailable for this video." |
| Moderation | "This content is unavailable." |
| Native game streaming later | "Game streaming is not available yet." |

System-specific rules:

- Premium unknown state blocks or retries.
- Billing pending state does not unlock protected actions.
- Creator upload failure shows visible error and does not create broken public cards.
- Player missing creator source stays in premium Player shell with honest unavailable copy.
- Watch-Party creator upload CTA must block or show unavailable copy until remote source-model truth exists and eligibility passes.
- Moderation hidden/removed content must not play publicly.
- Native game streaming unavailable state must not open Live Stage as a fake substitute.

## SECTION 12 - Proof And Validation Standards

Future Codex work must prove changes from repo truth, not chat memory.

Required preflight:

- Read repo control files first.
- Report repo root.
- Report branch.
- Report HEAD.
- Report `git status --short`.
- Report staged files.
- Identify unrelated dirt.
- Never stage `supabase/.temp/`.

Runtime proof standards:

- Use Android device proof when touching native behavior.
- Use bounded logcat capture, not endless sessions.
- Save screenshots/logs under `/tmp` proof folder.
- Do not claim proof without exact route, action, and result.
- Static validation does not equal runtime proof.
- Supabase/RLS needs live/backend proof, not only TypeScript.

Static validation:

- Run `git diff --check` for docs and code.
- Run `npm run typecheck` after TS/TSX changes.
- Run `npm run lint` after TS/TSX changes when reasonable.
- Run focused tests when owner files have tests.

Commit discipline:

- Commit only relevant files.
- Leave unrelated dirt untouched.
- Show staged file list before commit.
- Do not mix proof tooling dirt into product/docs commits unless intentionally scoped.

## SECTION 13 - Implementation Order

Use this order unless newer repo control files contradict it:

1. Clean or intentionally commit/discard unrelated proof workflow dirt.
2. Finish Creator Media remaining proof:
   - draft/public visibility
   - edit metadata
   - publish/unpublish
   - delete/unpublish
   - non-owner cannot manage
3. Supabase live schema/RLS proof.
4. Premium/access gate audit and proof.
5. Billing/subscription entitlement foundation proof.
6. Moderation/safety minimum proof.
7. Watch-Party route ownership proof.
8. Admin/platform title proof.
9. Auth/settings/account deletion/store links proof.
10. Android release build proof.
11. Final Public v1 smoke test.
12. Only after v1:
   - creator-upload Watch-Party linking
   - monetization
   - native game streaming
   - comment media uploads
   - advanced audience roles

Important: the next implementation/proof lane after this plan remains Creator Media public/draft and owner/non-owner runtime proof. Do not turn the next lane into "build all six systems."

## SECTION 14 - Codex Guardrails

Future prompts can quote these instructions:

- Follow `SYSTEM_OWNERSHIP_MAP.md` if it exists and `PUBLIC_V1_AND_LATER_SYSTEMS_PLAN.md`.
- Follow `MASTER_VISION.md`, `ARCHITECTURE_RULES.md`, `PRODUCT_DOCTRINE.md`, `ROOM_BLUEPRINT.md`, `CURRENT_STATE.md`, and `NEXT_TASK.md`.
- Do not cross owners.
- Do not implement later-phase systems during v1 hardening.
- Do not fake support.
- Do not move logic into buttons.
- Do not make Player own uploads.
- Do not make Profile own management logic.
- Do not let Watch-Party routes drift into Live Stage.
- Do not rely on unbacked audience roles for security.
- Do not ship Premium gates with UI-only checks.
- Do not log signed URLs or secrets.
- Do not claim runtime proof from static validation.
- Do not create migrations during planning-only passes.
- Do not add packages during docs-only passes.
- Do not create paid/subscriber creator media unless explicitly scoped and RLS-backed.
- Do not create native game streaming during Public v1 hardening.
- Do not add comment media upload before post-v1 scope.
- Do not let admin UI imply unbacked moderation/takedown workflow.
- Do not let creator-upload Watch-Party fall back to platform/admin titles.
- Do not treat app-store subscription billing as creator payout infrastructure.
- Do not treat channel subscribers as account-tier Premium.
- Do not treat LiveKit token role as channel audience role.

## Files And Current Truth Referenced

Primary control and planning docs:

- `MASTER_VISION.md`
- `ARCHITECTURE_RULES.md`
- `PRODUCT_DOCTRINE.md`
- `ROADMAP.md`
- `CURRENT_STATE.md`
- `NEXT_TASK.md`
- `ROOM_BLUEPRINT.md`
- `docs/PROFILE_CHANNEL_CONTENT_AUDIT.md`
- `docs/AUDIENCE_ROLE_ROSTER_SYSTEM.md`
- `docs/access-entitlement-implementation-spec.md`
- `docs/safety-moderation-implementation-spec.md`
- `docs/public-v1-release-checklist.md`

Primary route owners:

- `app/profile/[userId].tsx`
- `app/channel-settings.tsx`
- `app/player/[id].tsx`
- `app/title/[id].tsx`
- `app/admin.tsx`
- `app/watch-party/[partyId].tsx`
- `app/watch-party/live-stage/[partyId].tsx`

Primary helper/component owners:

- `_lib/creatorVideos.ts`
- `_lib/mediaSources.ts`
- `_lib/channelReadModels.ts`
- `_lib/channelAudience.ts`
- `_lib/contentEngagement.ts`
- `_lib/monetization.ts`
- `_lib/revenuecat.ts`
- `_lib/roomRules.ts`
- `_lib/watchParty.ts`
- `_lib/moderation.ts`
- `components/monetization/access-sheet.tsx`
- `components/safety/report-sheet.tsx`

Primary backend truth:

- `videos`
- `creator-videos` storage
- `safety_reports`
- `platform_role_memberships`
- `user_subscriptions`
- `watch_party_pass_unlocks`
- `watch_party_rooms`
- `watch_party_room_memberships`
- `channel_followers`
- `channel_subscribers`
- `channel_audience_requests`
- `channel_audience_blocks`
- `creator_permissions`
- `app_configurations`
- `chat_messages`
