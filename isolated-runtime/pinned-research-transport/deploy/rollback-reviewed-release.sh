#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
  echo "usage: rollback-reviewed-release.sh SOURCE_COMMIT EXPECTED_MANIFEST_SHA256" >&2
  exit 64
fi
if [ "$(id -u)" -ne 0 ]; then
  echo "root_required" >&2
  exit 77
fi

source_commit=$1
expected_manifest_sha256=$2
case "$source_commit" in
  *[!0-9a-f]*|'') echo "source_commit_rejected" >&2; exit 65 ;;
esac
if [ "${#source_commit}" -ne 40 ]; then
  echo "source_commit_rejected" >&2
  exit 65
fi
case "$expected_manifest_sha256" in
  *[!0-9a-f]*|'') echo "manifest_hash_rejected" >&2; exit 65 ;;
esac
if [ "${#expected_manifest_sha256}" -ne 64 ]; then
  echo "manifest_hash_rejected" >&2
  exit 65
fi

release_directory="/opt/chillywood/research-transport/releases/$source_commit"
contract_script=$(realpath "$(dirname "$0")/reviewed-release-contract.mjs")
if [ ! -d "$release_directory" ] ||
   ! node "$contract_script" verify-release \
     "$release_directory" \
     "$source_commit" \
     "$expected_manifest_sha256" >/dev/null; then
  echo "rollback_target_rejected" >&2
  exit 65
fi

next_link=/opt/chillywood/research-transport/.current.next
if [ -e "$next_link" ] || [ -L "$next_link" ]; then
  echo "rollback_lock_rejected" >&2
  exit 73
fi
ln -s "$release_directory" "$next_link"
mv -Tf "$next_link" /opt/chillywood/research-transport/current
systemctl restart chillywood-research-transport.service
/opt/chillywood/research-transport/current/isolated-runtime/pinned-research-transport/deploy/readiness.sh
echo "rollback=LOCAL_READY_PENDING_EXTERNAL_ATTESTATION"
