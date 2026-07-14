# Support Success Operator Runbook

Status: scoped-write capable guarded.

System id: `support_success_operator`

Activation: `limited_scheduled_probe`

Scheduler status: `chillywood-support-success-operator-watch-once.timer_every_30_minutes`.

Live deployment status: remote DB/RLS migration is applied, Edge Function `support-success-operator` is ACTIVE, `SUPPORT_SUCCESS_OPERATOR_TOKEN_SHA256` is stored as a Supabase function secret by name only, and the raw token is stored only on `chillywood-prod-01` in `/etc/chillywood/support-success-operator.env` with `root:root` ownership and mode `600`.

Scheduler proof: `chillywood-support-success-operator-watch-once.timer` is enabled/active on `chillywood-prod-01` with `OnUnitActiveSec=30min` and `RandomizedDelaySec=60s`. The service calls only `watch_once`, uses no service-role key, and the latest report row shows `scheduler=systemd_timer`, `operator_id=support_success_operator`, `money_moved=false`, and `user_rights_changed=false`.

## Purpose

`support_success_operator` tracks support inbox health, stale support tickets, user issue triage, account access support flags, refund request classification, Premium/payment readback labels, support response drafts, owner/admin escalations, support SLA findings, and the User Report Router loop.

The User Report Router classifies authenticated bug/fix/support/safety/account/media/LiveKit/money/notification/release/security/privacy/search/ads reports, clusters repeated reports, dedupes same-user repeats, and routes sanitized findings or Owner Commands to the correct autonomous system. Three unique matching bug/fix reports within seven days can create a routed finding or Owner Command. Critical safety, security, privacy, payment, billing, payout, or provider reports can escalate immediately for review without executing the high-risk action.

## Safe Writes

- `support_operator_events`
- `support_health_snapshots`
- `support_ticket_findings`
- `support_required_review_flags`
- `support_response_drafts`
- `support_escalation_records`
- `support_operator_learning_state`
- `user_report_intake_events`
- `user_report_classifications`
- `user_report_clusters`
- `user_report_cluster_members`
- `user_report_routing_actions`
- `user_report_operator_findings`
- `user_report_router_learning_state`
- Owner Command requests
- Autonomous approval requests

Rows are health/finding/draft/escalation rows only with `highRiskExecuted=false`, `moneyMoved=false`, `userRightsChanged=false`, and `fake_proof=false`.

## Forbidden

- no refund execution
- no Premium grant
- no entitlement changes
- no money movement
- no auth/RLS mutation
- no credential reset without approved flow
- no ban/restrict/enforcement
- no external legal/payment commitment
- no private evidence exposure
- no raw user report text execution
- no report-spam-triggered high-risk action

Support responses are draft response only unless a future template-backed safe send path is approved and proved.

User reports can never directly issue refunds, grant Premium, move money, mutate auth/RLS, ban/restrict users, delete content, mutate provider products, publish/rollback OTA, change LiveKit routing, change R2/media behavior, or activate ads/sponsors.

## Edge And CLI

- Edge Function: `support-success-operator`
- Token header: `x-support-success-operator-token`
- Secret hash env: `SUPPORT_SUCCESS_OPERATOR_TOKEN_SHA256`
- CLI: `support-success-operator:watch-once`, `support-success-operator:status`, `support-success-operator:report`

Missing token or URL fails closed and prints no token value.

## Systemd

- Service: `ops/support-success-operator/systemd/chillywood-support-success-operator-watch-once.service`
- Timer: `ops/support-success-operator/systemd/chillywood-support-success-operator-watch-once.timer`
- Host script: `ops/support-success-operator/systemd/support-success-operator-watch-once.sh`
- Host env: `/etc/chillywood/support-success-operator.env`

The scheduled path may write support health, stale-ticket finding, draft, and escalation rows only. It must not issue refunds, grant Premium, mutate auth/entitlements, reset credentials, or send external legal/payment commitments.

## Validation

- `npm run proof:support-success-operator`
- `npm run guard:support-success-operator`
- `deno check supabase/functions/support-success-operator/index.ts`
