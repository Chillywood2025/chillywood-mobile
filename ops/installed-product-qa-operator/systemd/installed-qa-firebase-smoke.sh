#!/usr/bin/env bash
set -euo pipefail

export PATH="/usr/local/bin:/usr/bin:/bin:${PATH:-}"

: "${CHILLYWOOD_REPO_DIR:?missing CHILLYWOOD_REPO_DIR}"
: "${INSTALLED_QA_OPERATOR_TOKEN:?missing INSTALLED_QA_OPERATOR_TOKEN}"

if [[ -z "${INSTALLED_QA_OPERATOR_FUNCTION_URL:-}" && -z "${SUPABASE_FUNCTIONS_URL:-}" ]]; then
  printf 'installed-qa-firebase-smoke missing operator function URL\n' >&2
  exit 1
fi

export FIREBASE_TEST_LAB_MODE="${FIREBASE_TEST_LAB_MODE:-cost_capped}"
export FIREBASE_TEST_LAB_MONTHLY_CAP_USD="${FIREBASE_TEST_LAB_MONTHLY_CAP_USD:-5}"
export FIREBASE_TEST_LAB_PER_RUN_CAP_USD="${FIREBASE_TEST_LAB_PER_RUN_CAP_USD:-0.25}"
export FIREBASE_TEST_LAB_ALLOW_VIRTUAL="${FIREBASE_TEST_LAB_ALLOW_VIRTUAL:-true}"
export FIREBASE_TEST_LAB_ALLOW_PHYSICAL="${FIREBASE_TEST_LAB_ALLOW_PHYSICAL:-false}"
export FIREBASE_TEST_LAB_MAX_SCHEDULED_RUNS_PER_DAY="${FIREBASE_TEST_LAB_MAX_SCHEDULED_RUNS_PER_DAY:-1}"
export FIREBASE_TEST_LAB_RUN_ON_OTA_CHANGE="${FIREBASE_TEST_LAB_RUN_ON_OTA_CHANGE:-true}"
export FIREBASE_TEST_LAB_ALLOW_BROAD_CRAWL="${FIREBASE_TEST_LAB_ALLOW_BROAD_CRAWL:-false}"
export FIREBASE_TEST_LAB_ALLOW_TWO_DEVICE="${FIREBASE_TEST_LAB_ALLOW_TWO_DEVICE:-false}"
export FIREBASE_TEST_LAB_DEVICE_TYPE="${FIREBASE_TEST_LAB_DEVICE_TYPE:-virtual}"
export FIREBASE_TEST_LAB_QA_TIER="${FIREBASE_TEST_LAB_QA_TIER:-tier1}"
export FIREBASE_TEST_LAB_RUN_REASON="${FIREBASE_TEST_LAB_RUN_REASON:-daily_scheduled}"
export FIREBASE_TEST_LAB_REPORT_TO_OPERATOR="${FIREBASE_TEST_LAB_REPORT_TO_OPERATOR:-true}"
export FIREBASE_TEST_LAB_RESULTS_BUCKET="${FIREBASE_TEST_LAB_RESULTS_BUCKET:-chillywood-installed-qa-testlab-results}"
export FIREBASE_TEST_LAB_MAX_WAIT_SECONDS="${FIREBASE_TEST_LAB_MAX_WAIT_SECONDS:-900}"
export FIREBASE_TEST_LAB_POLL_INTERVAL_SECONDS="${FIREBASE_TEST_LAB_POLL_INTERVAL_SECONDS:-30}"
export FIREBASE_TEST_LAB_ALLOW_PENDING_MATRIX="${FIREBASE_TEST_LAB_ALLOW_PENDING_MATRIX:-true}"
export FIREBASE_TEST_LAB_MAX_ACTIVE_MATRICES="${FIREBASE_TEST_LAB_MAX_ACTIVE_MATRICES:-1}"
export FIREBASE_TEST_LAB_PENDING_MATRIX_FILE="${FIREBASE_TEST_LAB_PENDING_MATRIX_FILE:-/var/lib/chillywood/installed-qa/firebase-pending-matrix.json}"
export INSTALLED_QA_SCHEDULER="${INSTALLED_QA_SCHEDULER:-systemd_timer}"
export INSTALLED_QA_OPERATOR_ID="${INSTALLED_QA_OPERATOR_ID:-installed_product_qa_operator}"
export FIREBASE_TEST_LAB_BUDGET_LEDGER="${FIREBASE_TEST_LAB_BUDGET_LEDGER:-/var/lib/chillywood/installed-qa/firebase-budget-ledger.jsonl}"

install -d -m 0750 /var/lib/chillywood/installed-qa

cd "${CHILLYWOOD_REPO_DIR}"

npm run --silent installed-qa:firebase-test-plan
npm run --silent installed-qa:firebase-test-run
npm run --silent installed-qa-operator:report

# The same bounded daily schedule also derives iOS source/provider readiness.
# It never starts a device matrix and the Edge Function records physical proof
# as required rather than passed.
INSTALLED_QA_FUNCTION_URL="${INSTALLED_QA_OPERATOR_FUNCTION_URL:-${SUPABASE_FUNCTIONS_URL%/}/installed-product-qa-operator}"
HTTP_STATUS="$(
  curl --silent --show-error --max-time 25 --retry 2 --retry-delay 2 \
    --output /dev/null \
    --write-out "%{http_code}" \
    --request POST "${INSTALLED_QA_FUNCTION_URL}" \
    --header "Content-Type: application/json" \
    --header "x-installed-qa-operator-token: ${INSTALLED_QA_OPERATOR_TOKEN}" \
    --data '{"action":"watch_once","platform":"ios","source":"testflight_internal","scheduler":"systemd_timer","operator_id":"installed_product_qa_operator","fakeProof":false,"moneyMoved":false,"userRightsChanged":false}'
)"
case "${HTTP_STATUS}" in
  2*) ;;
  *) printf 'installed iOS readiness watch_once failed status=%s\n' "${HTTP_STATUS}" >&2; exit 1 ;;
esac
