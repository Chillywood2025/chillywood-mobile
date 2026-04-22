# NEXT TASK

## Exact Next Task
The active pass is still the real end-to-end verification lane, but it is now in final re-audit rather than initial proof gathering. Repo truth is explicit: two real Android phones have already proved the single-device baseline plus real Party Room and pre-stage Live Room host/viewer behavior, and the first safe two-phone fix is already landed on `app/watch-party/index.tsx` so the neutral `/watch-party` route no longer carries the wrong waiting-room shell or stale join/access/invite state across live-vs-party lane switches. The exact next step is to close the verification lane honestly: re-audit what is fully proved, record that two-phone proof is still partial, and decide whether the lane is closed enough or whether the remaining invite/chat and fresh access-gate proof gaps still require one narrow follow-up.

The active pass is now the real end-to-end app verification lane. Repo truth is explicit: product work is already closed enough for release hardening later, but this pass is proving actual route-owned behavior and real device flows before any later hardening lane begins. Verification readiness is proved with two real Android devices, launchable app installs, Maestro, safe local credential names, and host-log access, and the single-device audit has already found and fixed the first real blocker: the public legal/account-deletion routes now render correctly instead of crashing outside the provider tree. The exact next step is the two-phone E2E audit on the highest-risk live/chat access flows.

## Current Plan
1. Preserve the current truthful product baseline exactly as landed across profile, watch-party/live, chat, title/player, settings/legal/support, channel settings, and bounded admin.
2. Carry forward the completed single-device proof on Home, profile, title, standalone player entry, watch-party/live owners, chat, channel settings, settings, support, and public legal surfaces.
3. Carry forward the real two-phone proof already gathered for Party Room host/viewer behavior, pre-stage Live Room host/viewer behavior, and room presence across both devices.
4. Carry forward the landed watch-party entry lane-switch fix without widening it into broader room/live redesign work.
5. Re-audit the remaining gaps honestly: in-app invite/chat handoff search, fresh locked-room non-member proof, and full two-device on-stage Live Stage proof.
6. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- re-audit the verified single-device baseline plus the now-landed two-phone watch-party entry fix
- record the two-phone proofs that are fully real now: Party Room create/join, Party Room host/viewer differences, pre-stage Live Room create/join, and room presence across both sides
- record the two-phone gaps that remain partial: in-app invite/chat handoff search, fresh locked-room non-member proof, and full two-device on-stage Live Stage proof
- only land one final narrow fix if that re-audit proves it is clearly safer than closing the lane honestly as partial
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
- two real devices have already proved the most important room host/viewer flows honestly, and any additional proof claims stay precise about what is still only partial
- the landed watch-party entry lane-switch fix is verified on-device without changing room/live doctrine
- any additional landed fixes stay narrow and behavior-driven rather than another code-only sweep
- the repo truth clearly states whether this verification lane is closed enough or still needs one narrow follow-up
- no route drift, schema drift, fake room powers, or fake social claims are introduced
- the staged set stays task-pure
