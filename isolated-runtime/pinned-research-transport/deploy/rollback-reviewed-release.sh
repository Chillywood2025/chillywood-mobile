#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
  echo "usage: rollback-reviewed-release.sh SOURCE_COMMIT EXPECTED_MANIFEST_SHA256" >&2
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

transport_root="$host_prefix/opt/chillywood/research-transport"
release_root="$transport_root/releases"
release_directory="$release_root/$source_commit"
current_link="$transport_root/current"
next_link="$transport_root/.current.next"
operation_lock="$transport_root/.deployment-rollback.lock"
contract_script=$(realpath "$(dirname "$0")/reviewed-release-contract.mjs")
if [ ! -d "$release_directory" ] ||
   ! node "$contract_script" verify-release \
     "$release_directory" \
     "$source_commit" \
     "$expected_manifest_sha256" >/dev/null; then
  echo "rollback_target_rejected" >&2
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

cleanup_operation() {
  status=$?
  trap - EXIT HUP INT TERM
  if [ "$status" -ne 0 ] && [ "$transaction_open" -eq 1 ]; then
    set +e
    restore_current_link
    run_systemctl daemon-reload
    if [ -n "$previous_target" ]; then
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
  if ! run_systemctl restart chillywood-research-transport.service ||
     ! run_readiness; then
    run_systemctl stop chillywood-research-transport.service || true
  fi
else
  run_systemctl stop chillywood-research-transport.service || true
fi
transaction_open=0
echo "rollback=INACTIVE" >&2
exit 1
