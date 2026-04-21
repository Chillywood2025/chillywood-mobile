#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="${1:-}"

if [[ -z "$OUTPUT_DIR" ]]; then
  echo "usage: $0 /absolute/or/relative/output-dir" >&2
  exit 1
fi

ABS_OUTPUT_DIR="$(cd "$ROOT_DIR" && mkdir -p "$(dirname "$OUTPUT_DIR")" && cd "$(dirname "$OUTPUT_DIR")" && pwd)/$(basename "$OUTPUT_DIR")"
TMP_DIR="$(mktemp -d)"
EXPORT_DIR="$TMP_DIR/export"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

rm -rf "$ABS_OUTPUT_DIR"
mkdir -p "$ABS_OUTPUT_DIR"

cd "$ROOT_DIR"
EXPO_NO_DOTENV=1 EXPO_NO_DOCTOR=1 npx expo export --platform web --output-dir "$EXPORT_DIR"

mkdir -p "$ABS_OUTPUT_DIR/_expo"
cp -R "$EXPORT_DIR/_expo/." "$ABS_OUTPUT_DIR/_expo/"

for route in privacy terms account-deletion; do
  mkdir -p "$ABS_OUTPUT_DIR/$route"

  if [[ -f "$EXPORT_DIR/$route/index.html" ]]; then
    cp "$EXPORT_DIR/$route/index.html" "$ABS_OUTPUT_DIR/$route/index.html"
    continue
  fi

  if [[ -f "$EXPORT_DIR/$route.html" ]]; then
    cp "$EXPORT_DIR/$route.html" "$ABS_OUTPUT_DIR/$route/index.html"
    continue
  fi

  echo "missing exported legal route for $route" >&2
  exit 1
done

for top_level_file in favicon.ico favicon.png metadata.json; do
  if [[ -f "$EXPORT_DIR/$top_level_file" ]]; then
    cp "$EXPORT_DIR/$top_level_file" "$ABS_OUTPUT_DIR/$top_level_file"
  fi
done

echo "public legal surfaces exported to $ABS_OUTPUT_DIR"
