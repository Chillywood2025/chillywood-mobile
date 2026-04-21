# NEXT TASK

## Exact Next Task
The next exact stage is now `behavior / polish batch 1` on `app/title/[id].tsx` and `app/player/[id].tsx`. Repo truth is explicit: the whole-app critical behavior verification audit is complete, and the highest-leverage first fix is rights-aware share-action alignment on the canonical title and standalone-player owners.

## Current Plan
1. Treat the public profile private friendship boundary lane as closed and keep the current social baseline settled.
2. Carry forward the locked doctrine: friendship is mutual, person-to-person, private-first, and still distinct from followers/subscribers.
3. Fix the first real behavior mismatch now: do not expose `Mark Shared` on title or standalone player when title access is explicitly blocked or unknown.
4. Keep comments limited to current room/live truth and keep Rachi distinct from normal friendship hints.
5. Preserve current owner-above-Rachi authority, canonical profile/chat/admin/title/player routes, and follower/subscriber distinctions.
6. Keep waiting-room join/access truth and inbox error truth queued as later batches inside the same behavior lane.
7. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- keep the current truthful title/player social baseline, but hide `Mark Shared` whenever the route cannot confirm allowed title access
- preserve the shipped title, player, watch-party, chat-thread, inbox, and profile social adoptions without widening them into fake broad social rollout
- keep self-view, official view, pending/request states, public friend counts, public friend lists, and universal comments later
- queue `app/watch-party/index.tsx` preview-branch error visibility as the second batch and `app/chat/index.tsx` inbox error visibility as the third batch
- keep creator/public, admin/owner, and route/doctrine boundaries intact
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve `/profile/[userId]`, `/channel-settings`, `/admin`, `/chat`, and `/chat/[threadId]` as the canonical owners
- preserve `/title/[id]` and `/player/[id]` as the canonical title/player owners
- use `docs/native-friend-graph-implementation-spec.md` as the implementation source of truth
- use `docs/native-social-engagement-foundation-spec.md` as the engagement-truth source of truth
- keep the current social baseline settled while verifying real behavior across the existing canonical routes
- preserve inbox scan clarity by treating `/chat/index` as already settled for now
- treat the profile friendship treatment as already landed and closed for now
- keep the first fix batch inside the title/player owners only
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- change route truth
- invent a broad social rewrite lane
- invent fake friend counts, fake mutuals, fake Rachi-social behavior, fake comment systems, or fake creator/platform powers
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- `/profile/[userId]` reflects active friendship only as a tiny private hint without turning the public route into a friendship dashboard
- `/chat/index.tsx` keeps its tiny accepted-friend hint without implying that inbox presence equals friendship
- `/player/[id]` stays caught up to the truthful title-level engagement baseline without crowding watch-party/live behavior or exposing blocked share actions
- `/watch-party/[partyId]` keeps honest access language for the existing room-access flow
- `/title/[id]`, `/chat/[threadId]`, and the standalone player remain honest route-owned social surfaces without implying broader rollout or disallowed share behavior
- the public profile private friendship boundary lane stays closed cleanly with no fake counts, no public friend list, and no request workflow leakage
- comments remain explicitly limited to current room/live truth unless separately backed later
- public/profile/chat/title/player routes still make no fake social claims
- no route drift or fake social claims are introduced
- the staged set stays task-pure
