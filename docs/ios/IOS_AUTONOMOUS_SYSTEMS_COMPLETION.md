# iOS Autonomous Systems Completion

Checkpoint: 2026-07-16

## Source result

The source-side contract is `SOURCE_COMPLETE`. Every registered system declares supported platforms. Platform-sensitive systems have explicit iOS adapters; backend-only policy remains shared rather than being duplicated. Missing provider data becomes `unknown` or `blocked`, never a synthetic healthy state.

The exact QA identity is `com.chillywood.mobile`, app `1.0.0`, native build `8`, channel `ios-qa`, runtime `1.0.0-iosqa1`, distribution `testflight_internal`, and application/backend source `bbb9d6db67620b1d39e3a3e67ab8ef7166ce02ae`. These values are expectations used to classify readback, not substitutes for missing provider values.

## Implemented boundaries

- `AutonomousPlatform` and normalized platform/app/build/runtime/channel/update/provider dimensions cover meaningful operator rows. Shared-only tables were not given artificial client identity.
- The `ios_terminal_call_delivery_retry` surface is formally owned by `notification_delivery_operator`. Its service-only readback exposes scheduler/config/backlog/capped/failure counts without token, invite, or credential material.
- Notification `watch_once` queries actual sanitized iOS Expo, APNs VoIP, Android Expo/FCM, and terminal-retry state. It sends no push.
- Release readback uses host-side read-only EAS and App Store Connect adapters. It records provider unavailability instead of accepting empty caller metadata.
- Observability records capability gaps for Crashlytics, Performance, Analytics, Supabase errors, release diagnostics, and LiveKit telemetry. No missing metric is converted to zero-health evidence.
- Installed QA derives source/provider/internal-build readiness and writes explicit `physical_proof_required` and `second_device_required` blockers. It never emits an installed or hardware pass without evidence.
- Money readback models `revenuecat_app_store`, Apple app `app3a0ad1ba62`, bundle identity, exact catalog/non-authority/non-payable rules, and sandbox state while retaining Google/Android behavior.
- Security, recovery, privacy, support, LiveKit, moderation, search, media, and owner-command routing now carry the platform context appropriate to their scope.
- The unrelated migration `20260714001704_user_report_router` is isolated under `supabase/migrations-isolated/`, so an unscoped database push cannot deploy it.

## Database and CI

The deployed additive migrations are:

- `20260718123000_ios_autonomous_platform_contract` — platform vocabulary, meaningful release identity dimensions, RLS-protected provider/scheduler capability tables, service-only retry/recovery readbacks, indexes, and installed-QA proof vocabulary;
- `20260718124500_fix_ios_autonomous_probe_identity_columns` — forward-only completion of recovery snapshot identity fields; and
- `20260718130000_complete_ios_observability_review_identity` — forward-only completion of observability review identity fields found by the first live probe.

All three appear as exact local/remote pairs in linked migration history. They preserve RLS, deny client writes, grant only service execution for sanitized readback RPCs, and do not remove Android values. The unrelated `20260714001704_user_report_router` is stored in `supabase/migrations-isolated/` and cannot be selected by an unscoped migration push.

The independent CI job is `Phase 1 / Autonomous Systems iOS Contract`. It runs all autonomy guards, proofs, and synthetic fixture suites. `Phase 1 / Supabase Database Integration` also runs `ios_autonomous_systems_test.sql` alongside the durable-call and atomic-RevenueCat suites with no production credential.

Local database reset and pgTAP pass with 3 files and 131 assertions. The iOS autonomy suites cover 12 retry, 17 notification, 21 release, 13 observability, 17 installed-QA, and 53 coverage assertions. All nine required PR jobs pass, including `Phase 1 / Autonomous Systems iOS Contract` and `Phase 1 / Supabase Database Integration`.

## Deployment and sanitized live readback

The updated functions are active: `notification-operator` v16, `release-operator` v16, `observability-operator` v15, `installed-product-qa-operator` v9, `livekit-operator` v43, `money-operator` v28, `security-owner-operator` v15, `platform-recovery-operator` v8, `privacy-compliance-operator` v8, `support-success-operator` v8, and `owner-command-operator` v11. The existing terminal worker remains `chilly-chat-call-transition-retry` v2.

The registered host timers remain enabled at their existing cadence: notification and LiveKit every 5 minutes; observability and money every 10 minutes; security every 15 minutes; release, recovery, and support every 30 minutes; privacy every 6 hours; installed QA daily. No cadence was increased and no broad scheduler was added. Release and observability timers record `host_provider_adapter_required` from the hardened systemd sandbox instead of manufacturing provider health; owner-host adapters perform separate bounded provider reads.

Sanitized manual `watch_once` readback produced:

- notification: `LIVE_READBACK_PASS` for iOS/Expo, iOS/APNs VoIP, Android/Expo, Android/FCM, and shared terminal retry. Both iOS rollout booleans read false. No delivery was sent;
- terminal retry: enabled one-minute cron, attempt and batch caps 10, no pending/failed/stale/capped backlog, and no unresolved warning/critical failure;
- release: `PROVIDER_READBACK_BLOCKED`. The EAS API was reachable but could not prove the locally built build 8 or an `ios-qa` channel/update record; App Store Connect API access was unavailable. The stored release snapshot is blocked/incomplete, not healthy;
- observability: `PROVIDER_READBACK_BLOCKED`. Crashlytics, Performance, Analytics, sanitized Edge log export, release diagnostics, and iOS LiveKit client telemetry are explicitly missing. Counts remain context only and are not interpreted as zero-failure proof;
- installed QA: blocked on provider readback and still records `PHYSICAL_PROOF_REQUIRED` and `SECOND_DEVICE_REQUIRED`; it wrote no fake physical pass;
- money: `LIVE_READBACK_PASS` for the exact 10-row `revenuecat_app_store` sandbox catalog/provider/non-payable policy. No provider mutation or money movement occurred;
- LiveKit: shared router/token readback is healthy with one eligible server and `physicalProofClaimed=false`; no iOS client-render row was invented;
- security: APNs credential presence by name is `PRESENT`; App Store Connect and signing-status readbacks are unavailable, so overall state is unknown;
- privacy: the source manifest/tracking/purpose/account-deletion contract is available; App Store privacy worksheet owner attestation is pending;
- recovery: migrations, required functions, and retry scheduler pass; release identity/rollback provider truth is blocked with the release adapter; and
- support: iOS-scoped finding count is zero, but release identity readback is incomplete, so health is unknown rather than healthy.

The post-deployment safety query found zero `money_moved=true` rows, zero `user_rights_changed=true` rows, zero unsafe secret-like provider-capability metadata rows, and zero fake iOS physical-pass rows. Database switches remained `revenuecat_app_store_enabled=off`, `provider_webhooks_enabled=sandbox_only`, `tips_enabled=sandbox_only`, `watch_party_tickets_enabled=sandbox_only`, `live_money_enabled=off`, and `payouts_enabled=off`; notification readback confirmed ordinary iOS and VoIP rollout booleans remained false.

## Truthful completion states

- Source and local database contract: `SOURCE_COMPLETE`.
- Deployment: `DEPLOYED` for all functions and migrations listed above.
- Notification, terminal retry, money catalog/provider policy, and shared LiveKit router: `LIVE_READBACK_PASS` within their read-only backend scope.
- Release, observability, installed-build provider proof, Apple signing status, and App Store worksheet truth: `PROVIDER_READBACK_BLOCKED` or `OWNER_APPROVAL_REQUIRED` as detailed above.
- Provider APIs not available to a read-only adapter: `PROVIDER_READBACK_BLOCKED`.
- APNs, PushKit/CallKit, StoreKit, camera/microphone/Photos, signed Universal Links, accessibility/audio routes, and actual installed behavior: `PHYSICAL_PROOF_REQUIRED`.
- Bidirectional LiveKit and full native-call lifecycle: `SECOND_DEVICE_REQUIRED`.
- App Privacy/legal answers and public release: `OWNER_APPROVAL_REQUIRED`.
- Ads/sponsor delivery: `FOUNDATION_ONLY_OFF`.

No source state in this document authorizes a build, OTA, TestFlight mutation, rollout change, public release, push send, product change, money movement, Premium grant, or user-right mutation.
