#!/usr/bin/env bash
# Daily backup of the prod database: backup.sh. Started at 03:00 Moscow time by the personal-crm-backup.timer
# systemd timer (personal-crm-backup.service runs it as crm-deploy); can also be run by hand.
# The same dump as before a deploy, named backups/<UTC time>-<SHA of the running version>-daily.dump;
# the 7 latest daily backups are kept. A deploy, rollback or restore of prod running now finishes first.
set -euo pipefail
source "$(dirname "$0")/stand.sh"

use_stand prod
cd "$stand_dir"

lock_stand

echo "==> Daily backup"
backup_db -daily
