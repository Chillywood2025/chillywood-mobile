#!/usr/bin/env bash

if [[ -z "${INSTALLED_QA_OPERATOR_TOKEN:-}" ]]; then
  printf 'installed-qa-ios-readiness missing operator token\n' >&2
  exit 1
fi
if [[ -z "${INSTALLED_QA_OPERATOR_FUNCTION_URL:-}" && -z "${SUPABASE_FUNCTIONS_URL:-}" ]]; then
  printf 'installed-qa-ios-readiness missing operator URL\n' >&2
  exit 1
fi
FUNCTION_URL="${INSTALLED_QA_OPERATOR_FUNCTION_URL:-${SUPABASE_FUNCTIONS_URL%/}/installed-product-qa-operator}"
PLATFORM="${1:-ios}"
case "${PLATFORM}" in
  ios) SOURCE="app_store_internal" ;;
  android) SOURCE="local_fixture" ;;
  *) printf 'installed-qa-readiness unsupported platform\n' >&2; exit 1 ;;
esac
TMP_RESPONSE="$(mktemp)"
trap 'rm -f "${TMP_RESPONSE}"' EXIT
HTTP_STATUS="$(
  curl --silent --show-error --max-time 25 --retry 2 --retry-delay 2 \
    --output "${TMP_RESPONSE}" --write-out "%{http_code}" --request POST "${FUNCTION_URL}" \
    --header "Content-Type: application/json" \
    --header "x-installed-qa-operator-token: ${INSTALLED_QA_OPERATOR_TOKEN}" \
    --data "{\"action\":\"watch_once\",\"platform\":\"${PLATFORM}\",\"source\":\"${SOURCE}\",\"scheduler\":\"systemd_timer\",\"operator_id\":\"installed_product_qa_operator\",\"fakeProof\":false,\"moneyMoved\":false,\"userRightsChanged\":false}"
)"
case "${HTTP_STATUS}" in 2*) ;; *) printf 'installed-qa-ios-readiness failed status=%s\n' "${HTTP_STATUS}" >&2; exit 1 ;; esac
grep -Eq '"ok"[[:space:]]*:[[:space:]]*true' "${TMP_RESPONSE}"
printf 'installed-qa-readiness platform=%s status=%s\n' "${PLATFORM}" "${HTTP_STATUS}"
