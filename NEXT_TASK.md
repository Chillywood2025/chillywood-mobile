# NEXT TASK

## Exact Next Task
The current v1 polish/workflow pass is now one batch in. Stage 1 is closed on `main`: `/profile/[userId]` and `/title/[id]` no longer expose the earlier discovery-to-room mismatch where live/watch-party entry either vanished into alert dead ends or showed room activity without a matching path forward. Route ownership is unchanged, doctrine is unchanged, and the next exact product lane is now a narrow **watch-party lobby compression** pass on `app/watch-party/index.tsx`. That next pass should tighten the waiting-room hierarchy, reduce teaching-wall density, keep create/join as the primary job, and preserve all current live/party logic and labels.

## Current Plan
1. Re-read `CURRENT_STATE.md`, `NEXT_TASK.md`, `MASTER_VISION.md`, `ARCHITECTURE_RULES.md`, `PRODUCT_DOCTRINE.md`, `ROOM_BLUEPRINT.md`, and the active whole-app audit findings first.
2. Treat Stage 1 as closed: profile and title social-entry honesty now match current route truth.
3. Keep the next active owner strictly on `app/watch-party/index.tsx`.
4. Compress overexplaining copy and visual teaching walls without changing create/join/live/party logic.
5. Preserve `Watch-Party Live`, `Live Watch-Party`, and `Live First` as separate truths.
6. Keep route ownership, schema, and doctrine unchanged.
7. After the lobby compression pass, move to the chat-thread affordance honesty batch if no blocker appears.

## Exact Next Batch
- tighten `app/watch-party/index.tsx` only
- make create/join the primary job visually
- remove or compress teaching-heavy nonessential cards/copy
- preserve all real create/join/live/party behavior
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve current product route truth and current room doctrine
- focus only on the waiting-room / create-join entry owner
- reduce overexplaining and improve button hierarchy without changing the actual flow
- leave profile/title Stage 1 fixes intact
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- change current public/product route truth
- change schema or doctrine
- redesign the app from scratch
- widen into player, admin, infra, or database work
- invent fake room shortcuts or remove real create/join controls
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- the waiting-room surface is materially less instructional and easier to act from
- create/join remains fully real
- no route drift, schema drift, or doctrine drift is introduced
- the staged set stays task-pure
