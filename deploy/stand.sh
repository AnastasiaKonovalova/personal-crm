#!/usr/bin/env bash
# Settings of one stand, sourced by the other deploy scripts: use_stand <prod|staging>.
# The scripts and compose.yml live in /opt/personal-crm; each stand keeps its own .env (written by the owner),
# image.env / image.env.prev (current and previous app image) and lock file:
#   prod    - /opt/personal-crm          app 127.0.0.1:3000, database 127.0.0.1:5433, backup before each deploy,
#                                        cleans up old images after a deploy
#   staging - /opt/personal-crm/staging  app 127.0.0.1:3001, database 127.0.0.1:5434, no backup; an empty
#                                        database gets a copy of the latest prod backup

scripts_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

use_stand() {
  stand="${1:-}"
  case $stand in
    prod)
      stand_dir=$scripts_dir
      backup_before_deploy=true
      copy_prod_into_empty_db=false
      clean_up_images=true
      export APP_PORT=3000 DB_PORT=5433
      ;;
    staging)
      stand_dir=$scripts_dir/staging
      backup_before_deploy=false
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

# Staging only, with its app stopped: replaces the database with the latest prod deploy backup and drops the
# sign-in state of prod (sessions, sign-in links, the email counter), so everyone signs in to staging anew
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
