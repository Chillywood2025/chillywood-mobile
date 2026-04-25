# Profile Channel Content Audit

Date: 2026-04-24

Repo root: `/Users/loverslane/chillywood-mobile`
Branch audited: `main`
HEAD audited: `8d6f62fa8e73288d6ed7347076dd5002ad9bb15a`

Unrelated dirty files at audit start:

- `.gitignore`
- `NEXT_TASK.md`
- `docs/LIVE_STAGE_TWO_DEVICE_PROOF.md`
- `scripts/proof-live-stage-video-check.sh`

This audit is documentation only. It does not change product code, schema, Live Stage, token ownership, upload behavior, or route ownership.

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
- `app/admin.tsx`
- `_lib/userData.ts`
- `_lib/channelReadModels.ts`
- `_lib/channelAudience.ts`
- `_lib/contentEngagement.ts`
- `_lib/mediaSources.ts`
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
| Public content discovery | `app/(tabs)/index.tsx`, `app/profile/[userId].tsx`, `app/title/[id].tsx`, `_data/titles`, `_lib/mediaSources.ts` |
| Platform/admin programming | `app/admin.tsx`, `_lib/appConfig.ts`, `_lib/monetization.ts`, `_lib/moderation.ts` |
| Viewer engagement | `app/title/[id].tsx`, `app/player/[id].tsx`, `_lib/contentEngagement.ts`, `_lib/userData.ts` |
| Live/watch-party links | `app/watch-party/index.tsx`, `app/watch-party/[partyId].tsx`, `app/watch-party/live-stage/[partyId].tsx`, `_lib/watchParty.ts`, `_lib/communication.ts` |
| Schema truth | `supabase/database.types.ts`, `supabase/migrations/*`, `supabase/migrations_legacy/*` |

## Current Profile Truth

`/profile/[userId]` is already a connected person/channel surface, not a plain account page. It renders:

- public identity: display name, handle, avatar, tagline, role, official account badges, live/off-air state, and room context state
- public channel framing: "Your Channel", "Creator Channel", "Host Channel", or official concierge copy
- primary actions: Chi'lly Chat, Live Events or Join Live when real context exists, Watch Party or Watch-Party Live when backed context exists
- channel access posture: browse, Watch Party, and Chi'lly Chat access cards backed by user profile defaults and creator permissions
- channel tabs: Home, Content, Live, Community, About
- public content/programming cues from real `titles` rows, including hero, featured, trending, and top-row programming
- public live/event summaries from backed `creator_events` and reminder summaries
- owner mode on the same route when the signed-in user matches the route user id
- owner-only handoff card and quick actions to `Manage Channel` and Chi'lly Chat
- report/safety path for non-self profiles

The self vs public viewer experience is different enough at the control level: self-view gets owner stats, owner prompts, and Manage Channel; visitors get chat/call/report style actions and public channel copy. The distinction is still visually subtle because both modes share one public route by design.

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

Channel settings does not yet support:

- uploading actual creator videos
- choosing uploaded channel shelves from a creator-owned media library
- true visual design controls beyond current layout preset and planned design chips
- avatar or hero image upload
- public/private/subscriber content access on uploaded creator content
- deleting/managing creator-owned VOD/media from a channel library
- native game/video streaming source management

## Profile <-> Channel Integration

Working connections:

- Home opens the signed-in user's canonical `/profile/[userId]` route from the avatar button.
- Profile self-view opens `/channel-settings` via Manage Channel.
- Profile visitor view opens Chi'lly Chat direct threads through `/chat/[threadId]`.
- Profile can hand back into live/watch-party routes when real room or scheduled title context exists.
- Profile reads channel defaults and layout posture from `user_profiles`.
- Channel settings writes the same `user_profiles` fields that profile reads.
- Channel settings reads the same creator/event/audience/permission state surfaced publicly where appropriate.

Confusing or missing connections:

- "Channel" is real in the UI but has no standalone public URL, so a user expecting a separate Channel destination may not know that Profile is the Channel home.
- The Content tab currently reflects platform-programmed titles, not the creator's own uploaded channel library.
- Owner prompts mention building public shelves, but there is no self-serve shelf builder or upload flow attached to that prompt yet.
- Channel settings has a "Content" build-next panel, but no current content manager beyond creator events.
- The app has both `titles` and `videos` schema truth, but the route experience is driven mostly by `titles`; `videos` is not wired into the current Profile/Channel public experience.

No route drift was found against doctrine. `/profile/[userId]` and `/channel-settings` match the control files.

## Add-Content Flow Truth

Current user-facing add/content management paths:

- `/channel-settings` can create and edit `creator_events`.
- `/channel-settings` can link Watch-Party Live events to an existing title id.
- `/admin` can create/edit platform `titles` with title, category, year, runtime, synopsis, poster URL, thumbnail URL where present, video URL, preview URL where present, status, release date, sort order, hero/featured/trending/top-row flags, access rule, ads, sponsor placement, and sponsor label.

What does not exist for normal creators:

- no creator upload route
- no file picker or media picker for video/poster/thumbnail upload
- no Supabase Storage upload call for creator videos, thumbnails, or avatars
- no creator-facing content list tied to `owner_id` or `channel_id`
- no self-serve create/edit/delete flow for channel VODs
- no channel shelf picker using creator-owned media
- no creator content category/genre visibility workflow outside internal/admin `titles`

Where content goes today:

- Admin-created titles go into `titles`.
- Home, Profile Content tab, Title Detail, Player, and Watch-Party Live all read from `titles`.
- User favorites go into `user_list` and AsyncStorage fallback.
- Likes/share markers go into `user_content_relationships`.
- Creator events go into `creator_events` and can appear on Profile Live tab.
- The `videos` table exists with `owner_id`, `title`, `description`, `playback_url`, and `thumb_url`, but no app route found reads or writes it for the current profile/channel experience.

Ease assessment: confusing for a normal creator. The app says "channel" and "lineup" clearly, but a creator cannot yet add a video to their channel from the creator-facing route. The only real content creation path is internal/admin URL-entry programming, not a normal upload flow.

## Viewer Content Experience

Already working or partly working:

- Home renders programmed title rails and opens `/title/[id]` or `/player/[id]`.
- Profile Content tab shows real programming cues and can jump to `/title/[id]`.
- Title Detail supports Play, Favorites, Like, Mark Shared, Report, and Watch-Party Live entry when active rooms exist.
- Player opens title video sources from `video_url` or local fallback.
- Watch-party routes connect titles to room/live experiences.
- Profile Live tab shows backed creator events and reminder enrollment state where available.

Gaps:

- Profile/channel content cards are not a creator-owned library. They are platform title programming cues.
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

Creators cannot currently:

- upload a video or thumbnail
- manage a creator-owned content library
- edit/delete uploaded media from channel settings
- pick shelves/sections from creator-owned content
- set per-upload visibility/access
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

Creator permissions and monetization flags:

- `creator_permissions`: premium title publishing, Party Pass room defaults, premium room defaults, sponsor placements, player ads.
- `_lib/monetization.ts`
- `app_configurations`: global feature/config/branding/monetization switches.

Content/player:

- `titles`: platform title programming table used by Home, Profile Content, Title Detail, Player, Watch Party, and Admin.
- `videos`: owner-owned video table exists, with public read and owner insert/update/delete policies, but no current app route integration was found.
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

- No active Supabase Storage bucket migration or product upload code was found outside `supabase/.temp` metadata.
- No active `supabase.storage.from(...)` media upload flow was found in app code.
- Current media entry uses URL fields, local assets, and fallback media rather than first-party storage uploads.

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

- Make the creator "add content" truth explicit in-product. Either hide/soften channel shelf prompts that imply self-serve content upload, or add a small honest creator content manager lane backed by current schema.
- Decide whether public v1 content is platform-programmed only or creator-upload capable. The current UI language leans creator-channel, but the data path is platform `titles`.
- Connect or intentionally defer the `videos` table. It currently looks like creator-owned media schema, but is not part of the route experience.
- Add a normal-user explanation of where Profile ends and Channel begins, because the public route is unified and there is no separate `/channel` URL.

### C. Should Improve Before Public V1 If Easy

- Add a clear empty-state CTA in Profile Content/owner mode that points to the truthful current action: schedule a live event, manage channel basics, or "content upload coming later".
- Add remote `poster_url` display support on Title Detail hero so remote-programmed titles look premium without requiring local assets.
- Make Channel Settings "Content" panel say explicitly that upload/shelf management is not live yet.
- Add a visible public follow/unfollow action only if the existing `channelAudience` helpers are intentionally ready for viewer use.
- Add clearer "platform programmed" vs "creator uploaded" language wherever `titles` drives a channel shelf.

### D. Later Phase / Do Not Build Now

- Native Chi'llywood game/video streaming.
- Full creator mini-platform builder.
- Drag/drop channel shelves and full visual theming.
- Native VOD upload pipeline, transcoding, thumbnails, and moderation queue.
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

1. Product copy and empty-state cleanup: make Profile Content and Channel Settings Content truthful about current platform-programmed titles vs future creator upload.
2. Decide public v1 content ownership: platform `titles` only, or creator `videos` integration.
3. If creator upload is in public v1, create a narrow `videos`-backed content manager in `/channel-settings` before any visual redesign.
4. If creator upload is not in public v1, hide upload implications and keep content as programmed titles plus live events.
5. Improve Title Detail remote art support using existing `poster_url`/`thumbnail_url`.
6. Add storage bucket/policy migrations only when upload is actually implemented.
7. Defer native game/video streaming until after public v1 proof and Live Stage stability remain clean.
