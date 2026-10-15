#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
JAVAC="${JAVA_HOME:+$JAVA_HOME/bin/}javac"
JAVA="${JAVA_HOME:+$JAVA_HOME/bin/}java"
: "${CAMERA_EFFECTS_TEST_CLASSPATH:?Set CAMERA_EFFECTS_TEST_CLASSPATH to the real Android, WebRTC and ML Kit dependency jars}"
WEBRTC="$ROOT/node_modules/@livekit/react-native-webrtc/android/src/main/java/com/oney/WebRTCModule"
mkdir -p "$OUT/patched" "$OUT/original-source" "$OUT/original-classes"
cp "$WEBRTC"/videoEffects/*.java "$OUT/patched/"
# Compile the real pinned wrapper after the exact production plugin transform.
# Keep an unpatched control without modifying checkout node_modules.
node - "$ROOT" "$OUT" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const [root, out] = process.argv.slice(2);
const patch = require(path.join(root, 'plugins/withWebRtcCameraEffectOwnership.js')).__test;
const filename = path.join(out, 'patched/VideoEffectProcessor.java');
const source = fs.readFileSync(filename, 'utf8');
fs.writeFileSync(filename, patch.transformSource(source));
fs.writeFileSync(path.join(out, 'original-source/VideoEffectProcessor.java'), patch.transformSource(source, true));
NODE
"$JAVAC" -cp "$CAMERA_EFFECTS_TEST_CLASSPATH" -d "$OUT" \
  "$HERE"/src/main/java/expo/modules/chillywoodcameraeffects/*.java \
  "$HERE"/src/main/java/com/oney/WebRTCModule/*.java \
  "$WEBRTC/ThreadUtils.java" "$OUT"/patched/*.java \
  "$HERE/src/test/java/com/oney/WebRTCModule/CameraEffectQueueContract.java" \
  "$HERE/src/test/java/expo/modules/chillywoodcameraeffects/CaptureContractTest.java"
"$JAVA" -cp "$CAMERA_EFFECTS_TEST_CLASSPATH:$OUT" expo.modules.chillywoodcameraeffects.CaptureContractTest
"$JAVAC" -cp "$CAMERA_EFFECTS_TEST_CLASSPATH:$OUT" -d "$OUT/original-classes" "$OUT/original-source/VideoEffectProcessor.java"
if "$JAVA" -cp "$OUT/original-classes:$OUT:$CAMERA_EFFECTS_TEST_CLASSPATH" \
  expo.modules.chillywoodcameraeffects.CaptureContractTest --queue-only > "$OUT/former-source.log" 2>&1; then
  echo "ERROR: former SDK source unexpectedly passed delayed-attach ownership" >&2
  exit 1
fi
grep -q 'queued empty chain must preserve capturer ownership' "$OUT/former-source.log"
echo "Former SDK source fails the exact delayed-attach queue counterexample as expected"
