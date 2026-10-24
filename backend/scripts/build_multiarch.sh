#!/usr/bin/env bash
# ==============================================================================
# ArmGuard Release Build Script
# Builds the Vue 3 frontend assets, bundles Node.js runtime dependencies,
# and creates the portable Linux release archives (.tar.gz / .zip) for
# aarch64 (ARM64), armv7l (ARM32), and x86_64 (AMD64).
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

echo "[1/3] Installing production backend dependencies..."
(cd "${ROOT_DIR}" && npm ci --omit=dev)

echo "[2/3] Building frontend production bundle..."
(cd "${ROOT_DIR}/frontend" && npm ci && npm run build)

echo "[3/3] Packaging standalone distribution archives..."
python3 "${SCRIPT_DIR}/package_release.py"

echo "✓ Release archives built in ${ROOT_DIR}/release:"
ls -lh "${ROOT_DIR}/release"
