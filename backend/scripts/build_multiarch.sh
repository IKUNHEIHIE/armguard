#!/usr/bin/env bash
# ==============================================================================
# ArmGuard Cross-Compilation Script
# Builds single binary packages for linux/arm64, linux/armv7, and linux/amd64
# ==============================================================================

set -e

VERSION="v0.1.0-alpha"
OUT_DIR="./dist_bin"
mkdir -p ${OUT_DIR}

echo "Building Frontend Assets..."
cd ../frontend
npm run build
cd ../backend

echo "Building Go Binaries for ARM and x86..."

# 1. Linux ARM64 (aarch64 - Raspberry Pi 4/5, OrangePi 5, Alibaba Yitian, AWS Graviton)
echo "Compiling linux/arm64..."
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -ldflags="-s -w" -o ${OUT_DIR}/armguard-linux-arm64 ./cmd/server

# 2. Linux ARMv7 (armv7l - Raspberry Pi 2/3 32-bit, OrangePi Zero)
echo "Compiling linux/armv7..."
CGO_ENABLED=0 GOOS=linux GOARCH=arm GOARM=7 go build -ldflags="-s -w" -o ${OUT_DIR}/armguard-linux-armv7 ./cmd/server

# 3. Linux AMD64 (x86_64)
echo "Compiling linux/amd64..."
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o ${OUT_DIR}/armguard-linux-amd64 ./cmd/server

echo "✓ All binaries built successfully in ${OUT_DIR}:"
ls -lh ${OUT_DIR}
