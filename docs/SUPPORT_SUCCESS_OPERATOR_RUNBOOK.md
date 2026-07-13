# Support Success Operator Runbook

Status: scoped-write capable guarded.

System id: `support_success_operator`

Activation: `manual_cli`

Scheduler status: `scheduler_pending_support_table_and_hardened_host_path`.

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

## Validation

- `npm run proof:support-success-operator`
- `npm run guard:support-success-operator`
- `deno check supabase/functions/support-success-operator/index.ts`
