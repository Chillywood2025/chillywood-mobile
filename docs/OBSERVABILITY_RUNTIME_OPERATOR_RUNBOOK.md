# Observability / Runtime Health Operator Runbook

Status: `scoped_write_capable_guarded`.

Activation: `manual_cli`; no scheduler, daemon, worker, OTA publish, rollback, Remote Config mutation, provider analytics config mutation, crash evidence deletion, or crash-reporting suppression automation is active.

## Scope

`observability_runtime_operator` monitors and records safe operational health findings for crash, performance, analytics delivery, release diagnostics, backend error-rate summaries, and cross-system runtime incidents.

Allowed safe writes:
- `observability_operator_events`
- `runtime_health_snapshots`
- `crash_cluster_findings`
- `js_error_findings`
- `performance_regression_findings`
- `analytics_delivery_findings`
- `release_health_findings`
- `backend_error_rate_findings`
- `observability_required_review_flags`
- `observability_operator_learning_state`
- autonomous approval requests

Forbidden:
- delete crash evidence
- silence crash reporting
- collect extra PII without approval
- log secrets/tokens
- publish or roll back OTA
- change Remote Config or feature flags without approval
- mutate provider analytics config without approval
- hide emergency launch
- fake installed proof
- mutate auth/RLS
- move money or grant Premium
- change LiveKit routing
- change R2/media behavior

## Approval Boundaries

Level 1/2 actions can record redacted health/finding/review/audit rows only. Remote Config, feature flag, and provider analytics config changes are Level 3 owner/super-admin approval work. Production OTA publish or rollback is Level 4 owner/super-admin approval work and requires fresh release diagnostics and exact scope match.

Rachi can request/recommend but cannot approve. Operators cannot approve their own Level 3/4 requests. Approval does not execute automatically; fresh preflight and emergency-state checks are still required.

## Privacy

Store stack signature hashes and redacted summaries, not raw crash evidence, auth/session tokens, signed URLs, provider credentials, payment secrets, or extra PII. Every operator table has `pii_stored=false`, `secrets_logged=false`, and `release_action_executed=false` constraints for autonomous writes.

## Live Status

The Edge Function is `observability-operator`, protected by `x-observability-operator-token` and `OBSERVABILITY_OPERATOR_TOKEN_SHA256`. No scheduler is deployed or claimed active in this lane.
