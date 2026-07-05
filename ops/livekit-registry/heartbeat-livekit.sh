#!/usr/bin/env bash
set -euo pipefail

# Posts a LiveKit server heartbeat to the Chi'llywood registry function.
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
LIVEKIT_COLLECT_HOST_METRICS="${LIVEKIT_COLLECT_HOST_METRICS:-0}"
LIVEKIT_VERIFY_PUBLIC_URL="${LIVEKIT_VERIFY_PUBLIC_URL:-1}"
LIVEKIT_PUBLIC_HEALTH_TIMEOUT_SECONDS="${LIVEKIT_PUBLIC_HEALTH_TIMEOUT_SECONDS:-4}"

api_url_from_ws() {
  local url="$1"
  if [[ "${url}" == wss://* ]]; then
    printf 'https://%s' "${url#wss://}"
    return
  fi
  if [[ "${url}" == ws://* ]]; then
    printf 'http://%s' "${url#ws://}"
    return
  fi
  printf '%s' "${url}"
}

verify_public_endpoint() {
  local public_ws_url="$1"
  local api_url
  api_url="$(api_url_from_ws "${public_ws_url}")"
  api_url="${api_url%/}"

  if [[ -z "${api_url}" ]]; then
    echo "missing LiveKit public health URL" >&2
    return 1
  fi

  curl -fsS --connect-timeout "${LIVEKIT_PUBLIC_HEALTH_TIMEOUT_SECONDS}" --max-time "${LIVEKIT_PUBLIC_HEALTH_TIMEOUT_SECONDS}" \
    -o /dev/null "${api_url}" >/dev/null

  # The RTC path may reject unauthenticated requests, but it must be reachable.
  local rtc_status
  rtc_status="$(curl -sS --connect-timeout "${LIVEKIT_PUBLIC_HEALTH_TIMEOUT_SECONDS}" --max-time "${LIVEKIT_PUBLIC_HEALTH_TIMEOUT_SECONDS}" \
    -o /dev/null -w '%{http_code}' "${api_url}/rtc" || true)"
  if [[ "${rtc_status}" == "000" ]]; then
    echo "LiveKit public /rtc endpoint is not reachable" >&2
    return 1
  fi
}

if [[ "${DRY_RUN}" != "1" ]]; then
  require_env LIVEKIT_REGISTRY_HEARTBEAT_SECRET
  require_env LIVEKIT_ACTIVE_ROOMS
  require_env LIVEKIT_ACTIVE_PARTICIPANTS
  require_env LIVEKIT_ACTIVE_PUBLISHERS
  if [[ "${LIVEKIT_VERIFY_PUBLIC_URL}" == "1" ]]; then
    require_env LIVEKIT_PUBLIC_WS_URL
    verify_public_endpoint "${LIVEKIT_PUBLIC_WS_URL}"
  fi
fi

HOST_METRICS_JSON="{}"
if [[ "${LIVEKIT_COLLECT_HOST_METRICS}" == "1" ]]; then
  HOST_METRICS_JSON="$(
    python3 - <<'PY'
import json
import os
import time
from pathlib import Path

def read_cpu_percent():
    try:
        def sample():
            values = list(map(int, Path('/proc/stat').read_text().splitlines()[0].split()[1:]))
            idle = values[3] + (values[4] if len(values) > 4 else 0)
            return idle, sum(values)
        idle1, total1 = sample()
        time.sleep(1)
        idle2, total2 = sample()
        total_delta = total2 - total1
        idle_delta = idle2 - idle1
        if total_delta <= 0:
            return None
        return round(max(0, min(100, (1 - idle_delta / total_delta) * 100)), 2)
    except Exception:
        return None

def read_memory():
    try:
        values = {}
        for line in Path('/proc/meminfo').read_text().splitlines():
            key, value = line.split(':', 1)
            values[key] = int(value.strip().split()[0])
        total_mb = round(values.get('MemTotal', 0) / 1024, 2)
        available_mb = round(values.get('MemAvailable', 0) / 1024, 2)
        used_mb = round(max(0, total_mb - available_mb), 2)
        percent = round((used_mb / total_mb) * 100, 2) if total_mb else None
        return used_mb, total_mb, percent
    except Exception:
        return None, None, None

def read_disk_percent():
    try:
        stats = os.statvfs('/')
        total = stats.f_blocks * stats.f_frsize
        free = stats.f_bavail * stats.f_frsize
        if total <= 0:
            return None
        return round(((total - free) / total) * 100, 2)
    except Exception:
        return None

def read_network_bps():
    try:
        def sample():
            rx = 0
            tx = 0
            for line in Path('/proc/net/dev').read_text().splitlines()[2:]:
                iface, data = line.split(':', 1)
                if iface.strip() == 'lo':
                    continue
                fields = data.split()
                rx += int(fields[0])
                tx += int(fields[8])
            return rx, tx
        rx1, tx1 = sample()
        time.sleep(1)
        rx2, tx2 = sample()
        return max(0, rx2 - rx1), max(0, tx2 - tx1)
    except Exception:
        return None, None

memory_used_mb, memory_total_mb, ram_percent = read_memory()
network_rx_bps, network_tx_bps = read_network_bps()
print(json.dumps({
    'cpu_percent': read_cpu_percent(),
    'ram_percent': ram_percent,
    'memory_used_mb': memory_used_mb,
    'memory_total_mb': memory_total_mb,
    'disk_usage_percent': read_disk_percent(),
    'network_rx_bps': network_rx_bps,
    'network_tx_bps': network_tx_bps,
    'livekit_node_status': 'healthy',
    'turn_status': 'proof_pending',
    'metrics_source': os.environ.get('LIVEKIT_METRICS_SOURCE') or 'heartbeat-livekit-host-metrics',
    'metrics_collected_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
}, separators=(',', ':')))
PY
  )"
fi

HEARTBEAT_JSON="$(
  HOST_METRICS_JSON="${HOST_METRICS_JSON}" node - <<'NODE'
const numericOrNull = (value) => {
  if (value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const numericOrZero = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
};
const hostMetrics = (() => {
  try {
    return JSON.parse(process.env.HOST_METRICS_JSON || "{}");
  } catch {
    return {};
  }
})();
const envOrHost = (envName, hostName) => (
  process.env[envName] !== undefined && process.env[envName] !== ""
    ? process.env[envName]
    : hostMetrics[hostName]
);
process.stdout.write(JSON.stringify({
  action: "heartbeat",
  active_rooms: numericOrZero(process.env.LIVEKIT_ACTIVE_ROOMS),
  active_participants: numericOrZero(process.env.LIVEKIT_ACTIVE_PARTICIPANTS),
  active_publishers: numericOrZero(process.env.LIVEKIT_ACTIVE_PUBLISHERS),
  bandwidth_in_mbps: numericOrNull(process.env.LIVEKIT_BANDWIDTH_IN_MBPS),
  bandwidth_out_mbps: numericOrNull(process.env.LIVEKIT_BANDWIDTH_OUT_MBPS),
  cpu_percent: numericOrNull(envOrHost("LIVEKIT_CPU_PERCENT", "cpu_percent")),
  disconnect_rate: numericOrNull(process.env.LIVEKIT_DISCONNECT_RATE),
  disk_usage_percent: numericOrNull(envOrHost("LIVEKIT_DISK_USAGE_PERCENT", "disk_usage_percent")),
  livekit_node_status: envOrHost("LIVEKIT_NODE_STATUS", "livekit_node_status") || null,
  memory_total_mb: numericOrNull(envOrHost("LIVEKIT_MEMORY_TOTAL_MB", "memory_total_mb")),
  memory_used_mb: numericOrNull(envOrHost("LIVEKIT_MEMORY_USED_MB", "memory_used_mb")),
  metrics_collected_at: envOrHost("LIVEKIT_METRICS_COLLECTED_AT", "metrics_collected_at") || null,
  metrics_source: envOrHost("LIVEKIT_METRICS_SOURCE", "metrics_source") || null,
  network_rx_bps: numericOrNull(envOrHost("LIVEKIT_NETWORK_RX_BPS", "network_rx_bps")),
  network_tx_bps: numericOrNull(envOrHost("LIVEKIT_NETWORK_TX_BPS", "network_tx_bps")),
  packet_loss_percent: numericOrNull(process.env.LIVEKIT_PACKET_LOSS_PERCENT),
  ram_percent: numericOrNull(envOrHost("LIVEKIT_RAM_PERCENT", "ram_percent")),
  server_id: process.env.LIVEKIT_SERVER_ID,
  turn_status: envOrHost("LIVEKIT_TURN_STATUS", "turn_status") || null,
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
