# MySQL / MariaDB 版本自选安装与平滑切换实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现应用商店安装 MySQL/MariaDB 时自主选择版本（MariaDB 10.11 LTS 或 MySQL 8.0），在插件管理中新增版本看板与一键平滑安全切换引擎功能（自动逻辑导出、环境隔离、包替换、数据回放导入），并确保前端所有功能在后端 100% 真实闭环。

**Architecture:**
- 后端：在 `backend/routes/apps.js` 中解析安装与版本切换请求，利用 `appInstallTasks` 异步驱动 APT 与 `mysqldump` 备份/恢复流程；在 `backend/routes/databases.js` 中统一自适应 `mariadb`/`mysql` CLI 工具。
- 前端：在 `frontend/src/api/appstore.ts` 补充接口定义；在 `frontend/src/views/appstore/AppStoreView.vue` 增加「🔄 版本与引擎切换」Tab 及安全切换确认弹窗与实时执行进度终端。

**Tech Stack:** Node.js, Vue 3, TypeScript, TailwindCSS, APT, systemd, MariaDB, MySQL 8.0.

## Global Constraints
- 平台环境为 Ubuntu 24.04 ARM64，官方 Noble 源原生支持 `mariadb-server` (10.11) 与 `mysql-server` (8.0)。
- 切换过程中严防数据丢失：必须在卸载旧版本前完成全量 `mysqldump` 备份至 `/var/backups/`，并归档旧 `/var/lib/mysql`。
- 所有 shell 命令禁止使用 `execSync` 拼接，全面使用 `spawn` / `spawnSync` 数组化参数传参。

---

### Task 1: 完善后端应用商店安装版本解析 (`backend/routes/apps.js`)

**Files:**
- Modify: `backend/routes/apps.js`
- Test: `scratch/test_mysql_switch.js`

**Interfaces:**
- Consumes: `POST /api/v1/apps/mysql/install` with body `{ version: 'MariaDB 10.11 (LTS)' | 'MySQL 8.0' }`
- Produces: 启动针对目标包名（`mariadb-server` 或 `mysql-server`）的真实 APT 安装任务，返回 `{ task_id }`

- [ ] **Step 1: 编写测试用例验证版本参数解析与包名映射**
- [ ] **Step 2: 在 `handleApps` 的 `/apps/:appKey/install` 路由中解析 `req.body`**
- [ ] **Step 3: 根据 `version` 映射包名：MariaDB 对应 `mariadb-server`，MySQL 对应 `mysql-server`**
- [ ] **Step 4: 运行测试确保安装任务正确启动**

---

### Task 2: 实现后端平滑迁移切换接口 (`POST /api/v1/apps/mysql/switch-version`)

**Files:**
- Modify: `backend/routes/apps.js`
- Test: `scratch/test_mysql_switch.js`

**Interfaces:**
- Consumes: `POST /api/v1/apps/mysql/switch-version` with `{ target_version: 'mariadb-10.11' | 'mysql-8.0' }`
- Produces: `{ task_id: string }`，异步驱动数据备份、环境卸载、新包安装、数据回放与服务启动全流程

- [ ] **Step 1: 编写平滑切换测试用例，覆盖目标版本校验、自切换防御**
- [ ] **Step 2: 实现 `switch-version` 路由及异步迁移流水线任务**
- [ ] **Step 3: 完善备份命令 (`mysqldump`)、停服务、目录隔离重命名、包卸载与安装、数据导入回放与状态重置**
- [ ] **Step 4: 运行测试确保迁移逻辑安全健全**

---

### Task 3: 适配后端配置读写、Root 密码修改与数据库模块全局兼容

**Files:**
- Modify: `backend/routes/apps.js`
- Modify: `backend/routes/databases.js`
- Test: `scratch/test_mysql_switch.js`

**Interfaces:**
- Consumes: `getAppManagement('mysql')`, `saveVisualConfig('mysql', cfg)`, `POST /api/v1/apps/mysql/root-password`
- Produces: 动态适配 MariaDB (`50-server.cnf`) 与 MySQL (`mysqld.cnf`) 配置文件读写及 CLI 命令调用

- [ ] **Step 1: 在 `getAppManagement('mysql')` 中返回当前运行的精确引擎、版本与可切换版本列表**
- [ ] **Step 2: 在 `saveVisualConfig` 与 `root-password` 中根据当前运行引擎动态选取对应配置文件与 CLI 工具**
- [ ] **Step 3: 在 `backend/routes/databases.js` 中动态适配 `mariadb` 与 `mysql` CLI，确保数据库增删查改正常**
- [ ] **Step 4: 运行测试用例确认全部通过**

---

### Task 4: 前端 API 定义与扩展 (`frontend/src/api/appstore.ts`)

**Files:**
- Modify: `frontend/src/api/appstore.ts`

**Interfaces:**
- Produces: `switchMysqlVersion: (targetVersion: string) => apiClient.post(...)`

- [ ] **Step 1: 在 `appStoreApi` 中新增 `switchMysqlVersion(targetVersion: string)` 接口调用**
- [ ] **Step 2: 扩展 `AppManagementData.visual_config` 类型定义以包含可用版本与当前引擎信息**

---

### Task 5: 前端插件管理 UI 增加「版本与引擎切换」Tab (`frontend/src/views/appstore/AppStoreView.vue`)

**Files:**
- Modify: `frontend/src/views/appstore/AppStoreView.vue`

**Interfaces:**
- Consumes: `appStoreApi.switchMysqlVersion`, `manageData.visual_config.available_versions`
- Produces: 新增「🔄 版本与引擎切换」Tab，支持展示当前运行信息、版本卡片、二次确认 Modal 与实时迁移控制台进度

- [ ] **Step 1: 在插件管理 Modal 中为 `mysql` 新增 Tab 按钮 `🔄 版本与引擎切换`**
- [ ] **Step 2: 编写版本看板与目标引擎卡片展示，提供切换操作按钮**
- [ ] **Step 3: 编写数据安全二次确认 Modal，展示数据备份提示**
- [ ] **Step 4: 联动任务轮询组件，展示迁移执行实时日志与进度条**
- [ ] **Step 5: 优化 AppStore 安装弹窗中的版本选项提示文字**

---

### Task 6: 全量单测、构建、代码提交与远程 VPS 实机部署验证

**Files:**
- Test: `scratch/test_mysql_switch.js`
- Test: `scratch/remote_live_mysql_test.py`

- [ ] **Step 1: 运行本地全面单测，验证接口逻辑、配置文件自适应及安全参数**
- [ ] **Step 2: 本地编译前端并验证无 TS 语法错误**
- [ ] **Step 3: Git 提交并推送至 `origin/main`**
- [ ] **Step 4: 部署至远程 ARM64 VPS，实机测试真实切换与状态更新**
- [ ] **Step 5: 撰写 Walkthrough 验证总结报告**
