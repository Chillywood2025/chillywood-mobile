# All-Platform Autonomy Parity Report

Checkpoint: 2026-07-18

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

The local database reset passes five pgTAP files with 254 assertions, including 113 all-platform assertions. The synthetic all-platform suite executes 91 behavioral assertions against the real composition, notification, installed-QA, owner-command, report-routing, exact-versus-latest release identity, media recovery, observability export isolation, and dedupe helpers. The database suite also forces a target-table trigger failure and proves durable, sanitized, fail-closed scan completion. CI retains the iOS contract job and `Phase 1 / Autonomous Systems All-Platform Contract`; database CI uses local Supabase only.

Physical proof remains required for camera, microphone, Photos/HEIC, signed Universal Links, APNs delivery, PushKit/CallKit, StoreKit purchase lifecycle, two-device LiveKit, audio routes/interruption recovery, accessibility, and iPad/orientation. No source/provider/backend row converts those requirements into a pass.

## Deployment and live readback

Remote migration history is aligned through `20260718214900_lock_media_scan_target_propagation_behind_wrapper`, and a linked dry run reports the database is up to date. The final forward migrations are `20260718211422_fix_android_installed_qa_platform_attribution`, `20260718211432_harden_media_scan_retry_recovery`, `20260718213052_fix_runtime_sql_type_resolution`, `20260718214102_decouple_media_scan_audit_completion`, and `20260718214900_lock_media_scan_target_propagation_behind_wrapper`. They truthfully backfill Firebase Test Lab rows to Android, constrain future attribution, add a service-only bounded stale/capped scanner recovery path, repair the scan-aware creator-feed and iOS purchase-intent SQL type resolution, isolate target propagation in a PostgreSQL subtransaction so unrelated target policies cannot roll back the scan audit, and make the legacy propagator callable only by the durable security-definer wrapper. They retain audit, scan, finding, and readiness history; no row was deleted.

Active functions at the final readback include notification v21, release v22, observability v20, installed QA v14, money v30, LiveKit operator v44, LiveKit registry v48, and terminal retry v4. Observability and installed QA were redeployed with the platform repairs. The unchanged, Deno-checked LiveKit registry was also redeployed after host execution exposed an active-inventory/function-route mismatch; v48 restored the endpoint without changing its token gate or routing policy.

The hardened release and observability companion services ran successfully on the production operator host. The observability adapter now accepts separate sanitized shared, Android, and iOS exports so one platform can never be attributed to another. Optional App Store Connect and Firebase metric-export capabilities remain unavailable, so provider-dependent results remain blocked or unknown and observed release identity stays null. The local build-8 attestation remains pending provider verification. Notification readback is complete and truthful: iOS Expo is `rollout_disabled`; iOS APNs VoIP is configured with rollout enabled and has `delivery_evidence_healthy`; Android Expo is configured with rollout enabled but remains `idle_no_delivery_evidence`; Android FCM is `unknown` because provider configuration is unavailable; and shared terminal retry is healthy with zero backlog. Money readback remains separated by provider; App Store and Google Play controls are sandbox-only while live money and payouts remain off.

All registered host timers have a future activation at their unchanged cadence and no Chi'llywood unit remains failed. A bounded LiveKit heartbeat/operator rerun passed after the registry route repair. Sanitized registry state contains five retained server records, exactly one active/healthy server with a fresh heartbeat, and zero current rooms, participants, or publishers; this is backend health only and does not claim two-device media proof.

The installed-QA adapter and operator now record Firebase Test Lab as Android even when an older host payload omitted the platform. Ten historical Test Lab rows were backfilled from `unknown` to `android`, and a validated constraint prevents recurrence. The production malware scanner now performs five-minute bounded stale/capped recovery and has explicit RPC, private-object download, and ClamAV subprocess timeouts. Its completion wrapper records the queue outcome even when a target-table trigger blocks propagation; the target remains unapproved/fail-closed and only a generic blocker is retained. Live sanitized readback reports 31 clean rows, 37 retained `manual_review` rows, zero scanning or capped-retryable rows, and two sanitized propagation blockers. No private object path or raw database error was exposed.

Repeated current findings share deterministic keys and occurrence counts; authoritative recovery resolves the current row and appends a lifecycle event. Safety readback found no fake installed proof, no secret-like capability metadata, no money movement, no user-rights change, and no release action. Product rollout and money switch values matched their pre-deployment readback.

## Rollback

Revert source commits normally and redeploy prior Edge Function source. Stop only the affected systemd companion service/timer without changing product rollout switches. Database rollback is forward-only: retain audit, report, capability, approval, command, and finding history; apply a corrective migration. Disable terminal retry configuration and unschedule only its cron job when that surface requires an emergency stop. No rollback procedure deletes immutable evidence.
