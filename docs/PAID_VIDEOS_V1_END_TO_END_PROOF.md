# Paid Videos V1 End-To-End Proof

Last updated: June 11, 2026

## Real Status

Paid Videos V1 is repo-side implemented, the Supabase migration is remote-applied, and the first Google Play / RevenueCat sandbox purchase is proven end to end on a Play-installed internal tester runtime. It is not live money.

Paid Videos are digital content access. They use the existing RevenueCat / Google Play sandbox digital product rail, not Stripe Tips. Tips remain pure contribution only and separate from Paid Videos.

## Provider Path

- Provider: RevenueCat / Google Play Billing sandbox.
- Sandbox product key: `paid_content_access_sandbox_099`.
- Sandbox provider product id: `cw_paid_content_access_sandbox_099`.
- Server verification: existing `revenuecat-webhook` dynamic money-access path.
- Purchase binding: `create_money_purchase_intent('paid_content_access_sandbox_099', 'paid_content', video_id, metadata)`.
- Access grant: verified RevenueCat/Google Play webhook creates a shared `access_grants` row; migration `20260611182509_paid_videos_v1_sandbox_bridge.sql` mirrors valid paid-content grants into `content_access_grants` for the existing player resolver.
- Ledger: `money_access_ledger_events` records sandbox/not-payable Paid Video rows.

## Implemented Pieces

- Creator setup: Platform Studio creator video edit/upload form supports Free vs Paid Unlock plus price.
- Offer storage: existing `creator_content_prices` now supports sandbox Paid Video offer status and provider product metadata.
- Fan lock: creator-video Player with paid inaccessible content hides the playback URL and shows `Unlock Video`.
- Fan purchase helper: `_lib/creatorPaidVideos.ts` creates a source-bound purchase intent, starts RevenueCat non-subscription product purchase, then waits for server-verified access.
- Money Center Offers: shows configured Paid Video offers with price, status, sales count, and sandbox gross.
- Money Center Transactions: shows verified Paid Video unlock rows separately from Tips.
- Premium separation: locked Paid Video copy says the purchase unlocks that creator video only and does not include Premium, subscriptions, VIP, rooms, Watch-Party seats, or other creator content.

## Deployment Status

- Migration `20260611182509_paid_videos_v1_sandbox_bridge.sql` was applied remotely to Supabase project `bmkkhihfbmsnnmcqkoly` on June 11, 2026.
- No new Edge Function was added.
- Existing `revenuecat-webhook` remains the server verification path.
- `paid_content_enabled` is moved from `off` to `sandbox_only` when still off; `live_money_enabled` remains off.

## Proof Status

Happy-path sandbox purchase proof passed on June 11, 2026:

- Device: `R5CR120QCBF`.
- Runtime: Google Play internal testing install, package `com.chillywood.mobile`, versionCode `37`, installer `com.android.vending`.
- Fan tester app user id: `4b5e7761-5bf1-4e18-9eb7-d6037a0eb32f`.
- Creator id: `0f53ad26-0b27-4f7f-9d6f-000000000001`.
- Video id: `6e1c3405-7db8-4cb2-98f3-5a7642e82126`.
- Product key: `paid_content_access_sandbox_099`.
- Provider product id: `cw_paid_content_access_sandbox_099`.
- Purchase intent id: `949b076d-81dd-44f0-b2d8-ce514ebb7348`.
- Provider event row id: `f0006ba1-495f-4353-875e-40db2c9e7a5f`.
- RevenueCat provider event id: `E86C4FA9-2B73-4D8F-9D6C-2C5A19BFA283`.
- Access grant id: `71967fff-b913-4390-8b3d-aef4f4e77726`.
- Mirrored `content_access_grants` id: `1b6cf126-bb80-4dd6-b724-7b804765c3f9`.
- Money ledger event id: `7f237e32-bdfc-4394-9bb3-f8537cae8e38`.

Observed proof:

- Locked Player showed `Unlock Video` and copy separating this creator-video purchase from Premium, subscriptions, VIP, live rooms, Watch-Party seats, and other creator content.
- Manual device tap opened the Google Play / RevenueCat sandbox purchase sheet.
- Google Play displayed `Payment successful`. The same Play sheet also displayed a Play Points status message, `Something went wrong`; this was Play Store UI, not Chi'llwood purchase copy.
- The source-bound purchase intent moved from `pending` to `consumed` at `2026-06-11 22:06:02.375+00`.
- Verified provider event `NON_RENEWING_PURCHASE` was processed in `sandbox`.
- Shared `access_grants` row was created with `grant_type=paid_content_access`, provider `revenuecat_google_play`, environment `sandbox`, status `sandbox_only`.
- Mirrored `content_access_grants` row was created for `content_type=creator_video`, `active=true`.
- Money ledger row was created with `amount_minor=99`, `currency=usd`, `environment=sandbox`, `payable_state=not_payable`, `status=sandbox_only`, and `source_type=paid_content`.
- After dismissing the Play dialog, the locked paywall text was gone from the device hierarchy, consistent with playback access being active for the paying fan.
- Separation readback showed `0` creator tip transactions for the paid-video purchase window and `1` active paid-content grant for the fan/video.

Still not complete:

- A second unpaid-fan device proof has not been captured yet.
- Provider refund/revoke proof is not claimed yet.
- Money Center visual transaction readback after this exact purchase still needs a device screenshot/manual proof pass.
- Live money remains disabled; sandbox rows are not payable.

## Current Blocker

The first happy-path sandbox purchase is proven. Remaining blockers before calling Paid Videos V1 fully proof-complete are unpaid-second-fan/direct-link proof, Money Center visual readback proof, and provider refund/revoke proof.

Do not sideload an APK for future Paid Videos purchase proof. Sideloaded builds can validate UI/code smoke, but they cannot close Google Play Billing sandbox proof.

## Play/Internal Runtime Preparation

June 11, 2026:

- Paid Videos V1 was committed as `c4fe47d5ddc3ec94ba9cd024f7bf479ebbbb2167` (`Implement Paid Videos V1 sandbox flow`).
- EAS production Android AAB build was started with auto-submit to the Google Play internal track.
- EAS incremented Android versionCode from remote `34` to `35`.
- Build id: `cc38dd8a-59a9-4aad-9641-71862b7f5075`.
- Auto-submission id initially scheduled by EAS: `73665297-db15-46f9-b9fd-a9495125dea3`. Explicit confirmed submission id: `19a77260-4f23-4a24-887c-1730790b7b98`.
- App version: `1.0.0`.
- Runtime version: `1.0.0`.
- Build profile: `production`.
- Channel: `production`.
- Distribution: `STORE`.
- Artifact type requested: Android App Bundle (`app-bundle` / AAB).
- Final readback during this pass: build status `FINISHED`, AAB artifact URL `https://expo.dev/artifacts/eas/jr8n0pSiAERN5zPsyqoaBWpmNk-zDHkoAGEzVVkKYCg.aab`.

Additional June 11, 2026 Play/internal updates:

- Commit `403fa07ed5d386c1325ae4ed6703d0fb9d7707d7` fixed the first paid-video lock touch target issue and shipped as v36.
- Commit `da403ce79a77000560b9ebba2ad350b4fe62fdb0` moved the paid-video unlock button above the player surface and shipped as v37.
- EAS build `6507576b-ab9b-4983-be92-8a9a57277bd0` produced v37 AAB artifact `https://expo.dev/artifacts/eas/wqjLzC1QTV5uFSRh7_lxN8kA1hBor4n4VDXiUNWpLT4.aab`.
- Google Play internal submission `698fb4a7-a5d5-4cd4-9da6-24bfe08bea7d` completed.
- Device readback after Play update: versionCode `37`, installer `com.android.vending`.
- Commit `7dae44b` adds stable proof hooks for future builds: `testID="unlock-paid-video-button"`, `accessibilityLabel="Unlock Video"`, and dev-only sanitized debug markers. No extra AAB was built from that commit during this proof pass.

Sandbox proof checklist:

1. Creator marks an uploaded video as Paid Unlock and saves a test price.
2. Fan opens the creator video and sees locked Player state with `Unlock Video`.
3. Fan completes Google Play / RevenueCat sandbox purchase.
4. RevenueCat webhook verifies the provider event.
5. Shared `access_grants` and mirrored `content_access_grants` rows are created.
6. Player reloads and unlocks only for the paying fan.
7. Money Center Transactions shows a Paid Video row as sandbox/not-payable.
8. A different unpaid fan and a direct deep link remain locked.

## Boundaries

- No Stripe Tips path is used for Paid Videos.
- No Premium entitlement unlocks creator paid videos.
- No LiveKit, Watch-Party routing, Party Room routing, Premium gate, paid Watch-Party, subscription, VIP, or paid event behavior changed.
- Sandbox rows are not payable and do not create payout, cash-out, withdrawal, transfer, or available creator balance.
- BrowserStack remains deferred until final full regression after all creator monetization flows have local/manual proof.
