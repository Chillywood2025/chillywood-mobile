# NEXT TASK

## Exact Next Task
The next exact stage is now the `social adoption closeout audit` before any broader native social rollout continues. Repo truth is now explicit: `/title/[id]` owns the first product-facing backed `like` / `share` adoption, and `/chat/[threadId]` now owns the first private-context friendship adoption without implying that direct messaging automatically equals friendship.

## Current Plan
1. Treat the native social adoption audit plus the title and chat-thread adoption batches as closed.
2. Keep the locked doctrine: friendship is mutual, person-to-person, and private-first.
3. Run the lane closeout audit before any additional route adoption.
4. Keep profile, inbox, and player adoption later unless a final narrow pass is clearly justified by the closeout audit.
5. Keep comments limited to current room/live truth unless a later chapter adds a real content-comment owner.
6. Preserve current owner-above-Rachi authority, canonical profile/chat/admin routes, and follower/subscriber distinctions.
7. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- audit the now-landed title and chat-thread native social adoptions
- decide whether any final third adoption slice is honestly safe or whether the lane should close
- keep profile, inbox, and player later unless the audit proves one final narrow pass is clearly justified
- avoid public friend chrome, fake friend counts, fake inbox clutter, and fake engagement metrics
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
- the closeout audit can honestly say what landed on `/title/[id]` and `/chat/[threadId]`
- any final adoption decision is strict about keeping profile, inbox, and player later unless clearly justified
- comments remain explicitly limited to current room/live truth unless separately backed later
- public/profile/chat/title/player routes still make no fake social claims
- no route drift or fake social claims are introduced
- the staged set stays task-pure
