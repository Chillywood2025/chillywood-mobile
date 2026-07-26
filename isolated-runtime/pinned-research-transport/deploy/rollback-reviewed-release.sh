#!/bin/sh
set -eu

if [ "$#" -ne 4 ]; then
  echo "usage: rollback-reviewed-release.sh SOURCE_COMMIT EXPECTED_MANIFEST_SHA256 OVERLAY_SOURCE_COMMIT OVERLAY_SOURCE_MANIFEST_SHA256" >&2
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

source_commit=$1
expected_manifest_sha256=$2
overlay_source_commit=$3
overlay_source_manifest_sha256=$4
case "$source_commit" in
  *[!0-9a-f]*|'') echo "source_commit_rejected" >&2; exit 65 ;;
esac
case "$overlay_source_commit" in
  *[!0-9a-f]*|'') echo "overlay_source_commit_rejected" >&2; exit 65 ;;
esac
if [ "${#source_commit}" -ne 40 ] ||
   [ "${#overlay_source_commit}" -ne 40 ]; then
  echo "source_commit_rejected" >&2
  exit 65
fi
case "$expected_manifest_sha256" in
  *[!0-9a-f]*|'') echo "manifest_hash_rejected" >&2; exit 65 ;;
esac
case "$overlay_source_manifest_sha256" in
  *[!0-9a-f]*|'') echo "overlay_source_manifest_hash_rejected" >&2; exit 65 ;;
esac
if [ "${#expected_manifest_sha256}" -ne 64 ] ||
   [ "${#overlay_source_manifest_sha256}" -ne 64 ]; then
  echo "manifest_hash_rejected" >&2
  exit 65
fi
if [ "$source_commit" != "$overlay_source_commit" ] ||
   [ "$expected_manifest_sha256" != \
     "$overlay_source_manifest_sha256" ]; then
  echo "rollback_overlay_binding_rejected" >&2
  exit 65
fi

transport_root="$host_prefix/opt/chillywood/research-transport"
release_root="$transport_root/releases"
release_directory="$release_root/$source_commit"
overlay_source_directory="$release_root/$overlay_source_commit"
current_link="$transport_root/current"
next_link="$transport_root/.current.next"
operation_lock="$transport_root/.deployment-rollback.lock"
credential_drop_in_target="$host_prefix/etc/systemd/system/chillywood-research-transport.service.d/10-credential-compat.conf"
contract_script=$(realpath "$(dirname "$0")/reviewed-release-contract.mjs")
if [ ! -d "$release_directory" ] ||
   ! node "$contract_script" verify-active-release \
     "$release_directory" \
     "$source_commit" \
     "$expected_manifest_sha256" >/dev/null; then
  echo "rollback_target_rejected" >&2
  exit 65
fi
expected_overlay_sha256=$(
  node "$contract_script" verify-overlay-source \
    "$overlay_source_directory" \
    "$overlay_source_commit" \
    "$overlay_source_manifest_sha256"
)
case "$expected_overlay_sha256" in
  *[!0-9a-f]*|'') echo "overlay_source_rejected" >&2; exit 65 ;;
esac
if [ "${#expected_overlay_sha256}" -ne 64 ]; then
  echo "overlay_source_rejected" >&2
  exit 65
fi

if ! mkdir "$operation_lock" 2>/dev/null; then
  echo "rollback_lock_rejected" >&2
  exit 73
fi

lock_acquired=1
next_link_created=0
transaction_open=0
previous_target=
previous_runtime_compatible=0
previous_overlay_sha256=

run_systemctl() {
  "$systemctl_command" "$@"
}

run_readiness_once() {
  if [ -n "$readiness_command" ]; then
    "$readiness_command" "$current_link"
  else
    "$current_link/isolated-runtime/pinned-research-transport/deploy/readiness.sh"
  fi
}

run_readiness() {
  readiness_max_attempts=10
  readiness_total_deadline_seconds=3
  readiness_retry_interval_seconds=0.2
  readiness_started_at=$(date +%s)
  readiness_attempt=1

  while [ "$readiness_attempt" -le "$readiness_max_attempts" ]; do
    if ! run_systemctl is-active --quiet \
      chillywood-research-transport.service; then
      echo "readiness_service_inactive" >&2
      return 1
    fi

    if run_readiness_once; then
      if ! run_systemctl is-active --quiet \
        chillywood-research-transport.service; then
        echo "readiness_service_inactive" >&2
        return 1
      fi
      return 0
    else
      readiness_status=$?
    fi
    if [ "$readiness_status" -ne 7 ]; then
      return "$readiness_status"
    fi

    readiness_now=$(date +%s)
    readiness_elapsed=$((readiness_now - readiness_started_at))
    if [ "$readiness_attempt" -ge "$readiness_max_attempts" ] ||
       [ "$readiness_elapsed" -ge \
         "$readiness_total_deadline_seconds" ]; then
      echo "readiness_listener_retry_exhausted" >&2
      return 1
    fi

    sleep "$readiness_retry_interval_seconds"
    readiness_attempt=$((readiness_attempt + 1))
  done

  return 1
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

cleanup_operation() {
  status=$?
  trap - EXIT HUP INT TERM
  if [ "$status" -ne 0 ] && [ "$transaction_open" -eq 1 ]; then
    set +e
    restore_current_link
    run_systemctl daemon-reload
    if [ "$previous_runtime_compatible" -eq 1 ] &&
       node "$contract_script" verify-installed-overlay \
         "$credential_drop_in_target" \
         "$previous_overlay_sha256" \
         "$expected_overlay_uid" \
         "$expected_overlay_gid" >/dev/null 2>&1; then
      if ! run_systemctl restart chillywood-research-transport.service ||
         ! run_readiness; then
        run_systemctl stop chillywood-research-transport.service
      fi
    else
      run_systemctl stop chillywood-research-transport.service
    fi
    set -e
  fi
  if [ "$next_link_created" -eq 1 ]; then
    rm -f -- "$next_link"
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

if [ -e "$next_link" ] || [ -L "$next_link" ]; then
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
if [ -n "$test_root" ]; then
  expected_overlay_uid=$(id -u)
  expected_overlay_gid=$(id -g)
else
  expected_overlay_uid=0
  expected_overlay_gid=0
fi
if ! node "$contract_script" verify-installed-overlay \
  "$credential_drop_in_target" \
  "$expected_overlay_sha256" \
  "$expected_overlay_uid" \
  "$expected_overlay_gid" >/dev/null; then
  echo "installed_credential_overlay_rejected" >&2
  exit 65
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

transaction_open=1
ln -s "$release_directory" "$next_link"
next_link_created=1
mv -Tf "$next_link" "$current_link"
next_link_created=0
run_systemctl daemon-reload
if run_systemctl restart chillywood-research-transport.service &&
   run_readiness; then
  transaction_open=0
  echo "rollback=LOCAL_READY_PENDING_EXTERNAL_ATTESTATION"
  exit 0
fi

restore_current_link
run_systemctl daemon-reload || true
if [ -n "$previous_target" ]; then
  if [ "$previous_runtime_compatible" -eq 1 ] &&
     node "$contract_script" verify-installed-overlay \
       "$credential_drop_in_target" \
       "$previous_overlay_sha256" \
       "$expected_overlay_uid" \
       "$expected_overlay_gid" >/dev/null 2>&1; then
    if ! run_systemctl restart chillywood-research-transport.service ||
       ! run_readiness; then
      run_systemctl stop chillywood-research-transport.service || true
    fi
  else
    run_systemctl stop chillywood-research-transport.service || true
  fi
else
  run_systemctl stop chillywood-research-transport.service || true
fi
transaction_open=0
echo "rollback=INACTIVE" >&2
exit 1
