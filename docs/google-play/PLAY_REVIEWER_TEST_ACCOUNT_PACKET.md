# Google Play Reviewer Test Account Packet

Date: 2026-06-01
Status: field-ready copy; credentials must be entered only in Play Console

Canonical final money truth: `docs/MONETIZATION_STACK_FINAL_TRUTH.md`.

June 5, 2026 production policy operations readiness note: `docs/PRODUCTION_MONEY_POLICY_OPERATIONS_READINESS.md` and `docs/PRODUCTION_MONEY_READINESS_INDEX.md` are internal draft/readiness packets for future legal, tax, fraud/risk, support, refund/return, merch fulfillment, payout operations, and Owner/Admin approval review. They are not reviewer instructions for live commerce. Reviewers should not expect production merch checkout, payout execution, cash-out, withdrawal, transfer, payable balances, or Stripe Android digital checkout. Any future reviewer-facing production merch or payout test requires an explicit separate activation/review lane and updated Data Safety/privacy review.

June 5, 2026 creator setup flow note: `docs/CREATOR_MONETIZATION_SETUP_COMPLETION_MATRIX.md` completes `/creator-monetization-setup` for approved creator/internal-tester sandbox configuration. Do not present this as public production commerce. If a reviewer/tester is explicitly approved for sandbox monetization proof, they may see clearly labeled sandbox-only/not-payable setup and purchase-test surfaces using Google Play / RevenueCat for Android digital products and Stripe test mode for physical merch. Payout readiness remains read-only; reviewers/testers must not be instructed to request payout, cash out, withdraw, transfer, or use Stripe for Android digital goods.

June 5, 2026 viewer/Admin QA note: `docs/CREATOR_MONETIZATION_VIEWER_GATE_ADMIN_QA.md` captures the current Play-installed Android sandbox setup and tester-tool screens plus correct Admin denial for the non-admin tester. `docs/ROUTE_BACKED_MONETIZATION_VISUAL_PROOF.md` adds route-backed viewer-gate and Owner/Admin drilldown proof for internal QA. Do not instruct normal Play reviewers to access Owner/Admin drilldowns or contextual monetization gate fixtures unless the owner provides a safe route-backed fixture set and a specifically approved role/account. Public/default reviewers should not see production buy buttons, payout tools, cash-out, withdrawal, transfer, payable balances, or Stripe Android digital checkout.

June 4, 2026 Stripe merch/payout readiness note: Stripe is still not used for Android digital goods. Repo-side sandbox readiness now exists only for physical merch and Stripe Connect payout setup/status. Production merch checkout, payout activation, cash-out, withdrawal, transfer, and payable balances remain off and are not part of normal Play reviewer instructions. Do not give reviewers a Stripe checkout link for Premium, paid content, tickets, seats, tips, or event passes.

June 4, 2026 Stripe Connect payout-readiness proof note: a real Stripe test-mode Express connected account was reused, a sandbox onboarding link was created, and account status refreshed to `pending_kyc` / `onboarding_in_progress` with provider charges and payouts disabled. This is owner/operator backend proof only. Do not instruct Play reviewers to complete payout onboarding, request payout, cash out, withdraw, transfer, or use Stripe for Android digital goods. Production payouts remain blocked until a future approved live-money/tax/legal/fraud lane.

June 4, 2026 Public V1 Money-Proof RC Sweep note: `docs/PUBLIC_V1_MONEY_PROOF_RC_SWEEP.md` records the release-candidate regression sweep and Android proof path `/tmp/chillywood-public-v1-money-proof-rc-sweep-20260604/`. The Play-installed test device remained on `com.chillywood.mobile` versionCode `23` with installer `com.android.vending`. Remote money counts stayed provider_events `6`, purchase_intents `8`, access_grants `5`, ledger_events `7`, payable/paid rows `0`, active temporary proof roles `0`. No production money, payout/cash-out/withdraw/transfer, fake balance, fake sale, Stripe Android digital checkout, LiveKit authority bypass, or safety bypass was introduced.

June 4, 2026 Money Center launch-review note: `docs/MONEY_CENTER_LAUNCH_REVIEW_PACKET.md` is the concise reviewer/operator money packet. Chi'llywood uses Google Play Billing / RevenueCat for Android digital goods; sandbox proof exists for Premium, creator tip, Watch-Party ticket, Live Watch-Party access pass, Live Watch-Party seat pass, paid content access, and event pass. These are sandbox/internal proof paths only, not public production commerce. Creator Money Center and Owner/Admin Money Center show `Sandbox only` / `Not payable`, live money off, payouts not active, no cash-out/withdraw/transfer, no fake balance, no Stripe Android digital checkout, and sanitized drilldowns.

June 4, 2026 event-pass/failure-path proof note: event pass now has sandbox backing and one real Google Play / RevenueCat sandbox purchase proof from an approved proof account. Duplicate/idempotency, admin revoke, and expired-intent proof also passed with 0 payable/paid rows. This remains internal sandbox proof only. Do not tell reviewers that paid content, tickets, seats, tips, or event passes are public live products; only approved internal tester/reviewer/proof accounts should see sandbox checkout instructions.

June 3, 2026 money-access readiness note, superseded by later sandbox proof lanes: the app first gained a repo-backed shared product catalog/access grant architecture for future digital access. Later lanes completed sandbox purchase proof for Premium, creator tip, paid content, Watch-Party ticket, Live Watch-Party access/seat, and event pass. These are still not public live products. Production paid content, tickets, seats, tips, event passes, payouts, cash-out, fake balances, fake payable ledger rows, and Stripe Android digital checkout are not active.

Real sandbox sales preflight note, superseded by later product setup and purchase proof: the deployed RevenueCat webhook can mirror real Premium sandbox events into shared money-access records. At that earlier snapshot Premium was the only mapped Play/RevenueCat product; later lanes created and proved the non-Premium sandbox products. Fresh current-main Admin money screenshots are captured from EAS APK build `cc88ce26-6e94-4adb-9768-d0483c12505a` versionCode `22` at `/tmp/chillywood-real-sandbox-digital-sales-proof-20260603/`.

Sandbox product mapping note, superseded by later proof: the backend has purchase intents for non-Premium sandbox tests, and the owner/operator proof lanes completed real sandbox purchases for paid content, tickets, seats, tips, and event passes. Reviewer instructions still must not claim those are public live products unless a future review-specific lane opens an approved licensed tester path. Do not give reviewers fake checkout instructions or any Stripe/external payment link for Android digital goods.

Sandbox provider product follow-up: Google Play and RevenueCat now contain the six non-Premium sandbox products, and the backend catalog has sandbox-only mappings. Reviewer instructions still must not claim paid content, tickets, seats, tips, or event passes are available unless the submitted build exposes an owner-approved tester path and a licensed tester can complete a real sandbox purchase. The current route for proof is `/admin-money-sandbox-purchases`, which is owner/operator-only and not a public reviewer checkout.

Google Play sandbox item availability closeout: item availability was fixed for the proof device by accepting the exact internal-test opt-in link, replacing the prior EAS/internal install with a Play-installed package, and updating from Google Play to versionCode `23`. A real Creator tip sandbox purchase for `cw_creator_tip_sandbox_099` completed with Google Play's test card and RevenueCat webhook processing. This is proof of sandbox-only owner/operator monetization plumbing, not reviewer-facing commerce. Reviewers still should not be told that paid content, tickets, seats, tips, or event passes are public live products; no production money, payout, cash-out, fake balance, or Stripe Android digital checkout is active.

Access-product sandbox proof addendum: the original owner/operator internal-test path completed real sandbox purchases for Watch-Party ticket, Live Watch-Party access, Live Watch-Party seat, and paid content, producing sandbox-only/not-payable backend rows and resolver proof. Current repeat testing can use approved internal tester sandbox mode. This still is not a public commerce claim. Do not instruct Play reviewers to buy paid content, tickets, seats, tips, or event passes unless they are using the approved reviewer/test account sandbox flow documented here.

Do not commit real reviewer passwords, recovery codes, OTP seeds, service accounts, owner/admin credentials, Play Console credentials, or provider secrets. Put the live test credential values only in Google Play Console App access.

June 4, 2026 internal tester sandbox purchase mode note: `docs/INTERNAL_TESTER_SANDBOX_PURCHASE_MODE.md` adds a bounded tester-only sandbox mode with Owner/Admin controls. Public/default users still see Premium and digital purchases unavailable. Approved testers may see clearly labeled Google Play / RevenueCat sandbox purchase surfaces with `Sandbox test`, `Not production`, and `Not payable` copy. Owner/Admin Money Center shows `Internal Sandbox Testing` and tester-tool routing. Stripe physical merch sandbox checkout is physical goods only. Payout readiness is read-only; reviewers/testers cannot request, trigger, simulate, cash out, withdraw, transfer, or activate payouts. Do not describe this as production commerce, public live Premium, public paid content, public tickets/seats/tips/event passes, payouts, cash-out, or Stripe Android digital checkout.

June 1 external acceptance update: `docs/google-play/EXTERNAL_ACCEPTANCE_TRACKER.md` records App access as packet-ready but not externally completed in this repo lane. No reviewer username/password was entered, saved, screenshotted, or committed here. Owner/operator must enter safe non-admin credentials only in Play Console App access.

## Play Console App Access Fields

| Field | Value to enter |
| --- | --- |
| App name | Chi'llywood |
| Package | `com.chillywood.mobile` |
| Requires sign-in? | Yes for account features. Public browsing and legal pages are available without sign-in. |
| Test username/email | `[OWNER ENTERS SAFE NON-ADMIN TEST EMAIL IN PLAY CONSOLE ONLY]` |
| Test password | `[OWNER ENTERS PASSWORD IN PLAY CONSOLE ONLY. DO NOT COMMIT.]` |
| 2FA / OTP | Use a reviewer account that does not require 2FA, one-time codes, geo-dependent passwords, or recovery prompts. |
| Account role | Normal non-admin user. Do not provide Owner/Admin unless Google specifically requests admin-only legal/moderation proof. |

## Field-Ready Instructions To Paste

```text
Chi'llywood can be opened without signing in for public browsing and legal/support surfaces. Account features require a test account.

Test account:
- Email: [enter safe non-admin reviewer email here in Play Console only]
- Password: [enter password here in Play Console only]

Please do not use an owner/admin account for standard review. Admin, payout, live-money, and provider tools are restricted and are not part of normal user review.

Suggested review path:
1. Launch the app.
2. Open Home, Explore, Live, and Library from bottom navigation.
3. Open Settings from the account/profile area.
4. Open Settings > Legal and Support to view Privacy Policy, Terms of Use, Account Deletion and Data Deletion Policy, Copyright/DMCA, Community Guidelines, Creator Rules, Support, and Moderation Policy.
5. Open Profile and public Platform surfaces where visible.
6. Open a Player item from public or test content.
7. Use report actions where visible. Do not submit harmful or false reports unless the owner provides a clearly harmless disposable test target.
8. Premium-only features are gated unless a licensed Play tester purchase path backed by RevenueCat/Google entitlement proof is provided. Non-Premium/public accounts should see Premium required or setup-needed copy; approved internal testers may see clearly labeled sandbox purchase copy.
9. Chi'lly Chat, Watch-Party, Live, comments, likes, follows, and uploads depend on account state, permissions, and current test fixtures.
10. Money features, tickets/seats, tips, paid creator content, and payouts are not active in the submitted test scope unless the owner separately provides provider-backed proof.

Legal/support links:
- Privacy Policy: https://chillywoodstream.com/privacy
- Terms: https://chillywoodstream.com/terms
- Account deletion: https://chillywoodstream.com/account-deletion
- Copyright/DMCA: https://chillywoodstream.com/copyright-report
- Support contact: support@chillywoodstream.com
```

## Signed-Out Review

Reviewers can test:

- app launch and public navigation;
- public legal pages;
- public support/account deletion URL;
- public Profile/Platform surfaces where allowed;
- sign-in handoffs for gated actions.

Do not claim signed-out users can use account-owned features such as posting, messaging, following, blocking, deleting, or account deletion fulfillment without sign-in.

## Signed-In Review

Reviewers can test with the non-admin account:

- Profile and account settings;
- public Platform/Player browsing;
- legal/support/Delete Account path with 30-day restore window;
- report flow entry points where visible;
- comments/likes/follows/chat only where policy and fixtures allow;
- notification permission prompts if they appear.

The test account should not expose private personal photos, real user reports, real user messages, owner/admin actions, provider secrets, payout tools, or live money controls.

## Setup-Only / Disabled Features

June 1 Premium reviewer readiness update: current v13 Play-installed proof is ready-but-closed. `R5CR120QCBF` is installed from Google Play internal testing, `validate:runtime` reports the Android RevenueCat public SDK key configured, `revenuecat-webhook` is active, and EAS production update readback shows the newest runtime `1.0.0` update is the closed-shell group `5668cdaa-cd5b-4553-bd91-7b786323fd22`. `/subscribe` shows purchase status `Temporarily unavailable`, and Admin Money Center shows `Live money off`. No fresh reviewer purchase was run in this readiness pass because no safe reviewer Chi'llywood app credentials were available and read-only Play API tester/product readback returned `403`. Reviewer Premium testing requires the owner to enter credentials only in Play Console App access and intentionally open the Premium purchase shell for the submitted review/test window. Do not commit passwords.

June 1 fresh active sandbox event closeout: the licensed tester path now has end-to-end sandbox proof. Play-installed internal-test v12 loaded the Google Play sandbox Premium product, a fresh purchase completed, Restore Purchases completed active, a real RevenueCat webhook event reached the Supabase webhook with `webhookProcessed:true` and `premiumGranted:true`, sanitized backend readback found one active Premium `user_entitlements` row with `source='revenuecat'`, and Platform Studio unlocked during the backend-active window. The bounded purchase shell was closed again with EAS update group `5668cdaa-cd5b-4553-bd91-7b786323fd22`; current source keeps `PREMIUM_PURCHASE_SHELL_ON_HOLD = true` and `premiumPurchaseEnabled: false`. Premium reviewer testing still requires an approved Google Play licensed tester account and credentials entered only in Play Console App access. Production Premium is not claimed live.

June 1 non-Premium denial closeout: a disposable non-Premium proof account was verified with zero Premium rows, zero active Premium rows, and zero active platform roles. Its normal-user attempt to insert a Premium entitlement row was denied with `42501`. On the Play-installed Android app after the latest OTA restart, Platform Studio / Brand Studio / Clip Studio entry showed clean `Premium required` copy. Do not provide that disposable proof password in this repo; use Play Console App access for any reviewer credential.

June 1 owner-session closeout: after the proof account run, `R5CR120QCBF` was restored/confirmed in the normal owner/admin operating state. The device is Play-installed from Google Play internal testing at versionCode `13`, opens Home, and opens Admin Command Center in the current session. `/subscribe` shows `Premium is not active` and purchase status `Temporarily unavailable`, so the purchase shell is closed again. No reviewer password, owner password, provider secret, or service credential is committed.

June 1 backend entitlement sync follow-up: Play-installed sandbox purchase and restore have been proved, and the backend `revenuecat-webhook` now has a verified-event sync path for Premium. The server-side RevenueCat webhook secret and dashboard webhook integration are configured, and dashboard `TEST` delivery is received with no Premium grant. A fresh real sandbox Premium event and later renewal wrote/refreshed backend `user_entitlements`, and Platform Studio unlocked during the backend-active window. Platform Studio should still show `Premium required` when backend entitlement is missing, expired, revoked, inactive, or owned by a different user.

June 1, 2026 reviewer posture: current repo/device proof has the Android RevenueCat production public SDK key configured and `validate:runtime` passing. The later Play-installed internal-test proof completed a Google Play / RevenueCat sandbox purchase, restore, real webhook delivery, backend entitlement row, and Platform Studio unlock for the licensed tester. Reviewers should see Premium-required or setup-needed copy for Premium creator tools unless the owner provides a licensed tester path and intentionally opens the Premium purchase shell for the submitted build. Do not include a reviewer password in this repo.

June 3/4, 2026 non-Premium sandbox product mapping posture: paid content, Watch-Party tickets, Live Watch-Party access/seat passes, tips, and event passes now have sandbox Google Play/RevenueCat product IDs and backend catalog mappings, but they are not public live commerce. The original launcher was the owner/operator-only `/admin-money-sandbox-purchases` proof route; the current internal tester sandbox mode can expose that clearly labeled sandbox launcher only to approved internal testers/reviewers/proof accounts. Android proof on `R5CR120QCBF` showed non-operator denial and temporary operator-only access during the original route proof. The first Creator tip attempt returned item-not-found; the follow-up Play-installed versionCode `23` proof completed a real Creator tip sandbox purchase, created a sandbox provider event and sandbox-only/not-payable ledger row, created no access grant, and left no active proof role after revoke. Do not tell reviewers these products are public live products.

June 1 Play-installed v12 follow-up: `R5CR120QCBF` accepted the internal-test invite and had `com.chillywood.mobile` installed from Google Play internal testing with `installer=com.android.vending`, `versionCode=12`, and `versionName=1.0.0`. RevenueCat dashboard proof confirmed the Premium mapping: product `premium_subscription:monthly`, subscription id `premium_subscription`, base plan `monthly`, entitlement `premium`, and offering `premium`. The earlier signed-out/password blocker from that lane was superseded by the later signed-in purchase, restore, webhook, backend entitlement, Platform Studio unlock, and non-Premium denial proofs. Current reviewer purchase testing still requires owner-approved App access credentials and a bounded purchase-shell build/update.

June 1 signed-in Premium sandbox proof: owner-approved bounded EAS update group `b678522a-8734-49a1-a582-f2bc6743c756` opened only the Premium shell for the Play-installed internal-test v12 build. The licensed tester flow loaded the Google Play sandbox `Chi'llywood Premium` subscription, purchase completed, `/subscribe` showed `Premium is active`, and restore completed with `Purchases restored. Premium is active.` The shell was closed again with EAS update group `82f7e7fd-d213-4f50-9c5d-6e6a328884db`. Production Premium is not claimed live, and reviewers should not be told that creator monetization or payouts are active. The later fresh event proof supersedes the old backend blocker: real RevenueCat webhook delivery wrote/refreshed a backend Premium row and Platform Studio unlocked during the backend-active window.

| Feature | Reviewer note |
| --- | --- |
| Live money / payouts | Off. No cash-out, transfers, tips, paid creator content, ad revenue, sponsor checkout, or creator payout execution is live. |
| Premium / purchases | Play-installed sandbox purchase/restore, real RevenueCat webhook delivery, backend `user_entitlements` write, and Platform Studio unlock are proved for the licensed tester path. Reviewers should test Premium only with an approved Google Play licensed tester account and a build where the owner intentionally opens the Premium purchase shell. Production Premium is not live unless provider proof matches the uploaded build. |
| Platform Studio / creator uploads | Premium required for normal creator accounts. Owner/operator accounts may see setup-only owner tools, but that is not Premium entitlement and does not activate paid access. |
| Watch-Party tickets/seats | Off/setup-only for Watch-Party Live and Live Watch-Party / Live Stage unless a real Google Play/RevenueCat entitlement path is separately provided. Paid seats do not bypass Premium gates or speaker approval, and no buy button should appear without provider backing. |
| Tips | Off for public/reviewer scope. Sandbox provider mapping exists and one owner/operator Creator tip sandbox purchase was proved through Google Play/RevenueCat as `Sandbox only` / `Not payable`; no public tip checkout, tip totals, tip balances, badges, perks, rankings, payout, or digital unlocks are active. |
| Paid creator content | Off. No paid digital content checkout or fake paid-access records are active. Android digital access must use Google Play/RevenueCat or another approved Play-compliant path, not Stripe checkout. |
| Money Center | Sandbox proof/readiness only. It may show `Sandbox only` / `Not payable` provider, intent, grant, and ledger proof, but no live money, fake earnings, fake balances, fake checkout, fake payout, cash-out, withdrawal, or transfer action is active. |
| Stripe / payouts | Stripe Connect is payout readiness/setup only. Stripe checkout must not be used for Android in-app digital goods, Premium, paid creator content, Watch-Party tickets/seats, or digital access unlocks. |
| Ads | Not active in current repo evidence. Owner must confirm the submitted build has no ad SDK/ad delivery/paid placements before declaring "No ads." |
| Admin | Owner/admin-only. Normal reviewer account should not see Admin tools. |
| iOS | Deferred. Android Public V1 only. |
| AI assistant | Not a Public V1 shipped feature unless a future lane adds and proves it. |

## Owner Pre-Submission Checks

- Confirm the reviewer account signs in successfully on the uploaded AAB.
- Confirm password does not expire and no OTP/2FA blocks review.
- Confirm account is not owner/admin/staff.
- Confirm account can reach representative signed-in flows.
- If Premium sandbox testing is requested, confirm the account is an approved Google Play license tester and the uploaded build has the matching RevenueCat/Google sandbox configuration.
- Confirm the uploaded build has the Android RevenueCat public SDK key in approved public config, a freshly generated release bundle, a licensed tester/product path, and the Premium purchase shell intentionally enabled before asking reviewers to test Premium purchase/restore.
- Confirm no private user data appears in the reviewer account.
- Save Play Console App access proof outside the repo.
