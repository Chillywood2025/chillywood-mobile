# ROADMAP

## Phase Order
Chi'llywood should advance in structure-safe phases that keep product truth stable while deeper platform systems are added.

Current execution order:
- Phase 0: Rachi foundation first
- Phase 2: moderation/admin minimums after Rachi
- Phase 3: Home/content polish
- Phase 4: release hardening
- Phase 5: final integration proof

## Carried-Forward Proved Baseline
- The previously closed Stage 4 / PostHog / auth-home / Settings-Logout / login-visual truth remains carried forward as valid baseline work
- That proved baseline should not be reopened during intermediate build phases unless code-level evidence shows a real contradiction
- Emulator/device-heavy proof is intentionally deferred until the final integration phase unless a targeted runtime check becomes a true blocker

## Phase 0: Rachi Foundation
- establish Rachi as Chi'llywood's official platform-owned seeded account
- protect Rachi from normal-user claim/edit semantics
- keep Rachi on the canonical profile/channel and Chi'lly Chat routes
- add the minimum official identity, role-foundation, starter-presence, and protection groundwork needed for later moderation/admin extension
- avoid broad unrelated rewrites

## Carried-Forward Profile / Channel And Chi'lly Chat Truth
- the current profile/channel and Chi'lly Chat implementation is carried forward as good enough for now unless a later blocker proves otherwise
- canonical profile/channel routing remains `/profile/[userId]`
- canonical Chi'lly Chat routing remains `/chat` and `/chat/[threadId]`
- no automatic next-phase reopening of profile/channel or Chi'lly Chat completion is planned

### Current Stage 4 / PostHog Checkpoint
- Phase 4 / Stage 4 is completed/proved on the current build
- Flow 08 is completed/proved on the current build because current terminal/workflow output proved it on the current build
- cloud Flow 08 is now completed/proved on the latest cloud rerun
- the corrected Party / Live split is completed/proved on the current build
- Flow 09 is completed/proved on the current build
- the final cloud rerun `019d4809-ba44-75d1-a3bb-39bb8c16663c` finished green on commit `14b45f5bd0e00ce73a8e5c9a6b3bbbb347c14e91`
- cloud artifact inspection plus a bounded local 320x640-style replay proved the earlier Flow 09 cloud issue was a patched below-the-fold shares-entry proof-path problem, not a product regression
- there is no remaining automated blocker in Stage 4
- no final human verification pass is planned for this checkpoint
- PostHog default-off and on-state proof are completed/proved on the current build
- repo/doc/proof-harness reconciliation is now closed against this checkpoint baseline
- that checkpoint now serves as carried-forward baseline truth under the new execution order instead of forcing the next lane to be EAS-only rollout work

## Phase 2: Moderation / Admin Minimums
- report flow
- role-aware permissions
- admin/moderation minimum surfaces or foundations
- audit-minded platform action structure

## Phase 3: Home / Content Polish
- Continue Watching placement and product truth
- Top Rated / Browse / Favorites correctness
- title metadata, added-date, and reactions/comments correctness where intended
- no dead routes or `Not found` regressions on valid content paths

## Phase 4: Release Hardening
- preview/release configuration cleanup
- PostHog, flags, and config cleanup where planned
- Sentry and release-minded hardening
- EAS and config-warning cleanup
- task-pure repo/checkpoint truth cleanup

## Phase 5: Final Integration Proof
- resume emulator/device-heavy proof only here
- verify the completed phases together end-to-end
- run the required final integration/runtime proof after the build phases are complete
