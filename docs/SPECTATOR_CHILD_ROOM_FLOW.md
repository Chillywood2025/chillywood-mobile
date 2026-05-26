# Spectator Child Room Flow

## Purpose
Spectator is the public-safe watch-only discovery surface. It can show approved public playback and metadata, then let a signed-in viewer start their own child room around that source.

Spectator is not participant entry into the original room. A spectator never receives the original room's full LiveKit token, publish grants, speaker credentials, host controls, private room ids, member lists, raw playback storage paths, or raw private HLS paths.

## Spectator vs Participant
- Spectator watches a public-safe controlled playback endpoint and can share/report/view the source Platform.
- Participant joins a room through the room route and its existing membership, Premium, request-seat, request-speaker, and host-approval flows.
- Starting a child room from Spectator does not upgrade the viewer in the original room. Joining or speaking in the original room still uses the existing request/approve path before any upgraded token is issued.

## Child Room Linking
`spectator-start-room` creates a new `watch_party_rooms` row with `source_type = 'spectator_playback'` and the discovery item id as `source_id`. The safe linkage is stored in `spectator_child_room_sources`:

- `child_room_id`
- `source_item_id`
- `source_type`
- `source_owner_user_id`
- `source_platform_id`
- `source_public_playback_id`
- `root_source_id`
- `parent_room_id` only when safe
- `created_by_user_id`
- `created_at`

The link table and audit table have metadata checks that reject token, LiveKit, raw HLS, storage path, speaker credential, host-control, and secret-shaped metadata.

`root_source_id` prevents nested chains from becoming "a watch party of a watch party of a watch party." Child rooms resolve back to the original root source for attribution and analytics.

## Launch Status
Watch-Party Live from Spectator is wired:

- Spectator CTA: `Start Watch-Party Live`
- server action: `start_watch_party`
- child route: `/watch-party/[partyId]`
- shared Player route: `/player/[id]?source=spectator-playback&partyId=...`
- playback source: controlled `spectator-playback` resolver URL only

Live Watch-Party reaction rooms from Spectator are wired:

- Spectator CTA: `Start Live Watch-Party`
- alternate CTA copy: `Start Reaction Room`
- server action: `start_live_reaction`
- child route: `/watch-party/live-stage/[partyId]`
- route shows source attribution and keeps the child room's people/comments/live controls separate from the original source.

## Eligibility Rules
The client shows honest disabled copy, but the Edge Function is the authority. It checks:

- signed-in viewer
- source exists
- source is public discovery, public visibility, clean moderation, and public-safe rights
- source is not Premium-only, ticketed, subscription-only, private, deleted, blocked for the viewer, or ended without replay permission
- creator/source flags allow spectator view and the requested child-room type
- runtime controls allow the requested room type
- Premium gate policy remains aligned with the current Premium proof-hold helper
- rate limits for repeated actor attempts and child rooms per source
- `spectator_hls_playback_records` has public-safe live playback
- the backing `room_broadcast_sessions` row is public-safe approved

Clean denial errors are `sign_in_required`, `premium_required`, `source_not_public`, `source_reuse_disabled`, `source_not_found`, `source_ended`, `blocked`, and `rate_limited`.

## Creator Flags
The migration adds source-level flags on `discovery_feed_items`:

- `allow_spectator_view`
- `allow_watch_party_from_spectator`
- `allow_live_reaction_rooms`
- `allow_public_share`
- `allow_replay_watch_party`

Defaults are conservative: public-free, public-safe, spectator-playback-enabled rows may be backfilled on; private, protected, Premium-only, ticketed, subscriber-only, blocked, reported/restricted, and non-playback rows stay non-reusable.

## Audit
The Edge Function writes:

- `spectator_start_watch_party_attempt`
- `spectator_start_watch_party_success`
- `spectator_start_watch_party_denied`
- `spectator_start_live_reaction_attempt`
- `spectator_start_live_reaction_success`
- `spectator_start_live_reaction_denied`

Audit metadata includes actor/source/child ids, denial reason, created time, and security request context when captured. It does not log tokens or raw media paths.

## Runtime Proof
Android proof target is `R5CR120QCBF`. The follow-up fixture closeout restored the device proof environment enough for a current dev-client run: the notification shade was collapsed, the stale Dev Launcher error state was exited, Metro was restarted on `localhost:8081`, the app bundled successfully, deep links opened `/spectate/[itemId]`, and signed-in plus signed-out app-data states rendered on-device. UiAutomator can see the launcher after cleanup but still returns `null root node` once the React Native app is foregrounded, so app proof used `screencap`.

Closeout screenshots are outside the repo at `/tmp/chillywood-spectator-child-room-proof-20260526/`:

- `00-device-root-restored-launcher.png`: Android root restored and UiAutomator could see the launcher.
- `02-app-after-attached-metro.png`: Dev Launcher saw the attached Metro server.
- `03-app-home-after-bundle.png`: current app bundle reached Home; Home reported no public live rooms.
- `05-eligible-spectator-playback-fixture.png`: eligible public-safe Spectator fixture rendered playback metadata and a real playback frame.
- `06-eligible-spectator-start-cta.png`: eligible fixture showed `Start Watch-Party Live`, `Watch with your Chi'lly Circle`, Share, View Platform, and Report.
- `07-created-watch-party-live-child-room.png`: `Start Watch-Party Live` created child room `5SR4TQ` and routed to `/watch-party/[partyId]`.
- `08-watch-party-child-room-source-attribution-after-load.png`: child room showed `Watching Chi'llwood Safe Playback Fixture from Chi'llwood Safe Fixtures` with no original host controls or original member list.
- `09-watch-party-child-shared-player-safe-source.png` and `10-watch-party-child-shared-player-playing.png`: the shared Player opened the spectator source through the controlled resolver and loaded the source duration. The Android shared-player screenshot did not capture visible video frames, so only the source load/duration and Spectator-page playback frame are claimed.
- `12-signed-out-start-cta-visible.png` and `13-signed-out-start-login-handoff.png`: signed-out eligible Spectator showed the CTA and handed off to login without room creation.
- `15-source-ended-disabled-cta.png`: ended live-stage fixture showed `Source live has ended`, disabled `Start Live Watch-Party`, disabled `Start Reaction Room`, and did not create a room.
- `16-reuse-disabled-spectator-cta.png`: reuse-disabled fixture showed the watch-party-disabled state and did not create a room. Client/server copy is now pinned to `This live can’t be used for a watch party`.
- `17-private-source-unavailable.png`: private fixture rendered the production unavailable state.

Backend/runtime hardening in this closeout:

- Remote migration `202605260003_spectator_child_room_source_links.sql` was applied after normalizing mixed text/UUID RLS comparisons in `spectator_child_room_sources_member_select`.
- `spectator-start-room` was deployed with `verify_jwt = false` because the function performs its own user-token authentication and must return the clean `sign_in_required` denial for signed-out callers.
- `source_not_found` now returns the clean `This source is not available.` message.
- Backend denial proof returned `sign_in_required` for signed-out calls and `source_not_found` for missing Watch-Party Live and Live Watch-Party source ids, with no `childRoomId`, original token, or full-room token fields.
- Migration `202605260004_spectator_child_room_safe_fixtures.sql` adds proof-scoped public-safe eligible, ended, reuse-disabled, private, and blocked Spectator fixtures without exposing private real user data.
- Migration `202605260005_spectator_anon_public_safe_read.sql` allows signed-out Spectator reads only for explicitly public-free, clean, public-safe rows that allow spectator view; room creation still requires the authenticated `spectator-start-room` server checks.
- `spectator-playback` now emits `https://` controlled playlist/segment URLs for deployed Edge Function requests even when the platform forwards an internal `http://` request origin. This keeps the mobile HTTPS-only playback resolver guard intact and does not expose raw HLS paths.
- Eligible Watch-Party Live child-room proof created one child link in `spectator_child_room_sources`: `child_room_id = 5SR4TQ`, source item `fc63e1ba-d744-4350-9a96-a6ef5f35491e`, root source `spectator_fixture_content_20260526`, safe public playback id `abba8e59-3cd2-4306-93e4-6ac7f93a76f3`, and no parent original-room credential.
- Backend denial proof returned `source_not_public` for the private fixture, `blocked` for the blocked fixture, `source_ended` for the ended fixture, and `source_reuse_disabled` for the reuse-disabled fixture, with no child room id or token fields.
- Controlled resolver proof fetched the public-safe playlist and a controlled segment through `spectator-playback`; the client-facing response kept the raw playback path private.

Validation run in the closeout:

- `npm run typecheck`
- `npm run validate:runtime`
- `npm run guard:spectator-child-room-policy`
- `npm run guard:watch-party-livekit`
- `npm run guard:old-room-handling`
- `npm run guard:refresh-policy`
- `npm run guard:payment-rail-policy`
- `npm run guard:creator-monetization-policy`
- `npm run guard:provider-readiness-policy`
- `npm run guard:clip-studio-policy`
- `npm run guard:platform-brand-studio-policy`
- `supabase migration list`
- `supabase db lint --linked`
- `supabase db push --dry-run`
- `deno check supabase/functions/spectator-start-room/index.ts`
- `deno check supabase/functions/spectator-playback/index.ts`
- targeted token/private-source/Mini Platform/source-eligibility/route-ownership/Premium/old-room grep proofs
- `git diff --check`
- `git diff --cached --check`

Fixture status:

- Eligible content/player Watch-Party Live launch is runtime-proved on Android with a proof-scoped public-safe fixture.
- Signed-out login handoff is runtime-proved from the eligible fixture; no room was created and no token fields were returned.
- Private, ended, and reuse-disabled UI states are runtime-proved where fixture routing allowed. Blocked/private/source-ended/reuse-disabled server denials are also proved.
- Live Watch-Party / Reaction Room successful child launch is not runtime-proved. A true live-stage-compatible public-safe source was not created because using a VOD HLS fixture as a live-stage source would fake live status.
- Replay child-room launch is not runtime-proved because no replay archive fixture was available.

## Remaining Limitations
- A true live-stage-compatible public-safe source is still needed to prove successful `Start Live Watch-Party` / `Start Reaction Room` child creation on Android.
- Replay child-room creation is schema-flagged but live replay archive behavior still depends on replay playback availability and a safe archive fixture.
- The Android shared Player loaded the spectator source/duration, but the captured child-player screenshots did not show visible video frames. The eligible Spectator page did show a real playback frame.
- UiAutomator still cannot dump the React Native root node while the app is foregrounded, so visual proof remains screenshot-based.
- Cost policy is a simple server-side attempt/source rate limit in this lane; richer cost dashboards can build on `spectator_child_room_sources` and audit rows.
