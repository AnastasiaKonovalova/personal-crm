#!/usr/bin/env bash
# Manual restore of prod, run by the owner on the server: restore.sh <backup file>.
# Asks for "yes", dumps the current database (backups/*-pre-restore.dump, only the latest is kept),
# stops the app, drops and recreates the database, loads the backup and starts the same app version.
# The app version is not changed: image.env is left as it is.
set -euo pipefail

arg="${1:?usage: restore.sh <backup file>}"
if [[ ! -f $arg || ! -s $arg ]]; then
  echo "Backup file not found or empty: $arg" >&2
  exit 1
fi
backup=$(realpath -- "$arg")

source "$(dirname "$0")/stand.sh"
use_stand prod
cd "$stand_dir"

image=$(sed -n 's/^APP_IMAGE=//p' image.env 2> /dev/null || true)
if [[ -z $image ]]; then
  echo "No app image recorded in image.env" >&2
  exit 1
fi

compose up -d --wait postgres
database=$(compose exec -T postgres sh -c 'printf %s "$POSTGRES_DB"')

if ! compose exec -T postgres pg_restore --list < "$backup" > /dev/null; then
  echo "Not a valid backup (pg_dump -Fc archive): $backup" >&2
  exit 1
fi

echo "Backup file: $backup ($(du -h "$backup" | cut -f1), $(date -u -r "$backup" '+%Y-%m-%d %H:%M UTC'))"
echo "Database:    $database (docker compose project prod, service postgres) - all its data will be replaced"
echo "App version: $image (stays the same)"
read -r -p 'Type "yes" to restore: ' answer
if [[ $answer != yes ]]; then
  echo "Cancelled, nothing changed"
  exit 1
fi

# A deploy or rollback of prod running now finishes first
lock_stand

echo "==> Copy of the current database"
install -d -m 700 backups
copy="backups/$(date -u +%Y%m%dT%H%M%SZ)-${image##*:}-pre-restore.dump"
partial="$copy.partial"
install -m 600 /dev/null "$partial"
if ! compose exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$partial" ||
  [[ ! -s $partial ]]; then
  rm -f "$partial"
  echo "Could not copy the current database: nothing changed" >&2
  exit 1
fi
mv "$partial" "$copy"
copy=$(realpath -- "$copy")
# Keep only this copy; never delete the file being restored
find backups -maxdepth 1 -type f -name '*-pre-restore.dump' ! -path "backups/$(basename "$copy")" -print0 |
  while IFS= read -r -d '' old; do
    if [[ $(realpath -- "$old") != "$backup" ]]; then
      rm -f -- "$old"
    fi
  done
echo "Saved $copy"

trap 'echo "Restore failed: the app is stopped. Data before the restore: $copy" >&2' ERR

echo "==> Stop the app"
compose stop app

echo "==> Recreate the database"
compose exec -T postgres sh -c 'dropdb --force -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'

echo "==> Load the backup"
compose exec -T postgres sh -c 'pg_restore --no-owner --exit-on-error --single-transaction -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < "$backup"

echo "==> Start the app"
compose up -d --wait --wait-timeout 90 app

echo "==> Smoke /health"
if ! smoke; then
  echo "Data before the restore: $copy" >&2
  exit 1
fi

trap - ERR
echo "Restored $backup, running $image"
