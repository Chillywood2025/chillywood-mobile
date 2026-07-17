# Chi'llywood Autonomous App Operating Model

Last updated: 2026-07-16

Status: governing policy for future Codex/operator work. Chi'llywood should operate autonomously by default inside approved safety policy, with owner approval reserved for high-risk boundary changes.

## 1. Autonomy Principle

Chi'llywood is autonomous by default as an app platform. Codex and platform operators should detect, plan, preflight, dry-run, execute, audit, rollback or quarantine, and report safe work without asking the owner for every ordinary operation.

owner approval is required only for high-risk boundary changes: money, paid provider or billing mutations, public exposure changes, destructive production changes, auth/RLS policy changes, Premium entitlement changes, payouts/cashout, legal/compliance policy, public release, public marketing claims, or anything that materially changes user rights, privacy, money movement, or public reach.

If a task is safely inside an already approved policy, use the operator pattern and continue. If a task crosses a high-risk boundary, stop and request approval with the proposed scope, risk, rollback, and proof plan.

## 1A. Autonomous Systems Contract

Chi'llywood autonomous systems are protected by registry/contract guard. The source registry is `_lib/autonomousSystemsRegistry.ts` and the operator-facing mirror is `docs/AUTONOMOUS_SYSTEMS_SCOPE_REGISTRY.md`.

Current approved systems:

- `media_automation`
- `livekit_operator`
- `money_flow_control`
- `notification_delivery_operator`
- `release_ota_operator`
- `security_owner_operator`
- `moderation_safety_operator`
- `observability_runtime_operator`
- `installed_product_qa_operator`
- `platform_recovery_operator`
- `privacy_compliance_operator`
- `support_success_operator`
- `search_ranking_integrity_operator`
- `ads_sponsor_delivery_operator` foundation-only

Component ownership is machine-enforced by `config/autonomy/autonomous-components.json`. A component is exactly one of `top_level_system`, `registered_surface`, `protected_control_plane`, `non_autonomous_utility`, or `foundation_only_off`. Scheduled host units, database cron workers, scheduled workflows, Cloudflare scheduler templates, long-running queue consumers, and operator-like Edge Functions must appear in that inventory. New behavior attaches to an existing owner when its authority already exists; a technical worker is not automatically a new top-level system.

Platform-aware `watch_once` is compositional: shared, Android, and iOS probes run independently. Each returns platform, readback completeness, health, source, data window, reasons, and immutable safety booleans. A missing required platform or provider is blocked/unknown and prevents an overall healthy result. Expected identity and observed identity are separate contracts.

`notification_delivery_operator`, `release_ota_operator`, `security_owner_operator`, and `moderation_safety_operator` are now scoped-write capable guarded systems with limited scheduled `watch_once` loops on `chillywood-prod-01`. Notification runs every five minutes in `limited_scheduled_safe_recovery` mode for strictly safe provider-evidenced cleanup; release runs every thirty minutes, security-owner every fifteen minutes, and moderation-safety every ten minutes in `limited_scheduled_probe` mode. They may write only safe status, review, finding, audit, duplicate-detection, learning, and autonomous approval-request records inside their registered tables. Every scheduled run includes `scheduler=systemd_timer`, the specific operator id, and a host source in audit metadata. They cannot publish releases, roll back releases, mutate owner roles, mutate auth/RLS, rotate secrets, send broad push campaigns, bypass notification preferences, ban/restrict users, delete content, change user rights, move money, grant Premium, or change provider products without the registered Level 3/4 approval path.

`observability_runtime_operator` is a separate scoped-write capable guarded system for crash, native/JS error clusters, ANR-style runtime findings where available, startup/render/network performance regressions, analytics delivery health, Firebase Crashlytics/Analytics/Performance status, release diagnostics, OTA/runtime/updateId mismatches, embedded/emergency launch findings, backend/Edge Function error-rate summaries, and cross-system incident correlation. Its current activation is `limited_scheduled_probe` through `chillywood-observability-operator-watch-once.timer` every ten minutes. It may write only redacted health, finding, review, audit, learning, and autonomous approval-request records. It cannot delete crash evidence, silence crash reporting, collect extra PII, log secrets/tokens, publish or roll back OTA, mutate Remote Config/feature flags, mutate provider analytics config, hide emergency launch, fake installed proof, mutate auth/RLS, move money, grant Premium, change LiveKit routing, or change R2/media behavior without the registered approval path. Remote Config, feature flag, and provider analytics config mutation require Level 3 owner/super-admin approval; production release publish/rollback requires Level 4 approval and fresh release preflight.

`installed_product_qa_operator` is a scoped-write capable guarded system for proactive installed-app route traversal, role/account UI checks, account fixture health, device/device-lab readiness, release diagnostics updateId checks, route-contract marker checks, Premium/non-Premium gate checks, moderator boundary findings, and two-device realtime proof prerequisites. Codex caught the current installed traversal blockers manually; the autonomous system did not catch them before because this operator did not exist. Its current activation is `limited_scheduled_probe`, with `schedulerStatus=chillywood-installed-qa-firebase-smoke.timer_daily_cost_capped`; the exact Firebase results-bucket bootstrap is bounded Level 2 and complete, and the daily Firebase uploaded-artifact smoke timer is active on `chillywood-prod-01`. Firebase uploaded-artifact smoke is not Play-installed, Premium Billing, or two-device LiveKit proof. It may write only sanitized installed QA events, traversal runs, route/role/account/device findings, required-review flags, learning state, Owner Command requests, and autonomous approval requests. It cannot fake installed proof, manually grant Premium, directly edit entitlements, mutate roles/auth/RLS, move money, enforce moderation, sideload/install/clear data, expose private evidence, claim two-device closure without two devices or approved device lab, or silently pass route mismatches.

`platform_recovery_operator`, `privacy_compliance_operator`, `support_success_operator`, and `search_ranking_integrity_operator` are scoped-write capable guarded systems with token-gated Edge Functions, migrations/RLS/client-write denial, CLI watch/status/report entry points, proof/guard scripts, canonical `/admin` read-only status sections, and live hardened host timers on `chillywood-prod-01`. Their current activation is `limited_scheduled_probe`: platform recovery runs `chillywood-platform-recovery-operator-watch-once.timer` every thirty minutes, privacy compliance runs `chillywood-privacy-compliance-operator-watch-once.timer` every six hours, support success runs `chillywood-support-success-operator-watch-once.timer` every thirty minutes, and search/ranking integrity runs `chillywood-search-ranking-integrity-operator-watch-once.timer` every thirty minutes. The timers call only `watch_once`, read only root-owned narrow token env files under `/etc/chillywood`, use no service-role key, and have fired audited rows with `scheduler=systemd_timer`, exact `operator_id`, `money_moved=false`, and `user_rights_changed=false`. They may write only safe status, finding, planning, draft, review, escalation, learning, Owner Command, or autonomous approval-request rows. They cannot restore production, delete data, rotate secrets, fulfill raw privacy export/deletion, issue refunds, grant Premium, reset credentials, send legal/payment commitments, shadowban, secretly demote/boost, change ranking/public exposure, enforce moderation, mutate auth/RLS, move money, or claim any future scheduler/status expansion without proof.

`ads_sponsor_delivery_operator` is foundation-only guarded. Its activation is `off`, scheduler status is `no_scheduler_foundation_only`, and it has no Edge Function, no scheduler, and no live write tables. It exists to prevent accidental ad/sponsor activation and to route future readiness planning through Owner Command. It cannot serve ads, initialize live ad SDK behavior, create sponsor checkout, approve sponsor uploads, split sponsor payouts, claim ad/sponsor revenue, fake impressions, change ad provider config, claim CTV inventory, or run live billing/payout.

Future scope can be added only through registry entries that define system id, action/surface id, activation mode, allowed read scope, allowed write scope, forbidden scope, approval level, proof script, guard script, rollback/quarantine behavior, kill switch/fallback behavior, and owner/admin approval requirement for Level 3/4.

Level 3/4 actions create owner/admin approval requests before execution. The approval backing status is live through `platform_role_memberships` owner/super-admin authority, `/admin` review, `autonomous-approval-request`, approval/denial RPCs, audited request events, emergency-state checks, and trusted-operator preflight/execution markers. Trusted operator request/preflight/execution markers use `AUTONOMOUS_APPROVAL_REQUEST_TOKEN_SHA256` when configured or the existing server-side `OPS_APPROVAL_TOKEN` fallback; neither token is client-bundled. Rachi can recommend/request but cannot approve itself, autonomous operators cannot self-approve, and owner authority remains above Rachi/operator. Approval never executes by itself: the operator must re-run fresh preflight, match the approved system/action/write scope exactly, verify the request is unexpired, and verify no emergency stop is active.

## 2. Operator Pattern

Every autonomous lane follows the same operating pattern:

1. Detect: identify eligible work and classify risk.
2. Plan: build a scoped plan with caps, expected outputs, audit checks, and rollback scope.
3. Preflight: verify config, backup gate, permissions, public/private boundaries, and kill switches.
4. Dry-run: prove the exact intended work without writes when practical.
5. Execute: run only inside the approved policy/caps.
6. Audit: re-read outputs, rows, public exposure, telemetry, and safety invariants.
7. Rollback/quarantine: automatically quarantine failed batches and keep rollback scoped.
8. Report: summarize what changed, what was skipped, what was blocked, and what remains safe.

## 3. Approval Levels

### Level 0: Fully Autonomous

Safe, reversible, policy-covered operations that do not change money, auth/RLS, billing/provider settings, payouts, public/private exposure, public launch state, or destructive production data may proceed without owner approval.

### Level 1: Autonomous With Reporting

Safe operations that are routine but useful to summarize should proceed automatically and report results after completion.

### Level 2: Autonomous With Emergency Stop

Higher-volume or repeated safe operations may proceed when kill switch, fallback, audit, rollback, quarantine, and caps are active. Emergency stop always wins.

### Level 3: Owner Approval Required

High-risk application or infrastructure boundary changes require explicit owner approval before execution.

### Level 4: Owner Approval Plus External Confirmation

Actions that also depend on store, provider, legal, payment, or compliance systems require owner approval and external confirmation/readback before they are considered closed.

## 4. Level 0 Examples

These do not require owner approval when they stay inside existing safety policy:

- eligible media discovery
- safe batch sizing
- scoped media-worker logical backups to private R2
- restore drills in disposable databases
- transcode public-safe media inside existing caps
- post-write audit of scoped worker rows
- scoped rollback plans and scoped rollback execution for known worker batches
- fallback playback decisions
- proof-only and source-only telemetry shaping
- read-only status checks
- proof scripts and guard scripts that do not mutate production

## 5. Level 1 Examples

These should run autonomously and report:

- batch completion reports
- cost/cache summaries
- failure summaries
- skipped-candidate summaries
- backup freshness summaries
- restore-drill summaries
- rollout planner summaries

## 6. Level 2 Examples

These can run autonomously only with emergency stop, audit, rollback, fallback, and caps:

- batch automation with kill switch
- worker auto-pause on anomaly
- cache/fallback automation
- repeated public-safe media transcode batches inside configured caps
- automatic quarantine on audit failure
- automatic fallback to signed origin when CDN eligibility fails
- one bounded `continuous_limited` loop iteration when backup, restore-drill, audit, rollback, telemetry, cap, kill-switch, and emergency-stop gates pass
- scoped LiveKit health recovery when host proof and routing state allow it: legitimate heartbeat monitor execution, heartbeat monitor service/timer recovery, capacity counter refresh through the monitor path, affected-surface pause/reporting, and operator audit/learning writes

## 7. Level 3 Owner Approval Examples

These require owner approval before execution:

- paid provider or billing changes
- RLS/auth changes
- payout or cashout changes
- Premium entitlement changes
- production checkout, payment link, invoice, transfer, payout, cashout, or live provider setup changes
- destructive migrations or destructive production DB operations
- broad catalog backfill
- public/private exposure changes
- public bucket/domain exposure changes
- changing CDN access for private, Premium, original/master, unscanned, or moderation-blocked media
- deploying a long-running production worker, daemon, cron, or scheduler, except the approved narrow LiveKit reliability loop described in Section 10
- enabling continuous worker automation beyond the approved caps
- broad uncapped media backfill, cap increases above the hard limit, or destructive cleanup
- LiveKit API key or TURN credential rotation
- LiveKit routing policy or stale-heartbeat cutoff changes beyond approved bounds
- LiveKit provider/server replacement, host rebuild, or broad infrastructure change
- destructive LiveKit registry cleanup or deleting LiveKit records

## 8. Level 4 Examples

These require owner approval plus external confirmation:

- app store public release
- legal/compliance policy changes
- payment production mutation
- real customer charge, real payout, real transfer, or real cashout
- public marketing claims
- production payment/provider launch
- provider plan upgrades or paid add-ons
- public store listing or release-track changes

## 9. Media Worker Policy

Public-safe audited videos can be processed automatically inside caps after backup, scan, moderation, output-prefix, audit, rollback, fallback, and telemetry gates pass.

Private, Premium, original/master, unscanned, moderation-blocked, unsupported, missing-source, or explicitly denied media always stop. They must not be uploaded to public playback, exposed through public CDN, marked resolver-ready, or used for fallback removal.

Batch size can grow automatically after clean runs, but only inside configured caps and with emergency stop, rollback, audit, fallback, and reporting active. Broad catalog backfill remains Level 3 until separately approved.

Rollback/quarantine must be automatic for failed audits or anomaly detection. Resolver trust must require audit pass.

Queue processing is autonomous only as a bounded, lease-based, capped operation. The processor must require backup gate, kill switch, max concurrency, retry cap, dead-letter/quarantine, audit before resolver trust, and exact rollback scope. It must pause on audit failure, unsafe CDN rows, stale backup/restore drill, active unfinished jobs over threshold, private/Premium/original candidate detection, output/cache validation failure, or high error rate.

Scheduler/daemon activation is not an ordinary Level 0 action. Disabled templates may exist and be source/proofed autonomously, but enabling a long-running production daemon, cron, scheduler, or GitHub Actions schedule crosses the deployment boundary and requires the relevant Level 3 approval unless a future policy explicitly classifies a bounded limited scheduler as safe.

## 10. LiveKit Operator Policy

LiveKit health work is autonomous only inside the scoped operator model. The operator may monitor routed LiveKit surfaces, classify router/token/heartbeat/host/render health, ingest sanitized app render/token telemetry, run legitimate heartbeat or counter refresh paths, record audit/recovery events, and maintain learning-state confidence from repeated incidents. Manual `watch_once` operation is enabled through the deployed token-gated operator, and the approved continuous path is the hardened `chillywood-prod-01` systemd timer `chillywood-livekit-operator-watch-once.timer`, which calls `watch_once` every five minutes with a narrow operator token, no service-role key, systemd privilege restrictions, and no LiveKit routing-policy mutation authority. A GitHub Actions loop may also be installed later only as the narrow `livekit-operator-reliability-loop.yml` pattern once workflow-file permission is available; the Cloudflare Cron Worker template remains blocked until the account has a Workers subdomain and the cron is proved. Safe recovery requires an explicit secret gate and remains limited to Level 1/2 actions such as legitimate heartbeat monitor/counter refresh paths and audited operator learning writes. It must not write fake heartbeats, loosen stale heartbeat cutoffs, mark unhealthy servers healthy, log tokens/secrets, mutate non-LiveKit tables, bypass Premium gates, auto-publish source OTA from telemetry, or claim a surface closed while `livekit-token` still returns `no_eligible_livekit_server`.

Owner approval remains required for LiveKit secret rotation, TURN changes, routing threshold/policy expansion, provider/server replacement, destructive DB changes, and broad infrastructure changes.

## 10A. Money Flow Control Policy

Money and ledger work is autonomous only inside the `money_flow_control` model. Read-only reconciliation can be autonomous when it stays limited to provider readiness labels, ledger consistency checks, stale sync detection, duplicate event detection, missing-provider-data reports, risk summaries, and approval request creation. The scoped Money Operator can also write only safe reconciliation/status/review/audit records: `money_operator_events`, `money_reconciliation_runs`, `money_reconciliation_findings`, `money_provider_sync_status`, `money_duplicate_event_detections`, `money_required_review_flags`, `money_flow_health_snapshots`, `money_operator_learning_state`, and Level 3/4 autonomous approval requests. Provider webhook reliability monitoring for RevenueCat, Google Play, Stripe Connect, and Stripe merch/checkout now runs as `limited_scheduled_probe` through `chillywood-money-operator-watch-once.timer` every ten minutes and is safe only when it records status/findings/approval requests and does not mutate provider dashboards without approval.

Provider reliability surfaces are `revenuecat_webhook_delivery`, `google_play_webhook_delivery`, `stripe_connect_webhook_delivery`, `stripe_merch_webhook_delivery`, `provider_readiness_audit`, `provider_delivery_error_rate`, `stale_provider_dashboard_integration_detection`, and `duplicate_webhook_integration_detection`. Money Operator may classify delivery error rates as `healthy`, `degraded`, `critical`, `outage`, or `unknown`; a 100% provider webhook error rate must create failed/blocked provider sync status and a reconciliation finding. Dashboard/API readback can record last failure code, last success, endpoint host/path, event type, and integration id hash only. If dashboard mutation is needed, the operator creates a Level 3 approval request and stops.

Provider Access Broker is the controlled access layer for money provider dashboard/API readback. It may use server-side environment or provider API read-only credentials to read webhook endpoint metadata and delivery health, and it may record missing credential names, dashboard-owner-session requirements, non-money TEST delivery outcomes, provider access capability rows, provider access audit events, and provider dashboard repair requests. It must never print provider secrets, dashboard cookies, webhook signing values, service-role values, or raw provider credentials. It must not mutate RevenueCat, Google Play, or Stripe dashboards without owner/super-admin approval. Product changes, Stripe live-mode changes, charges, payouts, transfers, invoices, checkout sessions, payment links, cashout, and manual Premium grants remain forbidden through this broker.

Real money mutation requires Level 3/4. Production checkout, live provider integration, payout review mutation, fraud enforcement mutation, payout eligibility rule changes, Premium entitlement logic changes, production webhook money handling, production payment links/invoices, revenue-share formula changes, and network billing rule changes require Level 3 owner/super-admin approval before execution.

Real money movement requires Level 4 owner/super-admin approval plus external provider confirmation/readback. This includes real customer charge, real payout, real transfer, real cashout, production Stripe mode switch, public payment launch, provider plan/add-on, legal/compliance/tax activation, and public revenue or payout claims.

The money control plane must enforce no manual Premium grant, no fake revenue, no fake creator earnings, no fake payable balance, no fake paid status, no fake transfer complete, no production charge from foundation tables, no payout release without provider confirmation, no transfer/payout/payment-link/invoice/cashout creation from the operator, no provider product mutation, no Stripe live-mode switch, no test-mode data described as production, and no provider secrets in logs/docs/artifacts. Rachi can recommend/request, not approve.

## 11. Cost Policy

Use the cheaper Cloudflare R2/HLS path automatically for eligible audited public-safe media when rollout gates pass. Keep signed-origin fallback available.

Report usage, cache behavior, estimated bytes, and cost summaries. Do not claim savings without telemetry or cache/provider proof.

Ask the owner before enabling new paid services, paid provider features, plan upgrades, PITR add-ons, or production payment/provider mutations.

## 12. Safety Policy

Emergency stop always wins.

Fallback must remain available for playback and operational recovery.

No secrets in logs, docs, proof output, artifacts, commits, or public bug reports.

No public exposure without policy: private, Premium, original/master, unscanned, moderation-blocked, and denied media must not become public CDN content.

Audit and rollback/quarantine are mandatory for worker output trust. Destructive production changes require owner approval.

## 12A. Owner Command Policy

Owner Command Operator turns owner judgment into executable, audited command plans. Owner makes judgment; the system classifies the command, routes it to the correct existing autonomous systems, runs preflight, executes only safe scoped Level 0/1/2 work, creates approval requests for Level 3/4, requires external confirmation for Level 4 when applicable, and reports proof or exact blockers. Ads/sponsor commands route to foundation readiness planning only until the business/provider/billing path is approved and proofed.

The owner command layer is not a god panel and does not bypass the registry. It cannot directly move money, manually grant Premium, bypass Premium, publish or rollback OTA, mutate Remote Config, mutate auth/RLS or owner roles, ban/restrict users, delete content, expose private/Premium/original media, change provider products, change LiveKit routing, change R2/media behavior, print secrets, skip fresh preflight, exceed exact scope, or execute while emergency stop is active.

Rachi may recommend/request but cannot approve. Autonomous operators cannot approve their own requests. Level 3/4 commands still use the live owner/super-admin approval path and the target operator's proof/rollback/emergency-state gates.

## 12B. Platform and iOS Readback Policy

Autonomous state uses the normalized platform values `shared`, `ios`, `android`, `web`, and `unknown`. Shared backend policy stays shared. Client, release, provider, notification, runtime, installed-QA, and support evidence must include a platform when platform changes its interpretation. App version, native build, bundle identifier, runtime, channel, update, distribution source, and provider environment are recorded only where meaningful.

Notification, release, and observability operators require substantive readback. Empty caller metadata is not evidence. A missing provider, query, metric, or credential capability is `unknown` or `blocked`; it cannot become healthy merely because no failure was returned. Provider adapters are read-only and recursively sanitize token-, credential-, receipt-, cookie-, private-key-, and signed-URL-like data.

iOS installed-QA readiness distinguishes source, provider, internal-build, physical, and second-device states. Repository/config proof may establish `source_ready`; EAS/App Store readback may establish `provider_ready` or `internal_build_ready`. It may not establish physical APNs, PushKit/CallKit, StoreKit, signed Universal Link, camera/microphone/Photos, accessibility/audio-route, or two-device LiveKit behavior. Those stay `physical_proof_required` or `second_device_required` until direct evidence exists.

The terminal call-delivery retry worker is a bounded notification surface. Its one-minute database schedule, batch and attempt caps, exponential backoff, stale lease, idempotent delivery key, sanitized result, failure rows, config kill switch, and token-hash gate are mandatory. The retry surface cannot create a new incoming call, read/output raw tokens, send a broad push, bypass new-call preferences, mutate call membership, or hide/delete failure evidence.

No platform adapter may publish or roll back OTA, change TestFlight/App Review state, mutate provider products, move money, grant Premium, change auth/RLS/roles, execute moderation enforcement, or self-approve.

## 13. Codex Behavior Rule

Do not ask the owner for Level 0 or Level 1 operations. Do the work, verify it, report what happened, and keep moving.

For Level 2 operations, proceed only when the emergency stop, caps, rollback, audit, fallback, and reporting controls are present. Stop if a gate fails.

Ask the owner before Level 3 operations. Ask the owner and require external confirmation before Level 4 operations.

If unsure, classify the operation, explain the approval level, state the risk boundary, and choose the safer level until the classification is clear.
