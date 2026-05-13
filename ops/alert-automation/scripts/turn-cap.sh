#!/usr/bin/env bash
set -euo pipefail

if [[ "${RUN_OPS_SCRIPT:-}" != "1" ]]; then
  echo "Refusing to run: RUN_OPS_SCRIPT=1 is required." >&2
  exit 2
fi

DRY_RUN="${DRY_RUN:-1}"
TURN_CONFIG_PATH="${TURN_CONFIG_PATH:-}"

echo "TURN cap script invoked."
echo "Intended changes: tighten coturn allocation/user quotas and refresh service after operator review."

if [[ -z "${TURN_CONFIG_PATH}" ]]; then
  echo "No TURN_CONFIG_PATH configured; nothing will be changed."
  exit 0
fi

if [[ ! -f "${TURN_CONFIG_PATH}" ]]; then
  echo "Configured TURN_CONFIG_PATH does not exist: ${TURN_CONFIG_PATH}" >&2
  exit 1
fi

if [[ "${DRY_RUN}" == "1" || "${DRY_RUN}" == "true" ]]; then
  echo "DRY_RUN=1: would inspect and apply approved coturn cap settings in ${TURN_CONFIG_PATH}."
  exit 0
fi

echo "Real TURN cap mutation is intentionally not hard-coded."
echo "Operator must replace this script with host-reviewed coturn edits before enabling."
exit 1
