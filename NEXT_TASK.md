# NEXT TASK

## Exact Next Task
Complete Android runtime proof for the Public v1 Creator Media System foundation.

The foundation is implemented in code and static validation passed. A partial Android pass on device `R5CT30GM6NY` rebuilt and installed the dev client, opened `/channel-settings`, confirmed the owner Content panel, and confirmed the native Android file picker opens from `Choose Video File`. Full upload proof is still pending because no selectable local media appeared in the system picker during the pass.

## Current Plan
1. Connect at least one physical Android device.
2. Confirm the device is visible with `adb devices -l`.
3. Make a real video file selectable in Android's system picker, for example by recording a short clip on-device or otherwise importing media through a picker-visible provider.
4. Open the owner account's `/profile/[userId]` route and confirm owner-only upload CTAs are visible only on the owner view.
5. Open `/channel-settings` and confirm the `Content` / `Upload Video` lane is visible to the signed-in owner.
6. Upload the real local video file through the picker.
7. Confirm metadata saves to `videos` and storage writes to the `creator-videos` bucket path.
8. Confirm the uploaded video appears on the creator's Profile/Channel content tab.
9. Open the uploaded video in `/player/[id]?source=creator-video` and confirm real playback, not a placeholder.
10. Confirm a draft video does not appear for public/non-owner viewers.
11. Confirm a public video appears for public/non-owner viewers.
12. Confirm the creator can edit metadata, publish/unpublish, and delete.
13. Confirm a non-owner cannot manage another creator's video.
14. Confirm Watch-Party Live stays honestly blocked for uploaded videos until uploaded-video room linking is implemented.

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

## Latest Partial Proof Artifact

- Folder: `/tmp/chillywood-proof-2026-04-25T13-57-18-617Z-creator-media-android-runtime`
- Device: `R5CT30GM6NY`
- Result: dev client rebuild/install passed after fixing duplicate WebRTC native ownership; `/channel-settings` Content panel and native file picker were reached; upload/playback/public-draft proof is still pending because the picker had no selectable local media.

## Success Criteria
The lane is successful when:
- owner upload controls are visible only to the owner
- public viewers cannot see upload/manage controls
- upload saves video metadata and storage object
- public videos appear on Profile/Channel for public viewers
- draft videos stay owner-only
- uploaded videos open and play in Player with `source=creator-video`
- creator management actions work for owner and are denied for non-owner
- Watch-Party Live for uploaded videos remains honestly blocked until a real linking pass
- no comment media upload, native game streaming, monetization, payout, or transcoding scope is introduced
- staged files stay task-pure
