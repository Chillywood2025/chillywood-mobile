# Support Success Operator Runbook

Status: scoped-write capable guarded.

System id: `support_success_operator`

Activation: `limited_scheduled_probe`

Scheduler status: `chillywood-support-success-operator-watch-once.timer_every_30_minutes`.

Live deployment status: remote DB/RLS migration is applied, Edge Function `support-success-operator` is ACTIVE, `SUPPORT_SUCCESS_OPERATOR_TOKEN_SHA256` is stored as a Supabase function secret by name only, and the raw token is stored only on `chillywood-prod-01` in `/etc/chillywood/support-success-operator.env` with `root:root` ownership and mode `600`.

Scheduler proof: `chillywood-support-success-operator-watch-once.timer` is enabled/active on `chillywood-prod-01` with `OnUnitActiveSec=30min` and `RandomizedDelaySec=60s`. The service calls only `watch_once`, uses no service-role key, and the latest report row shows `scheduler=systemd_timer`, `operator_id=support_success_operator`, `money_moved=false`, and `user_rights_changed=false`.

## Purpose

`support_success_operator` tracks support inbox health, stale support tickets, user issue triage, account access support flags, refund request classification, Premium/payment readback labels, support response drafts, owner/admin escalations, and support SLA findings.

## Safe Writes

- `support_operator_events`
- `support_health_snapshots`
- `support_ticket_findings`
- `support_required_review_flags`
- `support_response_drafts`
- `support_escalation_records`
- `support_operator_learning_state`
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

Support responses are draft response only unless a future template-backed safe send path is approved and proved.

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
