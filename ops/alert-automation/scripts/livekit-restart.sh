#!/usr/bin/env bash
set -euo pipefail

if [[ "${RUN_OPS_SCRIPT:-}" != "1" ]]; then
  echo "blocked: RUN_OPS_SCRIPT=1 is required" >&2
  exit 2
fi

if [[ "${CONFIRM_LIVEKIT_RESTART:-}" != "YES" ]]; then
  echo "blocked: CONFIRM_LIVEKIT_RESTART=YES is required" >&2
  exit 2
fi

UNIT="${LIVEKIT_SYSTEMD_UNIT:-livekit.service}"
if [[ ! "$UNIT" =~ ^livekit[-_A-Za-z0-9.]*[.]service$ ]]; then
  echo "blocked: LIVEKIT_SYSTEMD_UNIT must be a livekit*.service unit" >&2
  exit 2
fi

if [[ "${DRY_RUN:-1}" != "0" ]]; then
  echo "dry-run: would restart ${UNIT} through systemctl"
  exit 0
fi

sudo -n systemctl restart "$UNIT"
echo "restarted ${UNIT}"
