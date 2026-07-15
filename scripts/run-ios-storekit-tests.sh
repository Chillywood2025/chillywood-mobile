#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STOREKIT_CONFIG="$ROOT_DIR/config/ios/Chillywood.storekit"

if [[ ! -f "$STOREKIT_CONFIG" ]]; then
  echo "Missing canonical StoreKit configuration"
  exit 1
fi

DEVICE_ID="${CHILLYWOOD_STOREKIT_SIMULATOR_ID:-}"
if [[ -z "$DEVICE_ID" ]]; then
  DEVICE_ID="$(xcrun simctl list devices available --json | /usr/bin/python3 -c 'import json,sys; data=json.load(sys.stdin); print(next((d["udid"] for runtime in data.get("devices", {}).values() for d in runtime if d.get("isAvailable") and "iPhone" in d.get("name", "")), ""))')"
fi

if [[ -z "$DEVICE_ID" ]]; then
  echo "No available iPhone Simulator was found"
  exit 1
fi

if ! xcrun simctl list devices available --json | jq -e --arg id "$DEVICE_ID" \
  'any(.devices[][]; .udid == $id and .isAvailable)' >/dev/null; then
  echo "The selected StoreKit Simulator is not available"
  exit 1
fi

export CHILLYWOOD_STOREKIT_CONFIG="$STOREKIT_CONFIG"
DERIVED_DATA="$(mktemp -d "${TMPDIR:-/tmp}/chillywood-storekit-tests.XXXXXX")"
trap 'rm -rf -- "$DERIVED_DATA"' EXIT
RESULT_BUNDLE="$DERIVED_DATA/StoreKitTests.xcresult"
BUILD_LOG="$DERIVED_DATA/xcodebuild.log"
TEST_TIMEOUT_SECONDS="${CHILLYWOOD_STOREKIT_TIMEOUT_SECONDS:-240}"

COCOAPODS_PREFIX="$(brew --prefix cocoapods)"
RUBY_BIN="$(brew --prefix ruby)/bin/ruby"
GEM_HOME="$COCOAPODS_PREFIX/libexec" \
  "$RUBY_BIN" "$ROOT_DIR/scripts/generate-ios-storekit-test-project.rb" "$DERIVED_DATA/project"

GENERATED_PROJECT="$DERIVED_DATA/project/ChillywoodStoreKitHarness.xcodeproj"
GENERATED_SCHEME="$GENERATED_PROJECT/xcshareddata/xcschemes/ChillywoodStoreKitHarness.xcscheme"
GENERATED_CONFIG="$DERIVED_DATA/project/Chillywood.storekit"

if ! cmp -s "$STOREKIT_CONFIG" "$GENERATED_CONFIG"; then
  echo "Generated StoreKit configuration does not match the canonical catalog"
  exit 1
fi

if ! grep -q 'StoreKitConfigurationFileReference' "$GENERATED_SCHEME" || \
  ! grep -q 'com.apple.InAppPurchase' "$GENERATED_PROJECT/project.pbxproj"; then
  echo "Generated StoreKit harness is missing its scheme configuration or capability"
  exit 1
fi

set +e
TIMEOUT_COMMAND=()
if command -v timeout >/dev/null 2>&1; then
  TIMEOUT_COMMAND=(timeout "$TEST_TIMEOUT_SECONDS")
elif command -v gtimeout >/dev/null 2>&1; then
  TIMEOUT_COMMAND=(gtimeout "$TEST_TIMEOUT_SECONDS")
fi
"${TIMEOUT_COMMAND[@]}" xcodebuild test \
  -project "$DERIVED_DATA/project/ChillywoodStoreKitHarness.xcodeproj" \
  -scheme ChillywoodStoreKitHarness \
  -destination "platform=iOS Simulator,id=$DEVICE_ID" \
  -derivedDataPath "$DERIVED_DATA" \
  -resultBundlePath "$RESULT_BUNDLE" \
  >"$BUILD_LOG" 2>&1
XCODEBUILD_STATUS=$?
set -e

if [[ ! -d "$RESULT_BUNDLE" ]]; then
  echo "StoreKit Simulator proof did not produce a result bundle"
  exit "$XCODEBUILD_STATUS"
fi

SUMMARY_JSON="$(xcrun xcresulttool get test-results summary --path "$RESULT_BUNDLE")"
TOTAL_TESTS="$(jq -r '.totalTestCount // 0' <<<"$SUMMARY_JSON")"
FAILED_TESTS="$(jq -r '.failedTests // 0' <<<"$SUMMARY_JSON")"

if [[ "$XCODEBUILD_STATUS" -eq 0 && "$TOTAL_TESTS" -eq 3 && "$FAILED_TESTS" -eq 0 ]]; then
  echo "StoreKit Simulator tests passed: 3/3"
  exit 0
fi

RUNTIME_VERSION="$(jq -r '.devicesAndConfigurations[0].device.osVersion // "unknown"' <<<"$SUMMARY_JSON")"
NOT_ENTITLED_FAILURES="$(jq '[.testFailures[]? | select(.failureText | contains("notEntitled"))] | length' <<<"$SUMMARY_JSON")"

if [[ "$TOTAL_TESTS" -eq 3 && "$FAILED_TESTS" -eq 3 && \
  "$NOT_ENTITLED_FAILURES" -eq 3 ]] && \
  grep -q 'SKInternalErrorDomain Code=3' "$BUILD_LOG"; then
  echo "BLOCKED_APPLE_STOREKIT_TOOLCHAIN"
  echo "- StoreKit scheme configuration: present"
  echo "- In-App Purchase capability marker: present"
  echo "- Simulator runtime: iOS $RUNTIME_VERSION"
  echo "- Tests executed: 3/3"
  echo "- Apple runtime result: StoreKitError.notEntitled / SKInternalErrorDomain Code 3"
  echo "- No purchase or lifecycle assertion was marked passed"
  exit 78
fi

echo "StoreKit Simulator proof failed: $FAILED_TESTS of $TOTAL_TESTS tests failed"
if [[ "$XCODEBUILD_STATUS" -eq 0 ]]; then
  exit 1
fi
exit "$XCODEBUILD_STATUS"
