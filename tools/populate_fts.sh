#!/usr/bin/env bash
# Walks the paged /admin/populate-fts route until the FTS index covers
# every document row. Requires ADMIN_TOKEN in the environment.
set -euo pipefail
BASE_URL="${BASE_URL:-https://api.relaton.org}"
LIMIT="${LIMIT:-5000}"
: "${ADMIN_TOKEN:?set ADMIN_TOKEN}"

resp=$(curl -s -X POST "$BASE_URL/admin/populate-fts?rebuild=1" -H "Authorization: Bearer $ADMIN_TOKEN")
if echo "$resp" | grep -q '"mode":"rebuild"'; then
  echo "fts rebuilt in one statement"
  exit 0
fi
echo "rebuild unavailable, walking pages"

cursor=0
while :; do
  url="$BASE_URL/admin/populate-fts?limit=$LIMIT"
  [ "$cursor" != "0" ] && url="$url&cursor=$cursor"
  resp=$(curl -s -X POST "$url" -H "Authorization: Bearer $ADMIN_TOKEN")
  next=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('nextCursor') or '')" <<<"$resp" 2>/dev/null || true)
  indexed=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('indexed', 0))" <<<"$resp" 2>/dev/null || echo 0)
  echo "fts cursor=$cursor indexed=$indexed"
  [ -n "$next" ] || break
  cursor=$next
done
echo "fts populate complete"
