# NEXT TASK

## Exact Next Task
Complete the remaining Creator Media public/draft and owner/non-owner runtime checks, then run two-device creator-video Watch-Party join/rejoin proof if practical. The Live Layout and Chi’llyfects foundation is now implemented but not runtime-proved; include it in the later live/two-device proof rather than treating this static pass as proof. Real Chi’llyfects AR processing is post-v1. The Snap Camera Kit audit in `docs/CHILLYFECTS_SNAP_CAMERA_KIT_AUDIT.md` is planning input only; do not start Snap Camera Kit, DeepAR, MediaPipe processing, custom WebRTC frame processors, or any native AR SDK before Public v1. Follow `docs/LIVE_WATCH_PARTY_LAYOUT_LOCK.md`: preserve the approved major layout structure, keep comments in their current visible placement, and treat controls as flexible only when the user explicitly requests a control change.

Non-proof launch-readiness bookkeeping now lives in `docs/PUBLIC_V1_READINESS_CHECKLIST.md`, with external dashboard/manual setup tracked separately in `docs/EXTERNAL_SETUP_PUBLIC_V1_CHECKLIST.md` and command-center ownership/order in `docs/DASHBOARD_SETUP_COMMAND_CENTER.md`. The tracker now uses exact launch statuses only, and this follow-up removed developer-facing discovery empty-state copy plus raw Player source/Watch-Party console logs. Keep the next hands-on proof lane focused on Creator Media public/draft, owner/non-owner, Premium blocked-state, and creator-video Watch-Party two-device proof rather than starting later-phase systems.

The Public v1 hardening migrations through `202604260004_tighten_watch_party_room_rls.sql` are now applied to the remote Supabase project. `supabase migration list` shows local and remote aligned from `202604190004` through `202604260004`; the remote schema dump confirms `watch_party_rooms.source_type`, `watch_party_rooms.source_id`, the source validation trigger, and the tightened membership insert policy. Rollback-only remote SQL proof saved at `/tmp/chillywood-remote-creator-video-watch-party-proof-20260426-114433.txt` confirmed platform-title source persistence, public/clean creator-video source persistence, draft/hidden creator-video source blocking, open room membership insert, premium room membership blocking without entitlement, and anon room-create denial. Local Supabase is still running; `supabase migration up --local` and a fresh `supabase db reset` previously passed, and focused local RLS proof still covers creator video metadata, storage read/write policy intent except Storage API delete, moderation/safety reports, premium/billing entitlements, creator events, notifications, reminders, and Watch-Party room access.

The foundation is implemented in code and static validation passed. Android proof on device `R5CT30GM6NY` now confirms `/channel-settings` opens, the owner Content panel renders, the native Android file picker opens from `Choose Video File`, selected file name appears, Upload visibly enters an uploading state, and metadata/storage save succeeds for creator video `f6a5c96a-812a-4132-8a2b-e3ecab51c983` in the private `creator-videos` bucket path. Human device proof also confirmed tapping an uploaded video card opens the standalone Player for the creator video rather than the platform/admin title surface or bundled sample fallback. The follow-up Player proof confirmed `/player/5cf469eb-d375-436a-861a-e82ece5cc47d?source=creator-video` uses the same premium Player shell as `/player/t1`, resolves the uploaded creator-video source as `remote`, does not log signed URLs, and does not fall back to sample/platform media. Creator-upload Watch-Party linking code, remote schema, and one-device Android runtime proof now pass: device `R5CR120QCBF` uploaded/published `20260326_113131`, opened `/player/677650c2-4790-4298-8ddb-03ba7df5b424?source=creator-video`, started Watch-Party Live into normal waiting room/Party Room room code `87AXTR`, opened the shared Watch-Party Live player with creator-video source, and direct-rejoined the Party Room after the false "Room not found" bootstrap state was fixed.

Route/owner audit hardening is now handled for the highest-priority findings: `app/modal.tsx` no longer renders template UI, `/communication` redirects to `/chat`, `app/lib/_supabase.ts` is only a compatibility export for the canonical Supabase client, and missing platform Player ids show an honest unavailable state instead of the first local/sample title. The 2026-04-28 room behavior pass also hardened proved room-owner risks: no-source Party waiting room create/code paths now block honestly instead of creating live rooms, invalid platform title ids no longer fall back to the first title, Live Stage rejects non-live Party Room ids, Player Watch-Party Live rejects live room ids and preserves platform source context when falling back to the waiting room, and the `livekit-token` edge function rejects Live Stage / Watch-Party Live surface mismatches. A focused Supabase Edge Function pass deployed `livekit-token` version 8 and proved the surface guardrails remotely with redacted token output: valid live-stage and watch-party-live requests succeeded, while cross-surface mismatches returned `409 room_surface_mismatch`. The new live layout/Chi’llyfects foundation keeps Home Live Watch-Party people-first in Live Stage, gives Live First and Live Watch-Party the same remote-feed overlay behavior, excludes the current user's own preview from the Chi'lly Party Members grid, keeps Player Watch-Party Live content-first in Party Room with the content/source surface above a five-across, two-row-visible host/viewer feed grid, and marks non-Off Chi’llyfects as later real-processing work. `docs/LIVE_WATCH_PARTY_LAYOUT_LOCK.md` now protects that approved structure, the current visible comments placement, and the approved 10-second Live Stage overlay/comments auto-hide behavior on both initial Live Room entry and Live First / Live Watch-Party mode switches; Lock Controls keeps it visible. Do not move comments into a tap menu, drawer, modal, bottom sheet, overlay-only surface, hidden secondary panel, or menu-only replacement unless the user explicitly asks for a comments redesign. Chicago Streets is now open-access in the linked remote Supabase project through `supabase/migrations/202604270001_open_chicago_streets_title.sql`. Do not re-open those items unless validation or runtime proof shows a regression.

## Current Plan
1. Connect at least one physical Android device.
2. Confirm the device is visible with `adb devices -l`.
3. Reopen `/channel-settings` as the creator owner and confirm uploaded video `f6a5c96a-812a-4132-8a2b-e3ecab51c983` appears in the Content list.
4. Confirm a draft video does not appear for public/non-owner viewers.
5. Publish the video and confirm it appears for public/non-owner viewers on Profile/Channel.
6. Confirm creator can edit metadata, publish/unpublish, and delete.
7. Confirm a non-owner cannot manage another creator's video.
8. Use the now-proved remote schema; do not rerun broad remote migration pushes unless `supabase migration list` shows drift.
9. Run two-device creator-video Watch-Party join proof if two phones are available: host starts room, second device joins by code, both resolve `source_type=creator_video`, no Live Stage route, no sample/platform fallback.
10. Confirm draft/private creator videos are blocked from public Watch-Party.
11. Include the 2026-04-28 route hardening in final route smoke: generic Party waiting room no-source create/code guards, invalid platform title unavailable state, direct Live Stage open with a Party Room id, Player Watch-Party Live open with a live room id, and app behavior against the deployed `livekit-token` surface mismatch guard.
12. In a later live-layout proof, follow `docs/LIVE_WATCH_PARTY_LAYOUT_LOCK.md` and confirm Home Live Watch-Party routes to `/watch-party/live-stage/[partyId]`, Live First and Live Watch-Party share the same Chi'lly Party Members overlay behavior, the current user's own preview is not inside that grid, other live feeds render three across with two visible rows before scrolling, free/access-granted viewers can watch without becoming a camera tile, comments remain in their current visible placement, the overlay/comments dock auto-hides after 10 seconds on initial Live Room entry and after mode switches unless controls are locked or an active panel/input is open, and Chi’llyfects opens as foundation-only/no-camera-processing.
13. Do not pull Snap Camera Kit into Public v1. If Snap Camera Kit is revisited post-v1, follow `docs/CHILLYFECTS_SNAP_CAMERA_KIT_AUDIT.md`: Android-only, no production claim, keep layout/comments locked, and prove a second LiveKit device sees the processed feed before marking any Chi’llyfect as real.
14. In a later Party Room proof, follow `docs/LIVE_WATCH_PARTY_LAYOUT_LOCK.md` and confirm platform and creator Watch-Party Live remain content-first in `/watch-party/[partyId]`, with the shared source card at the top, host/viewer feed bubbles below it in a five-across/two-visible-row scroll grid, comments remain in their current visible placement, and no Live Stage route.
15. Confirm creator-video Report in Player writes a real `safety_reports` row with target type `creator_video`.
16. As owner/operator, hide/remove a creator video from `/admin` and confirm it no longer appears publicly or plays publicly.
17. Confirm active backend entitlement rows allow protected access while missing/expired/revoked rows block protected access.
18. Prove creator-video Storage API delete/remove behavior; direct SQL delete is intentionally blocked by Supabase's `storage.protect_delete()` trigger.

## Scope
This proof lane should:
- keep the creator upload implementation scoped to Profile, Channel Settings, Player, `videos`, and `creator-videos` storage
- preserve Live Stage / Watch-Party Live runtime fixes
- avoid comment media upload
- avoid native game streaming
- avoid Snap Camera Kit, DeepAR, MediaPipe processing, custom WebRTC frame processors, native AR SDKs, and real Chi’llyfects AR processing before Public v1
- avoid paid/subscriber videos, payouts, automatic transcoding, and advanced creator studio
- keep unrelated proof workflow files out of the commit

## Validation
- `npm run typecheck`
- `npm run lint`
- `git diff --check`
- Android runtime proof on the connected physical device

## Latest Runtime Proof Artifact

- Folder: `/tmp/chillywood-proof-2026-04-25T16-43-07-920Z-creator-media-upload-submit-retry`
- Device: `R5CT30GM6NY`
- Result: `/channel-settings` Content panel and native picker were reached; selected video upload saved metadata/storage for creator video `f6a5c96a-812a-4132-8a2b-e3ecab51c983`; human proof confirmed tapping the uploaded video card opened standalone Player; screenshot artifact `player-after-upload-card-tap.png` also captured the honest "Watch-Party Live not ready" block for uploaded creator videos.

## Latest Player Alignment Proof Artifact

- Folder: `/tmp/chillywood-proof-2026-04-25T17-27-25-889Z-creator-video-premium-player-shell`
- Device: `R5CT30GM6NY`
- Result: `/player/t1` platform title shell remained unchanged; `/player/5cf469eb-d375-436a-861a-e82ece5cc47d?source=creator-video` used the same premium standalone Player shell and resolved the uploaded creator-video source; logcat showed `PLAYER MATCH SOURCE: matched from creator-video:id` and `PLAYER VIDEO SOURCE: remote`; invalid creator-video source stayed inside the premium shell with "Creator video unavailable"; Watch-Party Live stayed blocked with not-ready copy.

## Latest Creator-video Watch-Party Proof Artifact

- Folder: `/tmp/chillywood-android-creator-video-watch-party-proof-20260426-115259`
- Device: `R5CR120QCBF`
- Result: one-device Android runtime proof passed for creator video `677650c2-4790-4298-8ddb-03ba7df5b424` / `20260326_113131`. Platform title `Chicago Streets` still entered normal waiting room and Party Room. Creator video entered normal waiting room, Party Room `87AXTR`, and shared Watch-Party Live player with `source=creator-video`; remote row persisted `source_type=creator_video`, no Live Stage route was used, and no platform/sample fallback appeared. Direct rejoin to `/watch-party/87AXTR` now renders the Party Room after the scoped bootstrap false-not-found fix in `app/watch-party/[partyId].tsx`.

## Success Criteria
The lane is successful when:
- owner upload controls are visible only to the owner
- public viewers cannot see upload/manage controls
- upload saves video metadata and storage object
- public videos appear on Profile/Channel for public viewers
- draft videos stay owner-only
- hidden/removed creator videos stay unavailable publicly and in Player
- uploaded videos open and play in Player with `source=creator-video`
- creator-video reports create real safety report rows
- premium/protected access uses backend entitlement or RevenueCat truth, not local-only cache
- creator management actions work for owner and are denied for non-owner
- creator-upload Watch-Party uses the normal party flow with the remote source-model migration now applied and proved
- no comment media upload, native game streaming, monetization, payout, or transcoding scope is introduced
- staged files stay task-pure
