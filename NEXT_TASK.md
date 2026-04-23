# NEXT TASK

## Exact Next Task
Finish the current live/watch-party realtime + audio validation pass by using the single attached Android device for an honest owner-path smoke, then decide whether the only remaining blocker is later multi-device proof.

## Current Plan
1. Preserve the current truthful product baseline exactly as landed across profile, watch-party/live, chat, title/player, settings/legal/support, channel settings, and bounded admin.
2. Keep the closed branch-truth fixes intact:
   live/watch direct-entry admission truth, signed-out self/public separation, and signed-out Chi'lly Chat auth gating should stay closed while proof work resumes.
3. Keep the just-landed realtime/audio batch intact on the current route owners:
   `components/watch-party-live/livekit-stage-media-surface.tsx`
   `app/watch-party/live-stage/[partyId].tsx`
   `app/player/[id].tsx`
4. Re-enter the real owner path with the current live/watch routes unchanged:
   `app/watch-party/[partyId].tsx`
   `app/watch-party/live-stage/[partyId].tsx`
   `app/player/[id].tsx`
5. Keep the systems-audit ranking in mind while doing that proof:
   the next two later seams after the live/media lane are `scheduled events/reminders -> canonical room/access integration` and `discovery/content-data read-model unification`, but neither should be reopened before the active live proof lane closes.
6. Keep the durable systems map current:
   `docs/app-systems-inventory-and-integration-audit.md`
7. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- use the currently attached Android device to smoke the live owner path honestly:
  `app/watch-party/index.tsx`
  `app/watch-party/live-stage/[partyId].tsx`
- keep the just-landed local-audio publish truth intact on:
  `components/watch-party-live/livekit-stage-media-surface.tsx`
  `app/watch-party/live-stage/[partyId].tsx`
  `app/player/[id].tsx`
- then decide whether the exact remaining blocker is later multi-device audio/realtime proof
- do not widen into broad route redesign, schema changes, or unrelated product work
- keep unrelated local dirt out of the checkpoint
- if the lane cannot close honestly with one device attached, record that blocker exactly
- do not reopen later systems lanes ahead of this one

## Scope
This next pass should:
- preserve all current canonical route owners and landed doctrine exactly as-is
- keep the current social baseline, monetization/access truth, and no-fake-comments/no-fake-ads doctrine intact
- use `docs/native-friend-graph-implementation-spec.md` as the implementation source of truth
- use `docs/native-social-engagement-foundation-spec.md` as the engagement-truth source of truth
- use `docs/app-systems-inventory-and-integration-audit.md` as the current systems/integration truth map
- treat live/watch-party realtime plus audio validation as the active remaining lane
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
