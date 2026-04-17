# NEXT TASK

## Exact Next Task
Carry forward the still-valid proved baseline exactly as recorded, including the locked Party / Live / Profile / Chi'lly Chat semantics, the preserved Firebase runtime base on this branch, the repo-safe LiveKit mobile foundation, and the now-deployed `livekit-token` Supabase Edge Function on project `bmkkhihfbmsnnmcqkoly`. The exact next lane should finish the first real client-side LiveKit path for one canonical realtime surface only: wire the mobile runtime to the deployed token endpoint via `EXPO_PUBLIC_LIVEKIT_TOKEN_ENDPOINT`, then connect and render one actual LiveKit room through the already-guarded `Live Room -> Continue to Live Stage` seam on `app/watch-party/live-stage/[partyId].tsx`, while keeping the current communication-room/WebRTC fallback path intact until the new path is actually stable and re-proved. Do not reopen OVH/Hetzner or broader production-infrastructure decisions in that next lane.

## Current Plan
1. Preserve the carried-forward proved baseline exactly as recorded.
2. Preserve the new LiveKit foundation honestly as partial only: package/plugin/bootstrap/config/token-contract and secure backend token issuance are now landed, but actual LiveKit room join/render is not.
3. Reopen only the single canonical `Live Room -> Live Stage` join/render seam next.
4. Keep the legacy communication-room/WebRTC path available until the LiveKit path is genuinely working and re-proved.

## Exact Next Batch
- keep the new LiveKit foundation package/plugin/bootstrap/config truth intact
- point the mobile runtime at the deployed `livekit-token` endpoint with no app-side secret logic
- wire one real LiveKit client join/render path through `app/watch-party/live-stage/[partyId].tsx`
- preserve the current legacy communication-room/WebRTC path as fallback until proof is complete
- rerun proof only after the deployed backend endpoint and one real client join path exist

## Scope
This next pass should:
- preserve the carried-forward proved baseline exactly as recorded
- preserve the new LiveKit foundation plus deployed token endpoint honestly as partial groundwork rather than full completion
- stay focused on one canonical realtime surface only
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
- the deployed secure backend token endpoint exists and serves the guarded mobile contract
- one canonical realtime surface can actually join/render through LiveKit
- the legacy communication-room/WebRTC path remains available until the new path is stable and honestly re-proved
