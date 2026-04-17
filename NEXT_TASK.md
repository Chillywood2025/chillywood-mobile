# NEXT TASK

## Exact Next Task
Carry forward the still-valid proved baseline exactly as recorded, including the locked Party / Live / Profile / Chi'lly Chat semantics, the preserved Firebase runtime base on this branch, the repo-safe LiveKit mobile foundation, the deployed `livekit-token` Supabase Edge Function on project `bmkkhihfbmsnnmcqkoly`, and the newly landed first client-side LiveKit render seam on `app/watch-party/live-stage/[partyId].tsx`. The exact next lane should prove that seam on a real native/dev build before broadening anything else: verify that the canonical `Live Room -> Continue to Live Stage` handoff can actually connect through LiveKit using the deployed backend token contract, render stable stage media on device, and fall back cleanly to the legacy communication-room/WebRTC path when the LiveKit path is unavailable or unstable. Do not reopen OVH/Hetzner or broader production-infrastructure decisions in that next lane.

## Current Plan
1. Preserve the carried-forward proved baseline exactly as recorded.
2. Preserve the new LiveKit path honestly as partial only: package/plugin/bootstrap/config/token-contract, secure backend token issuance, and one client render seam are now landed, but native/device proof is not.
3. Reopen only the single canonical `Live Room -> Live Stage` seam next for real-device proof and stabilization.
4. Keep the legacy communication-room/WebRTC path available until the LiveKit path is genuinely working and re-proved on device.

## Exact Next Batch
- keep the new LiveKit foundation plus first client seam intact
- verify the deployed public runtime config resolves correctly on the native/dev build
- prove one real LiveKit connect/render attempt through `app/watch-party/live-stage/[partyId].tsx`
- confirm the legacy communication-room/WebRTC stage path still takes over cleanly on failure
- avoid broadening into Party Room, Player, Chat, Profile, or infra lanes

## Scope
This next pass should:
- preserve the carried-forward proved baseline exactly as recorded
- preserve the new LiveKit foundation plus deployed token endpoint plus first client seam honestly as partial groundwork rather than full completion
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
- the first canonical LiveKit stage seam proves on device without fake completion
- the legacy communication-room/WebRTC path remains available until the new path is stable and honestly re-proved
