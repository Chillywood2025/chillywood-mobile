# NEXT TASK

Generated from `config/assurance/current-truth-v1.json`. Do not hand-edit.

1. Run the merged assurance engine read-only against PR #52, PR #53, and remote migration head `20260730161737`.
2. Create and exact-head review bounded Git-only reconciliation PR B1 for the LiveKit source-identity migration.
3. Create and exact-head review bounded Git-only reconciliation PR B2 for RevenueCat transfer migrations.
4. Create and exact-head review bounded Git-only reconciliation PR B3 for the room-host participant block check.
5. After all unique source is safely on main, close PR #52 unmerged as superseded and PR #53 unmerged as stale review-only; retain both branches.

Do not ask owner approval for Level 0/1 autonomous operations. Keep Level 3/4 owner approval and external-confirmation boundaries intact.

Do not resume Cognitive LiveKit activation.
Do not build, publish OTA, mutate a provider or database, enable a switch or schedule, change Premium, money, rights, auth or RLS, start Responsive Layout V2 or AppLovin, or release publicly.
