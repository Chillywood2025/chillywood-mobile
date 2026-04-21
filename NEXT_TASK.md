# NEXT TASK

## Exact Next Task
Run the monetization / ads closeout audit and gating decision. The shared monetization helper cleanup and the route-owned `/profile/[userId]` access wording pass are both landed, so the next step is to decide whether this chapter is honestly complete enough to hand off to whole-app proof / QA.

## Current Plan
1. Treat the creator monetization / ad-readiness control lane on `/channel-settings` as closed cleanly.
2. Preserve the landed deferred-access trust fix on `components/monetization/access-sheet.tsx`.
3. Preserve the clearer creator-grants / ad-readiness summary and creator-facing default labels on `/channel-settings`.
4. Preserve the shared monetization helper cleanup so Premium / Party Pass stay current truth while later title/live direct unlock framing and store/dev-build wording stay demoted.
5. Preserve the route-owned `/profile/[userId]` access wording cleanup so current Premium / Party Pass posture reads as current default-entry truth rather than speculation.
6. Keep ads doctrine explicit: no current public route is honestly ads-ready yet, and immersive player/watch-party/live/chat surfaces remain no-ads-here.
7. Keep whole-app proof / QA gated closed until this monetization/ad chapter is honestly ready to hand off.
8. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- keep the monetization audit result explicit: Premium and Party Pass truth are real, while ads remain foundation-only and not honestly route-ready
- preserve the landed deferred-access sheet trust fix without widening it into a broader monetization or ad rollout
- keep `/channel-settings` closed unless the broader chapter proves a real new control-center issue
- preserve `_lib/monetization.ts` and `components/monetization/access-sheet.tsx` now that shared language reflects current truth rather than store/dev-build or later-phase direct-unlock optimism
- preserve `/profile/[userId]` now that current Premium / Party Pass posture reads as current default-entry truth rather than speculative later wording
- run the monetization / ads closeout audit before opening whole-app proof / QA
- do not invent fake ads, fake monetization powers, Google Play readiness work, OVH work, or database-move work
- keep self-view, official view, pending/request states, public friend counts, public friend lists, and universal comments later
- keep creator/public, admin/owner, and route/doctrine boundaries intact
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
 - preserve `/player/[id].tsx`, `/title/[id]`, `/profile/[userId].tsx`, `/watch-party/index.tsx`, `/watch-party/[partyId].tsx`, `/channel-settings`, and the canonical chat owners while monetization/ad-readiness truth stays grounded
 - start from the landed shared monetization helper and access-sheet cleanup before widening into another route-owned batch
 - use `docs/native-friend-graph-implementation-spec.md` as the implementation source of truth
 - use `docs/native-social-engagement-foundation-spec.md` as the engagement-truth source of truth
 - keep the current social baseline settled while monetization/access/ad-readiness truth stays grounded
 - preserve inbox scan clarity, profile friendship boundaries, room/live comment truth, and rights-aware share gating during the next pass
 - keep the player chapter closed unless the monetization audit proves a real structural player issue that was missed
 - keep the whole-app proof / QA chapter closed until monetization/ad truth is clarified enough to hand off honestly
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
- shared monetization helpers no longer read like a store-readiness or dev-build surface and no longer overstate later title/live direct-unlock truth
- Premium and Party Pass stay the current backed monetization/access truth while ads remain foundation-only and not honestly route-ready
- rights-aware share gating, room/live comment truth, and current social boundaries remain intact while monetization/ad doctrine is clarified
- `/channel-settings` keeps its clearer creator grants without being reopened casually
- `/profile/[userId]` access wording stays route-owned and honest rather than speculative, while Chi'lly Chat itself stays distinct from monetized direct-message claims
- whole-app proof / QA does not start until the monetization/ad gate is honestly ready
- public/profile/chat/title/player routes still make no fake social or ad claims
- no route drift, schema drift, or fake monetization claims are introduced
- the staged set stays task-pure
