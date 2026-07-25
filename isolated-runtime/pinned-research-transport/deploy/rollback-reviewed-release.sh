#!/bin/sh
set -eu

if [ "$#" -ne 1 ]; then
  echo "usage: rollback-reviewed-release.sh SOURCE_COMMIT" >&2
  exit 64
fi
if [ "$(id -u)" -ne 0 ]; then
  echo "root_required" >&2
  exit 77
fi

source_commit=$1
case "$source_commit" in
  *[!0-9a-f]*|'') echo "source_commit_rejected" >&2; exit 65 ;;
esac
if [ "${#source_commit}" -ne 40 ]; then
  echo "source_commit_rejected" >&2
  exit 65
fi

release_directory="/opt/chillywood/research-transport/releases/$source_commit"
if [ ! -d "$release_directory" ] ||
   [ ! -f "$release_directory/.source-commit" ] ||
   [ "$(tr -d '\r\n' < "$release_directory/.source-commit")" != "$source_commit" ]; then
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
/opt/chillywood/research-transport/current/isolated-runtime/pinned-research-transport/deploy/readiness.sh "$source_commit"
echo "rollback=ACTIVE"
