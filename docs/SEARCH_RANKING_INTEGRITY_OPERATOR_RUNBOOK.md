# Search Ranking Integrity Operator Runbook

Status: scoped-write capable guarded.

System id: `search_ranking_integrity_operator`

Activation: `limited_scheduled_probe`

Scheduler status: `chillywood-search-ranking-integrity-operator-watch-once.timer_every_30_minutes`.

Live deployment status: remote DB/RLS migration is applied, Edge Function `search-ranking-integrity-operator` is ACTIVE, `SEARCH_RANKING_INTEGRITY_OPERATOR_TOKEN_SHA256` is stored as a Supabase function secret by name only, and the raw token is stored only on `chillywood-prod-01` in `/etc/chillywood/search-ranking-integrity-operator.env` with `root:root` ownership and mode `600`.

Scheduler proof: `chillywood-search-ranking-integrity-operator-watch-once.timer` is enabled/active on `chillywood-prod-01` with `OnUnitActiveSec=30min` and `RandomizedDelaySec=60s`. The service calls only `watch_once`, uses no service-role key, and the latest report row shows `scheduler=systemd_timer`, `operator_id=search_ranking_integrity_operator`, `money_moved=false`, and `user_rights_changed=false`.

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

## Systemd

- Service: `ops/search-ranking-integrity-operator/systemd/chillywood-search-ranking-integrity-operator-watch-once.service`
- Timer: `ops/search-ranking-integrity-operator/systemd/chillywood-search-ranking-integrity-operator-watch-once.timer`
- Host script: `ops/search-ranking-integrity-operator/systemd/search-ranking-integrity-operator-watch-once.sh`
- Host env: `/etc/chillywood/search-ranking-integrity-operator.env`

The scheduled path may write search/ranking health and integrity findings only. It must not mutate ranking, run hidden enforcement, shadowban, boost/demote, change public/private exposure, delete content, or enforce moderation.

## Validation

- `npm run proof:search-ranking-integrity-operator`
- `npm run guard:search-ranking-integrity-operator`
- `deno check supabase/functions/search-ranking-integrity-operator/index.ts`
