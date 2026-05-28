#!/usr/bin/env bash
# Stage build outputs for upload-artifact@v4.
#
# upload-artifact v4 applies .gitignore to uploaded paths. Patterns like
# ".next/" and "dist/" will exclude nested folders even under a staging dir.
# Therefore:
#   - flatten dist/.next CONTENTS into neutral folder names (no "dist" / ".next" segments)
#   - do NOT gitignore the staging root (artifact-output/)
set -euo pipefail

OUT_DIR="${1:-artifact-output}"

rm -rf "${OUT_DIR}"
mkdir -p "${OUT_DIR}/api"
mkdir -p "${OUT_DIR}/packages/"{shared,runtime,provider,storage}
mkdir -p "${OUT_DIR}/web-next"

require_dir() {
  if [ ! -d "$1" ]; then
    echo "Missing build output: $1" >&2
    exit 1
  fi
}

require_dir apps/api/dist
require_dir apps/web/.next
require_dir packages/shared/dist
require_dir packages/runtime/dist
require_dir packages/provider/dist
require_dir packages/storage/dist

# Flatten — avoid "dist/" path segments in staged tree
cp -r apps/api/dist/. "${OUT_DIR}/api/"
cp -r packages/shared/dist/. "${OUT_DIR}/packages/shared/"
cp -r packages/runtime/dist/. "${OUT_DIR}/packages/runtime/"
cp -r packages/provider/dist/. "${OUT_DIR}/packages/provider/"
cp -r packages/storage/dist/. "${OUT_DIR}/packages/storage/"

# Rename — avoid ".next/" path segment (gitignore would exclude the upload)
cp -r apps/web/.next/. "${OUT_DIR}/web-next/"

FILE_COUNT="$(find "${OUT_DIR}" -type f | wc -l | tr -d ' ')"
if [ "${FILE_COUNT}" -lt 10 ]; then
  echo "Too few staged files (${FILE_COUNT}); build outputs may be empty." >&2
  exit 1
fi

echo "Staged ${FILE_COUNT} files in ${OUT_DIR}"
echo "Sample web-next files:"
# head closes the pipe early; find then gets SIGPIPE — ignore under pipefail
find "${OUT_DIR}/web-next" -type f 2>/dev/null | head -5 || true
