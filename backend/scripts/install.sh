#!/usr/bin/env bash
# ==============================================================================
# ArmGuard Panel - One-Click Installer & Upgrader for ARM / x86_64 Linux
# Supported: Raspberry Pi OS, Debian 11/12, Ubuntu 20.04/22.04/24.04, openEuler
# Architectures: aarch64 (ARM64), armv7l (ARM32), x86_64 (AMD64)
# ==============================================================================

set -euo pipefail

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

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo -e "${RED}[Error] Please run this installer as root (sudo bash install.sh)${NC}"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${SCRIPT_DIR}/backend/dev_server.js" ]; then
  SRC_ROOT="${SCRIPT_DIR}"
elif [ -f "${SCRIPT_DIR}/../../backend/dev_server.js" ]; then
  SRC_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
else
  echo -e "${RED}[Error] Cannot locate ArmGuard source/release files relative to ${SCRIPT_DIR}${NC}"
  exit 1
fi

ARCH="$(uname -m)"
echo -e "${CYAN}[1/6] Detecting hardware architecture: ${ARCH}${NC}"
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
    echo -e "${RED}[Error] Unsupported architecture: ${ARCH}. ArmGuard supports aarch64, armv7l, and x86_64.${NC}"
    exit 1
    ;;
esac
echo -e "${GREEN}✓ Architecture ${ARCH} verified as ${PKG_ARCH}${NC}"

echo -e "${CYAN}[2/6] Checking Node.js runtime (Node.js >= 20 required)...${NC}"
if ! command -v node >/dev/null 2>&1; then
  echo -e "${RED}[Error] Node.js is not installed. Please install Node.js 20 LTS or newer and re-run install.sh.${NC}"
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "${NODE_MAJOR}" -lt 20 ]; then
  echo -e "${RED}[Error] Node.js v$(node -v) detected, but ArmGuard requires Node.js >= 20.${NC}"
  exit 1
fi
NODE_BIN="$(command -v node)"
echo -e "${GREEN}✓ Node.js $(node -v) found at ${NODE_BIN}${NC}"

INSTALL_DIR="/opt/armguard"
DATA_DIR="/var/lib/armguard"
BACKUP_DIR="/var/lib/armguard/backups"
LOG_DIR="/var/log/armguard"

echo -e "${CYAN}[3/6] Initializing directories (existing ${DATA_DIR} data is preserved)...${NC}"
mkdir -p "${INSTALL_DIR}"
mkdir -p "${DATA_DIR}"
mkdir -p "${BACKUP_DIR}"
mkdir -p "${LOG_DIR}"
mkdir -p /www/wwwroot
mkdir -p /www/server
chmod 700 "${DATA_DIR}" "${BACKUP_DIR}" || true

echo -e "${CYAN}[4/6] Deploying ArmGuard application files to ${INSTALL_DIR}...${NC}"
rm -rf "${INSTALL_DIR}/backend" "${INSTALL_DIR}/dist"
cp -R "${SRC_ROOT}/backend" "${INSTALL_DIR}/backend"

if [ -d "${SRC_ROOT}/dist" ]; then
  cp -R "${SRC_ROOT}/dist" "${INSTALL_DIR}/dist"
elif [ -d "${SRC_ROOT}/frontend/dist" ]; then
  cp -R "${SRC_ROOT}/frontend/dist" "${INSTALL_DIR}/dist"
else
  echo -e "${RED}[Error] Built frontend assets (dist/index.html) not found. Run 'npm --prefix frontend run build' first.${NC}"
  exit 1
fi

if [ ! -f "${INSTALL_DIR}/dist/index.html" ]; then
  echo -e "${RED}[Error] ${INSTALL_DIR}/dist/index.html is missing after copy.${NC}"
  exit 1
fi

cp "${SRC_ROOT}/package.json" "${INSTALL_DIR}/package.json"
if [ -f "${SRC_ROOT}/package-lock.json" ]; then
  cp "${SRC_ROOT}/package-lock.json" "${INSTALL_DIR}/package-lock.json"
fi

if [ -d "${SRC_ROOT}/node_modules/ws" ]; then
  rm -rf "${INSTALL_DIR}/node_modules"
  cp -R "${SRC_ROOT}/node_modules" "${INSTALL_DIR}/node_modules"
fi

if [ ! -d "${INSTALL_DIR}/node_modules/ws" ]; then
  echo -e "${CYAN}Installing production Node.js dependencies in ${INSTALL_DIR}...${NC}"
  if ! command -v npm >/dev/null 2>&1; then
    echo -e "${RED}[Error] npm is not available and node_modules/ws was not bundled.${NC}"
    exit 1
  fi
  (cd "${INSTALL_DIR}" && npm ci --omit=dev)
fi

chmod +x "${INSTALL_DIR}/backend/scripts/reset_admin.js" || true

echo -e "${CYAN}[5/6] Registering and starting systemd service...${NC}"
cat <<EOF > /etc/systemd/system/armguard.service
[Unit]
Description=ArmGuard Server Management Panel
After=network.target network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
Environment=NODE_ENV=production
Environment=ARMGUARD_DATA_DIR=${DATA_DIR}
Environment=ARMGUARD_BACKUP_DIR=${BACKUP_DIR}
ExecStart=${NODE_BIN} ${INSTALL_DIR}/backend/dev_server.js
Restart=always
RestartSec=5s
LimitNOFILE=65535
MemoryHigh=120M
MemoryMax=180M

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable armguard >/dev/null 2>&1 || true
systemctl restart armguard

echo -e "${CYAN}[6/6] Verifying service health...${NC}"
HEALTH_OK=0
for _ in $(seq 1 15); do
  if systemctl is-active --quiet armguard; then
    if node -e '
      const fs = require("fs");
      const http = require("http");
      const https = require("https");
      let port = 8888;
      let ssl = false;
      try {
        const s = JSON.parse(fs.readFileSync("/var/lib/armguard/settings.json", "utf8"));
        if (Number.isInteger(Number(s.port))) port = Number(s.port);
        if (s.ssl_enabled && s.panel_ssl_cert && s.panel_ssl_key && fs.existsSync(s.panel_ssl_cert) && fs.existsSync(s.panel_ssl_key)) ssl = true;
      } catch {}
      const client = ssl ? https : http;
      const req = client.get({
        hostname: "127.0.0.1",
        port,
        path: "/api/v1/auth/captcha",
        rejectUnauthorized: false,
        timeout: 2000
      }, (res) => {
        process.exit(res.statusCode === 200 ? 0 : 1);
      });
      req.on("error", () => process.exit(1));
      req.on("timeout", () => { req.destroy(); process.exit(1); });
    ' >/dev/null 2>&1; then
      HEALTH_OK=1
      break
    fi
  fi
  sleep 1
done

if [ "${HEALTH_OK}" -ne 1 ]; then
  echo -e "${RED}[Error] ArmGuard service failed health check after startup.${NC}"
  journalctl -u armguard -n 40 --no-pager || true
  exit 1
fi

PANEL_META="$(node -e '
  const fs = require("fs");
  let port = 8888;
  let entrance = "/armguard";
  let proto = "http";
  let username = "admin";
  try {
    const s = JSON.parse(fs.readFileSync("/var/lib/armguard/settings.json", "utf8"));
    if (Number.isInteger(Number(s.port))) port = Number(s.port);
    if (typeof s.security_entrance === "string" && s.security_entrance.trim()) entrance = s.security_entrance.trim();
    if (s.ssl_enabled && s.panel_ssl_cert && s.panel_ssl_key && fs.existsSync(s.panel_ssl_cert) && fs.existsSync(s.panel_ssl_key)) proto = "https";
  } catch {}
  try {
    const u = JSON.parse(fs.readFileSync("/var/lib/armguard/users.json", "utf8"));
    const list = Array.isArray(u) ? u : (u.users || []);
    const admin = list[0];
    if (admin && admin.username) username = admin.username;
  } catch {}
  console.log([proto, port, entrance, username].join("|"));
')"

PROTO="$(echo "${PANEL_META}" | cut -d'|' -f1)"
PORT="$(echo "${PANEL_META}" | cut -d'|' -f2)"
ENTRANCE="$(echo "${PANEL_META}" | cut -d'|' -f3)"
ADMIN_USER="$(echo "${PANEL_META}" | cut -d'|' -f4)"
LOCAL_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
if [ -z "${LOCAL_IP}" ]; then
  LOCAL_IP="127.0.0.1"
fi

echo -e "${GREEN}==============================================================${NC}"
echo -e "${GREEN}✓ ArmGuard Panel installed and verified successfully!${NC}"
echo -e "  - Web Access URL:   ${CYAN}${PROTO}://${LOCAL_IP}:${PORT}${ENTRANCE}${NC}"
echo -e "  - Admin Username:   ${YELLOW}${ADMIN_USER}${NC}"
if [ -f "${DATA_DIR}/initial_admin_password" ]; then
  echo -e "  - Initial Password: ${YELLOW}stored in ${DATA_DIR}/initial_admin_password (chmod 0600)${NC}"
  echo -e "    View once with:   ${CYAN}sudo cat ${DATA_DIR}/initial_admin_password${NC}"
else
  echo -e "  - Admin Password:   ${YELLOW}existing administrator credentials preserved${NC}"
fi
echo -e "  - Reset Password:   ${CYAN}sudo node ${INSTALL_DIR}/backend/scripts/reset_admin.js${NC}"
echo -e "  - System Service:   ${CYAN}systemctl status armguard${NC}"
echo -e "${GREEN}==============================================================${NC}"
