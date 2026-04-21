# NEXT TASK

## Exact Next Task
The larger v1-facing social/live/profile/chat polish lane is now closed on `main`. The next exact product lane is a medium **channel-settings control-center polish** pass on `app/channel-settings.tsx`. The public-facing social/live/profile/chat stack is materially tighter now, so the next grounded seam is the creator-side control center: it still reads more like a roadmap/settings hybrid than a crisp operational surface, even though its ownership and access truth are already honest.

## Current Plan
1. Re-read `CURRENT_STATE.md`, `NEXT_TASK.md`, `MASTER_VISION.md`, `ARCHITECTURE_RULES.md`, `PRODUCT_DOCTRINE.md`, `ROOM_BLUEPRINT.md`, and the active whole-app audit findings first.
2. Treat the larger social/live/profile/chat polish lane as closed: profile, title/player, watch-party entry/Party Room, Live Stage, and Chi'lly Chat are materially tighter.
3. Keep the next active owner on `app/channel-settings.tsx`.
4. Make the creator-side control center feel more operational and less like a roadmap/settings hybrid.
5. Preserve current route truth, owner-only boundaries, and channel-management doctrine while tightening clarity and polish.

## Exact Next Batch
- tighten `app/channel-settings.tsx`
- reduce doctrine-heavy/settings-roadmap overlap on the creator-side control center
- keep the channel-management route honest, operational, and easier to scan
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve current product route truth and current doctrine
- focus on the creator-side control center owner only
- improve clarity, hierarchy, and trust without widening into a broader creator-tools rewrite
- leave the completed profile, title/player, watch-party, Live Stage, and thread improvements intact
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- change current public/product route truth
- change schema or doctrine
- widen into profile/player/live-stage follow-up, admin, infra, or database work
- change the canonical owner of profile, title, player, watch-party, live-stage, chat, or channel-settings routes
- turn the pass into a new creator-tools redesign chapter
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- `app/channel-settings.tsx` feels more like a crisp operational control center than a settings/roadmap hybrid
- creator-facing actions stay honest and easier to scan
- no route drift, schema drift, or doctrine drift is introduced
- the staged set stays task-pure
