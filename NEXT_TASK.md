# NEXT TASK

## Exact Next Task
Resume the live/watch-party realtime + audio validation lane only when at least two real devices are attached again, then prove shared audio truth and handoff behavior across the existing watch-party/live owners before any new implementation batch.

## Current Plan
1. Preserve the current truthful product baseline exactly as landed across profile, watch-party/live, chat, title/player, settings/legal/support, channel settings, and bounded admin.
2. Keep the closed branch-truth fixes intact:
   live/watch direct-entry admission truth, signed-out self/public separation, and signed-out Chi'lly Chat auth gating should stay closed while proof work resumes.
3. Keep the just-landed realtime/audio batch intact on the current route owners:
   `components/watch-party-live/livekit-stage-media-surface.tsx`
   `app/watch-party/live-stage/[partyId].tsx`
   `app/player/[id].tsx`
4. Re-enter the real owner paths with the current live/watch routes unchanged:
   `app/watch-party/index.tsx`
   `app/watch-party/[partyId].tsx`
   `app/watch-party/live-stage/[partyId].tsx`
   `app/player/[id].tsx`
5. Use the corrected systems map honestly:
   audio is its own `PARTIALLY_REAL` / `FRAGILE` system and must be proved explicitly, not inferred from video or room presence.
6. Keep the systems-audit ranking in mind while doing that proof:
   the next two later seams after the live/media lane are `scheduled events/reminders -> canonical room/access integration` and `discovery/content-data read-model unification`, but neither should be reopened before the active live proof lane closes.
7. Keep the durable systems map current:
   `docs/app-systems-inventory-and-integration-audit.md`
8. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- use at least two real devices to prove the shared live/audio path honestly on:
  `app/watch-party/index.tsx`
  `app/watch-party/[partyId].tsx`
  `app/watch-party/live-stage/[partyId].tsx`
  `app/player/[id].tsx`
- keep the just-landed local-audio publish truth intact on:
  `components/watch-party-live/livekit-stage-media-surface.tsx`
  `app/watch-party/live-stage/[partyId].tsx`
  `app/player/[id].tsx`
- prove:
  host mic publish truth
  viewer playback audio truth
  remote mute/unmute enforcement
  shared-room audio truth across watch-party/live owners
- do not widen into broad route redesign, schema changes, or unrelated product work
- keep unrelated local dirt out of the checkpoint
- if the lane still cannot close honestly with multi-device proof, record the exact seam before reopening any new code batch
- do not reopen later systems lanes ahead of this one

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
- the landed direct-entry Live Stage / `partyId` player fix stays intact and direct entry can no longer bypass real room-access and membership truth
- the landed Home/Profile fix stays intact and signed-out users can no longer drift into a faux self/owner profile branch
- the landed chat fix stays intact and signed-out users hitting Chi'lly Chat see an honest gate instead of a generic member-style failure state
- the existing Live Stage interaction, member-visibility, invite, and locked-room fixes stay intact
- the remaining live/watch-party realtime and audio proof is completed honestly without reopening branch-truth leaks
- no route drift, schema drift, fake room powers, or fake social claims are introduced
- the staged set stays task-pure
