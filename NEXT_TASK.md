# NEXT TASK

## Exact Next Task
The next exact stage is now `first narrow adoption batch` on `/title/[id]` before any broader native social rollout continues. Repo truth is now explicit: title detail is the safest first product-facing adoption surface for backed `like` / `share` state, chat thread is the safest second friendship surface, profile remains later because it is still public-first, inbox remains later because scan speed matters, and player remains later because playback should stay primary.

## Current Plan
1. Treat the native social adoption audit as closed.
2. Keep the locked doctrine: friendship is mutual, person-to-person, and private-first.
3. Adopt backed title `like` / `share` truth first.
4. Adopt private-context friendship second on `/chat/[threadId]` only if the first batch stays clean.
5. Keep profile, inbox, and player adoption later unless a final narrow pass is clearly justified.
6. Keep comments limited to current room/live truth unless a later chapter adds a real content-comment owner.
7. Preserve current owner-above-Rachi authority, canonical profile/chat/admin routes, and follower/subscriber distinctions.
8. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- adopt title-level `like` / `share` state on `/title/[id]`
- keep title engagement distinct from fake public metrics and distinct from watch-party/live comments
- keep share truth distinct from room invite share-sheet behavior
- hold friendship adoption for the next stage unless this batch clears cleanly
- keep creator/public, admin/owner, and route/doctrine boundaries intact
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve `/profile/[userId]`, `/channel-settings`, `/admin`, `/chat`, and `/chat/[threadId]` as the canonical owners
- preserve `/title/[id]` and `/player/[id]` as the canonical title/player owners
- use `docs/native-friend-graph-implementation-spec.md` as the implementation source of truth
- use `docs/native-social-engagement-foundation-spec.md` as the engagement-truth source of truth
- stop short of broad UI rollout or fake shipped social behavior
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- start the broad whole-app behavior/polish pass yet
- change route truth
- invent a broad social rewrite lane
- invent fake friend counts, fake mutuals, fake Rachi-social behavior, fake comment systems, or fake creator/platform powers
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- `/title/[id]` shows real backed `like` / `share` truth without fake counts or fake comment claims
- the next friendship adoption stage remains clearly scoped without blurring friends, followers, subscribers, comments, likes, shares, or Rachi truth
- comments remain explicitly limited to current room/live truth unless separately backed later
- public/profile/chat/title/player routes still make no fake social claims
- no route drift or fake social claims are introduced
- the staged set stays task-pure
