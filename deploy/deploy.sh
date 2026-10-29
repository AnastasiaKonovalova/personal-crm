#!/usr/bin/env bash
# Deploys one app image on the server: pull -> migrations -> new app -> smoke /health -> keep two images.
# Called by .github/workflows/deploy.yml over SSH: deploy.sh <image> <registry user>, GHCR token on stdin.
# No automatic rollback: a failed step stops the deploy, rollback is manual (rollback.sh).
set -euo pipefail
cd "$(dirname "$0")"

image="${1:?usage: deploy.sh <image> <registry user>}"
registry_user="${2:?usage: deploy.sh <image> <registry user>}"
repo="${image%:*}"

compose() {
  docker compose -p prod -f compose.yml --env-file .env --env-file image.env "$@"
}

touch image.env
# Overrides image.env until the new version passes the smoke check
export APP_IMAGE="$image"

echo "==> Pull $image"
docker login ghcr.io -u "$registry_user" --password-stdin
trap 'docker logout ghcr.io > /dev/null' EXIT
docker pull "$image"

echo "==> Database"
compose up -d --wait postgres

echo "==> Migrations"
compose run --rm migrate

echo "==> App"
compose up -d --wait --wait-timeout 90 app

echo "==> Smoke /health"
healthy=false
for _ in $(seq 1 10); do
  if curl -fsS http://127.0.0.1:3000/health; then
    echo
    healthy=true
    break
  fi
  sleep 3
done
if [[ $healthy != true ]]; then
  echo "Smoke failed: /health does not answer 200" >&2
  exit 1
fi

echo "==> Record image"
current=$(sed -n 's/^APP_IMAGE=//p' image.env)
if [[ -n $current && $current != "$image" ]]; then
  echo "APP_IMAGE=$current" > image.env.prev
fi
echo "APP_IMAGE=$image" > image.env

echo "==> Keep only the current and previous images"
previous=$(sed -n 's/^APP_IMAGE=//p' image.env.prev 2> /dev/null || true)
docker image ls "$repo" --format '{{.Repository}}:{{.Tag}}' | while read -r ref; do
  if [[ $ref != "$image" && $ref != "$previous" ]]; then
    docker image rm "$ref"
  fi
done
docker image prune -f > /dev/null

echo "Deployed $image"
