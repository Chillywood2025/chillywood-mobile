# NEXT TASK

## Exact Next Task
Carry forward the now-recovered layout + integrated runtime base exactly as proved: `Watch-Party Live` keeps the later refined player-band / tighter participant-rail shell on `app/player/[id].tsx`, `Live Stage` keeps the later virtualized community layout on `app/watch-party/live-stage/[partyId].tsx`, Party Room still stays on `/watch-party/[partyId]`, the current `_lib/livekit/join-boundary.ts` / runtime-config / token-auth stack stays authoritative, Firebase Analytics and Remote Config remain the analytics/config owners, Crashlytics and Performance Monitoring remain the monitoring owners, and the shared `components/watch-party-live/livekit-stage-media-surface.tsx` owner keeps the carried-forward local-camera publish truth without regressing the later two-visible composition. Do not reopen `app/player/[id].tsx`, `app/watch-party/live-stage/[partyId].tsx`, `app/watch-party/_lib/_room-shared.ts`, or `components/watch-party-live/livekit-stage-media-surface.tsx` speculatively. Use this branch as the single current runtime + latest watch-party layout base for the next proof lane, and only return to these owners if fresh runtime proof shows a real regression in layout, LiveKit publish behavior, or Party-vs-Live route doctrine.

## Current Plan
1. Preserve the restored standalone-player vs `Watch-Party Live` split exactly as now proved.
2. Preserve the restored `Live First` lower comments/reactions/studio lane and visible mode toggle.
3. Preserve the durable `livekit-token` function config in `supabase/config.toml` and do not reopen the old gateway auth blocker without fresh regression proof.
4. Preserve the Firebase monitoring owners and Firebase-native crash/perf proof hooks exactly as landed.
5. Preserve the carried-forward first LiveKit local-camera publish truth on the shared watch-party media owner without regressing the later two-visible composition.
6. Treat this branch as the single current runtime base before any new watch-party/live-stage/player feature work starts.

## Exact Next Batch
- preserve the restored `Watch-Party Live` player context above playback and bounded shared-social layer below
- preserve the restored `Live First` lower comments/reactions/studio lane
- preserve the durable `livekit-token` function config and auth-fix truth
- preserve the Firebase monitoring owners and config
- preserve the shared LiveKit local-publish truth on the current media owner
- avoid speculative player, live-stage, or shared-media UI churn
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve the now-restored player/live-stage truth exactly as recorded
- preserve the carried-forward durable LiveKit token auth fix
- preserve the carried-forward Firebase monitoring foundation
- preserve the carried-forward first LiveKit local-camera publish truth
- avoid inventing new room shells or duplicating player structure
- keep route doctrine unchanged
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- reopen token issuance or transport debugging without fresh proof
- redesign the watch-party structure again
- broaden into Firebase/profile/admin/chat lanes beyond the already-landed monitoring owner carryforward
- reopen the shared LiveKit media owner without fresh regression proof
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- the restored standalone-player vs `Watch-Party Live` split stays true
- the restored `Live First` lower comments lane stays regression-free
- the durable `livekit-token` auth fix stays carried forward on this recovered base
- the Firebase monitoring owners remain carried forward on this recovered base
- the carried-forward first LiveKit local-camera publish truth remains intact on the shared media owner
- the repo can move forward from one current runtime base without rediscovering the stale player/live-stage structure, the old token-auth blocker, the missing Firebase monitoring foundation, or the dropped local-publish checkpoint
