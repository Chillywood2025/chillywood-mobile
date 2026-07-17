#!/usr/bin/env bash
set -euo pipefail

: "${LIVEKIT_OPERATOR_FUNCTION_URL:?missing LIVEKIT_OPERATOR_FUNCTION_URL}"
: "${LIVEKIT_OPERATOR_TOKEN:?missing LIVEKIT_OPERATOR_TOKEN}"

ENABLE_SAFE_RECOVERY="${LIVEKIT_OPERATOR_ENABLE_SAFE_RECOVERY:-true}"
SOURCE="${LIVEKIT_OPERATOR_SCHEDULER_SOURCE:-systemd_timer:chillywood-prod-01}"
TMP_RESPONSE="$(mktemp)"
trap 'rm -f "${TMP_RESPONSE}"' EXIT

HTTP_STATUS="$(
  curl --silent --show-error --max-time 25 --retry 2 --retry-delay 2 \
    --output "${TMP_RESPONSE}" \
    --write-out "%{http_code}" \
    --request POST "${LIVEKIT_OPERATOR_FUNCTION_URL}" \
    --header "Content-Type: application/json" \
    --header "x-livekit-operator-token: ${LIVEKIT_OPERATOR_TOKEN}" \
    --data '{"action":"watch_once","platform":"shared","enable_safe_recovery":'"${ENABLE_SAFE_RECOVERY}"',"scheduler":"systemd_timer","source":"'"${SOURCE}"'"}'
)"

REDACTED_RESPONSE="$(
  tr -d '\n' < "${TMP_RESPONSE}" \
    | sed -E 's/[A-Za-z0-9._~+\/=-]{32,}/[redacted]/g'
)"
printf 'livekit-operator-watch-once status=%s response=%s\n' "${HTTP_STATUS}" "${REDACTED_RESPONSE}"

case "${HTTP_STATUS}" in
  2*) ;;
  *) exit 1 ;;
esac

if ! grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' "${TMP_RESPONSE}"; then
  exit 1
fi
