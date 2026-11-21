#!/usr/bin/env bash
# =============================================================================
# Mira — restore a backup made by scripts/db-backup.sh
# =============================================================================
# Target: a Supabase project (supabase.com or self-hosted with Docker) — the
# migrations rely on its roles (anon, authenticated, service_role) and on the
# auth schema. Restore into an EMPTY project: existing rows would collide.
#
# Usage:
#   DATABASE_URL='postgresql://postgres:<password>@<new-host>:5432/postgres' \
#     scripts/db-restore.sh backups/mira-backup-….tar.gz[.gpg] [--with-migrations]
#
#   --with-migrations  first runs supabase/migrations/*.sql in order
#                      (skip it if you already ran them in the SQL editor)
#   BACKUP_PASSPHRASE  needed for .gpg archives
#
# Rows are loaded in one transaction with session_replication_role=replica so
# foreign keys and triggers do not depend on table order; heart counts and
# other values come from the backup unchanged. If anything fails (e.g. the
# target is not empty) nothing is written.
# =============================================================================
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL (target database) is not set}"
ARCHIVE="${1:?usage: db-restore.sh <backup.tar.gz[.gpg]> [--with-migrations]}"
WITH_MIGRATIONS="${2:-}"
PSQL=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --quiet --no-psqlrc)
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [[ "$ARCHIVE" == *.gpg ]]; then
  : "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is needed for an encrypted backup}"
  echo "→ decrypting"
  gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 3 \
    --decrypt --output "$WORK/backup.tar.gz" "$ARCHIVE" 3<<<"$BACKUP_PASSPHRASE"
  ARCHIVE="$WORK/backup.tar.gz"
fi
tar -C "$WORK" -xzf "$ARCHIVE"
DIR="$(find "$WORK" -maxdepth 1 -type d -name 'mira-backup-*' | head -n1)"
[[ -n "$DIR" && -f "$DIR/public_data.sql" ]] || { echo "✗ not a Mira backup: $1" >&2; exit 1; }
sed -n '1,4p' "$DIR/MANIFEST.txt" 2>/dev/null || true

if [[ "$WITH_MIGRATIONS" == "--with-migrations" ]]; then
  for file in supabase/migrations/*.sql; do
    echo "→ migration $(basename "$file")"
    "${PSQL[@]}" -f "$file"
  done
fi

echo "→ host accounts + app data"
{
  echo "BEGIN;"
  echo "SET session_replication_role = replica;"
  cat "$DIR/auth_users.sql"
  cat "$DIR/public_data.sql"
  echo "SET session_replication_role = origin;"
  echo "COMMIT;"
} | "${PSQL[@]}" --output=/dev/null

echo "→ row counts"
"${PSQL[@]}" -c "select 'events' as table, count(*) from public.events
  union all select 'media_items', count(*) from public.media_items
  union all select 'guestbook_messages', count(*) from public.guestbook_messages
  union all select 'auth.users', count(*) from auth.users;"
echo "✓ restore finished"
