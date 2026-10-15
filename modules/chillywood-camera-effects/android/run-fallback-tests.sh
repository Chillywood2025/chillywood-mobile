#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
JAVA="${JAVA_HOME:+$JAVA_HOME/bin/}java"
JAVAC=("${JAVA_HOME:+$JAVA_HOME/bin/}javac")
if ! command -v "${JAVAC[0]}" >/dev/null 2>&1; then
  JAVAC=("$JAVA" -m jdk.compiler/com.sun.tools.javac.Main)
fi
: "${CAMERA_EFFECTS_TEST_CLASSPATH:?Set CAMERA_EFFECTS_TEST_CLASSPATH to the real Android, pinned WebRTC and ML Kit dependency jars}"
WEBRTC="$ROOT/node_modules/@livekit/react-native-webrtc/android/src/main/java/com/oney/WebRTCModule/videoEffects"
PRODUCTION="$HERE/src/main/java/expo/modules/chillywoodcameraeffects"
TEST="$HERE/src/test/java/expo/modules/chillywoodcameraeffects/CameraEffectFallbackTest.java"

compile() {
  local destination="$1" processor="$2"
  mkdir -p "$destination"
  "${JAVAC[@]}" -cp "$CAMERA_EFFECTS_TEST_CLASSPATH" -d "$destination" \
    "$processor" "$PRODUCTION/EffectMath.java" "$PRODUCTION/FrameBufferPool.java" \
    "$WEBRTC/VideoFrameProcessor.java" "$WEBRTC/VideoEffectProcessor.java" "$TEST"
}

compile "$OUT/current" "$PRODUCTION/CameraEffectProcessor.java"
"$JAVA" -cp "$OUT/current:$CAMERA_EFFECTS_TEST_CLASSPATH" \
  expo.modules.chillywoodcameraeffects.CameraEffectFallbackTest

# CI also verifies that the tests reject each former behavior. These narrow
# mutations leave the production algorithm intact except for the named guard;
# they do not depend on Git history being copied into the native compile job.
mkdir -p "$OUT/admission-source" "$OUT/budget-source"
node - "$PRODUCTION/CameraEffectProcessor.java" "$OUT" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const [input, out] = process.argv.slice(2);
const source = fs.readFileSync(input, 'utf8');
const admission = `      if (!inferenceReserved && (current == null || !current.matches(width, height, rotation, now))) {
        awaitingObservation();
        return null;
      }`;
const budget = `      long completed = nanoTime.getAsLong();
      if (completed - now > COMPOSITE_BUDGET_NS) {
        synchronized (stateLock) {
          if (!closed) {
            pauseUntilNs = Math.max(pauseUntilNs, completed + 500_000_000L);
            if (!state.equals("error")) {
              state = "unavailable"; reason = "Camera effect paused to preserve call performance";
            }
          }
        }
      }`;
assert.equal(source.split(admission).length, 2, 'Admission control must remove exactly the no-work guard');
assert.equal(source.split(budget).length, 2, 'Budget control must remove exactly fallback budget accounting');
fs.writeFileSync(path.join(out, 'admission-source/CameraEffectProcessor.java'), source.replace(admission, ''));
fs.writeFileSync(path.join(out, 'budget-source/CameraEffectProcessor.java'), source.replace(budget, ''));
NODE

expect_failure() {
  local classes="$1" case_name="$2" expected="$3" label="$4"
  if "$JAVA" -cp "$classes:$CAMERA_EFFECTS_TEST_CLASSPATH" \
    expo.modules.chillywoodcameraeffects.CameraEffectFallbackTest "$case_name" > "$OUT/$case_name.log" 2>&1; then
    echo "ERROR: $label unexpectedly passed $case_name" >&2
    exit 1
  fi
  grep -q "AssertionError: $expected" "$OUT/$case_name.log" || { cat "$OUT/$case_name.log" >&2; exit 1; }
  echo "$label fails the $case_name counterexample as expected"
}

cases=(no-work slow-conversion copy-fallback pool-pressure)
failures=(
  'cooldown without fresh analysis must skip texture conversion'
  'slow first conversion must enter the performance pause'
  'slow NV21 fallback must enter the performance pause'
  'pool-pressure fallback must enforce elapsed capture budget'
)
compile "$OUT/admission" "$OUT/admission-source/CameraEffectProcessor.java"
expect_failure "$OUT/admission" "${cases[0]}" "${failures[0]}" 'Removed admission guard'
compile "$OUT/budget" "$OUT/budget-source/CameraEffectProcessor.java"
for index in 1 2 3; do
  expect_failure "$OUT/budget" "${cases[$index]}" "${failures[$index]}" 'Removed fallback budget guard'
done

if [[ $# -gt 0 ]]; then
  [[ $# -eq 2 && "$1" == "--former-source" ]] || { echo "Usage: $0 [--former-source CameraEffectProcessor.java]" >&2; exit 2; }
  mkdir -p "$OUT/former-source"
  # Adapt ONLY clock/executor construction to run the same deterministic tests
  # against the former production algorithm. Admission, process(), inference,
  # release and budget logic are not rewritten or supplied by a test substitute.
  node - "$2" "$OUT/former-source/CameraEffectProcessor.java" <<'NODE'
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const [input, output] = process.argv.slice(2);
let source = fs.readFileSync(input, 'utf8');
console.log(`Former processor source SHA-256: ${createHash('sha256').update(source).digest('hex')}`);
function replaceOnce(before, after) {
  assert.equal(source.split(before).length, 2, 'Former source must match the explicit test-seam adaptation');
  source = source.replace(before, after);
}
replaceOnce('import java.util.concurrent.atomic.AtomicBoolean;',
  'import java.util.concurrent.atomic.AtomicBoolean;\nimport java.util.function.LongSupplier;');
replaceOnce(`  private final ExecutorService inferenceExecutor = Executors.newSingleThreadExecutor(r -> {
    Thread t = new Thread(r, "ChillywoodCameraInference"); t.setDaemon(true); return t;
  });`, `  private final LongSupplier nanoTime;
  private final ExecutorService inferenceExecutor;`);
replaceOnce(`  public CameraEffectProcessor(String effect, float intensity) {
    this.effect = effect; this.intensity = intensity;
  }`, `  public CameraEffectProcessor(String effect, float intensity) {
    this(effect, intensity, SystemClock::elapsedRealtimeNanos, Executors.newSingleThreadExecutor());
  }
  CameraEffectProcessor(String effect, float intensity, LongSupplier nanoTime, ExecutorService inferenceExecutor) {
    this.effect = effect; this.intensity = intensity;
    this.nanoTime = nanoTime; this.inferenceExecutor = inferenceExecutor;
  }`);
source = source.replaceAll('SystemClock.elapsedRealtimeNanos()', 'nanoTime.getAsLong()');
fs.writeFileSync(output, source);
NODE
  compile "$OUT/former" "$OUT/former-source/CameraEffectProcessor.java"
  for index in "${!cases[@]}"; do
    expect_failure "$OUT/former" "${cases[$index]}" "${failures[$index]}" 'Former production processor'
  done
fi
