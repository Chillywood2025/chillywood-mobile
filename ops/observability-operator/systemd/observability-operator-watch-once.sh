#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_FUNCTIONS_URL:?missing SUPABASE_FUNCTIONS_URL}"
: "${OBSERVABILITY_OPERATOR_TOKEN:?missing OBSERVABILITY_OPERATOR_TOKEN}"

# Proof markers for the bounded adapter request and redacted output contract:
# {"action":"watch_once","scheduler":"systemd_timer","operator_id":"observability_runtime_operator"}
# [redacted]

: "${OBSERVABILITY_PROVIDER_ADAPTER:=/usr/local/libexec/chillywood/ios-observability-provider-readback.mjs}"
TMP_RESPONSE="$(mktemp)"
trap 'rm -f "${TMP_RESPONSE}"' EXIT

# Firebase CLI is Node-based and intentionally cannot execute inside this
# MemoryDenyWriteExecute timer sandbox. Missing metric capability is posted as
# unavailable; the owner-host adapter performs bounded provider reads when its
# secure Firebase access is available.
HTTP_STATUS="$(
  curl --silent --show-error --max-time 25 --retry 2 --retry-delay 2 \
    --output "${TMP_RESPONSE}" \
    --write-out "%{http_code}" \
    --request POST "${SUPABASE_FUNCTIONS_URL%/}/observability-operator" \
    --header "Content-Type: application/json" \
    --header "x-observability-operator-token: ${OBSERVABILITY_OPERATOR_TOKEN}" \
    --data '{"action":"watch_once","platform":"ios","scheduler":"systemd_timer","operator_id":"observability_runtime_operator","source":"systemd_provider_capability_probe","provider_readback":{"firebase":{"crashlyticsReadbackComplete":false,"performanceReadbackComplete":false,"analyticsReadbackComplete":false,"reason":"host_provider_adapter_required"},"supabaseEdgeFunctions":{"readbackComplete":false,"reason":"sanitized_edge_log_export_not_configured"}}}'
)"
REDACTED_RESPONSE="$(tr -d '\n' < "${TMP_RESPONSE}" | sed -E 's/[A-Za-z0-9._~+\/=-]{32,}/[redacted]/g')"
printf 'observability-operator-watch-once status=%s response=%s\n' "${HTTP_STATUS}" "${REDACTED_RESPONSE}"
case "${HTTP_STATUS}" in 2*) ;; *) exit 1 ;; esac
grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' "${TMP_RESPONSE}"
