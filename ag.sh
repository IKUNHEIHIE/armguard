#!/usr/bin/env bash
#
# ArmGuard 快捷管理菜单（安装后在终端输入 ag 即可打开）
#
# 只做「运维动作」，不改配置：
#   1) 修复面板  —— 重新下载并覆盖当前版本的程序文件，数据目录与凭证完整保留
#   2) 更新面板  —— 检查 GitHub 最新发行版并升级
#   3) 重启面板  —— systemctl restart
#   4) 运行状态  —— 服务状态 + 端口 + 内存占用
#   5) 最近日志  —— journalctl 最近 50 行
#
set -uo pipefail

INSTALL_DIR="${ARMGUARD_DIR:-/opt/armguard}"
SERVICE="${ARMGUARD_SERVICE:-armguard}"
INSTALLER="$INSTALL_DIR/install.sh"

if [ -t 1 ]; then
  C_RESET='\033[0m'; C_DIM='\033[2m'; C_BOLD='\033[1m'
  C_INFO='\033[36m'; C_OK='\033[32m'; C_WARN='\033[33m'; C_ERR='\033[31m'
else
  C_RESET=''; C_DIM=''; C_BOLD=''; C_INFO=''; C_OK=''; C_WARN=''; C_ERR=''
fi
info() { printf "${C_INFO}[信息]${C_RESET} %s\n" "$*"; }
ok()   { printf "${C_OK}[成功]${C_RESET} %s\n" "$*"; }
warn() { printf "${C_WARN}[警告]${C_RESET} %s\n" "$*"; }
err()  { printf "${C_ERR}[错误]${C_RESET} %s\n" "$*" >&2; }

current_version() {
  if [ -r "$INSTALL_DIR/VERSION" ]; then
    tr -d ' \n\r' < "$INSTALL_DIR/VERSION"
  else
    echo "unknown"
  fi
}

require_root() {
  if [ "$(id -u)" != "0" ]; then
    err "该操作需要 root 权限，请使用：sudo ag"
    return 1
  fi
  return 0
}

require_installer() {
  if [ ! -f "$INSTALLER" ]; then
    err "未找到安装脚本 $INSTALLER，请先重新安装面板，或手动执行官方安装脚本。"
    return 1
  fi
  return 0
}

# 1) 修复面板
do_repair() {
  require_root || return 1
  require_installer || return 1
  local ver
  ver="$(current_version)"
  printf "\n将重新下载并覆盖 ArmGuard v%s 的程序文件（数据目录与管理员凭证保留）。\n" "$ver"
  printf "确认继续？[y/N] "
  read -r ans </dev/tty || ans=""
  case "$ans" in y|Y|yes|YES) ;; *) info "已取消"; return 0 ;; esac
  info "开始修复..."
  bash "$INSTALLER" --version "$ver" --upgrade -y
  return $?
}

# 2) 更新面板
do_update() {
  require_root || return 1
  require_installer || return 1
  printf "\n正在检查最新版本...\n"
  bash "$INSTALLER" --update -y
  return $?
}

# 3) 重启面板
do_restart() {
  require_root || return 1
  info "正在重启 ${SERVICE} ..."
  if systemctl restart "$SERVICE"; then
    sleep 2
    if systemctl is-active --quiet "$SERVICE"; then
      ok "面板已重启"
    else
      err "面板未能正常启动，请查看日志（菜单第 5 项）"
      return 1
    fi
  else
    err "重启失败"
    return 1
  fi
}

# 4) 运行状态
do_status() {
  printf "\n${C_BOLD}ArmGuard 运行状态${C_RESET}\n"
  printf "  版本      : v%s\n" "$(current_version)"
  printf "  安装目录  : %s\n" "$INSTALL_DIR"
  printf "  服务状态  : %s\n" "$(systemctl is-active "$SERVICE" 2>/dev/null || echo unknown)"
  printf "  开机自启  : %s\n" "$(systemctl is-enabled "$SERVICE" 2>/dev/null || echo unknown)"
  local pid rss etime port
  pid="$(systemctl show "$SERVICE" -p MainPID --value 2>/dev/null)"
  if [ -n "${pid:-}" ] && [ "$pid" != "0" ]; then
    read -r rss etime <<<"$(ps -o rss=,etime= -p "$pid" 2>/dev/null | tr -s ' ')"
    printf "  进程 PID  : %s\n" "$pid"
    [ -n "${rss:-}" ] && printf "  内存占用  : %s MB\n" "$((rss / 1024))"
    [ -n "${etime:-}" ] && printf "  运行时长  : %s\n" "$etime"
  fi
  port="$(systemctl show "$SERVICE" -p Environment --value 2>/dev/null | tr ' ' '\n' | sed -n 's/^PORT=//p')"
  [ -n "${port:-}" ] && printf "  监听端口  : %s\n" "$port"
  printf "  最近重启  : %s\n" "$(systemctl show "$SERVICE" -p ActiveEnterTimestamp --value 2>/dev/null)"
}

# 5) 最近日志
do_logs() {
  printf "\n${C_DIM}（最近 50 行，Ctrl+C 退出）${C_RESET}\n"
  journalctl -u "$SERVICE" -n 50 --no-pager 2>/dev/null || err "读取日志失败"
}

show_menu() {
  printf "\n${C_BOLD}╔══════════════════════════════════════╗${C_RESET}\n"
  printf "${C_BOLD}║      ArmGuard 面板管理菜单           ║${C_RESET}\n"
  printf "${C_BOLD}╚══════════════════════════════════════╝${C_RESET}\n"
  printf "  当前版本: ${C_OK}v%s${C_RESET}   服务: %s\n\n" \
    "$(current_version)" "$(systemctl is-active "$SERVICE" 2>/dev/null || echo unknown)"
  printf "  ${C_BOLD}1${C_RESET}) 修复面板  ${C_DIM}重新安装当前版本，保留数据${C_RESET}\n"
  printf "  ${C_BOLD}2${C_RESET}) 更新面板  ${C_DIM}升级到 GitHub 最新发行版${C_RESET}\n"
  printf "  ${C_BOLD}3${C_RESET}) 重启面板\n"
  printf "  ${C_BOLD}4${C_RESET}) 运行状态\n"
  printf "  ${C_BOLD}5${C_RESET}) 最近日志\n"
  printf "  ${C_BOLD}0${C_RESET}) 退出\n\n"
}

main() {
  # 支持非交互用法：ag status / ag update ...
  case "${1:-}" in
    repair) do_repair; exit $? ;;
    update) do_update; exit $? ;;
    restart) do_restart; exit $? ;;
    status) do_status; exit 0 ;;
    logs) do_logs; exit 0 ;;
    -h|--help|help)
      echo "用法: ag [repair|update|restart|status|logs]"
      echo "不带参数则进入交互菜单。"
      exit 0 ;;
  esac

  while true; do
    show_menu
    printf "请输入序号并回车: "
    read -r choice </dev/tty || exit 0
    case "$choice" in
      1) do_repair ;;
      2) do_update ;;
      3) do_restart ;;
      4) do_status ;;
      5) do_logs ;;
      0|q|Q) printf "\n再见。\n"; exit 0 ;;
      "") ;;
      *) warn "无效的序号: $choice" ;;
    esac
    printf "\n按回车返回菜单..."
    read -r _ </dev/tty || exit 0
  done
}

main "$@"
