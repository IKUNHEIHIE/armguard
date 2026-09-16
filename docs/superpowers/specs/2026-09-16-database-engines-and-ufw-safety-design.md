# 数据库类型真实动态感知与 UFW 防火墙“防失联”安全风控设计规范

## 1. 目标与背景

用户在面板日常运维与安全审查中指出两个关键缺陷与重大安全风险：
1. **新建数据库类型展示有误**：前端“新建数据库”下拉框硬编码写死了 `MySQL 8.0/8.4`、`MariaDB`、`SQLite 3`、`PostgreSQL 16`、`Redis 7`。即便服务器未安装或仅安装了单种数据库，亦全部展示。此外，PostgreSQL 16 与 Redis 7 根本未实现或不属于带用户表结构的 SQL 实例；
2. **安全防护缺失 UFW 运行状态，且开启防火墙存在致命失联风险**：安全中心未展示 UFW 真实运行状态。更关键的是，`ufw enable` 默认策略为 `DROP` 入站流量，若未提前自动放行所有现有服务端口（尤其是当前正在使用的 SSH 端口与面板端口），会导致服务严重中断，甚至造成管理员 SSH 永久失联（当前通过 GMSSH/IPv6 连接，一旦失联无法恢复）。

### 核心安全保障原则
- **现有数据库绝对零丢失**：更新面板与接口探测绝不修改或触碰 `/var/lib/mysql`、`/var/lib/armguard/databases.json` 或现有 SQLite 文件，MariaDB/MySQL 数据库服务全程不停止。
- **SSH / GMSSH 链接绝对不断开（防失联保底机制）**：开启 UFW 之前，系统必须完成端口扫描与白名单注入，确保 IPv6 支持、连接状态保持规则与必要端口 100% 提前生效。

---

## 2. 数据库类型真实动态感知设计

### 后端设计 (`backend/routes/databases.js`)
- **新增接口 `GET /api/v1/databases/engines`**：
  - 调用 `systemctl is-active mariadb` 与 `systemctl is-active mysql`，结合二进制文件 `/usr/bin/mariadb`、`/usr/bin/mysql` 探测当前真实运行的数据库引擎：
    - 若运行 MariaDB，返回 `key: 'mariadb', name: 'MariaDB 10.11', type: 'mariadb', status: 'running', is_available: true`；
    - 若运行 MySQL，返回 `key: 'mysql', name: 'MySQL 8.0', type: 'mysql', status: 'running', is_available: true`；
    - 检查 `/usr/bin/sqlite3`，返回 `key: 'sqlite', name: 'SQLite 3 (单文件轻量)', type: 'sqlite', status: 'running', is_available: true`；
    - 剔除未实现的 PostgreSQL 16 与键值缓存 Redis 7。
- **创建校验加固 `POST /api/v1/databases`**：
  - 当指定 `type: 'mysql'` 或 `type: 'mariadb'` 时，校验对应守护进程是否正在运行。若未运行，返回 HTTP 400 明确提示，杜绝静默失败或生成虚假文件。

### 前端设计 (`frontend/src/views/databases/DatabasesView.vue` & `api/database.ts`)
- 前端新增 `getAvailableEngines()` API 调用。
- 弹窗打开时动态加载引擎列表，`<select>` 仅渲染真实可用引擎选项。
- 若系统当前未运行任何 MySQL/MariaDB，默认选中 SQLite，并渲染友好引导警告：*“⚠️ 当前未运行 MySQL/MariaDB 服务，无法创建网络数据库。[前往应用商店安装/启动]”*。

---

## 3. UFW 防火墙运行状态与“防失联”安全风控设计

### 1. UFW 状态检测 (`GET /api/v1/firewall/ufw/status`)
- 后端调用 `ufw status verbose`，提取：
  - `status`: `'active'` | `'inactive'`
  - `default_incoming`: 如 `'deny (incoming)'`
  - `default_outgoing`: 如 `'allow (outgoing)'`
  - `ipv6_enabled`: 读取 `/etc/default/ufw` 中的 `IPV6` 设置（必须为 `yes`）
  - `ufw_rules`: 现存的 UFW 编号规则列表

### 2. 在听端口主动扫描 (`GET /api/v1/firewall/scan-ports`)
- 后端调用 `ss -tulpn` 与 `sshd -T`，自动分析当前对外开放监听的端口：
  - **SSH 端口**（通过 sshd 配置与进程精准识别，如 `22/tcp`，标记为 `critical: true`，不可取消勾选）
  - **面板端口**（8888/tcp，标记为 `critical: true`，不可取消勾选）
  - **Web 基础端口**（`80/tcp`, `443/tcp`）
  - **其他业务端口**（如 xray/x-ui 的 `2096`, `61000`, `48269`）

### 3. 高风险操作拦截与确认弹窗 (`SecurityView.vue`)
- 用户在控制台点击“开启 UFW 防火墙”时：
  - 拦截直接触发，弹出 **【⚠️ 防火墙开启高风险警告 & 防失联端口保留确认】** 模态框。
  - 醒目警示：*“开启防火墙后，默认入站策略将转为 DROP。为防止 SSH 失联（GMSSH 远程中断）与面板瘫痪，系统将强制预先放行以下正在监听的端口”*。
  - 列出自动扫描出的端口标签列表（SSH 与面板端口高亮并锁定勾选，允许补充其他端口）。
  - 用户必须勾选确认选项方可点击“确认开启防火墙”。

### 4. 开启防火墙流水线 (`POST /api/v1/firewall/ufw/enable`)
后端严格按以下顺序原子执行：
1. **确保 IPv6 支持**：校验 `/etc/default/ufw`，若 `IPV6=no` 则自动调整为 `IPV6=yes`，防止 IPv6 SSH 流量被静默丢弃；
2. **预先注入放行规则**：在 `ufw enable` 执行之前，针对每一个待保留端口执行 `ufw allow <port>/<proto>`，确保写入 `/etc/ufw/user.rules` 与 `/etc/ufw/user6.rules`；
3. **保持既有连接（Connection Tracking）**：注入 `iptables/ip6tables -A INPUT -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT`，保障正在执行 API 请求的会话绝不中断；
4. **非交互执行开启**：执行 `ufw --force enable`；
5. **返回最新状态**。

### 5. 关闭防火墙 (`POST /api/v1/firewall/ufw/disable`)
- 执行 `ufw disable`，系统退回开放模式。

---

## 5. 验证方案

1. **静态代码与编译检查**：
   - 运行 `vue-tsc -b && vite build`，确保无类型报错。
2. **数据库动态探测验证**：
   - 本地/远程调用 `GET /api/v1/databases/engines`，核实仅返回真实安装的 `MariaDB 10.11` 与 `SQLite 3`，无 MySQL/Postgres/Redis 冗余项。
   - 检查已有的数据库元数据和数据文件完好无损。
3. **UFW 状态与端口预检验证**：
   - 调用 `GET /api/v1/firewall/ufw/status`，准确返回当前 `inactive` 状态与默认策略。
   - 调用 `GET /api/v1/firewall/scan-ports`，核验端口扫描能准确识别 SSH (22)、面板 (8888)、Nginx (80/443) 等。
4. **防失联模拟与生效验证**：
   - 检查预放行逻辑，确保在开启时连接绝不掉线。
