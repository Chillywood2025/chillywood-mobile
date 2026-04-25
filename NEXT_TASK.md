# NEXT TASK

## Exact Next Task
Run Android runtime proof for the Public v1 Creator Media System foundation.

The foundation is implemented in code and static validation passed, but Android/runtime proof is intentionally deferred because `adb devices -l` showed no connected Android devices during closeout.

## Current Plan
1. Connect at least one physical Android device.
2. Confirm the device is visible with `adb devices -l`.
3. Rebuild or reinstall the dev client if the new native `expo-document-picker` dependency requires it.
4. Open the owner account's `/profile/[userId]` route and confirm owner-only upload CTAs are visible only on the owner view.
5. Open `/channel-settings` and confirm the `Content` / `Upload Video` lane is visible to the signed-in owner.
6. Upload a real local video file through the picker.
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
