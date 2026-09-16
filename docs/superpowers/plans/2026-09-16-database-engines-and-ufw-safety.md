# 数据库类型真实动态感知与 UFW 防火墙“防失联”安全风控实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现数据库类型真实动态感知（按实际安装只显示 MariaDB/SQLite，剔除伪数据，零数据丢失）及 UFW 防火墙状态展示与防失联安全开启机制。

**Architecture:** 后端通过 `systemctl`、`ss -tulpn` 与 `sshd -T` 分别提供数据库引擎探针与在听端口扫描接口；开启防火墙时执行原子防失联流水线（IPv6 保障 -> 白名单预注入 -> 连接状态保持 -> 启动 UFW）；前端动态渲染可用引擎与高风险防失联确认弹窗。

**Tech Stack:** Node.js (Express), Vue 3, TypeScript, Vite, Tailwind CSS, UFW, iptables/ip6tables.

## Global Constraints
- **现有数据绝对零丢失**：绝不触动 `/var/lib/mysql`、`/var/lib/armguard/databases.json` 与已有 SQLite 数据，不重置数据库服务。
- **SSH / GMSSH 连接绝不中断**：开启 UFW 之前必须确保当前 SSH 端口、面板端口与活跃端口预先写入白名单，且 IPv6 支持开启。

---

### Task 1: 后端数据库可用引擎探测与安全加固

**Files:**
- Modify: `backend/routes/databases.js`

**Interfaces:**
- Produces: `GET /api/v1/databases/engines` -> `{ code: 0, message: 'ok', data: { list: DatabaseEngineItem[] } }`
- Modifies: `POST /api/v1/databases` (增加底层引擎运行状态拦截)

- [ ] **Step 1: 编写引擎探测与状态查询函数**
  在 `backend/routes/databases.js` 中实现 `detectInstalledEngines()`，调用 `systemctl is-active mariadb` / `mysql` 与探测 `/usr/bin/sqlite3`。
- [ ] **Step 2: 挂载 `GET /api/v1/databases/engines` 路由**
  返回结构：`{ key, name, type, service_name, status, is_available, description }`。
- [ ] **Step 3: 加固 `POST /api/v1/databases` 校验**
  若用户选择 `mysql` 或 `mariadb`，先检测服务是否正在运行；若未运行，返回 HTTP 400 阻止创建。
- [ ] **Step 4: 本地语法与逻辑检查**
  运行 node 脚本校验路由定义正确。

---

### Task 2: 前端数据库类型动态感知与引导改造

**Files:**
- Modify: `frontend/src/api/database.ts`
- Modify: `frontend/src/views/databases/DatabasesView.vue`

**Interfaces:**
- Consumes: `databaseApi.getAvailableEngines()`
- Modifies: `createForm.type` 动态绑定逻辑与提示卡片

- [ ] **Step 1: 在 `frontend/src/api/database.ts` 新增类型与 API**
  定义 `DatabaseEngineItem` 并导出 `getAvailableEngines()`。
- [ ] **Step 2: 在 `DatabasesView.vue` 中绑定动态列表**
  新增 `availableEngines` 响应式变量，并在组件挂载与打开创建弹窗时调用加载。
- [ ] **Step 3: 替换 `<select>` 写死的 `<option>`**
  改为 `v-for="eng in availableEngines"` 动态渲染，标注 `(运行中)` 状态。
- [ ] **Step 4: 增加未安装/未运行友好提示横条**
  若无可用 MySQL/MariaDB，默认选 SQLite 并给出前往应用商店引导。

---

### Task 3: 后端 UFW 状态检测、端口扫描与防失联流水线

**Files:**
- Modify: `backend/routes/security.js`

**Interfaces:**
- Produces:
  - `GET /api/v1/firewall/ufw/status`
  - `GET /api/v1/firewall/scan-ports`
  - `POST /api/v1/firewall/ufw/enable`
  - `POST /api/v1/firewall/ufw/disable`

- [ ] **Step 1: 实现 UFW 状态探测接口 `GET /api/v1/firewall/ufw/status`**
  解析 `ufw status verbose`，提取运行状态、默认入站策略、IPv6 开关状态。
- [ ] **Step 2: 实现端口扫描接口 `GET /api/v1/firewall/scan-ports`**
  调用 `ss -tulpn` 与 `sshd -T`，识别当前 SSH 端口、面板端口 (8888)、Web 端口 (80/443) 及其他在听端口，设置 `critical: true`。
- [ ] **Step 3: 实现防失联原子流水线 `POST /api/v1/firewall/ufw/enable`**
  1. 保证 `/etc/default/ufw` 中 `IPV6=yes`；
  2. 循环遍历待放行端口执行 `ufw allow <port>/<proto>`；
  3. 注入 `iptables/ip6tables` 连接保持规则；
  4. 执行 `ufw --force enable`。
- [ ] **Step 4: 实现关闭接口 `POST /api/v1/firewall/ufw/disable`**
  执行 `ufw disable`。

---

### Task 4: 前端 UFW 状态卡片与防失联确认弹窗

**Files:**
- Modify: `frontend/src/api/security.ts`
- Modify: `frontend/src/views/security/SecurityView.vue`

**Interfaces:**
- Consumes: `securityApi.getUfwStatus()`, `securityApi.scanListeningPorts()`, `securityApi.enableUfw()`, `securityApi.disableUfw()`

- [ ] **Step 1: 在 `frontend/src/api/security.ts` 新增 UFW 相关 API**
- [ ] **Step 2: 在 `SecurityView.vue` 防火墙卡片中增加 UFW 状态徽章与开关**
- [ ] **Step 3: 增加【⚠️ 防火墙开启高风险警告 & 防失联端口保留确认】弹窗**
  渲染端口勾选列表（SSH/面板强制锁定，允许勾选其他端口），配备操作确认复选框。
- [ ] **Step 4: 实现开启与关闭切换联动逻辑**

---

### Task 5: 构建、代码校验与本地测试

- [ ] **Step 1: 执行 `npm run build`**
  核验前端构建产物完整且零 TypeScript 错误。
- [ ] **Step 2: Git 提交并推送**
  提交代码至 GitHub 仓库 `main` 分支。

---

### Task 6: VPS 实机部署与全链路验证

- [ ] **Step 1: 同步代码并重启面板服务**
  部署更新至 `/opt/armguard`，重启 `armguard.service`。
- [ ] **Step 2: 验证现有数据库完好无损**
  核验 `/var/lib/mysql` 与原有数据库查询无误。
- [ ] **Step 3: 实测新建数据库动态类型**
  调用 API / 浏览器访问新建数据库弹窗，确认只显示真实可用的 MariaDB 10.11 与 SQLite 3。
- [ ] **Step 4: 实测 UFW 状态与端口扫描**
  验证 UFW 状态检测与端口扫描准确抓取 22、8888、80、443。
- [ ] **Step 5: 验证防失联保护**
  核验预先放行白名单逻辑，确保 SSH 连接与面板通信坚固无失联。
