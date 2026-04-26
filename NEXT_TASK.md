# NEXT TASK

## Exact Next Task
Complete the remaining Creator Media public/draft and owner/non-owner runtime checks.

Also apply/prove the new Public v1 hardening migrations in a live Supabase environment: `202604260001_billing_entitlement_foundation.sql` and `202604260002_creator_video_moderation_foundation.sql`. Local Supabase/RLS proof was attempted with Supabase CLI `2.75.0`, but `supabase status` could not connect to Docker, so current RLS proof is static-only.

The foundation is implemented in code and static validation passed. Android proof on device `R5CT30GM6NY` now confirms `/channel-settings` opens, the owner Content panel renders, the native Android file picker opens from `Choose Video File`, selected file name appears, Upload visibly enters an uploading state, and metadata/storage save succeeds for creator video `f6a5c96a-812a-4132-8a2b-e3ecab51c983` in the private `creator-videos` bucket path. Human device proof also confirmed tapping an uploaded video card opens the standalone Player for the creator video rather than the platform/admin title surface or bundled sample fallback. The follow-up Player proof confirmed `/player/5cf469eb-d375-436a-861a-e82ece5cc47d?source=creator-video` uses the same premium Player shell as `/player/t1`, resolves the uploaded creator-video source as `remote`, does not log signed URLs, does not fall back to sample/platform media, and keeps Watch-Party Live blocked with honest not-ready copy.

## Current Plan
1. Connect at least one physical Android device.
2. Confirm the device is visible with `adb devices -l`.
3. Reopen `/channel-settings` as the creator owner and confirm uploaded video `f6a5c96a-812a-4132-8a2b-e3ecab51c983` appears in the Content list.
4. Confirm a draft video does not appear for public/non-owner viewers.
5. Publish the video and confirm it appears for public/non-owner viewers on Profile/Channel.
6. Confirm creator can edit metadata, publish/unpublish, and delete.
7. Confirm a non-owner cannot manage another creator's video.
8. Confirm creator-video Report in Player writes a real `safety_reports` row with target type `creator_video`.
9. As owner/operator, hide/remove a creator video from `/admin` and confirm it no longer appears publicly or plays publicly.
10. Confirm active backend entitlement rows allow protected access while missing/expired/revoked rows block protected access.
11. Re-check uploaded card Player routing only if a later edit touches Player, Profile cards, Channel Settings cards, or creator-video source resolution.

## Scope
This proof lane should:
- keep the creator upload implementation scoped to Profile, Channel Settings, Player, `videos`, and `creator-videos` storage
- preserve Live Stage / Watch-Party Live runtime fixes
- avoid comment media upload
- avoid native game streaming
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
- Watch-Party Live for uploaded videos remains honestly blocked until a real linking pass
- no comment media upload, native game streaming, monetization, payout, or transcoding scope is introduced
- staged files stay task-pure
