# Platform Recovery Operator Runbook

Status: scoped-write capable guarded.

System id: `platform_recovery_operator`

Activation: `limited_scheduled_probe`

Scheduler status: `chillywood-platform-recovery-operator-watch-once.timer_every_30_minutes`.

Live deployment status: remote DB/RLS migration is applied, Edge Function `platform-recovery-operator` is ACTIVE, `PLATFORM_RECOVERY_OPERATOR_TOKEN_SHA256` is stored as a Supabase function secret by name only, and the raw token is stored only on `chillywood-prod-01` in `/etc/chillywood/platform-recovery-operator.env` with `root:root` ownership and mode `600`.

Scheduler proof: `chillywood-platform-recovery-operator-watch-once.timer` is enabled/active on `chillywood-prod-01` with `OnUnitActiveSec=30min` and `RandomizedDelaySec=60s`. The service calls only `watch_once`, uses no service-role key, and the latest report row shows `scheduler=systemd_timer`, `operator_id=platform_recovery_operator`, `money_moved=false`, and `user_rights_changed=false`.

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

## Systemd

- Service: `ops/platform-recovery-operator/systemd/chillywood-platform-recovery-operator-watch-once.service`
- Timer: `ops/platform-recovery-operator/systemd/chillywood-platform-recovery-operator-watch-once.timer`
- Host script: `ops/platform-recovery-operator/systemd/platform-recovery-operator-watch-once.sh`
- Host env: `/etc/chillywood/platform-recovery-operator.env`

The scheduled path may record backup/restore/migration/timer/function health findings only. It must not execute restore, delete backups, rotate secrets, mutate providers, or change production data.

## Validation

- `npm run proof:platform-recovery-operator`
- `npm run guard:platform-recovery-operator`
- `deno check supabase/functions/platform-recovery-operator/index.ts`
