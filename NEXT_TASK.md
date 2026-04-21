# NEXT TASK

## Exact Next Task
The larger v1-facing social/live/profile/chat polish pass is now four stages in on `main`. Stage 4 is closed: `app/watch-party/live-stage/[partyId].tsx` now feels cleaner and more production-ready because the pre-stage Live Room cards are shorter, redundant focus/reset actions stay hidden until they matter, and the stage menu/comments/filter copy is tighter without changing the proven live experience. The next exact stage in this pass is now **Chi'lly Chat thread honesty** on `app/chat/[threadId].tsx`.

## Current Plan
1. Re-read `CURRENT_STATE.md`, `NEXT_TASK.md`, `MASTER_VISION.md`, `ARCHITECTURE_RULES.md`, `PRODUCT_DOCTRINE.md`, `ROOM_BLUEPRINT.md`, and the active whole-app audit findings first.
2. Treat Stage 1 through Stage 4 as closed: profile, title/player, watch-party entry/Party Room, and Live Stage are now materially tighter.
3. Keep the next active owner on `app/chat/[threadId].tsx`.
4. Make the canonical thread surface fully honest about what the composer does and does not support right now.
5. Preserve real text send plus call/video entry truth, and avoid route or doctrine drift.

## Exact Next Batch
- tighten `app/chat/[threadId].tsx`
- remove or downgrade any fake-looking unsupported composer actions
- keep the thread trustworthy and focused on the real text-send plus call/video path
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve current product route truth and current doctrine
- focus on the canonical Chi'lly Chat thread owner only
- improve honesty and trust in the composer without widening into broader chat redesign
- leave the completed profile, title/player, watch-party, and Live Stage improvements intact
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- change current public/product route truth
- change schema or doctrine
- widen into profile/player/live-stage follow-up, admin, infra, or database work
- change the canonical owner of title, player, watch-party, live-stage, or chat routes
- turn the pass into a broader chat redesign
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- no fake chat-thread composer affordances remain
- the thread surface clearly promises only what is really live now
- no route drift, schema drift, or doctrine drift is introduced
- the staged set stays task-pure
