# Chi'llywood Autonomous Systems Scope Registry

Last updated: 2026-07-12

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
- `limited_scheduled_if_approved`

Current activation: `manual_cli`

Scheduler status: no money movement scheduler enabled; safe operator function is token-gated and limited to reconciliation/status/review/audit writes.

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
