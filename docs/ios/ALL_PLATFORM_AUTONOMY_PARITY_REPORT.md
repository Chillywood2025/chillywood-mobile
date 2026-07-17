# All-Platform Autonomy Parity Report

Checkpoint: 2026-07-17

This is the closeout record for shared, Android, iOS, and web autonomous-system parity. It covers source, database, provider readback, schedulers, control planes, audit, guards, proofs, and CI. It does not claim physical iPhone behavior, publish an update, change a rollout, move money, or perform a release action.

## Canonical component inventory

The machine-enforced source of truth is `config/autonomy/autonomous-components.json`. The guard discovers systemd units, scheduled workflow files, scheduled Cloudflare workers, long-running operations queue workers, database cron schedulers, and operator-like Edge Functions. It fails when a discovered component is not owned and classified.

| Classification | Components |
| --- | --- |
| `top_level_system` | `media_automation`, `livekit_operator`, `money_flow_control`, `notification_delivery_operator`, `release_ota_operator`, `security_owner_operator`, `moderation_safety_operator`, `observability_runtime_operator`, `installed_product_qa_operator`, `platform_recovery_operator`, `privacy_compliance_operator`, `support_success_operator`, `search_ranking_integrity_operator`, `owner_command_operator` |
| `registered_surface` | `media_automation_worker`, `malware_scanner_worker`, `livekit_heartbeat_monitor`, `ios_terminal_call_delivery_retry`, `release_provider_readback_adapters`, `observability_provider_readback_adapter`, `android_firebase_test_lab_installed_qa`, `ios_installed_qa_readiness`, `user_report_router` |
| `protected_control_plane` | `autonomous_approval_control_plane`, `ops_alert_automation_control_plane` |
| `non_autonomous_utility` | `livekit_cloudflare_scheduler_template`, `administrative_provider_and_media_utilities`, `manual_release_workflows` |
| `foundation_only_off` | `ads_sponsor_delivery_operator` |

The closeout discovered two surfaces omitted by the earlier iOS-only inventory: the deployed long-running ClamAV malware-scanner queue worker and the disabled LiveKit Cloudflare/GitHub scheduler templates. They are now explicitly owned by `media_automation` and `livekit_operator`; neither became a new top-level operator.

Every inventory row contains supported platforms, source/service/timer paths, cadence, allowed reads and writes, forbidden scope, approval level, proof, guard, kill switch, rollback, deployment state, and physical-proof requirement.

## Probe composition and evidence truth

`watch_once` is compositional. Shared, Android, and iOS handlers run independently and return separate platform results. A failed platform cannot erase another platform’s success, and any blocked required platform prevents the overall result from becoming healthy. Generic operators remain supported, but missing substantive provider readback is `unknown` or `blocked`.

Expected release identity comes from `config/release/ios-qa.json` and `config/release/android-production.json`. Observed identity stays null until a readback proves it. The reviewed local iOS build attestation does not pretend build 8 exists in EAS cloud-build history and cannot prove TestFlight availability by itself. It must match App Store Connect readback before binary identity becomes verified. EAS update/channel truth remains separate.

## Scheduled provider adapters

Release remains on the existing thirty-minute cadence and observability remains on the existing ten-minute cadence. Hardened companion oneshot services execute the all-platform host adapters. They use the existing narrow operator endpoint/token environment plus an optional root-owned provider-readback environment. They do not use a Supabase service-role key. If optional provider access is missing, the adapter still posts an explicit unavailable capability instead of failing before the operator can record it.

Release composition covers read-only EAS, App Store Connect, and Android EAS/Play truth. Observability composition covers available Firebase/Google Cloud exports and sanitized backend/release telemetry. No adapter publishes or rolls back an OTA, changes TestFlight, mutates a provider dashboard, prints a signed artifact URL, or stores a credential.

## Platform-specific semantics

- Notification rails are separate for iOS Expo, iOS APNs VoIP, Android Expo, Android FCM, and shared terminal retry. Backend readiness, configured readiness, rollout-disabled, no-install, idle-without-evidence, delivery-proven, degraded, critical, and unknown states are distinct. APNs recognizes `BadDeviceToken`, `DeviceTokenNotForTopic`, and `Unregistered`; Android invalid-token behavior remains intact.
- Installed QA runs Android Firebase Test Lab and iOS source/provider readiness independently at the same daily schedule. iOS readiness records TestFlight/internal-binary, simulator, physical-device, second-device, Universal Link, APNs, VoIP, and StoreKit evidence separately and cannot fabricate a pass.
- Money health has separate shared, iOS RevenueCat App Store, and Android RevenueCat Google Play rows. Stripe physical/Connect control state remains shared. No rail moves money, creates a payable balance, manually grants Premium, or uses Stripe for iOS digital goods.
- Security, recovery, privacy, support, release, observability, LiveKit, and owner-command probes preserve shared and Android behavior while adding iOS evidence.

## Control planes and lifecycle

Platform scope is constrained and inherited through autonomous approval requests/events, owner commands/events/steps/blockers, provider repair requests, user-report routing actions, and operator findings. Fresh preflight requires exact system, action, platform, write scope, approval state, expiry, and external confirmation where applicable. An iOS approval cannot authorize Android, shared Stripe, or web work.

Current findings are keyed deterministically by system, platform, finding type, target surface, and provider. Repeated observations increment one open row; successful readback resolves it; append-only lifecycle events retain open/repeat/resolution history. Provider capability observations remain append-only while a trigger-maintained current-state table deduplicates capability state.

The closeout audit also corrected two legacy current-state exceptions. Typed observability tables now retain older duplicate rows as `superseded` while partial unique indexes enforce one open platform/condition. Installed-QA device and review rows use the same retained-history model and update the current row under retry races. Sanitized post-deployment readback found zero duplicate open groups in those tables; it retained 408 superseded observability rows, 11 superseded device-readiness rows, and 27 superseded installed-QA review rows as historical evidence.

## Governed User Report Router

`user_report_router` is a registered `support_success_operator` surface, not a new top-level operator. The historical `20260714001704_user_report_router` SQL remains isolated. The reviewed forward migration `20260718134500_governed_user_report_router` creates the current platform-aware objects with RLS and direct-client-write denial. `upsert_user_report_cluster_membership` atomically counts unique reporters, and `route_user_report_cluster` locks the qualified cluster and creates its owner command, approval request, routing action, finding, audit events, and cluster state in one retry-safe transaction. Concurrent threshold crossings cannot create duplicate control-plane side effects.

Platform-specific reports include platform in their fingerprint, so StoreKit/TestFlight/APNs/PushKit/CallKit reports cannot merge with Play Billing/FCM/APK/AAB reports. Shared safety, privacy, and account issues may cluster across platforms only when classification proves they are shared. Three-unique-reporter protection, duplicate-reporter protection, immediate high-risk review, prompt-injection blocking, recursive redaction, and no raw-text execution remain in force.

## Validation and boundaries

The local database reset passes four pgTAP files with 216 assertions, including 89 all-platform assertions. The synthetic all-platform suite executes 77 behavioral assertions against the real composition, notification, installed-QA, owner-command, report-routing, exact-versus-latest release identity, and dedupe helpers. CI retains the iOS contract job and adds `Phase 1 / Autonomous Systems All-Platform Contract`; database CI uses local Supabase only.

Physical proof remains required for camera, microphone, Photos/HEIC, signed Universal Links, APNs delivery, PushKit/CallKit, StoreKit purchase lifecycle, two-device LiveKit, audio routes/interruption recovery, accessibility, and iPad/orientation. No source/provider/backend row converts those requirements into a pass.

## Deployment and live readback

Remote migration history is aligned through `20260718143000_dedupe_device_availability_findings`, and a linked dry run reports the database is up to date. The second-pass forward migrations are `20260718141500_atomic_user_report_clustering`, `20260718142000_dedupe_open_observability_findings`, `20260718142500_atomic_user_report_routing`, and `20260718143000_dedupe_device_availability_findings`. They retain intake, audit, finding, and readiness history; no row was deleted.

Active functions at the final readback are notification v20, release v21, observability v18, installed QA v12, money v29, security v19, recovery v12, privacy v11, support v12, Owner Command v12, and User Report Intake v3. Existing LiveKit v43 and terminal retry v2 remain active.

The hardened release and observability companion services ran successfully on the production operator host. Their optional EAS/Expo, App Store Connect, and Firebase provider credentials/capabilities were unavailable, so all provider-dependent results remained blocked or unknown and observed release identity stayed null. The local build-8 attestation remains pending provider verification. Notification readback was complete but truthful: iOS Expo and APNs VoIP were `rollout_disabled`, Android Expo was `idle_no_delivery_evidence`, Android FCM was `unknown` without provider configuration, and shared terminal retry had zero backlog. Money readback remained separated into healthy shared and iOS sandbox/control rows plus a blocked Android provider row. User Report Router objects were present with zero open live clusters, routing actions, or findings. No synthetic user report was submitted.

Repeated current findings share deterministic keys and occurrence counts; authoritative recovery resolves the current row and appends a lifecycle event. Safety readback found no fake installed proof, no secret-like capability metadata, no money movement, no user-rights change, and no release action. Product rollout and money switch values matched their pre-deployment readback.

## Rollback

Revert source commits normally and redeploy prior Edge Function source. Stop only the affected systemd companion service/timer without changing product rollout switches. Database rollback is forward-only: retain audit, report, capability, approval, command, and finding history; apply a corrective migration. Disable terminal retry configuration and unschedule only its cron job when that surface requires an emergency stop. No rollback procedure deletes immutable evidence.
