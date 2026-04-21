# NEXT TASK

## Exact Next Task
Run the creator monetization / ad-readiness control audit on `app/channel-settings.tsx`. Do not auto-open Google Play readiness, OVH, database-move, or fake public ad-rollout work.

## Current Plan
1. Treat the behavior/social consistency lane and the broader player architecture chapter as closed enough to move on.
2. Preserve the landed deferred-access trust fix on `components/monetization/access-sheet.tsx`.
3. Carry forward the current truthful social baseline on profile, chat, title, player, and watch-party owners unchanged.
4. Keep ads doctrine explicit: no current public route is honestly ads-ready yet.
5. Use the next pass to audit creator-side monetization and ad-readiness control truth on `/channel-settings`.
6. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- keep the monetization audit result explicit: Premium and Party Pass truth are real, while ads remain foundation-only and not honestly route-ready
- preserve the landed deferred-access sheet trust fix without widening it into a broader monetization or ad rollout
- audit whether creator-side monetization/ad control truth belongs on `/channel-settings` now or remains later
- do not invent fake ads, fake monetization powers, Google Play readiness work, OVH work, or database-move work
- keep self-view, official view, pending/request states, public friend counts, public friend lists, and universal comments later
- keep creator/public, admin/owner, and route/doctrine boundaries intact
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
 - preserve `/player/[id].tsx`, `/title/[id]`, `/profile/[userId].tsx`, `/watch-party/index.tsx`, `/watch-party/[partyId].tsx`, `/channel-settings`, and the canonical chat owners while creator-side monetization/ad-readiness truth is audited
 - use `docs/native-friend-graph-implementation-spec.md` as the implementation source of truth
 - use `docs/native-social-engagement-foundation-spec.md` as the engagement-truth source of truth
 - keep the current social baseline settled while monetization/access/ad-readiness truth stays grounded
 - preserve inbox scan clarity, profile friendship boundaries, room/live comment truth, and rights-aware share gating during the next pass
 - keep the player chapter closed unless the monetization audit proves a real structural player issue that was missed
 - keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
 - change route truth
 - invent a broad social rewrite lane
 - reopen Google Play readiness, OVH work, or database-move work
 - invent fake friend counts, fake mutuals, fake Rachi-social behavior, fake comment systems, or fake creator/platform powers
 - invent fake ads, fake placements, or fake entitlements
 - mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- the broader player chapter stays closed cleanly after the three safe structural extractions
- standalone-only top chrome, live-mode overlay cluster, and participant host-tool shell stay structurally isolated without route drift or schema drift
- rights-aware share gating, room/live comment truth, and current social boundaries remain intact while creator-side monetization truth is audited
- the next pass does not invent ad placement truth where none exists and does not imply ads are route-ready
- the shared deferred-access sheet no longer reads like an internal testing/store-readiness surface
- the next lane proves whether `/channel-settings` is the right creator-side owner for later monetization/ad controls before any public route adoption is attempted
- public/profile/chat/title/player routes still make no fake social claims
- no route drift or fake social claims are introduced
- the staged set stays task-pure
