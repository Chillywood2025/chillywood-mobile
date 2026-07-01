# Tips V1 End-To-End Proof

Last updated: June 11, 2026

## Real Status

Tips V1 is repo-side implemented, Supabase-deployed, and sandbox-proven end to end for Stripe test-mode creator contributions. It is not a live-money launch.

Tips V1 does not unlock digital content, badges, VIP, room access, paid video access, creator subscription perks, event access, Watch-Party seats, public ranking rewards, Premium, LiveKit authority, or any other digital benefit.

## Deployment And Smoke Proof

June 11, 2026 remote deployment status:

- Migration `20260611151221_tips_v1_stripe_checkout.sql` applied to project `bmkkhihfbmsnnmcqkoly` with `supabase db push --yes`.
- Edge Function `create-creator-tip-checkout` deployed. It was redeployed after a checkout block-query fix.
- Edge Function `stripe-tip-webhook` deployed with `--no-verify-jwt` and appears ACTIVE version `1`.
- Existing Stripe Connect functions were redeployed so new test accounts request card payments plus transfers:
  - `stripe-connect-account`
  - `stripe-connect-onboarding-link`
  - `stripe-connect-account-sync`
- Supabase secret names include `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, and public Supabase runtime keys by digest only. No secret values were printed or committed.
- Stripe CLI readback initially showed no Tips webhook endpoint.
- A Stripe test-mode webhook endpoint was created for `https://bmkkhihfbmsnnmcqkoly.supabase.co/functions/v1/stripe-tip-webhook`, endpoint id `we_1ThAyJLDGu5xJkIwmXErmdnq`, enabled events `checkout.session.completed`, `checkout.session.expired`, `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`, and `charge.dispute.created`.
- `STRIPE_TIP_WEBHOOK_SECRET` is now configured in Supabase secrets by value without printing the secret. A temporary local copy exists only at `/tmp/chillywood-tips-v1-stripe-webhook-secret.env`.

June 11, 2026 cheap local/server proof:

- Unauthenticated `create-creator-tip-checkout` call returned `401` before checkout creation.
- Unsigned `stripe-tip-webhook` request returned `400 invalid_signature`, proving signature enforcement.
- Local ignored `BRAND_REVIEW_PROOF_EMAIL` account signed in; local ignored Maestro credentials were stale and failed sign-in.
- The signed-in proof account enabled Tips through `upsert_my_creator_tip_settings`; suggested amounts `[100,300,500,1000]`, default `300`, min `100`, max `50000`, and `usd` persisted after reload.
- Provider readiness for that proof account remains `setup_required`, with charges and payouts disabled. Public tip status correctly returns `canTip=false`, `reason=setup_incomplete`, `testMode=true`, and `liveMoneyEnabled=false`.
- Self-tip checkout against the signed-in proof account returned `403 self_tip_blocked`.
- Direct authenticated insert into `creator_tip_transactions` as `paid` was blocked with table permission denial.
- Direct authenticated provider-status update on `creator_tip_settings` was blocked with table permission denial.
- Deterministic proof personas were created/repaired with local-only ignored credentials in `.env.tips-proof.local`: `tips_creator_test`, `tips_fan_test`, and `tips_blocked_test`. All three can sign in; no passwords were committed.
- `tips_creator_test` created a real Stripe test-mode Express connected account through the deployed `stripe-connect-account` function. Account id is recorded only as safe Stripe/DB proof; payout execution remains inactive.
- `stripe-connect-onboarding-link` created a short-lived hosted onboarding link, stored at `/tmp/chillywood-tips-v1-connect-onboarding-url.txt`.
- Stripe rejected API-side onboarding completion for the Express account with `oauth_not_supported`; hosted Stripe onboarding is required.
- Manual hosted onboarding was opened, and a fresh link was also opened in Chrome with Playwright installed in `/tmp/chillywood-playwright-proof` instead of adding repo dependencies. Stripe's test onboarding accepted the built-in test phone path, then presented an hCaptcha-style drag puzzle. Per browser safety rules, the puzzle is left as a manual/explicit-approval blocker rather than bypassed. Current screenshot paths: `/tmp/chillywood-tips-v1-onboarding-initial.png`, `/tmp/chillywood-tips-v1-onboarding-step1-filled.png`, and `/tmp/chillywood-tips-v1-onboarding-submit2.png`.
- After the manual CAPTCHA/onboarding handoff, Stripe returned to `https://chillywoodstream.com/stripe-connect/return?proof=tips-v1`. That route currently lands on the public legal/support page instead of a polished Stripe return/status screen. This is a UX follow-up and was not changed during proof.
- Post-return `stripe-connect-account-sync` still reported the first creator provider as not ready: `charges_enabled=false`, `payouts_enabled=false`, `details_submitted=true`, stored settings `status=blocked`, and `provider_onboarding_status=payouts_disabled`. Public tip status returned `canTip=false`, `status=blocked`, `reason=blocked`, `testMode=true`, and `liveMoneyEnabled=false`.
- Safe Stripe CLI account readback for connected account `acct_1ThAwKLTMNvRM9eS` shows the exact provider blocker: `disabled_reason=requirements.past_due`, `currently_due=["individual.verification.document"]`, `past_due=["individual.verification.document"]`, `card_payments=inactive`, and `transfers=active`. The account has submitted details but still needs Stripe identity-document verification before card charges are enabled.
- Repair attempt on the first account used Stripe's documented test token `file_identity_document_success` plus successful test ID value `000000000`; hosted requirement collection kept the document requirement past due, so the first account stayed blocked.
- A fresh Stripe test connected account was created for `tips_creator_test` using Stripe test-only verification values: successful test DOB, address token, ID number, identity-document token, and test bank token. No real personal identity document was uploaded. After Stripe's short pending-verification window, safe Stripe readback showed `charges_enabled=true`, `payouts_enabled=true`, `details_submitted=true`, no disabled reason, no currently due / eventually due / past due / pending verification requirements, and `card_payments=active`, `transfers=active`.
- The backend-owned payout account reference for `tips_creator_test` was updated to the fresh verified Stripe test account, then the normal deployed `stripe-connect-account-sync` path synced it. Money Center settings now show `status=active`, `provider_onboarding_status=ready_for_payouts`, `provider_charges_enabled=true`, `provider_payouts_enabled=true`, and public tip status returns `canTip=true`, `reason=ready`, `status=active`, `testMode=true`, and `liveMoneyEnabled=false`.
- `tips_creator_test` enabled Tips and saved suggested amounts. Public status correctly returns `canTip=true` only after Stripe test provider readiness passes.
- `tips_fan_test` attempting to tip the unready creator returns `403 provider_not_ready` with no transaction row created.
- A proof audience block from creator to `tips_blocked_test` was seeded. `tips_blocked_test` attempting checkout returns `403 audience_blocked` before provider checkout.
- A rapid duplicate attempt while the creator is unready returns `403 provider_not_ready` for each request and creates no paid rows.
- Checkout block lookup bug fixed and redeployed: `create-creator-tip-checkout` now selects `channel_user_id` from `channel_audience_blocks` instead of a nonexistent `id` column.
- Money Center's deployed transaction read path `list_my_creator_tip_transactions(p_limit)` returns zero rows and zero paid rows for `tips_creator_test` after failed/unready/blocked attempts.
- Direct authenticated insert into `creator_tip_transactions` as `paid` with the actual Tips V1 columns is denied with table permission denial.
- Successful fan proof: `tips_fan_test` created a $1.00 server-side Stripe Checkout through `create-creator-tip-checkout`. Checkout response was test mode with `checkoutCreated=true`, `pureContributionOnly=true`, and `noAccessGranted=true`. Stripe Checkout was completed with the test card. Stripe returned to `https://chillywoodstream.com/tip-status?proof=tips-v1-success&tip_id=48c9ffc0-804f-4f63-915f-f1476ec45f78`.
- Signed webhook proof: `stripe-tip-webhook` marked tip `48c9ffc0-804f-4f63-915f-f1476ec45f78` as `paid` with `paymentStatus=succeeded`, `paidAt=2026-06-11T17:23:16.143+00:00`, `amountCents=100`, `pureContributionOnly=true`, and `accessGranted=false`.
- Money Center transaction proof: creator transaction readback shows the verified paid $1.00 test tip with `status=paid`, `payment_status=succeeded`, `payout_status=not_payable`, and no paid payout/withdrawal/cash-out claim.
- Failed-payment proof: a second $3.00 checkout was submitted with Stripe's declined test card. Stripe displayed decline copy, webhook/readback marked tip `a7df23db-5fd0-4dff-997b-52f77b6122cc` as `failed`, `paymentStatus=failed`, `failedAt=2026-06-11T17:25:28.457+00:00`, `paidAt=null`, `payout_status=not_payable`, and creator earnings were not credited.
- No-unlock proof: database readback after the successful paid tip showed zero new `access_grants`, zero new `content_access_grants`, and zero updated `user_entitlements` for the fan. Tip status also reports `accessGranted=false` and `pureContributionOnly=true`.
- Ready-provider safety recheck: creator self-tip still returns `403 self_tip_blocked`, blocked-user checkout still returns `403 audience_blocked`, direct client `paid` insert is denied with table permission denial, and direct client provider-status update is denied with table permission denial.

This proves the deployed test-mode server/RLS/payment/webhook path for Tips V1. It does not activate live money.

## Validation

June 11, 2026 local validation after sandbox proof:

- `npm run typecheck`: passed, including Android launcher icon, Watch-Party LiveKit camera, Live Stage contract, approved seats, and old-room handling guards.
- `npm run validate:runtime`: passed.
- `npm run guard:money-center-policy`: passed.
- `npm run guard:payment-rail-policy`: passed.
- `npm run guard:stripe-connect-policy`: passed.
- `npm run guard:provider-readiness-policy`: passed.
- `git diff --check`: passed.
- `git diff --cached --check`: passed.
- Targeted secret scan of changed app/function/docs paths found no actual committed secret values. The only match was the intentional `sk_live_` policy-test string in `scripts/guard-money-center-policy.mjs`.

## Implemented Pieces

- Creator setup: Platform Studio > Money Center > Ways to Earn > Tips.
- Payout setup: existing Stripe Connect test-mode account, onboarding link, and account sync functions.
- Data model: migration `20260611151221_tips_v1_stripe_checkout.sql`.
- Fan CTA: creator channel header only.
- Fan sheet: amount presets, custom amount, optional private note, and no-perks policy copy.
- Checkout: `create-creator-tip-checkout`, server-side only.
- Verification: `stripe-tip-webhook`, signed Stripe webhook only.
- Transactions: Money Center Transactions reads `creator_tip_transactions`.
- Audit: `creator_tip_events`, `monetization_webhook_events`, and `platform_admin_audit_logs`.

## Provider Mode

Stripe is test-mode only for Tips V1. `tips_enabled` is allowed as `sandbox_only`; `live_money_enabled` remains off. Live money requires a later approval lane with provider, legal, tax, fraud, support, Data Safety, and owner approval.

## Internal Tester Proof Checklist

1. Migration and Edge Function deployment: passed on June 11, 2026.
2. Creator opens Money Center > Ways to Earn > Tips: still needs device/manual proof.
3. Creator connects Stripe test-mode payouts and refreshes provider status: passed with fresh verified Stripe test connected account. The original hosted-onboarding account remains documented as blocked on `individual.verification.document`.
4. Creator enables Tips and reloads to confirm settings persist: passed by RPC/server proof; Money Center device UI proof remains a later polish/manual item.
5. Fan opens creator channel, sees `Tip`, opens the tip sheet, and completes Stripe test checkout: passed by server + Stripe Checkout proof. Native app visual sheet proof remains a later device/manual proof item.
6. Signed webhook marks the tip paid: passed.
7. Creator Money Center Transactions shows the verified test tip: passed by deployed Money Center transaction read path.
8. Failed/canceled checkout does not credit the creator: failed-card proof passed. Explicit user-canceled Checkout proof remains optional follow-up because failed payment already proves no credit on provider failure.
9. Creator cannot tip self: passed by Edge Function proof.
10. Blocked users cannot tip each other: passed by Edge Function proof using `tips_blocked_test`.
11. No access grant, Premium entitlement, badge, VIP, room access, paid video access, event access, Watch-Party seat, LiveKit authority, payout, cash-out, withdrawal, or transfer is created: passed by transaction status plus database readback.

BrowserStack is intentionally deferred until final full regression after all creator monetization flows are built. Tips V1 proof used cheap local/server/browser tester proof first.

## Remaining Before Live Money

- Stripe live-mode approval and live webhook secret deployment.
- Legal/tax/fraud/support/Data Safety review.
- Refund/dispute operations proof.
- Admin review/refund workflow decision.
- Payout ledger and payout-release approval.
- Owner live-money approval and rollback plan.
- Play policy review for pure contribution positioning.

## Next Monetization Recommendation

After Tips V1 internal proof, the next safest creator monetization candidate is paid videos because the app already has creator price rows, access resolver logic, and locked player state. Do not build paid Watch-Party seats next until room Seat Pass creation, waiting-room gate, Party Room recheck, refunds, and admin review are designed together.
