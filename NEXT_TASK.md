# NEXT TASK

## Exact Next Task
The next exact stage is now `profile friendship adoption` on `app/profile/[userId].tsx`. Repo truth is now explicit: the boundary audit is complete, and the only safe adoption shape is a tiny signed-in private viewer hint for already-accepted friendship only.

## Current Plan
1. Treat the whole-app re-entry lane, inbox friendship hint lane, and profile friendship boundary audit as closed.
2. Carry forward the locked doctrine: friendship is mutual, person-to-person, private-first, and still distinct from followers/subscribers.
3. Add only one tiny accepted-friend hint to `/profile/[userId]`, and only for signed-in private viewer context.
4. Keep self-view, official Rachi view, pending/request states, and follower/subscriber posture separate from profile friendship treatment.
5. Keep comments limited to current room/live truth and keep Rachi distinct from normal friendship hints.
6. Preserve current owner-above-Rachi authority, canonical profile/chat/admin/title/player routes, and follower/subscriber distinctions.
7. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- add one quiet accepted-friend hint to `/profile/[userId]` only when a real active friendship already exists
- preserve the truthful title, player, watch-party, chat-thread, and inbox adoptions without widening them into fake broad social rollout
- keep self-view, official view, pending/request states, public friend counts, and universal comments later
- avoid public friend chrome, fake friend counts, fake inbox clutter, fake engagement metrics, and universal comments
- keep creator/public, admin/owner, and route/doctrine boundaries intact
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve `/profile/[userId]`, `/channel-settings`, `/admin`, `/chat`, and `/chat/[threadId]` as the canonical owners
- preserve `/title/[id]` and `/player/[id]` as the canonical title/player owners
- use `docs/native-friend-graph-implementation-spec.md` as the implementation source of truth
- use `docs/native-social-engagement-foundation-spec.md` as the engagement-truth source of truth
- keep the next pass route-owned and public-first
- preserve inbox scan clarity by treating `/chat/index` as already settled for now
- keep the profile treatment smaller than a new friendship action system
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
- `/player/[id]` stays caught up to the truthful title-level engagement baseline without crowding watch-party/live behavior
- `/watch-party/[partyId]` keeps honest access language for the existing room-access flow
- `/title/[id]`, `/chat/[threadId]`, and the standalone player remain honest route-owned social surfaces without implying broader rollout
- profile friendship remains later unless a future lane opens it intentionally
- comments remain explicitly limited to current room/live truth unless separately backed later
- public/profile/chat/title/player routes still make no fake social claims
- no route drift or fake social claims are introduced
- the staged set stays task-pure
