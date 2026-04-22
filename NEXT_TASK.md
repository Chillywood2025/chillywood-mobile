# NEXT TASK

## Exact Next Task
There is one remaining narrow product-verification blocker on current repo truth: the visible on-stage Live Stage controls are still not deterministic enough on Android to close full interaction proof honestly, even though Live Stage route-entry proof is real. The next move should be a tight `Live Stage interaction proof closeout` follow-up on `app/watch-party/live-stage/[partyId].tsx`, not release hardening later yet.

## Current Plan
1. Preserve the current truthful product baseline exactly as landed across profile, watch-party/live, chat, title/player, settings/legal/support, channel settings, and bounded admin.
2. Carry forward the completed single-device proof on Home, profile, title, standalone player entry, watch-party/live owners, chat, channel settings, settings, support, and public legal surfaces.
3. Carry forward the completed two-phone proof on Party Room host/viewer behavior, pre-stage Live Room host/viewer behavior, cross-device invite/thread handoff, locked-room denial, and Live Stage route entry on both phones.
4. Keep the landed Party Room invite open-path, room-aware invite search, watch-party lane-switch, locked-room denial, dev-only live-room invite autolaunch removal, and the new Live Stage interaction polish plus touch/accessibility hardening intact without widening them into new product work.
5. Finish the still-open Live Stage interaction proof with real two-phone verification for mode toggle, comment send visibility, lower-lane reaction burst behavior, camera-look apply/reset, and host/viewer interaction weighting once the visible stage controls respond deterministically enough on Android.
6. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- do not widen beyond the narrow Live Stage interaction proof lane
- keep the verified single-device and two-phone proof baseline intact everywhere else
- keep the landed Party Room invite, room-aware invite search, locked-room denial, live-room autolaunch, and new Live Stage interaction polish/touch-hardening fixes intact
- finish the real two-phone Live Stage interaction proof before reopening release hardening later
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve all current canonical route owners and landed doctrine exactly as-is
- keep the current social baseline, monetization/access truth, and no-fake-comments/no-fake-ads doctrine intact
- use `docs/native-friend-graph-implementation-spec.md` as the implementation source of truth
- use `docs/native-social-engagement-foundation-spec.md` as the engagement-truth source of truth
- keep the active owner on `app/watch-party/live-stage/[partyId].tsx` unless a tiny directly-related helper is strictly required
- treat release hardening later as blocked until the Live Stage interaction lane closes honestly
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
- Live Stage interaction is only considered closed when the actual on-stage mode toggle, comment send visibility, lower-lane reactions, and camera looks are re-proved cleanly on the real devices
- the visible Live Stage controls must respond deterministically enough on Android for that proof to be honest
- the repo truth clearly states that release hardening later must wait until this narrow Live Stage interaction lane closes
- no route drift, schema drift, fake room powers, or fake social claims are introduced
- the staged set stays task-pure
