# Codex BrowserStack Repair Loop Policy

This policy lets Codex repair safe BrowserStack QA blockers without weakening Chi'llwood product, money, security, LiveKit, Watch-Party, or chat behavior.

The repair loop is evidence-first:

1. Run one selected non-purchase BrowserStack flow or one safe fixture/readback check.
2. Save redacted logs and session links to `/tmp`.
3. Classify the failure.
4. Auto-fix only when the failure is in the allowed class and the prompt authorizes code changes.
5. Rerun only the relevant failed smoke flow.
6. Stop for Google Play purchase confirmation, money/security changes, or any unclear risk.

Codex must not blindly bypass guards, use coordinate taps, fake purchase completion, or mark a purchase flow passed without post-purchase app state and backend readback.

## Auto-Fix Allowed

Codex may propose and, when explicitly authorized in the current prompt, implement a narrow fix for:

- missing route/testID selector
- Maestro wait/timeout issue
- wrong deep link path
- stale APK upload detection
- BrowserStack runner bug
- fixture readback script bug
- env presence guard bug
- docs/runbook mismatch
- non-purchase smoke test assertion too strict
- safe UI selector placement such as `collapsable={false}` on stable route containers
- safe test fixture repair where rows remain `sandbox`, `not_payable`, and `no_payout`

Allowed fixes must be small, test-oriented, and must not change money entitlement truth, product access rules, RLS, LiveKit authority, Watch-Party shared player behavior, or Chi'lly Chat behavior.

## Ask/Stop Required

Codex must print `HUMAN_REQUIRED` and stop for:

- Google Play purchase confirmation
- any flow requiring a human to click or approve a purchase sheet
- BrowserStack App Live manual interaction
- creating/changing real payment products
- changing RevenueCat/Google Play purchase logic
- changing Premium entitlement logic
- changing RLS/security policy
- changing service-role handling
- changing live money or payout behavior
- LiveKit/host/publish authority
- deleting production data
- broad route/product refactor

Manual-assisted Google Play proof can continue only after a human performs the purchase confirmation and provides the resulting app/backend evidence.

## Block/Fail Closed

Codex must print `FAIL_CLOSED` and stop for:

- missing credentials
- missing E2E account passwords
- missing service-role for fixture setup
- secrets detected in repo
- payable/live money record created during sandbox proof
- payout authority true
- unrelated product unlock detected
- fake purchase completion attempted

Fail-closed cases are not product bugs to bypass. They require env repair, fixture reset, or explicit human review before rerun.

## Rerun Scope

When a safe fix is made, rerun only the smallest relevant proof:

- one failed BrowserStack smoke flow for selector/wait/deep-link fixes
- fixture readback only for fixture/readback fixes
- upload/app-reference check only for stale APK fixes

Do not rerun purchase-confirmation flows through App Automate. Purchase confirmation remains human-required.
