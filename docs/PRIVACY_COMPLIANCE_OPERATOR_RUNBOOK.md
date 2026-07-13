# Privacy Compliance Operator Runbook

Status: scoped-write capable guarded.

System id: `privacy_compliance_operator`

Activation: `limited_scheduled_probe`

Scheduler status: `chillywood-privacy-compliance-operator-watch-once.timer_every_6_hours`.

Live deployment status: remote DB/RLS migration is applied, Edge Function `privacy-compliance-operator` is ACTIVE, `PRIVACY_COMPLIANCE_OPERATOR_TOKEN_SHA256` is stored as a Supabase function secret by name only, and the raw token is stored only on `chillywood-prod-01` in `/etc/chillywood/privacy-compliance-operator.env` with `root:root` ownership and mode `600`.

Scheduler proof: `chillywood-privacy-compliance-operator-watch-once.timer` is enabled/active on `chillywood-prod-01` with `OnUnitActiveSec=6h` and `RandomizedDelaySec=120s`. The service calls only `watch_once`, uses no service-role key, and the latest report row shows `scheduler=systemd_timer`, `operator_id=privacy_compliance_operator`, `money_moved=false`, and `user_rights_changed=false`.

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

## Systemd

- Service: `ops/privacy-compliance-operator/systemd/chillywood-privacy-compliance-operator-watch-once.service`
- Timer: `ops/privacy-compliance-operator/systemd/chillywood-privacy-compliance-operator-watch-once.timer`
- Host script: `ops/privacy-compliance-operator/systemd/privacy-compliance-operator-watch-once.sh`
- Host env: `/etc/chillywood/privacy-compliance-operator.env`

The scheduled path may write privacy request/status/finding/planning rows only. It must not fulfill raw exports, delete accounts/data, bypass legal holds, expose PII, or mutate auth/RLS.

## Validation

- `npm run proof:privacy-compliance-operator`
- `npm run guard:privacy-compliance-operator`
- `deno check supabase/functions/privacy-compliance-operator/index.ts`
