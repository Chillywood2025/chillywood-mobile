# iOS Autonomous Systems Baseline

Baseline captured: 2026-07-16 (America/Chicago)

Repository truth: `codex/ios-integration-90` at `3ad78fb65445b7851403b72b69923f4ca5c5c7ca`. Local, origin, and draft PR #10 heads matched. The existing eight PR checks passed. `deno.lock` was untracked and unstaged.

This is the pre-change inventory required before autonomous iOS integration. It records what the operators actually did at the baseline; it does not claim physical-device proof.

## Release and control-plane baseline

- iOS QA contract: `com.chillywood.mobile`, version `1.0.0`, native build `8`, channel `ios-qa`, runtime `1.0.0-iosqa1`, source `bbb9d6db67620b1d39e3a3e67ab8ef7166ce02ae`, internal TestFlight distribution.
- Database switch readback: `revenuecat_app_store_enabled=off`, `provider_webhooks_enabled=sandbox_only`, `tips_enabled=sandbox_only`, `watch_party_tickets_enabled=sandbox_only`, `live_money_enabled=off`, and `payouts_enabled=off`.
- Monetization singleton readback: cash-out, payouts, live money, and Stripe Connect production were all false.
- Ordinary iOS and VoIP rollout flags were last verified false during the build-8 closeout. The baseline operator could not independently read its deployed function environment, so their fresh provider readback state was `PROVIDER_READBACK_BLOCKED`; no switch was changed.
- Terminal retry configuration was enabled. Delivery backlog, capped deliveries, unresolved warnings, and unresolved critical failures were all zero. The pre-change schema did not expose sanitized cron health through an operator readback.
- Remote migration history matched local history except intentional local-only exception `20260714001704_user_report_router`. It must remain isolated from unscoped database pushes.
- Direct SSH host status was unavailable from this workstation. Recent database audit rows proved systemd timer invocation for money, notification, release, security, moderation, observability, platform recovery, privacy, support, and search. The installed-QA daily Firebase uploaded-artifact run also had an audited timer row. LiveKit had operator rows but the baseline row shape did not carry scheduler identity.

## System inventory

| System | Activation and scheduler | Existing reads | Existing writes | Forbidden boundary / approval | Platform baseline and gap |
| --- | --- | --- | --- | --- | --- |
| `media_automation` | `bounded_run`; no active daemon/cron/queue worker | Public-safe media, scanner/catalog status, rendition/storage and backup metadata | Scoped transcode/rendition, scanner results, migration audit, private backup artifacts | No private/Premium/original exposure, unsafe media, uncapped backfill, billing/auth/RLS; Level 3 for broad backfill/new scheduler | Shared backend. Origin platform was not formally declared; client-origin telemetry lacked a normalized platform contract. |
| `livekit_operator` | `limited_scheduled_safe_recovery`; registered every 5 minutes | Router/token/heartbeat/host and sanitized render telemetry | Health/events/learning and bounded heartbeat/counter recovery audit | No fake heartbeat, routing/TURN/secret/provider mutation, Premium bypass, or source OTA; Level 4 for provider/secret changes | Shared router plus Android/web-aware telemetry. iOS telemetry could exist but lacked explicit platform/build/runtime/channel dimensions and could not prove physical iOS media. |
| `money_flow_control` | `limited_scheduled_probe`; audited every 10 minutes | Ledger/provider/reconciliation status; RevenueCat, Google Play, Stripe delivery/readiness | Reconciliation/status/finding/duplicate/review/learning/approval rows only | No charge, payout, transfer, cash-out, payable balance, manual Premium grant, or provider mutation; Level 3/4 as registered | Shared backend with mature Android/Google assumptions. App Store/RevenueCat mappings existed, but the autonomous contract did not explicitly model the iOS app/provider identity and sandbox lane. |
| `notification_delivery_operator` | `limited_scheduled_safe_recovery`; audited every 5 minutes | Caller-supplied delivery metadata only in generic `watch_once` | Event, health, provider-sync, duplicate, and review rows; provider-evidenced token-disable plan | No broad send, preference bypass, provider config, credential mutation, or hidden failure; Level 3 for campaign/provider change | Shared delivery with Android assumptions. iOS Expo/VoIP and terminal retry were not substantively queried. `defaultHealthState=healthy` allowed false health from missing metadata. Retry worker was absent from the registry. |
| `release_ota_operator` | `limited_scheduled_probe`; audited every 30 minutes | Caller-supplied release metadata only | Release events/snapshots, OTA diagnostic/anomaly/rollback-readiness/review rows | No publish, rollback, runtime/channel, TestFlight, App Review, or credential mutation; Level 4 for release mutation | Shared release control, primarily Android/OTA-shaped. No independent EAS or App Store Connect iOS adapter. Missing readback could be recorded healthy. |
| `security_owner_operator` | `limited_scheduled_probe`; audited every 15 minutes | Owner/approval/admin-route/secret-scan summaries | Security health, authority/approval/secret findings, review and approval rows | No owner/auth/RLS/secret mutation; Level 4 for mutation/rotation | Shared security control. No explicit iOS certificate/profile/APNs/App Store credential-presence or signing-match surface. |
| `moderation_safety_operator` | `limited_scheduled_probe`; audited every 10 minutes | Moderation case/report and safety summaries | Case/safety/duplicate/stale/review/audit rows | No ban, restriction, content deletion, rights mutation, or hidden enforcement; Level 3 for enforcement | Shared backend. Platform attribution was optional/unmodeled; moderation policy and rights were correctly shared. |
| `observability_runtime_operator` | `limited_scheduled_probe`; audited every 10 minutes | Caller-supplied crash/JS/performance/analytics/release/backend metadata only | Runtime snapshots and crash/JS/performance/analytics/release/backend review rows | No evidence deletion, Crashlytics/config/Remote Config/OTA/auth/RLS/provider mutation; Level 3/4 for high risk | Shared observability with Android-oriented wording. No substantive Firebase/runtime/backend iOS readback. Missing provider access could become healthy. |
| `installed_product_qa_operator` | `limited_scheduled_probe`; daily cost-capped Firebase uploaded-artifact timer | Android/Play/Firebase uploaded-artifact, route/account/device fixture metadata | Installed-QA events, traversal/device/route/role/account findings, review/learning/approval rows | No fake install/device proof, role/auth/RLS/entitlement/money mutation, or false two-device closure | Shared QA framework but Android/Play-centric. No TestFlight/internal iOS proof types or truthful `physical_proof_required`/`second_device_required` states. |
| `platform_recovery_operator` | `limited_scheduled_probe`; audited every 30 minutes | Backup/restore/migration/function/timer/secret-name/R2/emergency summaries | Recovery health/drift/timer/review/approval rows | No restore, destructive mutation, secret rotation, provider or R2 behavior change; Level 3/4 | Shared recovery. No explicit iOS build/runtime/channel, EAS variable-name, APNs/RevenueCat/App Store readback, terminal retry, or OTA rollback-readiness checks. |
| `privacy_compliance_operator` | `limited_scheduled_probe`; audited every 6 hours | Request, export/deletion planning, legal hold, retention, PII/disclosure/evidence summaries | Privacy findings/plans/reviews/approval rows | No raw export, production deletion, legal decision, hold override, evidence deletion, or auth/RLS mutation; Level 3/4 | Shared privacy control. No explicit iOS privacy manifest hash/presence, tracking flag, purpose strings, App Store worksheet, or owner-attestation readiness. |
| `support_success_operator` | `limited_scheduled_probe`; audited every 30 minutes | Inbox/ticket/report-router/account/Premium/payment summaries | Support health/findings/drafts/escalations/reviews/approval rows | No refund, grant, entitlement/account/auth change, or external legal/payment commitment; Level 3/4 | Shared support. Findings lacked normalized iOS app/build/runtime/channel context. |
| `search_ranking_integrity_operator` | `limited_scheduled_probe`; audited every 30 minutes | Search/ranking/recommendation/visibility/spam/index/latency summaries | Search health, ranking/recommendation/visibility/review/approval rows | No secret boost/demotion, shadowban, ranking/public exposure mutation; Level 3 | Shared backend. Platform telemetry could be recorded but no platform contract existed; ranking policy correctly remained shared. |
| `ads_sponsor_delivery_operator` | `off`; no scheduler | Foundation/readiness registry only | None | No ad serving, sponsor checkout/upload/payout, impression/revenue claims, provider config, or CTV activation | `FOUNDATION_ONLY_OFF`; must remain platform-independent and off. |
| `owner_command_operator` | `manual_cli`; no scheduler | Owner-command text, registry routes, approval/emergency state | Plans, steps, status/events/review flags and approval requests | Cannot directly execute provider mutation, release/OTA, money, auth/RLS, role mutation, or moderation enforcement | Shared command router. It lacked explicit `shared`/`ios`/`android`/`web` command scope and iOS route context. |

## Deployed function baseline

| Function | Version |
| --- | ---: |
| `notification-operator` | 15 |
| `release-operator` | 15 |
| `observability-operator` | 13 |
| `installed-product-qa-operator` | 8 |
| `security-owner-operator` | 14 |
| `platform-recovery-operator` | 7 |
| `privacy-compliance-operator` | 7 |
| `support-success-operator` | 7 |
| `search-ranking-integrity-operator` | 7 |
| `money-operator` | 27 |
| `livekit-operator` | 41 |
| `owner-command-operator` | 10 |
| `chilly-chat-call-transition-retry` | 2 |

## Baseline conclusions

1. All systems were registered, but none declared a formal `supportedPlatforms` contract.
2. Notification, release, and observability required custom probes; the generic handler was insufficient and unsafe because missing readback defaulted to healthy.
3. Installed-product QA required iOS/TestFlight proof-source types and non-pass states for hardware-dependent work.
4. Terminal retry was deployed and enabled but not a formal notification autonomous surface.
5. Shared backend systems needed explicit shared classification without artificial iOS duplicates.
6. Platform-sensitive tables needed additive platform/app/build/runtime/channel/update/provider dimensions, truthful backfill, indexes, and preserved client-write denial.
7. Physical camera, APNs, PushKit/CallKit, StoreKit, and two-device LiveKit proof remained outside this source/backend task.
