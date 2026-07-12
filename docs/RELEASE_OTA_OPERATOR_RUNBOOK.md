# Release / OTA Operator Runbook

Status: `scoped_write_capable_guarded`

Activation: `limited_scheduled_probe`; hardened host timer `chillywood-release-operator-watch-once.timer` runs `watch_once` every thirty minutes. No publish automation or rollback automation is active.

## Scope

`release_ota_operator` monitors release diagnostics, EAS update health, runtime/channel/updateId readback, embedded launch detection, emergency launch detection, OTA rollout health, installed proof status, and rollback readiness.

## Safe Writes

- `release_operator_events`
- `release_health_snapshots`
- `ota_diagnostics_readback_records`
- `rollout_anomaly_findings`
- `release_required_review_flags`
- `rollback_readiness_records`
- `release_operator_learning_state`
- autonomous approval requests

These writes are proof/readiness records only. They cannot publish, roll back, submit to stores, or alter runtime policy.

## Forbidden

No auto-publish production OTA, auto-rollback production OTA, Play/App Store release submission, runtimeVersion policy change, public release track mutation, store listing change, hidden emergency launch, or fake installed proof.

## Approval Boundary

Production OTA publish, production rollback, store release mutation, and runtime policy changes require Level 4 owner/super-admin approval through the autonomous approval path, plus fresh release diagnostics and exact scope match.
