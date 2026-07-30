# NEXT TASK

Generated from `config/assurance/current-truth-v1.json`. Do not hand-edit.

1. Keep reconciliation PRs #69, #70, and #75 BLOCKED_INTERNAL; their exact reviews require separate forward-only authority/security corrections and no production deployment is authorized.
2. Complete the three bounded Git-only reconciliation corrections and exact reviews before PR D; do not deploy or reapply any migration.
3. After B1, B2, and B3 are reconciled and merged, begin PR D native/provider/runtime/artifact assurance without a production build, OTA, provider mutation, or product behavior change.
4. Keep PR E blocked until PRs C and D are merged; keep PR F blocked until PR E merges.
5. Keep PR #52 frozen and unmerged and PR #53 stale, review-only, and unmerged until bounded reconciliation safely preserves all unique source.

Do not ask owner approval for Level 0/1 autonomous operations. Keep Level 3/4 owner approval and external-confirmation boundaries intact.

Do not resume Cognitive LiveKit activation.
Do not build, publish OTA, mutate a provider or database, enable a switch or schedule, change Premium, money, rights, auth or RLS, start Responsive Layout V2 or AppLovin, or release publicly.
