#!/usr/bin/env bash
# Prints the app image a stand runs now, as recorded in its image.env: version.sh <prod|staging>.
# Called by .github/workflows/deploy-stand.yml for the summary of the run.
set -euo pipefail
source "$(dirname "$0")/stand.sh"

use_stand "${1:-}"
sed -n 's/^APP_IMAGE=//p' "$stand_dir/image.env"
