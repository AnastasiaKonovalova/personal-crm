#!/usr/bin/env bash
# Picks the commit Deploy prod ships and writes its full SHA to the step output "sha": prod-sha.sh [sha].
#   empty: the commit of the latest successful staging deploy
#   given: the fallback, full or short; it must have a successful staging deploy too
# Either way the commit must be on main. The staging deploy history is the one GitHub keeps for the "staging"
# environment (deploy-stand.yml). Needs GH_TOKEN (contents, deployments: read), GITHUB_REPOSITORY, GITHUB_OUTPUT.
set -euo pipefail

input=${1:-}
repo=$GITHUB_REPOSITORY

fail() {
  echo "::error::$1"
  exit 1
}

# A newer successful deploy marks the older ones "inactive", so any "success" in the history counts
succeeded() {
  local ok
  ok=$(gh api "repos/$repo/deployments/$1/statuses?per_page=100" --jq 'any(.[]; .state == "success")')
  [[ $ok == true ]]
}

sha=
if [[ -z $input ]]; then
  # Newest first
  deployments=$(gh api "repos/$repo/deployments?environment=staging&per_page=50" --jq '.[] | "\(.id):\(.sha)"')
  for deployment in $deployments; do
    if succeeded "${deployment%%:*}"; then
      sha=${deployment#*:}
      break
    fi
  done
  [[ -n $sha ]] || fail "No successful staging deploy among the 50 latest"
  echo "Latest successful staging deploy: $sha"
else
  [[ $input =~ ^[0-9a-fA-F]{7,40}$ ]] || fail "Not a commit SHA: '$input'"
  full=$(gh api "repos/$repo/commits/$input" --jq .sha) || fail "No commit $input in $repo"
  ids=$(gh api "repos/$repo/deployments?environment=staging&sha=$full&per_page=100" --jq '.[].id')
  for id in $ids; do
    if succeeded "$id"; then
      sha=$full
      break
    fi
  done
  [[ -n $sha ]] || fail "$full has no successful staging deploy: deploy it to staging first"
  echo "$sha passed staging"
fi

# "ahead": main has the commit and more after it
status=$(gh api "repos/$repo/compare/$sha...main" --jq .status)
[[ $status == ahead || $status == identical ]] || fail "$sha is not on main"

echo "sha=$sha" >> "$GITHUB_OUTPUT"
