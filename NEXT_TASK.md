# NEXT TASK

## Exact Next Task
The larger v1-facing social/live/profile/chat polish pass is now three stages in on `main`. Stage 3 is closed: `app/watch-party/index.tsx` now gets users to the real create/join job faster because the pre-entry defaults wall is slimmer, the create/join copy is shorter, and the invite handoff text is cleaner; `app/watch-party/[partyId].tsx` now feels less crowded because the room-shaping card is tighter, the room-status copy is leaner, and redundant layout actions stay hidden until the local room view actually changes. The next exact stage in this pass is now **live stage / live-first polish** on `app/watch-party/live-stage/[partyId].tsx`.

## Current Plan
1. Re-read `CURRENT_STATE.md`, `NEXT_TASK.md`, `MASTER_VISION.md`, `ARCHITECTURE_RULES.md`, `PRODUCT_DOCTRINE.md`, `ROOM_BLUEPRINT.md`, and the active whole-app audit findings first.
2. Treat Stage 1 through Stage 3 as closed: profile, title/player, and watch-party entry/Party Room are now materially tighter.
3. Keep the next active owner on `app/watch-party/live-stage/[partyId].tsx`.
4. Make Live Stage cleaner, less crowded, and more premium without changing proven live behavior or doctrine.
5. Preserve watch-party/live distinctions, host/participant truth, and avoid route or doctrine drift.

## Exact Next Batch
- tighten `app/watch-party/live-stage/[partyId].tsx`
- reduce visual crowding around live media, participant context, host controls, and explanatory copy
- keep the proven live/watch-party/live-first behavior intact while making the surface feel more production-ready
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve current product route truth and current doctrine
- focus on the canonical Live Stage / Live Watch-Party owner only
- improve hierarchy, spacing, and readability without changing live room semantics or route ownership
- leave the completed profile, title/player, and Party Room improvements intact
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- change current public/product route truth
- change schema or doctrine
- widen into profile follow-up, Party Room follow-up, admin, infra, or database work
- change the canonical owner of title, player, watch-party, live-stage, or chat routes
- turn the pass into a broad Live Stage redesign
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- Live Stage is cleaner and more readable without losing real host/participant/live behavior
- low-value explanatory text no longer crowds the live experience
- no route drift, schema drift, or doctrine drift is introduced
- the staged set stays task-pure
