#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_FUNCTIONS_URL:?missing SUPABASE_FUNCTIONS_URL}"
: "${PRIVACY_COMPLIANCE_OPERATOR_TOKEN:?missing PRIVACY_COMPLIANCE_OPERATOR_TOKEN}"

SOURCE="${OPERATOR_SOURCE:-systemd_timer:chillywood-prod-01:privacy_compliance_operator}"
TMP_RESPONSE="$(mktemp)"
trap 'rm -f "${TMP_RESPONSE}"' EXIT

HTTP_STATUS="$(
  curl --silent --show-error --max-time 25 --retry 2 --retry-delay 2 \
    --output "${TMP_RESPONSE}" \
    --write-out "%{http_code}" \
    --request POST "${SUPABASE_FUNCTIONS_URL%/}/privacy-compliance-operator" \
    --header "Content-Type: application/json" \
    --header "x-privacy-compliance-operator-token: ${PRIVACY_COMPLIANCE_OPERATOR_TOKEN}" \
    --data '{"action":"watch_once","environment_mode":"production","scheduler":"systemd_timer","operator_id":"privacy_compliance_operator","source":"'"${SOURCE}"'","moneyMoved":false,"userRightsChanged":false,"highRiskExecuted":false}'
)"

REDACTED_RESPONSE="$(
  tr -d '\n' < "${TMP_RESPONSE}" \
    | sed -E 's/[A-Za-z0-9._~+\/=-]{32,}/[redacted]/g'
)"
printf 'privacy-compliance-operator-watch-once status=%s response=%s\n' "${HTTP_STATUS}" "${REDACTED_RESPONSE}"

case "${HTTP_STATUS}" in
  2*) ;;
  *) exit 1 ;;
esac

if ! grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' "${TMP_RESPONSE}"; then
  exit 1
fi
