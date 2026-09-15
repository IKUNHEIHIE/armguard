# MySQL / MariaDB 版本自选安装与平滑切换技术设计规范

## 1. 目标与背景
ArmGuard 面板当前的 MySQL / MariaDB 插件在安装时写死了 `mariadb-server`，前端传参未被后端解析；且在插件管理弹窗中缺少版本切换机制，部分展示项与底层后端缺少深度联动。

本设计旨在实现：
1. **安装时版本自选**：用户在应用商店安装 MySQL/MariaDB 时，可自主选择 `MariaDB 10.11 (LTS)` 或 `MySQL 8.0`，后端根据入参调用对应 APT 包完成干净安装。
2. **插件管理中的版本平滑迁移与切换**：
   - 管理弹窗中展示当前运行引擎及版本，提供一键切换目标版本功能。
   - 切换时采用“全量逻辑导出 (`mysqldump`) -> 隔离旧数据目录 -> 彻底卸载旧包 -> 安装目标版本包 -> 自动回放还原数据 -> 热重载”的平滑迁移机制，确保业务数据不丢失。
3. **真实后端闭环**：
   - 彻底梳理所有前端配置项（端口、最大连接数、缓冲池大小、字符集、慢日志、Root密码修改、底层配置热重载、数据库管理联动），保证 100% 真实有效，拒绝空壳展示。

---

## 2. 系统环境与软件包映射 (Ubuntu 24.04 ARM64)

- **MariaDB 10.11 (LTS)**:
  - APT 软件包: `mariadb-server`, `mariadb-client`
  - systemd 服务名: `mariadb.service`
  - 默认配置文件: `/etc/mysql/mariadb.conf.d/50-server.cnf` (或 `/etc/mysql/my.cnf`)
  - CLI 工具: `/usr/bin/mariadb`, `/usr/bin/mariadb-dump` / `/usr/bin/mysql`
- **MySQL 8.0**:
  - APT 软件包: `mysql-server`, `mysql-client`
  - systemd 服务名: `mysql.service`
  - 默认配置文件: `/etc/mysql/mysql.conf.d/mysqld.cnf` (或 `/etc/mysql/my.cnf`)
  - CLI 工具: `/usr/bin/mysql`, `/usr/bin/mysqldump`

---

## 3. 核心功能实现细节

### 3.1 AppStore 安装接口 (`POST /api/v1/apps/:key/install`)
- 读取 `req.body` 中的 `version`：
  - 若 `version.includes('MySQL 8')` 或 `version === 'mysql-8.0'`：安装包设为 `mysql-server`。
  - 若 `version.includes('MariaDB')` 或 `version === 'mariadb-10.11'`：安装包设为 `mariadb-server`。
- 启动安装异步任务（`appInstallTasks`），使用安全参数数组调用 `spawn('apt-get', ['install', '-y', pkgName], { env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' } })`。
- 实时捕获 stdout/stderr 写入 `task.logs` 与 `task.log_tail`，并动态计算进度百分比。

### 3.2 数据库平滑迁移切换接口 (`POST /api/v1/apps/mysql/switch-version`)
- **入参**: `{ target_version: 'mariadb-10.11' | 'mysql-8.0' }`
- **任务流程**:
  1. **检查与前置条件**: 确定当前安装的是 MariaDB 还是 MySQL；若目标版本与当前版本一致，返回提示。
  2. **创建备份文件**:
     - 路径: `/var/backups/mysql_migrate_<timestamp>.sql`
     - 导出所有现有用户数据库（排除内置系统库或单独导出业务库）。
  3. **停止当前服务**:
     - `systemctl stop mariadb` 或 `systemctl stop mysql`
  4. **归档旧数据目录**:
     - 将 `/var/lib/mysql` 重命名为 `/var/lib/mysql.bak.<timestamp>`，避免存储引擎底层格式不兼容导致启动失败。
  5. **彻底清理旧包**:
     - 执行 `apt-get remove --purge -y <old_packages>` 与 `apt-get autoremove -y`。
  6. **安装目标包**:
     - 执行 `apt-get install -y <target_packages>`。
  7. **初始化并启动新服务**:
     - `systemctl start <new_service>` 并校验运行状态。
  8. **还原数据**:
     - 若第 2 步成功导出了业务数据，通过 CLI 将 sql 文件导入新数据库实例。
  9. **更新状态与缓存**:
     - 清除面板应用缓存 `invalidateMarketAppsCache()`，刷新状态。

### 3.3 插件管理常用可视化设置 (`saveVisualConfig` & `getAppManagement`)
- 自动适配两种引擎的配置文件：
  - 若当前为 MariaDB，优先读写 `/etc/mysql/mariadb.conf.d/50-server.cnf`；
  - 若当前为 MySQL，优先读写 `/etc/mysql/mysql.conf.d/mysqld.cnf`；
  - 降级读写 `/etc/mysql/my.cnf`。
- 可视化项包括：
  - `port`: 监听端口（默认 3306）
  - `max_connections`: 最大连接数
  - `innodb_buffer_pool_size`: 缓冲池大小
  - `key_buffer_size`: 键缓冲区
  - `character_set_server`: 字符集（推荐 `utf8mb4`）
  - `slow_query_log`: 慢查询开关与阈值
- 配置保存后，自动根据当前运行引擎重启 `mariadb` 或 `mysql`。

### 3.4 修改 Root 密码 (`POST /api/v1/apps/mysql/root-password`)
- 自动判断当前环境 CLI 工具（`mariadb` 优先，不存在则 `mysql`）。
- 使用带单引号安全转义的 SQL 语句：`ALTER USER 'root'@'localhost' IDENTIFIED BY '...'; FLUSH PRIVILEGES;`。
- 采用参数化 `spawnSync(cli, ['-e', sql])`，杜绝任何命令注入。

### 3.5 数据库管理 (`routes/databases.js`) 全局适配
- 针对数据库增删查改、用户权限配置等操作，动态获取可用的数据库客户端 CLI：
  `const dbCli = fs.existsSync('/usr/bin/mariadb') ? 'mariadb' : 'mysql'`
- 确保无论切换到哪个引擎，面板主界面的“数据库”功能均无缝可用。

---

## 4. 前端交互设计 (`AppStoreView.vue`)

1. **安装弹窗**：
   - 增加版本简介与建议（如：低内存 VPS 推荐 MariaDB 10.11，标准生产推荐 MySQL 8.0）。
2. **管理弹窗新增 Tab**：
   - 选项卡：`🔄 版本切换 (Switch Version)`。
   - 顶部显示：当前引擎与版本 Badge、运行状态、数据目录。
   - 版本列表卡片：展示 `MariaDB 10.11 (LTS)` 与 `MySQL 8.0`。
   - 切换触发确认 Modal，明确告知：“即将全量备份现有数据并平滑切换，预计耗时 1-2 分钟，请确认”。
   - 切换过程中展示实时执行进度与终端输出窗口。

---

## 5. 验证与测试计划
1. **单测验证**：
   - 验证 `apps/mysql/switch-version` 路由参数校验与安全防御。
   - 验证配置读写对 MariaDB 与 MySQL 不同配置文件的解析正确性。
2. **实机部署验证**：
   - 在远程 ARM64 VPS 上测试版本切换（MariaDB ⇄ MySQL），检验 `mysqldump` 备份、包替换、数据恢复及服务启动全流程。
   - 验证前端界面各选项卡数据与后端交互状态一致。
