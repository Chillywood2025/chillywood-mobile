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
credential_drop_in_relative=isolated-runtime/pinned-research-transport/deploy/chillywood-research-transport-credential-compat.conf.template
credential_drop_in_directory=/etc/systemd/system/chillywood-research-transport.service.d
credential_drop_in_target="$credential_drop_in_directory/10-credential-compat.conf"
install_credential_drop_in() {
  selected_release=$(realpath "$1")
  case "$selected_release" in
    "$release_root"/*) ;;
    *) echo "credential_drop_in_release_rejected" >&2; exit 65 ;;
  esac
  selected_drop_in="$selected_release/$credential_drop_in_relative"
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
}
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

install_credential_drop_in "$expected_directory"
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
  install_credential_drop_in "$previous_target"
  systemctl daemon-reload
  systemctl restart chillywood-research-transport.service || true
fi
echo "deployment=INACTIVE" >&2
exit 1
