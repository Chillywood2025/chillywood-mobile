# Chi'llywood Autonomous Systems Scope Registry

Last updated: 2026-07-13

This registry is the protected top-level contract for Chi'llywood autonomous systems. The source registry lives in `_lib/autonomousSystemsRegistry.ts`; this document is the operator-facing mirror. Future autonomous scope must be added through explicit registry entries with approval level, read/write bounds, guard, proof, rollback, emergency-stop/fallback, and owner/admin approval requirements. In short, future scope can be added only through registry entries.

## Current Systems

### `media_automation`

Status: bounded source/CLI automation with object-storage shutdown readiness closed.

Activation modes:
- `off`
- `dry_run`
- `manual_cli`
- `bounded_run`
- `limited_scheduled_if_approved`

Current activation: `bounded_run`

Scheduler status: no daemon, cron, or queue processor enabled.

Allowed surfaces:
- media scan
- catalog readiness
- auto-detect planning
- source-aware rendition ladder
- transcode worker
- `media_renditions` audit
- R2 public/free playback
- Premium protected HD rows
- object-storage R2 migration/readiness
- backup/restore

Allowed writes:
- scoped `media_transcode_jobs`
- scoped `media_renditions`
- scan result writes through trusted scanner authority
- migration audit/resolution metadata
- private backup/export artifacts

Forbidden:
- private/Premium/original public exposure
- unscanned/moderation-blocked processing
- broad uncapped backfill
- fake audit pass
- deleting private source objects without approval
- billing/Premium/auth/RLS/payout changes

Required gates:
- backup/restore
- scan/moderation
- audit before trust
- rollback/quarantine
- kill switch/emergency stop
- fallback
- secret scan

Required proofs/guards:
- `proof:media-automation-controller`
- `proof:media-automation-cli`
- `proof:media-object-storage-zero-hetzner`
- `guard:autonomous-operating-model`
- `guard:media-delivery-architecture`
- `guard:media-object-storage-migration`
- `guard:vod-quality-policy`

Level 3 media expansion example: broad media backfill or a new scheduler requires an approval request before execution.

### `livekit_operator`

Status: `limited_scheduled_safe_recovery_active_systemd_timer`.

Activation modes:
- `manual_cli`
- `limited_scheduled_probe`
- `limited_scheduled_safe_recovery`

Current activation: `limited_scheduled_safe_recovery`

Scheduler status: `chillywood-livekit-operator-watch-once.timer` every five minutes.

Allowed surfaces:
- `live_stage`
- `watch_party_live`
- `party_room_live_sidecar`
- `chat_call`
- `livekit_token`
- `livekit_router`
- `heartbeat_monitor`
- `host_agent`
- `render_telemetry`

Allowed writes:
- `livekit_operator_events`
- `livekit_surface_health_snapshots`
- `livekit_operator_recovery_actions`
- `livekit_operator_learning_state`
- legitimate heartbeat monitor invocation
- scoped safe recovery audit

Forbidden:
- fake heartbeat
- stale cutoff loosening
- broad DB mutation
- marking unhealthy server active without host proof
- secret rotation
- TURN credential changes
- provider/server replacement
- Premium bypass
- R2/media writes
- auto-source OTA without policy gate

Required gates:
- narrow token
- constant-time token validation
- RLS/client-write deny
- audit every action
- safe recovery only
- learning cannot override Level 3/4 owner approval
- scheduler status must match actual installed systemd/GitHub/Cloudflare state

Required proofs/guards:
- `proof:livekit-autonomous-operator`
- `proof:livekit-surface-health`
- `proof:livekit-render-telemetry`
- `proof:livekit-operator-recovery-loop`
- `guard:livekit-autonomous-operator-policy`
- `guard:livekit-heartbeat-monitor-policy`
- `guard:watch-party-livekit-camera`

Level 4 LiveKit expansion example: secret rotation, TURN changes, server replacement, or provider replacement requires owner approval plus external provider confirmation.

### `money_flow_control`

Status: `scoped_write_capable_guarded`.

Activation modes:
- `off`
- `dry_run`
- `manual_cli`
- `limited_scheduled_probe`
- `limited_scheduled_if_approved`

Current activation: `limited_scheduled_probe`

Scheduler status: `chillywood-money-operator-watch-once.timer_every_10_minutes` on `chillywood-prod-01`. The timer is limited to `watch_once` provider reliability/status reporting, uses a narrow operator token, and cannot move money or mutate provider dashboards.

Allowed surfaces:
- `premium_revenue`
- `revenuecat_entitlements_readback`
- `google_play_receipts_readback`
- `revenuecat_webhook_delivery`
- `google_play_webhook_delivery`
- `stripe_connect_webhook_delivery`
- `stripe_merch_webhook_delivery`
- `provider_readiness_audit`
- `provider_delivery_error_rate`
- `stale_provider_dashboard_integration_detection`
- `duplicate_webhook_integration_detection`
- `provider_access_broker`
- `provider_dashboard_readback`
- `provider_test_delivery_status`
- `stripe_connect_foundation`
- `creator_payout_ledger`
- `payout_review_queue`
- `payout_batches`
- `provider_transfer_records`
- `network_billing`
- `sponsor_deals`
- `fraud_holds`
- `usage_metering`
- `refunds_disputes_future`
- `tax_compliance_future`

Allowed writes:
- `money_operator_events`
- `money_reconciliation_runs`
- `money_reconciliation_findings`
- `money_provider_sync_status`
- `money_duplicate_event_detections`
- `money_required_review_flags`
- `money_flow_health_snapshots`
- `money_operator_learning_state`
- record reconciliation findings
- mark provider sync stale/synced/failed
- mark duplicate provider/webhook event
- mark ledger/payout/revenue item `requires_review`
- record blocked action
- record external confirmation requirement
- write sandbox/test-mode proof result
- update learning state
- provider webhook reliability status/finding/report records
- provider delivery-history readback metadata
- provider delivery error-rate classification
- stale/duplicate provider dashboard integration detection
- provider access capability/status rows
- provider access audit events
- provider dashboard repair request rows
- autonomous approval request creation

Forbidden:
- fake MRR/ARR
- fake creator earnings
- fake payable balance
- fake paid status
- fake transfer complete
- manual Premium grant
- Premium entitlement edit outside provider proof
- real money movement without Level 4
- payout release without provider confirmation
- charging customers from foundation tables
- marking test-mode data as production
- provider secrets in logs/docs/artifacts

Required gates:
- owner/super-admin approval for Level 3
- owner/super-admin approval plus external provider confirmation for Level 4
- fresh preflight before execution
- exact scope match
- emergency stop blocks non-read-only money mutations
- provider readback before money movement closure
- provider access broker cannot print secrets or mutate dashboards without approval
- money operator narrow token
- money operator client write denial
- scoped write tables only
- no manual Premium grants
- no fake revenue/earnings/payable balances
- secret scan

Required proofs/guards:
- `proof:money-flow-control`
- `proof:money-operator-write-scope`
- `proof:money-external-confirmation`
- `proof:provider-webhook-reliability`
- `proof:money-provider-reliability-loop`
- `proof:provider-access-broker`
- `proof:provider-dashboard-access-policy`
- `guard:money-flow-control`
- `guard:provider-webhook-reliability`
- `guard:provider-access-broker`
- `proof:autonomous-approval-live-flow`
- `proof:autonomous-systems-contract`
- `guard:autonomous-systems-contract`
- `guard:autonomous-operating-model`

Read-only reconciliation and scoped safe reconciliation/status/review/audit writes can be autonomous. Real money mutation requires Level 3/4. Real money movement requires Level 4 owner approval plus external provider confirmation/readback. Rachi can recommend/request, not approve.

The scoped Money Operator may not mark payout paid, release payout, create transfer/payout, charge a customer, send invoices, create payment links, enable cashout, manually grant Premium, edit Premium entitlement outside provider-backed readback, create fake revenue/payable balance, clear a fraud hold as paid/settled, mutate auth/RLS, mutate provider products, or switch Stripe live mode.

Provider webhook reliability monitoring covers RevenueCat, Google Play, Stripe Connect, and Stripe merch/checkout. It may record webhook delivery status, delivery-history readback metadata, last success/failure, endpoint host/path, event type, integration id hash, error-rate classification, reconciliation findings, duplicate event detections, stale/duplicate dashboard integration detections, blocked actions, and dashboard repair approval requests. It cannot mutate provider dashboards without approval, cannot print secrets, cannot manually grant Premium, cannot move money, and cannot describe sandbox/test events as production readiness.

Error-rate classes are `healthy`, `degraded`, `critical`, `outage`, and `unknown`. A 100% provider webhook error rate must become failed/blocked provider sync status plus a reconciliation finding, and dashboard mutation must create a Level 3 approval request.

### `notification_delivery_operator`

Status: `scoped_write_capable_guarded`.

Current activation: `limited_scheduled_safe_recovery`.

Scheduler status: `chillywood-notification-operator-watch-once.timer_every_5_minutes` on `chillywood-prod-01`.

Allowed surfaces:
- `expo_push_delivery`
- `device_token_health`
- `notification_preferences_readback`
- `notification_delivery_attempts`
- `notification_retry_queue`
- `money_notification_delivery`
- `livekit_live_room_notifications`
- `chat_call_push_notifications`
- `creator_notification_delivery`

Allowed writes:
- `notification_operator_events`
- `notification_delivery_health_snapshots`
- `notification_delivery_attempts`
- `notification_provider_sync_status`
- `notification_required_review_flags`
- `notification_duplicate_dedupe_records`
- `user_push_tokens` disabled/revoked only after provider says `DeviceNotRegistered`
- autonomous approval requests
- `notification_operator_learning_state`

Forbidden:
- marketing blast sends
- bypass notification preferences
- owner/admin alert leakage to normal users
- money/payment claims without provider proof
- changing push provider credentials
- sending notifications as fake system events
- broad user messaging without approval

Broad campaigns or provider push configuration changes require Level 3 owner/super-admin approval.

### `release_ota_operator`

Status: `scoped_write_capable_guarded`.

Current activation: `limited_scheduled_probe`.

Scheduler status: `chillywood-release-operator-watch-once.timer_every_30_minutes` on `chillywood-prod-01`.

Allowed surfaces:
- `release_diagnostics`
- `eas_update_health`
- `runtime_channel_updateid_readback`
- `embedded_launch_detection`
- `emergency_launch_detection`
- `ota_rollout_health`
- `install_proof_status`
- `release_rollback_readiness`

Allowed writes:
- `release_operator_events`
- `release_health_snapshots`
- `ota_diagnostics_readback_records`
- `rollout_anomaly_findings`
- `release_required_review_flags`
- `release_approval_requests`
- `rollback_readiness_records`
- `release_operator_learning_state`

Forbidden:
- auto-publish production OTA without approval
- auto-rollback production OTA without approval
- submit Play/App Store release
- change runtimeVersion policy
- change public release track
- change store listing
- hide emergency launch
- fake installed proof

Production OTA publish, rollback, or store release mutation requires Level 4 owner/super-admin approval and fresh release preflight.

### `security_owner_operator`

Status: `scoped_write_capable_guarded`.

Current activation: `limited_scheduled_probe`.

Scheduler status: `chillywood-security-owner-operator-watch-once.timer_every_15_minutes` on `chillywood-prod-01`.

Allowed surfaces:
- `owner_super_admin_role_integrity`
- `platform_role_memberships_readback`
- `rachi_operator_self_approval_prevention`
- `autonomous_approval_integrity`
- `admin_route_exposure`
- `secret_scan_health`
- `rls_policy_health_readonly`
- `security_incident_flags`
- `emergency_pause_requests`

Allowed writes:
- `security_operator_events`
- `security_health_snapshots`
- `security_required_review_flags`
- `owner_authority_integrity_findings`
- `approval_integrity_findings`
- `secret_scan_findings`
- autonomous approval requests
- emergency pause request records
- `security_operator_learning_state`

Forbidden:
- assign/revoke owner role autonomously
- mutate auth/RLS autonomously
- rotate secrets without approval
- ban/suspend users directly
- expose owner controls to non-owner
- let Rachi/operator approve themselves
- delete audit rows
- broad system shutdown without approval except existing approved emergency-stop path

Owner-role, auth/RLS, and secret-rotation work requires Level 4 owner/super-admin approval. Rachi can request/recommend, not approve.

### `moderation_safety_operator`

Status: `scoped_write_capable_guarded`.

Current activation: `limited_scheduled_probe`.

Scheduler status: `chillywood-moderation-safety-operator-watch-once.timer_every_10_minutes` on `chillywood-prod-01`.

Allowed surfaces:
- `moderation_queue_health`
- `user_report_backlog`
- `stale_case_detection`
- `duplicate_report_detection`
- `content_safety_review_flags`
- `fraud_hold_recommendations`
- `creator_upload_review_flags`
- `live_room_safety_review_flags`

Allowed writes:
- `moderation_operator_events`
- `moderation_health_snapshots`
- `moderation_required_review_flags`
- `moderation_duplicate_report_detections`
- `moderation_case_priority_flags`
- `moderation_stale_case_findings`
- `safety_review_recommendations`
- autonomous approval requests
- `moderation_operator_learning_state`

Forbidden:
- permanent ban/suspend/restrict without approval
- delete content without approval
- disable uploads/live/account without approval
- enforce fraud holds without approval
- change user rights automatically
- public/private exposure changes
- moderation action without audit
- hidden enforcement with no appeal/review trail

Account rights changes, bans, restrictions, content deletion, upload/live/account disablement, and fraud-hold enforcement require owner/staff approval through the autonomous approval path.

### `observability_runtime_operator`

Status: `scoped_write_capable_guarded`.

Current activation: `limited_scheduled_probe`.

Scheduler status: `chillywood-observability-operator-watch-once.timer_every_10_minutes` on `chillywood-prod-01`. The timer is limited to `watch_once` health/finding/audit writes and cannot publish or roll back OTA, mutate Remote Config, delete crash evidence, or silence crash reporting.

Allowed surfaces:
- `crashlytics_crash_health`
- `native_crash_clusters`
- `js_error_clusters`
- `anr_runtime_findings`
- `app_startup_performance`
- `screen_render_performance`
- `network_error_rate`
- `edge_function_error_rate`
- `backend_error_rate_findings`
- `analytics_delivery_health`
- `firebase_performance_health`
- `release_diagnostics_health`
- `ota_updateid_runtime_channel_mismatch`
- `embedded_launch_detection`
- `emergency_launch_detection`
- `cross_system_incident_correlation`

Allowed writes:
- `observability_operator_events`
- `runtime_health_snapshots`
- `crash_cluster_findings`
- `js_error_findings`
- `performance_regression_findings`
- `analytics_delivery_findings`
- `release_health_findings`
- `backend_error_rate_findings`
- `observability_required_review_flags`
- `observability_operator_learning_state`
- autonomous approval requests

Forbidden:
- delete crash evidence
- silence crash reporting
- collect extra PII without approval
- log secrets/tokens
- publish OTA
- rollback OTA
- change Remote Config/feature flags without approval
- hide emergency launch
- fake installed proof
- mutate auth/RLS
- move money
- grant Premium
- change provider config
- change LiveKit routing
- change R2/media behavior

Crash/error, performance, analytics-delivery, release-diagnostics, and backend error-rate findings can be written as scoped status/review/audit rows only. Remote Config or feature flag mutation requires Level 3 owner/super-admin approval. Production OTA publish or rollback requires Level 4 owner/super-admin approval and fresh release preflight. Crash evidence deletion and crash-reporting suppression are forbidden.

### `installed_product_qa_operator`

Status: `scoped_write_capable_guarded`.

Current activation: `manual_cli`.

Scheduler status: `device_lab_scheduler_pending`. The scheduler is not active; scheduler pending until device-lab path exists.

Allowed surfaces:
- `installed_route_traversal`
- `installed_role_traversal`
- `installed_button_tap_contracts`
- `premium_nonpremium_gates`
- `admin_operator_moderator_visibility`
- `account_fixture_health`
- `device_availability`
- `device_lab_readiness`
- `firebase_test_lab_cost_capped_readiness`
- `two_device_realtime_proof`
- `release_diagnostics_updateid_check`
- `route_contract_marker_check`
- `installed_proof_blocker_tracking`

Allowed writes:
- `installed_qa_operator_events`
- `installed_traversal_runs`
- `route_behavior_findings`
- `role_behavior_findings`
- `account_fixture_health_findings`
- `device_availability_findings`
- `qa_required_review_flags`
- `qa_operator_learning_state`
- owner-command requests
- autonomous approval requests

Forbidden:
- fake installed proof
- manual Premium grant
- direct entitlement edit
- role mutation
- auth/RLS mutation
- money movement
- content/user enforcement
- sideload/install/clear data without approval
- private evidence exposure
- claiming two-device proof without proof
- silent pass on route mismatch
- provider mutation
- release mutation without approval
- Premium bypass
- broad app-control power

`installed_product_qa_operator` records installed-app route, role, account-fixture, and device-readiness blockers proactively. Codex caught the current installed traversal blockers manually; this operator now turns that category into first-class QA findings and owner-command requests. Live deployment is active as of 2026-07-13: `installed-product-qa-operator` is token-gated, current OTA `019f596f-1a87-76d8-abe3-14342c8d1cf6` was proved on Play-installed `R5CR120QCBF`, and `watch_once` recorded the current blockers with `source=play_installed` / `discovered_by=autonomous_operator`. Scheduler remains pending because the production host has no stable Play-installed device/device-lab path. Premium fixture repair is provider-backed only, and two-device proof requires two Play-installed devices or approved device lab.

Firebase Test Lab is the first device-lab foundation path in cost-capped cheap mode. The source runner records only `firebase_test_lab_uploaded_artifact` proof and must not call it Play-installed proof. It defaults to virtual-device-only, manual/on-demand or daily/on-change when approved, `FIREBASE_TEST_LAB_MONTHLY_CAP_USD=5`, `FIREBASE_TEST_LAB_PER_RUN_CAP_USD=0.25`, `FIREBASE_TEST_LAB_MAX_SCHEDULED_RUNS_PER_DAY=1`, physical disabled, broad crawls disabled, and two-device Firebase disabled. Unknown free quota can run only when worst-case virtual-device cost is bounded under the per-run cap and monthly remaining budget; unbounded cost still fails closed. One owner-command Tier 1 virtual smoke completed as Firebase matrix `4612242345700782646` with worst-case `costEstimateUsd=0.09`, `billingRisk=low`, and local ledger write. Firebase smoke does not close Premium/RevenueCat/Google Play Billing or two-device LiveKit proof. The owner Mac is not the long-term runner. The target long-term runner is `chillywood-prod-01` through the source-controlled daily systemd templates in `ops/installed-product-qa-operator/systemd/`. Server audit found the root-owned env file, `/opt/chillywood/current` checkout, Node `24.18.0`, npm `11.16.0`, Google Cloud SDK `575.0.1`, and `firebase-tools@15.23.0` present with no secrets printed. Owner-authorized Google Console provisioning created dedicated runtime service account `installed-qa-testlab-runner@chillywood-app.iam.gserviceaccount.com`; its key is stored only on the server as `root:root` mode `600`, and server gcloud can read the Test Lab virtual catalog. A current-source APK for commit `4061e2bda8c77dad174b72378db483acb6e906fe` is present on the server with SHA-256 `6bcddf44e9d320d152742537339f3204a7295cd7868554b34146f82c81528b44`, and the server cost guard passes at `costEstimateUsd=0.09`. No Firebase scheduler is claimed active: the bounded matrix cannot upload because the Firebase Test Lab auto bucket denies `storage.objects.create` to the runner, the owner account cannot edit that auto bucket IAM policy, and Google documents the default gcloud bucket path as requiring project Editor unless an owned `--results-bucket` is used. The owner-approved owned results-bucket attempt failed because project billing is absent. `schedulerStatus=device_lab_scheduler_pending` remains until billing/bucket setup is complete, a bounded matrix succeeds, and a daily cost-capped timer is installed, enabled, fired, and audited on the server.

### `platform_recovery_operator`

Status: `scoped_write_capable_guarded`.

Current activation: `limited_scheduled_probe`.

Scheduler status: `chillywood-platform-recovery-operator-watch-once.timer_every_30_minutes`. The hardened host path is active on `chillywood-prod-01`: `chillywood-platform-recovery-operator-watch-once.timer` is enabled/active, runs `watch_once` every thirty minutes with 60-second jitter, reads only `/etc/chillywood/platform-recovery-operator.env`, and writes `scheduler=systemd_timer` audit rows with `money_moved=false` and `user_rights_changed=false`.

Allowed surfaces:
- database backup freshness
- restore drill freshness
- critical table backup coverage
- migration drift detection
- Supabase function deployment drift
- scheduled timer health
- operator/provider secret presence by name only
- R2 backup export health
- audit log integrity
- emergency state readback
- cross-system recovery readiness

Allowed writes:
- `platform_recovery_operator_events`
- `backup_health_snapshots`
- `restore_drill_findings`
- `migration_drift_findings`
- `function_deployment_drift_findings`
- `scheduled_timer_health_findings`
- `recovery_required_review_flags`
- `recovery_operator_learning_state`
- owner-command requests
- autonomous approval requests

Forbidden:
- production restore without approval
- destructive DB mutation
- secret rotation without approval
- deleting backups
- deleting production data
- changing provider config
- changing R2/media behavior
- service-role key in scheduler
- fake backup/restore success

`platform_recovery_operator` writes recovery status and findings only. It can create an owner-command or approval request for high-risk recovery, but it cannot run production restore, destructive mutation, secret rotation, backup deletion, provider mutation, or fake recovery success.

### `privacy_compliance_operator`

Status: `scoped_write_capable_guarded`.

Current activation: `limited_scheduled_probe`.

Scheduler status: `chillywood-privacy-compliance-operator-watch-once.timer_every_6_hours`. The hardened host path is active on `chillywood-prod-01`: `chillywood-privacy-compliance-operator-watch-once.timer` is enabled/active, runs `watch_once` every six hours with 120-second jitter, reads only `/etc/chillywood/privacy-compliance-operator.env`, and writes `scheduler=systemd_timer` audit rows with `money_moved=false` and `user_rights_changed=false`.

Allowed surfaces:
- privacy request intake
- account data export planning
- account deletion planning
- legal hold readback
- data retention policy readback
- PII exposure findings
- data safety disclosure findings
- evidence retention status
- privacy request status
- redacted export package planning

Allowed writes:
- `privacy_operator_events`
- `privacy_request_findings`
- `privacy_export_plans`
- `privacy_deletion_plans`
- `privacy_required_review_flags`
- `pii_exposure_findings`
- `retention_hold_findings`
- `privacy_operator_learning_state`
- owner-command requests
- autonomous approval requests

Forbidden:
- deleting account/data without approved flow
- exporting raw private data without owner/legal-approved flow
- bypassing legal hold
- deleting audit/evidence records
- exposing PII/secrets
- changing auth/RLS
- changing billing/money
- hidden deletion
- fake compliance closure

`privacy_compliance_operator` is planning/status only. It can record request findings, legal-hold/retention blockers, and redacted export/deletion plans. It cannot perform real export/deletion, bypass legal hold, expose PII, or claim compliance closure without approved fulfillment proof.

### `support_success_operator`

Status: `scoped_write_capable_guarded`.

Current activation: `limited_scheduled_probe`.

Scheduler status: `chillywood-support-success-operator-watch-once.timer_every_30_minutes`. The hardened host path is active on `chillywood-prod-01`: `chillywood-support-success-operator-watch-once.timer` is enabled/active, runs `watch_once` every thirty minutes with 60-second jitter, reads only `/etc/chillywood/support-success-operator.env`, and writes `scheduler=systemd_timer` audit rows with `money_moved=false` and `user_rights_changed=false`.

Allowed surfaces:
- support inbox health
- stale support ticket detection
- user issue triage
- account access support flags
- refund request classification
- Premium support readback
- payment support readback
- support response drafts
- escalation to owner/admin
- support SLA findings

Allowed writes:
- `support_operator_events`
- `support_health_snapshots`
- `support_ticket_findings`
- `support_required_review_flags`
- `support_response_drafts`
- `support_escalation_records`
- `support_operator_learning_state`
- owner-command requests
- autonomous approval requests

Forbidden:
- issuing refunds
- granting Premium
- changing entitlements
- moving money
- changing auth/RLS
- resetting credentials without approved flow
- banning/restricting users
- sending legal/payment commitments
- exposing private evidence
- sending external messages without approval unless template-backed and safe

`support_success_operator` records queue health, stale-ticket findings, draft responses, and owner/admin escalations. It cannot issue refunds, grant Premium, mutate auth/entitlements, reset credentials, send payment/legal commitments, or enforce account restrictions.

### `search_ranking_integrity_operator`

Status: `scoped_write_capable_guarded`.

Current activation: `limited_scheduled_probe`.

Scheduler status: `chillywood-search-ranking-integrity-operator-watch-once.timer_every_30_minutes`. The hardened host path is active on `chillywood-prod-01`: `chillywood-search-ranking-integrity-operator-watch-once.timer` is enabled/active, runs `watch_once` every thirty minutes with 60-second jitter, reads only `/etc/chillywood/search-ranking-integrity-operator.env`, and writes `scheduler=systemd_timer` audit rows with `money_moved=false` and `user_rights_changed=false`.

Allowed surfaces:
- search health
- ranking integrity findings
- recommendation quality findings
- creator visibility anomalies
- content visibility anomalies
- spam pattern findings
- index freshness
- search latency findings
- ranking experiment readback
- discovery safety findings

Allowed writes:
- `search_operator_events`
- `search_health_snapshots`
- `ranking_integrity_findings`
- `recommendation_quality_findings`
- `visibility_anomaly_findings`
- `search_required_review_flags`
- `search_operator_learning_state`
- owner-command requests
- autonomous approval requests

Forbidden:
- hidden shadowban
- secret demotion/boost
- moderation enforcement
- changing ranking algorithm without approval
- changing public/private exposure
- manipulating creator visibility without audit
- deleting content
- mutating auth/RLS
- moving money
- exposing private data

`search_ranking_integrity_operator` records search/ranking health and integrity findings only. It cannot mutate ranking behavior, run hidden enforcement, secretly boost/demote creators, change content exposure, delete content, or enforce moderation.

### `ads_sponsor_delivery_operator`

Status: `foundation_only_guarded`.

Current activation: `off`.

Scheduler status: `no_scheduler_foundation_only`.

Allowed surfaces:
- ad provider readiness
- sponsor deal readiness
- sponsor checkout readiness
- ad inventory readiness
- brand safety readiness
- sponsor reporting readiness
- ad revenue future scope
- sponsor payout future scope

Allowed writes: owner-command requests for future approval planning only. No live ad/sponsor write tables are active.

Forbidden:
- serving ads
- initializing ad SDK live behavior
- sponsor checkout
- sponsor upload/approval
- sponsor payout split
- ad revenue claim
- fake sponsor revenue
- fake ad impressions
- changing ad provider config
- child/unsafe context ad serving
- CTV inventory claim
- live billing/payout

`ads_sponsor_delivery_operator` is foundation-only. It has no Edge Function, no scheduler, no live writes, no ad serving, no sponsor checkout, no revenue claim, and no payout behavior. Future activation requires Owner Command, Level 3/4 approval where applicable, provider/business/billing readiness, and fresh proof.

## Expansion Contract

Any new autonomous system, surface, action, scheduler, write path, or recovery action must add an explicit registry entry with:

- system id
- action/surface id
- activation mode
- allowed read scope
- allowed write scope
- forbidden scope
- approval level
- proof script
- guard script
- rollback/quarantine behavior
- kill switch/fallback behavior
- owner/admin approval requirement for Level 3/4

High-risk domains may not be listed as Level 0/1/2:

- auth/RLS
- billing/provider
- Premium entitlement
- payout/cashout
- destructive DB
- public/private exposure
- app store/public release
- provider plan/add-on

## Owner/Admin Approval Path

Level 3/4 actions create `autonomous_approval_requests` and immutable request events through trusted service/operator authority only. Client writes are denied by default. The request must include a risk summary, proposed action, allowed write scope, forbidden scope, rollback plan, kill switch plan, proof plan, validation plan, expiration, and redacted metadata.

Approval execution is live through `platform_role_memberships` owner/super-admin authority and the canonical `/admin` command center. Trusted operator markers use `AUTONOMOUS_APPROVAL_REQUEST_TOKEN_SHA256` when configured or the existing server-side `OPS_APPROVAL_TOKEN` fallback; neither secret is client-bundled or printed. Rachi may request or recommend, but Rachi cannot approve itself and never outranks the owner. Autonomous operators cannot approve their own Level 3/4 requests. Approved requests expire, and approval does not execute automatically: the operator must re-run fresh preflight, match the approved system/action/write scope exactly, verify no emergency stop is active, and write execution audit before closure.

Owner/super-admin review is bounded to the approval framework. It does not create manual Premium toggles, provider billing controls, payout/cashout controls, broad auth/RLS mutation, R2/media behavior changes, LiveKit routing-policy changes, or destructive DB authority. Those remain governed by their registry approval level and external confirmation requirements.

Do not deploy a new scheduler, daemon, worker, broad DB mutation path, public/private exposure change, payment/provider change, or secret rotation from this registry without the required approval path.

## Owner Command Operator

`owner_command_operator` is now a protected scoped command-routing control plane in the autonomous systems registry. It is an orchestration layer, not a replacement for owner judgment and not a broad autonomous system. It accepts owner/super-admin-backed commands, classifies intent and risk, maps each command to the existing active autonomous systems, builds exact preflight/execution/rollback/proof plans, writes `owner_command_*` audit rows, and returns exact blockers when execution is impossible.

Status: `scoped_command_router_guarded`.

Current activation: `manual_cli`.

Scheduler status: `no_scheduler_no_daemon_no_worker_manual_or_owner_invoked_only`.

Allowed writes are limited to `owner_command_requests`, `owner_command_events`, `owner_command_execution_steps`, `owner_command_blockers`, autonomous approval-request creation, and target-operator safe report/audit invocation. It cannot directly mutate target-domain tables outside the routed operator.

It may execute only safe Level 0/1/2 report or scoped audit work. Level 3/4 commands create `autonomous_approval_requests` and stop. Approved Level 3/4 commands still require fresh preflight, exact scope match, active emergency state, target operator proof, and Level 4 external confirmation where applicable. Rachi can recommend/request draft work but cannot approve owner commands, and operators cannot approve their own requested work.

Owner commands route through:

- `media_automation` for media scan/transcode/readiness/R2 audit decisions
- `livekit_operator` for LiveKit routing/token/heartbeat/render health decisions
- `money_flow_control` for RevenueCat, Google Play, Stripe, provider, reconciliation, and ledger decisions
- `notification_delivery_operator` for push delivery/token cleanup decisions
- `release_ota_operator` for OTA/runtime/updateId/release proof decisions
- `security_owner_operator` for owner/admin authority, RLS/security, Rachi, and approval-integrity decisions
- `moderation_safety_operator` for report/case/review/enforcement-request decisions
- `observability_runtime_operator` for crash, performance, analytics, runtime, and backend error-rate decisions
- `installed_product_qa_operator` for installed app QA, route markers, account fixtures, device lab readiness, and two-device proof blockers
- `platform_recovery_operator` for backup/restore readiness, migration drift, function deployment drift, timer health, and recovery blockers
- `privacy_compliance_operator` for privacy request intake, export/deletion planning, legal hold, retention, and PII exposure findings
- `support_success_operator` for support queue health, stale tickets, account help, refund classification, drafts, and escalations
- `search_ranking_integrity_operator` for search/ranking health, recommendation quality, visibility anomalies, spam patterns, and index freshness
- `ads_sponsor_delivery_operator` for ads/sponsor foundation readiness planning only; it cannot execute ad/sponsor delivery

Forbidden owner-command bypasses include direct broad DB mutation, money movement without Level 4 plus external confirmation, manual Premium grants, Premium bypass, OTA publish/rollback without approval, auth/RLS/owner-role mutation without approval, ban/restrict/delete without approval, private/Premium/original media exposure, provider product/mode changes, LiveKit routing-policy changes, R2/media behavior changes, secret output, stale preflight, scope expansion, and emergency-stop bypass.
