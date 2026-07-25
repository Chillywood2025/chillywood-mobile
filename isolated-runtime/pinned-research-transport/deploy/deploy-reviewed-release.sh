#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
  echo "usage: deploy-reviewed-release.sh RELEASE_DIRECTORY SOURCE_COMMIT" >&2
  exit 64
fi
if [ "$(id -u)" -ne 0 ]; then
  echo "root_required" >&2
  exit 77
fi

release_directory=$1
source_commit=$2
case "$source_commit" in
  *[!0-9a-f]*|'') echo "source_commit_rejected" >&2; exit 65 ;;
esac
if [ "${#source_commit}" -ne 40 ]; then
  echo "source_commit_rejected" >&2
  exit 65
fi

expected_directory="/opt/chillywood/research-transport/releases/$source_commit"
resolved_directory=$(realpath "$release_directory")
if [ "$resolved_directory" != "$expected_directory" ]; then
  echo "release_directory_rejected" >&2
  exit 65
fi
if [ ! -f "$resolved_directory/.source-commit" ] ||
   [ "$(tr -d '\r\n' < "$resolved_directory/.source-commit")" != "$source_commit" ] ||
   [ ! -f "$resolved_directory/config/intelligence/research-authorities.json" ] ||
   [ ! -f "$resolved_directory/isolated-runtime/cloudflare/src/adapters/research-fetch-transport.mjs" ] ||
   [ ! -f "$resolved_directory/isolated-runtime/pinned-research-transport/bin/server.mjs" ] ||
   [ ! -f "$resolved_directory/isolated-runtime/pinned-research-transport/src/authority-policy.mjs" ] ||
   [ ! -f "$resolved_directory/isolated-runtime/pinned-research-transport/src/invocation-contract.mjs" ] ||
   [ ! -f "$resolved_directory/isolated-runtime/pinned-research-transport/src/pinned-public-research-transport.mjs" ]; then
  echo "release_contract_rejected" >&2
  exit 65
fi
if find "$resolved_directory" -type l -print -quit | grep -q . ||
   find "$resolved_directory" -perm /022 -print -quit | grep -q .; then
  echo "release_permissions_rejected" >&2
  exit 65
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
ln -s "$resolved_directory" "$next_link"
mv -Tf "$next_link" "$current_link"

systemctl daemon-reload
if systemctl restart chillywood-research-transport.service &&
   /opt/chillywood/research-transport/current/isolated-runtime/pinned-research-transport/deploy/readiness.sh "$source_commit"; then
  echo "deployment=ACTIVE"
  exit 0
fi

if [ -n "$previous_target" ] &&
   case "$previous_target" in
     /opt/chillywood/research-transport/releases/*) true ;;
     *) false ;;
   esac; then
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
