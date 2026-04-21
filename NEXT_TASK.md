# NEXT TASK

## Exact Next Task
The larger v1-facing social/live/profile/chat polish pass is now two stages in on `main`. Stage 2 is closed: `app/title/[id].tsx` now frames live watch-party activity with a clearer honest handoff into `Watch-Party Live`, and `app/player/[id].tsx` now feels cleaner in its current doctrine because the watch-party/live helper copy, sync labels, and fallback/status messaging are less repetitive and less technical without changing route or mode truth. The next exact stage in this pass is now **watch-party entry + party room** on `app/watch-party/index.tsx` and `app/watch-party/[partyId].tsx`.

## Current Plan
1. Re-read `CURRENT_STATE.md`, `NEXT_TASK.md`, `MASTER_VISION.md`, `ARCHITECTURE_RULES.md`, `PRODUCT_DOCTRINE.md`, `ROOM_BLUEPRINT.md`, and the active whole-app audit findings first.
2. Treat Stage 1 and Stage 2 as closed: profile plus title/player social-entry honesty are now materially tighter.
3. Keep the next active owners on `app/watch-party/index.tsx` and `app/watch-party/[partyId].tsx`.
4. Make the watch-party entry funnel faster and make Party Room feel less crowded without changing room doctrine.
5. Preserve watch-party/live distinctions, access/moderation honesty, and avoid route or doctrine drift.

## Exact Next Batch
- tighten `app/watch-party/index.tsx` and `app/watch-party/[partyId].tsx`
- make the waiting-room/create-join surface activate faster with less teaching-wall copy
- make Party Room feel less crowded while preserving real host/viewer/moderation state handling
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve current product route truth and current doctrine
- focus on the canonical watch-party entry and Party Room owners only
- improve hierarchy, clarity, and premium feel without changing room doctrine or route ownership
- leave the completed profile and title/player improvements intact
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- change current public/product route truth
- change schema or doctrine
- widen into profile follow-up, player follow-up, admin, infra, or database work
- change the canonical owner of title, player, watch-party, live-stage, or chat routes
- turn the pass into a room-doctrine rewrite
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- watch-party entry is lighter and faster to act from
- Party Room is more coherent while preserving current access/moderation/room truth
- no route drift, schema drift, or doctrine drift is introduced
- the staged set stays task-pure
