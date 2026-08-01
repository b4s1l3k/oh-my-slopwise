#!/bin/sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

# psql does not understand Prisma-only URL parameters. Keep PostgreSQL options
# such as sslmode, but remove the parameters used only by Prisma Client.
MIGRATION_DATABASE_URL="$(node -e '
  const url = new URL(process.env.DATABASE_URL)
  for (const key of ["schema", "connection_limit", "pool_timeout", "pgbouncer"]) {
    url.searchParams.delete(key)
  }
  process.stdout.write(url.toString())
')"

MIGRATION_SCHEMA="$(node -e '
  const schema = new URL(process.env.DATABASE_URL).searchParams.get("schema") || "public"
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(schema)) process.exit(1)
  process.stdout.write(schema)
')"

export PGOPTIONS="-c search_path=${MIGRATION_SCHEMA}"

psql "$MIGRATION_DATABASE_URL" -v ON_ERROR_STOP=1 >/dev/null <<'SQL'
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" VARCHAR(36) PRIMARY KEY,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
);
SQL

for migration_file in /app/prisma/migrations/*/migration.sql; do
  migration_name="$(basename "$(dirname "$migration_file")")"
  case "$migration_name" in
    *[!A-Za-z0-9_-]*)
      echo "Unsafe migration name: $migration_name" >&2
      exit 1
      ;;
  esac
  applied="$(psql "$MIGRATION_DATABASE_URL" -Atq \
    -c "SELECT COUNT(*) FROM \"_prisma_migrations\" WHERE \"migration_name\" = '$migration_name' AND \"finished_at\" IS NOT NULL AND \"rolled_back_at\" IS NULL")"

  if [ "$applied" -gt 0 ]; then
    continue
  fi

  unfinished="$(psql "$MIGRATION_DATABASE_URL" -Atq \
    -c "SELECT COUNT(*) FROM \"_prisma_migrations\" WHERE \"migration_name\" = '$migration_name' AND \"finished_at\" IS NULL AND \"rolled_back_at\" IS NULL")"
  if [ "$unfinished" != "0" ]; then
    echo "Migration $migration_name has an unfinished previous attempt" >&2
    exit 1
  fi

  migration_id="$(node -e 'process.stdout.write(require("crypto").randomUUID())')"
  checksum="$(sha256sum "$migration_file" | awk '{print $1}')"
  psql "$MIGRATION_DATABASE_URL" -v ON_ERROR_STOP=1 >/dev/null \
    -c "INSERT INTO \"_prisma_migrations\" (\"id\", \"checksum\", \"migration_name\") VALUES ('$migration_id', '$checksum', '$migration_name')"

  echo "Applying migration $migration_name"
  if ! psql "$MIGRATION_DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction -f "$migration_file"; then
    psql "$MIGRATION_DATABASE_URL" -v ON_ERROR_STOP=1 >/dev/null \
      -c "DELETE FROM \"_prisma_migrations\" WHERE \"id\" = '$migration_id'"
    echo "Migration $migration_name failed; application startup aborted" >&2
    exit 1
  fi

  psql "$MIGRATION_DATABASE_URL" -v ON_ERROR_STOP=1 >/dev/null \
    -c "UPDATE \"_prisma_migrations\" SET \"finished_at\" = now(), \"applied_steps_count\" = 1 WHERE \"id\" = '$migration_id'"
done

exec node server.js
