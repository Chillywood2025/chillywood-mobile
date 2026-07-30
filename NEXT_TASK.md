# NEXT TASK

Generated from `config/assurance/current-truth-v1.json`. Do not hand-edit.

1. Finish, exact-head review, and merge PR A: First-Pass Assurance contracts only.
2. Run the merged assurance engine read-only against PR #52, PR #53, and remote migration head `20260730161737`.
3. Create bounded Git-only reconciliation PRs B1, B2, and B3. Use exact deployed migration versions and statement bodies; run `supabase db push --dry-run`; never apply them again.
4. After all unique source is safely on main, close PR #52 unmerged as superseded and PR #53 unmerged as stale review-only; retain both branches.

Do not ask owner approval for Level 0/1 autonomous operations. Keep Level 3/4 owner approval and external-confirmation boundaries intact.

Do not resume Cognitive LiveKit activation. Do not build, publish OTA, mutate a provider/database, enable a switch/schedule, change Premium/money/rights/auth/RLS, start Responsive Layout V2, start AppLovin, or release publicly.
