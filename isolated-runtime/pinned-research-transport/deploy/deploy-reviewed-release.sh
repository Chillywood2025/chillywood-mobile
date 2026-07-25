#!/bin/sh
set -eu

if [ "$#" -ne 3 ]; then
  echo "usage: deploy-reviewed-release.sh SOURCE_ARCHIVE REVIEWED_MANIFEST EXPECTED_MANIFEST_SHA256" >&2
  exit 64
fi
if [ "$(id -u)" -ne 0 ]; then
  echo "root_required" >&2
  exit 77
fi

source_archive=$(realpath "$1")
reviewed_manifest=$(realpath "$2")
expected_manifest_sha256=$3
case "$expected_manifest_sha256" in
  *[!0-9a-f]*|'') echo "manifest_hash_rejected" >&2; exit 65 ;;
esac
if [ "${#expected_manifest_sha256}" -ne 64 ]; then
  echo "manifest_hash_rejected" >&2
  exit 65
fi

contract_script=$(realpath "$(dirname "$0")/reviewed-release-contract.mjs")
bundle_metadata=$(
  node "$contract_script" verify-bundle \
    "$source_archive" \
    "$reviewed_manifest" \
    "$expected_manifest_sha256"
)
set -- $bundle_metadata
if [ "$#" -ne 4 ]; then
  echo "release_bundle_rejected" >&2
  exit 65
fi
source_commit=$1
source_tree=$2
source_archive_sha256=$3
module_graph_sha256=$4
case "$source_commit:$source_tree:$source_archive_sha256:$module_graph_sha256" in
  *[!0-9a-f:]*|'') echo "release_bundle_rejected" >&2; exit 65 ;;
esac
if [ "${#source_commit}" -ne 40 ] ||
   [ "${#source_tree}" -ne 40 ] ||
   [ "${#source_archive_sha256}" -ne 64 ] ||
   [ "${#module_graph_sha256}" -ne 64 ]; then
  echo "release_bundle_rejected" >&2
  exit 65
fi

release_root=/opt/chillywood/research-transport/releases
expected_directory="$release_root/$source_commit"
if [ -e "$expected_directory" ]; then
  node "$contract_script" verify-release \
    "$expected_directory" \
    "$source_commit" \
    "$expected_manifest_sha256" >/dev/null
else
  staging_directory=$(mktemp -d "$release_root/.release.$source_commit.XXXXXX")
  cleanup_staging() {
    if [ -n "${staging_directory:-}" ] &&
       [ -d "$staging_directory" ]; then
      rm -rf -- "$staging_directory"
    fi
  }
  trap cleanup_staging EXIT HUP INT TERM
  tar --extract \
    --file "$source_archive" \
    --directory "$staging_directory" \
    --no-same-owner \
    --no-same-permissions
  node "$contract_script" verify-extracted \
    "$staging_directory" \
    "$reviewed_manifest" >/dev/null
  node "$contract_script" install-metadata \
    "$staging_directory" \
    "$reviewed_manifest" \
    "$expected_manifest_sha256" >/dev/null
  find "$staging_directory" -type d -exec chmod 0555 {} +
  find "$staging_directory" -type f -exec chmod a-w {} +
  node "$contract_script" verify-release \
    "$staging_directory" \
    "$source_commit" \
    "$expected_manifest_sha256" >/dev/null
  mv "$staging_directory" "$expected_directory"
  staging_directory=
  trap - EXIT HUP INT TERM
fi

current_link=/opt/chillywood/research-transport/current
previous_target=
if [ -L "$current_link" ]; then
  previous_target=$(readlink -f "$current_link")
fi
next_link=/opt/chillywood/research-transport/.current.next
if [ -e "$next_link" ] || [ -L "$next_link" ]; then
  echo "deployment_lock_rejected" >&2
  exit 73
fi
ln -s "$expected_directory" "$next_link"
mv -Tf "$next_link" "$current_link"

systemctl daemon-reload
if systemctl restart chillywood-research-transport.service &&
   /opt/chillywood/research-transport/current/isolated-runtime/pinned-research-transport/deploy/readiness.sh; then
  echo "deployment=LOCAL_READY_PENDING_EXTERNAL_ATTESTATION"
  exit 0
fi

if [ -n "$previous_target" ] &&
   case "$previous_target" in
     /opt/chillywood/research-transport/releases/*) true ;;
     *) false ;;
   esac; then
  node "$contract_script" verify-release "$previous_target" >/dev/null
  if [ -e "$next_link" ] || [ -L "$next_link" ]; then
    echo "rollback_lock_rejected" >&2
    exit 73
  fi
  ln -s "$previous_target" "$next_link"
  mv -Tf "$next_link" "$current_link"
  systemctl restart chillywood-research-transport.service || true
fi
echo "deployment=INACTIVE" >&2
exit 1
