#!/usr/bin/env bash
# Stage build outputs for CI/CD upload (upload-artifact@v4 respects .gitignore).
set -euo pipefail

OUT_DIR="${1:-.ci-artifacts}"

rm -rf "${OUT_DIR}"
mkdir -p "${OUT_DIR}/api"
mkdir -p "${OUT_DIR}/packages/"{shared,runtime,provider,storage}
mkdir -p "${OUT_DIR}/web"

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

cp -r apps/api/dist/. "${OUT_DIR}/api/"
cp -r packages/shared/dist "${OUT_DIR}/packages/shared"
cp -r packages/runtime/dist "${OUT_DIR}/packages/runtime"
cp -r packages/provider/dist "${OUT_DIR}/packages/provider"
cp -r packages/storage/dist "${OUT_DIR}/packages/storage"
cp -r apps/web/.next "${OUT_DIR}/web/.next"

echo "Staged CI artifacts in ${OUT_DIR}"
find "${OUT_DIR}" -maxdepth 3 -type d | head -20
