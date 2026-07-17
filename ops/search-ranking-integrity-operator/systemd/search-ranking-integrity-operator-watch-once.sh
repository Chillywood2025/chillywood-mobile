#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_FUNCTIONS_URL:?missing SUPABASE_FUNCTIONS_URL}"
: "${SEARCH_RANKING_INTEGRITY_OPERATOR_TOKEN:?missing SEARCH_RANKING_INTEGRITY_OPERATOR_TOKEN}"

SOURCE="${OPERATOR_SOURCE:-systemd_timer:chillywood-prod-01:search_ranking_integrity_operator}"
TMP_RESPONSE="$(mktemp)"
trap 'rm -f "${TMP_RESPONSE}"' EXIT

HTTP_STATUS="$(
  curl --silent --show-error --max-time 25 --retry 2 --retry-delay 2 \
    --output "${TMP_RESPONSE}" \
    --write-out "%{http_code}" \
    --request POST "${SUPABASE_FUNCTIONS_URL%/}/search-ranking-integrity-operator" \
    --header "Content-Type: application/json" \
    --header "x-search-ranking-integrity-operator-token: ${SEARCH_RANKING_INTEGRITY_OPERATOR_TOKEN}" \
    --data '{"action":"watch_once","platform":"shared","environment_mode":"production","scheduler":"systemd_timer","operator_id":"search_ranking_integrity_operator","source":"'"${SOURCE}"'","moneyMoved":false,"userRightsChanged":false,"highRiskExecuted":false}'
)"

REDACTED_RESPONSE="$(
  tr -d '\n' < "${TMP_RESPONSE}" \
    | sed -E 's/[A-Za-z0-9._~+\/=-]{32,}/[redacted]/g'
)"
printf 'search-ranking-integrity-operator-watch-once status=%s response=%s\n' "${HTTP_STATUS}" "${REDACTED_RESPONSE}"

case "${HTTP_STATUS}" in
  2*) ;;
  *) exit 1 ;;
esac

if ! grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' "${TMP_RESPONSE}"; then
  exit 1
fi
