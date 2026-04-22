# NEXT TASK

## Exact Next Task
There is no remaining product-verification blocker on current repo truth. The real-device lane is now closed honestly: single-device baseline, Party Room host/viewer proof, pre-stage Live Room host/viewer proof, cross-device invite/thread proof, locked-room denial proof, and full two-phone on-stage Live Stage proof are all real on `main`. The next move should now be an intentionally chosen release-hardening-later pass rather than another product or verification chapter.

## Current Plan
1. Preserve the current truthful product baseline exactly as landed across profile, watch-party/live, chat, title/player, settings/legal/support, channel settings, and bounded admin.
2. Carry forward the completed single-device proof on Home, profile, title, standalone player entry, watch-party/live owners, chat, channel settings, settings, support, and public legal surfaces.
3. Carry forward the completed two-phone proof on Party Room host/viewer behavior, pre-stage Live Room host/viewer behavior, cross-device invite/thread handoff, locked-room denial, and full on-stage Live Stage entry.
4. Keep the landed Party Room invite open-path, room-aware invite search, watch-party lane-switch, locked-room denial, and dev-only live-room invite autolaunch fixes intact without widening them into new product work.
5. Treat the product/verification chapter set as closed enough, and only reopen work if a later release-hardening pass proves a narrow bug or deployment-readiness gap.
6. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- do not reopen another product-verification chapter now that the lane is closed
- keep the verified single-device and two-phone proof baseline intact
- keep the landed Party Room invite, room-aware invite search, locked-room denial, and live-room autolaunch fixes intact
- treat any next work as release hardening later, not more route-owned product restructuring
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve all current canonical route owners and landed doctrine exactly as-is
- keep the current social baseline, monetization/access truth, and no-fake-comments/no-fake-ads doctrine intact
- use `docs/native-friend-graph-implementation-spec.md` as the implementation source of truth
- use `docs/native-social-engagement-foundation-spec.md` as the engagement-truth source of truth
- do not reopen product verification unless a later release-hardening pass proves a real narrow blocker
- treat release hardening later as the next broader lane when intentionally reopened
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
 - change route truth
 - reopen a closed chapter casually before the broader audit selects it
 - reopen Google Play readiness, OVH work, or database-move work
 - invent fake room powers, fake comments, fake social claims, fake ads, or fake entitlements
 - mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- one real device has already proved the key route-owned flows honestly and the public legal crash stays fixed
- two real devices now honestly prove Party Room host/viewer behavior, pre-stage Live Room host/viewer behavior, cross-device invite/thread handoff, locked-room denial, and full on-stage Live Stage entry
- the repo truth clearly states that the broader verification lane is closed enough and the next move is release hardening later rather than another product chapter
- no route drift, schema drift, fake room powers, or fake social claims are introduced
- the staged set stays task-pure
