#!/usr/bin/env bash
# Blue Canvas restore helper. Reverses scripts/backup.sh. Refuses to run
# when the target database contains tables unless BLUE_CANVAS_FORCE_RESTORE=1.
set -euo pipefail

: "${DATABASE_HOST:?DATABASE_HOST is required}"
: "${DATABASE_PORT:=3306}"
: "${DATABASE_NAME:?DATABASE_NAME is required}"
: "${DATABASE_USER:?DATABASE_USER is required}"
: "${DATABASE_PASSWORD:?DATABASE_PASSWORD is required}"
: "${ASSET_STORAGE_ROOT:?ASSET_STORAGE_ROOT is required}"

[[ "$ASSET_STORAGE_ROOT" = /* ]] || {
  echo "ASSET_STORAGE_ROOT must be an absolute path" >&2
  exit 2
}
ASSET_ROOT_REAL=$(realpath -e -- "$ASSET_STORAGE_ROOT") || {
  echo "ASSET_STORAGE_ROOT must already exist" >&2
  exit 2
}
[[ "$ASSET_ROOT_REAL" != "/" ]] || { echo "Refusing filesystem root" >&2; exit 2; }
HOME_REAL=$(realpath -m -- "${HOME:-/nonexistent}")
[[ "$ASSET_ROOT_REAL" != "$HOME_REAL" && "$ASSET_ROOT_REAL" != "$HOME_REAL"/* ]] || {
  echo "Refusing a path inside HOME" >&2
  exit 2
}
if REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null); then
  REPO_ROOT=$(realpath -e -- "$REPO_ROOT")
  [[ "$ASSET_ROOT_REAL" != "$REPO_ROOT" && "$ASSET_ROOT_REAL" != "$REPO_ROOT"/* ]] || {
    echo "Refusing a path inside the repository" >&2
    exit 2
  }
fi
[[ "$ASSET_ROOT_REAL" = "$ASSET_STORAGE_ROOT" ]] || {
  echo "ASSET_STORAGE_ROOT must not contain symlink components" >&2
  exit 2
}
ASSET_MODE=$(stat -c '%a' -- "$ASSET_ROOT_REAL")
[[ "$ASSET_MODE" =~ ^7?00$ ]] || {
  echo "ASSET_STORAGE_ROOT must be private (mode 700)" >&2
  exit 2
}
ASSET_MARKER="$ASSET_ROOT_REAL/.blue-canvas-assets-root"
[[ -f "$ASSET_MARKER" && ! -L "$ASSET_MARKER" ]] || {
  echo "Missing Blue Canvas asset root marker" >&2
  exit 2
}
ASSET_DEVICE=$(stat -c '%d' -- "$ASSET_ROOT_REAL")
ASSET_INODE=$(stat -c '%i' -- "$ASSET_ROOT_REAL")

assert_asset_root_identity() {
  local current device inode
  current=$(realpath -e -- "$ASSET_STORAGE_ROOT") || return 1
  [[ "$current" = "$ASSET_ROOT_REAL" ]] || return 1
  device=$(stat -c '%d' -- "$current") || return 1
  inode=$(stat -c '%i' -- "$current") || return 1
  [[ "$device" = "$ASSET_DEVICE" && "$inode" = "$ASSET_INODE" ]]
}

MAX_ARCHIVE_ENTRIES=100000
MAX_ASSET_BYTES=$((1024 * 1024 * 1024))
STAGING_DIR=''
SWAP_BACKUP=''

cleanup_restore_staging() {
  if [[ -n "$STAGING_DIR" && -d "$STAGING_DIR" ]]; then
    rm -rf -- "$STAGING_DIR"
  fi
}
trap cleanup_restore_staging EXIT

fail_archive() {
  echo "Refusing unsafe asset archive: $1" >&2
  exit 2
}

validate_asset_archive() {
  local archive=$1 listing entry component entry_count=0
  listing=$(mktemp)
  # Validate both entry names and entry types before any database or filesystem
  # mutation. GNU tar emits NUL-delimited names so newlines cannot hide paths.
  if ! tar --null --list --file "$archive" --gzip > "$listing"; then
    rm -f -- "$listing"
    fail_archive 'cannot read archive listing'
  fi
  while IFS= read -r -d '' entry; do
    entry_count=$((entry_count + 1))
    (( entry_count <= MAX_ARCHIVE_ENTRIES )) || {
      rm -f -- "$listing"
      fail_archive 'too many entries'
    }
    case "$entry" in
      /*|\\*|*\\*|[A-Za-z]:*)
        rm -f -- "$listing"
        fail_archive "absolute or platform path: $entry"
        ;;
    esac
    IFS='/' read -r -a components <<< "$entry"
    for component in "${components[@]}"; do
      [[ "$component" = '..' ]] || continue
      rm -f -- "$listing"
      fail_archive "parent traversal: $entry"
    done
  done < "$listing"
  rm -f -- "$listing"

  # Only regular files and directories are accepted. This rejects symlinks,
  # hardlinks, device nodes, FIFOs and other tar entry types.
  if ! tar --list --verbose --file "$archive" --gzip --quoting-style=escape |
    awk 'substr($0, 1, 1) != "-" && substr($0, 1, 1) != "d" { exit 1 }'; then
    fail_archive 'non-regular entry (link, device or special file)'
  fi
}

assert_safe_tree() {
  local tree=$1 entry type size total=0 count=0
  while IFS= read -r -d '' entry; do
    count=$((count + 1))
    (( count <= MAX_ARCHIVE_ENTRIES )) || fail_archive 'too many extracted entries'
    type=$(stat -c '%F' -- "$entry")
    case "$type" in
      directory|regular\ file) ;;
      *) fail_archive "unsafe extracted entry: $entry" ;;
    esac
    if [[ "$type" = 'regular file' ]]; then
      size=$(stat -c '%s' -- "$entry")
      (( size <= MAX_ASSET_BYTES - total )) || fail_archive 'extracted assets exceed size limit'
      total=$((total + size))
    fi
  done < <(find -P "$tree" -mindepth 1 -print0)
}

assert_staging_root() {
  local marker=$1
  [[ "$(stat -c '%a' -- "$STAGING_DIR")" =~ ^7?00$ ]] || fail_archive 'staging directory is not private'
  assert_safe_tree "$STAGING_DIR"
  [[ -f "$marker" && ! -L "$marker" ]] || fail_archive 'missing asset root marker'
  [[ "$(<"$marker")" = 'blue-canvas-assets-v1' ]] || fail_archive 'invalid asset root marker'
}

assert_promoted_root() {
  local current marker unsafe
  current=$(realpath -e -- "$ASSET_ROOT_REAL") || return 1
  [[ "$current" = "$ASSET_ROOT_REAL" && -d "$current" && ! -L "$current" ]] || return 1
  [[ "$(stat -c '%a' -- "$current")" =~ ^7?00$ ]] || return 1
  marker="$current/.blue-canvas-assets-root"
  [[ -f "$marker" && ! -L "$marker" ]] || return 1
  [[ "$(<"$marker")" = 'blue-canvas-assets-v1' ]] || return 1
  unsafe=$(find -P "$current" -mindepth 1 \( -type l -o -type b -o -type c -o -type p -o -type s \) -print -quit)
  [[ -z "$unsafe" ]]
}

promote_staging() {
  local parent old_device old_inode failed_root
  parent=$(dirname -- "$ASSET_ROOT_REAL")
  [[ "$(realpath -e -- "$parent")" = "$parent" ]] || {
    echo 'Asset root parent changed during restore' >&2
    exit 4
  }
  old_device=$ASSET_DEVICE
  old_inode=$ASSET_INODE
  SWAP_BACKUP=$(mktemp -d -- "$parent/.blue-canvas-assets.restore-backup.XXXXXX")
  rmdir -- "$SWAP_BACKUP"
  # The identity check is intentionally immediately before the destructive
  # rename. A failed second rename restores the original root.
  assert_asset_root_identity || { echo 'Asset root changed during restore' >&2; exit 4; }
  mv -T -- "$ASSET_ROOT_REAL" "$SWAP_BACKUP" || {
    echo 'Could not stage the existing asset root for replacement' >&2
    exit 5
  }
  if ! mv -T -- "$STAGING_DIR" "$ASSET_ROOT_REAL"; then
    mv -T -- "$SWAP_BACKUP" "$ASSET_ROOT_REAL" || true
    echo 'Could not promote restored assets; original root was restored' >&2
    exit 5
  fi
  STAGING_DIR=''
  ASSET_MARKER="$ASSET_ROOT_REAL/.blue-canvas-assets-root"
  if ! [[ -d "$ASSET_ROOT_REAL" && "$(stat -c '%d' -- "$ASSET_ROOT_REAL")" != "$old_device" ||
    "$(stat -c '%i' -- "$ASSET_ROOT_REAL")" != "$old_inode" ]] ||
    ! assert_promoted_root; then
    failed_root=$(mktemp -d -- "$parent/.blue-canvas-assets.failed.XXXXXX")
    rmdir -- "$failed_root"
    mv -T -- "$ASSET_ROOT_REAL" "$failed_root" || true
    mv -T -- "$SWAP_BACKUP" "$ASSET_ROOT_REAL" || true
    echo 'Promoted asset root failed post-promotion validation; original root was restored' >&2
    exit 5
  fi
  # The old root is kept until the new root passes all validation. It is then
  # removed from the sibling swap path, never through the live target path.
  if [[ "$(stat -c '%d' -- "$SWAP_BACKUP")" = "$old_device" &&
    "$(stat -c '%i' -- "$SWAP_BACKUP")" = "$old_inode" ]]; then
    rm -rf -- "$SWAP_BACKUP"
  else
    echo "Warning: old asset root retained at $SWAP_BACKUP" >&2
  fi
  SWAP_BACKUP=''
}

IN_DIR="${1:?Backup directory is required}"
DB_FILE="$IN_DIR/database.sql.gz"
ASSET_FILE="$IN_DIR/assets.tar.gz"
CHECKSUMS_FILE="$IN_DIR/SHA256SUMS"

for file in "$DB_FILE" "$ASSET_FILE" "$CHECKSUMS_FILE"; do
  [[ -f "$file" ]] || { echo "Missing $file" >&2; exit 2; }
done

(cd "$IN_DIR" && sha256sum -c SHA256SUMS)

validate_asset_archive "$ASSET_FILE"

ASSET_PARENT_REAL=$(dirname -- "$ASSET_ROOT_REAL")
[[ "$(realpath -e -- "$ASSET_PARENT_REAL")" = "$ASSET_PARENT_REAL" ]] || {
  echo 'Asset root parent must not contain symlink components' >&2
  exit 2
}
STAGING_DIR=$(mktemp -d -- "$ASSET_ROOT_REAL.restore.XXXXXX")
chmod 700 -- "$STAGING_DIR"
if ! tar --extract --gzip --file "$ASSET_FILE" --directory "$STAGING_DIR" \
  --no-same-owner --no-same-permissions --no-overwrite-dir; then
  echo 'Asset archive extraction failed' >&2
  exit 2
fi
assert_staging_root "$STAGING_DIR/.blue-canvas-assets-root"

EXISTING_TABLES=$(mysql \
  --host "$DATABASE_HOST" \
  --port "$DATABASE_PORT" \
  --user "$DATABASE_USER" \
  --password="$DATABASE_PASSWORD" \
  --silent --skip-column-names \
  --execute "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = '$DATABASE_NAME'")

if [[ "$EXISTING_TABLES" -gt 0 && "${BLUE_CANVAS_FORCE_RESTORE:-0}" != "1" ]]; then
  echo "Refusing to restore into a non-empty database (BLUE_CANVAS_FORCE_RESTORE=1 to override)" >&2
  exit 3
fi

gunzip -c "$DB_FILE" | mysql \
  --host "$DATABASE_HOST" \
  --port "$DATABASE_PORT" \
  --user "$DATABASE_USER" \
  --password="$DATABASE_PASSWORD" \
  "$DATABASE_NAME"

assert_asset_root_identity || { echo "Asset root changed during restore" >&2; exit 4; }
assert_safe_tree "$ASSET_ROOT_REAL"
promote_staging

printf 'Restored from %s into %s\n' "$IN_DIR" "$DATABASE_NAME"
