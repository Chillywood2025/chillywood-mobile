#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/../.."
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
sdk="$(xcrun --sdk iphonesimulator --show-sdk-path)"
# Actual StoreKit types at the application's minimum iOS target, without signing or running it.
xcrun swiftc -typecheck -sdk "$sdk" -target arm64-apple-ios15.1-simulator \
  -module-cache-path "$tmp/cache" \
  modules/chillywood-test-store-admission/ios/AppTransactionEvidencePolicy.swift \
  modules/chillywood-test-store-admission/ios/AppTransactionEvidence.swift
# Execute only pure policy. Never execute AppTransaction.shared on this computer.
xcrun swiftc -module-cache-path "$tmp/cache-host" \
  modules/chillywood-test-store-admission/ios/AppTransactionEvidencePolicy.swift \
  tests/native-app-evidence/main.swift -o "$tmp/policy"
"$tmp/policy"
