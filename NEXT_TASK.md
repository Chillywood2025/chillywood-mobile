# NEXT TASK

## Exact Next Task
The narrow player simplification lane is now closed cleanly on `main`. The next exact product lane is a broad **player ownership split audit** on `app/player/[id].tsx`. The cleaned-up player now reads more honestly, but the remaining seam is structural rather than cosmetic: one canonical owner still carries too many playback, social, sync, and live responsibilities to treat as another narrow patch.

## Current Plan
1. Treat the narrow standalone access-and-control honesty batch as closed.
2. Treat the shared playback chrome compression batch as closed.
3. Treat the live mode hierarchy batch as closed.
4. Treat the stale player-local cleanup as closed.
5. Start the next player chapter with an audit of structural ownership inside `app/player/[id].tsx`.
6. Separate broader player-ownership questions from the completed narrow polish/simplification work.
7. Leave unrelated local dirt out of the checkpoint.

## Exact Next Batch
- audit the remaining structural ownership load inside `app/player/[id].tsx`
- identify what should stay in the canonical player owner versus what is only crowding it
- keep the completed standalone/shared/live cleanup behavior intact
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve current product route truth and current doctrine
- stay centered on the canonical player owner first
- audit structural ownership and mode boundaries before any further implementation
- leave the completed narrow player cleanup work intact
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- change current public/product route truth
- change schema or doctrine
- widen into profile/channel, admin, infra, or database work
- change the canonical owner of profile, title, player, watch-party, live-stage, chat, or channel-settings routes during the audit itself
- pretend the remaining seam is another tiny cleanup if it is broader
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- the remaining player ownership seam is mapped honestly before broader changes resume
- no fake narrow follow-up is invented for what is now a broader/risky problem
- the next exact product lane stays explicit and task-pure
- no route drift, schema drift, or doctrine drift is introduced
- the staged set stays task-pure
