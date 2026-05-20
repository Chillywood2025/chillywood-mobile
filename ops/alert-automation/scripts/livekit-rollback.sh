#!/usr/bin/env bash
set -euo pipefail

if [[ "${RUN_OPS_SCRIPT:-}" != "1" ]]; then
  echo "blocked: RUN_OPS_SCRIPT=1 is required" >&2
  exit 2
fi

if [[ "${CONFIRM_LIVEKIT_ROLLBACK:-}" != "YES" ]]; then
  echo "blocked: CONFIRM_LIVEKIT_ROLLBACK=YES is required" >&2
  exit 2
fi

ROLLBACK_SCRIPT="${LIVEKIT_ROLLBACK_SCRIPT:-}"
if [[ -z "$ROLLBACK_SCRIPT" ]]; then
  echo "blocked: LIVEKIT_ROLLBACK_SCRIPT is not configured" >&2
  exit 2
fi

case "$ROLLBACK_SCRIPT" in
  /opt/chillywood/ops/*) ;;
  *)
    echo "blocked: LIVEKIT_ROLLBACK_SCRIPT must live under /opt/chillywood/ops" >&2
    exit 2
    ;;
esac

if [[ ! -x "$ROLLBACK_SCRIPT" ]]; then
  echo "blocked: LIVEKIT_ROLLBACK_SCRIPT is not executable" >&2
  exit 2
fi

if [[ "${DRY_RUN:-1}" != "0" ]]; then
  echo "dry-run: would run ${ROLLBACK_SCRIPT}"
  exit 0
fi

"$ROLLBACK_SCRIPT"
echo "rollback script completed"
