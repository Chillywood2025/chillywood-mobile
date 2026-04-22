# NEXT TASK

## Exact Next Task
There is one remaining narrow code-side blocker on current repo truth: the visible lower Live Stage interaction zone is still not deterministic enough on Android to close single-device interaction proof honestly, even though route entry and runtime stability are now real again. The next move should be a tight `Live Stage lower interaction reliability` follow-up on `app/watch-party/live-stage/[partyId].tsx`, and only after that should final two-phone on-stage interaction proof be retried.

## Current Plan
1. Preserve the current truthful product baseline exactly as landed across profile, watch-party/live, chat, title/player, settings/legal/support, channel settings, and bounded admin.
2. Carry forward the completed single-device proof on Home, profile, title, standalone player entry, watch-party/live owners, chat, channel settings, settings, support, and public legal surfaces.
3. Carry forward the completed two-phone proof on Party Room host/viewer behavior, pre-stage Live Room host/viewer behavior, cross-device invite/thread handoff, locked-room denial, and Live Stage route entry on both phones.
4. Keep the landed Party Room invite open-path, room-aware invite search, watch-party lane-switch, locked-room denial, dev-only live-room invite autolaunch removal, and prior Live Stage interaction polish/touch hardening intact without widening them into new product work.
5. Keep the new Android Live Stage runtime fixes intact:
   the legacy RTC renderer must stay disabled inside the native LiveKit stage owner on Android, and the LiveKit stage room must keep the contained signal read-loop behavior that avoids the earlier dev-client websocket/Event overlay.
6. Finish the still-open Live Stage lower interaction reliability work for mode toggle, comment focus/send, lower-lane reaction triggers, and `CAMERA LOOKS` interaction on one real Android device before retrying final two-phone on-stage interaction proof.
7. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- do not widen beyond the narrow Live Stage interaction proof lane
- keep the verified single-device and two-phone proof baseline intact everywhere else
- keep the landed Party Room invite, room-aware invite search, locked-room denial, live-room autolaunch, prior Live Stage interaction polish, and the new Android Live Stage runtime fixes intact
- fix the lower interaction zone on `app/watch-party/live-stage/[partyId].tsx` without widening into a redesign
- re-prove the lower interaction zone on one real Android device before attempting final two-phone on-stage proof
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve all current canonical route owners and landed doctrine exactly as-is
- keep the current social baseline, monetization/access truth, and no-fake-comments/no-fake-ads doctrine intact
- use `docs/native-friend-graph-implementation-spec.md` as the implementation source of truth
- use `docs/native-social-engagement-foundation-spec.md` as the engagement-truth source of truth
- keep the active owner on `app/watch-party/live-stage/[partyId].tsx` unless a tiny directly-related helper is strictly required
- treat release hardening later as blocked until the lower interaction reliability seam and the final two-phone proof both close honestly
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
 - change route truth
 - reopen broader product or release-hardening work before the Live Stage interaction lane closes
 - reopen Google Play readiness, OVH work, or database-move work
 - invent fake room powers, fake comments, fake social claims, fake ads, or fake entitlements
 - mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- one real device has already proved the key route-owned flows honestly and the public legal crash stays fixed
- two real devices still honestly prove Party Room host/viewer behavior, pre-stage Live Room host/viewer behavior, cross-device invite/thread handoff, locked-room denial, and Live Stage route entry
- the lower Live Stage interaction zone is single-device proved honestly for mode toggle, comment focus/send, lower-lane reactions, and `CAMERA LOOKS`
- final two-phone on-stage interaction proof is only retried after that lower interaction seam is clean enough on one device
- the repo truth clearly states that release hardening later must wait until both of those narrow verification steps close
- no route drift, schema drift, fake room powers, or fake social claims are introduced
- the staged set stays task-pure
