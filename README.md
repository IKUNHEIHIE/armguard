# 🛡️ ArmGuard — 面向 ARM 架构的高性能轻量级 Linux 运维面板

<p align="center">
  <img src="https://img.shields.io/badge/Architecture-ARM64%20%7C%20ARMv7%20%7C%20x86__64-00D084?style=for-the-badge&logo=arm" alt="ARM Native" />
  <img src="https://img.shields.io/badge/Memory%20Footprint-%3C%2050MB-10B981?style=for-the-badge" alt="Memory Footprint" />
  <img src="https://img.shields.io/badge/Frontend-Vue%203%20%2B%20Vite%20%2B%20Tailwind-4FC08D?style=for-the-badge&logo=vuedotjs" alt="Vue 3" />
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

---

## 🚀 4. 快速安装与部署

### 方式一：独立部署包一键安装（推荐生产环境）

适用于 Ubuntu 20.04+、Debian 11+、openEuler、Raspberry Pi OS 等 ARM64/ARMv7 平台。

```bash
# 1. 下载或解压发行包
tar -zxvf armguard-panel-v0.1.0.tar.gz
cd armguard

# 2. 执行一键安装脚本（自动配置 systemd 服务与 cgroup 内存限制）
sudo bash install.sh
```

安装脚本会自动：
1. 检查并安装核心运行时环境（Node.js、Nginx、Certbot）；
2. 部署面板核心文件至 `/opt/armguard`；
3. 创建持久化数据目录 `/var/lib/armguard` 与日志目录 `/var/log/armguard`；
4. 注册并启动 `armguard.service` 系统服务。

### 方式二：源码编译与本地开发

```bash
# 1. 克隆代码仓库
git clone https://github.com/IKUNHEIHIE/armguard.git
cd armguard

# 2. 安装前端依赖并构建
npm --prefix frontend install
npm --prefix frontend run build

# 3. 启动后端服务
npm start
```

---

## 🌐 5. 默认访问凭证

- **访问地址**：`http://<您的服务器IP>:8888`
- **默认账号**：`admin`
- **默认密码**：`armguard`（初次登录后建议立即在「设置」中修改）

---

## 📂 6. 项目目录结构

```text
armguard/
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
│   │   └── warp.js           # Cloudflare WARP 客户端集成与出站路由
│   ├── templates/            # Nginx 虚拟主机与配置模板
│   ├── scripts/              # 自动化安装、构建与端到端测试套件
│   │   ├── install.sh        # 生产环境一键部署与 systemd 服务安装
│   │   ├── package_release.py# 独立无依赖分发包打包脚本
│   │   └── test_env.py       # 自动化测试环境配置加载器
│   └── dev_server.js         # 高性能轻量级 Node.js 核心运行时
├── frontend/                 # 前端工程 (Vue 3 + Vite + Tailwind CSS)
│   ├── src/
│   │   ├── api/              # Axios 客户端与 TypeScript 类型定义
│   │   ├── views/            # Dashboard, Sites, Stream, SSL, Security 等视图
│   │   ├── components/       # 硬件状态指示器, 图表, 模态弹窗与导航栏
│   │   ├── stores/           # Pinia 全局状态存储
│   │   └── router/           # 路由守卫与权限过滤
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
