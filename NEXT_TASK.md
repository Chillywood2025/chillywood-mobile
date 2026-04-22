# NEXT TASK

## Exact Next Task
The active pass stays a narrow real-device verification follow-up. Repo truth is explicit: single-device route proof is real, Party Room and pre-stage Live Room host/viewer proof is real on two phones, the public legal-route crash is fixed, and the watch-party entry lane-switch fix is already landed on `app/watch-party/index.tsx`. The invite/chat search gap is now explained and fixed narrowly: the in-app invite sheet had been searching only canonical profile rows even when the current room already knew the participant identity by exact visible room handle, so `components/chat/internal-invite-sheet.tsx` now merges room-aware participant suggestions from `app/watch-party/[partyId].tsx` and `app/watch-party/live-stage/[partyId].tsx` with canonical search results. The exact next step is to rerun the cross-device invite/thread handoff on the two real phones, then finish fresh locked-room non-member denial proof if a safe test identity is available, and capture full on-stage two-phone proof only if it is safely reachable.

## Current Plan
1. Preserve the current truthful product baseline exactly as landed across profile, watch-party/live, chat, title/player, settings/legal/support, channel settings, and bounded admin.
2. Carry forward the completed single-device proof on Home, profile, title, standalone player entry, watch-party/live owners, chat, channel settings, settings, support, and public legal surfaces.
3. Carry forward the real two-phone proof already gathered for Party Room host/viewer behavior, pre-stage Live Room host/viewer behavior, and room presence across both devices.
4. Carry forward the landed watch-party entry lane-switch fix without widening it into broader room/live redesign work.
5. Carry forward the landed room-aware invite search fix without widening it into broader chat or profile work.
6. Re-run the cross-device invite/thread handoff and a fresh locked-room non-member proof if a safe test identity is available.
7. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- keep the verified single-device baseline plus the now-landed two-phone watch-party entry fix intact
- keep the new room-aware invite search fix narrow and truthful
- re-run the cross-device invite/thread handoff on the two real phones
- finish a fresh locked-room non-member proof only if a safe new entrant identity is actually available
- capture full on-stage two-phone proof only if the current route path is safely reachable
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve all current canonical route owners and landed doctrine exactly as-is unless real verification proves a narrow fix is needed
- keep the current social baseline, monetization/access truth, and no-fake-comments/no-fake-ads doctrine intact
- use `docs/native-friend-graph-implementation-spec.md` as the implementation source of truth
- use `docs/native-social-engagement-foundation-spec.md` as the engagement-truth source of truth
- do not begin release hardening in this pass; only verify whether the current product baseline behaves honestly enough to close the lane cleanly
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
- one real device has already proved the key route-owned flows honestly and the public legal crash is fixed
- two real devices already prove the most important room host/viewer flows honestly, and the remaining claims stay precise about what is still partial
- the landed watch-party entry lane-switch fix stays verified on-device without changing room/live doctrine
- the next pass focuses only on the invite/thread rerun, fresh access-gate proof, and any directly related two-phone verification work
- the repo truth clearly states that the broader verification lane is not fully closed yet, but the remainder is now a narrow rerun/proof follow-up rather than another full sweep
- no route drift, schema drift, fake room powers, or fake social claims are introduced
- the staged set stays task-pure
