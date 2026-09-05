# Pagoda-Style Table Layout for ArmGuard AppStore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the ArmGuard software store (`AppStoreView.vue`) from a 3-column card grid into an information-dense, Pagoda-style (宝塔面板风格) table list view, completely eliminating commercial advertising banners and pricing columns while preserving 100% of underlying management, service control, and WARP capabilities.

**Architecture:** Update the presentation layer in Vue 3 and Tailwind CSS to implement a high-density, glassmorphism-styled table. Integrate a top toolbar with capsule category filtering and search, a local storage-backed dashboard switch toggle per app, directory path tooltips, running status indicators, and modular action triggers.

**Tech Stack:** Vue 3 (Composition API, `<script setup lang="ts">`), Tailwind CSS, Lucide Icons, Pinia, EventBus.

## Global Constraints

- No commercial advertising banners or price/expiration columns.
- All existing modals (`Modal`, `WarpPluginModal`, generic management forms, streaming install progress) must remain 100% operational.
- Preserve responsive overflow support (`overflow-x-auto`) so the table scrolls gracefully on smaller viewports.
- Keep eventBus listeners for `EVENTS.APPS_UPDATED` and `EVENTS.WARP_UPDATED`.

---

### Task 1: Update State & Filter Categories in `AppStoreView.vue`

**Files:**
- Modify: `frontend/src/views/appstore/AppStoreView.vue`

**Interfaces:**
- Consumes: `AppMarketItem`, `appStoreApi.getMarketList()`
- Produces: `activeCategory`, `searchQuery`, `homeApps` (reactive set), `filteredApps`

- [ ] **Step 1: Define expanded category list and search query state**
  Add categories matching standard Linux panel types:
  - `all`: 全部应用
  - `installed`: 已安装
  - `webserver`: Web 服务
  - `database`: 数据库与缓存
  - `runtime`: 编程环境
  - `network`: 网络与穿透
  - `tools`: 运维工具
- [ ] **Step 2: Add `homeApps` state with localStorage persistence**
  Initialize `homeApps` from `localStorage.getItem("armguard_home_apps")` and provide a helper `toggleHomeDisplay(appKey: string)` to persist changes.
- [ ] **Step 3: Update `filteredApps` computed property**
  Filter by both category (including `installed` filtering `app.status === 'installed'`) and search keyword (`searchQuery`).

---

### Task 2: Build Pagoda-Style Table UI & Top Filter Toolbar

**Files:**
- Modify: `frontend/src/views/appstore/AppStoreView.vue`

**Interfaces:**
- Consumes: `filteredApps`, `activeCategory`, `searchQuery`, `homeApps`
- Produces: Table DOM structure conforming to Pagoda specifications (7 columns)

- [ ] **Step 1: Replace header and card grid with Top Category Toolbar**
  Construct the toolbar with:
  - Left: "应用分类" title + capsule button group (`全部`, `已安装 (N)`, `Web 服务`, `数据库与缓存`, `网络与穿透`, `编程环境`, `运维工具`).
  - Right: Search input with search icon + Clear button + Refresh button.
- [ ] **Step 2: Implement 7-Column Table View (`<table>`)**
  Replace `.grid` with `.glass-panel` wrapped `<div class="overflow-x-auto">` and structured `<table>`:
  - `Col 1 - 软件名称`: Icon (40x40) + Name + Version tag + Category badge.
  - `Col 2 - 开发商`: "官方" / "开源社区".
  - `Col 3 - 说明`: Description text + ARM64/NEON optimization tags + delivery method.
  - `Col 4 - 位置`: 📁 folder icon with path title/tooltip (e.g. `/etc/nginx`, `/etc/warp`), click to copy.
  - `Col 5 - 状态`: Green pulse dot + "运行中", gray dot + "已停止", or "--" for uninstalled.
  - `Col 6 - 首页显示`: Tailwind switch toggle linked to `homeApps.has(app.key)`.
  - `Col 7 - 操作`:
    - If `status === 'not_installed'`: Green button "安装".
    - If `status === 'installed'`: Button group: "设置" (triggers `openManageModal` or `showWarpModal`), "重载" / "停止" / "启动", and "卸载".

---

### Task 3: Hook Modals & Action Triggers

**Files:**
- Modify: `frontend/src/views/appstore/AppStoreView.vue`

**Interfaces:**
- Consumes: `openInstallModal`, `openManageModal`, `handleServiceControl`, `uninstallApp`, `showWarpModal`
- Produces: Seamless modal and service interactions

- [ ] **Step 1: Wire "设置" to open `showWarpModal` when `app.key === 'warp'`**
  Ensure clicking "设置" for WARP opens the dedicated `WarpPluginModal`, while other apps open the generic visual config modal.
- [ ] **Step 2: Add quick service control buttons in table row**
  Allow restarting/stopping running services directly or from the management modal.
- [ ] **Step 3: Ensure path copy toast notification**
  When clicking the folder icon in the "位置" column, copy the file path to clipboard and trigger `toast.info("已复制路径: " + path)`.

---

### Task 4: Production Build & ARM Server Deployment

**Files:**
- Modify: `frontend/` (Build output in `frontend/dist`)
- Test: `backend/scripts/deploy_live_engine.py`

- [ ] **Step 1: Execute `npm run build` in `frontend`**
  Verify TypeScript types and Vite production compilation pass with 0 errors.
- [ ] **Step 2: Package release with `package_release.py`**
  Generate updated production distribution package.
- [ ] **Step 3: Deploy to live ARM host via `deploy_live_engine.py`**
  Sync bundle to `<SERVER_IP>` and restart `armguard.service`.
- [ ] Manual Live Verification
  Open live panel at `http://<SERVER_IP>:8888/#/apps` and verify table rendering, category filtering, search, switch toggle, and modal operations.
