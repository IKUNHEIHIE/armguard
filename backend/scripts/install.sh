#!/usr/bin/env bash
# ==============================================================================
# ArmGuard Panel - One-Click Installer for ARM Linux
# Supported: Raspberry Pi OS, Debian 11/12, Ubuntu 22.04/24.04, openEuler ARM
# Architectures: aarch64 (ARM64), armv7l (ARM32)
# ==============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${GREEN}"
echo "    ___                       ____                      __"
echo "   /   |  _________ ___      / ____ ___  ______ __________/ /"
echo "  / /| | / ___/ __ \`__ \    / / __ \`/ / / / __ \`/ ___/ __  / "
echo " / ___ |/ /  / / / / / /   / /_/ /_/ /_/ / /_/ / /  / /_/ /  "
echo "/_/  |_/_/  /_/ /_/ /_/____\____/\__,_/\__,_/\__,_/_/   \__,_/   "
echo "                     /_____/  ARM Native Server Ops Panel"
echo -e "${NC}"

# Check root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}[Error] Please run this installer as root (sudo ./install.sh)${NC}"
  exit 1
fi

# Detect Architecture
ARCH=$(uname -m)
echo -e "${CYAN}[1/5] Detecting hardware architecture: ${ARCH}${NC}"

case "$ARCH" in
  aarch64|arm64)
    PKG_ARCH="arm64"
    ;;
  armv7l|armv7)
    PKG_ARCH="armv7"
    ;;
  x86_64|amd64)
    PKG_ARCH="amd64"
    ;;
  *)
    echo -e "${RED}[Error] Unsupported architecture: ${ARCH}. ArmGuard supports aarch64 and armv7l.${NC}"
    exit 1
    ;;
esac

echo -e "${GREEN}✓ Architecture ${ARCH} verified as ${PKG_ARCH}${NC}"

# Create directories
echo -e "${CYAN}[2/5] Initializing directories...${NC}"
mkdir -p /opt/armguard/bin
mkdir -p /var/lib/armguard
mkdir -p /var/log/armguard
mkdir -p /www/wwwroot
mkdir -p /www/server

# Download binary or copy from source
INSTALL_DIR="/opt/armguard"
if [ -f "./armguard-server" ]; then
  echo -e "${CYAN}[3/5] Installing local ArmGuard binary...${NC}"
  cp ./armguard-server ${INSTALL_DIR}/bin/armguard-server
  chmod +x ${INSTALL_DIR}/bin/armguard-server
fi

# Create Systemd Service
echo -e "${CYAN}[4/5] Registering systemd service...${NC}"
cat <<EOF > /etc/systemd/system/armguard.service
[Unit]
Description=ArmGuard Server Management Panel
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/armguard
ExecStart=/opt/armguard/bin/armguard-server
Restart=always
RestartSec=5s
LimitNOFILE=65535
MemoryHigh=80M
MemoryMax=100M

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable armguard
systemctl restart armguard

# Output info
PORT=8888
LOCAL_IP=$(hostname -I | awk '{print $1}')
echo -e "${GREEN}==============================================================${NC}"
echo -e "${GREEN}✓ ArmGuard Panel installed successfully!${NC}"
echo -e "  - Web Access URL: ${CYAN}http://${LOCAL_IP}:${PORT}${NC}"
echo -e "  - Default Username: ${YELLOW}admin${NC}"
echo -e "  - Default Password: ${YELLOW}armguard${NC}"
echo -e "  - System Service:   ${CYAN}systemctl status armguard${NC}"
echo -e "${GREEN}==============================================================${NC}"
