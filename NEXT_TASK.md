# NEXT TASK

## Exact Next Task
The next exact stage is now the `chat inbox private friendship hint closeout audit`. Repo truth is now explicit: the tiny inbox adoption is landed, and there is no second obvious inbox batch unless the closeout audit finds one final truly narrow refinement.

## Current Plan
1. Treat the whole-app re-entry lane, inbox audit, and inbox hint adoption as closed.
2. Carry forward the locked doctrine: friendship is mutual, person-to-person, private-first, and still distinct from followers/subscribers.
3. Run the closeout audit before inventing any second inbox batch.
4. Keep pending/request states in `/chat/[threadId]` rather than pushing them into the inbox.
5. Keep profile friend adoption later than inbox adoption unless a future dedicated pass proves the public route is ready.
6. Keep comments limited to current room/live truth and keep Rachi distinct from normal friendship hints.
7. Preserve current owner-above-Rachi authority, canonical profile/chat/admin/title/player routes, and follower/subscriber distinctions.
8. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- audit whether one final trivial inbox refinement is honestly cleaner than closing the lane now
- preserve the truthful title, player, watch-party, chat-thread, and inbox adoptions without widening them into fake broad social rollout
- keep pending/request states, `/profile/[userId]`, and universal comments later
- avoid public friend chrome, fake friend counts, fake inbox clutter, fake engagement metrics, and universal comments
- keep creator/public, admin/owner, and route/doctrine boundaries intact
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve `/profile/[userId]`, `/channel-settings`, `/admin`, `/chat`, and `/chat/[threadId]` as the canonical owners
- preserve `/title/[id]` and `/player/[id]` as the canonical title/player owners
- use `docs/native-friend-graph-implementation-spec.md` as the implementation source of truth
- use `docs/native-social-engagement-foundation-spec.md` as the engagement-truth source of truth
- keep the next pass route-owned and smaller than a public-profile friendship rollout
- preserve inbox scan clarity while deciding whether the lane should close
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- change route truth
- invent a broad social rewrite lane
- invent fake friend counts, fake mutuals, fake Rachi-social behavior, fake comment systems, or fake creator/platform powers
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- `/chat/index.tsx` reflects accepted friendship only as a tiny private hint without implying that inbox presence equals friendship
- `/player/[id]` stays caught up to the truthful title-level engagement baseline without crowding watch-party/live behavior
- `/watch-party/[partyId]` keeps honest access language for the existing room-access flow
- `/title/[id]`, `/chat/[threadId]`, and the standalone player remain honest route-owned social surfaces without implying broader rollout
- profile friendship remains later unless a future lane opens it intentionally
- comments remain explicitly limited to current room/live truth unless separately backed later
- public/profile/chat/title/player routes still make no fake social claims
- no route drift or fake social claims are introduced
- the staged set stays task-pure
