# NEXT TASK

## Exact Next Task
Carry forward the new Firebase-native monitoring baseline exactly as now landed on the Firebase branch: Firebase Analytics and Remote Config remain the analytics/config owners, Crashlytics is now the repo-owned crash/error owner through `_lib/firebaseCrashlytics.ts` and `_lib/logger.ts`, Performance Monitoring is now the repo-owned perf owner through `_lib/firebasePerformance.ts`, `app/_layout.tsx` is the single bootstrap owner, `components/dev/dev-debug-overlay.tsx` is the dev-only proof owner, and repo truth still contains no checked-in Sentry integration to remove. The exact next task is native/device proof on Android: run a dev build or release-style build with Firebase configured, trigger the logged non-fatal error, trigger the forced native crash, run the performance probe, and verify all three surfaces arrive in Firebase console truth. Do not broaden into unrelated watch-party/profile/admin work while doing that proof.

## Current Plan
1. Preserve the new Firebase monitoring owners exactly as landed.
2. Rebuild and run the Android dev build or equivalent native build required for Crashlytics/Performance proof.
3. Verify the non-fatal test, forced native crash, and performance trace/network probe in Firebase console.
4. Only after that proof, decide whether any non-repo Sentry infrastructure still exists outside the checked-in app surface.

## Exact Next Batch
- preserve the landed Firebase monitoring owners
- run the Android native/device proof for Crashlytics and Performance
- verify Firebase console receipt for non-fatal, forced crash, and performance data
- keep unrelated lanes out of the proof pass

## Scope
This next pass should:
- preserve the landed Firebase monitoring baseline exactly as recorded
- prove the Firebase monitoring surfaces on a native Android runtime
- avoid speculative monitoring refactors before device proof
- keep unrelated local dirt out of the checkpoint

## Out Of Scope
Do not:
- remove legacy communication or other unrelated runtime systems
- invent or add Sentry cleanup that is not actually present in repo truth
- broaden into watch-party/profile/admin/docs work
- fake Firebase console proof from static code alone
- mix unrelated local dirt into any future checkpoint

## Success Criteria
The next lane is successful when:
- Firebase Crashlytics receives a logged non-fatal error from the app
- Firebase Crashlytics receives a forced native test crash from a native build/runtime that does not intercept it first
- Firebase Performance Monitoring receives the first app/custom trace plus the explicit network probe
- the repo can move forward without inventing nonexistent Sentry cleanup work
