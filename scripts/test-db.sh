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

# The reset restarts auth and makes the API (PostgREST) reconnect to Postgres. It can answer once
# and then drop the connection again, so wait for 3 healthy checks in a row (max ~60 s).
key="${PUBLISHABLE_KEY:-$ANON_KEY}"
ok=0
for _ in $(seq 1 120); do
  auth=$(curl -s -o /dev/null -w '%{http_code}' -H "apikey: $key" "$API_URL/auth/v1/health" || true)
  rest=$(curl -s -o /dev/null -w '%{http_code}' -H "apikey: $key" -H "Authorization: Bearer $key" "$API_URL/rest/v1/jobs?select=id&limit=1" || true)
  if [ "$auth" = "200" ] && [ "$rest" != "000" ] && [ "${rest:0:1}" != "5" ]; then
    ok=$((ok + 1))
    [ "$ok" -ge 3 ] && break
  else
    ok=0
  fi
  sleep 0.5
done
if [ "$ok" -lt 3 ]; then
  echo "Local Supabase didn't become ready after the reset (auth=$auth api=$rest)." >&2
  exit 1
fi
SUPABASE_DB_TEST=1 ./node_modules/.bin/vitest run .db.test "$@"
