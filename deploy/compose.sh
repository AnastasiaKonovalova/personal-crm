#!/usr/bin/env bash
# docker compose of one stand, to look at it by hand: compose.sh <prod|staging> <compose arguments>,
# for example: compose.sh staging ps, compose.sh prod logs --tail 100 app
set -euo pipefail
source "$(dirname "$0")/stand.sh"

use_stand "${1:-}"
shift
# docker compose checks the current folder: after `ssh` it is the login user's home, which crm-deploy cannot read
cd "$stand_dir"
compose "$@"
