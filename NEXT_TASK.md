# NEXT TASK

Generated from `config/assurance/current-truth-v1.json`. Do not hand-edit.

1. Keep D2A frozen in this synchronization; PR #210 merged at 31087f37290f521d956e125e518f92c3c65a736e after repository-owned exact-head review P0=0/P1=0 and Phase 1 run 31470393389 passed 13/13.
2. Preserve the merged bounded PR #210 correction, which fixes all five internally validated PR #194 findings without package, native, database, provider, build, OTA, or release changes; T0-T2 are clear and T3 remains BLOCKED_INTERNAL pending release-critical native execution.
3. Next, resume D2A only for release-critical execution: create new signed Android and iOS candidates, run critical physical release smoke, and prepare controlled U.S. rollout.
4. After D2A or its bounded separately authorized repair completes, execute the locked W1-W3 sequence before full iOS D3.
5. D2B source is represented in Git at merge 18cbf8156c1b2a12e7cb7a8c178fd9cd1d33a8a7, but NEW_ANDROID_BINARY_REQUIRED remains true and Android build 86 does not contain D2B; do not claim OTA, signed, installed, physical, provider, or public delivery.
6. Keep runtime backup restore BLOCKED_LOCAL_ANDROID_BACKUP_TRANSPORT with restored values null and D2A as its proof owner; T3 remains partial and T4 remains compile/emulator partial.
7. Keep B1 20260730230022, B2 20260730170000, and B3 20260730230031 represented in Git and undeployed.
8. Keep PR E blocked until every required PR D successor merges; keep PR F blocked until PR E merges.
9. Keep all review-only branches retained and never merge them.

Do not ask owner approval for Level 0/1 autonomous operations. Keep Level 3/4 owner approval and external-confirmation boundaries intact.

Do not resume Cognitive LiveKit activation.
Do not create a release or distribution build, publish OTA, mutate a provider or database, enable a switch or schedule, change Premium, money, rights, auth or RLS, start Responsive Layout V2 or AppLovin, or release publicly.
