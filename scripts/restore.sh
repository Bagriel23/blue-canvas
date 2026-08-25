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

rm -rf "${ASSET_STORAGE_ROOT:?}"/*
tar -xzf "$ASSET_FILE" -C "$ASSET_STORAGE_ROOT"

printf 'Restored from %s into %s\n' "$IN_DIR" "$DATABASE_NAME"
