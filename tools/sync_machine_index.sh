#!/usr/bin/env bash
# Mirror a flavor's published Pages machine index (index/manifest.json +
# index/shard-NNNNN.json) into the API, byte-for-byte, so api.relaton.org
# serves the same contract the relaton-data-* Pages sites do
# (relaton-api-js#14). Files already in R2 keep their ETags; a rerun
# rewrites objects with identical bytes, so If-None-Match clients only
# revalidate once per ingest.
#
# usage: sync_machine_index.sh <flavor> <base-url> <admin-token> [pages-base]
#   pages-base defaults to https://relaton.github.io/relaton-data-<flavor>
set -uo pipefail

flavor=$1
base=$2
token=$3
pages=${4:-https://relaton.github.io/relaton-data-$flavor}

command -v python3 >/dev/null || { echo "python3 required" >&2; exit 1; }

manifest=$(curl -sSf --retry 3 "$pages/index/manifest.json") || {
  echo "$flavor: no Pages machine index at $pages" >&2
  exit 1
}

shards=$(printf '%s' "$manifest" | python3 -c 'import json,sys; print(json.load(sys.stdin)["shards"])')
echo "$flavor: manifest ok, shards=$shards"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
printf '%s' "$manifest" > "$tmp/manifest.json"

# Shard files are sparse (a shard exists only if its bucket has rows), so
# probe the whole range and keep what answers.
pids=()
for i in $(seq 0 $((shards - 1))); do
  name=$(printf 'shard-%05d.json' "$i")
  curl -sSf --retry 2 -o "$tmp/$name" "$pages/index/$name" 2>/dev/null &
  pids+=($!)
  if [ ${#pids[@]} -ge 24 ]; then
    wait "${pids[@]}" 2>/dev/null
    pids=()
  fi
done
wait 2>/dev/null

shopt -s nullglob
files=("$tmp"/manifest.json "$tmp"/shard-*.json)
total=${#files[@]}
[ "$total" -eq 0 ] && { echo "$flavor: nothing to upload" >&2; exit 1; }
echo "$flavor: $total index files fetched"

batch=0
sent=0
req="$tmp/req-$batch.json"
start_batch() { printf '{"files":[' > "$req"; }
end_batch() {
  printf ']}' >> "$req"
  body=$(curl -sS --max-time 300 -X POST \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    --data-binary @"$req" \
    -w "\n%{http_code}" "$base/admin/ingest/$flavor/machine-index")
  code=$(printf '%s\n' "$body" | tail -1)
  if [ "$code" != "200" ]; then
    echo "$flavor: upload failed ($code): $(printf '%s\n' "$body" | head -c 200)" >&2
    exit 1
  fi
  sent=$((sent + 1))
  batch=$((batch + 1))
  req="$tmp/req-$batch.json"
}

# ~16 files per request: shards run ~100 KB and base64 grows a third, so a
# batch stays near 2 MB — well under the Workers body limit, and 1024
# shards post as ~64 requests instead of 1024.
BATCH_SIZE=16
count=0
start_batch
first=1
for f in "${files[@]}"; do
  [ "$first" -eq 0 ] && printf ',' >> "$req"
  first=0
  printf '{"name":"%s","body":"' "$(basename "$f")" >> "$req"
  base64 -i "$f" | tr -d '\n' >> "$req"
  printf '"}' >> "$req"
  count=$((count + 1))
  if [ "$count" -ge "$BATCH_SIZE" ]; then
    end_batch
    start_batch
    first=1
    count=0
  fi
done
if [ "$count" -gt 0 ]; then end_batch; fi
rm -f "$req"

echo "$flavor: $total files uploaded in $sent requests"
