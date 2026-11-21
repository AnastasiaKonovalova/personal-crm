#!/usr/bin/env bash
# Settings of one stand, sourced by the other deploy scripts: use_stand <prod|staging>.
# The scripts and compose.yml live in /opt/personal-crm; each stand keeps its own .env (written by the owner),
# image.env / image.env.prev (current and previous app image) and lock file:
#   prod    - /opt/personal-crm          app 127.0.0.1:3000, database 127.0.0.1:5433, backup before each deploy
#                                        and daily (backup.sh), cleans up old images after a deploy
#   staging - /opt/personal-crm/staging  app 127.0.0.1:3001, database 127.0.0.1:5434, no backup; an empty
#                                        database gets a copy of the latest prod backup

scripts_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

use_stand() {
  stand="${1:-}"
  case $stand in
    prod)
      stand_dir=$scripts_dir
      backup_before_deploy=true
      daily_backup=true
      copy_prod_into_empty_db=false
      clean_up_images=true
      export APP_PORT=3000 DB_PORT=5433
      ;;
    staging)
      stand_dir=$scripts_dir/staging
      backup_before_deploy=false
      daily_backup=false
      copy_prod_into_empty_db=true
      clean_up_images=false
      export APP_PORT=3001 DB_PORT=5434
      ;;
    *)
      echo "Unknown stand '$stand': prod or staging" >&2
      exit 1
      ;;
  esac
  if [[ ! -s $stand_dir/.env ]]; then
    echo "No $stand_dir/.env: the owner writes it (README, «Тест-стенд»)" >&2
    exit 1
  fi
  touch "$stand_dir/image.env"
}

compose() {
  docker compose -p "$stand" -f "$scripts_dir/compose.yml" \
    --env-file "$stand_dir/.env" --env-file "$stand_dir/image.env" "$@"
}

# SQL from stdin against the stand's database; credentials come from the postgres container's own environment
psql_stand() {
  compose exec -T postgres sh -c 'psql -v ON_ERROR_STOP=1 -At -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
}

# One deploy, rollback or database rebuild per stand at a time: the next one waits for the current one
lock_stand() {
  exec 9> "$stand_dir/.lock"
  if ! flock -w 900 9; then
    echo "Another deploy on $stand has been running for 15 minutes: stopped" >&2
    exit 1
  fi
}

smoke() {
  for _ in $(seq 1 10); do
    if curl -fsS "http://127.0.0.1:$APP_PORT/health"; then
      echo
      return 0
    fi
    sleep 3
  done
  echo "Smoke failed: /health on $stand does not answer 200" >&2
  return 1
}

# Prod only: dumps the database into backups/<UTC time>-<version><kind>.dump, where <version> is the SHA of the
# running app (the data belongs to it, "initial" before the first deploy) and <kind> is empty for a deploy backup
# or "-daily" for a daily one. Keeps the 7 latest backups of this kind; restore.sh keeps its own *-pre-restore.dump.
# A dump that is empty or not a valid archive is removed and the function fails.
backup_db() {
  local kind=${1:-} running version backup partial
  local -a same_kind
  running=$(sed -n 's/^APP_IMAGE=//p' "$stand_dir/image.env")
  version=${running##*:}
  version=${version:-initial}
  install -d -m 700 "$stand_dir/backups"
  backup="$stand_dir/backups/$(date -u +%Y%m%dT%H%M%SZ)-${version}${kind}.dump"
  partial="$backup.partial"
  install -m 600 /dev/null "$partial"
  # Credentials come from the postgres container's own environment
  if ! compose exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$partial" ||
    [[ ! -s $partial ]] ||
    ! compose exec -T postgres pg_restore --list < "$partial" > /dev/null; then
    rm -f "$partial"
    echo "Backup failed" >&2
    return 1
  fi
  mv "$partial" "$backup"
  echo "Saved $backup ($(du -h "$backup" | cut -f1))"

  if [[ -n $kind ]]; then
    same_kind=(-name "*${kind}.dump")
  else
    same_kind=(! -name '*-daily.dump' ! -name '*-pre-restore.dump')
  fi
  # Names start with the UTC time, so sorting by name sorts by age
  find "$stand_dir/backups" -maxdepth 1 -type f -name '*.dump' "${same_kind[@]}" -printf '%f\n' |
    sort -r | tail -n +8 | while read -r old; do
    rm -f -- "$stand_dir/backups/$old"
    echo "Removed old backup $old"
  done
}

# Staging only, with its app stopped: replaces the database with the latest prod backup (deploy or daily) and drops
# the sign-in state of prod (sessions, sign-in links, the email counter), so everyone signs in to staging anew
load_latest_prod_backup() {
  local backup
  backup=$(find "$scripts_dir/backups" -maxdepth 1 -type f -name '*.dump' ! -name '*-pre-restore.dump' \
    -printf '%T@ %p\n' 2> /dev/null | sort -n | tail -1 | cut -d' ' -f2-)
  if [[ -z $backup ]]; then
    echo "No prod backup in $scripts_dir/backups" >&2
    return 1
  fi
  echo "Staging database <- $backup"
  compose exec -T postgres sh -c \
    'dropdb --force -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
  compose exec -T postgres sh -c \
    'pg_restore --no-owner --no-acl --exit-on-error --single-transaction -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
    < "$backup"
  psql_stand <<< "DELETE FROM sessions; DELETE FROM verifications; DELETE FROM login_emails;" > /dev/null
}
