# All-platform autonomous parity baseline

Checkpoint: 2026-07-16. Repository, origin, and draft PR #10 all started at `b76e7c813b70ba44dd3f579a005177d4bfe0cc90`. `deno.lock` was untracked and unstaged. All nine existing PR checks passed.

This baseline was recorded before changing autonomous implementation source. It covers repository-owned Edge Functions, host services/timers, PostgreSQL cron, workflows, provider adapters, approval/owner-command paths, retry loops, and administrative provider utilities. It does not claim physical-device, APNs, PushKit, CallKit, StoreKit, TestFlight, build, or OTA proof.

## Existing governed systems

The registry contains fifteen top-level systems: media, LiveKit, money, notification delivery, release/OTA, security/owner, moderation/safety, observability/runtime, installed-product QA, platform recovery, privacy/compliance, support/success, search/ranking integrity, ads/sponsor delivery, and Owner Command. Ads/sponsor delivery is foundation-only and off.

Existing registered or clearly owned surfaces include the media automation worker, LiveKit router/heartbeat monitor, notification delivery probe, terminal-call retry cron/worker, release and observability probes, Android Firebase Test Lab installed QA, money provider-reliability probe, and the bounded systemd watch loops for the active operators.

## Baseline gaps

1. `watch_once` is single-handler. Security, recovery, privacy, support, release, observability, and installed QA can replace shared or Android truth with an iOS-only handler rather than composing independent platform results.
2. Release and observability systemd timers post `host_provider_adapter_required`; their checked-in host adapters are not executed by the scheduled unit.
3. The iOS release adapter expects a locally built binary to appear in EAS cloud-build history. There is no service-owned local-binary attestation joined to App Store Connect build truth.
4. Expected iOS identity is used as observed identity in release, observability, security/privacy/recovery/support source probes.
5. Recovery checks an obsolete noncanonical RevenueCat iOS alias instead of `EXPO_PUBLIC_REVENUECAT_IOS_PUBLIC_SDK_KEY`.
6. Notification health can call an idle or rollout-disabled rail healthy without active tokens or provider delivery evidence, and its APNs invalid-token classifier omits `BadDeviceToken` and `DeviceTokenNotForTopic`.
7. iOS installed readiness is appended to the Android Firebase Test Lab service and uses the contradictory `ios_provider_readback_missing` / `provider_ready` state.
8. Money `watch_once` writes an aggregate provider result as `platform=ios`; shared Stripe, iOS RevenueCat App Store, and Android RevenueCat/Google Play truth are not isolated.
9. Platform scope does not survive all approval requests, approval events, Owner Command steps/blockers, report routing actions/findings, and provider repair requests.
10. The User Report Router exists in source and isolated historical SQL, but has no reviewed deployable forward migration. It is not formally registered as a `support_success_operator` surface.
11. Mutable findings are inserted repeatedly without a stable finding key, occurrence count, or resolution lifecycle.
12. Current autonomous CI is iOS-oriented and mainly source-string based; it does not behaviorally execute shared + Android + iOS composition.

## Previously orphaned components

- `user-report-intake` / User Report Router: intended classification `registered_surface`, owner `support_success_operator`.
- `ops-alert-automation`: intended classification `protected_control_plane`, governed through the existing LiveKit/security approval boundary; it is not a new top-level operator.
- `autonomous-approval-request`: `protected_control_plane`.
- Owner Command routing/preflight/execution: top-level router plus `protected_control_plane` execution boundary.
- The subsequent full-repository scan also found the deployed ClamAV malware-scanner queue consumer and disabled LiveKit Cloudflare/GitHub scheduler templates missing from the earlier component list. They belong to `media_automation` and `livekit_operator`; neither needs a new top-level system.

## Non-autonomous utilities

Authenticated/manual provider imports, billing reconciliation, payout/provider preflights, media storage migration utilities, media scan access helpers, and release/build workflows have no autonomous cadence of their own. They remain `non_autonomous_utility` and must not gain scheduled authority through this closeout.

## Scheduler truth at checkpoint

- Notification 5 minutes; LiveKit operator 5 minutes; LiveKit heartbeat 1 minute; money 10 minutes; observability 10 minutes; moderation 10 minutes; security 15 minutes; release 30 minutes; recovery 30 minutes; support 30 minutes; search 30 minutes; privacy 6 hours; Android Firebase Test Lab daily.
- Terminal call retry runs every minute through PostgreSQL cron.
- Media automation timer is a disabled template.
- No active scheduled GitHub Actions workflow exists in `.github/workflows`; release/build workflows are manual only. A disabled LiveKit scheduled-workflow template exists outside `.github/workflows` and requires explicit inventory coverage.
- `ops-alert-automation` is a long-running protected service and requires explicit inventory coverage.

## Safety state

No device, build, OTA, TestFlight, rollout, money, provider-product, authorization, role, moderation-enforcement, or broad-push action is authorized by this baseline. Missing provider evidence remains blocked or unknown.
