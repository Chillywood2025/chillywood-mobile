# NEXT TASK

## Exact Next Task
The next exact stage is now `behavior / polish batch 2` on `app/watch-party/[partyId].tsx`. Repo truth is now explicit: the standalone player catch-up batch is landed, and the next clean seam is a room-access CTA that still says `Coming Soon` even though it opens a real `AccessSheet`.

## Current Plan
1. Treat the whole-app re-entry audit and player catch-up batch as closed.
2. Carry forward the locked doctrine: friendship is mutual, person-to-person, private-first, and still distinct from followers/subscribers.
3. Tighten room-access CTA honesty on `/watch-party/[partyId].tsx` without widening into broader watch-party redesign.
4. Keep comments limited to current room/live truth and keep profile/inbox friend adoption later unless a future route-owned pass opens them intentionally.
5. Preserve current owner-above-Rachi authority, canonical profile/chat/admin/title/player routes, and follower/subscriber distinctions.
6. Reassess whether any third narrow batch is still honest only after the watch-party pass lands.
7. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- replace the misleading `Coming Soon` room-access CTA on `/watch-party/[partyId]` with honest live access-sheet wording
- preserve the truthful title, player, and chat-thread adoptions without widening them into fake broad social rollout
- keep watch-party/live route ownership intact and keep profile/inbox friend adoption later unless a dedicated future route-owned pass proves otherwise
- avoid public friend chrome, fake friend counts, fake inbox clutter, fake engagement metrics, and universal comments
- keep creator/public, admin/owner, and route/doctrine boundaries intact
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve `/profile/[userId]`, `/channel-settings`, `/admin`, `/chat`, and `/chat/[threadId]` as the canonical owners
- preserve `/title/[id]` and `/player/[id]` as the canonical title/player owners
- use `docs/native-friend-graph-implementation-spec.md` as the implementation source of truth
- use `docs/native-social-engagement-foundation-spec.md` as the engagement-truth source of truth
- allow broader behavior/polish work to resume, but keep social truth honest and route-owned
- keep the next batch narrowly focused on watch-party room gate wording plus only tiny directly-related route logic if required
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- change route truth
- invent a broad social rewrite lane
- invent fake friend counts, fake mutuals, fake Rachi-social behavior, fake comment systems, or fake creator/platform powers
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- broader behavior/polish work resumes without erasing or faking the landed native social truth
- `/player/[id]` stays caught up to the truthful title-level engagement baseline without crowding watch-party/live behavior
- `/watch-party/[partyId]` no longer uses fake `Coming Soon` access language for a real room-access flow
- `/title/[id]`, `/chat/[threadId]`, and the standalone player remain honest route-owned social surfaces without implying broader rollout
- profile and inbox remain later for native social adoption unless a future lane opens them intentionally
- comments remain explicitly limited to current room/live truth unless separately backed later
- public/profile/chat/title/player routes still make no fake social claims
- no route drift or fake social claims are introduced
- the staged set stays task-pure
