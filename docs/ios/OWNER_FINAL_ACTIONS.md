# Owner Final Actions

Checkpoint date: 2026-07-16

This list contains only actions that require owner authority, dashboard permission,
2FA/CAPTCHA, physical hardware, legal attestation, or final release approval. It
does not transfer automatable repository, provider, build, deployment, product,
workflow, screenshot, or internal-TestFlight work back to the owner.

## Current provider credential state

No RevenueCat provider-credential action remains. The dedicated Apple In-App
Purchase Key was generated once, downloaded once, removed from Downloads, stored
outside Git with owner-only permissions, recorded in macOS Keychain, and uploaded
directly to the existing RevenueCat Apple app `app3a0ad1ba62`. RevenueCat retained
`Valid credentials` after reload, and the existing App Store Connect API credential
also remains valid.

Do not send, move into Git, or paste the key, RevenueCat secret, webhook
authorization, password, 2FA code, or session token. This completed credential
setup does not authorize a real purchase or enable the App Store purchase rail.

### Rotate unrelated ambient credentials

An OS process diagnostic exposed inherited Brevo and Cloudflare credential values
in local diagnostic output. They were not used, staged, or committed, and the
values are intentionally not reproduced here. The owner must rotate both provider
credentials in their official dashboards, update only their approved secret
stores, and revoke the exposed values after the replacement configuration is
verified. This is urgent security hygiene and is separate from Apple signing.

## Interaction-only approvals during the 90% task

The owner may need to act only when a provider presents an unavoidable interactive
gate:

- approve Apple, EAS, Supabase, or GitHub authentication/2FA in the
  official UI;
- approve the protected `ios-preview` or `ios-production` GitHub environment when
  the exact reviewed manual workflow is ready;
- accept any applicable Apple developer agreement in the official Apple portal;
  and
- confirm an internal tester assignment if App Store Connect restricts that action
  to the owner role.

Do not paste passwords, 2FA codes, private keys, certificates, profiles, tokens,
receipts, signed URLs, or provider credentials into chat, issues, PRs, docs, or
source files. Enter them only into the official provider prompt.

## Physical-device actions in the final 10%

Do not begin these actions yet. Build 6 is superseded. Wait for the corrected
source commit, freshly installed Simulator smoke, inspected archive, and exact
internal TestFlight build 7 or higher.

Use the exact reviewed internal-TestFlight build and bounded test accounts. Keep
private surroundings, conversation, contacts, media, device identifiers, and
credentials out of captured evidence.

1. Prove physical iPhone camera permission and real preview.
2. Prove physical iPhone microphone capture/publish.
3. Prove physical iPhone Photos selection, HEIC preparation, upload, and render
   using a non-private asset.
4. Provide an approved second physical client for bidirectional LiveKit audio/video.
5. Test ordinary APNs foreground delivery.
6. Test ordinary APNs background delivery.
7. Test ordinary APNs terminated-app delivery.
8. Verify Universal Links on the signed physical build in cold, warm, and
   already-running states.
9. Provide a second approved iPhone for real PushKit/CallKit incoming-call proof.
10. Exercise answer, decline, caller cancel, timeout, lock-screen, and cleanup.
11. Test speaker/receiver, Bluetooth/AirPods, interruptions, and background/return
    using available hardware.
12. Complete a bounded internal-TestFlight StoreKit sandbox purchase.
13. Verify Restore Purchases.
14. Verify renewal, cancellation, refund, and revocation behavior.
15. Complete VoiceOver, Dynamic Type, reduced-motion, orientation, iPad, and final
    device regression review.

The owner should enter test credentials on the device or in App Store Connect's
protected reviewer field only. Never place them in repository documentation.

## Final legal attestations

Only the owner/legal reviewer may submit final answers for the exact production
binary and provider state:

- App Privacy data collection/use/linking answers;
- export-compliance answers;
- content-rights declarations;
- age-rating questionnaire, including UGC/chat/live-content disclosures;
- EU Digital Services Act trader-status decision and any required verification;
- final copyright, support, privacy, and account-deletion representations; and
- any applicable paid-app agreement, tax, banking, pricing, or territory decisions.

Repository worksheets are preparation material, not legal attestation. Reconcile
them to the final archive, enabled provider features, and reviewer account before
submitting answers.

## Public release gate

Internal TestFlight upload is authorized; public App Store release and external
TestFlight distribution are not.

After the complete device matrix, provider verification, archive review, App Store
processing, legal declarations, and internal testing pass, the owner must give a
new explicit approval before any public App Store release. Silence, internal
TestFlight success, or provider readiness does not constitute approval.

## Already completed — do not repeat

The owner does not need to recreate these items:

- Firebase Apple app and protected EAS Firebase File variable;
- App Store Connect app record for `com.chillywood.mobile`;
- numeric App Store app ID and EAS submit profile;
- finite ten-product App Store catalog, localizations, prices, and USA availability;
- RevenueCat Apple app `app3a0ad1ba62` in existing project `projc5629a24`;
- ten RevenueCat Apple product records, Premium entitlement mapping, and the
  `default`, `creator_support`, and `seat_passes` offerings/packages;
- sensitive EAS public iOS SDK-key configuration in development, preview, and
  production;
- project-wide RevenueCat webhook `whintgr38699522f7` and its safe TEST proof;
- dedicated Apple In-App Purchase credential, securely retained outside Git and
  validated by RevenueCat alongside the existing App Store Connect API credential;
- provider-generated StoreKit comparison and 3/3 Simulator harness pass;
- Stripe test-mode physical-merch and Connect provider readback;
- ordinary EAS APNs credential and separately stored VoIP APNs secret material;
- AASA deployment;
- Supabase Auth redirect URL configuration;
- GitHub protected iOS environments;
- one registered iPhone and existing EAS-managed development credentials;
- the historical foundation Simulator and physical development builds;
- seven deployed additive integration migrations and seven active fail-closed Edge
  Functions, including durable call transition and atomic RevenueCat RPCs;
- exact remote Premium mapping readback `999` monthly / `9999` yearly with the
  App Store rail, live money, and payouts still off;
- historical Simulator build `6d8e5193-ea75-490f-9451-759419a3e7b3`, app
  `1.0.0 (6)`, now superseded;
- historical production build `a729aa9a-1a98-439c-8c81-48c381735d8d`, app
  `1.0.0 (6)`, now superseded;
- internal TestFlight processing and assignment to `Chillywood Internal`; and
- public-safe standard, large, small, and tablet-format screenshot drafts.

Do not revoke/recreate those credentials, products, app records, device
registration, certificate, or provisioning profile unless a confirmed compromise
or explicit rollback plan requires it.

## Owner safety confirmation before final approval

Confirm that:

- live money is off;
- payouts, cash-out, withdrawals, transfers, and payable balances are off;
- App Store purchase and native-call production switches remain off except during
  a bounded approved test;
- no external testers or public release have been enabled;
- no production OTA was published;
- no private credential or test data appears in Git, PRs, screenshots, or docs;
  and
- the exact reviewed source commit and build ID match the binary being approved.
