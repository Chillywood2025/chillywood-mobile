# NEXT TASK

## Exact Next Task
Carry forward the still-valid proved baseline exactly as recorded, including the locked Party / Live / Profile / Chi'lly Chat semantics, the preserved Firebase runtime base on this branch, the repo-safe LiveKit mobile foundation, the deployed `livekit-token` Supabase Edge Function on project `bmkkhihfbmsnnmcqkoly`, the durable `verify_jwt = false` function config now recorded in `supabase/config.toml`, and the now re-proved real-device `Live Room -> Continue to Live Stage` seam that gets past the old ES256 gateway failure and reaches a connected LiveKit surface. The exact next lane should stay narrow: finish the mirrored `Party Room -> Watch-Party Live` device reproof after the auth fix and close the remaining runtime overlap / duplicate-stack ambiguity so the LiveKit surface and the legacy communication-room/WebRTC fallback never appear to compete on the same active media surface. Do not reopen OVH/Hetzner or broader production-infrastructure decisions in that next lane.

## Current Plan
1. Preserve the carried-forward proved baseline exactly as recorded.
2. Preserve the new LiveKit path honestly as partial only: package/plugin/bootstrap/config/token-contract, secure backend token issuance, durable function config, and one client render seam are now landed, but the broader watch-party mirror and runtime overlap closure are not.
3. Reopen only the existing canonical watch-party seams next: keep `Live Room -> Live Stage` stable while proving `Party Room -> Watch-Party Live` after the function auth fix.
4. Keep the legacy communication-room/WebRTC path available until the LiveKit path is genuinely working and re-proved on device.

## Exact Next Batch
- keep the new LiveKit foundation plus first client seam intact
- keep the durable `livekit-token` function config and deployed auth-fix intact
- re-prove the mirrored `Party Room -> Watch-Party Live` boundary on device without drifting into Live Stage
- tighten the active-media runtime so LiveKit and legacy communication fallback do not appear to overlap on the same surface
- confirm the legacy communication-room/WebRTC stage path still takes over cleanly on failure
- avoid broadening into Profile, admin, docs, Firebase, or infra lanes

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
- the mirrored `Party Room -> Watch-Party Live` boundary is honestly re-proved without routing into Live Stage
- the legacy communication-room/WebRTC path remains available until the new path is stable and honestly re-proved
