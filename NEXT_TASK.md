# NEXT TASK

## Exact Next Task
Run the live/watch-party realtime + audio proof and handoff validation lane now that the systems map explicitly includes audio and confirms this is still the most important remaining cross-system integration lane.

## Current Plan
1. Preserve the current truthful product baseline exactly as landed across profile, watch-party/live, chat, title/player, settings/legal/support, channel settings, and bounded admin.
2. Keep the closed branch-truth fixes intact:
   live/watch direct-entry admission truth, signed-out self/public separation, and signed-out Chi'lly Chat auth gating should stay closed while proof work resumes.
3. Re-enter the real two-phone Live Stage / Watch-Party Live proof lane with the current route owners unchanged:
   `app/watch-party/[partyId].tsx`
   `app/watch-party/live-stage/[partyId].tsx`
   `app/player/[id].tsx`
4. Keep the systems-audit ranking in mind while doing that proof:
   the next two later seams after the live/media lane are `scheduled events/reminders -> canonical room/access integration` and `discovery/content-data read-model unification`, but neither should be reopened before the active live proof lane closes.
5. Keep the durable systems map current:
   `docs/app-systems-inventory-and-integration-audit.md`
6. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- run the later two-phone proof path on the current live/watch owners:
  `app/watch-party/[partyId].tsx`
  `app/watch-party/live-stage/[partyId].tsx`
  `app/player/[id].tsx`
- treat the systems-audit result as confirmed:
  this is still the highest-priority remaining cross-system lane on current `main`, and audio truth is part of the same lane rather than an implied sub-detail
- keep the landed Party Room invite, room-aware invite search, locked-room denial, live-room autolaunch removal, Live Stage interaction/runtime hardening, stage-entry overlay arming fix, and branch-truth corrections intact
- do not widen into broad route redesign, schema changes, or unrelated product work
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve all current canonical route owners and landed doctrine exactly as-is
- keep the current social baseline, monetization/access truth, and no-fake-comments/no-fake-ads doctrine intact
- use `docs/native-friend-graph-implementation-spec.md` as the implementation source of truth
- use `docs/native-social-engagement-foundation-spec.md` as the engagement-truth source of truth
- use `docs/app-systems-inventory-and-integration-audit.md` as the current systems/integration truth map
- treat live/watch-party realtime plus audio proof as the active remaining lane again
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
