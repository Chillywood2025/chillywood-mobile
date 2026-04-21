# NEXT TASK

## Exact Next Task
The larger v1-facing social/live/profile/chat polish pass is now one stage in on `main`. Stage 1 is closed: `app/profile/[userId].tsx` now feels more like a real public creator/channel destination, its public-facing copy is materially less doctrine-heavy, the Content tab has real title-entry chips, the Community tab has real follow-up actions, and the route keeps honest live/watch-party/channel entry without dead-end primary CTAs. The next exact stage in this pass is now **title + player social honesty** on `app/title/[id].tsx` and `app/player/[id].tsx`.

## Current Plan
1. Re-read `CURRENT_STATE.md`, `NEXT_TASK.md`, `MASTER_VISION.md`, `ARCHITECTURE_RULES.md`, `PRODUCT_DOCTRINE.md`, `ROOM_BLUEPRINT.md`, and the active whole-app audit findings first.
2. Treat Stage 1 as closed: the canonical public profile/channel surface is now materially tighter and more actionable.
3. Keep the next active owners on `app/title/[id].tsx` and `app/player/[id].tsx`.
4. Tighten the title/player funnel so visible social/live/watch-party truth has matching honest actions and the player feels less mode-cluttered.
5. Preserve standalone player truth, preserve watch-party/live distinctions, and avoid route or doctrine drift.

## Exact Next Batch
- tighten `app/title/[id].tsx` and `app/player/[id].tsx`
- make any shown live/watch-party/social activity match a real user path or a clean honest explanation
- reduce visibly partial or overloaded mode messaging in the player without rewriting it
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve current product route truth and current doctrine
- focus on the canonical title detail and standalone player owners only
- improve social-entry clarity and player coherence without widening into a broad player rewrite
- leave the completed profile improvements intact
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- change current public/product route truth
- change schema or doctrine
- widen into profile follow-up, admin, infra, or database work
- change the canonical owner of title, player, watch-party, live-stage, or chat routes
- turn the pass into a broad player rewrite
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- title no longer shows social/live/watch-party activity without a matching honest action or explanation
- player feels cleaner and more coherent while preserving current route and mode truth
- no route drift, schema drift, or doctrine drift is introduced
- the staged set stays task-pure
