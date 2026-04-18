# NEXT TASK

## Exact Next Task
Carry forward the still-valid proved baseline exactly as recorded, including the locked Party / Live / Profile / Chi'lly Chat semantics, the preserved Firebase runtime base on this branch, the repo-safe LiveKit mobile foundation, the deployed `livekit-token` Supabase Edge Function on project `bmkkhihfbmsnnmcqkoly`, the durable `verify_jwt = false` function config now recorded in `supabase/config.toml`, the re-proved `Party Room -> Watch-Party Live` player/title seam on real Android hardware, and the re-proved `Live Room -> Continue to Live Stage` seam that now reaches a connected LiveKit surface without the old gateway token error or the prior duplicate active-surface overlap. The exact next lane should stay narrow: clean up the remaining watch-party execution branch so only the task-pure player/live-stage/communication files that still matter are carried forward, then decide whether the next runtime pass should expand the same deterministic LiveKit ownership deeper into the player/watch-together media controls or stay focused on stabilizing fallback/error states. Do not reopen OVH/Hetzner or broader production-infrastructure decisions in that next lane.

## Current Plan
1. Preserve the carried-forward proved baseline exactly as recorded.
2. Preserve the new LiveKit path honestly as partial only: package/plugin/bootstrap/config/token-contract, secure backend token issuance, durable function config, and the now re-proved player/live-stage seams are landed, but the wider player/runtime polish and cleanup are not.
3. Reopen only the existing canonical watch-party seams next: keep `Live Room -> Live Stage` and `Party Room -> Watch-Party Live` stable while narrowing any remaining branch-local dirt.
4. Keep the legacy communication-room/WebRTC path available only as fallback until the LiveKit path is genuinely stable across the owned watch-party surfaces.

## Exact Next Batch
- keep the new LiveKit foundation plus first client seam intact
- keep the durable `livekit-token` function config and deployed auth-fix intact
- keep the now re-proved mirrored `Party Room -> Watch-Party Live` boundary intact without drifting into Live Stage
- keep the now explicit active-surface gating intact so LiveKit and legacy communication fallback do not overlap on the same surface
- confirm the legacy communication-room/WebRTC stage path still takes over cleanly on failure
- avoid broadening into Profile, admin, docs, Firebase, or infra lanes while reducing branch-local noise

## Scope
This next pass should:
- preserve the carried-forward proved baseline exactly as recorded
- preserve the new LiveKit foundation plus deployed token endpoint plus durable function config plus first client seam honestly as partial groundwork rather than full completion
- stay focused only on the already-owned watch-party seams
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- put LiveKit API keys or secrets into the mobile app
- generate LiveKit JWTs in the client
- delete the legacy communication-room/WebRTC path yet
- broaden into Party Room, Player, Profile, admin, or unrelated chat work
- force OVH/Hetzner or broader production-infrastructure work into the next mobile pass
- mix unrelated local dirt into any future checkpoint

## Success Criteria
The next lane is successful when:
- the current LiveKit foundation remains intact and truthful
- the deployed secure backend token endpoint exists, serves the guarded mobile contract, and no longer fails at the gateway with the old ES256 auth error
- the mirrored `Party Room -> Watch-Party Live` boundary remains honestly re-proved without routing into Live Stage
- the legacy communication-room/WebRTC path remains available as fallback without appearing to run in parallel on the active LiveKit surfaces
