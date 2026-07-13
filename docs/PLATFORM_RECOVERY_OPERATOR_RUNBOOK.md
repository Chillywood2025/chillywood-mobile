# Platform Recovery Operator Runbook

Status: scoped-write capable guarded.

System id: `platform_recovery_operator`

Activation: `manual_cli`

Scheduler status: `scheduler_pending_no_hardened_host_token_path`; scheduler remains pending until a hardened host, root-owned narrow token env file, systemd timer, and fired-run audit proof exist.

## Purpose

`platform_recovery_operator` watches recovery readiness: backup freshness, restore drill freshness, critical table coverage, migration drift, function deployment drift, timer health, token/secret presence by name only, R2 backup export health, audit integrity, emergency-state readback, and cross-system recovery blockers.

## Safe Writes

- `platform_recovery_operator_events`
- `backup_health_snapshots`
- `restore_drill_findings`
- `migration_drift_findings`
- `function_deployment_drift_findings`
- `scheduled_timer_health_findings`
- `recovery_required_review_flags`
- `recovery_operator_learning_state`
- Owner Command requests
- Autonomous approval requests

Rows are safe status/finding rows only with `highRiskExecuted=false`, `moneyMoved=false`, `userRightsChanged=false`, and `fake_proof=false`.

## Forbidden

- no production restore
- no destructive mutation
- no backup deletion
- no secret rotation
- no provider config mutation
- no R2/media behavior mutation
- no service-role key in scheduler
- no fake backup/restore success

High-risk recovery creates Owner Command or Autonomous Approval requests and stops before execution.

## Edge And CLI

- Edge Function: `platform-recovery-operator`
- Token header: `x-platform-recovery-operator-token`
- Secret hash env: `PLATFORM_RECOVERY_OPERATOR_TOKEN_SHA256`
- CLI: `platform-recovery-operator:watch-once`, `platform-recovery-operator:status`, `platform-recovery-operator:report`

Missing token or URL fails closed and prints no token value.

## Validation

- `npm run proof:platform-recovery-operator`
- `npm run guard:platform-recovery-operator`
- `deno check supabase/functions/platform-recovery-operator/index.ts`
