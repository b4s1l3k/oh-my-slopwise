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
  for (const key of ["schema", "connection_limit", "pool_timeout", "socket_timeout", "pgbouncer"]) {
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
BEGIN;
SELECT pg_advisory_xact_lock(
  hashtextextended('slopwise:migrations:' || current_schema(), 0)
);

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
CREATE UNIQUE INDEX IF NOT EXISTS "_prisma_migrations_finished_name_key"
  ON "_prisma_migrations" ("migration_name")
  WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL;
COMMIT;
SQL

for migration_file in /app/prisma/migrations/*/migration.sql; do
  migration_name="$(basename "$(dirname "$migration_file")")"
  case "$migration_name" in
    *[!A-Za-z0-9_-]*)
      echo "Unsafe migration name: $migration_name" >&2
      exit 1
      ;;
  esac
  migration_id="$(node -e 'process.stdout.write(require("crypto").randomUUID())')"
  checksum="$(sha256sum "$migration_file" | awk '{print $1}')"
  psql "$MIGRATION_DATABASE_URL" \
    -v ON_ERROR_STOP=1 \
    -v migration_id="$migration_id" \
    -v migration_name="$migration_name" \
    -v migration_checksum="$checksum" \
    -v migration_file="$migration_file" <<'SQL'
BEGIN;
SELECT pg_advisory_xact_lock(
  hashtextextended('slopwise:migrations:' || current_schema(), 0)
);

SELECT EXISTS (
  SELECT 1
  FROM "_prisma_migrations"
  WHERE "migration_name" = :'migration_name'
    AND "finished_at" IS NOT NULL
    AND "rolled_back_at" IS NULL
) AS "migration_applied" \gset

\if :migration_applied
  SELECT bool_and("checksum" = :'migration_checksum') AS "checksum_matches"
  FROM "_prisma_migrations"
  WHERE "migration_name" = :'migration_name'
    AND "finished_at" IS NOT NULL
    AND "rolled_back_at" IS NULL \gset
  \if :checksum_matches
    \echo 'Migration' :migration_name 'already applied with matching checksum'
  \else
    \warn 'Checksum mismatch for already applied migration' :migration_name
    SELECT 1 / 0;
  \endif
\else
  DELETE FROM "_prisma_migrations"
  WHERE "migration_name" = :'migration_name'
    AND "finished_at" IS NULL;
  INSERT INTO "_prisma_migrations"
    ("id", "checksum", "migration_name")
  VALUES
    (:'migration_id', :'migration_checksum', :'migration_name');
  \echo 'Applying migration' :migration_name
  \i :migration_file
  UPDATE "_prisma_migrations"
  SET "finished_at" = now(), "applied_steps_count" = 1
  WHERE "id" = :'migration_id';
\endif
COMMIT;
SQL
done

exec node server.js
