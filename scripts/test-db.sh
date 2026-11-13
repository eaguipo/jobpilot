#!/usr/bin/env bash
# Runs the database (RLS) tests against the LOCAL Supabase started with `supabase start`.
# Resets the local database first, so every run starts from the migrations.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! supabase status >/dev/null 2>&1; then
  echo "Local Supabase isn't running. Start it with: supabase start" >&2
  exit 1
fi

supabase db reset --local >/dev/null
set -a
eval "$(supabase status -o env)"
set +a
SUPABASE_DB_TEST=1 ./node_modules/.bin/vitest run .db.test "$@"
