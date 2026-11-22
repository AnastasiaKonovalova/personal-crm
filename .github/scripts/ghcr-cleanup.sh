#!/usr/bin/env bash
# Keeps the <keep> latest app builds in GHCR and deletes the older ones: ghcr-cleanup.sh <keep>.
# Each build is three package versions: the image index tagged with the commit SHA and two untagged versions it
# refers to (the amd64 image and its attestation). Deleting only by count would break kept builds, so:
#   - the <keep> newest tagged versions stay, together with the versions they refer to
#   - every other version is deleted; an untagged one only when older than an hour, so a build being pushed
#     right now (its index not uploaded yet) is not touched
# Needs GH_TOKEN with packages: write, GITHUB_REPOSITORY and docker logged in to ghcr.io.
set -euo pipefail
# A failure inside $(...) stops the script too
shopt -s inherit_errexit

keep=${1:?usage: ghcr-cleanup.sh <keep>}
owner=${GITHUB_REPOSITORY%%/*}
package=${GITHUB_REPOSITORY#*/}
image=ghcr.io/${GITHUB_REPOSITORY,,}
versions_api="users/$owner/packages/container/${package,,}/versions"

# id|digest|tags (comma separated, empty when untagged)|created_at. Not tabs: read merges adjacent whitespace
# separators, so an empty tags field would vanish; "|" keeps it
versions=$(gh api --paginate "$versions_api?per_page=100" \
  --jq '.[] | [(.id | tostring), .name, (.metadata.container.tags | join(",")), .created_at] | join("|")')
tagged=$(awk -F'|' '$3 != ""' <<< "$versions" | sort -t'|' -k4,4r)
echo "Builds in GHCR: $(grep -c . <<< "$tagged" || true), keeping $keep"

# Digests of the kept builds and of everything they refer to. A failed lookup stops the script: nothing is deleted
kept=$(head -n "$keep" <<< "$tagged" | cut -d'|' -f2)
referenced=$(while read -r digest; do
  [[ -n $digest ]] || continue
  docker buildx imagetools inspect --raw "$image@$digest" | jq -r '.manifests[]?.digest'
done <<< "$kept")
keep_digests=$(printf '%s\n%s\n' "$kept" "$referenced")

hour_ago=$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)
deleted=0
while IFS='|' read -r id digest tags created; do
  [[ -n $id ]] || continue
  if grep -qxF "$digest" <<< "$keep_digests"; then
    continue
  fi
  if [[ -z $tags && $created > $hour_ago ]]; then
    continue
  fi
  gh api -X DELETE "$versions_api/$id" > /dev/null
  echo "Deleted ${tags:-untagged} $digest ($created)"
  deleted=$((deleted + 1))
done <<< "$versions"
echo "Deleted $deleted package versions"
