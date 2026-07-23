#!/usr/bin/env bash

# Review-only local concurrency reproduction. Never point this script at a
# remote database. Pass the disposable local Supabase database container name.

set -euo pipefail

container_name="${1:?local Supabase database container name required}"
fixture_suffix="${PPID}-$$"

psql_local() {
  docker exec "${container_name}" psql -U postgres -d postgres -X -P pager=off "$@"
}

race_insert() {
  local label="$1"
  local table_name="$2"
  local dedupe_key="$3"
  local insert_sql="$4"
  local first_pid
  local second_code
  local second_output
  local row_count

  psql_local -v ON_ERROR_STOP=1 -c "begin; ${insert_sql}; select pg_sleep(1); commit;" >/dev/null 2>&1 &
  first_pid=$!
  sleep 0.15

  set +e
  second_output="$(psql_local -v ON_ERROR_STOP=1 -c "${insert_sql};" 2>&1)"
  second_code=$?
  set -e

  wait "${first_pid}"
  row_count="$(psql_local -v ON_ERROR_STOP=1 -tAc "select count(*) from public.${table_name} where dedupe_key='${dedupe_key}';")"

  if [[ "${second_code}" -ne 0 && "${second_output}" == *"duplicate key value violates unique constraint"* && "${row_count}" == "1" ]]; then
    echo "${label} MATCH"
  else
    echo "${label} MISMATCH"
  fi
}

task_key="review-task-race-${fixture_suffix}"
source_key="review-source-race-${fixture_suffix}"
claim_key="review-claim-race-${fixture_suffix}"
hypothesis_key="review-hypothesis-race-${fixture_suffix}"
run_key="review-run-race-${fixture_suffix}"
finding_key="review-finding-race-${fixture_suffix}"
lesson_key="review-lesson-race-${fixture_suffix}"
plan_key="review-plan-race-${fixture_suffix}"
plan_id="c1000000-0000-0000-0000-000000000001"

psql_local -v ON_ERROR_STOP=1 -c "
  insert into public.execution_plans(
    id,dedupe_key,status,branch_name,max_tool_calls,max_duration_seconds,max_cost_usd,rollback_plan
  ) values (
    '${plan_id}','${plan_key}','planned','codex/review-concurrency',10,600,1.00,'review rollback fixture'
  );" >/dev/null

race_insert \
  "intelligence_task" \
  "intelligence_tasks" \
  "${task_key}" \
  "insert into public.intelligence_tasks(dedupe_key,status) values ('${task_key}','pending')"

race_insert \
  "research_evidence" \
  "research_sources" \
  "${source_key}" \
  "insert into public.research_sources(dedupe_key,status,source_reference,publisher,retrieval_date,source_type) values ('${source_key}','pending','https://example.invalid/review-race','Review Fixture',current_date,'official_documentation')"

race_insert \
  "research_claim" \
  "research_claims" \
  "${claim_key}" \
  "insert into public.research_claims(dedupe_key,status,claim,confidence,freshness_deadline) values ('${claim_key}','pending','sanitized concurrency fixture',0.5,now()+interval '1 day')"

race_insert \
  "hypothesis" \
  "hypotheses" \
  "${hypothesis_key}" \
  "insert into public.hypotheses(dedupe_key,status) values ('${hypothesis_key}','pending')"

race_insert \
  "execution_run" \
  "execution_runs" \
  "${run_key}" \
  "insert into public.execution_runs(dedupe_key,status,plan_id) values ('${run_key}','pending','${plan_id}')"

race_insert \
  "evaluation_finding" \
  "evaluation_results" \
  "${finding_key}" \
  "insert into public.evaluation_results(dedupe_key,status) values ('${finding_key}','pending')"

race_insert \
  "lesson" \
  "lessons" \
  "${lesson_key}" \
  "insert into public.lessons(dedupe_key,status) values ('${lesson_key}','pending')"

if psql_local -v ON_ERROR_STOP=1 -tAc "
  select exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='intelligence_tasks' and column_name='occurrence_count'
  );" | rg -qx 'f'; then
  echo "occurrence_count MISSING"
else
  echo "occurrence_count PRESENT"
fi
