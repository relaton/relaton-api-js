#!/usr/bin/env bash
# Backfills the status column for already-ingested documents, per flavor,
# walking the paged /admin/backfill-status route until exhausted.
# Requires ADMIN_TOKEN in the environment (the worker's admin secret).
set -euo pipefail
BASE_URL="${BASE_URL:-https://api.relaton.org}"
LIMIT="${LIMIT:-500}"
: "${FLAVORS:?set FLAVORS (space-separated)}"
: "${ADMIN_TOKEN:?set ADMIN_TOKEN}"

for flavor in $FLAVORS; do
  cursor=0
  while :; do
    url="$BASE_URL/admin/backfill-status/$flavor?limit=$LIMIT"
    [ "$cursor" != "0" ] && url="$url&cursor=$cursor"
    resp=$(curl -s -X POST "$url" -H "Authorization: Bearer $ADMIN_TOKEN")
    next=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('nextCursor') or '')" <<<"$resp" 2>/dev/null || true)
    updated=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('updated', 0))" <<<"$resp" 2>/dev/null || echo 0)
    echo "$flavor cursor=$cursor updated=$updated"
    [ -n "$next" ] || break
    cursor=$next
  done
done
echo "status backfill complete"
