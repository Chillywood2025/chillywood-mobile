# NEXT TASK

## Exact Next Task
Carry forward the newer approved player/live-stage baseline exactly as proved on `main`: Standalone Player stays solo-first, `Watch-Party Live` stays the bounded shared-player layer inside the player/title lane instead of growing a second shell, and `Live First` keeps the visible lower comments/reactions/studio lane plus the visible mode toggle on the live-stage owner. Keep the newly consolidated durable LiveKit token auth fix intact as well: `supabase/config.toml` now owns `[functions.livekit-token] verify_jwt = false`, and this branch should not reopen the old ES256 gateway blocker unless fresh proof shows a regression. Also keep the newly integrated Firebase monitoring owners intact: Firebase Analytics and Remote Config remain the analytics/config owners, Crashlytics and Performance Monitoring now have repo-owned owners, and there is still no checked-in Sentry integration to remove on this branch. Do not reopen `app/player/[id].tsx` or `app/watch-party/live-stage/[partyId].tsx` speculatively. Only return if fresh runtime proof shows a new regression in the standalone-vs-party split, the `Live First` lower lane, the Party-vs-Live route doctrine, or the new LiveKit runtime boundary on this consolidated base. Otherwise continue the remaining runtime-truth consolidation chain, with the next narrow lane being final runtime validation plus any still-needed Firebase default-app boot guard if launch proof shows it is required.

## Current Plan
1. Preserve the newer approved standalone-player vs `Watch-Party Live` split exactly as now proved on `main`.
2. Preserve the newer approved `Live First` lower comments/reactions/studio lane and visible mode toggle.
3. Preserve the durable `livekit-token` function config in `supabase/config.toml` and do not reopen the old gateway auth blocker without fresh regression proof.
4. Preserve the Firebase monitoring owners and Firebase-native crash/perf proof hooks exactly as landed.
5. Reopen the player or live-stage owners only if fresh runtime proof shows a real regression.
6. Otherwise continue with the next runtime-truth consolidation lane from this mainline base.

## Exact Next Batch
- preserve the restored `Watch-Party Live` player context above playback and bounded shared-social layer below
- preserve the restored `Live First` lower comments/reactions/studio lane
- preserve the durable `livekit-token` function config and auth-fix truth
- preserve the Firebase monitoring owners and config
- avoid speculative player or live-stage UI churn
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve the now-restored player/live-stage truth exactly as recorded
- preserve the carried-forward durable LiveKit token auth fix
- preserve the carried-forward Firebase monitoring foundation
- avoid inventing new room shells or duplicating player structure
- keep route doctrine unchanged
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- reopen token issuance or transport debugging without fresh proof
- redesign the watch-party structure again
- broaden into Firebase/profile/admin/chat lanes beyond the already-landed monitoring owner carryforward
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- the restored standalone-player vs `Watch-Party Live` split stays true
- the restored `Live First` lower comments lane stays regression-free
- the durable `livekit-token` auth fix stays carried forward on this consolidated base
- the Firebase monitoring owners remain carried forward on this consolidated base
- the repo can move forward without rediscovering the stale player/live-stage structure, the old token-auth blocker, or the missing Firebase monitoring foundation
