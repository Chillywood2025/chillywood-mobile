#!/usr/bin/env bash
set -euo pipefail

if [[ "${RUN_OPS_SCRIPT:-}" != "1" ]]; then
  echo "Refusing to run: RUN_OPS_SCRIPT=1 is required." >&2
  exit 2
fi

if [[ "$#" -ne 2 ]]; then
  echo "Usage: net-throttle.sh <interface> <rate>" >&2
  exit 2
fi

IFACE="$1"
RATE="$2"
DRY_RUN="${DRY_RUN:-1}"

if [[ -z "${IFACE}" || -z "${RATE}" ]]; then
  echo "Interface and rate are required." >&2
  exit 2
fi

ROLLBACK="sudo tc qdisc del dev ${IFACE} root || true"

if [[ "${DRY_RUN}" == "1" || "${DRY_RUN}" == "true" ]]; then
  echo "DRY_RUN=1: would run: sudo tc qdisc replace dev ${IFACE} root tbf rate ${RATE} burst 32kbit latency 400ms"
  echo "Rollback: ${ROLLBACK}"
  exit 0
fi

sudo tc qdisc replace dev "${IFACE}" root tbf rate "${RATE}" burst 32kbit latency 400ms
echo "Applied throttle to ${IFACE} at ${RATE}."
echo "Rollback: ${ROLLBACK}"
