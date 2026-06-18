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

## Purchase Automation Modes

BrowserStack purchase automation has three explicit modes:

1. Default mode refuses Tip, Paid Video, Watch-Party Ticket, Event Pass, Platform Subscription, and VIP purchase flows through the `purchase_flow_requested` guard.
2. Manual-assisted mode uses `--manual-assisted-purchase`, may navigate to the purchase checkpoint, and stops with `HUMAN_REQUIRED_GOOGLE_PLAY_CONFIRMATION`.
3. Strict sandbox auto-confirm mode uses `--auto-confirm-sandbox-purchase`, is never enabled by default, and may confirm only after the runner proves the BrowserStack device is on Android, the app package is `com.chillywood.mobile`, the flow uses no coordinate taps, backend fixtures are sandbox/not_payable/no_payout, live money and payout authority are off, production purchase intents are zero, payable ledger events are zero, and the visible Google Play sheet clearly shows test/sandbox wording plus the expected tester account and product when those fields are exposed.

If the Google Play sheet does not expose a clear test purchase notice such as `Test card`, `Test instrument`, `Test purchase`, `This is a test`, or `Google Play test`, the runner must stop with `HUMAN_REQUIRED_GOOGLE_PLAY_CONFIRMATION` or fail closed. If the account or product is visible and wrong or cannot be verified, it must stop with `FAIL_CLOSED_UNKNOWN_PURCHASE_ACCOUNT`, `FAIL_CLOSED_UNSAFE_PURCHASE_SHEET`, or `FAIL_CLOSED_REAL_PAYMENT_RISK`.

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
- any ambiguous Google Play purchase sheet where test/sandbox wording, expected tester, or expected product cannot be verified
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
- purchase flow attempted without `--manual-assisted-purchase` or `--auto-confirm-sandbox-purchase`
- coordinate purchase-sheet tapping attempted
- Google Play sheet appears to be a real payment method without a visible test notice

Fail-closed cases are not product bugs to bypass. They require env repair, fixture reset, or explicit human review before rerun.

## Rerun Scope

When a safe fix is made, rerun only the smallest relevant proof:

- one failed BrowserStack smoke flow for selector/wait/deep-link fixes
- fixture readback only for fixture/readback fixes
- upload/app-reference check only for stale APK fixes

Do not rerun purchase-confirmation flows through App Automate unless strict sandbox auto-confirm mode is explicitly requested and every safety preflight and Google Play sheet verification passes. Purchase confirmation remains human-required when any required check is missing or ambiguous.
