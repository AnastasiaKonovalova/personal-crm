#!/usr/bin/env bash
# Deploys one app image on the server: pull -> database backup -> migrations -> new app -> smoke /health -> keep two images.
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

# The backup is named after the version that ran before this deploy; only the latest one is kept
echo "==> Backup"
running=$(sed -n 's/^APP_IMAGE=//p' image.env)
version=${running##*:}
version=${version:-initial}
install -d -m 700 backups
backup="backups/$(date -u +%Y%m%dT%H%M%SZ)-${version}.dump"
partial="$backup.partial"
install -m 600 /dev/null "$partial"
# Credentials come from the postgres container's own environment
if ! compose exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$partial" ||
  [[ ! -s $partial ]] ||
  ! compose exec -T postgres pg_restore --list < "$partial" > /dev/null; then
  rm -f "$partial"
  echo "Backup failed: migrations are not applied" >&2
  exit 1
fi
mv "$partial" "$backup"
find backups -maxdepth 1 -type f -name '*.dump' ! -name '*-pre-restore.dump' ! -path "$backup" -delete
echo "Saved $backup ($(du -h "$backup" | cut -f1))"

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
