# NEXT TASK

## Exact Next Task
The current v1 polish/workflow pass is now two batches in. Stage 1 and Stage 2 are closed on `main`: `/profile/[userId]` and `/title/[id]` no longer expose the discovery-to-room mismatch, and `app/watch-party/index.tsx` no longer buries the create/join job under lane teaching walls and room-experience filler. Route ownership is unchanged, doctrine is unchanged, and the next exact product lane is now a narrow **chat-thread affordance honesty** pass on `app/chat/[threadId].tsx`. That next pass should make the thread composer promise only what is actually live now while keeping text send intact.

## Current Plan
1. Re-read `CURRENT_STATE.md`, `NEXT_TASK.md`, `MASTER_VISION.md`, `ARCHITECTURE_RULES.md`, `PRODUCT_DOCTRINE.md`, `ROOM_BLUEPRINT.md`, and the active whole-app audit findings first.
2. Treat Stage 1 and Stage 2 as closed: public social-entry honesty and watch-party lobby compression now match current route truth.
3. Keep the next active owner strictly on `app/chat/[threadId].tsx`.
4. Remove or downgrade fake-looking composer affordances without inventing attachments or reactions.
5. Keep the text-send flow intact and keep the route structure untouched.
6. Keep route ownership, schema, and doctrine unchanged.
7. After the chat-thread honesty pass, decide whether one final trivial v1 polish slice is worth doing or whether the lane should close.

## Exact Next Batch
- tighten `app/chat/[threadId].tsx` only
- make the composer visually honest about what is live now
- remove, hide, or downgrade unsupported attachment/reaction affordances
- preserve the real text-send thread flow
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve current product route truth and current room doctrine
- focus only on the canonical thread owner
- improve trust in the composer without widening into chat redesign
- leave Stage 1 and Stage 2 fixes intact
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- change current public/product route truth
- change schema or doctrine
- redesign the app from scratch
- widen into player, watch-party, admin, infra, or database work
- invent attachments, reactions, or new chat systems
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- the visible thread composer actions are honest about what is actually live
- text send remains fully real
- no route drift, schema drift, or doctrine drift is introduced
- the staged set stays task-pure
