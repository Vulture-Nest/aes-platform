#!/bin/sh
# Applies pending Prisma migrations against the target database, then starts the API.
# On the managed DigitalOcean Postgres, DATABASE_URL is injected as a secret at deploy time.
set -e

echo "[entrypoint] Applying database migrations (prisma migrate deploy)..."
npx prisma migrate deploy || echo "[entrypoint] No migrations to apply yet."

echo "[entrypoint] Starting AES API..."
exec node dist/main.js
