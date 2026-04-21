# NEXT TASK

## Exact Next Task
The larger v1-facing social/live/profile/chat polish pass is now five stages in on `main`. Stage 5 is closed: `app/chat/[threadId].tsx` is now more trustworthy and less memo-like because the thread guide/body copy is shorter, the header action hint now points to a real tap interaction, and the composer continues to promise only the text-send plus thread-based call path that actually exists. The next exact stage in this pass is now the **lane closeout audit** on `main`.

## Current Plan
1. Re-read `CURRENT_STATE.md`, `NEXT_TASK.md`, `MASTER_VISION.md`, `ARCHITECTURE_RULES.md`, `PRODUCT_DOCTRINE.md`, `ROOM_BLUEPRINT.md`, and the active whole-app audit findings first.
2. Treat Stage 1 through Stage 5 as closed: profile, title/player, watch-party entry/Party Room, Live Stage, and the Chi'lly Chat thread are now materially tighter.
3. Audit the lane as a whole instead of widening into new implementation automatically.
4. Decide whether one final trivial or narrow cross-surface polish slice is truly justified.
5. If not, close the lane cleanly and hand back to the broader roadmap without route or doctrine drift.

## Exact Next Batch
- audit the completed v1-facing social/live/profile/chat polish lane
- decide whether any remaining seam is truly trivial or narrow
- close the lane cleanly if the remaining work is medium or broader
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve current product route truth and current doctrine
- focus on lane closeout judgment, not new broad implementation
- leave the completed profile, title/player, watch-party, Live Stage, and thread improvements intact
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- change current public/product route truth
- change schema or doctrine
- widen into profile/player/live-stage follow-up, admin, infra, or database work unless a truly narrow final polish slice is justified by the closeout audit
- change the canonical owner of title, player, watch-party, live-stage, or chat routes
- turn the pass into a new redesign chapter
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- the completed social/live/profile/chat polish work is audited honestly
- any remaining seam is classified clearly as trivial, narrow, medium, or broad/risky
- the lane either closes cleanly or identifies one final justified narrow pass
- no route drift, schema drift, or doctrine drift is introduced
- the staged set stays task-pure
