#!/usr/bin/env bash
set -euo pipefail

if [[ "${RUN_OPS_SCRIPT:-}" != "1" ]]; then
  echo "Refusing to run: RUN_OPS_SCRIPT=1 is required." >&2
  exit 2
fi

if [[ "$#" -ne 1 ]]; then
  echo "Usage: net-throttle-rollback.sh <interface>" >&2
  exit 2
fi

IFACE="$1"
DRY_RUN="${DRY_RUN:-1}"

if [[ -z "${IFACE}" ]]; then
  echo "Interface is required." >&2
  exit 2
fi

if [[ "${DRY_RUN}" == "1" || "${DRY_RUN}" == "true" ]]; then
  echo "DRY_RUN=1: would run: sudo tc qdisc del dev ${IFACE} root || true"
  exit 0
fi

sudo tc qdisc del dev "${IFACE}" root || true
echo "Removed root qdisc from ${IFACE} if present."
