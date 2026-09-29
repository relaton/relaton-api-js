#!/usr/bin/env bash
# Embeds every record (docid + title + abstract) into the Vectorize
# index via the paged /admin/embed-records route. Workers AI embeds ~100
# texts per call, so the full corpus takes hours; resumable by cursor.
# Requires ADMIN_TOKEN in the environment.
set -euo pipefail
BASE_URL="${BASE_URL:-https://api.relaton.org}"
LIMIT="${LIMIT:-100}"
: "${ADMIN_TOKEN:?set ADMIN_TOKEN}"

cursor=0
total=0
while :; do
  url="$BASE_URL/admin/embed-records?limit=$LIMIT"
  [ "$cursor" != "0" ] && url="$url&cursor=$cursor"
  resp=$(curl -s -X POST "$url" -H "Authorization: Bearer $ADMIN_TOKEN")
  next=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('nextCursor') or '')" <<<"$resp" 2>/dev/null || true)
  embedded=$(python3 -c "import json,sys; print(json.load(sys.stdin).get('embedded', 0))" <<<"$resp" 2>/dev/null || echo 0)
  total=$((total + embedded))
  echo "fts-cursor=$cursor embedded=$embedded total=$total"
  [ -n "$next" ] || break
  cursor=$next
done
echo "embedding complete: $total vectors"
