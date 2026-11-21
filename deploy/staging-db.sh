#!/usr/bin/env bash
# Rebuilds the staging database from the latest prod backup (deploy or daily), when staging data got spoiled:
# staging-db.sh.
# Stops the staging app, loads the backup without the prod sign-in state, applies the migrations of the running
# staging version and starts it again. Prod is not touched: its backup file is only read.
set -euo pipefail
source "$(dirname "$0")/stand.sh"

use_stand staging
cd "$stand_dir"

if [[ -z $(sed -n 's/^APP_IMAGE=//p' image.env) ]]; then
  echo "Staging has no app version yet: deploy it first" >&2
  exit 1
fi

lock_stand

echo "==> Stop the app"
compose up -d --wait postgres
compose stop app

echo "==> Load the latest prod backup"
load_latest_prod_backup

echo "==> Migrations"
compose run --rm migrate

echo "==> Start the app"
compose up -d --wait --wait-timeout 90 app
smoke
echo "Staging database rebuilt"
