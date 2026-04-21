# NEXT TASK

## Exact Next Task
The bounded public legal-surface upstream slice is now complete on `main`. The governing truth is now: `APP_UPSTREAM_READY = LATER_BOUNDED_SLICE`, `LEGAL_SURFACE_READY = YES_BOUNDED_STATIC_SLICE`, and the only honest non-realtime Hetzner-served slice that was ready is now actually live at `https://live.chillywoodstream.com/privacy`, `https://live.chillywoodstream.com/terms`, and `https://live.chillywoodstream.com/account-deletion`. Broader app/backend upstream remains out of scope, support/status hosting remain out of scope, Supabase remains external, and database/auth migration remains deferred under [docs/database-move-doctrine-audit.md](/Users/loverslane/chillywood-mobile/docs/database-move-doctrine-audit.md). There is no new broader deployment lane opened by this result. If infra work resumes later, the next exact lane should be a deferred **release hardening later** pass, not broader app hosting or database migration.

## Current Plan
1. Re-read `CURRENT_STATE.md`, `docs/app-upstream-doctrine-readiness.md`, `docs/public-legal-surface-contract.md`, `docs/hetzner-first-deployment-implementation-spec.md`, `docs/database-move-doctrine-audit.md`, `PRODUCT_DOCTRINE.md`, `ROADMAP.md`, and this file first.
2. Treat the current Hetzner LiveKit ingress plus bounded legal-surface slice as the fully proved infra baseline.
3. Keep `APP_UPSTREAM_READY = LATER_BOUNDED_SLICE` as current truth for any broader non-realtime hosting question.
4. Keep support/status hosting out of scope unless separate owner/doctrine work intentionally reopens them later.
5. Keep Firebase / RevenueCat / Expo/EAS external for now.
6. Keep database-move or auth-cutover work deferred unless a separate later chapter explicitly reopens them.
7. If infra work resumes later, start with release-hardening doctrine/audit only, not broader app deployment.

## Exact Next Batch
- do not reopen the now-closed bounded legal deployment slice unless the live paths regress
- keep broader app-upstream deployment explicitly out of scope
- keep database/auth migration explicitly out of scope
- if infra work resumes later, begin with release-hardening doctrine/audit only
- keep unrelated local dirt out of the checkpoint

## Scope
This next pass should:
- treat the current bounded legal-surface deployment as closed and preserve it
- preserve all current product route truth and all previously landed chapter ownership
- keep broader app-upstream hosting explicitly deferred even though LiveKit ingress is now real
- avoid reopening already-landed safety, design, discovery, analytics, or owner/admin implementation unless a real regression is found
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- buy providers or add OVH work
- start broader app deployment, database-move work, or Google Play readiness work in this lane
- move databases or Supabase auth off their current hosted owner
- fake app upstream, fake broader product deployment, or reopen already-proved realtime/legal slices as though they were still the open blocker
- change current public/product route truth
- write provider tokens, private keys, or raw secrets into repo files
- widen into full app deployment, app upstream hosting, or unrelated infra systems
- mix unrelated local dirt into the checkpoint

## Success Criteria
The next lane is successful when:
- the already-landed LiveKit + bounded legal baseline stays explicit and grounded
- any later reopened lane starts from the real closed slices instead of re-proving them from scratch
- no raw secret is written to repo files or output summaries
- external service ownership stays unchanged
- no fake infrastructure claim, raw secret exposure, or route drift is introduced
