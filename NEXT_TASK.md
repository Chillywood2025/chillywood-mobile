# NEXT TASK

## Exact Next Task
The `/channel-settings` control-center polish lane is now closed on `main`. The next exact product lane is a broad **player mode simplification audit** on `app/player/[id].tsx`. The creator-side control center now reads cleanly enough to move on, so the biggest remaining user-facing seam is the standalone player: it still carries too many mode-specific responsibilities and needs a truth-first audit before any broader simplification work begins.

## Current Plan
1. Re-read `CURRENT_STATE.md`, `NEXT_TASK.md`, `MASTER_VISION.md`, `ARCHITECTURE_RULES.md`, `PRODUCT_DOCTRINE.md`, `ROOM_BLUEPRINT.md`, and the active whole-app audit findings first.
2. Treat the `/channel-settings` control-center polish lane as closed.
3. Keep the next active owner on `app/player/[id].tsx`.
4. Audit the player surface honestly before trying to simplify it.
5. Separate narrow copy/hierarchy cleanup from any broader mode-architecture work before implementing anything.

## Exact Next Batch
- audit `app/player/[id].tsx`
- identify which player modes and overlays are already solid versus overloaded
- define the smallest safe next simplification slice without collapsing `Watch-Party Live`, `Live Watch-Party`, or `Live First`
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve current product route truth and current doctrine
- focus on the canonical player owner first
- inspect mode-specific clutter, control hierarchy, and overloaded messaging before implementation
- leave the completed `/channel-settings` polish work intact
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- change current public/product route truth
- change schema or doctrine
- widen into profile/channel, admin, infra, or database work
- change the canonical owner of profile, title, player, watch-party, live-stage, chat, or channel-settings routes
- turn the audit into a broad player rewrite before the overload seams are classified honestly
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- the player surface is audited honestly
- overloaded mode-specific seams are classified clearly as narrow, medium, or broad/risky
- the next safe player simplification slice is explicit before implementation
- no route drift, schema drift, or doctrine drift is introduced
- the staged set stays task-pure
