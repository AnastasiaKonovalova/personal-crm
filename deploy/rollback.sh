#!/usr/bin/env bash
# Manual rollback of prod: Deploy prod with "rollback" runs it over SSH, or the owner runs it on the server.
# Swaps the current and previous app images and restarts the app; both images are kept on the server, nothing is
# pulled. Database migrations are not undone. Running it again returns to the version it rolled back from.
set -euo pipefail
source "$(dirname "$0")/stand.sh"

use_stand prod
cd "$stand_dir"

if [[ ! -s image.env.prev ]]; then
  echo "No previous image recorded" >&2
  exit 1
fi

lock_stand

mv image.env image.env.swap
mv image.env.prev image.env
mv image.env.swap image.env.prev

compose up -d --wait --wait-timeout 90 app
smoke
echo "Running $(sed -n 's/^APP_IMAGE=//p' image.env)"
