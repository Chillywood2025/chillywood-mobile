# NEXT TASK

## Exact Next Task
The next exact lane is now a narrow `chat inbox private friendship hint audit` on `app/chat/index.tsx`. Repo truth is now explicit: the whole-app re-entry lane is closed, the player and watch-party room seams are handled, and the safest next route-owned social follow-up is the private inbox surface rather than a public profile friendship rollout.

## Current Plan
1. Treat the whole-app re-entry lane as closed.
2. Carry forward the locked doctrine: friendship is mutual, person-to-person, private-first, and still distinct from followers/subscribers.
3. Audit `/chat/index.tsx` as the next private-context social surface now that `/chat/[threadId]` already owns friendship truth.
4. Keep profile friend adoption later than inbox adoption unless a future dedicated pass proves the public route is ready.
5. Keep comments limited to current room/live truth and keep Rachi distinct from normal friendship hints.
6. Preserve current owner-above-Rachi authority, canonical profile/chat/admin/title/player routes, and follower/subscriber distinctions.
7. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- audit whether `/chat/index.tsx` can surface narrow private friendship hints without hurting inbox scan speed
- preserve the truthful title, player, watch-party, and chat-thread adoptions without widening them into fake broad social rollout
- keep `/profile/[userId]` public-first and keep universal comments later
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
- preserve inbox scan clarity while checking whether any private friendship hint is honest and useful
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- change route truth
- invent a broad social rewrite lane
- invent fake friend counts, fake mutuals, fake Rachi-social behavior, fake comment systems, or fake creator/platform powers
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- `/chat/index.tsx` is audited against the already-landed thread friendship truth without implying that inbox presence equals friendship
- `/player/[id]` stays caught up to the truthful title-level engagement baseline without crowding watch-party/live behavior
- `/watch-party/[partyId]` keeps honest access language for the existing room-access flow
- `/title/[id]`, `/chat/[threadId]`, and the standalone player remain honest route-owned social surfaces without implying broader rollout
- profile friendship remains later unless a future lane opens it intentionally
- comments remain explicitly limited to current room/live truth unless separately backed later
- public/profile/chat/title/player routes still make no fake social claims
- no route drift or fake social claims are introduced
- the staged set stays task-pure
