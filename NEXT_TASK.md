# NEXT TASK

## Exact Next Task
The remaining open lane on current repo truth is now proof-only rather than another safe code batch: final two-phone on-stage Live Stage interaction proof should be retried on `app/watch-party/live-stage/[partyId].tsx`, carrying forward the landed Android runtime and lower-interaction reliability fixes from the latest code-side closeout.

## Current Plan
1. Preserve the current truthful product baseline exactly as landed across profile, watch-party/live, chat, title/player, settings/legal/support, channel settings, and bounded admin.
2. Carry forward the completed single-device proof on Home, profile, title, standalone player entry, watch-party/live owners, chat, channel settings, settings, support, and public legal surfaces.
3. Carry forward the completed two-phone proof on Party Room host/viewer behavior, pre-stage Live Room host/viewer behavior, cross-device invite/thread handoff, locked-room denial, and Live Stage route entry on both phones.
4. Keep the landed Party Room invite open-path, room-aware invite search, watch-party lane-switch, locked-room denial, dev-only live-room invite autolaunch removal, and prior Live Stage interaction polish/touch hardening intact without widening them into new product work.
5. Keep the new Android Live Stage runtime fixes intact:
   the legacy RTC renderer must stay disabled inside the native LiveKit stage owner on Android, and the LiveKit stage room must keep the contained signal read-loop behavior that avoids the earlier dev-client websocket/Event overlay.
6. Carry forward the new Live Stage lower-interaction contract exactly as landed: the on-stage overlay now stays up long enough to use, pauses auto-hide while lower interaction panels are active, and refreshes on lower-dock touch instead of collapsing the interaction surface.
7. Retry the final two-phone on-stage interaction proof for mode/toggle truth, comment participation, lower-lane reactions, `CAMERA LOOKS` role weighting, and host/viewer interaction quality on the actual Live Stage owner.
8. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- do not widen beyond the final Live Stage interaction proof lane
- keep the verified single-device and two-phone proof baseline intact everywhere else
- keep the landed Party Room invite, room-aware invite search, locked-room denial, live-room autolaunch, prior Live Stage interaction polish, and the new Android Live Stage runtime fixes intact
- carry forward the new 12-second lower interaction overlay contract on `app/watch-party/live-stage/[partyId].tsx` without widening into a redesign
- rerun final two-phone on-stage interaction proof instead of opening another code-side chapter
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve all current canonical route owners and landed doctrine exactly as-is
- keep the current social baseline, monetization/access truth, and no-fake-comments/no-fake-ads doctrine intact
- use `docs/native-friend-graph-implementation-spec.md` as the implementation source of truth
- use `docs/native-social-engagement-foundation-spec.md` as the engagement-truth source of truth
- keep the active owner on `app/watch-party/live-stage/[partyId].tsx` unless a tiny directly-related helper is strictly required
- treat release hardening later as blocked only on the final two-phone Live Stage interaction proof
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
- the latest code-side pass remains intact: the lower Live Stage interaction zone now survives past the old 5-second failure point, active lower interaction work keeps the overlay alive, and the viewer-weighted `CAMERA LOOKS` gate still reads honestly
- final two-phone on-stage interaction proof is the only remaining Live Stage verification lane
- the repo truth clearly states that release hardening later must wait only until that final two-phone proof closes honestly
- no route drift, schema drift, fake room powers, or fake social claims are introduced
- the staged set stays task-pure
