#!/usr/bin/env bash
set -euo pipefail

ARTIFACT_DIR="${ARTIFACT_DIR:-artifacts/livekit-proof-current}"
LOG_FILE="$ARTIFACT_DIR/logcat-filtered.txt"
FILTER_LABEL='Chi|Chillywood|LiveKit|WebRTC|Room|Track|publish|subscribe|camera|microphone|ICE|PeerConnection|participant|partyId|watch-party|live-stage'
FILTER_REGEX='Chi|Chillywood|LiveKit|WebRTC|Room|Track|publish|subscribe|camera|microphone|\bICE\b|PeerConnection|participant|partyId|watch-party|live-stage'

mkdir -p "$ARTIFACT_DIR"

device="${1:-${DEVICE_ID:-${ADB_DEVICE:-}}}"
if [ -z "$device" ]; then
  online_devices="$(adb devices 2>/dev/null | awk 'NR > 1 && $2 == "device" { print $1 }' || true)"
  device_count="$(printf '%s\n' "$online_devices" | sed '/^$/d' | wc -l | tr -d ' ')"
  if [ "$device_count" = "1" ]; then
    device="$online_devices"
  else
    printf 'Choose one adb device for filtered logcat:\n' >&2
    printf '%s\n' "$online_devices" >&2
    printf '\nUsage: npm run proof:livekit-logcat -- DEVICE_ID\n' >&2
    exit 2
  fi
fi

CURRENT_TASK="Run filtered LiveKit/WebRTC logcat for proof without streaming noisy logs to Codex." \
LAST_COMPLETED_STEP="About to clear old logcat and start filtered log capture for $device." \
NEXT_STEP="Reproduce the room state while this script runs; inspect $LOG_FILE after stopping it." \
  bash scripts/proof-checkpoint.sh >/dev/null

timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

adb -s "$device" logcat -c

{
  printf '# Filtered LiveKit proof logcat\n'
  printf '# started: %s\n' "$timestamp"
  printf '# device: %s\n' "$device"
  printf '# filter: %s\n\n' "$FILTER_LABEL"
} > "$LOG_FILE"

printf 'filtered logcat writing to %s for %s\n' "$LOG_FILE" "$device"
printf 'stop with Ctrl-C; full noisy logcat is not printed here.\n'

trap 'printf "\n# stopped: %s\n" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" >> "$LOG_FILE"' EXIT

adb -s "$device" logcat -v time 2>&1 \
  | FILTER_REGEX="$FILTER_REGEX" perl -ne '$|=1; print if /$ENV{FILTER_REGEX}/i' \
  >> "$LOG_FILE"
