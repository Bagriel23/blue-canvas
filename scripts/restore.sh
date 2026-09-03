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

IN_DIR="${1:?Backup directory is required}"
DB_FILE="$IN_DIR/database.sql.gz"
ASSET_FILE="$IN_DIR/assets.tar.gz"
CHECKSUMS_FILE="$IN_DIR/SHA256SUMS"

for file in "$DB_FILE" "$ASSET_FILE" "$CHECKSUMS_FILE"; do
  [[ -f "$file" ]] || { echo "Missing $file" >&2; exit 2; }
done

(cd "$IN_DIR" && sha256sum -c SHA256SUMS)

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
find "$ASSET_ROOT_REAL" -mindepth 1 -maxdepth 1 ! -name '.blue-canvas-assets-root' -exec rm -rf -- {} +
assert_asset_root_identity || { echo "Asset root changed during restore" >&2; exit 4; }
tar -xzf "$ASSET_FILE" -C "$ASSET_ROOT_REAL"

printf 'Restored from %s into %s\n' "$IN_DIR" "$DATABASE_NAME"
