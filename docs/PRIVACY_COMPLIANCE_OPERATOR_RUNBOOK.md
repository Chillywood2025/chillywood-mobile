# Privacy Compliance Operator Runbook

Status: scoped-write capable guarded.

System id: `privacy_compliance_operator`

Activation: `manual_cli`

Scheduler status: `scheduler_pending_legal_workflow_and_hardened_host_path`.

## Purpose

`privacy_compliance_operator` tracks privacy request intake, export/deletion planning, legal hold readback, retention policy readback, PII exposure findings, data-safety disclosure findings, evidence retention status, privacy request status, and redacted export package planning.

## Safe Writes

- `privacy_operator_events`
- `privacy_request_findings`
- `privacy_export_plans`
- `privacy_deletion_plans`
- `privacy_required_review_flags`
- `pii_exposure_findings`
- `retention_hold_findings`
- `privacy_operator_learning_state`
- Owner Command requests
- Autonomous approval requests

Rows are planning/status rows only with `highRiskExecuted=false`, `moneyMoved=false`, `userRightsChanged=false`, and `fake_proof=false`.

## Forbidden

- no real export without approved/legal-backed fulfillment
- no account deletion without approved flow
- no raw private data output
- no legal hold bypass
- no audit/evidence deletion
- no PII/secrets in rows, logs, docs, or proof output
- no auth/RLS mutation
- no billing/money mutation
- no fake compliance closure

Fulfillment is Level 3/4 depending scope and must use owner/legal-approved flow plus external/legal confirmation where policy requires it.

## Edge And CLI

- Edge Function: `privacy-compliance-operator`
- Token header: `x-privacy-compliance-operator-token`
- Secret hash env: `PRIVACY_COMPLIANCE_OPERATOR_TOKEN_SHA256`
- CLI: `privacy-compliance-operator:watch-once`, `privacy-compliance-operator:status`, `privacy-compliance-operator:report`

Missing token or URL fails closed and prints no token value.

## Validation

- `npm run proof:privacy-compliance-operator`
- `npm run guard:privacy-compliance-operator`
- `deno check supabase/functions/privacy-compliance-operator/index.ts`
