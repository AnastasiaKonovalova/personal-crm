#!/usr/bin/env bash
# Deploys one app image to one stand: deploy.sh <prod|staging> <image> <registry user>, GHCR token on stdin.
#   prod:    pull -> database backup -> migrations -> new app -> smoke /health -> clean up old images
#            -> check the daily backup timer
#   staging: pull -> (empty database: copy of the latest prod backup) -> migrations -> new app -> smoke /health
# Called by .github/workflows/deploy-stand.yml over SSH. Stand settings: stand.sh.
# No automatic rollback: a failed step stops the deploy, rollback is manual (Deploy prod with rollback, rollback.sh).
set -euo pipefail
source "$(dirname "$0")/stand.sh"

usage="usage: deploy.sh <prod|staging> <image> <registry user>"
use_stand "${1:-}"
image="${2:?$usage}"
registry_user="${3:?$usage}"
repo="${image%:*}"
cd "$stand_dir"

lock_stand

# Overrides image.env until the new version passes the smoke check
export APP_IMAGE="$image"

# Tags are commit SHAs and never change: an image already on the server is not pulled again.
# The registry login lives in a folder of this deploy only: a deploy to the other stand may run at the same time
if docker image inspect "$image" > /dev/null 2>&1; then
  echo "==> Image $image is already on the server"
else
  echo "==> Pull $image"
  docker_config=$(mktemp -d)
  trap 'rm -rf "$docker_config"' EXIT
  DOCKER_CONFIG=$docker_config docker login ghcr.io -u "$registry_user" --password-stdin
  DOCKER_CONFIG=$docker_config docker pull "$image"
fi

echo "==> Database"
compose up -d --wait postgres

# The backup is named after the version that ran before this deploy; the 7 latest deploy backups are kept
if [[ $backup_before_deploy == true ]]; then
  echo "==> Backup"
  if ! backup_db; then
    echo "Migrations are not applied" >&2
    exit 1
  fi
fi

if [[ $copy_prod_into_empty_db == true ]]; then
  tables=$(psql_stand <<< "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema');")
  if [[ $tables == 0 ]]; then
    echo "==> Empty database: copy of the latest prod backup"
    load_latest_prod_backup
  fi
fi

echo "==> Migrations"
compose run --rm migrate

echo "==> App"
compose up -d --wait --wait-timeout 90 app

echo "==> Smoke /health"
smoke

echo "==> Record image"
current=$(sed -n 's/^APP_IMAGE=//p' image.env)
if [[ -n $current && $current != "$image" ]]; then
  echo "APP_IMAGE=$current" > image.env.prev
fi
echo "APP_IMAGE=$image" > image.env

if [[ $clean_up_images == true ]]; then
  echo "==> Clean up images older than 2 weeks (except the two latest prod versions and the current staging one)"
  keep=$(cat "$scripts_dir/image.env" "$scripts_dir/image.env.prev" "$scripts_dir/staging/image.env" 2> /dev/null |
    sed -n 's/^APP_IMAGE=//p' || true)
  cutoff=$(date -d '14 days ago' +%s)
  docker image ls "$repo" --format '{{.Repository}}:{{.Tag}}' | while read -r ref; do
    if [[ $ref == *:\<none\> ]] || grep -qxF "$ref" <<< "$keep"; then
      continue
    fi
    created=$(date -d "$(docker image inspect -f '{{.Created}}' "$ref")" +%s)
    if ((created < cutoff)); then
      # An image a container still uses (for example a staging deploy running now) stays
      docker image rm "$ref" > /dev/null || echo "Kept $ref: still in use"
    fi
  done
  docker image prune -f > /dev/null
fi

# The timer is installed by the owner's sudo once (README, «Бэкапы и восстановление»); the deploy only checks it.
# "::warning::" lines show up in the summary of the GitHub run
if [[ $daily_backup == true ]]; then
  echo "==> Daily backup timer"
  units=/etc/systemd/system
  if ! systemctl is-active --quiet personal-crm-backup.timer; then
    echo "::warning::The daily backup timer is not running: install it (README, «Бэкапы и восстановление»)"
  elif ! cmp -s "$scripts_dir/personal-crm-backup.timer" "$units/personal-crm-backup.timer" ||
    ! cmp -s "$scripts_dir/personal-crm-backup.service" "$units/personal-crm-backup.service"; then
    echo "::warning::The daily backup timer differs from deploy/: install it again (README, «Бэкапы и восстановление»)"
  elif systemctl is-failed --quiet personal-crm-backup.service; then
    echo "::warning::The last daily backup failed: journalctl -u personal-crm-backup"
  else
    echo "Next: $(systemctl show personal-crm-backup.timer -P NextElapseUSecRealtime)"
  fi
fi

echo "Deployed $image to $stand"
