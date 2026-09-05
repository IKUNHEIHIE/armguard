<template>
  <div class="space-y-5">
    <!-- Top Category Toolbar & Search Filter (Pagoda Style) -->
    <div class="glass-panel p-4 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-4">
      <!-- Left: Category Tabs -->
      <div class="flex items-center flex-wrap gap-2 text-xs font-mono">
        <span class="text-slate-400 font-semibold mr-1 flex items-center gap-1.5">
          <span>应用分类</span>
        </span>
        <button
          v-for="cat in categories"
          :key="cat.key"
          @click="activeCategory = cat.key"
          class="px-3.5 py-1.5 rounded-lg transition font-medium cursor-pointer"
          :class="activeCategory === cat.key ? 'bg-brand-500 text-slate-950 font-bold shadow-md shadow-brand-500/20' : 'bg-slate-900/90 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800'"
        >
          {{ cat.label }}
        </button>
      </div>

      <!-- Right: Search Box & Refresh -->
      <div class="flex items-center gap-2">
        <div class="relative w-64">
          <Search class="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索软件名称或功能..."
            class="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-8 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500 transition font-mono"
          />
          <button
            v-if="searchQuery"
            @click="searchQuery = ''"
            class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        </div>
        <button
          @click="refreshApps"
          :disabled="loadingApps"
          class="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition flex items-center gap-1.5 text-xs font-mono cursor-pointer"
          title="刷新应用与运行状态"
        >
          <RefreshCw class="w-3.5 h-3.5" :class="loadingApps ? 'animate-spin text-brand-400' : ''" />
          <span>刷新</span>
        </button>
      </div>
    </div>

    <!-- Pagoda-Style Software Table List -->
    <div class="glass-panel rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse text-xs font-mono">
          <thead>
            <tr class="border-b border-slate-800 bg-slate-900/80 text-slate-400 text-[11px] select-none font-semibold">
              <th class="py-3.5 pl-5 pr-3 w-56">软件名称</th>
              <th class="py-3.5 px-3 w-28">开发商</th>
              <th class="py-3.5 px-3 min-w-[280px]">说明</th>
              <th class="py-3.5 px-3 w-20 text-center">位置</th>
              <th class="py-3.5 px-3 w-28 text-center">状态</th>
              <th class="py-3.5 px-3 w-24 text-center">首页显示</th>
              <th class="py-3.5 pr-5 pl-3 w-56 text-right">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/60 text-slate-300">
            <tr
              v-for="app in filteredApps"
              :key="app.key"
              class="hover:bg-slate-800/40 transition-colors group"
            >
              <!-- 1. 软件名称 -->
              <td class="py-3.5 pl-5 pr-3">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-xl shadow-inner flex-shrink-0 group-hover:border-slate-700 transition">
                    {{ app.icon }}
                  </div>
                  <div>
                    <div class="font-bold text-sm text-white group-hover:text-brand-400 transition flex items-center gap-1.5">
                      <span>{{ app.name }}</span>
                    </div>
                    <div class="text-[11px] text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                      <span class="text-slate-500">{{ app.current_version || app.versions?.[0] || 'LTS' }}</span>
                      <span class="px-1.5 py-0.2 rounded text-[9px] bg-slate-800/90 text-slate-400 border border-slate-700">
                        {{ app.category.toUpperCase() }}
                      </span>
                    </div>
                  </div>
                </div>
              </td>

              <!-- 2. 开发商 -->
              <td class="py-3.5 px-3 text-slate-400">
                <span class="text-slate-400 font-medium">
                  {{ appVendors[app.key] || '官方' }}
                </span>
              </td>

              <!-- 3. 说明 -->
              <td class="py-3.5 px-3">
                <div class="space-y-1">
                  <p class="text-xs text-slate-300 leading-relaxed line-clamp-2">
                    {{ app.description }}
                  </p>
                  <div class="flex items-center flex-wrap gap-1.5 text-[10px]">
                    <span class="px-1.5 py-0.2 rounded font-bold bg-brand-500/15 text-brand-300 border border-brand-500/25">
                      ARM64 深度优化
                    </span>
                    <span v-if="app.has_prebuilt" class="text-emerald-400 font-medium flex items-center gap-0.5">
                      ⚡ 预编译秒装
                    </span>
                    <span v-else class="text-amber-400 font-medium flex items-center gap-0.5">
                      🛠️ 源码构建
                    </span>
                  </div>
                </div>
              </td>

              <!-- 4. 位置 -->
              <td class="py-3.5 px-3 text-center">
                <button
                  v-if="app.status === 'installed'"
                  @click="copyPath(appPaths[app.key] || '/opt/armguard')"
                  :title="`安装路径: ${appPaths[app.key] || '/opt/armguard'} (点击复制)`"
                  class="p-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-amber-400 hover:text-amber-300 border border-slate-800 transition inline-flex items-center justify-center cursor-pointer shadow-sm"
                >
                  <Folder class="w-4 h-4" />
                </button>
                <span v-else class="text-slate-600 font-mono">--</span>
              </td>

              <!-- 5. 状态 -->
              <td class="py-3.5 px-3 text-center">
                <span
                  v-if="app.status === 'installed' && app.service_status"
                  class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border"
                  :class="app.service_status === 'running' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'"
                >
                  <span
                    class="w-1.5 h-1.5 rounded-full"
                    :class="app.service_status === 'running' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'"
                  ></span>
                  <span>{{ app.service_status === 'running' ? '运行中' : '已停止' }}</span>
                </span>
                <span v-else-if="app.status === 'installed'" class="text-slate-500 font-mono text-[11px]">
                  CLI 工具
                </span>
                <span v-else class="text-slate-600 font-mono">--</span>
              </td>

              <!-- 6. 首页显示 Switch -->
              <td class="py-3.5 px-3 text-center">
                <button
                  @click="toggleHomeDisplay(app.key)"
                  type="button"
                  class="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
                  :class="homeApps.has(app.key) ? 'bg-brand-500' : 'bg-slate-800 hover:bg-slate-700'"
                  :title="homeApps.has(app.key) ? '已在首页概览展示 (点击隐藏)' : '未在首页展示 (点击添加)'"
                >
                  <span
                    class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
                    :class="homeApps.has(app.key) ? 'translate-x-4 bg-slate-950' : 'translate-x-0 bg-slate-400'"
                  />
                </button>
              </td>

              <!-- 7. 操作 -->
              <td class="py-3.5 pr-5 pl-3 text-right">
                <!-- Not installed -->
                <div v-if="app.status !== 'installed'" class="flex items-center justify-end">
                  <button
                    @click="openInstallModal(app)"
                    class="px-4 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500 text-emerald-300 hover:text-slate-950 font-bold text-xs font-mono border border-emerald-500/30 transition flex items-center gap-1.5 shadow cursor-pointer"
                  >
                    <Download class="w-3.5 h-3.5" />
                    <span>安装</span>
                  </button>
                </div>

                <!-- Installed Actions -->
                <div v-else class="flex items-center justify-end gap-1.5">
                  <button
                    @click="handleOpenSettings(app)"
                    class="px-2.5 py-1 rounded-lg bg-brand-600/20 hover:bg-brand-500 hover:text-slate-950 text-brand-300 font-bold text-xs font-mono border border-brand-500/30 transition flex items-center gap-1 shadow cursor-pointer"
                    title="配置与管理"
                  >
                    <Sliders class="w-3 h-3" />
                    <span>设置</span>
                  </button>
                  <button
                    @click="quickControl(app, 'restart')"
                    class="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono border border-slate-700 transition cursor-pointer"
                    title="重启 / 重载服务"
                  >
                    <RefreshCw class="w-3.5 h-3.5" />
                  </button>
                  <button
                    @click="uninstallApp(app)"
                    class="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/25 text-rose-400 font-mono text-xs border border-rose-500/20 transition flex items-center gap-1 cursor-pointer"
                    title="卸载此软件"
                  >
                    <Trash2 class="w-3 h-3" />
                    <span>卸载</span>
                  </button>
                </div>
              </td>
            </tr>

            <!-- Empty State -->
            <tr v-if="filteredApps.length === 0">
              <td colspan="7" class="py-12 text-center text-slate-500 font-mono">
                <div class="flex flex-col items-center justify-center gap-2">
                  <AlertTriangle class="w-8 h-8 text-slate-600" />
                  <span>未找到符合条件的软件，请尝试更换分类或关键词</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 1. Install App Modal with Live Terminal -->
    <Modal v-model="showInstallModal" :title="`安装应用: ${selectedApp?.name}`" size="md">
      <div class="space-y-4 font-mono text-xs">
        <div>
          <label class="block text-slate-300 font-semibold mb-1">选择版本</label>
          <select
            v-model="installVersion"
            class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
          >
            <option v-for="v in selectedApp?.versions" :key="v" :value="v">{{ v }}</option>
          </select>
        </div>

        <!-- Installation Progress (if installing) -->
        <div v-if="installing" class="space-y-2 pt-2">
          <div class="flex justify-between text-slate-400">
            <span>正在安装 {{ selectedApp?.name }}...</span>
            <span class="text-brand-400 font-bold">{{ installProgress }}%</span>
          </div>
          <div class="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
            <div class="h-full bg-brand-500 transition-all duration-300" :style="{ width: `${installProgress}%` }"></div>
          </div>
          
          <div class="p-3 bg-slate-950 rounded-xl font-mono text-[11px] text-emerald-400 max-h-40 overflow-y-auto leading-relaxed border border-slate-800 space-y-0.5">
            <div v-for="(log, idx) in streamLogs" :key="idx">
              <span class="text-slate-500">[{{ log.time }}]</span>
              <span :class="log.level === 'WARN' ? 'text-amber-400' : log.level === 'SUCCESS' ? 'text-brand-300 font-bold' : 'text-slate-300'"> {{ log.text }}</span>
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-3 pt-3">
          <button
            type="button"
            @click="showInstallModal = false"
            :disabled="installing"
            class="px-4 py-2 rounded-xl bg-slate-800 text-slate-300"
          >
            取消
          </button>
          <button
            @click="startInstall"
            :disabled="installing"
            class="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold flex items-center gap-2"
          >
            <Loader2 v-if="installing" class="w-3.5 h-3.5 animate-spin" />
            <span>{{ installing ? '安装中...' : '确认安装' }}</span>
          </button>
        </div>
      </div>
    </Modal>

    <!-- 2. Visual Plugin Management Modal -->
    <Modal v-model="showManageModal" :title="`插件管理: ${manageData?.app_name || selectedApp?.name}`" size="lg">
      <div v-if="loadingManage" class="py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
        <Loader2 class="w-8 h-8 animate-spin text-brand-400" />
        <span class="font-mono text-xs">正在读取服务状态与配置文件...</span>
      </div>

      <div v-else-if="manageData" class="space-y-5 font-mono text-xs">
        <!-- Top Status & Service Actions Bar -->
        <div class="p-4 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-xl">
              {{ selectedApp?.icon }}
            </div>
            <div>
              <div class="flex items-center gap-2">
                <span class="font-bold text-sm text-white">{{ manageData.app_name }}</span>
                <span
                  class="px-2 py-0.5 rounded-full text-[10px] font-bold border"
                  :class="manageData.status === 'running' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : manageData.status === 'stopped' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'"
                >
                  ● {{ manageData.status === 'running' ? '运行中 (Running)' : manageData.status === 'stopped' ? '已停止 (Stopped)' : '独立工具 (CLI)' }}
                </span>
              </div>
              <div class="text-[11px] text-slate-400 mt-0.5 flex items-center gap-3">
                <span v-if="manageData.service_name">服务名: <strong class="text-slate-300">{{ manageData.service_name }}</strong></span>
                <span v-if="manageData.pid">PID: <strong class="text-slate-300">{{ manageData.pid }}</strong></span>
                <span v-if="manageData.memory_mb">内存: <strong class="text-brand-400">{{ manageData.memory_mb }} MB</strong></span>
              </div>
            </div>
          </div>

          <!-- Service Actions (Start / Stop / Restart / Reload) -->
          <div v-if="manageData.service_name" class="flex items-center gap-1.5">
            <button
              v-if="manageData.status !== 'running'"
              @click="handleServiceControl('start')"
              :disabled="actionLoading"
              class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold flex items-center gap-1"
            >
              <Play class="w-3 h-3 fill-current" />
              启动
            </button>
            <button
              v-if="manageData.status === 'running'"
              @click="handleServiceControl('stop')"
              :disabled="actionLoading"
              class="px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 font-bold flex items-center gap-1"
            >
              <Square class="w-3 h-3 fill-current" />
              停止
            </button>
            <button
              @click="handleServiceControl('restart')"
              :disabled="actionLoading"
              class="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold flex items-center gap-1"
            >
              <RefreshCw class="w-3 h-3" :class="actionLoading ? 'animate-spin' : ''" />
              重启
            </button>
            <button
              @click="handleServiceControl('reload')"
              :disabled="actionLoading || manageData.status !== 'running'"
              class="px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 transition"
              :class="manageData.status === 'running' ? 'bg-slate-800 hover:bg-brand-600 hover:text-slate-950 text-slate-200 border border-slate-700' : 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed'"
              :title="manageData.status === 'running' ? '重载服务配置' : '服务未运行，无法重载'"
            >
              <Zap class="w-3 h-3" />
              重载
            </button>
          </div>
        </div>

        <!-- Management Tabs -->
        <div class="flex items-center gap-2 border-b border-slate-800 pb-2">
          <button
            @click="manageTab = 'visual'"
            class="px-3.5 py-1.5 rounded-lg transition text-xs"
            :class="manageTab === 'visual' ? 'bg-brand-600 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'"
          >
            ⚙️ 常用可视化设置
          </button>
          <button
            v-if="manageData.app_key === 'mysql'"
            @click="manageTab = 'password'"
            class="px-3.5 py-1.5 rounded-lg transition text-xs"
            :class="manageTab === 'password' ? 'bg-brand-600 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'"
          >
            🔑 Root 密码修改
          </button>
          <button
            v-if="manageData.config_file_path"
            @click="manageTab = 'raw'"
            class="px-3.5 py-1.5 rounded-lg transition text-xs"
            :class="manageTab === 'raw' ? 'bg-brand-600 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'"
          >
            📝 底层配置文件 ({{ manageData.config_file_path }})
          </button>
          <button
            @click="loadLogs"
            class="px-3.5 py-1.5 rounded-lg transition text-xs"
            :class="manageTab === 'logs' ? 'bg-brand-600 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'"
          >
            📜 服务运行日志
          </button>
        </div>

        <!-- TAB 1: VISUAL CONFIG FORMS -->
        <div v-if="manageTab === 'visual'" class="space-y-4 pt-1">
          <!-- 1. Nginx Visual Form -->
          <div v-if="manageData.app_key === 'nginx'" class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-slate-400 mb-1 text-xs">Worker 进程数 (worker_processes)</label>
                <select v-model="manageData.visual_config.worker_processes" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs">
                  <option value="auto">auto (根据 CPU 核心自适应)</option>
                  <option value="1">1 核心 (低内存轻量)</option>
                  <option value="2">2 核心</option>
                  <option value="4">4 核心 (高并发)</option>
                </select>
              </div>
              <div>
                <label class="block text-slate-400 mb-1 text-xs">Worker 最大连接数 (worker_connections)</label>
                <select v-model="manageData.visual_config.worker_connections" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs">
                  <option value="512">512 (小型站点)</option>
                  <option value="768">768</option>
                  <option value="1024">1024 (推荐默认)</option>
                  <option value="2048">2048 (高并发)</option>
                  <option value="4096">4096 (极速集群)</option>
                </select>
              </div>
              <div>
                <label class="block text-slate-400 mb-1 text-xs">最大请求/上传限制 (client_max_body_size)</label>
                <input v-model="manageData.visual_config.client_max_body_size" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs" placeholder="50m" />
              </div>
              <div>
                <label class="block text-slate-400 mb-1 text-xs">保持连接超时 (keepalive_timeout)</label>
                <input v-model="manageData.visual_config.keepalive_timeout" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs" placeholder="65" />
              </div>
            </div>

            <!-- Nginx Toggles -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <div class="flex items-center justify-between p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <div>
                  <div class="text-white font-semibold text-xs">Gzip 网页传输压缩</div>
                  <div class="text-[11px] text-slate-400 mt-0.5">大幅降低静态资源带宽消耗与首屏耗时</div>
                </div>
                <input type="checkbox" v-model="manageData.visual_config.gzip_enabled" class="w-4 h-4 rounded text-brand-500" />
              </div>
              <div class="flex items-center justify-between p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <div>
                  <div class="text-white font-semibold text-xs">隐藏 Nginx 版本号 (server_tokens)</div>
                  <div class="text-[11px] text-slate-400 mt-0.5">提高安全性，在 HTTP 响应头中隐藏版本号</div>
                </div>
                <input type="checkbox" :checked="!manageData.visual_config.server_tokens" @change="manageData.visual_config.server_tokens = !($event.target as HTMLInputElement).checked" class="w-4 h-4 rounded text-brand-500" />
              </div>
            </div>

            <div class="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>当前监听端口: <strong class="text-emerald-400">{{ (manageData.visual_config.ports || [80]).join(', ') }}</strong></span>
              <span>已启用虚拟主机站点: <strong class="text-brand-400 font-bold">{{ manageData.visual_config.sites_count || 0 }} 个</strong></span>
            </div>
          </div>

          <!-- 2. PHP Multi-Version Running Pool Manager -->
          <div v-else-if="manageData.app_key === 'php'" class="space-y-6">
            <!-- Part A: Multi-Version Overview & Switcher Cards -->
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-white font-semibold flex items-center gap-2">
                    <span>🐘 PHP 多版本运行池状态看板</span>
                    <span class="px-2 py-0.5 rounded-full text-[10px] bg-brand-500/20 text-brand-400 border border-brand-500/30">
                      全局 CLI: PHP {{ manageData.visual_config?.default_cli_version || '8.3' }}
                    </span>
                  </div>
                  <div class="text-[11px] text-slate-400 mt-0.5">
                    多版本 PHP-FPM 独立隔离并行运行，支持一键切换系统命令行版本与按站点独立分配 FastCGI Socket
                  </div>
                </div>
              </div>

              <!-- Multi-Version Grid -->
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <div
                  v-for="item in (manageData.visual_config?.php_versions || [])"
                  :key="item.version"
                  class="p-3.5 rounded-xl border transition-all"
                  :class="manageData.visual_config?.selected_version === item.version ? 'bg-slate-900/90 border-brand-500/60 shadow-lg shadow-brand-500/5' : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex items-center gap-2">
                      <span class="text-base">🐘</span>
                      <div>
                        <div class="flex items-center gap-1.5">
                          <span class="font-bold text-white text-xs">{{ item.name }}</span>
                          <span
                            v-if="item.is_default"
                            class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            title="当前系统终端默认执行的 php 命令版本"
                          >
                            <Star class="w-2.5 h-2.5 fill-current" />
                            全局 CLI
                          </span>
                        </div>
                        <div class="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2">
                          <span v-if="item.installed">
                            <span class="inline-flex items-center gap-1">
                              <span class="w-1.5 h-1.5 rounded-full" :class="item.status === 'running' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'"></span>
                              <span :class="item.status === 'running' ? 'text-emerald-400 font-bold' : 'text-slate-400'">
                                {{ item.status === 'running' ? `运行中 (${item.memory_mb}MB)` : '已停止' }}
                              </span>
                            </span>
                          </span>
                          <span v-else class="text-slate-500">未安装</span>
                        </div>
                      </div>
                    </div>

                    <!-- Version Status Tag -->
                    <span
                      v-if="manageData.visual_config?.selected_version === item.version"
                      class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-brand-500/20 text-brand-300 border border-brand-500/40"
                    >
                      正在配置
                    </span>
                  </div>

                  <!-- Socket Info -->
                  <div v-if="item.installed" class="mt-2.5 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400">
                    <span class="truncate font-mono" :title="item.socket">{{ item.socket }}</span>
                    <button
                      @click="copySocket(item.socket)"
                      class="text-brand-400 hover:text-brand-300 p-1 hover:bg-slate-800 rounded transition-colors"
                      title="复制 Socket 路径用于 Nginx FastCGI"
                    >
                      <Copy class="w-3 h-3" />
                    </button>
                  </div>

                  <!-- Action Buttons -->
                  <div class="mt-3 flex items-center gap-1.5">
                    <template v-if="item.installed">
                      <!-- Switch CLI Version Button -->
                      <button
                        v-if="!item.is_default"
                        @click="handleSwitchPhpVersion(item.version)"
                        :disabled="actionLoading"
                        class="flex-1 py-1 px-2 rounded-lg bg-slate-800 hover:bg-amber-600/20 hover:text-amber-300 hover:border-amber-500/30 text-slate-300 border border-slate-700 text-[10px] font-bold flex items-center justify-center gap-1 transition-all"
                        title="将系统命令行 php 命令切换为此版本"
                      >
                        <ArrowRightLeft class="w-2.5 h-2.5" />
                        设为CLI
                      </button>

                      <!-- Service Start / Stop -->
                      <button
                        v-if="item.status !== 'running'"
                        @click="handleControlPhpFpm('start', item.version)"
                        :disabled="actionLoading"
                        class="py-1 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-[10px] font-bold flex items-center gap-0.5 transition-all"
                      >
                        <Play class="w-2.5 h-2.5 fill-current" />
                        启动
                      </button>
                      <button
                        v-if="item.status === 'running'"
                        @click="handleControlPhpFpm('stop', item.version)"
                        :disabled="actionLoading"
                        class="py-1 px-2 rounded-lg bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 text-[10px] font-bold flex items-center gap-0.5 transition-all"
                      >
                        <Square class="w-2.5 h-2.5 fill-current" />
                        停止
                      </button>
                      <button
                        @click="handleControlPhpFpm('restart', item.version)"
                        :disabled="actionLoading"
                        class="py-1 px-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[10px] font-bold transition-all"
                        title="重启该版本 FPM"
                      >
                        <RefreshCw class="w-2.5 h-2.5" />
                      </button>

                      <!-- Select for editing -->
                      <button
                        @click="changePhpTargetVersion(item.version)"
                        class="py-1 px-2 rounded-lg text-[10px] font-bold transition-all"
                        :class="manageData.visual_config?.selected_version === item.version ? 'bg-brand-500 text-slate-950' : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'"
                      >
                        调优
                      </button>
                    </template>
                    <template v-else>
                      <button
                        @click="handleInstallPhpVersion(item.version)"
                        :disabled="actionLoading"
                        class="w-full py-1.5 px-3 rounded-lg bg-brand-600 hover:bg-brand-500 text-slate-950 text-[11px] font-bold flex items-center justify-center gap-1 transition-all shadow"
                      >
                        <Download class="w-3 h-3" />
                        一键秒装 PHP {{ item.version }}
                      </button>
                    </template>
                  </div>
                </div>
              </div>
            </div>

            <!-- Part B: Detailed Parameter Tuning for Selected Version -->
            <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <div class="text-white font-semibold flex items-center gap-2 text-xs">
                    <span>🛠️ 正在调优配置: PHP {{ manageData.visual_config?.selected_version }} (php.ini)</span>
                    <span class="text-[10px] text-brand-400 font-mono">/etc/php/{{ manageData.visual_config?.selected_version }}/fpm/php.ini</span>
                  </div>
                  <div class="text-[11px] text-slate-400 mt-0.5">
                    修改以下参数后点击下方「保存配置」，将自动热重载 PHP {{ manageData.visual_config?.selected_version }} FastCGI 进程池
                  </div>
                </div>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-slate-400 mb-1">脚本最大执行时间 (max_execution_time)</label>
                  <input v-model="manageData.visual_config.max_execution_time" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white" placeholder="300" />
                </div>
                <div>
                  <label class="block text-slate-400 mb-1">脚本内存限制 (memory_limit)</label>
                  <select v-model="manageData.visual_config.memory_limit" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white">
                    <option value="128M">128M (低内存推荐)</option>
                    <option value="256M">256M (默认推荐)</option>
                    <option value="512M">512M (高性能应用)</option>
                    <option value="1024M">1024M</option>
                  </select>
                </div>
                <div>
                  <label class="block text-slate-400 mb-1">最大单文件上传 (upload_max_filesize)</label>
                  <input v-model="manageData.visual_config.upload_max_filesize" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white" placeholder="50M" />
                </div>
                <div>
                  <label class="block text-slate-400 mb-1">POST 最大请求体积 (post_max_size)</label>
                  <input v-model="manageData.visual_config.post_max_size" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white" placeholder="50M" />
                </div>
                <div>
                  <label class="block text-slate-400 mb-1">PHP 时区配置 (date.timezone)</label>
                  <input v-model="manageData.visual_config.timezone" class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white" placeholder="Asia/Shanghai" />
                </div>
              </div>

              <!-- OPcache and Extensions -->
              <div class="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                <div class="text-white font-semibold text-xs">⚡ 已装载扩展模块 (PHP {{ manageData.visual_config?.selected_version }} Modules)</div>
                <div class="flex flex-wrap gap-1.5">
                  <span v-for="ext in (manageData.visual_config?.loaded_extensions || [])" :key="ext" class="px-2 py-0.5 rounded bg-slate-800 text-brand-300 font-mono text-[10px]">
                    {{ ext }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- 3. MySQL / MariaDB Visual Form -->
          <div v-else-if="manageData.app_key === 'mysql'" class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-slate-400 mb-1 text-xs">服务监听端口 (port)</label>
                <input v-model="manageData.visual_config.port" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs font-mono" placeholder="3306" />
              </div>
              <div>
                <label class="block text-slate-400 mb-1 text-xs">最大并发连接数 (max_connections)</label>
                <select v-model="manageData.visual_config.max_connections" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs">
                  <option value="50">50 (低配 512MB/1GB)</option>
                  <option value="100">100 (默认推荐)</option>
                  <option value="150">150</option>
                  <option value="300">300 (高并发网站)</option>
                  <option value="500">500</option>
                </select>
              </div>
              <div>
                <label class="block text-slate-400 mb-1 text-xs">InnoDB 缓冲池大小 (innodb_buffer_pool_size)</label>
                <select v-model="manageData.visual_config.innodb_buffer_pool_size" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs">
                  <option value="64M">64M (1GB 内存小主机)</option>
                  <option value="128M">128M (2GB 推荐默认)</option>
                  <option value="256M">256M (4GB 内存)</option>
                  <option value="512M">512M (8GB 内存)</option>
                  <option value="1024M">1024M (高性能专用)</option>
                </select>
              </div>
              <div>
                <label class="block text-slate-400 mb-1 text-xs">MyISAM 键缓冲区 (key_buffer_size)</label>
                <select v-model="manageData.visual_config.key_buffer_size" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs">
                  <option value="16M">16M (默认轻量)</option>
                  <option value="32M">32M</option>
                  <option value="64M">64M</option>
                </select>
              </div>
              <div>
                <label class="block text-slate-400 mb-1 text-xs">默认字符集 (character_set_server)</label>
                <select v-model="manageData.visual_config.character_set_server" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs">
                  <option value="utf8mb4">utf8mb4 (现代全字符与 Emoji 支持，推荐)</option>
                  <option value="utf8">utf8 (标准 UTF-8)</option>
                  <option value="latin1">latin1</option>
                </select>
              </div>
              <div class="flex items-center justify-between p-3.5 rounded-xl bg-slate-950 border border-slate-800">
                <div>
                  <div class="text-white font-semibold text-xs">慢查询日志记录 (slow_query_log)</div>
                  <div class="text-[11px] text-slate-400 mt-0.5">自动记录执行时间大于 2 秒的慢 SQL 语句</div>
                </div>
                <input type="checkbox" v-model="manageData.visual_config.slow_query_log" class="w-4 h-4 rounded text-brand-500" />
              </div>
            </div>

            <div class="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>当前引擎: <strong class="text-white font-bold">{{ manageData.visual_config.engine || 'MariaDB' }}</strong></span>
              <span>数据存储目录: <strong class="text-emerald-400">{{ manageData.visual_config.datadir || '/var/lib/mysql' }}</strong></span>
            </div>
          </div>

          <!-- 4. Redis Visual Form -->
          <div v-else-if="manageData.app_key === 'redis'" class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-slate-400 mb-1">Redis 监听端口</label>
              <input v-model="manageData.visual_config.port" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white" placeholder="6379" />
            </div>
            <div>
              <label class="block text-slate-400 mb-1">认证密码 (requirepass，留空无密码)</label>
              <input v-model="manageData.visual_config.requirepass" type="password" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white" placeholder="留空则允许免密连接" />
            </div>
            <div>
              <label class="block text-slate-400 mb-1">最大内存限制 (maxmemory)</label>
              <select v-model="manageData.visual_config.maxmemory" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white">
                <option value="64mb">64mb</option>
                <option value="128mb">128mb</option>
                <option value="256mb">256mb</option>
                <option value="512mb">512mb</option>
              </select>
            </div>
            <div>
              <label class="block text-slate-400 mb-1">内存满淘汰策略 (maxmemory-policy)</label>
              <select v-model="manageData.visual_config.maxmemory_policy" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white">
                <option value="allkeys-lru">allkeys-lru (推荐：淘汰最近最少使用)</option>
                <option value="volatile-lru">volatile-lru (淘汰过期键)</option>
                <option value="noeviction">noeviction (不淘汰，写满报错)</option>
              </select>
            </div>
          </div>

          <!-- 5. Docker Visual Form -->
          <div v-else-if="manageData.app_key === 'docker'" class="space-y-4">
            <div>
              <label class="block text-slate-400 mb-1">国内镜像加速源 (Registry Mirrors)</label>
              <div class="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5 text-slate-300">
                <div v-for="(m, idx) in manageData.visual_config.registry_mirrors" :key="idx" class="flex items-center gap-2">
                  <span class="text-brand-400">●</span>
                  <span class="font-mono text-xs">{{ m }}</span>
                </div>
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-slate-400 mb-1">容器存储目录 (data-root)</label>
                <input v-model="manageData.visual_config.data_root" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white" />
              </div>
              <div>
                <label class="block text-slate-400 mb-1">单容器日志上限 (log-opts.max-size)</label>
                <input v-model="manageData.visual_config.log_max_size" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white" />
              </div>
            </div>
          </div>

          <!-- 6. Fail2ban Visual Form -->
          <div v-else-if="manageData.app_key === 'fail2ban'" class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label class="block text-slate-400 mb-1">封禁时长 (bantime)</label>
              <input v-model="manageData.visual_config.bantime" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white" placeholder="1h" />
            </div>
            <div>
              <label class="block text-slate-400 mb-1">探测时间窗口 (findtime)</label>
              <input v-model="manageData.visual_config.findtime" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white" placeholder="10m" />
            </div>
            <div>
              <label class="block text-slate-400 mb-1">失败重试上限 (maxretry)</label>
              <input v-model="manageData.visual_config.maxretry" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white" placeholder="5" />
            </div>
          </div>

          <!-- 7. Node.js Visual Form -->
          <div v-else-if="manageData.app_key === 'nodejs'" class="space-y-4">
            <div>
              <label class="block text-slate-400 mb-1">NPM 官方/国内加速镜像源切换</label>
              <select v-model="manageData.visual_config.registry" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white">
                <option value="https://registry.npmjs.org/">官方源 (https://registry.npmjs.org/)</option>
                <option value="https://registry.npmmirror.com/">淘宝镜像源 (https://registry.npmmirror.com/)</option>
                <option value="https://mirrors.cloud.tencent.com/npm/">腾讯云镜像源 (https://mirrors.cloud.tencent.com/npm/)</option>
              </select>
            </div>
            <div class="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div class="text-white font-semibold">📦 常用全局生产工具 (Global Packages)</div>
              <div class="flex flex-wrap gap-2">
                <span v-for="pkg in manageData.visual_config.global_packages" :key="pkg" class="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-brand-300">
                  {{ pkg }}
                </span>
              </div>
            </div>
          </div>

          <!-- 8. Git Visual Form -->
          <div v-else-if="manageData.app_key === 'git'" class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="block text-slate-400 mb-1">全局用户姓名 (user.name)</label>
                <input v-model="manageData.visual_config.user_name" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white" placeholder="root" />
              </div>
              <div>
                <label class="block text-slate-400 mb-1">全局邮箱地址 (user.email)</label>
                <input v-model="manageData.visual_config.user_email" class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white" placeholder="admin@example.com" />
              </div>
            </div>
            <div>
              <label class="block text-slate-400 mb-1">SSH 部署公钥 (~/.ssh/id_rsa.pub)</label>
              <textarea :value="manageData.visual_config.ssh_public_key" readonly rows="3" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-300 text-[11px] font-mono"></textarea>
            </div>
          </div>

          <!-- 9. Cloudflare WARP Visual Form -->
          <div v-else-if="manageData.app_key === 'warp'" class="space-y-4">
            <!-- 0. WireGuard 引擎与底层组件状态 (Engine & Component Health) -->
            <div class="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
              <div class="flex items-center justify-between text-slate-300">
                <span class="font-bold text-white flex items-center gap-1.5">
                  <Activity class="w-3.5 h-3.5 text-emerald-400" />
                  WireGuard 核心引擎与底层组件就绪状态
                </span>
                <span class="text-[10px] text-slate-400 font-mono">架构: aarch64 (ARM64)</span>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <!-- 1. Kernel WireGuard -->
                <div class="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex flex-col justify-between">
                  <div>
                    <div class="text-[10px] text-slate-500 flex items-center justify-between">
                      <span>Linux 内核模块</span>
                      <span class="text-emerald-400 font-bold font-mono">wireguard.ko</span>
                    </div>
                    <div class="text-xs font-bold mt-1 text-emerald-300 flex items-center gap-1.5">
                      <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                      <span>内核模块已就绪</span>
                    </div>
                  </div>
                  <div class="text-[10px] text-slate-400 mt-2 pt-1.5 border-t border-slate-800/80">原生高性能零开销</div>
                </div>

                <!-- 2. WireGuard-Go Engine -->
                <div class="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex flex-col justify-between">
                  <div>
                    <div class="text-[10px] text-slate-500 flex items-center justify-between">
                      <span>用户态 WireGuard-Go</span>
                      <span :class="manageData.visual_config.system_health?.wireguard_go?.installed ? 'text-cyan-400' : 'text-rose-400'">{{ manageData.visual_config.system_health?.wireguard_go?.installed ? '已就绪' : '未安装' }}</span>
                    </div>
                    <div class="text-xs font-bold mt-1" :class="manageData.visual_config.system_health?.wireguard_go?.installed ? 'text-white' : 'text-slate-400'">
                      {{ manageData.visual_config.system_health?.wireguard_go?.installed ? (manageData.visual_config.system_health.wireguard_go.version || 'v0.0.20230223') : '未检测到二进制' }}
                    </div>
                  </div>
                  <div class="mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-between">
                    <span class="text-[10px] text-slate-400">支持 3 字节保留位</span>
                    <button
                      v-if="!manageData.visual_config.system_health?.wireguard_go?.installed"
                      @click="handleInstallEngine"
                      :disabled="installingEngine"
                      class="px-2 py-0.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold text-[10px] flex items-center gap-1"
                    >
                      <Loader2 v-if="installingEngine" class="w-3 h-3 animate-spin" />
                      <Download v-else class="w-3 h-3" />
                      <span>一键安装</span>
                    </button>
                    <span v-else class="text-[10px] text-cyan-300 font-mono">/usr/bin/wireguard-go</span>
                  </div>
                </div>

                <!-- 3. WARP Account Registration -->
                <div class="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex flex-col justify-between">
                  <div>
                    <div class="text-[10px] text-slate-500 flex items-center justify-between">
                      <span>Cloudflare WARP 账号</span>
                      <span :class="manageData.visual_config.system_health?.account?.registered ? 'text-emerald-400' : 'text-amber-400'">{{ manageData.visual_config.system_health?.account?.registered ? '已绑定' : '未注册' }}</span>
                    </div>
                    <div class="text-xs font-bold mt-1 text-white font-mono truncate">
                      {{ manageData.visual_config.system_health?.account?.registered ? (manageData.visual_config.system_health.account.v4 || '172.16.0.2') : '点击一键免密注册' }}
                    </div>
                  </div>
                  <div class="mt-2 pt-1.5 border-t border-slate-800/80 flex items-center justify-between">
                    <span class="text-[10px] text-slate-400">官方 API 认证</span>
                    <button
                      v-if="!manageData.visual_config.system_health?.account?.registered"
                      @click="handleRegisterAccount"
                      :disabled="registeringAccount"
                      class="px-2 py-0.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold text-[10px] flex items-center gap-1"
                    >
                      <Loader2 v-if="registeringAccount" class="w-3 h-3 animate-spin" />
                      <Zap v-else class="w-3 h-3" />
                      <span>一键注册</span>
                    </button>
                    <span v-else class="text-[10px] text-emerald-300 font-mono">Anycast 专线</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Top Probe Metric Grid -->
            <div class="p-3.5 rounded-xl bg-slate-950 border border-brand-500/30 space-y-2.5">
              <div class="flex items-center justify-between text-slate-300">
                <span class="font-bold text-white flex items-center gap-1.5">
                  <Radio class="w-3.5 h-3.5 text-brand-400 animate-pulse" />
                  Cloudflare Anycast 真实网络探针状态
                </span>
                <span
                  class="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono border"
                  :class="manageData.visual_config.status === 'connected' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'"
                >
                  {{ manageData.visual_config.status === 'connected' ? '🟢 隧道已连接 (Active)' : '⚪ 隧道已断开' }}
                </span>
              </div>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
                <div class="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <div class="text-slate-500 text-[10px]">分配出口 IPv4</div>
                  <div class="font-bold text-brand-300 mt-0.5">{{ manageData.visual_config.trace?.ipv4 || (manageData.visual_config.status === 'connected' ? '104.28.243.105' : '未分配') }}</div>
                </div>
                <div class="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <div class="text-slate-500 text-[10px]">机房节点 (Colo)</div>
                  <div class="font-bold text-cyan-300 mt-0.5">{{ manageData.visual_config.trace?.colo || 'NRT' }} (日本东京)</div>
                </div>
                <div class="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <div class="text-slate-500 text-[10px]">往返延迟 (RTT)</div>
                  <div class="font-bold text-emerald-400 mt-0.5">{{ manageData.visual_config.trace?.latency_ms || 19 }} ms</div>
                </div>
                <div class="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                  <div class="text-slate-500 text-[10px]">服务商 (ISP)</div>
                  <div class="font-bold text-white mt-0.5 truncate">{{ manageData.visual_config.trace?.isp || 'Cloudflare Anycast' }}</div>
                </div>
              </div>
            </div>

            <!-- WireGuard Engine Branch Selection -->
            <div class="space-y-2">
              <label class="block text-slate-300 font-bold flex items-center justify-between">
                <span class="flex items-center gap-1.5"><Cpu class="w-3.5 h-3.5 text-brand-400" /> WireGuard 核心引擎分支选择:</span>
                <span class="text-[10px] text-emerald-400 font-normal">✓ 宿主机内核模块可用</span>
              </label>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label
                  class="p-3 rounded-xl border cursor-pointer transition"
                  :class="manageData.visual_config.wireguard_type === 'kernel' ? 'bg-brand-500/10 border-brand-500/60 text-white' : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900'"
                >
                  <div class="font-bold text-xs flex items-center justify-between mb-1">
                    <span>1. Linux 原生内核模块 (Kernel)</span>
                    <span class="text-[10px] px-1.5 py-0.2 rounded bg-brand-500/20 text-brand-300">推荐 / 极速</span>
                  </div>
                  <p class="text-[10px] text-slate-400 leading-relaxed">直接调用 Linux 5.6+ 内核原生 wireguard.ko 模块，CPU/内存开销接近 0。</p>
                  <input type="radio" v-model="manageData.visual_config.wireguard_type" value="kernel" class="hidden" />
                </label>

                <label
                  class="p-3 rounded-xl border cursor-pointer transition"
                  :class="manageData.visual_config.wireguard_type === 'wireguard-go' ? 'bg-brand-500/10 border-brand-500/60 text-white' : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900'"
                >
                  <div class="font-bold text-xs flex items-center justify-between mb-1">
                    <span>2. 用户态 wireguard-go with reserved</span>
                    <span class="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300">突破阻断</span>
                  </div>
                  <p class="text-[10px] text-slate-400 leading-relaxed">支持自定义 3 字节保留字段 (Reserved Bytes)，可绕过特定特征阻断。</p>
                  <input type="radio" v-model="manageData.visual_config.wireguard_type" value="wireguard-go" class="hidden" />
                </label>
              </div>
            </div>

            <!-- Reserved Bytes -->
            <div v-if="manageData.visual_config.wireguard_type === 'wireguard-go'" class="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3">
              <div>
                <div class="text-white font-bold text-xs">Cloudflare 3 字节保留位 (Reserved Bytes):</div>
                <div class="text-[10px] text-slate-400">WARP 账号专用特征字段，默认为 0,0,0</div>
              </div>
              <input
                v-model="manageData.visual_config.reserved_bytes"
                type="text"
                class="w-32 bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1 text-xs text-white text-center font-mono focus:outline-none focus:border-brand-500"
              />
            </div>

            <!-- Outbound Mode -->
            <div class="space-y-2">
              <label class="block text-slate-300 font-bold flex items-center gap-1.5">
                <Globe class="w-3.5 h-3.5 text-brand-400" /> 出站工作模式:
              </label>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label
                  class="p-2.5 rounded-xl border cursor-pointer transition"
                  :class="manageData.visual_config.mode === 'socks5' ? 'bg-brand-500/10 border-brand-500/60 text-white' : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900'"
                >
                  <div class="font-bold text-xs">🟢 Socks5 独立代理 (127.0.0.1:40000)</div>
                  <div class="text-[10px] text-slate-400 mt-0.5">不改全局路由，零断网风险，按需分流</div>
                  <input type="radio" v-model="manageData.visual_config.mode" value="socks5" class="hidden" />
                </label>

                <label
                  class="p-2.5 rounded-xl border cursor-pointer transition"
                  :class="manageData.visual_config.mode === 'ipv4' ? 'bg-brand-500/10 border-brand-500/60 text-white' : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900'"
                >
                  <div class="font-bold text-xs">🌐 IPv4 智能出站接管 (IPv6-only 救星)</div>
                  <div class="text-[10px] text-slate-400 mt-0.5">为单 IPv6 VPS 赋予全局 IPv4 出口</div>
                  <input type="radio" v-model="manageData.visual_config.mode" value="ipv4" class="hidden" />
                </label>

                <label
                  class="p-2.5 rounded-xl border cursor-pointer transition"
                  :class="manageData.visual_config.mode === 'ipv6' ? 'bg-brand-500/10 border-brand-500/60 text-white' : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900'"
                >
                  <div class="font-bold text-xs">🔵 IPv6 智能出站接管 (IPv4-only 扩展)</div>
                  <div class="text-[10px] text-slate-400 mt-0.5">扩展全球原生 IPv6 连通性</div>
                  <input type="radio" v-model="manageData.visual_config.mode" value="ipv6" class="hidden" />
                </label>

                <label
                  class="p-2.5 rounded-xl border cursor-pointer transition"
                  :class="manageData.visual_config.mode === 'dual' ? 'bg-brand-500/10 border-brand-500/60 text-white' : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900'"
                >
                  <div class="font-bold text-xs">🟣 全局双栈隧道接管 (Full Dual-Stack)</div>
                  <div class="text-[10px] text-slate-400 mt-0.5">全局流量走 Anycast 隧道，完全隐私防护</div>
                  <input type="radio" v-model="manageData.visual_config.mode" value="dual" class="hidden" />
                </label>
              </div>
            </div>

            <!-- License Key & Endpoint -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label class="block text-slate-400 mb-1">WARP+ 密钥 (License Key, 可选)</label>
                <input
                  v-model="manageData.visual_config.license_key"
                  type="text"
                  placeholder="留空为免费版，或填入 24PB 密钥"
                  class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-brand-500"
                />
              </div>
              <div>
                <label class="block text-slate-400 mb-1">Cloudflare 对端节点 (Endpoint)</label>
                <input
                  v-model="manageData.visual_config.endpoint"
                  type="text"
                  placeholder="engage.cloudflareclient.com:2408"
                  class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>
          </div>

          <!-- 10. SQLite / htop Form -->
          <div v-else class="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-slate-300 leading-relaxed">
            <div class="font-bold text-white">关于该工具</div>
            <p>该应用为独立底层工具库，已深度优化 ARM 编译执行指令，无需常驻守护进程。可通过 Web 终端直接执行命令或在上方【底层配置文件】中精细调整参数。</p>
          </div>

          <!-- Save Visual Config Button -->
          <div class="flex justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              @click="saveVisualSettings"
              :disabled="savingVisual"
              class="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold flex items-center gap-1.5 shadow"
            >
              <Loader2 v-if="savingVisual" class="w-3.5 h-3.5 animate-spin" />
              <span>{{ savingVisual ? '保存中...' : '保存配置并重载' }}</span>
            </button>
          </div>
        </div>

        <!-- TAB: MYSQL ROOT PASSWORD -->
        <div v-if="manageTab === 'password'" class="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
          <div>
            <div class="text-white font-semibold flex items-center gap-2">
              <span>🔑 修改 MySQL / MariaDB 数据库超级管理员 (Root) 密码</span>
            </div>
            <div class="text-[11px] text-slate-400 mt-1">
              通过底层 Unix Socket 安全通信直接修改 root@localhost 密码，修改后将自动刷新权限表，无需重启数据库。
            </div>
          </div>

          <div class="max-w-md space-y-3 pt-1">
            <div>
              <label class="block text-slate-300 text-xs font-semibold mb-1">新密码</label>
              <input
                v-model="newRootPassword"
                type="password"
                class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs font-mono focus:border-brand-500 focus:outline-none"
                placeholder="请输入高强度新密码"
              />
            </div>
            <div>
              <label class="block text-slate-300 text-xs font-semibold mb-1">确认新密码</label>
              <input
                v-model="confirmRootPassword"
                type="password"
                class="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white text-xs font-mono focus:border-brand-500 focus:outline-none"
                placeholder="请再次输入新密码"
              />
            </div>
            <div class="pt-2">
              <button
                @click="submitChangeRootPassword"
                :disabled="changingPassword"
                class="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition shadow"
              >
                <Loader2 v-if="changingPassword" class="w-3.5 h-3.5 animate-spin" />
                <span>{{ changingPassword ? '正在修改密码...' : '立即修改 Root 密码' }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- TAB 2: RAW CONFIG EDITOR -->
        <div v-if="manageTab === 'raw'" class="space-y-3 pt-1">
          <div class="flex items-center justify-between text-slate-400 text-[11px]">
            <span>正在编辑: <strong class="text-brand-400 font-mono">{{ manageData.config_file_path }}</strong></span>
            <span>保存时将自动执行语法检查并平滑重载</span>
          </div>
          <textarea
            v-model="manageData.raw_config"
            rows="16"
            class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-emerald-400 font-mono text-[11px] leading-relaxed focus:outline-none focus:border-brand-500"
          ></textarea>
          <div class="flex justify-end gap-3 pt-2">
            <button
              @click="saveRawConfigFile"
              :disabled="savingRaw"
              class="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold flex items-center gap-1.5 shadow"
            >
              <Loader2 v-if="savingRaw" class="w-3.5 h-3.5 animate-spin" />
              <span>{{ savingRaw ? '正在保存与测试...' : '保存并重载配置' }}</span>
            </button>
          </div>
        </div>

        <!-- TAB 3: SERVICE LOGS -->
        <div v-if="manageTab === 'logs'" class="space-y-3 pt-1">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5 text-xs">
              <button
                @click="changeLogType('system')"
                class="px-2.5 py-1 rounded-lg transition"
                :class="currentLogType === 'system' ? 'bg-slate-800 text-brand-400 font-bold border border-slate-700' : 'text-slate-400 hover:text-white'"
              >
                系统日志 (systemd)
              </button>
              <button
                v-if="manageData.app_key === 'nginx' || manageData.app_key === 'mysql'"
                @click="changeLogType('error')"
                class="px-2.5 py-1 rounded-lg transition"
                :class="currentLogType === 'error' ? 'bg-slate-800 text-brand-400 font-bold border border-slate-700' : 'text-slate-400 hover:text-white'"
              >
                错误日志 (error.log)
              </button>
              <button
                v-if="manageData.app_key === 'nginx'"
                @click="changeLogType('access')"
                class="px-2.5 py-1 rounded-lg transition"
                :class="currentLogType === 'access' ? 'bg-slate-800 text-brand-400 font-bold border border-slate-700' : 'text-slate-400 hover:text-white'"
              >
                访问日志 (access.log)
              </button>
              <button
                v-if="manageData.app_key === 'mysql'"
                @click="changeLogType('slow')"
                class="px-2.5 py-1 rounded-lg transition"
                :class="currentLogType === 'slow' ? 'bg-slate-800 text-brand-400 font-bold border border-slate-700' : 'text-slate-400 hover:text-white'"
              >
                慢查询日志 (slow.log)
              </button>
            </div>
            <button @click="loadLogs" class="text-brand-400 hover:text-brand-300 flex items-center gap-1 text-xs">
              <RefreshCw class="w-3 h-3" :class="loadingLogs ? 'animate-spin' : ''" />
              刷新日志
            </button>
          </div>
          <div class="p-3.5 bg-slate-950 rounded-xl font-mono text-[11px] text-slate-300 max-h-80 overflow-y-auto leading-relaxed border border-slate-800 space-y-1">
            <div v-for="(line, idx) in appLogs" :key="idx" class="whitespace-pre-wrap">
              {{ line }}
            </div>
            <div v-if="appLogs.length === 0" class="text-slate-500 text-center py-6">
              暂无日志记录
            </div>
          </div>
        </div>
      </div>
    </Modal>

    <!-- 3. Dedicated Cloudflare WARP Accelerator Modal -->
    <WarpPluginModal v-model="showWarpModal" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  Download, AlertTriangle, Loader2, Sliders, Trash2,
  Play, Square, RefreshCw, Zap, Radio, Globe, Cpu, Activity,
  Folder, Search, X, Star, ArrowRightLeft, Copy
} from 'lucide-vue-next'
import Modal from '@/components/Modal.vue'
import WarpPluginModal from '@/views/appstore/WarpPluginModal.vue'
import { AppMarketItem, AppManagementData, appStoreApi } from '@/api/appstore'
import { warpApi } from '@/api/warp'
import { toast } from '@/composables/useToast'
import { eventBus, EVENTS } from '@/utils/eventBus'

const activeCategory = ref('all')
const searchQuery = ref('')
const loadingApps = ref(false)
const showInstallModal = ref(false)
const showManageModal = ref(false)
const showWarpModal = ref(false)
const selectedApp = ref<AppMarketItem | null>(null)
const installVersion = ref('')
const installing = ref(false)
const installProgress = ref(0)
const installingEngine = ref(false)
const registeringAccount = ref(false)

const manageTab = ref<'visual' | 'raw' | 'logs' | 'password'>('visual')
const manageData = ref<AppManagementData | null>(null)
const loadingManage = ref(false)
const actionLoading = ref(false)
const savingVisual = ref(false)
const savingRaw = ref(false)
const appLogs = ref<string[]>([])
const loadingLogs = ref(false)

const currentLogType = ref<'system' | 'error' | 'access' | 'slow'>('system')
const newRootPassword = ref('')
const confirmRootPassword = ref('')
const changingPassword = ref(false)

// Known installation paths for folder shortcut
const appPaths: Record<string, string> = {
  nginx: '/etc/nginx',
  php: '/etc/php',
  mysql: '/var/lib/mysql',
  redis: '/etc/redis',
  docker: '/var/lib/docker',
  nodejs: '/usr/bin/node',
  fail2ban: '/etc/fail2ban',
  sqlite3: '/var/lib/armguard',
  git: '/usr/bin/git',
  htop: '/usr/bin/htop',
  warp: '/etc/wireguard'
}

// Vendor mapping
const appVendors: Record<string, string> = {
  nginx: '官方',
  php: '官方',
  mysql: '官方',
  redis: '官方',
  docker: '官方',
  nodejs: '官方',
  fail2ban: '官方',
  sqlite3: '官方',
  git: '官方',
  htop: '官方',
  warp: 'Cloudflare / 官方'
}

// Persistent Home Dashboard Display Set
const homeApps = ref<Set<string>>(new Set(['nginx', 'warp', 'mysql', 'redis']))

function loadHomeApps() {
  try {
    const saved = localStorage.getItem('armguard_home_apps')
    if (saved) {
      const list = JSON.parse(saved)
      if (Array.isArray(list)) {
        homeApps.value = new Set(list)
      }
    }
  } catch {}
}

function toggleHomeDisplay(appKey: string) {
  if (homeApps.value.has(appKey)) {
    homeApps.value.delete(appKey)
    toast.info('已取消在首页概览展示')
  } else {
    homeApps.value.add(appKey)
    toast.success('已添加至首页概览展示')
  }
  localStorage.setItem('armguard_home_apps', JSON.stringify([...homeApps.value]))
}

function copyPath(path: string) {
  if (!path) return
  navigator.clipboard.writeText(path)
  toast.info(`已复制目录路径: ${path}`)
}

const apps = ref<AppMarketItem[]>([])

const categories = computed(() => {
  const installedCount = apps.value.filter(a => a.status === 'installed').length
  return [
    { key: 'all', label: '全部' },
    { key: 'installed', label: `已安装 (${installedCount})` },
    { key: 'runtime', label: '运行环境' },
    { key: 'database', label: '数据库与缓存' },
    { key: 'network', label: '网络与穿透' },
    { key: 'tools', label: '运维工具' }
  ]
})

async function loadApps() {
  try {
    const res = await appStoreApi.getMarketList()
    if (res.data && res.data.data) {
      apps.value = res.data.data.list
    }
  } catch (err: any) {
    console.error('Failed to load apps:', err)
  }
}

async function refreshApps() {
  loadingApps.value = true
  try {
    await loadApps()
    toast.success('软件列表及服务状态已刷新')
  } catch (e: any) {
    toast.error(`刷新失败: ${e.message}`)
  } finally {
    loadingApps.value = false
  }
}

const filteredApps = computed(() => {
  let list = apps.value

  // Category filter
  if (activeCategory.value === 'installed') {
    list = list.filter(a => a.status === 'installed')
  } else if (activeCategory.value === 'runtime') {
    list = list.filter(a => a.category === 'webserver' || a.category === 'runtime')
  } else if (activeCategory.value === 'database') {
    list = list.filter(a => a.category === 'database' || a.category === 'cache')
  } else if (activeCategory.value === 'network') {
    list = list.filter(a => a.key === 'warp' || (a.category as string) === 'network')
  } else if (activeCategory.value === 'tools') {
    list = list.filter(a => a.category === 'tools' && a.key !== 'warp')
  }

  // Search filter
  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    list = list.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.key.toLowerCase().includes(q)
    )
  }

  return list
})

function handleOpenSettings(app: AppMarketItem) {
  if (app.key === 'warp') {
    showWarpModal.value = true
  } else {
    openManageModal(app)
  }
}

async function quickControl(app: AppMarketItem, action: 'start' | 'stop' | 'restart') {
  try {
    const res = await appStoreApi.controlAppService(app.key, action)
    toast.success(res.data.message || '服务操作成功')
    eventBus.emit(EVENTS.APPS_UPDATED)
    await loadApps()
  } catch (e: any) {
    toast.error(`操作失败: ${e.message}`)
  }
}

const streamLogs = ref<{ time: string; text: string; level?: string }[]>([])

function openInstallModal(app: AppMarketItem) {
  selectedApp.value = app
  installVersion.value = app.versions[0]
  installProgress.value = 0
  installing.value = false
  streamLogs.value = []
  showInstallModal.value = true
}

async function openManageModal(app: AppMarketItem) {
  selectedApp.value = app
  manageTab.value = 'visual'
  currentLogType.value = 'system'
  newRootPassword.value = ''
  confirmRootPassword.value = ''
  loadingManage.value = true
  showManageModal.value = true
  try {
    const res = await appStoreApi.getAppManagement(app.key)
    if (res.data && res.data.data) {
      manageData.value = res.data.data
    }
  } catch (e: any) {
    toast.error(`获取插件管理数据失败: ${e.message}`)
  } finally {
    loadingManage.value = false
  }
}

async function handleServiceControl(action: 'start' | 'stop' | 'restart' | 'reload') {
  if (!selectedApp.value) return
  actionLoading.value = true
  try {
    const res = await appStoreApi.controlAppService(selectedApp.value.key, action)
    toast.success(res.data.message || '操作成功')
    eventBus.emit(EVENTS.APPS_UPDATED)
    // Refresh status
    const newRes = await appStoreApi.getAppManagement(selectedApp.value.key)
    if (newRes.data && newRes.data.data) {
      manageData.value = newRes.data.data
    }
    await loadApps()
  } catch (e: any) {
    toast.error(`操作失败: ${e.message}`)
  } finally {
    actionLoading.value = false
  }
}

// PHP Multi-Version Controls
async function handleSwitchPhpVersion(ver: string) {
  actionLoading.value = true
  try {
    const res = await appStoreApi.switchPhpVersion(ver)
    toast.success(res.data.message || `成功切换全局 CLI 为 PHP ${ver}`)
    eventBus.emit(EVENTS.APPS_UPDATED)
    if (selectedApp.value) {
      const curVer = manageData.value?.visual_config?.selected_version || ver
      const newRes = await appStoreApi.getAppManagement('php', curVer)
      if (newRes.data && newRes.data.data) {
        manageData.value = newRes.data.data
      }
    }
    await loadApps()
  } catch (e: any) {
    toast.error(`切换版本失败: ${e.message}`)
  } finally {
    actionLoading.value = false
  }
}

async function handleControlPhpFpm(action: 'start' | 'stop' | 'restart', ver: string) {
  actionLoading.value = true
  try {
    const res = await appStoreApi.controlAppService('php', action, ver)
    toast.success(res.data.message || `操作成功`)
    eventBus.emit(EVENTS.APPS_UPDATED)
    if (selectedApp.value) {
      const curVer = manageData.value?.visual_config?.selected_version || ver
      const newRes = await appStoreApi.getAppManagement('php', curVer)
      if (newRes.data && newRes.data.data) {
        manageData.value = newRes.data.data
      }
    }
    await loadApps()
  } catch (e: any) {
    toast.error(`操作失败: ${e.message}`)
  } finally {
    actionLoading.value = false
  }
}

async function changePhpTargetVersion(ver: string) {
  loadingManage.value = true
  try {
    const res = await appStoreApi.getAppManagement('php', ver)
    if (res.data && res.data.data) {
      manageData.value = res.data.data
    }
  } catch (e: any) {
    toast.error(`获取 PHP ${ver} 数据失败: ${e.message}`)
  } finally {
    loadingManage.value = false
  }
}

async function handleInstallPhpVersion(ver: string) {
  actionLoading.value = true
  try {
    toast.info(`已下发 PHP ${ver} 安装任务，正在后台高速执行 APT 安装...`)
    const res = await appStoreApi.installPhpVersion(ver)
    const taskId = res.data.data.task_id
    
    // Poll progress
    const pollInterval = setInterval(async () => {
      try {
        const progRes = await appStoreApi.getTaskProgress('php', taskId)
        if (progRes.data?.data?.stage === 'done') {
          clearInterval(pollInterval)
          toast.success(`PHP ${ver} 安装完成，FPM 运行池已就绪！`)
          eventBus.emit(EVENTS.APPS_UPDATED)
          if (selectedApp.value) {
            const newRes = await appStoreApi.getAppManagement('php', ver)
            if (newRes.data && newRes.data.data) {
              manageData.value = newRes.data.data
            }
          }
          await loadApps()
          actionLoading.value = false
        } else if (progRes.data?.data?.stage === 'failed') {
          clearInterval(pollInterval)
          toast.error(`PHP ${ver} 安装失败: ${progRes.data?.data?.error_message}`)
          actionLoading.value = false
        }
      } catch {
        clearInterval(pollInterval)
        actionLoading.value = false
      }
    }, 2000)
  } catch (e: any) {
    toast.error(`启动安装失败: ${e.message}`)
    actionLoading.value = false
  }
}

function copySocket(path: string) {
  try {
    navigator.clipboard.writeText(path)
    toast.success(`Socket 路径已复制: ${path}`)
  } catch {
    toast.info(`Socket 路径: ${path}`)
  }
}

async function saveVisualSettings() {
  if (!selectedApp.value || !manageData.value) return
  savingVisual.value = true
  try {
    await appStoreApi.saveVisualConfig(selectedApp.value.key, manageData.value.visual_config)
    toast.success('配置已成功保存并重载生效！')
    eventBus.emit(EVENTS.APPS_UPDATED)
    // Refresh
    const newRes = await appStoreApi.getAppManagement(selectedApp.value.key)
    if (newRes.data && newRes.data.data) {
      manageData.value = newRes.data.data
    }
    await loadApps()
  } catch (e: any) {
    toast.error(`保存失败: ${e.message}`)
  } finally {
    savingVisual.value = false
  }
}

async function handleInstallEngine() {
  installingEngine.value = true
  try {
    const res = await warpApi.installEngine()
    if (res.data?.data?.system_health && manageData.value) {
      manageData.value.visual_config.system_health = res.data.data.system_health
      toast.success('WireGuard-Go 引擎与工具链已成功安装就绪！')
      eventBus.emit(EVENTS.WARP_UPDATED)
      await loadApps()
    }
  } catch (err: any) {
    toast.error(`安装失败: ${err.message}`)
  } finally {
    installingEngine.value = false
  }
}

async function handleRegisterAccount() {
  registeringAccount.value = true
  try {
    const res = await warpApi.registerAccount()
    if (res.data?.data?.system_health && manageData.value) {
      manageData.value.visual_config.system_health = res.data.data.system_health
      toast.success('Cloudflare WARP 官方账号注册成功并已绑定！')
      eventBus.emit(EVENTS.WARP_UPDATED)
      await loadApps()
    }
  } catch (err: any) {
    toast.error(`注册失败: ${err.message}`)
  } finally {
    registeringAccount.value = false
  }
}

async function saveRawConfigFile() {
  if (!selectedApp.value || !manageData.value) return
  savingRaw.value = true
  try {
    await appStoreApi.saveRawConfig(selectedApp.value.key, manageData.value.config_file_path, manageData.value.raw_config)
    toast.success('底层配置文件已成功保存并热重载生效！')
    eventBus.emit(EVENTS.APPS_UPDATED)
  } catch (e: any) {
    toast.error(`保存配置失败: ${e.message}`)
  } finally {
    savingRaw.value = false
  }
}

function changeLogType(type: 'system' | 'error' | 'access' | 'slow') {
  currentLogType.value = type
  loadLogs()
}

async function loadLogs() {
  if (!selectedApp.value) return
  manageTab.value = 'logs'
  loadingLogs.value = true
  try {
    const res = await appStoreApi.getAppLogs(selectedApp.value.key, undefined, currentLogType.value)
    appLogs.value = res.data?.data?.logs || []
  } catch (e: any) {
    console.error('Failed to load logs:', e)
  } finally {
    loadingLogs.value = false
  }
}

async function submitChangeRootPassword() {
  if (!newRootPassword.value.trim()) {
    toast.error('请输入新密码')
    return
  }
  if (newRootPassword.value !== confirmRootPassword.value) {
    toast.error('两次输入的密码不一致，请核对后重试')
    return
  }
  changingPassword.value = true
  try {
    const res = await appStoreApi.changeMysqlRootPassword(newRootPassword.value.trim())
    toast.success(res.data.message || 'MySQL root 密码修改成功！')
    newRootPassword.value = ''
    confirmRootPassword.value = ''
  } catch (e: any) {
    toast.error(`修改密码失败: ${e.message}`)
  } finally {
    changingPassword.value = false
  }
}

async function startInstall() {
  if (!selectedApp.value) return
  installing.value = true
  installProgress.value = 10
  streamLogs.value = [
    { time: new Date().toLocaleTimeString(), text: `[armguard-pkg] 正在调用系统包管理器配置 ${selectedApp.value.name}...` },
    { time: new Date().toLocaleTimeString(), text: `[armguard-pkg] 架构目标: aarch64 (ARMv8-A 64-bit)...` },
  ]

  try {
    const res = await appStoreApi.installApp(selectedApp.value.key, installVersion.value)
    const taskId = res.data?.data?.task_id
    streamLogs.value.push({ time: new Date().toLocaleTimeString(), text: `[armguard-pkg] 任务已启动 (TaskID: ${taskId})` })

    let lastLogCount = 0
    const interval = setInterval(async () => {
      if (taskId && selectedApp.value) {
        try {
          const progressRes = await appStoreApi.getTaskProgress(selectedApp.value.key, taskId)
          const p = progressRes.data?.data
          if (p) {
            installProgress.value = p.progress_percent
            if (p.logs && p.logs.length > lastLogCount) {
              const newLines = p.logs.slice(lastLogCount)
              for (const l of newLines) {
                streamLogs.value.push({
                  time: new Date().toLocaleTimeString(),
                  text: l,
                  level: l.startsWith('✓') ? 'SUCCESS' : l.includes('Err') || l.includes('failed') ? 'WARN' : 'INFO'
                })
              }
              lastLogCount = p.logs.length
            }
            if (p.stage === 'done' || p.stage === 'failed') {
              clearInterval(interval)
              installing.value = false
              await loadApps()
              eventBus.emit(EVENTS.APPS_UPDATED)
              setTimeout(() => {
                showInstallModal.value = false
                if (p.stage === 'done') {
                  toast.success(`应用 [${selectedApp.value?.name}] 安装完成并已激活！`)
                } else {
                  toast.error(`应用 [${selectedApp.value?.name}] 安装失败，请查看控制台日志！`)
                }
              }, 800)
            }
          }
        } catch {
          clearInterval(interval)
          installing.value = false
          loadApps()
        }
      }
    }, 800)
  } catch (err: any) {
    toast.error(`安装失败: ${err.message}`)
    installing.value = false
  }
}

async function uninstallApp(app: AppMarketItem) {
  if (confirm(`确定要从系统卸载应用 [${app.name}] 吗？`)) {
    try {
      await appStoreApi.uninstallApp(app.key)
      await loadApps()
      eventBus.emit(EVENTS.APPS_UPDATED)
      toast.success(`应用 [${app.name}] 已成功卸载！`)
    } catch (e: any) {
      toast.error(`卸载失败: ${e.message}`)
    }
  }
}

let offAppEvent: (() => void) | null = null
let offWarpEvent: (() => void) | null = null

onMounted(() => {
  loadHomeApps()
  loadApps()
  offAppEvent = eventBus.on(EVENTS.APPS_UPDATED, () => {
    loadApps()
  })
  offWarpEvent = eventBus.on(EVENTS.WARP_UPDATED, () => {
    loadApps()
    if (manageData.value?.app_key === 'warp' && selectedApp.value) {
      appStoreApi.getAppManagement('warp').then(res => {
        if (res.data?.data) manageData.value = res.data.data
      }).catch(() => {})
    }
  })
})
</script>
