# NEXT TASK

Generated from `config/assurance/current-truth-v1.json`. Do not hand-edit.

1. Merge this three-file current-truth synchronization, then run four fresh exact-head review lanes and one full CI run for PR #64 at 6fbb96f9502932bf4c0a83c32e71b0e621ca4187; the fresh lanes must approve its 12-file/1,600-line single-domain waiver.
2. After PR #64 merges, run one post-merge main CI and synchronize current truth again.
3. Keep reconciliation PRs #69, #70, and #75 BLOCKED_INTERNAL; their exact reviews require separate forward-only authority/security corrections and no production deployment is authorized.
4. Do not start PR D until reconciliation is complete; PR E and PR F remain dependency-blocked.
5. Keep PR #52 frozen and unmerged and PR #53 stale, review-only, and unmerged until bounded reconciliation safely preserves all unique source.

Do not ask owner approval for Level 0/1 autonomous operations. Keep Level 3/4 owner approval and external-confirmation boundaries intact.

Do not resume Cognitive LiveKit activation.
Do not build, publish OTA, mutate a provider or database, enable a switch or schedule, change Premium, money, rights, auth or RLS, start Responsive Layout V2 or AppLovin, or release publicly.
