#!/usr/bin/env bash
# Generate the shared API contract types from the API's OpenAPI document.
#
# Source of truth: the NestJS OpenAPI spec exposed at http://localhost:3000/docs-json
# (or a checked-in openapi.json export). Output lands in packages/shared/generated/
# and is consumed by the Flutter dio client and any TS tooling.
#
# Requires the API to be running (npm run api) OR an exported openapi.json.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="$(dirname "$SCRIPT_DIR")"
OUT_DIR="$PKG_DIR/generated"
SPEC_URL="${OPENAPI_URL:-http://localhost:3000/docs-json}"

mkdir -p "$OUT_DIR"

echo "==> Generating shared types from $SPEC_URL"
npx --yes openapi-typescript "$SPEC_URL" --output "$OUT_DIR/schema.ts"

echo "==> Wrote $OUT_DIR/schema.ts"
