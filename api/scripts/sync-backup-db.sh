#!/usr/bin/env bash
# Refreshes the Railway backup database from the live Render one — a
# periodic/manual snapshot, not real-time replication. Run this whenever
# the backup should catch up (before/after something important, or on
# whatever cadence you're comfortable with). See docs/DEPLOYMENT.md's
# "Backup deployment" section for the full picture — this script is just
# the pg_dump/pg_restore runbook from §4a wired into one command.
#
# Usage:
#   ./scripts/sync-backup-db.sh "<Render External Database URL>" "<Railway Postgres Public URL>"
#
# Both URLs: dashboard → the Postgres instance → "Connect" tab → public/
# external connection string (Render calls it "External Database URL";
# Railway's is under the TCP Proxy domain, postgresql://user:pass@host:port/db).
#
# Requires pg_dump/pg_restore (same major version family as the Postgres
# instances is safest, but --format=custom is broadly cross-version
# compatible for a same-schema restore like this).

set -euo pipefail

SOURCE_URL="${1:?Usage: $0 <source Render DB URL> <target Railway DB URL>}"
TARGET_URL="${2:?Usage: $0 <source Render DB URL> <target Railway DB URL>}"

DUMP_FILE="/tmp/sporthub-sync-$(date +%Y%m%d-%H%M%S).dump"

echo "Dumping source database..."
pg_dump "$SOURCE_URL" --format=custom --file="$DUMP_FILE"

echo "Restoring into backup database (this replaces its current contents)..."
pg_restore --clean --if-exists --no-owner --dbname="$TARGET_URL" "$DUMP_FILE"

echo "Verifying migration state on the backup..."
rm -f "$DUMP_FILE"

echo "Done. Sanity-check with: php artisan migrate:status (via 'railway ssh -s web') and a real login against the backup site."
