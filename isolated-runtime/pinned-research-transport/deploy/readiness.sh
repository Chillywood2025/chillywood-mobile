#!/bin/sh
set -eu

if [ "$#" -ne 0 ]; then
  echo "usage: readiness.sh" >&2
  exit 64
fi

release_directory=$(realpath "$(dirname "$0")/../../..")
contract_script="$release_directory/isolated-runtime/pinned-research-transport/deploy/reviewed-release-contract.mjs"
release_metadata=$(
  node "$contract_script" verify-active-release "$release_directory"
)
set -- $release_metadata
if [ "$#" -ne 3 ]; then
  echo "release_metadata_rejected" >&2
  exit 65
fi
source_commit=$1
source_tree=$2
release_manifest_sha256=$3

service_identity=chillywood-research-transport
persistent_credential=/etc/chillywood/research-transport/research_transport_hmac
runtime_directory=/run/chillywood-research-transport-runtime
runtime_credential="$runtime_directory/research_transport_hmac"
service_uid=$(id -u "$service_identity")
service_gid=$(id -g "$service_identity")
if [ -L "$persistent_credential" ] ||
   [ ! -f "$persistent_credential" ] ||
   [ "$(stat -c '%u:%g:%a' "$persistent_credential")" != "0:0:600" ] ||
   [ -L "$runtime_directory" ] ||
   [ "$(realpath "$runtime_directory")" != "$runtime_directory" ] ||
   [ "$(stat -c '%u:%g:%a' "$runtime_directory")" != "$service_uid:$service_gid:700" ] ||
   [ -L "$runtime_credential" ] ||
   [ ! -f "$runtime_credential" ] ||
   [ "$(stat -c '%u:%g:%a' "$runtime_credential")" != "$service_uid:$service_gid:400" ] ||
   ! cmp -s "$persistent_credential" "$runtime_credential"; then
  echo "credential_boundary=MISMATCH" >&2
  exit 65
fi

body=$(curl --fail --silent --show-error \
  --connect-timeout 2 \
  --max-time 5 \
  http://127.0.0.1:4319/healthz)
node -e '
const [sourceCommit, sourceTree, releaseManifestSha256, body] =
  process.argv.slice(1);
const value = JSON.parse(body);
const keys = Object.keys(value).sort().join(",");
if (
  keys !== "contract,providerReadiness,releaseManifestSha256,sourceCommit,sourceTree" ||
  value.contract !== "chillywood-pinned-research-host-v1" ||
  value.providerReadiness !== "ACTIVE" ||
  value.sourceCommit !== sourceCommit ||
  value.sourceTree !== sourceTree ||
  value.releaseManifestSha256 !== releaseManifestSha256
) process.exit(1);
process.stdout.write(
  "credential_boundary=MATCH\\nlocal_readiness=ACTIVE\\nexternal_attestation=REQUIRED\\n",
);
' "$source_commit" "$source_tree" "$release_manifest_sha256" "$body"
