#!/usr/bin/env bash
set -euo pipefail

ARTIFACT_DIR="${ARTIFACT_DIR:-artifacts/livekit-proof-current}"
CHECKPOINT_FILE="${CHECKPOINT_FILE:-artifacts/session-resume-current.md}"
CURRENT_TASK="${CURRENT_TASK:-Create and use a filtered LiveKit proof lane for Android room testing without changing app behavior.}"
LAST_COMPLETED_STEP="${LAST_COMPLETED_STEP:-Filtered proof tooling created; current device/proof state captured.}"
NEXT_STEP="${NEXT_STEP:-Start filtered logcat for the target device, reproduce the LiveKit room state, then capture screenshots and final git status.}"

mkdir -p "$ARTIFACT_DIR" "$(dirname "$CHECKPOINT_FILE")"

TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

git branch --show-current > "$ARTIFACT_DIR/git-branch.txt" 2>&1 || true
git rev-parse --short HEAD > "$ARTIFACT_DIR/git-head.txt" 2>&1 || true
git status --short > "$ARTIFACT_DIR/git-status-short.txt" 2>&1 || true
adb devices > "$ARTIFACT_DIR/adb-devices.txt" 2>&1 || true
printf '%s\n' "$TIMESTAMP" > "$ARTIFACT_DIR/timestamp.txt"

{
  printf 'timestamp: %s\n\n' "$TIMESTAMP"
  printf '$ adb devices\n'
  adb devices 2>&1 || true
  printf '\n'

  devices="$(adb devices 2>/dev/null | awk 'NR > 1 && $2 == "device" { print $1 }' || true)"
  if [ -z "$devices" ]; then
    printf 'No online adb devices found for adb reverse --list.\n'
  else
    for device in $devices; do
      printf '$ adb -s %s reverse --list\n' "$device"
      adb -s "$device" reverse --list 2>&1 || true
      printf '\n'
    done
  fi
} > "$ARTIFACT_DIR/adb-reverse-list.txt"

device_ids="$(adb devices 2>/dev/null | awk 'NR > 1 && $2 == "device" { print "- " $1 }' || true)"
changed_files="$(git status --short 2>/dev/null || true)"

cat > "$CHECKPOINT_FILE" <<EOF
# Session Resume Checkpoint

Timestamp: $TIMESTAMP

Current task:
$CURRENT_TASK

Allowed files:
- scripts/livekit-proof-logcat.sh
- scripts/proof-checkpoint.sh
- package.json
- .vscode/tasks.json only if needed
- artifacts/livekit-proof-current/
- artifacts/session-resume-current.md

Changed files:
\`\`\`
${changed_files:-clean}
\`\`\`

Device IDs:
${device_ids:-No online adb devices found.}

Artifact folder:
$ARTIFACT_DIR

Last completed proof step:
$LAST_COMPLETED_STEP

Next step:
$NEXT_STEP

Resume commands:
\`\`\`sh
npm run proof:checkpoint
npm run proof:livekit-logcat -- DEVICE_ID
\`\`\`
EOF

printf 'checkpoint saved: %s\n' "$CHECKPOINT_FILE"
printf 'proof metadata saved: %s\n' "$ARTIFACT_DIR"
