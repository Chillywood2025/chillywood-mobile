#!/bin/sh
set -eu

if [ "$#" -ne 3 ]; then
  echo "usage: deploy-reviewed-release.sh SOURCE_ARCHIVE REVIEWED_MANIFEST EXPECTED_MANIFEST_SHA256" >&2
  exit 64
fi

test_root=${CHILLYWOOD_RESEARCH_TRANSPORT_TEST_ROOT:-}
if [ -n "$test_root" ]; then
  test_root=$(realpath "$test_root")
  test_marker="$test_root/.chillywood-reviewed-host-test-root"
  if [ -L "$test_marker" ] ||
     [ ! -f "$test_marker" ] ||
     [ "$(cat "$test_marker")" != "chillywood-reviewed-host-shell-harness-v1" ]; then
    echo "test_root_rejected" >&2
    exit 77
  fi
  host_prefix=$test_root
  systemctl_command="$test_root/.chillywood-reviewed-host-test-systemctl"
  readiness_command="$test_root/.chillywood-reviewed-host-test-readiness"
  if [ -L "$systemctl_command" ] ||
     [ ! -x "$systemctl_command" ] ||
     [ -L "$readiness_command" ] ||
     [ ! -x "$readiness_command" ]; then
    echo "test_command_rejected" >&2
    exit 77
  fi
else
  if [ "$(id -u)" -ne 0 ]; then
    echo "root_required" >&2
    exit 77
  fi
  host_prefix=
  systemctl_command=systemctl
  readiness_command=
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

script_directory=$(realpath "$(dirname "$0")")
contract_script="$script_directory/reviewed-release-contract.mjs"
if ! bundle_metadata=$(
  node "$contract_script" verify-deployable-bundle \
    "$source_archive" \
    "$reviewed_manifest" \
    "$expected_manifest_sha256"
); then
  echo "release_bundle_rejected" >&2
  exit 65
fi
set -- $bundle_metadata
if [ "$#" -ne 5 ]; then
  echo "release_bundle_rejected" >&2
  exit 65
fi
source_commit=$1
source_tree=$2
source_archive_sha256=$3
module_graph_sha256=$4
release_profile=$5
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
if [ "$release_profile" != \
  "chillywood-pinned-research-host-runtime-v4-current-14" ]; then
  echo "release_profile_rejected" >&2
  exit 65
fi

transport_root="$host_prefix/opt/chillywood/research-transport"
release_root="$transport_root/releases"
expected_directory="$release_root/$source_commit"
current_link="$transport_root/current"
next_link="$transport_root/.current.next"
operation_lock="$transport_root/.deployment-rollback.lock"
credential_drop_in_directory="$host_prefix/etc/systemd/system/chillywood-research-transport.service.d"
credential_drop_in_target="$credential_drop_in_directory/10-credential-compat.conf"
credential_drop_in_next="$credential_drop_in_target.next"
credential_drop_in_relative=isolated-runtime/pinned-research-transport/deploy/chillywood-research-transport-credential-compat.conf.template

if ! mkdir "$operation_lock" 2>/dev/null; then
  echo "deployment_lock_rejected" >&2
  exit 73
fi

lock_acquired=1
staging_directory=
next_link_created=0
drop_in_next_created=0
transaction_open=0
previous_target=
previous_runtime_compatible=0
previous_overlay_sha256=
previous_drop_in_state=absent
previous_drop_in_backup=

run_systemctl() {
  "$systemctl_command" "$@"
}

run_readiness() {
  if [ -n "$readiness_command" ]; then
    "$readiness_command" "$current_link"
  else
    "$current_link/isolated-runtime/pinned-research-transport/deploy/readiness.sh"
  fi
}

restore_current_link() {
  rm -f -- "$next_link"
  next_link_created=0
  if [ -n "$previous_target" ]; then
    ln -s "$previous_target" "$next_link"
    next_link_created=1
    mv -Tf "$next_link" "$current_link"
    next_link_created=0
  elif [ -L "$current_link" ]; then
    rm -f -- "$current_link"
  fi
}

restore_credential_drop_in() {
  rm -f -- "$credential_drop_in_next"
  drop_in_next_created=0
  if [ "$previous_drop_in_state" = present ]; then
    mv -Tf "$previous_drop_in_backup" "$credential_drop_in_target"
    previous_drop_in_backup=
  else
    rm -f -- "$credential_drop_in_target"
  fi
}

cleanup_operation() {
  status=$?
  trap - EXIT HUP INT TERM
  if [ "$status" -ne 0 ] && [ "$transaction_open" -eq 1 ]; then
    set +e
    restore_current_link
    restore_credential_drop_in
    run_systemctl daemon-reload
    run_systemctl stop chillywood-research-transport.service
    set -e
  fi
  if [ "$next_link_created" -eq 1 ]; then
    rm -f -- "$next_link"
  fi
  if [ "$drop_in_next_created" -eq 1 ]; then
    rm -f -- "$credential_drop_in_next"
  fi
  if [ -n "$staging_directory" ] &&
     [ -d "$staging_directory" ]; then
    if [ -n "$test_root" ]; then
      chmod -R u+w "$staging_directory"
    fi
    rm -rf -- "$staging_directory"
  fi
  if [ -n "$previous_drop_in_backup" ] &&
     [ -f "$previous_drop_in_backup" ]; then
    rm -f -- "$previous_drop_in_backup"
  fi
  if [ "$lock_acquired" -eq 1 ]; then
    rmdir "$operation_lock"
  fi
  exit "$status"
}
trap cleanup_operation EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

if [ -e "$next_link" ] || [ -L "$next_link" ] ||
   [ -e "$credential_drop_in_next" ] ||
   [ -L "$credential_drop_in_next" ]; then
  echo "stale_operation_state_rejected" >&2
  exit 73
fi

if [ -e "$current_link" ] && [ ! -L "$current_link" ]; then
  echo "current_release_link_rejected" >&2
  exit 65
fi
if [ -L "$current_link" ]; then
  previous_target=$(readlink -f "$current_link")
  case "$previous_target" in
    "$release_root"/*) ;;
    *) echo "current_release_target_rejected" >&2; exit 65 ;;
  esac
  node "$contract_script" verify-release "$previous_target" >/dev/null
fi

if [ -e "$credential_drop_in_target" ] ||
   [ -L "$credential_drop_in_target" ]; then
  if [ -L "$credential_drop_in_target" ] ||
     [ ! -f "$credential_drop_in_target" ]; then
    echo "credential_drop_in_target_rejected" >&2
    exit 65
  fi
  previous_drop_in_backup=$(mktemp "$transport_root/.credential-overlay.previous.XXXXXX")
  cp -p -- "$credential_drop_in_target" "$previous_drop_in_backup"
  previous_drop_in_state=present
fi

if [ -n "$test_root" ]; then
  expected_overlay_uid=$(id -u)
  expected_overlay_gid=$(id -g)
else
  expected_overlay_uid=0
  expected_overlay_gid=0
fi
if [ -n "$previous_target" ] &&
   previous_release_metadata=$(
     node "$contract_script" verify-active-release \
       "$previous_target" 2>/dev/null
   ); then
  set -- $previous_release_metadata
  if [ "$#" -eq 3 ]; then
    previous_source_commit=$1
    previous_manifest_sha256=$3
    if previous_overlay_sha256=$(
      node "$contract_script" verify-overlay-source \
        "$previous_target" \
        "$previous_source_commit" \
        "$previous_manifest_sha256" 2>/dev/null
    ) &&
       node "$contract_script" verify-installed-overlay \
         "$credential_drop_in_target" \
         "$previous_overlay_sha256" \
         "$expected_overlay_uid" \
         "$expected_overlay_gid" >/dev/null 2>&1; then
      previous_runtime_compatible=1
    fi
  fi
fi

if [ -e "$expected_directory" ]; then
  node "$contract_script" verify-release \
    "$expected_directory" \
    "$source_commit" \
    "$expected_manifest_sha256" >/dev/null
else
  staging_directory=$(mktemp -d "$release_root/.release.$source_commit.XXXXXX")
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
fi

credential_drop_in_source="$expected_directory/$credential_drop_in_relative"
if [ ! -f "$credential_drop_in_source" ] ||
   [ -L "$credential_drop_in_source" ]; then
  echo "credential_drop_in_source_rejected" >&2
  exit 65
fi
expected_overlay_sha256=$(
  node "$contract_script" verify-overlay-source \
    "$expected_directory" \
    "$source_commit" \
    "$expected_manifest_sha256"
)
case "$expected_overlay_sha256" in
  *[!0-9a-f]*|'') echo "credential_drop_in_source_rejected" >&2; exit 65 ;;
esac
if [ "${#expected_overlay_sha256}" -ne 64 ]; then
  echo "credential_drop_in_source_rejected" >&2
  exit 65
fi

transaction_open=1
if [ -n "$test_root" ]; then
  install -d -m 0755 "$credential_drop_in_directory"
  install -m 0644 \
    "$credential_drop_in_source" \
    "$credential_drop_in_next"
else
  install -d -o root -g root -m 0755 "$credential_drop_in_directory"
  install -o root -g root -m 0644 \
    "$credential_drop_in_source" \
    "$credential_drop_in_next"
fi
drop_in_next_created=1
mv -Tf "$credential_drop_in_next" "$credential_drop_in_target"
drop_in_next_created=0
if ! node "$contract_script" verify-installed-overlay \
  "$credential_drop_in_target" \
  "$expected_overlay_sha256" \
  "$expected_overlay_uid" \
  "$expected_overlay_gid" >/dev/null; then
  echo "installed_credential_overlay_rejected" >&2
  exit 65
fi

ln -s "$expected_directory" "$next_link"
next_link_created=1
mv -Tf "$next_link" "$current_link"
next_link_created=0

run_systemctl daemon-reload
if run_systemctl restart chillywood-research-transport.service &&
   run_readiness; then
  transaction_open=0
  echo "deployment=LOCAL_READY_PENDING_EXTERNAL_ATTESTATION"
  exit 0
fi

restore_current_link
restore_credential_drop_in
if [ "$previous_runtime_compatible" -eq 1 ] &&
   node "$contract_script" verify-installed-overlay \
     "$credential_drop_in_target" \
     "$previous_overlay_sha256" \
     "$expected_overlay_uid" \
     "$expected_overlay_gid" >/dev/null 2>&1 &&
   run_systemctl daemon-reload &&
   run_systemctl restart chillywood-research-transport.service &&
   run_readiness; then
  transaction_open=0
  echo "automatic_rollback=LOCAL_READY_PENDING_EXTERNAL_ATTESTATION" >&2
  echo "deployment=INACTIVE" >&2
  exit 1
fi
run_systemctl daemon-reload || true
run_systemctl stop chillywood-research-transport.service || true
transaction_open=0
if [ -n "$previous_target" ] &&
   [ "$previous_runtime_compatible" -ne 1 ]; then
  echo "automatic_rollback=INACTIVE_ONLY_ABI_INCOMPATIBLE" >&2
fi
echo "deployment=INACTIVE" >&2
exit 1
