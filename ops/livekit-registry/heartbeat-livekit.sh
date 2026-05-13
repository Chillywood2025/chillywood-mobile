#!/usr/bin/env bash
set -euo pipefail

# Posts a LiveKit server heartbeat to the Chi'llwood registry function.
# This script does not collect or invent production metrics. Operators should
# feed real values from LiveKit/host monitoring env vars or a wrapper.

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "missing required env: ${name}" >&2
    exit 2
  fi
}

require_env LIVEKIT_REGISTRY_FUNCTION_URL
require_env LIVEKIT_SERVER_ID

DRY_RUN="${DRY_RUN:-1}"

if [[ "${DRY_RUN}" != "1" ]]; then
  require_env LIVEKIT_REGISTRY_HEARTBEAT_SECRET
  require_env LIVEKIT_ACTIVE_ROOMS
  require_env LIVEKIT_ACTIVE_PARTICIPANTS
  require_env LIVEKIT_ACTIVE_PUBLISHERS
fi

HEARTBEAT_JSON="$(
  node - <<'NODE'
const numericOrNull = (value) => {
  if (value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const numericOrZero = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
};
process.stdout.write(JSON.stringify({
  action: "heartbeat",
  active_rooms: numericOrZero(process.env.LIVEKIT_ACTIVE_ROOMS),
  active_participants: numericOrZero(process.env.LIVEKIT_ACTIVE_PARTICIPANTS),
  active_publishers: numericOrZero(process.env.LIVEKIT_ACTIVE_PUBLISHERS),
  bandwidth_in_mbps: numericOrNull(process.env.LIVEKIT_BANDWIDTH_IN_MBPS),
  bandwidth_out_mbps: numericOrNull(process.env.LIVEKIT_BANDWIDTH_OUT_MBPS),
  cpu_percent: numericOrNull(process.env.LIVEKIT_CPU_PERCENT),
  disconnect_rate: numericOrNull(process.env.LIVEKIT_DISCONNECT_RATE),
  packet_loss_percent: numericOrNull(process.env.LIVEKIT_PACKET_LOSS_PERCENT),
  ram_percent: numericOrNull(process.env.LIVEKIT_RAM_PERCENT),
  server_id: process.env.LIVEKIT_SERVER_ID,
}));
NODE
)"

if [[ "${DRY_RUN}" == "1" ]]; then
  echo "dry-run: would POST heartbeat for ${LIVEKIT_SERVER_ID} to ${LIVEKIT_REGISTRY_FUNCTION_URL}"
  echo "${HEARTBEAT_JSON}"
  exit 0
fi

curl -fsS \
  -X POST "${LIVEKIT_REGISTRY_FUNCTION_URL}" \
  -H "Content-Type: application/json" \
  -H "X-LiveKit-Registry-Heartbeat-Token: ${LIVEKIT_REGISTRY_HEARTBEAT_SECRET}" \
  --data "${HEARTBEAT_JSON}"
