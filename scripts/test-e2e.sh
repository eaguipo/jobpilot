#!/usr/bin/env bash
# Browser tests: build the app against the LOCAL Supabase (never your cloud project) and run Playwright.
# Needs `supabase start` first. Extra arguments go to Playwright, e.g. `npm run test:e2e -- -g "sign in"`.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! supabase status >/dev/null 2>&1; then
  echo "Local Supabase isn't running. Start it with: supabase start" >&2
  exit 1
fi

eval "$(supabase status -o env | sed -n -E 's/^(API_URL|PUBLISHABLE_KEY|ANON_KEY|SECRET_KEY|SERVICE_ROLE_KEY)=/LOCAL_\1=/p')"

# Explicit env wins over .env.local, so the e2e build talks to the local stack.
export NEXT_PUBLIC_SUPABASE_URL="$LOCAL_API_URL"
export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="${LOCAL_PUBLISHABLE_KEY:-$LOCAL_ANON_KEY}"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
# Only the test setup uses this (to create the test user); the app never sees it.
export E2E_SUPABASE_SECRET_KEY="${LOCAL_SECRET_KEY:-$LOCAL_SERVICE_ROLE_KEY}"

exec ./node_modules/.bin/playwright test "$@"
