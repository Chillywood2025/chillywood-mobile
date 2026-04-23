# NEXT TASK

## Exact Next Task
Run the whole-lane branch-truth re-audit now that the three audited implementation batches are landed. Only do one final trivial/narrow branch-specific copy cleanup if the re-audit proves it is still justified and lane-pure.

## Current Plan
1. Preserve the current truthful product baseline exactly as landed across profile, watch-party/live, chat, title/player, settings/legal/support, channel settings, and bounded admin.
2. Keep the completed runtime, interaction, invite, locked-room, and Live Stage proof groundwork intact while correcting only the narrower branch-truth leaks found in the audit.
3. Keep the now-landed watch-party/live direct-entry access fix intact:
   `app/watch-party/live-stage/[partyId].tsx` and the `partyId` branch inside `app/player/[id].tsx` now resolve room access before admitted live/watch behavior and should stay closed while the rest of this lane lands.
4. Keep the now-landed signed-out self/public separation intact:
   `app/(tabs)/index.tsx` no longer surfaces a faux signed-out “your channel” path, and `app/profile/[userId].tsx` no longer trusts `self=1` without a real signed-in identity match.
5. Keep the now-landed signed-out chat gate intact:
   `app/chat/index.tsx` and `app/chat/[threadId].tsx` now render honest signed-out gating instead of generic member-style load/missing-thread errors, while `_lib/chat.ts` stays strict about requiring a real signed-in identity.
6. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- re-audit the corrected owners:
  `app/watch-party/live-stage/[partyId].tsx`
  `app/player/[id].tsx`
  `app/(tabs)/index.tsx`
  `app/profile/[userId].tsx`
  `app/chat/index.tsx`
  `app/chat/[threadId].tsx`
- only land one final trivial/narrow branch-specific copy cleanup if the re-audit proves it is still justified and lane-pure
- keep the landed Party Room invite, room-aware invite search, locked-room denial, live-room autolaunch removal, Live Stage interaction/runtime hardening, and stage-entry overlay arming fix intact
- do not widen into broad route redesign, schema changes, or the later two-phone proof lane until these branch leaks are closed
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve all current canonical route owners and landed doctrine exactly as-is
- keep the current social baseline, monetization/access truth, and no-fake-comments/no-fake-ads doctrine intact
- use `docs/native-friend-graph-implementation-spec.md` as the implementation source of truth
- use `docs/native-social-engagement-foundation-spec.md` as the engagement-truth source of truth
- keep the active owners on the narrow audited branch-leak surfaces only, with the watch-party/live owners first
- treat later two-phone Live Stage proof as still required, but not as the only remaining lane until these branch-truth leaks are fixed
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
- later two-phone Live Stage proof becomes the honest remaining proof lane again after these branch leaks are closed
- no route drift, schema drift, fake room powers, or fake social claims are introduced
- the staged set stays task-pure
