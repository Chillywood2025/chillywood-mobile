# NEXT TASK

## Exact Next Task
The next exact lane is now a doctrine/spec pass for the native Chi'llywood friend graph before any broad whole-app behavior or polish work continues. The owner/admin/Rachi + social-friend audit is now closed cleanly, and repo truth is explicit: Rachi is already a protected official starter presence on canonical profile/chat surfaces, but native friend-list truth is still missing. Do not start the broad behavior/polish pass yet.

## Current Plan
1. Treat the owner/admin/Rachi + social-friend audit as closed.
2. Keep `RACHI_SOCIAL_TRUTH = PARTIALLY_REAL` and `FRIEND_LIST_TRUTH = MISSING_BUT_NEXT` as the active repo truth.
3. Run the next lane as a native friend-graph implementation-spec pass, not a broad UI pass.
4. Preserve current owner-above-Rachi authority, canonical profile/chat/admin routes, and follower/subscriber distinctions.
5. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- lock the canonical meaning of a Chi'llywood friend relationship
- define how friend truth differs from followers, creator/channel subscribers, requests, and blocked audience
- define private-vs-public friend visibility rules for `/profile/[userId]`
- define how Rachi stays the official first-contact presence without being mistaken for owner authority or a fake already-shipped friend graph
- keep creator/public, admin/owner, and route/doctrine boundaries intact
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve `/profile/[userId]`, `/channel-settings`, `/admin`, `/chat`, and `/chat/[threadId]` as the canonical owners
- keep the next lane doctrine/spec-first rather than UI-first
- treat current follower/subscriber/request/blocked truth as the only real native social relationship foundation today
- use `docs/rachi-social-friend-doctrine.md` as the durable starting point
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- start the broad whole-app behavior/polish pass yet
- change route truth
- change schema unless a later spec proves a tiny directly-related foundation correction is safely required
- rename followers or subscribers into friends
- invent fake friend counts, fake mutuals, fake Rachi-social behavior, or fake creator/platform powers
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- the native friend graph has a locked doctrine/spec definition
- Rachi's official starter presence is clearly separated from friend-graph truth and owner/admin truth
- broader behavior/polish work has a clean social truth foundation to build from
- no route drift, schema drift, or fake social claims are introduced
- the staged set stays task-pure
