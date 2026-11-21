#!/usr/bin/env bash
# =============================================================================
# Mira — database backup (data only)
# =============================================================================
# Dumps everything Mira needs to move to another Postgres/Supabase:
#   public_data.sql   all app tables in the public schema (events, media,
#                     guestbook, hearts, face vectors, co-hosts, quotas …)
#   auth_users.sql    host accounts (auth.users + auth.identities)
#   public_schema.sql schema of the public schema, for reference only
#                     (restores use supabase/migrations/*.sql instead)
# rate_limits is skipped: it only holds short-lived counters.
#
# Usage:
#   DATABASE_URL='postgresql://postgres:<password>@<host>:5432/postgres' \
#     scripts/db-backup.sh [output-dir]           # default: ./backups
#
#   BACKUP_PASSPHRASE='…' encrypts the archive with AES-256 (gpg) and removes
#   the plain copy. Keep the passphrase somewhere safe: without it the backup
#   cannot be restored.
#
# DATABASE_URL: Supabase → Project Settings → Database → Connection string
# (URI, "Session pooler" or direct connection). pg_dump must be the same major
# version as the server or newer; set PG_DUMP=/path/to/pg_dump if needed.
# The backup contains personal data (names, notes, face vectors): store it
# only where you would store the database itself.
# =============================================================================
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is not set (Supabase → Project Settings → Database → Connection string)}"
PG_DUMP="${PG_DUMP:-pg_dump}"
OUT_ROOT="${1:-backups}"
STAMP="$(date -u +%Y%m%d-%H%M%SZ)"
NAME="mira-backup-${STAMP}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
DIR="$WORK/$NAME"
mkdir -p "$DIR" "$OUT_ROOT"

echo "→ pg_dump: $("$PG_DUMP" --version)"

COMMON=(--no-owner --no-privileges --no-comments --quote-all-identifiers)

echo "→ public data"
"$PG_DUMP" "$DATABASE_URL" "${COMMON[@]}" --data-only --schema=public \
  --exclude-table-data='public.rate_limits' --file="$DIR/public_data.sql"

echo "→ host accounts (auth.users, auth.identities)"
"$PG_DUMP" "$DATABASE_URL" "${COMMON[@]}" --data-only \
  --table='auth.users' --table='auth.identities' --file="$DIR/auth_users.sql"

echo "→ public schema (reference)"
"$PG_DUMP" "$DATABASE_URL" "${COMMON[@]}" --schema-only --schema=public --file="$DIR/public_schema.sql"

cat > "$DIR/MANIFEST.txt" <<MANIFEST
Mira database backup
created_utc: ${STAMP}
pg_dump:     $("$PG_DUMP" --version)
migrations:  $(ls supabase/migrations 2>/dev/null | tr '\n' ' ')
restore:     scripts/db-restore.sh (see docs/CIKIS_PLANI.md)
MANIFEST

ARCHIVE="$OUT_ROOT/$NAME.tar.gz"
tar -C "$WORK" -czf "$ARCHIVE" "$NAME"

if [[ -n "${BACKUP_PASSPHRASE:-}" ]]; then
  echo "→ encrypting (AES-256)"
  gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 3 \
    --symmetric --cipher-algo AES256 --output "$ARCHIVE.gpg" "$ARCHIVE" 3<<<"$BACKUP_PASSPHRASE"
  rm -f "$ARCHIVE"
  ARCHIVE="$ARCHIVE.gpg"
fi

echo "✓ backup written: $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"
