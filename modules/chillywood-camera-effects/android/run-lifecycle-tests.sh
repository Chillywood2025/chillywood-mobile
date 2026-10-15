#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
JAVAC="${JAVA_HOME:+$JAVA_HOME/bin/}javac"
JAVA="${JAVA_HOME:+$JAVA_HOME/bin/}java"
"$JAVAC" -d "$OUT" \
  "$HERE/src/main/java/expo/modules/chillywoodcameraeffects/CameraEffectsLifecyclePolicy.java" \
  "$HERE/src/test/java/expo/modules/chillywoodcameraeffects/CameraEffectsLifecyclePolicyTest.java"
"$JAVA" -cp "$OUT" expo.modules.chillywoodcameraeffects.CameraEffectsLifecyclePolicyTest
