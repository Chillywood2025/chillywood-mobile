# NEXT TASK

## Exact Next Task
Preserve the April 24, 2026 two-real-device LiveKit camera-visibility fix on the current live-stage owner, then move to a narrow follow-up only if a real proof lane exposes it. The next honest candidate is a route-stack / repeated-deeplink cleanup audit for `/watch-party/live-stage/[partyId]`, because repeated Android deep links can leave older proof-room route instances logging harmless render-branch lines even while the current LiveKit room works.

## Current Plan
1. Keep the newly proved LiveKit entry-role fix intact on `app/watch-party/live-stage/[partyId].tsx`.
2. Keep Live First and Live Watch-Party as modes of `/watch-party/live-stage/[partyId]`; do not hand off to Party Room.
3. Keep the route-local hybrid LiveKit owner on explicit `Room` ownership with room-specific teardown tracking.
4. Keep the Android proof standard from room `E4U5FP` and room `NN9RLU`: both devices in the same LiveKit room, local camera true on both, remote track count 1 on both, visible count 2 on both, and no stale signal/read-loop blocker.
5. Treat repeated-deeplink route-stack noise as the only known follow-up seam from this pass unless a later proof lane produces a stronger blocker.
6. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- Optional narrow audit:
  `app/watch-party/live-stage/[partyId].tsx`
  repeated deep-link behavior on Android
  route replacement vs stacked route instances
  mode-parameter changes while a LiveKit room is already mounted
- Preserve, do not reopen, the proved LiveKit camera path:
  Live First room `E4U5FP`
  Live Watch-Party room `NN9RLU`
  hybrid leave/rejoin proof on `NN9RLU`
- Do not widen into broad route redesign, schema changes, or unrelated product work.
- If a later proof lane finds a real media split again, isolate the exact owner/function before editing.

## Scope
This next pass should:
- preserve all current canonical route owners and landed doctrine exactly as-is
- keep the current social baseline, monetization/access truth, and no-fake-comments/no-fake-ads doctrine intact
- use `docs/native-friend-graph-implementation-spec.md` as the implementation source of truth
- use `docs/native-social-engagement-foundation-spec.md` as the engagement-truth source of truth
- use `docs/app-systems-inventory-and-integration-audit.md` as the current systems/integration truth map
- treat later multi-device live/watch-party realtime plus audio proof as the active remaining lane
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- change route truth
- reopen broader product or release-hardening work in this pass
- reopen Google Play readiness, OVH work, or database-move work
- invent fake room powers, fake comments, fake social claims, fake ads, or fake entitlements
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- the just-landed live-room preview action fix stays intact and the preview `Join Now` path is physically tappable on Android
- the just-landed pre-stage Live Stage footer CTA fix stays intact and both real devices can still advance into the actual stage owner by the canonical owner path
- the landed direct-entry Live Stage / `partyId` player fix stays intact and direct entry can no longer bypass real room-access and membership truth
- the landed Home/Profile fix stays intact and signed-out users can no longer drift into a faux self/owner profile branch
- the landed chat fix stays intact and signed-out users hitting Chi'lly Chat see an honest gate instead of a generic member-style failure state
- the existing Live Stage interaction, member-visibility, invite, and locked-room fixes stay intact
- the remaining live/watch-party realtime and audio proof is completed honestly without reopening branch-truth leaks
- no route drift, schema drift, fake room powers, or fake social claims are introduced
- the staged set stays task-pure
