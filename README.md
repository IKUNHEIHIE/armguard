# 🛡️ ArmGuard — 面向 ARM 架构的高性能轻量级 Linux 运维面板

<p align="center">
  <img src="https://img.shields.io/badge/Architecture-ARM64%20%7C%20ARMv7%20%7C%20x86__64-00D084?style=for-the-badge&logo=arm" alt="ARM Native" />
  <img src="https://img.shields.io/badge/Memory%20Footprint-%3C%2050MB-10B981?style=for-the-badge" alt="Memory Footprint" />
  <img src="https://img.shields.io/badge/Frontend-Angular%2021%20%2B%20Material%20Design%203-DD0031?style=for-the-badge&logo=angular" alt="Angular Material M3" />
  <img src="https://img.shields.io/github/v/release/IKUNHEIHIE/armguard?style=for-the-badge&color=blue" alt="Release" />
  <img src="https://img.shields.io/badge/Backend-Node.js%20%2B%20Linux%20Native-00ADD8?style=for-the-badge&logo=nodedotjs" alt="Node.js" />
  <img src="https://img.shields.io/badge/Network-IPv4%20%2B%20IPv6%20Dual--Stack-6366F1?style=for-the-badge" alt="Dual Stack" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="License" />
</p>

---

## 📖 1. 项目简介

**ArmGuard** 是一款专为 **ARM 架构 Linux 服务器与单板机（SBC）** 深度定制的现代化、高性能、轻量级 Web 可视化运维管理面板。

主流传统服务器面板（如宝塔面板、1Panel、Webmin）主要面向 x86 架构服务器设计，在 ARM 单板机（树莓派 Raspberry Pi、香橙派 Orange Pi 等）或云端 ARM 实例（AWS Graviton、阿里云倚天 710、华为鲲鹏 920、Ampere Altra）上运行时，普遍存在以下痛点：
- **面板常驻内存过大**：Python/PHP/Java 运行时动辄占用 200MB ~ 500MB 内存，低配 512MB/1GB 设备频发 OOM 崩溃；
- **镜像拉取兼容性冲突**：在 ARM 上拉取 Docker 镜像常因拉取到仅含 x86 架构的镜像导致 `exec format error` 闪退；
- **缺少 ARM 硬件专属监控**：无法实时检测树莓派核心温度、供电欠压状态、温控降频等关键硬件指标；
- **网络能力局限**：缺乏对现代微服务（gRPC HTTP/2）及四层（TCP/UDP）端口转发的原生轻量编排。

**ArmGuard 针对 ARM 平台从内核到底层服务进行了深度重构与优化**，以极低的常驻内存（`< 50MB`）提供丝滑、稳定、高可用的全栈运维体验。

---

## ✨ 2. 核心差异化特性

| 核心特性 | 传统服务器面板 | ArmGuard（本面板） |
| :--- | :--- | :--- |
| **常驻内存占用** | 150MB ~ 400MB (Python/PHP 重型运行时) | **`< 35MB`（精简轻量架构，低至 512MB 设备丝滑运行）** |
| **ARM 专属硬件诊断**| 无专属监控 | **实时采集 CPU 核心温度、树莓派 `vcgencmd` 降频掩码、供电欠压检测、核心工作电压** |
| **节能模式 (Eco Mode)**| 频繁轮询消耗算力 | **内置智能节能模式：检测到低性能 SBC 时自适应降低推流频率，CPU 占用 `< 0.2%`** |
| **Docker 镜像多架构预检**| 盲拉（极易遭遇 x86 架构冲突崩溃） | **拉取前预检 OCI Manifest Index，智能拦截纯 x86 镜像，严防 `exec format error`** |
| **反向代理 gRPC 模式** | 仅支持普通 HTTP 反代，配置繁琐 | **一键开启原生 gRPC 模式，自动下发 `grpc_pass` 与 HTTP/2 传输帧** |
| **四层端口转发** | 需额外安装复杂第三方网关 | **原生集成 Nginx Stream (TCP/UDP)，内置常用协议模版与端口防冲突拦截** |
| **SSL 证书引擎** | 依赖第三方复杂脚本 | **原生集成 Certbot ACME 引擎，支持 HTTP-01 穿透验证与到期自动续签** |
| **网络全栈协议** | 多数仅默认监听 IPv4 | **全模块 IPv4 / IPv6 Dual-Stack 双栈原生支持** |

---

## 🖥️ 3. 核心功能矩阵

### 3.1 仪表盘与 ARM 硬件专属诊断
- **基础资源拓扑**：实时 CPU 使用率（多核心独立波形）、物理内存 (RAM) 与 Swap 深度追踪、主磁盘存储空间、网络 I/O 实时下行/上行速率与 1/5/15m 系统平均负载。
- **ARM 专属诊断专区**：
  - CPU 核心温度监控（智能绿/黄/红状态指示）；
  - `vcgencmd get_throttled` 位掩码实时解码（欠压警告、温控降频告警、频点受限检测）；
  - 核心工作电压（V）与 CPU 调频策略（`schedutil` / `performance`）。
- **实时进程管理器**：按 CPU / 内存占用实时排序，支持一键安全终止异常进程。

### 3.2 网站管理与多版本 PHP 环境 (Web Hosting)
- **双栈虚拟主机编排**：全自动化管理 Nginx 虚拟主机配置，原生支持 IPv4 与 IPv6 双栈同时监听。
- **自定义端口与多域名**：支持绑定任意自定义端口（如 8088、8443）及多域名绑定。
- **PHP 多版本热切换**：
  - 支持 PHP 7.4、8.1、8.2、8.3、8.4 运行环境自由选择；
  - 动态对接 FastCGI Unix Socket（`/run/php/phpX.X-fpm.sock`），秒级热更新无需中断站点。
- **伪静态与单页应用**：内置 SPA 单页应用静态路由预设、自定义默认首页文档、Basic Auth 访问认证与防盗链规则。

### 3.3 七层反向代理与 gRPC 模式 (Reverse Proxy & gRPC)
- **标准 HTTP 反向代理**：支持路径重写、自定义 Host 头部透传、WebSocket 双向长连接代理。
- **原生 gRPC 代理模式**：针对微服务与 RPC 框架（gRPC、Dubbo），一键启用 gRPC 模式：
  - 自动为监听端口下发 `http2` 协议指令；
  - 自动生成 `grpc_pass`、`grpc_set_header` 与 300s 长连接保持参数，确保 Protobuf 流式通信高效稳定。

### 3.4 四层端口转发系统 (Layer 4 Stream Proxy)
- **全协议覆盖**：支持 TCP、UDP 以及 TCP+UDP 混合模式的四层流量穿透中继。
- **内置常用协议模板**：一键预设 MySQL (3306)、Redis (6379)、PostgreSQL (5432)、SSH (2222)、DNS (53 UDP)、RDP (3389)、Minecraft (25565) 等。
- **端口冲突与安全防护**：
  - 严格校验监听端口合法范围（1~65535）；
  - 强力拦截面板与系统核心保留端口（8888、22、80、443），防止误操作导致面板或网络失联；
  - 实时检测同协议端口冲突。
- **高可用热重载与快速启停**：每次配置变更均执行 `nginx -t` 语法预检，故障毫秒级自动回滚；支持单个转发规则一键启停，停用时立即释放监听端口。

### 3.5 真实 ACME / Certbot SSL 证书全生命周期自动化
- **真实 Let's Encrypt 官方签发**：集成 Certbot ACME 引擎，执行真实的 HTTP-01 挑战协议。
- **Nginx 全局穿透保护**：在所有站点与默认服务器规则中注入最高优先级的 `location ^~ /.well-known/acme-challenge/` 规则，杜绝反代或伪静态拦截验证流量。
- **物理证书动态解析**：底层通过 `openssl x509` 解析证书真实元数据（Issuer、SANs、到期时间），自动区分权威 CA 认证与自签名警告。
- **一键站点部署与自动续签**：一键将证书自动下发并绑定至 Nginx 站点，支持 301 强制 HTTPS 跳转、TLS 1.3 与 HTTP/2；内置计划任务支持到期自动换发。

### 3.6 Docker 容器与多架构 Manifest 预检
- **容器生命周期编排**：容器启动、停止、重启、删除与状态监控。
- **Multi-Arch 架构预检**：拉取前向 Docker Hub Registry 请求 OCI Index，自动识别 `linux/arm64`、`linux/arm/v7` 或 `linux/amd64`，智能拦截非 ARM 镜像。
- **实时日志与控制台**：支持流式 Tail 实时日志展示与容器一键启停。

### 3.7 数据库管理与 Gzip 备份流
- 支持 SQLite 3 与 MySQL / MariaDB 数据库实例管理。
- 内置轻量级 Web SQL 查询器，支持快速执行 DDL/DML 语句。
- 数据库一键打包备份与实时 Gzip 压缩流下载，支持历史备份恢复与删除。

### 3.8 系统安全硬化与网络防护 (Security)
- **双栈防火墙**：可视化管理 IPv4 (ufw / iptables) 与 IPv6 (ip6tables) 入站端口规则。
- **SSH 安全加固**：SSH 端口热切换、Root 远程登录开关、密码认证策略控制。
- **防暴力破解**：集成 Fail2ban 实时监控异常爆破行为并自动拉黑攻击 IP。
- **审计日志**：持久化记录管理员操作行为，便于追踪溯源。

### 3.9 Cloudflare WARP 出站路由
- 一键配置与接管官方 Cloudflare WARP 客户端，实现原生 IPv4 / IPv6 出站网络互联与优化。

### 3.10 Web 终端 (Web Terminal)
- 基于 `@xterm/xterm` 的内嵌式 Web SSH 终端，支持 ANSI 全彩色高亮、自适应窗口缩放与快捷命令交互。

### 3.11 系统工具箱 (Toolbox)
把运维中最常改、最容易改错的几项系统配置收进一个页面，每处改动都自动备份并记审计日志：
- **DNS 设置**：自动识别 NetworkManager / systemd-resolved / 裸 `resolv.conf` 三种托管方式并走对应通道，
  同时展示「配置值」与「实际生效值」，避免改完不知道有没有生效；
- **虚拟内存**：`fallocate`（不支持则回退 `dd`）→ `mkswap` → `swapon`，自动写入 `/etc/fstab` 持久化，
  支持关闭删除与 `swappiness` 调整；
- **时区设置**：`timedatectl` 切换，带搜索过滤（400+ 时区）；
- **hosts 设置**：逐行校验「IP + 主机名」格式，保存即生效；
- **镜像源设置**：内置 Debian 官方 / 华为云 / 阿里云 / 清华大学源，支持自定义主仓库与安全源，
  自动识别单行与 deb822 两种格式，并可一键 `apt-get update`。

### 3.12 软件商店与多版本运行时
- **真实版本可选**：安装前用 `apt-cache madison` 查询当前源中**真实可安装**的版本，
  由用户挑选（含来源仓库与「已装」标记），而不是写死几个版本号；
- **PHP 多版本运行池**：PHP 7.4 / 8.1 / 8.2 / 8.3 / 8.4 共存，一键切换 CLI 默认版本；
- **Node.js 版本管理器**（类似 nvm）：任意版本安装到 `/opt/nodejs/<version>`，
  通过 `/usr/local/bin` 软链切换命令行默认版本，**不影响面板自身运行时**；
  下载优先走 npmmirror，按 CPU 架构自动选包；
- **卸载即后台任务**：安装与卸载都进入右上角「任务中心」，跨页面持续追踪进度与日志，
  卸载使用 `apt-get remove --autoremove`，并复核系统真实状态，避免「卸载成功但还装着」。

---

## 🚀 4. 快速安装与部署

### 方式一：一键安装脚本（推荐）

适用于 Debian 12+ / Ubuntu 22.04+ / Armbian / Raspberry Pi OS 等 systemd 发行版，
支持 `aarch64` / `armv7l` / `x86_64` 三种架构。**脚本会自动准备 Node.js 运行时**，
不需要事先安装任何依赖。

```bash
curl -fsSLO https://raw.githubusercontent.com/IKUNHEIHIE/armguard/main/install.sh
sudo bash install.sh
```

安装完成后会直接打印访问地址与初始管理员密码。

**常用参数**

| 命令 | 说明 |
| :--- | :--- |
| `sudo bash install.sh` | 默认安装（端口 `8888`，安全入口 `/armguard`） |
| `sudo bash install.sh --port 21000` | 指定监听端口 |
| `sudo bash install.sh --entrance /mysecret` | 指定安全入口路径 |
| `sudo bash install.sh --upgrade` | 升级已有安装（先自动备份，数据目录保留） |
| `sudo bash install.sh --uninstall` | 卸载程序与服务（保留 `/var/lib/armguard` 数据） |
| `sudo bash install.sh --uninstall --purge` | 连同数据一并删除 |
| `sudo bash install.sh --help` | 查看全部选项 |

**脚本做了哪些事**

1. 校验架构与 systemd 环境，识别发行版；
2. 检测 Node.js，低于 v20 时依次尝试 `apt` → 官方二进制包（国内走 npmmirror 镜像）；
3. 从 GitHub Releases 下载对应架构无关的发行包（纯 JS 产物，架构无关），国内网络自动回退加速镜像；
4. 解压至 `/opt/armguard`，补齐运行期依赖 `ws`；
5. 创建 `0700` 数据目录 `/var/lib/armguard` 与备份目录 `/var/backups/armguard`；
6. 注册 `armguard.service`（含 cgroup 内存上限 `MemoryHigh=256M` / `MemoryMax=512M`），
   开机自启并立即启动，最后打印访问地址与初始密码。

> 升级时会把旧版本完整打包到 `/var/backups/armguard/upgrades/<时间戳>/`，
> 数据目录与管理员凭证不会被动到。

### 方式二：使用发行包手动安装

```bash
# 从 https://github.com/IKUNHEIHIE/armguard/releases 下载对应版本
tar -zxvf armguard-panel-v0.2.0.tar.gz
cd armguard-panel
sudo bash install.sh
```

### 方式三：源码编译与本地开发

```bash
# 1. 克隆代码仓库
git clone https://github.com/IKUNHEIHIE/armguard.git
cd armguard

# 2. 安装后端与前端依赖并构建前端产物
npm ci
npm --prefix frontend ci
npm --prefix frontend run build

# 3. 启动后端服务
npm start
```

---

## 🌐 5. 首次访问与管理员凭证安全策略

- **默认访问地址**：`http://<您的服务器IP>:8888/armguard`（含默认安全入口 `/armguard`）
- **默认管理员账号**：`admin`
- **首次随机初始密码**：
  - 为杜绝公网弱口令风险，ArmGuard **不再使用固定默认密码**，也不会向 `journalctl` 标准输出打印明文密码。
  - 首次初始化时，系统会自动生成高强度随机密码并写入受保护文件 `/var/lib/armguard/initial_admin_password`（权限 `0600`）。
  - 请在服务器终端通过 root 权限查看初始密码并在首次登录后前往「面板设置 -> 管理员与凭证」修改密码：
    ```bash
    sudo cat /var/lib/armguard/initial_admin_password
    ```
- **应急密码重置**：
  - 若遗忘管理员密码，可在服务器本地执行应急重置工具生成新密码（或指定新密码）：
    ```bash
    sudo node /opt/armguard/backend/scripts/reset_admin.js
    ```

---

## 📂 6. 项目目录结构

```text
armguard/
├── install.sh                # 一键安装脚本（自动装 Node.js + 注册 systemd 服务）
├── backend/                  # 后端服务与核心引擎
│   ├── routes/               # 业务模块 API 路由
│   │   ├── apps.js           # 软件商店与服务状态管理
│   │   ├── auth.js           # JWT 认证与 TOTP
│   │   ├── crontabs.js       # 计划任务与系统 Cron 编排
│   │   ├── databases.js      # 数据库管理与 Gzip 备份流
│   │   ├── docker.js         # Docker 容器与 Manifest 架构预检
│   │   ├── files.js          # Web 文件管理器与文本编辑
│   │   ├── security.js       # 防火墙 (IPv4/IPv6)、SSH 加固与 Fail2ban
│   │   ├── settings.js       # 面板参数配置、全局打包与恢复
│   │   ├── sites.js          # Nginx 虚拟主机、PHP 多版本、gRPC 编排
│   │   ├── ssl.js            # Certbot ACME 真实证书引擎与 OpenSSL 解析
│   │   ├── stream.js         # 四层 (Layer 4 Stream) TCP/UDP 端口转发
│   │   ├── system.js         # ARM 硬件传感器、温度、电压与进程追踪
│   │   ├── toolbox.js        # 系统工具箱（DNS / SWAP / 时区 / hosts / 镜像源）
│   │   └── warp.js           # Cloudflare WARP 客户端集成与出站路由
│   ├── templates/            # Nginx 虚拟主机与配置模板
│   ├── scripts/              # 自动化安装、构建与端到端测试套件
│   │   ├── package_release.mjs # 生成发行包（release/*.tar.gz + sha256）
│   │   ├── package_release.py# 独立无依赖分发包打包脚本
│   │   └── test_env.py       # 自动化测试环境配置加载器
│   └── dev_server.js         # 高性能轻量级 Node.js 核心运行时
├── frontend/                 # 前端工程 (Angular 19 + Angular Material / Material Design 3)
│   ├── src/
│   │   ├── api/              # Axios 客户端与 TypeScript 类型定义
│   │   ├── app/
│   │   │   ├── core/         # Angular Signals 状态服务与 Material Design 3 模块
│   │   │   ├── components/   # ARM 硬件诊断徽章、遥测波形图、AI 助手与 WARP 弹窗
│   │   │   └── pages/        # Dashboard, Sites, Stream, SSL, Security 等 14 个 M3 视图
│   │   └── utils/            # 统一请求拦截器与单次文件下载票据工具
│   ├── angular.json          # Angular 编译器与打包配置
│   └── package.json          # 前端依赖配置
├── docs/                     # 深度技术文档与开发规范
│   ├── ARCHITECTURE.md       # 系统核心架构设计与拓扑说明
│   └── API.md                # 完整 RESTful API 接口规范
├── .env.example              # 自动化测试环境变量模版
├── .gitignore                # Git 忽略配置
├── package.json              # 根工程脚本定义
└── README.md                 # 项目主文档
```

---

## 📚 7. 深入阅读

- [系统核心架构设计 (Architecture)](docs/ARCHITECTURE.md)
- [RESTful API 接口规范 (API Reference)](docs/API.md)

---

## 🤝 8. 贡献指南

欢迎提交 Issue 和 Pull Request！
在提交 PR 之前，请确保执行全量自动化测试套件并保证 100% 通过：
```bash
python backend/scripts/test_all_tiers_suite.py
python backend/scripts/test_stream_and_grpc.py
python backend/scripts/test_real_acme_ssl.py
```

---

## 📄 9. 开源协议

本项目采用 [MIT License](LICENSE) 开源协议，欢迎自由使用、修改与分发。
## 📝 10. 版本历史

### v0.2.0（首个正式发行版）
- **一键安装脚本**：`install.sh` 自动准备 Node.js、下载发行包、注册 systemd 服务，
  支持 `--upgrade` / `--uninstall` / 自定义端口与安全入口
- 新增「系统工具箱」：DNS / 虚拟内存 / 时区 / hosts / 镜像源
- 软件商店支持按 apt 真实版本选择安装；卸载改为后台任务，可在任务中心追踪
- Node.js 由「单一 APT 包」升级为**多版本管理器**，支持任意版本共存与 CLI 切换
- 修复长耗时外部命令阻塞事件循环导致的整站卡顿（docker pull / apt / 备份 / 证书签发）
- 修复应用卸载只删元包、实际未卸载的问题（改用 `--autoremove` 并复核真实状态）
- 图标改为自托管 Material Symbols 子集，不再依赖 Google Fonts，离线可用
- 前端全面升级 Angular 21 + Material Design 3，侧边栏分组可折叠
- 服务支持优雅退出（SIGTERM 时关闭连接、通知前端重连），重启耗时从数十秒降至 <1s

