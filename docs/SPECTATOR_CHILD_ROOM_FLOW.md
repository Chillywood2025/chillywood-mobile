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
Android proof target is `R5CR120QCBF`. The device was attached during this lane, and a current-device screenshot plus note were written outside the repo at `/tmp/chillywood-spectator-child-room-proof-20260526/`.

The requested flow screenshots were not captured because the installed app was in a Dev Launcher error/notification-shade state, UiAutomator returned no root node, and no safe eligible public-safe source, private/blocked source, signed-out fixture, or ended-source fixture was available in this terminal context. This remains a required follow-up proof lane and should not be faked.

## Remaining Limitations
- Replay child-room creation is schema-flagged but live replay archive behavior still depends on replay playback availability.
- Android visual proof still needs an eligible public-safe source, resulting child rooms, original-control absence, an ineligible/private fixture, a signed-out launch handoff, and a source-ended fixture.
- Cost policy is a simple server-side attempt/source rate limit in this lane; richer cost dashboards can build on `spectator_child_room_sources` and audit rows.
