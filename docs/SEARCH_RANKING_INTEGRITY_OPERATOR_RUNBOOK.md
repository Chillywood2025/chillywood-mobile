# Search Ranking Integrity Operator Runbook

Status: scoped-write capable guarded.

System id: `search_ranking_integrity_operator`

Activation: `manual_cli`

Scheduler status: `scheduler_pending_search_health_path_and_hardened_host_path`.

## Purpose

`search_ranking_integrity_operator` tracks search health, ranking integrity, recommendation quality, creator/content visibility anomalies, spam pattern findings, index freshness, search latency findings, ranking experiment readback, and discovery safety findings.

## Safe Writes

- `search_operator_events`
- `search_health_snapshots`
- `ranking_integrity_findings`
- `recommendation_quality_findings`
- `visibility_anomaly_findings`
- `search_required_review_flags`
- `search_operator_learning_state`
- Owner Command requests
- Autonomous approval requests

Rows are health/finding/review rows only with `highRiskExecuted=false`, `moneyMoved=false`, `userRightsChanged=false`, and `fake_proof=false`.

## Forbidden

- no ranking mutation
- no hidden enforcement
- no hidden shadowban
- no secret demotion/boost
- no moderation enforcement
- no exposure change between public/private scopes
- no creator visibility manipulation without audit and approval
- no content deletion
- no auth/RLS mutation
- no money movement

Ranking or visibility changes require Owner Command or Autonomous Approval with audit, rollback, and proof plan.

## Edge And CLI

- Edge Function: `search-ranking-integrity-operator`
- Token header: `x-search-ranking-integrity-operator-token`
- Secret hash env: `SEARCH_RANKING_INTEGRITY_OPERATOR_TOKEN_SHA256`
- CLI: `search-ranking-integrity-operator:watch-once`, `search-ranking-integrity-operator:status`, `search-ranking-integrity-operator:report`

Missing token or URL fails closed and prints no token value.

## Validation

- `npm run proof:search-ranking-integrity-operator`
- `npm run guard:search-ranking-integrity-operator`
- `deno check supabase/functions/search-ranking-integrity-operator/index.ts`
