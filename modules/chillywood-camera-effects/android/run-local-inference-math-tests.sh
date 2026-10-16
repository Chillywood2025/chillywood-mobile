#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
JAVA="${JAVA_HOME:+$JAVA_HOME/bin/}java"
JAVAC=("${JAVA_HOME:+$JAVA_HOME/bin/}javac")
if ! command -v "${JAVAC[0]}" >/dev/null 2>&1; then
  JAVAC=("$JAVA" -m jdk.compiler/com.sun.tools.javac.Main)
fi
SRC="$HERE/src/main/java/expo/modules/chillywoodcameraeffects"
"${JAVAC[@]}" -d "$OUT" "$SRC/EffectMath.java" "$SRC/LocalInferenceMath.java" \
  "$HERE/src/test/java/expo/modules/chillywoodcameraeffects/LocalInferenceMathTest.java"
"$JAVA" -cp "$OUT" expo.modules.chillywoodcameraeffects.LocalInferenceMathTest
# Prove the asymmetric fixture rejects a V/U-order regression.
mkdir "$OUT/mutant"
sed -e 's/float vv = sample/float swapped = sample/' \
  -e 's/float uu = sample/float vv = sample/' \
  -e 's/float r = clamp/float uu = swapped; float r = clamp/' \
  "$SRC/LocalInferenceMath.java" > "$OUT/mutant/LocalInferenceMath.java"
"${JAVAC[@]}" -d "$OUT/mutant" "$SRC/EffectMath.java" "$OUT/mutant/LocalInferenceMath.java" \
  "$HERE/src/test/java/expo/modules/chillywoodcameraeffects/LocalInferenceMathTest.java"
if "$JAVA" -cp "$OUT/mutant" expo.modules.chillywoodcameraeffects.LocalInferenceMathTest > "$OUT/mutant.log" 2>&1; then
  echo "ERROR: swapped chroma mutation was accepted" >&2
  exit 1
fi
grep -q 'red fixture R' "$OUT/mutant.log"
echo 'Swapped NV21 chroma mutation rejected'
