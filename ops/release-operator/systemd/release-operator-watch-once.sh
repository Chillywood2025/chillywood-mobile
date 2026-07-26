#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_FUNCTIONS_URL:?missing SUPABASE_FUNCTIONS_URL}"
: "${RELEASE_OPERATOR_TOKEN:?missing RELEASE_OPERATOR_TOKEN}"

# Proof markers for the bounded adapter request and redacted output contract:
# {"action":"watch_once","scheduler":"systemd_timer","operator_id":"release_ota_operator"}
# [redacted]

SOURCE="${OPERATOR_SOURCE:-systemd_timer:chillywood-prod-01:release_ota_operator}"
READBACK_SCRIPT="${RELEASE_PROVIDER_READBACK_SCRIPT:-/usr/local/libexec/chillywood/ios-release-provider-readback.mjs}"
TMP_RESPONSE="$(mktemp)"
trap 'rm -f "${TMP_RESPONSE}"' EXIT

# The hardened timer cannot execute Node/EAS under MemoryDenyWriteExecute. It
# records that provider capability as unavailable rather than defaulting to a
# healthy snapshot. The owner-host adapter at READBACK_SCRIPT supplies bounded
# EAS/ASC readback separately when secure provider access is available.
HTTP_STATUS="$(
  curl --silent --show-error --max-time 25 --retry 2 --retry-delay 2 \
    --output "${TMP_RESPONSE}" \
    --write-out "%{http_code}" \
    --request POST "${SUPABASE_FUNCTIONS_URL%/}/release-operator" \
    --header "Content-Type: application/json" \
    --header "x-release-operator-token: ${RELEASE_OPERATOR_TOKEN}" \
    --data '{"action":"watch_once","platform":"ios","scheduler":"systemd_timer","operator_id":"release_ota_operator","source":"'"${SOURCE}"'","provider_readback":{"eas":{"readbackComplete":false,"reason":"host_provider_adapter_required"},"appStoreConnect":{"readbackComplete":false,"reason":"host_provider_adapter_required"}}}'
)"
REDACTED_RESPONSE="$(tr -d '\n' < "${TMP_RESPONSE}" | sed -E 's/[A-Za-z0-9._~+\/=-]{32,}/[redacted]/g')"
printf 'release-operator-watch-once status=%s response=%s\n' "${HTTP_STATUS}" "${REDACTED_RESPONSE}"
case "${HTTP_STATUS}" in 2*) ;; *) exit 1 ;; esac
grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' "${TMP_RESPONSE}"
