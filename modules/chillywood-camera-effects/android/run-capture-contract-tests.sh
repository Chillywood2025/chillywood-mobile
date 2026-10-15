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
"$JAVAC" -cp "$CAMERA_EFFECTS_TEST_CLASSPATH" -d "$OUT" \
  "$HERE"/src/main/java/expo/modules/chillywoodcameraeffects/*.java \
  "$HERE"/src/main/java/com/oney/WebRTCModule/*.java \
  "$WEBRTC/ThreadUtils.java" "$WEBRTC"/videoEffects/*.java \
  "$HERE/src/test/java/expo/modules/chillywoodcameraeffects/CaptureContractTest.java"
"$JAVA" -cp "$CAMERA_EFFECTS_TEST_CLASSPATH:$OUT" expo.modules.chillywoodcameraeffects.CaptureContractTest
