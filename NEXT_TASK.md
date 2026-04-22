# NEXT TASK

## Exact Next Task
The active pass is now the real end-to-end app verification lane. Repo truth is explicit: product work is already closed enough for release hardening later, but this pass is proving actual route-owned behavior and real device flows before any later hardening lane begins. Verification readiness is proved with two real Android devices, launchable app installs, Maestro, safe local credential names, and host-log access, and the single-device audit has already found and fixed the first real blocker: the public legal/account-deletion routes now render correctly instead of crashing outside the provider tree. The exact next step is the two-phone E2E audit on the highest-risk live/chat access flows.

## Current Plan
1. Preserve the current truthful product baseline exactly as landed across profile, watch-party/live, chat, title/player, settings/legal/support, channel settings, and bounded admin.
2. Carry forward the completed single-device proof on Home, profile, title, standalone player entry, watch-party/live owners, chat, channel settings, settings, support, and public legal surfaces.
3. Use the second real device to prove the highest-risk multi-user flows now that the first real single-device blocker is fixed.
4. Only land additional narrow behavior fixes if real device proof shows they are clearly justified and safe.
5. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- prove watch-party create/join, Party Room host/viewer differences, Live Room or Live Stage host/viewer flow where supported, chat/thread truth across both devices, and any safely testable room-access gate on two real phones
- rank only real behavior issues that still show up during two-phone proof
- keep any remaining single-device dev-client-only deep-link quirk later unless it reproduces as a real route-owned product blocker
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
- two real devices prove the highest-risk multi-user flows if the environment stays ready
- any additional landed fixes are real behavior/trust improvements rather than another code-only sweep
- the repo truth clearly states whether this verification lane is closed enough
- no route drift, schema drift, fake room powers, or fake social claims are introduced
- the staged set stays task-pure
