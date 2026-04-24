# CURRENT STATE

## Hot-Path Control Rule
This file is intentionally compact. Long two-phone proof lanes were repeatedly forcing Codex into remote session compaction, and the remote compact stream can disconnect before completion. Keep current truth here, keep detailed older checkpoint history archived, and do not load the archive during normal preflight.

Full checkpoint history through April 24, 2026 is preserved at `docs/archive/current-state-history-through-2026-04-24.md`. Read that archive only when investigating an older checkpoint or reconciling historical branch truth.

## Current Checkpoint
The current `main` checkpoint preserves the April 24, 2026 two-real-device LiveKit live-stage camera-visibility fix. The active owner remains `app/watch-party/live-stage/[partyId].tsx`, with route-local hybrid LiveKit ownership using explicit `Room` instances and room-specific teardown tracking.

The proved bug was Live First stage entry for a signed-in non-host who could enter while still holding a `viewer` LiveKit participant role. The fix resolves the entry role before minting the LiveKit token: the route claims the participant seat as `speaker`, persists `canSpeak`, updates local participant state, clears any pending seat request, broadcasts the seat state, refreshes the snapshot, and only then prepares the LiveKit join contract.

The prior stale-runtime containment pass is also preserved. The shared LiveKit stage surface suppresses stale teardown-era signal-loop read errors before they surface through LiveKit websocket handling, and the route-local hybrid LiveKit host uses the same patched signal-loop lifecycle rather than an unpatched internal room path. The relevant files are `app/watch-party/live-stage/[partyId].tsx` and `components/watch-party-live/livekit-stage-media-surface.tsx`.

## Proof Truth
- One-device runtime containment smoke reached fresh room `K4W7ZT` cleanly after stale room `AR5VPC`: pre-stage Live Room and actual Live Stage mounted, logs showed `prepared live-stage join contract` then `room connected`, and there was no `Unexpected first message`, no `NegotiationError`, no stale websocket toast, and no fallback to the legacy media path.
- Two-phone Live First proof used room `E4U5FP`: host and guest were in the same LiveKit room, both had local camera true, each saw one remote track, and `visibleTrackCount` was `2` on both devices.
- Two-phone Live Watch-Party proof used room `NN9RLU`: both devices again had local camera true, one remote track, and `visibleTrackCount: 2`; leave-to-Live-Room and rejoin also passed on `NN9RLU`.
- Validation after the proof passed with `npm run typecheck`; `npm run lint` exited 0 with the existing repo warning set only.

Saved proof artifacts from the latest two-phone pass include `/tmp/chillywood-R3-livefirst-stage-after-fix.png`, `/tmp/chillywood-R5-livefirst-stage-after-fix.png`, `/tmp/chillywood-R3-livefirst-after-fix-logcat.txt`, `/tmp/chillywood-R5-livefirst-after-fix-logcat.txt`, `/tmp/chillywood-R3-hybrid-stage-direct-after-fix.png`, `/tmp/chillywood-R5-hybrid-stage-direct-after-fix.png`, `/tmp/chillywood-R3-hybrid-direct-after-fix-logcat.txt`, `/tmp/chillywood-R5-hybrid-direct-after-fix-logcat.txt`, `/tmp/chillywood-R3-hybrid-rejoin-after-fix.png`, `/tmp/chillywood-R5-hybrid-rejoin-after-fix.png`, `/tmp/chillywood-R3-hybrid-rejoin-after-fix-logcat.txt`, and `/tmp/chillywood-R5-hybrid-rejoin-after-fix-logcat.txt`.

## Known Remaining Seams
- Later two-phone live/watch proof remains the next product lane for sustained interaction retention, shared-media persistence, participant/member visibility, and cross-device audio truth.
- Repeated Android deep links can leave older proof-room route instances logging harmless render-branch lines even while the current LiveKit room works. Treat this as an optional route-stack cleanup audit only if a later proof lane makes it a real blocker.
- The `Error running remote compact task: stream disconnected before completion` message is Codex session/tooling failure, not a Live Stage app-runtime failure. The durable repo mitigation is to keep control-file preflight compact and store raw proof logs in files rather than pouring them into chat.

## Current Next Action
Preserve the LiveKit camera-visibility and stale-runtime containment fixes. Resume later two-phone Live Stage / Watch-Party Live proof only as a proof lane, not a broad runtime redesign.

During proof, save raw logcat, screenshots, and long command output to `/tmp` or a task-specific proof artifact file, then summarize only the facts needed for `CURRENT_STATE.md` and `NEXT_TASK.md`.

## Staging Discipline
- Work on current `main` only.
- Keep unrelated local dirt out of the checkpoint.
- Never stage `supabase/.temp/`.
- Stage only task-pure files for the active lane.
