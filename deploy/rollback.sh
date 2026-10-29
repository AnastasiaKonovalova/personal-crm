#!/usr/bin/env bash
# Manual rollback, run by the owner on the server: swaps the current and previous app images and restarts the app.
# Database migrations are not undone. Running it again returns to the version it rolled back from.
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -s image.env.prev ]]; then
  echo "No previous image recorded" >&2
  exit 1
fi

mv image.env image.env.swap
mv image.env.prev image.env
mv image.env.swap image.env.prev

docker compose -p prod -f compose.yml --env-file .env --env-file image.env up -d --wait --wait-timeout 90 app
curl -fsS http://127.0.0.1:3000/health
echo
echo "Running $(sed -n 's/^APP_IMAGE=//p' image.env)"
