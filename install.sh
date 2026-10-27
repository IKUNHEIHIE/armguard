#!/usr/bin/env bash
#
# ArmGuard 一键安装脚本（ARM64 / ARMv7 / x86_64 Linux）
#
#   安装：  sudo bash install.sh
#   升级：  sudo bash install.sh --upgrade
#   卸载：  sudo bash install.sh --uninstall
#
# 支持 Debian / Ubuntu / Armbian / Raspberry Pi OS 等 systemd 发行版。
# 脚本会自动准备 Node.js 运行时、下载发行包、注册 systemd 服务并启动面板。
#
set -euo pipefail

# ---------------------------------------------------------------------------
# 可调参数
# ---------------------------------------------------------------------------
REPO="IKUNHEIHIE/armguard"
RELEASE_VERSION="${ARMGUARD_VERSION:-0.2.0}"
INSTALL_DIR="${ARMGUARD_DIR:-/opt/armguard}"
DATA_DIR="${ARMGUARD_DATA_DIR:-/var/lib/armguard}"
BACKUP_DIR="${ARMGUARD_BACKUP_DIR:-/var/backups/armguard}"
SERVICE_NAME="${ARMGUARD_SERVICE:-armguard}"
PORT="${ARMGUARD_PORT:-8888}"
ENTRANCE="${ARMGUARD_ENTRANCE:-/armguard}"
NODE_MIN_MAJOR=20
# 国内镜像优先，失败回退官方源
NODE_MIRRORS=("https://npmmirror.com/mirrors/node" "https://nodejs.org/dist")
GITHUB_MIRRORS=("" "https://ghfast.top/")

ACTION="install"
ASSUME_YES=0
NO_START=0

# ---------------------------------------------------------------------------
# 输出辅助
# ---------------------------------------------------------------------------
if [ -t 1 ]; then
  C_RESET='\033[0m'; C_INFO='\033[36m'; C_OK='\033[32m'; C_WARN='\033[33m'; C_ERR='\033[31m'; C_BOLD='\033[1m'
else
  C_RESET=''; C_INFO=''; C_OK=''; C_WARN=''; C_ERR=''; C_BOLD=''
fi
info() { printf "${C_INFO}[信息]${C_RESET} %s\n" "$*"; }
ok()   { printf "${C_OK}[成功]${C_RESET} %s\n" "$*"; }
warn() { printf "${C_WARN}[警告]${C_RESET} %s\n" "$*"; }
die()  { printf "${C_ERR}[错误]${C_RESET} %s\n" "$*" >&2; exit 1; }
step() { printf "\n${C_BOLD}==> %s${C_RESET}\n" "$*"; }

usage() {
  cat <<'EOF'
ArmGuard 一键安装脚本

用法:
  sudo bash install.sh [选项]

选项:
  --update           检查并更新到 GitHub 最新发行版
  --upgrade          升级已有安装（自动备份旧版本，保留数据目录）
  --uninstall        卸载面板（默认保留 /var/lib/armguard 数据）
  --purge            与 --uninstall 搭配，连同数据目录一并删除
  --version <x.y.z>  指定安装版本（默认 0.2.0）
  --port <端口>      面板监听端口（默认 8888）
  --entrance <路径>  安全入口路径（默认 /armguard）
  --no-start         安装完成后不自动启动服务
  -y, --yes          非交互模式，自动确认
  -h, --help         显示本帮助

示例:
  sudo bash install.sh                        # 默认安装最新稳定版
  sudo bash install.sh --port 21000           # 指定端口
  sudo bash install.sh --update               # 更新到最新发行版
  sudo bash install.sh --upgrade              # 升级到脚本内置版本
  sudo bash install.sh --uninstall            # 卸载（保留数据）
EOF
}

# ---------------------------------------------------------------------------
# 参数解析
# ---------------------------------------------------------------------------
PURGE=0
while [ $# -gt 0 ]; do
  case "$1" in
    --update) ACTION="update"; shift ;;
    --upgrade) ACTION="upgrade"; shift ;;
    --uninstall) ACTION="uninstall"; shift ;;
    --purge) PURGE=1; shift ;;
    --version) RELEASE_VERSION="${2:-}"; shift 2 ;;
    --port) PORT="${2:-}"; shift 2 ;;
    --entrance) ENTRANCE="${2:-}"; shift 2 ;;
    --no-start) NO_START=1; shift ;;
    -y|--yes) ASSUME_YES=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "未知参数: $1（使用 --help 查看用法）" ;;
  esac
done

confirm() {
  [ "$ASSUME_YES" = "1" ] && return 0
  printf "%s [y/N] " "$1"
  read -r ans </dev/tty || ans=""
  case "$ans" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}

# ---------------------------------------------------------------------------
# 环境检测
# ---------------------------------------------------------------------------
require_root() {
  [ "$(id -u)" = "0" ] || die "请使用 root 运行：sudo bash $0"
}

detect_platform() {
  ARCH="$(uname -m)"
  case "$ARCH" in
    aarch64|arm64) NODE_ARCH="linux-arm64" ;;
    armv7l|armv7)  NODE_ARCH="linux-armv7l" ;;
    x86_64|amd64)  NODE_ARCH="linux-x64" ;;
    *) die "不支持的架构: $ARCH（支持 aarch64 / armv7l / x86_64）" ;;
  esac

  OS_ID=""; OS_CODENAME=""
  # 注意：/etc/os-release 里也有 VERSION 变量，会覆盖同名变量，
  # 所以本脚本的发行版本号统一用 RELEASE_VERSION。
  if [ -r /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    OS_ID="${ID:-}"; OS_CODENAME="${VERSION_CODENAME:-}"
  fi
  case "$OS_ID" in
    debian|ubuntu|armbian|raspbian|linuxmint) : ;;
    "") warn "无法识别发行版，继续尝试" ;;
    *) warn "当前发行版 $OS_ID 未充分测试，脚本面向 Debian 系编写，继续尝试" ;;
  esac

  command -v systemctl >/dev/null 2>&1 || die "未检测到 systemd，本脚本仅支持 systemd 发行版"

  info "系统: ${OS_ID:-unknown} ${OS_CODENAME:-} | 架构: $ARCH | Node 包: $NODE_ARCH"
}

# ---------------------------------------------------------------------------
# Node.js 运行时（>= 20）
# ---------------------------------------------------------------------------
node_major() {
  command -v node >/dev/null 2>&1 || { echo 0; return; }
  node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1
}

install_node() {
  local major
  major="$(node_major)"
  if [ "$major" -ge "$NODE_MIN_MAJOR" ] 2>/dev/null; then
    ok "已检测到 Node.js $(node -v)，满足要求（>= v${NODE_MIN_MAJOR}）"
    return 0
  fi

  step "安装 Node.js 运行时（当前: ${major:-未安装}，要求 >= v${NODE_MIN_MAJOR}）"

  # 1) 优先用发行版仓库（Debian 13 / Ubuntu 24.04 自带 v20+，最省事）
  if command -v apt-get >/dev/null 2>&1; then
    info "尝试通过 apt 安装 nodejs ..."
    apt-get update -qq || true
    if apt-get install -y nodejs npm >/dev/null 2>&1; then
      major="$(node_major)"
      if [ "$major" -ge "$NODE_MIN_MAJOR" ] 2>/dev/null; then
        ok "已通过 apt 安装 Node.js $(node -v)"
        return 0
      fi
      warn "apt 提供的 Node.js 版本过低（$(node -v 2>/dev/null || echo 无)），改用官方二进制包"
    else
      warn "apt 安装 nodejs 失败，改用官方二进制包"
    fi
  fi

  # 2) 官方/镜像二进制包
  local tmpd url base
  tmpd="$(mktemp -d)"
  for base in "${NODE_MIRRORS[@]}"; do
    url="${base}/latest-v${NODE_MIN_MAJOR}.x/SHASUMS256.txt"
    if fetch_quiet "$url" "$tmpd/sha" 20; then
      local file
      file="$(grep -o "node-v[0-9.]*-${NODE_ARCH}\.tar\.xz" "$tmpd/sha" | head -1)"
      [ -n "$file" ] || continue
      info "从 $base 下载 $file ..."
      if fetch_to "${base}/latest-v${NODE_MIN_MAJOR}.x/${file}" "$tmpd/node.tar.xz" 300; then
        mkdir -p /usr/local/lib/nodejs
        tar -xJf "$tmpd/node.tar.xz" -C /usr/local/lib/nodejs
        local dir
        dir="$(ls -d /usr/local/lib/nodejs/node-v* 2>/dev/null | tail -1)"
        for b in node npm npx corepack; do
          [ -e "$dir/bin/$b" ] && ln -sf "$dir/bin/$b" "/usr/local/bin/$b"
        done
        rm -rf "$tmpd"
        hash -r 2>/dev/null || true
        major="$(node_major)"
        if [ "$major" -ge "$NODE_MIN_MAJOR" ] 2>/dev/null; then
          ok "已安装 Node.js $(node -v) 到 /usr/local/lib/nodejs"
          return 0
        fi
        die "Node.js 安装后版本仍不满足要求"
      fi
    fi
  done
  rm -rf "$tmpd"
  die "无法安装 Node.js，请手动安装 Node.js >= v${NODE_MIN_MAJOR} 后重试"
}

# ---------------------------------------------------------------------------
# 下载器（curl / wget 自适应）
# ---------------------------------------------------------------------------
FETCH=""

detect_fetch() {
  if command -v curl >/dev/null 2>&1; then FETCH="curl"; return 0; fi
  if command -v wget >/dev/null 2>&1; then FETCH="wget"; return 0; fi
  info "未检测到 curl / wget，尝试安装 curl ..."
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq || true
    apt-get install -y curl >/dev/null 2>&1 || true
  fi
  if command -v curl >/dev/null 2>&1; then FETCH="curl"; return 0; fi
  if command -v wget >/dev/null 2>&1; then FETCH="wget"; return 0; fi
  die "缺少下载工具，请先安装：apt-get install -y curl"
}

# fetch_to <url> <目标文件> [超时秒]
fetch_to() {
  local url="$1" dest="$2" timeout="${3:-600}"
  if [ "$FETCH" = "curl" ]; then
    curl -fsSL --connect-timeout 15 --max-time "$timeout" "$url" -o "$dest"
  else
    wget -q -T "$timeout" -O "$dest" "$url"
  fi
}

# fetch_quiet <url> <目标文件> [超时秒]，失败不打印噪声
fetch_quiet() {
  local url="$1" dest="$2" timeout="${3:-20}"
  if [ "$FETCH" = "curl" ]; then
    curl -fsSL --connect-timeout 10 --max-time "$timeout" "$url" -o "$dest" 2>/dev/null
  else
    wget -q -T "$timeout" -O "$dest" "$url" 2>/dev/null
  fi
}

# ---------------------------------------------------------------------------
# 下载发行包
# ---------------------------------------------------------------------------
download_release() {
  local tarball="armguard-panel-v${RELEASE_VERSION}.tar.gz"
  local tmpd="$1"
  local mirror base url
  for mirror in "${GITHUB_MIRRORS[@]}"; do
    base="https://github.com/${REPO}/releases/download/v${RELEASE_VERSION}"
    url="${mirror}${base}/${tarball}"
    # 注意：本函数的标准输出只允许出现最终文件路径（调用方用 $(...) 捕获），
    # 所有日志必须写到 stderr，否则会污染返回值。
    info "下载 ${url}" >&2
    if fetch_to "$url" "$tmpd/$tarball" 600; then
      if tar -tzf "$tmpd/$tarball" >/dev/null 2>&1; then
        printf '%s\n' "$tmpd/$tarball"
        return 0
      fi
      warn "下载的文件不是有效压缩包，尝试下一个源" >&2
    else
      warn "该源下载失败，尝试下一个源" >&2
    fi
  done
  return 1
}

# ---------------------------------------------------------------------------
# 最新版本解析
# ---------------------------------------------------------------------------
# resolve_latest_version：查询 GitHub 最新发行版的 tag，输出不带 v 前缀的版本号
resolve_latest_version() {
  local tmpd
  tmpd="$(mktemp -d)"
  local api="https://api.github.com/repos/${REPO}/releases/latest"
  local v=""
  if fetch_quiet "$api" "$tmpd/latest.json" 25 && [ -s "$tmpd/latest.json" ]; then
    v="$(sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"v\{0,1\}\([^"]*\)".*/\1/p' "$tmpd/latest.json" | head -1)"
  fi
  rm -rf "$tmpd"
  [ -n "$v" ] || return 1
  printf '%s\n' "$v"
}

# ---------------------------------------------------------------------------
# systemd 服务
# ---------------------------------------------------------------------------
write_service() {
  cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=ArmGuard management panel for ARM Linux
Documentation=https://github.com/${REPO}
After=network-online.target
Wants=network-online.target

[Service]
Type=exec
User=root
WorkingDirectory=${INSTALL_DIR}
Environment=NODE_ENV=production
Environment=HOST=0.0.0.0
Environment=PORT=${PORT}
Environment=ARMGUARD_DATA_DIR=${DATA_DIR}
Environment=ARMGUARD_BACKUP_DIR=${BACKUP_DIR}
ExecStart=/usr/bin/env node --max-old-space-size=256 ${INSTALL_DIR}/backend/dev_server.js
Restart=on-failure
RestartSec=5
# 面板需要管理系统服务、写系统配置，故以 root 运行；
# 内存上限防止在 512MB 设备上与业务进程争抢内存
MemoryHigh=256M
MemoryMax=512M
LimitNOFILE=65535
UMask=0022

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
}

# ---------------------------------------------------------------------------
# 动作：安装 / 升级
# ---------------------------------------------------------------------------
do_install() {
  local mode="$1"
  local tmpd
  tmpd="$(mktemp -d)"
  WORK_TMPDIR="$tmpd"
  trap 'rm -rf "${WORK_TMPDIR:-}"' EXIT

  step "下载 ArmGuard v${RELEASE_VERSION} 发行包"
  local pkg
  pkg="$(download_release "$tmpd")" || die "下载失败。请检查网络，或手动从 https://github.com/${REPO}/releases 下载后解压到 ${INSTALL_DIR}"

  if [ "$mode" = "upgrade" ] && [ -d "$INSTALL_DIR" ]; then
    local ts backup
    ts="$(date +%Y%m%d-%H%M%S)"
    backup="/var/backups/armguard/upgrades/${ts}"
    step "备份当前版本到 $backup"
    mkdir -p "$backup"
    tar -czf "$backup/armguard-opt.tar.gz" -C "$(dirname "$INSTALL_DIR")" "$(basename "$INSTALL_DIR")" 2>/dev/null || warn "备份失败，继续升级"
    ok "备份完成"
    systemctl stop "$SERVICE_NAME" 2>/dev/null || true
  fi

  step "解压到 ${INSTALL_DIR}"
  local stage="$tmpd/stage"
  mkdir -p "$stage"
  tar -xzf "$pkg" -C "$stage"

  # 兼容两种包结构：顶层目录 armguard-panel/ 或直接是 backend/ 等
  local src="$stage"
  if [ -d "$stage/armguard-panel" ]; then src="$stage/armguard-panel"; fi
  [ -d "$src/backend" ] || die "发行包结构异常：未找到 backend/ 目录"

  mkdir -p "$INSTALL_DIR"
  # 保留数据无关文件，只替换程序本体
  rm -rf "$INSTALL_DIR/backend" "$INSTALL_DIR/dist" "$INSTALL_DIR/node_modules"
  cp -a "$src/backend" "$INSTALL_DIR/"
  [ -d "$src/dist" ] && cp -a "$src/dist" "$INSTALL_DIR/"
  cp -a "$src/package.json" "$INSTALL_DIR/" 2>/dev/null || true
  [ -d "$src/node_modules" ] && cp -a "$src/node_modules" "$INSTALL_DIR/"
  [ -f "$src/BUILD_COMMIT" ] && cp -a "$src/BUILD_COMMIT" "$INSTALL_DIR/"
  [ -f "$src/VERSION" ] && cp -a "$src/VERSION" "$INSTALL_DIR/"
  chown -R root:root "$INSTALL_DIR"

  # 运行期依赖兜底（发行包已内置 ws，缺失时才装）
  if [ ! -d "$INSTALL_DIR/node_modules/ws" ]; then
    info "补齐运行期依赖 ws ..."
    (cd "$INSTALL_DIR" && npm install --omit=dev --no-audit --no-fund >/dev/null 2>&1) || warn "ws 依赖安装失败，面板可能无法启动"
  fi

  # 安装快捷管理菜单（ag）与安装脚本副本：ag 的修复/更新依赖它们
  if [ -f "$src/ag.sh" ]; then
    install -m 0755 "$src/ag.sh" /usr/local/bin/ag
    ok "已安装管理菜单：终端输入 ag 即可打开"
  else
    warn "发行包内未包含 ag.sh，跳过管理菜单安装"
  fi
  if [ -f "$src/install.sh" ]; then
    install -m 0755 "$src/install.sh" "$INSTALL_DIR/install.sh"
  else
    local self="${BASH_SOURCE[0]:-}"
    if [ -n "$self" ] && [ -f "$self" ]; then
      install -m 0755 "$self" "$INSTALL_DIR/install.sh"
    fi
  fi

  mkdir -p "$DATA_DIR" "$BACKUP_DIR"
  chmod 700 "$DATA_DIR"

  step "注册 systemd 服务"
  write_service
  systemctl enable "$SERVICE_NAME" >/dev/null 2>&1 || true
  ok "服务已注册：${SERVICE_NAME}.service"

  if [ "$NO_START" = "1" ]; then
    warn "已跳过启动（--no-start）。手动启动：systemctl start ${SERVICE_NAME}"
    return 0
  fi

  step "启动面板"
  systemctl restart "$SERVICE_NAME"
  sleep 3

  if ! systemctl is-active --quiet "$SERVICE_NAME"; then
    warn "服务未能正常启动，最近日志："
    journalctl -u "$SERVICE_NAME" -n 30 --no-pager || true
    die "启动失败"
  fi

  local ip
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [ -n "$ip" ] || ip="<服务器IP>"

  local pwfile="$DATA_DIR/initial_admin_password"
  local pw=""
  [ -f "$pwfile" ] && pw="$(grep -o 'password=.*' "$pwfile" 2>/dev/null | cut -d= -f2-)"

  printf "\n"
  ok "ArmGuard v${RELEASE_VERSION} 已安装并启动"
  cat <<EOF

  ${C_BOLD}访问地址${C_RESET}: http://${ip}:${PORT}${ENTRANCE}
  ${C_BOLD}安装目录${C_RESET}: ${INSTALL_DIR}
  ${C_BOLD}数据目录${C_RESET}: ${DATA_DIR}
  ${C_BOLD}服务管理${C_RESET}: systemctl {status|restart|stop} ${SERVICE_NAME}
  ${C_BOLD}快捷菜单${C_RESET}: 终端输入 ag（修复 / 更新 / 重启 / 状态 / 日志）

EOF
  if [ -n "$pw" ]; then
    printf "  ${C_BOLD}初始账号${C_RESET}: admin\n  ${C_BOLD}初始密码${C_RESET}: %s\n" "$pw"
    printf "  ${C_WARN}首次登录后请立即修改密码${C_RESET}（面板设置 → 安全设置）\n\n"
  else
    printf "  ${C_BOLD}初始账号${C_RESET}: admin（密码见 ${pwfile}）\n\n"
  fi
  printf "  ${C_WARN}提示${C_RESET}: 面板以 root 运行且默认 HTTP 明文，请勿直接暴露公网；\n"
  printf "        建议在「面板设置 → 安全设置」启用 HTTPS 或通过安全入口 + 防火墙限制访问。\n\n"
}

# ---------------------------------------------------------------------------
# 动作：卸载
# ---------------------------------------------------------------------------
do_uninstall() {
  step "卸载 ArmGuard"
  if [ "$PURGE" = "1" ]; then
    confirm "将删除程序、服务以及全部数据（${DATA_DIR}），不可恢复。确认继续？" || die "已取消"
  else
    confirm "将停止并移除 ArmGuard 服务与程序，数据目录 ${DATA_DIR} 会保留。确认继续？" || die "已取消"
  fi

  systemctl stop "$SERVICE_NAME" 2>/dev/null || true
  systemctl disable "$SERVICE_NAME" 2>/dev/null || true
  rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
  systemctl daemon-reload
  rm -rf "$INSTALL_DIR"
  ok "程序与服务已移除"

  if [ "$PURGE" = "1" ]; then
    rm -rf "$DATA_DIR" "$BACKUP_DIR"
    ok "数据目录已删除"
  else
    info "数据目录保留在 ${DATA_DIR}（如需彻底删除请加 --purge）"
  fi
}

# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------
main() {
  printf "\n${C_BOLD}ArmGuard 安装程序${C_RESET}（https://github.com/%s）\n" "$REPO"
  require_root
  detect_platform
  detect_fetch

  case "$ACTION" in
    install)
      if [ -d "$INSTALL_DIR/backend" ]; then
        warn "检测到已有安装：${INSTALL_DIR}"
        if confirm "是否改为升级模式（保留数据目录）？"; then
          do_install upgrade
        else
          die "已取消。如需覆盖安装请先卸载：sudo bash $0 --uninstall"
        fi
      else
        install_node
        do_install install
      fi
      ;;
    upgrade)
      [ -d "$INSTALL_DIR/backend" ] || die "未检测到已安装的 ArmGuard，请先执行安装"
      install_node
      do_install upgrade
      ;;
    update)
      [ -d "$INSTALL_DIR/backend" ] || die "未检测到已安装的 ArmGuard，请先执行安装"
      install_node
      local cur latest
      cur="$(cat "$INSTALL_DIR/VERSION" 2>/dev/null | tr -d ' \n\r' || true)"
      [ -n "$cur" ] || cur="unknown"
      info "当前版本: v${cur}"
      latest="$(resolve_latest_version)" || die "无法获取最新版本（网络不可用时可手动指定：--version <版本> --upgrade）"
      info "最新版本: v${latest}"
      if [ "$latest" = "$cur" ]; then
        ok "当前已是最新版本，无需更新"
        exit 0
      fi
      RELEASE_VERSION="$latest"
      do_install upgrade
      ;;
    uninstall)
      do_uninstall
      ;;
  esac
}

main "$@"
