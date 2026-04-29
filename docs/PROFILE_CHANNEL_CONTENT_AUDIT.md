# Profile Channel Content Audit

Date: 2026-04-24
Updated: 2026-04-25 for creator upload foundation and comment media scope
Updated: 2026-04-28 for non-room Player source ownership hardening
Updated: 2026-04-28 for creator video card presentation and engagement truth
Updated: 2026-04-28 for Profile/Channel versus Chi'llywood Originals ownership correction
Updated: 2026-04-28 for one-device non-live Profile/Channel and creator-video card proof
Updated: 2026-04-29 for Profile/Channel Public v1 product-contract clarity

Repo root: `/Users/loverslane/chillywood-mobile`
Branch audited: `main`
HEAD audited: `8d6f62fa8e73288d6ed7347076dd5002ad9bb15a`
HEAD at upload/comment scope update: `2ad56268e3abfb2aa2c322f5943a4a43615790c7`
HEAD at creator media foundation closeout: pending commit after static validation
HEAD at one-device non-live proof: `9f94af3df0519e5a973429be451738a1833f7d7e`

Unrelated dirty files at audit start:

- `.gitignore`
- `NEXT_TASK.md`
- `docs/LIVE_STAGE_TWO_DEVICE_PROOF.md`
- `scripts/proof-live-stage-video-check.sh`

This audit began as documentation only. The follow-up creator media foundation now implements the first Public v1 creator-upload path. Later Android proof on `R5CR120QCBF` confirmed the owner Profile/Channel and Channel Settings presentation lanes, while public/non-owner proof and playable creator-video proof still remain pending because the current stored media object is zero bytes.

## 2026-04-29 Profile / Channel Contract Addendum

Current governing truth:

- Profile is personal/social identity.
- Channel is the creator's mini streaming platform.
- Profile and Channel stay connected on `/profile/[userId]`, but they must not collapse into one vague feed.
- Personal Profile posts/status updates are desired, but they are not backed for Public v1 unless implemented separately.
- Creator uploaded videos belong to the Channel/creator content area, not the personal Posts lane.
- Chi'llywood Originals/platform `titles` stay on Home, Explore, platform title/player routes, dedicated Originals/platform surfaces, and admin-managed title surfaces.

Active code truth after this pass:

- The Profile header shows identity, handle, avatar, tagline/bio when present, official/platform badges where backed, and backed live/role signals.
- Owner top actions are Edit Profile, Manage Channel, Upload Video, and Settings.
- Public top actions are backed Follow/Following, Chi'lly Chat, View Channel, Share Profile, and Report where supported.
- The Posts tab now shows an honest personal-updates placeholder instead of rendering creator videos as fake social posts.
- The Channel tab owns creator uploaded videos, uses `CreatorVideoCard`, and opens `/player/[id]?source=creator-video`.
- The owner Profile composer remains available, but it is explicitly a creator-video upload into Channel.
- `/channel-settings` labels current access controls as Access Defaults and no longer presents ad/sponsorship/Premium-playback cards as Channel owner controls.

Public v1 status:

- Profile 1-6 is present for identity, quick actions, Channel entry, backed social/community posture, and honest activity/empty states.
- Personal posts/status updates are pending because no profile-post backend exists.
- Follow is backed by `channel_followers` and `_lib/channelAudience.ts`; public counts remain hidden unless backed/readable for that viewer.
- Full Friends, likes/comments on creator videos, personal post comments/reactions, paid creator content, payouts, tips, coins, ads, native game streaming, and real Chi'llyfects AR remain out of scope.

Runtime proof status: static/code/docs pass only. No Android runtime proof, production build, or database mutation was run.

## Files Read

- `SESSION_START_PROTOCOL.md`
- `MASTER_VISION.md`
- `ARCHITECTURE_RULES.md`
- `PRODUCT_DOCTRINE.md`
- `ROADMAP.md`
- `CURRENT_STATE.md`
- `NEXT_TASK.md`
- `ROOM_BLUEPRINT.md`
- `docs/public-v1-blueprint.md`
- `docs/profile-channel-implementation-spec.md`
- `docs/channel-design-layout-implementation-spec.md`
- `docs/creator-analytics-implementation-spec.md`
- `app/profile/[userId].tsx`
- `app/channel-settings.tsx`
- `app/(tabs)/index.tsx`
- `app/title/[id].tsx`
- `app/player/[id].tsx`
- `_lib/creatorVideos.ts`
- `supabase/migrations/202604250001_creator_video_upload_foundation.sql`
- `app/chat/[threadId].tsx`
- `app/watch-party/[partyId].tsx`
- `app/watch-party/live-stage/[partyId].tsx`
- `app/admin.tsx`
- `_lib/userData.ts`
- `_lib/channelReadModels.ts`
- `_lib/channelAudience.ts`
- `docs/AUDIENCE_ROLE_ROSTER_SYSTEM.md`
- `_lib/contentEngagement.ts`
- `_lib/mediaSources.ts`
- `_lib/chat.ts`
- `_lib/watchParty.ts`
- `supabase/database.types.ts`
- `supabase/migrations/202604190004_baseline_current_schema_truth.sql`
- `supabase/migrations/202604190005_create_channel_audience_relationships.sql`
- `supabase/migrations/202604190006_add_channel_audience_visibility_truth.sql`
- `supabase/migrations/202604200001_create_creator_events.sql`
- `supabase/migrations/202604200002_create_notifications_and_event_reminders.sql`
- `supabase/migrations/202604200003_add_channel_layout_preset.sql`
- `supabase/migrations/202604200003_add_owner_platform_role.sql`
- `supabase/migrations/202604200004_add_platform_role_roster_visibility.sql`
- `supabase/migrations/202604210001_create_user_friendships.sql`

## Route Map

| Route | Owner | Current role |
| --- | --- | --- |
| `/profile/[userId]` | `app/profile/[userId].tsx` | Canonical public profile/channel surface for person identity, channel home, public tabs, access posture, live/event cues, Chi'lly Chat handoff, and owner handoff. |
| `/channel-settings` | `app/channel-settings.tsx` | Signed-in creator control center for identity, layout preset, room defaults, access posture, creator events, audience actions, analytics summaries, and safety/admin summaries. |
| `/` home tab | `app/(tabs)/index.tsx` | Discovery/home surface. It opens the signed-in user's profile/channel avatar route and reads public `titles` programming. |
| `/title/[id]` | `app/title/[id].tsx` | Title detail, access gate, play, favorites, like, share marker, report, and Watch-Party Live entry. |
| `/player/[id]` | `app/player/[id].tsx` | Playback and watch-party player owner. Uses title `video_url` or local fallback video. |
| `/watch-party` | `app/watch-party/index.tsx` | Watch-party room creation/join entry, including title-driven party creation. |
| `/watch-party/[partyId]` | `app/watch-party/[partyId].tsx` | Party room owner. Profile entry points link out to `/profile/[userId]`. |
| `/watch-party/live-stage/[partyId]` | `app/watch-party/live-stage/[partyId].tsx` | Live Stage owner. Profile entry points link out to `/profile/[userId]`. |
| `/chat` and `/chat/[threadId]` | `app/chat/index.tsx`, `app/chat/[threadId].tsx` | Canonical Chi'lly Chat inbox/direct-thread routes. |
| `/admin` | `app/admin.tsx` | Internal/admin content programming and platform operations surface, including the only real title creation/edit route found. |

There is no separate public `/channel/[id]` route. Doctrine and current code intentionally make `/profile/[userId]` the public profile plus channel route, with `/channel-settings` as the owner-side control center.

## Owner File Map

| Area | Owner files |
| --- | --- |
| Profile/channel presentation | `app/profile/[userId].tsx`, `_lib/userData.ts`, `_lib/accessEntitlements.ts`, `_lib/officialAccounts.ts`, `_lib/friendGraph.ts`, `_lib/liveEvents.ts`, `_lib/notifications.ts`, `_lib/moderation.ts` |
| Channel settings/control | `app/channel-settings.tsx`, `_lib/userData.ts`, `_lib/channelReadModels.ts`, `_lib/channelAudience.ts`, `_lib/monetization.ts`, `_lib/liveEvents.ts`, `_lib/notifications.ts` |
| Platform content discovery | `app/(tabs)/index.tsx`, `app/(tabs)/explore.tsx`, `app/title/[id].tsx`, `_data/titles`, `_lib/mediaSources.ts` |
| Platform/admin programming | `app/admin.tsx`, `_lib/appConfig.ts`, `_lib/monetization.ts`, `_lib/moderation.ts` |
| Viewer engagement | `app/title/[id].tsx`, `app/player/[id].tsx`, `_lib/contentEngagement.ts`, `_lib/userData.ts` |
| Live/watch-party links | `app/watch-party/index.tsx`, `app/watch-party/[partyId].tsx`, `app/watch-party/live-stage/[partyId].tsx`, `_lib/watchParty.ts`, `_lib/communication.ts` |
| Schema truth | `supabase/database.types.ts`, `supabase/migrations/*`, `supabase/migrations_legacy/*` |

## Current Profile Truth

`/profile/[userId]` is already a connected person/channel surface, not a plain account page. It renders:

- public identity: display name, handle, avatar, tagline, role, official account badges, live/off-air state, and room context state
- public channel framing: "Your Channel", "Creator Channel", "Host Channel", or official concierge copy
- primary public actions: backed Follow/Following, Chi'lly Chat, View Channel, Share Profile, Report, and live/watch-party handoffs when real context exists
- primary owner actions: Edit Profile, Manage Channel, Upload Video, and Settings
- channel access posture: browse, Watch Party, and Chi'lly Chat access cards backed by user profile defaults and creator permissions
- tabs: Posts, Channel, Live, Community, About
- Posts tab: honest personal-updates placeholder because text/status Profile posts are not backed yet
- Channel tab: creator-owned video cards from `videos`; user/creator Channels do not show Chi'llywood Originals or platform `titles` as filler
- public live/event summaries from backed `creator_events` and reminder summaries
- owner mode on the same route when the signed-in user matches the route user id
- owner-only handoff card and quick actions to `Manage Channel`, creator-video upload, Settings, and Chi'lly Chat
- report/safety path for non-self profiles

The self vs public viewer experience is different at the control level: self-view gets owner stats, owner prompts, edit/manage/upload/settings actions, and drafts; visitors get backed Follow/Following, Chi'lly Chat, View Channel, Share Profile, Report, and public channel copy. The distinction still shares one canonical route by design.

## Current Channel Truth

Channel exists as a product layer, but it does not exist as a separate public route. The public channel lives inside `/profile/[userId]`; private creator controls live in `/channel-settings`.

`/channel-settings` currently supports:

- identity fields: display name, tagline, channel role
- layout preset: spotlight, live first, library first
- Watch Party defaults: join policy, reactions, content access, capture policy
- communication defaults: content access and capture policy
- creator access/grant summary from `creator_permissions`
- creator live events: create/edit scheduled/live/replay event records, linked title id for Watch-Party Live events, reminder readiness
- audience summary: follower, subscriber, request, and block counts
- audience actions: approve/decline/cancel requests, remove follower, block/unblock audience member
- creator analytics summary: hosted room counts, active rooms, latest hosted activity, follower/subscriber signal
- safety/admin summary: actor role, admin/review access, platform roles, recent safety report summary where allowed

Channel settings now supports a first creator video upload/manage foundation:

- owner-only `Content` panel in `/channel-settings`
- video file picker through `expo-document-picker`
- title, description, optional thumbnail URL, and draft/public visibility
- upload/save state and error/notice state
- modern creator video cards with thumbnail/fallback preview, status badges, edit, publish/unpublish, delete, and open Player actions

Channel settings does not yet support:

- choosing uploaded channel shelves from a creator-owned media library
- true visual design controls beyond current layout preset and planned design chips
- avatar or hero image upload
- public/private/subscriber content access on uploaded creator content
- native game/video streaming source management
- native thumbnail generation, duration extraction, creator-video likes, creator-video comments, engagement counts, or creator-video saves/My List

## Profile <-> Channel Integration

Working connections:

- Home opens the signed-in user's canonical `/profile/[userId]` route from the avatar button.
- Profile self-view opens `/channel-settings` via Manage Channel.
- Profile visitor view opens Chi'lly Chat direct threads through `/chat/[threadId]`.
- Profile can hand back into live/watch-party routes when real room or scheduled title context exists.
- Profile reads channel defaults and layout posture from `user_profiles`.
- Channel settings writes the same `user_profiles` fields that profile reads.
- Channel settings reads the same creator/event/audience/permission state surfaced publicly where appropriate.

Updated working connections:

- Profile Channel can render creator-owned videos from `videos`.
- Owner Profile view links to Channel Settings for upload.
- Profile/Channel creator-video cards now show thumbnails when `thumb_url` or `thumb_storage_path` resolves, otherwise a branded Chi'llywood fallback preview.
- Public Profile/Channel cards can share a route-safe app deep link for public clean/reported creator videos only.
- Uploaded videos open in `/player/[id]?source=creator-video`.
- Draft videos are intended to stay owner-only through query shape and RLS policy intent.

Confusing or missing connections:

- "Channel" is real in the UI but has no standalone public URL, so a user expecting a separate Channel destination may not know that Profile is the Channel home.
- The Channel tab now has a creator-video section, but shelf curation beyond the simple uploaded-video grid is still later.
- Channel settings has a current upload/manage lane, but not a full shelf builder or advanced creator studio.
- The app still has both `titles` and `videos`: `titles` remain platform/admin programming and `videos` now cover creator-owned uploads.

No route drift was found against doctrine. `/profile/[userId]` and `/channel-settings` match the control files.

## Add-Content Flow Truth

Current user-facing add/content management paths:

- `/channel-settings` can create and edit `creator_events`.
- `/channel-settings` can link Watch-Party Live events to an existing title id.
- `/admin` can create/edit platform `titles` with title, category, year, runtime, synopsis, poster URL, thumbnail URL where present, video URL, preview URL where present, status, release date, sort order, hero/featured/trending/top-row flags, access rule, ads, sponsor placement, and sponsor label.

What now exists for normal creators:

- creator upload/manage panel in `/channel-settings`
- video picker, title, description, optional thumbnail URL, and draft/public visibility
- creator-owned upload metadata in `videos`
- private `creator-videos` storage bucket policy intent
- Profile/Channel display for uploaded videos
- Player support for uploaded videos through `source=creator-video`
- edit, publish/unpublish, delete, and open Player controls for the owner
- creator-video report intake from Player, admin hide/remove/restore status, and public playback/list filtering for moderated videos
- route-safe native sharing for public creator videos using the app Player route, not raw Supabase media URLs

What still does not exist for normal creators:

- no channel shelf picker using creator-owned media
- no creator content category/genre visibility workflow outside internal/admin `titles`
- no thumbnail file upload yet; the foundation supports optional thumbnail URL
- no automatic thumbnail generation or duration extraction
- no creator-video likes, comments, saves/My List, or engagement counts
- no automatic transcoding or moderation queue automation

Where content goes today:

- Admin-created Chi'llywood Originals/platform titles go into `titles`.
- Home, Explore, Title Detail, platform Player, and platform Watch-Party Live read from `titles`.
- Profile/Channel does not list platform titles or Chi'llywood Originals inside user/creator Channels.
- User favorites go into `user_list` and AsyncStorage fallback.
- Likes/share markers go into `user_content_relationships`.
- Creator events go into `creator_events` and can appear on Profile Live tab.
- The `videos` table now carries owner upload metadata and is read by Profile/Channel and Player.

Ease assessment: improved and partly runtime-proved. A creator now has a concrete upload/manage lane in Channel Settings and a Profile/Channel display path, and one-device proof confirms the owner can see the modern no-thumbnail fallback card in both places without Chi'llywood Originals/platform title filler. Android picker/upload proof, public/non-owner proof, and playable creator-video proof are still pending for the remaining lane.

## Public V1 Creator Upload Decision

Basic creator video upload is now Public v1 required.

This is separate from advanced creator studio, paid media, subscriber-only media, payouts, native game streaming, and automatic transcoding. Public v1 only needs the smallest honest path that lets a channel owner upload a playable video, describe it, control draft/public visibility, see it on their Profile/Channel, edit or remove it, and open it in the player.

Current upload truth after foundation:

- `/channel-settings` has creator-event management plus a creator video upload/manage panel.
- `/profile/[userId]` displays creator-owned videos from `videos`; it does not use Chi'llywood Originals/platform `titles` as Channel filler.
- `/admin` can create platform `titles` by URL. That is internal programming, not creator upload.
- `app/player/[id].tsx` supports uploaded creator videos through `/player/[id]?source=creator-video`; creator videos no longer open through bare `/player/[id]` fallback.
- `_lib/creatorVideos.ts` is the creator-video read/write/upload owner.
- `components/creator-media/creator-video-card.tsx` is the shared presentation owner for uploaded-video cards in Channel Settings and Profile/Channel.
- `_lib/creatorVideoLinks.ts` builds route-safe creator-video app deep links and centralizes the public-share eligibility check.
- Android upload/player proof exists for the initial upload and standalone Player path; one-device non-live proof on `R5CR120QCBF` now also confirms owner Profile/Channel and Channel Settings card presentation, no Chi'llywood Originals/platform filler in creator Channels, route-safe Share, backed Report sheet opening, invalid/bare Player route ownership, and a repair/re-upload Player error state for the current zero-byte object. Focused local Supabase/RLS proof passes for creator video metadata visibility, moderation/report rows, premium/billing entitlement writes, and tightened Watch-Party room policies. Public/draft, non-owner, Storage API delete, report-row/admin moderation runtime, playable repaired-upload proof, and live Supabase/RLS proof remain pending.

`videos` table readiness:

- Implemented foundation: `visibility`, `storage_path`, `thumb_storage_path`, `mime_type`, `file_size_bytes`, `updated_at`, and `moderation_status` with admin moderation metadata.
- Present but not fully productized: `thumb_url` can supply a thumbnail URL, and `thumb_storage_path` can resolve a signed thumbnail when populated.
- RLS policy proof now distinguishes public clean/reported videos from owner drafts and hidden/removed/banned videos in local Supabase.
- `creator-videos` private storage bucket and owner/public storage policy intent are in the repo migrations.
- Still missing: category/genre, thumbnail file upload/generation, duration metadata in generated app types, creator-video like/comment/share counts, transcoding, and live Supabase/RLS proof.

## Creator Video Presentation And Engagement Truth

Current visual behavior:

- Channel Settings owner library shows every owner video returned by `readCreatorVideos(..., { includeDrafts: true })`.
- Owner cards show thumbnail/fallback preview, Play overlay, Draft/Public badge, moderation badge when applicable, description preview, file size when present, updated date when parseable, mime type, and owner controls.
- Profile/Channel shows creator-video cards in the Channel tab. Owner view may include drafts with badges; public viewer reads only public clean/reported videos through `_lib/creatorVideos.ts` and RLS.
- Cards route to `/player/[id]?source=creator-video`.
- Home, Explore, and My List remain platform-title surfaces and do not list creator videos.
- One-device proof on `R5CR120QCBF` confirmed the owner no-thumbnail fallback card in Channel Settings and Profile/Channel, including the `Open Player`, `Edit`, `Unpublish`, and `Delete` owner controls in Channel Settings and no platform-title filler inside the creator Channel.

Thumbnail/preview truth:

- `thumb_url` exists on `videos`.
- `thumb_storage_path` exists and can resolve a signed thumbnail URL through `_lib/creatorVideos.ts`.
- No native thumbnail generation package or thumbnail file picker was added in this pass.
- If no thumbnail exists, the shared card shows a branded Chi'llywood fallback preview.

Engagement truth:

- Creator-video Report is backed in Player through `safety_reports` with `target_type = 'creator_video'`.
- Route-safe native Share is available for public clean/reported creator videos and shares the app route/deep link, not signed media URLs.
- Creator-video likes are not backed; `_lib/contentEngagement.ts` is title-only through `user_content_relationships.title_id`.
- Creator-video comments are not backed; current comments in Player are room comments, not standalone creator-video comments.
- Creator-video saves/My List are not backed; `user_list` is title-only.
- Like/comment/share counts are not backed for creator videos.

Smallest next implementation lane if comments are required before launch:

1. Add `creator_video_comments` and optional `creator_video_comment_reactions` tables with RLS for public clean/reported video reads, signed-in text-comment inserts, owner/admin moderation, and hidden/removed filtering.
2. Add generated Supabase types and helper functions.
3. Add a text-only comments drawer/action in Player for creator-video playback.
4. Prove public/draft/hidden/removed visibility, signed-out behavior, report/delete moderation, and release logging.

Smallest safe Public v1 upload requirements:

1. Owner entry point from `/channel-settings`, with a clear `Upload Video` or `Add Video` action and an owner-only Profile empty-state CTA.
2. Upload form with video file picker, title, description, optional thumbnail or fallback, optional category/genre, draft/public visibility, creator `owner_id`, and Profile/Channel linkage through that owner id.
3. Storage/backend lane with repo-owned bucket/policy migrations, video metadata rows, owner CRUD, public read for public videos only, and no token/secret exposure.
4. Profile/Channel display where public uploaded videos appear for visitors, owner drafts are visible only to the owner, public empty state stays premium, and owner empty state points to upload.
5. Player integration for uploaded media URLs. Creator-upload Watch-Party linking now has code/local schema support through the normal Party Waiting Room and Party Room flow; live runtime proof still requires the remote Supabase source-model migration.
6. Creator management for edit metadata, unpublish/draft, and delete. No placeholder manage button.

Recommended remaining implementation order:

1. Apply the migration in the target Supabase environment.
2. Connect Android device and run runtime proof.
3. Rebuild dev client if `expo-document-picker` requires it.
4. Verify upload, metadata save, Profile/Channel display, Player playback, and public/draft visibility.
5. Verify creator-video report intake, admin hide/remove/restore, hidden/removed public/player blocking, and Storage API delete/remove against live Supabase/RLS.
6. After remote migration proof, verify uploaded-video Watch-Party routing, no Live Stage drift, no platform/sample fallback, and draft/private blocking.

## Viewer Content Experience

Already working or partly working:

- Home and Explore render programmed platform title rails and open `/title/[id]` or platform Player routes.
- Profile Channel tab shows creator-owned videos and creator events only; no jump-to-title filler is used in user/creator Channels.
- Title Detail supports Play, Favorites, Like, Mark Shared, Report, and Watch-Party Live entry when active rooms exist.
- Player opens title video sources from `video_url` or local fallback.
- Player opens creator videos only when the route explicitly includes `source=creator-video`, which keeps platform title ids and creator-video ids from silently crossing owners.
- Watch-party routes connect titles to room/live experiences.
- Profile Live tab shows backed creator events and reminder enrollment state where available.

Gaps:

- Full creator shelf/section curation is not implemented beyond the current creator-video cards and event summaries.
- There is no public creator video detail route separate from title detail.
- Title detail remote art handling is limited: current visible hero uses local poster when available and otherwise a fallback, while `poster_url` is part of the title data model.
- No universal comments on Profile/Title outside room/live contexts.
- Share is a stored relationship marker, not a full native share/messaging flow.
- Empty states are honest, but they often explain future capability instead of giving the creator a concrete next action.

## Creator Management Experience

Creators can currently:

- edit profile/channel display name, tagline, and role
- choose a channel layout preset
- set watch-party and communication defaults
- see creator access grant posture
- create/edit creator event records
- see and manage some audience relationships
- see limited analytics and safety/admin summaries
- open their public profile/channel route

Creators still cannot currently:

- upload a thumbnail file directly
- manage advanced shelves/sections from a creator-owned content library
- pick shelves/sections from creator-owned content
- set per-upload category, genre, age, or safety metadata
- set content safety/age metadata on uploads
- start native game/video streaming from Profile or Channel settings
- see creator content performance aggregates for uploaded media

## Data, Schema, API, And Storage Ownership

Profile/channel identity:

- `user_profiles`: username, avatar index/url, display name, tagline, channel layout preset, channel role, public activity visibility, follower/subscriber surface flags, watch-party defaults, communication defaults.
- `_lib/userData.ts`: normalize/read/save user profiles, merge local and remote profile truth, build public channel profile model.
- `profiles`: older/general public profile table remains in generated types, but current profile/channel owner code uses `user_profiles`.

Channel/audience:

- `channel_followers`
- `channel_subscribers`
- `channel_audience_requests`
- `channel_audience_blocks`
- `_lib/channelAudience.ts`
- `_lib/channelReadModels.ts`
- `docs/AUDIENCE_ROLE_ROSTER_SYSTEM.md`: durable Audience Role Roster System definition. Current Public v1 truth is backed followers, subscriber rows, audience requests, and blocks only; unified roster, VIP, moderator, co-host, manager/team, invites, bans, permissions, role audit logs, and paid/subscriber creator media stay post-v1 unless a narrow safety blocker changes scope.

Creator permissions and monetization flags:

- `creator_permissions`: premium title publishing, Party Pass room defaults, premium room defaults, sponsor placements, player ads.
- `_lib/monetization.ts`
- `app_configurations`: global feature/config/branding/monetization switches.

Content/player:

- `titles`: platform title programming table used by Home, Explore, Title Detail, platform Player, platform Watch Party, and Admin, not as user/creator Channel filler.
- `videos`: owner-owned creator video table integrated with Channel Settings upload/manage, Profile/Channel display, Player playback through `source=creator-video`, creator-video reports, and moderation status.
- `user_list`: favorites/my-list.
- `watch_history`: continue watching.
- `user_content_relationships`: like/share relationship markers.
- `_lib/contentEngagement.ts`
- `_lib/mediaSources.ts`

Live/watch-party:

- `watch_party_rooms`
- `watch_party_room_memberships`
- `watch_party_room_messages`
- `watch_party_sync_events`
- `communication_rooms`
- `communication_room_memberships`
- LiveKit token function: `supabase/functions/livekit-token/index.ts`

Creator events/notifications:

- `creator_events`
- `notifications`
- `event_reminders`
- `_lib/liveEvents.ts`
- `_lib/notifications.ts`

Storage:

- `supabase/migrations/202604250001_creator_video_upload_foundation.sql` creates/updates the private `creator-videos` bucket and storage policies.
- `_lib/creatorVideos.ts` owns the first `supabase.storage.from("creator-videos")` upload path for creator videos.
- Thumbnail file upload is not implemented yet; the foundation supports optional thumbnail URL and thumbnail storage-path columns for later.

## Comment Uploads Scope

Main decision: comment media upload is post-v1 unless a future pass discovers a mostly complete implementation outside the checked-in code audited here. It is separate from creator channel video upload and should not block the Public v1 creator-upload lane.

Current comment truth:

- Watch-party room comments use `watch_party_room_messages` with `party_id`, `user_id`, `username`, `text`, and `created_at`.
- Live Stage comments use the same `watch_party_room_messages` table through `_lib/watchParty.ts` and `app/watch-party/live-stage/[partyId].tsx`.
- Player room comments use `sendPartyMessage(...)` and `fetchPartyMessages(...)`; they are text-only room messages.
- Chi'lly Chat direct messages use `chat_messages` with a `message_type = 'text'` check. `_lib/chat.ts` inserts only text, and `app/chat/[threadId].tsx` explicitly says media and reactions are not live yet.
- Reactions exist as emoji/floating room reactions and content relationship markers, not as comment attachments.
- There is no comment/reply table for universal Profile, Channel, Title, or VOD comments outside room/live/chat contexts.
- There is no attachment table, comment media bucket, storage policy, media picker, upload helper, thumbnail path, moderation queue, or RLS path for comment media.
- `safety_reports` exists for `participant`, `room`, and `title`, but not for `comment`, `message`, or `attachment` targets in the checked-in baseline constraint.

Public v1 recommendation:

- Keep text comments/reactions only where already intended and backed: watch-party rooms, Live Stage room comments, player room comments, Chi'lly Chat text, and existing reactions.
- Prioritize creator video upload to Channel/Profile before comment media.
- Do not allow full video uploads in live comments for Public v1.
- Do not add comment media UI until schema, storage, rate limits, moderation, deletion, and report targets exist.

Later comment media scope:

- Start with images in non-live surfaces, then consider short clips or voice notes with strict type, size, duration, and rate limits.
- Live comments should remain fast and safe. Full video uploads in live comments should be disallowed or heavily restricted even after v1.
- Required later pieces: canonical comment/thread tables or a deliberate extension of room/chat messages, `comment_attachments` or `message_attachments`, a `comment-media` storage bucket, owner/member/public RLS, moderation status, report target types for comment/message/attachment, delete/takedown paths, file scanning, thumbnail generation, and client upload progress/error states.

Later implementation order:

1. Finish Public v1 creator video upload first.
2. Decide whether Public v1 needs any universal text comments outside rooms/chat.
3. Design comment/thread/attachment ownership and report targets.
4. Add storage/RLS and moderation for image attachments.
5. Add non-live image comments first.
6. Re-evaluate short clips or voice notes after moderation proof.

## Public V1 Decision

### A. Already Working

- Canonical `/profile/[userId]` public profile/channel route.
- Self vs visitor differences on the profile route.
- Manage Channel handoff to `/channel-settings`.
- Channel settings as a signed-in owner control center.
- Profile access posture based on real defaults/permissions.
- Chi'lly Chat handoff from profile and chat routes.
- Public live/event visibility from backed creator events.
- Home/title/player/watch-party consumption of `titles`.
- Internal/admin title programming route.
- Likes/share markers, favorites, watch history, and title reports.

### B. Must Fix Before Public V1

- Complete Android runtime proof for basic creator video upload. The foundation exists and static validation passed, but physical-device picker/upload/player proof is still pending.
- Apply and verify the creator media migration in the target Supabase environment.
- Verify `videos` public/draft visibility with real owner and non-owner accounts.
- Verify creator management for edit metadata, unpublish/draft, and delete at runtime.
- Prove Watch-Party support for uploaded videos after the remote source-model migration; until that proof passes, keep unavailable states honest and do not claim runtime success.
- Add a normal-user explanation of where Profile ends and Channel begins, because the public route is unified and there is no separate `/channel` URL.

### C. Should Improve Before Public V1 If Easy

- Polish the owner-only Profile Channel empty-state CTA after Android proof.
- Add remote `poster_url` display support on Title Detail hero so remote-programmed titles look premium without requiring local assets.
- Add thumbnail file upload and category/genre metadata if the runtime proof is clean.
- Add a visible public follow/unfollow action only if the existing `channelAudience` helpers are intentionally ready for viewer use.
- Add clearer "platform programmed" vs "creator uploaded" language wherever `titles` drives a channel shelf.
- Keep text comments/reactions polished where they already exist.

### D. Later Phase / Do Not Build Now

- Native Chi'llywood game/video streaming.
- Full creator mini-platform builder.
- Drag/drop channel shelves and full visual theming.
- Advanced creator studio, automatic transcoding, moderation queue automation, paid media, subscriber-only media, and payouts.
- Comment media upload, including images, short clips, and voice notes.
- Subscriber-only creator media and creator payout surfaces.
- Full creator analytics for profile visits, content launches, retention, conversion, and gated views.
- Public VIP/mod/co-host audience roles.

### E. Unknown Until Backend/Runtime Proof

- Whether the live remote database has the same `videos` table/RLS state as checked-in generated types and baseline migration.
- Whether production storage buckets exist outside repo-owned migrations.
- Whether all admin title fields are present in live schema for every environment; the admin route probes capabilities defensively.
- Whether creator events are enough for public v1 live scheduling without adding a joinable event-to-room lifecycle.

## Native Game/Video Streaming Later Plan

Do not build this in public v1.

Current foundations that can support it later:

- LiveKit-backed Live Stage and Watch-Party Live runtime.
- Canonical Profile/Channel identity and owner handoff.
- `/channel-settings` creator control center.
- `creator_events` for scheduling live/video sessions.
- Player and Watch Party routes for content playback and shared viewing.
- Room/default access posture and creator permissions.

Missing infrastructure:

- native screen/game capture source integration
- stream-session schema distinct from watch-party room records
- stream ingest and recording lifecycle
- VOD asset creation from live streams
- storage buckets and signed upload/read policies
- transcoding/thumbnail pipeline
- creator dashboard for stream setup, health, clips, and archives
- moderation/safety flow for live streams and recorded streams
- entitlement/access rules for stream archives
- analytics for live attendance, stream retention, VOD conversion, and channel growth

Recommended future entry points:

- Profile: public "Live" and "Streams" modules only when backed by real stream/session truth.
- Channel Settings: "Streaming" owner section for setup, schedule, archive policy, and stream health.
- Live Stage: stay the runtime owner for live presence/watch-party video.
- Player: playback owner for stream archives/VOD.
- Creator Dashboard/Channel Settings: later owner for native game/video stream configuration, not public v1.

Phase recommendation: post-v1 or later. It should not block public v1 if Profile/Channel honestly communicate that uploaded/native streams are future capabilities.

## Recommended Next Fix Order

1. Apply the creator media migration in the target Supabase environment.
2. Connect Android hardware and run creator upload runtime proof.
3. Rebuild the dev client if `expo-document-picker` requires it.
4. Verify owner upload controls, public/draft visibility, Profile/Channel display, Player playback, edit, unpublish, and delete.
5. Prove live Supabase/RLS for creator videos, creator-video reports, moderation status, and premium entitlements.
6. Add thumbnail file upload and category/genre metadata after proof.
7. Improve Title Detail remote art support using existing `poster_url`/`thumbnail_url`.
8. Keep comment media post-v1; continue only text comments/reactions where already backed.
9. Defer native game/video streaming until after public v1 proof and Live Stage stability remain clean.
