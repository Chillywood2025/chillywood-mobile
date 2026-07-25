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
credential_drop_in_relative=isolated-runtime/pinned-research-transport/deploy/chillywood-research-transport-credential-compat.conf.template
credential_drop_in_directory=/etc/systemd/system/chillywood-research-transport.service.d
credential_drop_in_target="$credential_drop_in_directory/10-credential-compat.conf"
contract_script=$(realpath "$(dirname "$0")/reviewed-release-contract.mjs")
if [ ! -d "$release_directory" ] ||
   ! node "$contract_script" verify-release \
     "$release_directory" \
     "$source_commit" \
     "$expected_manifest_sha256" >/dev/null; then
  echo "rollback_target_rejected" >&2
  exit 65
fi

selected_drop_in="$release_directory/$credential_drop_in_relative"
if [ ! -f "$selected_drop_in" ] || [ -L "$selected_drop_in" ]; then
  echo "credential_drop_in_source_rejected" >&2
  exit 65
fi
install -d -o root -g root -m 0755 "$credential_drop_in_directory"
credential_drop_in_next="$credential_drop_in_target.next"
if [ -e "$credential_drop_in_next" ] ||
   [ -L "$credential_drop_in_next" ]; then
  echo "credential_drop_in_lock_rejected" >&2
  exit 73
fi
install -o root -g root -m 0644 \
  "$selected_drop_in" \
  "$credential_drop_in_next"
mv -Tf "$credential_drop_in_next" "$credential_drop_in_target"

next_link=/opt/chillywood/research-transport/.current.next
if [ -e "$next_link" ] || [ -L "$next_link" ]; then
  echo "rollback_lock_rejected" >&2
  exit 73
fi
ln -s "$release_directory" "$next_link"
mv -Tf "$next_link" /opt/chillywood/research-transport/current
systemctl daemon-reload
systemctl restart chillywood-research-transport.service
/opt/chillywood/research-transport/current/isolated-runtime/pinned-research-transport/deploy/readiness.sh
echo "rollback=LOCAL_READY_PENDING_EXTERNAL_ATTESTATION"
