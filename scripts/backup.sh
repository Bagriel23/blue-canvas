#!/usr/bin/env bash
# Blue Canvas backup helper. Requires mysqldump on the PATH and the same
# DATABASE_* env vars used by the application server.
set -euo pipefail

: "${DATABASE_HOST:?DATABASE_HOST is required}"
: "${DATABASE_PORT:=3306}"
: "${DATABASE_NAME:?DATABASE_NAME is required}"
: "${DATABASE_USER:?DATABASE_USER is required}"
: "${DATABASE_PASSWORD:?DATABASE_PASSWORD is required}"
: "${ASSET_STORAGE_ROOT:?ASSET_STORAGE_ROOT is required}"

OUT_DIR="${1:-./backups/$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$OUT_DIR"

DB_FILE="$OUT_DIR/database.sql.gz"
ASSET_FILE="$OUT_DIR/assets.tar.gz"

mysqldump \
  --host "$DATABASE_HOST" \
  --port "$DATABASE_PORT" \
  --user "$DATABASE_USER" \
  --password="$DATABASE_PASSWORD" \
  --single-transaction \
  --routines \
  --triggers \
  --set-gtid-purged=OFF \
  "$DATABASE_NAME" | gzip > "$DB_FILE"

tar --owner=0 --group=0 -czf "$ASSET_FILE" -C "$ASSET_STORAGE_ROOT" .

sha256sum "$DB_FILE" "$ASSET_FILE" > "$OUT_DIR/SHA256SUMS"

printf 'Backup written to %s\n' "$OUT_DIR"
