# NEXT TASK

## Exact Next Task
The active pass is now the master product closeout audit. Repo truth is explicit: the strongest remaining broader route-owned candidates were rechecked, and there is currently no single must-ship product chapter that honestly has to land before release hardening later. The next step is to close this audit cleanly and record whether product work is now closed enough, without starting Google Play readiness, OVH work, or database-move work.

## Current Plan
1. Treat the watch-party entry shell, Party Room setup shell, pre-stage Live Room hierarchy, and actual live-stage surface hierarchy chapters as closed cleanly for now.
2. Preserve the landed watch-party/live cleanups on `app/watch-party/index.tsx`, `app/watch-party/[partyId].tsx`, and `app/watch-party/live-stage/[partyId].tsx`.
3. Treat the broader public profile structure chapter as closed cleanly for now.
4. Keep `app/profile/[userId].tsx`, `app/watch-party/live-stage/[partyId].tsx`, and `app/admin.tsx` in the later/broader bucket unless a future audit reopens one intentionally.
5. Do not force another product chapter now that none of the remaining candidates clear the must-ship bar.
6. Use the next step to decide whether product work is closed enough to hand off to release hardening later.
7. Keep unrelated local dirt out of the checkpoint.

## Exact Next Batch
- do not auto-open another broader product chapter now that the current audit found no must-ship winner
- keep the remaining profile, live-stage, and admin regrouping work explicitly later unless a future audit proves one became release-critical
- use the next step to record whether product work is closed enough to move on to release hardening later
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- preserve `app/watch-party/index.tsx`, `app/watch-party/[partyId].tsx`, and `app/watch-party/live-stage/[partyId].tsx` as closed watch-party/live owners unless a future broader audit intentionally reopens one
- preserve `app/profile/[userId].tsx` as closed for now after the broader owner/public seam pass
- keep `/admin` closed for now after its recent bounded product cleanup
- keep the current social baseline, monetization/access truth, and no-fake-comments/no-fake-ads doctrine intact
- use `docs/native-friend-graph-implementation-spec.md` as the implementation source of truth
- use `docs/native-social-engagement-foundation-spec.md` as the engagement-truth source of truth
- do not start release hardening inside this pass; only record whether product work is now cleanly ready for it later
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
 - change route truth
 - reopen a closed chapter casually before the broader audit selects it
 - reopen Google Play readiness, OVH work, or database-move work
 - invent fake room powers, fake comments, fake social claims, fake ads, or fake entitlements
 - mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- the closed route-owned product chapters stay intact and are not reopened casually
- the remaining profile, live-stage, and admin seams stay explicitly later rather than being overstated as must-ship blockers
- the repo truth clearly states whether product work is closed enough to move on to release hardening later
- no route drift, schema drift, fake room powers, or fake social claims are introduced
- the staged set stays task-pure
