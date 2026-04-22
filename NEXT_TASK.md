# NEXT TASK

## Exact Next Task
The next pass is no longer a broad verification sweep. Repo truth is explicit: the real end-to-end verification lane is now partially proved but not fully closed. Single-device route proof is real, Party Room and pre-stage Live Room host/viewer proof is real on two phones, and the watch-party entry lane-switch bug is fixed on `app/watch-party/index.tsx`. The exact next step is now a narrow `two-phone invite/chat search + access-gate verification follow-up`: investigate why the in-app invite sheet could not find the current room participant by exact visible handle during real device proof, rerun the cross-device invite/thread handoff, and finish a fresh non-member locked-room denial proof if a safe test identity is available.

The active pass is still the real end-to-end verification lane, but it is now in final re-audit rather than initial proof gathering. Repo truth is explicit: two real Android phones have already proved the single-device baseline plus real Party Room and pre-stage Live Room host/viewer behavior, and the first safe two-phone fix is already landed on `app/watch-party/index.tsx` so the neutral `/watch-party` route no longer carries the wrong waiting-room shell or stale join/access/invite state across live-vs-party lane switches. The exact next step is to close the verification lane honestly: re-audit what is fully proved, record that two-phone proof is still partial, and decide whether the lane is closed enough or whether the remaining invite/chat and fresh access-gate proof gaps still require one narrow follow-up.

The active pass is now the real end-to-end app verification lane. Repo truth is explicit: product work is already closed enough for release hardening later, but this pass is proving actual route-owned behavior and real device flows before any later hardening lane begins. Verification readiness is proved with two real Android devices, launchable app installs, Maestro, safe local credential names, and host-log access, and the single-device audit has already found and fixed the first real blocker: the public legal/account-deletion routes now render correctly instead of crashing outside the provider tree. The exact next step is the two-phone E2E audit on the highest-risk live/chat access flows.

## Current Plan
1. Preserve the current truthful product baseline exactly as landed across profile, watch-party/live, chat, title/player, settings/legal/support, channel settings, and bounded admin.
2. Carry forward the completed single-device proof on Home, profile, title, standalone player entry, watch-party/live owners, chat, channel settings, settings, support, and public legal surfaces.
3. Carry forward the real two-phone proof already gathered for Party Room host/viewer behavior, pre-stage Live Room host/viewer behavior, and room presence across both devices.
4. Carry forward the landed watch-party entry lane-switch fix without widening it into broader room/live redesign work.
5. Investigate the in-app invite/chat search gap with the current real proof accounts before widening into any broader chat or profile work.
6. Re-run the cross-device invite/thread handoff and a fresh locked-room non-member proof if a safe test identity is available.
7. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- re-audit the verified single-device baseline plus the now-landed two-phone watch-party entry fix
- investigate the real in-app invite search failure on the current proof accounts and decide whether it is a safe narrow fix or an honest blocker
- re-run the cross-device invite/thread handoff if that search path becomes real
- finish a fresh locked-room non-member proof only if a safe new entrant identity is actually available
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
- the next pass focuses only on the invite/chat search gap and any directly related proof reruns
- the repo truth clearly states that the broader verification lane is not fully closed yet, but the remainder is now a narrow follow-up rather than another full sweep
- no route drift, schema drift, fake room powers, or fake social claims are introduced
- the staged set stays task-pure
