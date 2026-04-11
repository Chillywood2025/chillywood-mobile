# NEXT TASK

## Exact Next Task
Carry forward the still-valid proved baseline exactly as recorded, including the locked Party / Live / Profile / Chi'lly Chat semantics, the preserved Rachi official-account foundation, the closed fake-comment cleanup, the re-proved Live Waiting Room / Live Room / Live Stage path, the now-closed shared analytics sink fix in `app/_layout.tsx`, the now-re-proved auth/session path on the current owners, the now-closed Premium/store repo-proof lane, the tester/store-facing monetization hardening on `components/monetization/access-sheet.tsx`, `app/title/[id].tsx`, `app/player/[id].tsx`, `app/watch-party/index.tsx`, `app/watch-party/[partyId].tsx`, and `app/settings.tsx`, the Chi'lly Chat thread-call stale-session fix on `app/chat/[threadId].tsx`, the Chi'llywood-native internal invite path on `_lib/chat.ts`, `components/chat/internal-invite-sheet.tsx`, `app/watch-party/index.tsx`, `app/watch-party/[partyId].tsx`, and `app/watch-party/live-stage/[partyId].tsx`, and the two-step `_lib/userData.ts` hardening that now both syncs signed-in member profiles into `public.user_profiles` and seeds first-run fallback identity from auth email / metadata instead of an unpredictable guest-only label. Do not reopen the resolved room-flow, analytics, auth/session, monetization, Party/Live, or broader chat architecture owners unless a later regression proves a direct break. The next exact operational step is still the two-real-phone Expo dev-client proof pass for the current Chi'lly Chat social path: verify internal invite search can find the other signed-in user, verify the invite lands in the correct direct thread, verify a fresh video call can start and join from `/chat/[threadId]`, then verify end/restart, leave/rejoin, and kill/reopen stale-state cleanup. After that runtime proof closes, return to the broader testing/store-readiness sequence already recorded.

## Current Plan
1. Preserve the carried-forward proved baseline exactly as recorded.
2. Preserve locked Chi'lly Chat communication doctrine and locked Rachi official-account doctrine exactly as recorded.
3. Keep the resolved direct-thread stale-session fix closed and do not reopen `app/chat/[threadId].tsx` unless a later regression proves a direct calling-owner issue.
4. Keep the resolved Chi'llywood-native internal invite path closed and do not reopen `_lib/chat.ts`, `components/chat/internal-invite-sheet.tsx`, `app/watch-party/index.tsx`, `app/watch-party/[partyId].tsx`, or `app/watch-party/live-stage/[partyId].tsx` unless a later regression proves a direct sharing-owner issue.
5. Keep the new `_lib/userData.ts` profile hardening closed and do not reopen it unless a later regression proves a direct `user_profiles` searchability or fallback-identity issue.
6. Narrow the next proof lane to two-real-phone Expo dev-client verification of internal invite plus thread video-call behavior.
7. Return to the broader testing/store-readiness closure sequence only after that focused social runtime proof completes.

## Exact Next Batch
- preserve the now-re-proved waiting-room and live-stage handoff on the current owners without reopening those routes
- preserve the now-closed analytics/error-monitoring bridge on the current owner without reopening that shell file
- preserve the now-re-proved login-first, valid sign-in, settings, and logout behavior on the current owners without reopening auth/session files
- preserve the tester/store-facing monetization hardening without reopening billing-language work
- preserve the Chi'lly Chat direct-thread stale-call reconciliation on the current thread owner without reopening calling architecture
- preserve the Chi'llywood-native internal invite path on the current chat and room-share owners without reopening those files
- preserve the new `_lib/userData.ts` profile-sync plus auth-derived fallback-identity hardening without reopening unrelated profile architecture
- run the two-real-phone Expo dev-client proof for invite search, direct-thread invite delivery, fresh start/join, end/restart, leave/rejoin, and kill/reopen stale-state cleanup
- record the result honestly, then return to the broader testing/store-readiness queue

## Scope
This next pass should:
- stay focused on the two-real-phone Expo dev-client proof for the current Chi'lly Chat invite and thread-call path
- preserve the carried-forward proved Chapters 1 through 4 baseline exactly as recorded
- preserve the canonical Chi'lly Chat messenger doctrine exactly as recorded
- preserve the canonical Rachi official seeded-account doctrine exactly as recorded
- preserve the internal invite/search path, direct-thread call path, and new social-identity hardening exactly as they now work
- keep unrelated local dirt out of any future checkpoint

## Out Of Scope
Do not:
- reopen monetization/store logic or broader room chapters as coding lanes unless a later regression exposes a new direct repo bug
- reopen `app/watch-party/index.tsx` or `app/watch-party/live-stage/[partyId].tsx` for resolved handoff/debugging work
- reopen `app/_layout.tsx` or broader analytics/error-monitoring work now that the shared sink blocker is closed
- reopen `app/(auth)/login.tsx`, `_lib/session.tsx`, `app/settings.tsx`, or broader auth/session work now that the proof lane is closed
- reopen deferred Premium/store surface copy unless a tester/store-readiness regression proves those surfaces are misleading again
- reopen `app/chat/[threadId].tsx`, `_lib/chat.ts`, `components/chat/internal-invite-sheet.tsx`, or `_lib/userData.ts` unless a later regression proves a direct thread-call, invite-handoff, or searchability-owner bug
- rewrite Chi'lly Chat doctrine beyond preserving current locked truth
- rewrite Rachi official-account doctrine beyond preserving current locked truth
- refactor app code, Maestro flows, migrations, packages, or runtime config as part of this social proof lane
- mix unrelated local dirt into any future checkpoint

## Success Criteria
The next lane is successful when:
- two real phones running the Expo dev client can find each other through the internal invite sheet
- the invite lands in the correct direct thread on `/chat/[threadId]`
- a fresh thread video call can start on one device and join on the other
- end/restart, leave/rejoin, and kill/reopen stale-state cleanup all behave honestly
- the active Party / Live / Profile / Chi'lly Chat / Rachi baseline remains intact
- locked Chi'lly Chat and Rachi truth remain carried forward unchanged
- the repo is ready to return to the broader testing/store-readiness queue with this social proof lane honestly closed
