# Big-App QA Coverage

Chi'llywood launch QA uses layered proof: local fixture/readback, local Maestro where available, BrowserStack App Automate for non-purchase smoke, and manual-assisted BrowserStack App Live for Google Play purchase boundaries. Synthetic fixtures must stay on dedicated `@chillywood.test` E2E accounts and must not count as real traction, payouts, live money, or production ranking proof.

## Status Key

- `passed`: current proof exists.
- `partial`: infrastructure exists, but not all BrowserStack or manual proof is complete.
- `blocked`: cannot complete until env/account/provider state is fixed.
- `later`: launch-safe follow-up after the current blocker set.

## Lanes

| Lane | Purpose | Accounts | Fixtures | Local proof | BrowserStack proof | Manual-assisted | Must not happen | Launch status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Monetization 1-7 | Prove Premium separation, owner/viewer monetization boundaries, and sandbox-only creator offers. | E2E owner, primary viewer, optional backups. | Premium route, tip, paid video, Watch-Party ticket, event pass, subscription, VIP. | Passed for local fixture/readback and local Maestro 1-3. | App Automate configured; non-purchase smoke blocked only by password/env state until rerun. | Required for Google Play purchase sheets. | No fake completion, live money, payouts, Premium weakening. | Partial |
| Profile/Platform visibility | Prove public/private/subscriber-only access and owner visibility save/readback. | E2E owner plus viewer roles. | Owner profile/platform visibility states. | Platform visibility save/readback passed; social graph readback now covers access. | Ready for App Automate selector/deep-link smoke. | Not required. | No real-user clout or RLS weakening. | Partial |
| Synthetic social graph | Prove follower, Circle, subscriber, VIP, blocked, and public states. | 10 dedicated `@chillywood.test` accounts. | `channel_followers`, `user_friendships`, subscriber/VIP rows, blocks. | Passed via `qa:browserstack:e2e-social-graph:readback`. | Ready for BrowserStack role-login flows. | Not required. | No fake public metrics for real users. | Passed locally, BrowserStack later |
| Deep links/navigation | Prove safe route entry and denied-state fallbacks. | Owner, viewer, blocked, signed-out. | Route IDs and existing selectors. | Planned checklist in `qa/deep-link-navigation-smoke.md`. | Required as non-purchase smoke. | Not required. | No coordinate taps, no raw errors. | Partial |
| Permissions/interruption | Prove permission deny/allow and interruption recovery. | Owner/viewer where route requires auth. | Camera/mic, notifications, app lifecycle cases. | Checklist created. | Required for smoke subset only. | Some purchase-sheet interruptions manual-assisted. | No LiveKit authority changes. | Partial |
| Network/offline/slow connection | Prove slow/offline launch, reconnect, and no endless spinners. | Owner/viewer. | BrowserStack network profiles if available. | Checklist created. | Smoke required; full matrix later. | Not required. | No production fallback hacks. | Partial |
| Device matrix | Prove representative Android device coverage. | E2E owner/viewer. | Fresh APK, app id/custom id. | Matrix documented in BrowserStack runbook. | Smoke required on minimum devices; full money proof later. | Purchase matrix manual-assisted later. | Do not run broad matrix without approval. | Partial |
| Accessibility | Prove labels, touch targets, focus order, contrast, keyboard avoidance. | Signed-out, viewer, owner. | Key route selector set. | Checklist created. | Manual/App Automate spot checks later. | Manual screen reader check recommended. | Do not redesign surfaces in QA lane. | Partial |
| Crash/ANR/performance smoke | Prove launch/login/home/player/platform/premium/money/watch-party no crash/ANR. | Viewer and owner. | Fresh APK and Crashlytics/BrowserStack logs. | Checklist created. | Required smoke on S23/Pixel class devices. | Not required. | No ignoring raw crashes. | Partial |
| Security/RLS/privacy | Prove owner-only controls, blocked denial, scoped paid access, and no secrets in app. | Owner, viewer, blocked, subscriber, VIP. | Existing RLS plus synthetic social graph. | Checklist created; existing guards pass. | BrowserStack role smoke later. | Not required. | No service-role in app code, no RLS weakening. | Partial |
| Moderation/reporting/blocking | Prove report/block flows and Algorithm V1 unsafe penalties. | Viewer, owner, blocked. | Reportable test content where backed. | Checklist created; algorithm guard exists. | Later non-purchase route smoke. | Not required. | No unsafe/reported content boosted. | Partial |
| Analytics/event sanity | Define expected event categories and E2E exclusion posture. | Any E2E account. | Analytics readback if available. | Doc-only; no new wiring. | Later log sanity if BrowserStack/device logs allow. | Not required. | Synthetic traffic must not become real traction if exclusion exists. | Later |
| OTA/stale app/upgrade | Prove fresh APK selector availability and stale upload detection. | Any E2E account. | Version/runtime readback where available. | Checklist created; prior stale APK issue documented. | Required before BrowserStack reruns. | Not required. | No migration mismatch crash. | Partial |
| Fixture reset/revoke | Prove revoke/reset restores scoped access only. | E2E owner/viewer roles. | Sandbox tester, subscriber, VIP, paid grants. | Social graph reset script exists; lifecycle checklist created. | Later. | Provider refund/revoke manual-assisted. | No payable ledger/payout after revoke. | Partial |
| BrowserStack manual-assisted purchase proof | Prove Google Play sandbox purchase boundaries without faking completion. | Licensed tester accounts only. | Fresh APK, app id/custom id, product setup. | Local fixture/readback passed. | App Automate stops at safe boundary by default; strict sandbox auto-confirm is opt-in only after visible test purchase notice, expected tester/product verification, live money off, payout false, not_payable, post-purchase backend readback, and no unrelated unlocks. | Required when Google Play sheet is ambiguous or App Live/manual interaction is needed. | Do not automate fake purchase completion, use coordinate taps, create payable/live records, or treat sandbox proof as real money. | Blocked/manual-assisted; strict safety automation partial |
| Codex repair loop | Classify BrowserStack failures so safe QA blockers can be fixed and rerun while money/security/manual-purchase blockers stop. | E2E owner/viewer only. | BrowserStack proof folder, redacted logs, session links. | Policy and guard cover the classifier. | Non-purchase failed flow can be rerun one at a time. | Required for Google Play confirmation and App Live purchase sheets. | Do not bypass guards or weaken money, RLS, LiveKit, Watch-Party, Chi'lly Chat, Premium, payouts, or live money. | Partial |
| Algorithm Foundation V1 dry-run | Prove rules-based ranking remains explainable and safety-first. | Synthetic fixture data only if used. | Dry-run fixtures, unsafe/private/reported examples. | Guard and dry-run exist. | Not a BrowserStack UI replacement. | Not required. | No production feed replacement, no paid ML. | Passed locally |
| Login/account state | Prove clean BrowserStack install can log into the right role. | Owner/viewer role env. | Ignored local env passwords. | Runner env guards exist. | Blocked until password/env state is complete on runner host. | Not required. | Do not use personal Gmail password. | Blocked |
| App upgrade/install freshness | Prove uploaded APK contains selector commits before sessions. | Any E2E account. | Release APK, BrowserStack app id/custom id. | Upload tooling exists. | Required before rerun. | Not required. | Do not rely on stale OTA for selectors. | Partial |
| Social access deep links | Prove private/subscriber/VIP/blocked direct links land in safe shells. | Circle, subscriber, VIP, blocked, public. | Social graph fixture pool. | Access matrix passed. | Later route smoke. | Not required. | No raw errors or hidden content leaks. | Partial |
| Reporting/revoke cleanup | Prove report/revoke/refund states do not leak unrelated access. | Viewer/owner/admin if available. | Report fixtures, sandbox grant rows. | Checklist created. | Later. | Provider lifecycle manual-assisted. | No immutable report tampering unless backed. | Later |

## Required Validation

Run before committing QA infrastructure changes:

- `npm run typecheck`
- `npm run guard:route-contracts`
- `npm run guard:creator-monetization-policy`
- `npm run guard:premium-sandbox-policy`
- `npm run guard:monetization-e2e-testids`
- `npm run guard:algorithm-ranking-v1`
- `npm run guard:big-app-qa-coverage`
- `git diff --check`
