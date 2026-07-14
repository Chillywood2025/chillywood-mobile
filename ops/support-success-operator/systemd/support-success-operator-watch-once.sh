#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_FUNCTIONS_URL:?missing SUPABASE_FUNCTIONS_URL}"
: "${SUPPORT_SUCCESS_OPERATOR_TOKEN:?missing SUPPORT_SUCCESS_OPERATOR_TOKEN}"

SOURCE="${OPERATOR_SOURCE:-systemd_timer:chillywood-prod-01:support_success_operator}"
TMP_RESPONSE="$(mktemp)"
trap 'rm -f "${TMP_RESPONSE}"' EXIT

# Proof markers for the bounded scheduled actions:
# {"action":"watch_once"}
# {"action":"user_report_router_watch_once"}

run_support_action() {
  local action="$1"
  : > "${TMP_RESPONSE}"
  local http_status
  http_status="$(
    curl --silent --show-error --max-time 25 --retry 2 --retry-delay 2 \
      --output "${TMP_RESPONSE}" \
      --write-out "%{http_code}" \
      --request POST "${SUPABASE_FUNCTIONS_URL%/}/support-success-operator" \
      --header "Content-Type: application/json" \
      --header "x-support-success-operator-token: ${SUPPORT_SUCCESS_OPERATOR_TOKEN}" \
      --data '{"action":"'"${action}"'","environment_mode":"production","scheduler":"systemd_timer","operator_id":"support_success_operator","source":"'"${SOURCE}"'","moneyMoved":false,"userRightsChanged":false,"highRiskExecuted":false}'
  )"

  local redacted_response
  redacted_response="$(
    tr -d '\n' < "${TMP_RESPONSE}" \
      | sed -E 's/[A-Za-z0-9._~+\/=-]{32,}/[redacted]/g'
  )"
  printf 'support-success-operator-watch-once action=%s status=%s response=%s\n' "${action}" "${http_status}" "${redacted_response}"

  case "${http_status}" in
    2*) ;;
    *) exit 1 ;;
  esac

  if ! grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' "${TMP_RESPONSE}"; then
    exit 1
  fi
}

run_support_action "watch_once"
run_support_action "user_report_router_watch_once"
