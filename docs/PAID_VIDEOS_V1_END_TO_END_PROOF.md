# Paid Videos V1 End-To-End Proof

Last updated: June 11, 2026

## Real Status

Paid Videos V1 is repo-side implemented and the Supabase migration is remote-applied for sandbox testing. It is not live money and is not yet sandbox-proven end to end on a Play-installed device.

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

Not complete yet:

- June 11, 2026 provider proof attempt stopped before purchase because the attached Android device `R5CR120QCBF` has `com.chillywood.mobile` installed as versionCode `32` with `installer=null`, not `com.android.vending`. That does not satisfy the Play/internal tester runtime requirement for Google Play Billing proof.
- The local Paid Videos V1 code has not yet been published into a Play/internal tester build or EAS Update consumed by a Play-installed runtime, so the installed app cannot prove the new creator setup, locked Player, or purchase helper.
- No successful Paid Video transaction id is available yet.
- No Paid Video access grant id is available yet.
- No unpaid-user and direct-deep-link device proof is captured yet.
- No provider refund/revoke proof is claimed yet.

## Current Blocker

Paid Videos V1 cannot be called sandbox-proven until a tester installs or updates Chi'llwood from Google Play internal testing and the installed package readback shows:

- package `com.chillywood.mobile`
- installer `com.android.vending`
- a version/build or OTA payload that includes the Paid Videos V1 code
- RevenueCat public Android SDK key configured in that runtime
- Google Play tester account allowed to buy `cw_paid_content_access_sandbox_099`

Do not sideload an APK for the Paid Videos purchase proof. Sideloaded builds can validate UI/code smoke, but they cannot close the Google Play Billing sandbox proof required for this flow.

## Play/Internal Runtime Preparation

June 11, 2026:

- Paid Videos V1 was committed as `c4fe47d5ddc3ec94ba9cd024f7bf479ebbbb2167` (`Implement Paid Videos V1 sandbox flow`).
- EAS production Android AAB build was started with auto-submit to the Google Play internal track.
- EAS incremented Android versionCode from remote `34` to `35`.
- Build id: `cc38dd8a-59a9-4aad-9641-71862b7f5075`.
- Submission id scheduled by EAS: `73665297-db15-46f9-b9fd-a9495125dea3`.
- App version: `1.0.0`.
- Runtime version: `1.0.0`.
- Build profile: `production`.
- Channel: `production`.
- Distribution: `STORE`.
- Artifact type requested: Android App Bundle (`app-bundle` / AAB).
- Latest readback during this pass: build status `IN_PROGRESS`, no AAB artifact URL yet.

Paid Videos V1 purchase proof is still pending until the build completes, Play internal processing finishes, and the tester installs/updates from Google Play with `installer=com.android.vending`.

Expected sandbox proof:

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
