#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: readiness.sh SOURCE_COMMIT" >&2
  exit 64
fi
source_commit=$1
case "$source_commit" in
  *[!0-9a-f]*|'') echo "source_commit_rejected" >&2; exit 65 ;;
esac
if [ "${#source_commit}" -ne 40 ]; then
  echo "source_commit_rejected" >&2
  exit 65
fi

body=$(curl --fail --silent --show-error \
  --connect-timeout 2 \
  --max-time 5 \
  http://127.0.0.1:4319/healthz)
node -e '
const expected = process.argv[1];
const value = JSON.parse(process.argv[2]);
const keys = Object.keys(value).sort().join(",");
if (
  keys !== "contract,providerReadiness,sourceCommit" ||
  value.contract !== "chillywood-pinned-research-host-v1" ||
  value.providerReadiness !== "ACTIVE" ||
  value.sourceCommit !== expected
) process.exit(1);
process.stdout.write("readiness=ACTIVE\\n");
' "$source_commit" "$body"
