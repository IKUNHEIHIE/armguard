<template>
  <div class="space-y-6">
    <!-- Header with Action Button -->
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-3">
          <h2 class="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            网站管理 (Websites)
            <span class="text-xs px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-400 border border-brand-500/30 font-mono">Nginx / OpenResty</span>
          </h2>
          <!-- Navigation Pills: L7 Sites vs L4 Stream -->
          <div class="flex items-center p-0.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono">
            <span class="px-2.5 py-1 rounded-lg bg-brand-500/20 text-brand-400 font-bold border border-brand-500/30 shadow-sm">
              七层网站 (HTTP/HTTPS)
            </span>
            <RouterLink
              to="/stream"
              class="px-2.5 py-1 rounded-lg text-slate-400 hover:text-slate-200 transition"
            >
              四层转发 (TCP/UDP)
            </RouterLink>
          </div>
        </div>
        <p class="text-xs text-slate-400 font-mono mt-1">支持 Vue/React SPA 静态部署、多版本 PHP-FPM 运行池、Node/Go/Docker 反向代理与 SSL 自动化管理</p>
      </div>
      <button
        @click="openCreateModal"
        class="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold text-xs transition shadow-lg shadow-brand-500/20"
      >
        <Plus class="w-4 h-4" />
        新建网站
      </button>
    </div>

    <!-- Site List Card -->
    <div class="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs font-mono">
          <thead>
            <tr class="bg-slate-950/60 text-slate-400 border-b border-slate-800">
              <th class="py-3.5 px-4 font-semibold">主域名 / 绑定域名</th>
              <th class="py-3.5 px-4 font-semibold">运行环境 / 架构</th>
              <th class="py-3.5 px-4 font-semibold">SSL 证书</th>
              <th class="py-3.5 px-4 font-semibold">运行目录 / 代理</th>
              <th class="py-3.5 px-4 font-semibold">状态</th>
              <th class="py-3.5 px-4 font-semibold text-right">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/60">
            <tr v-for="site in sites" :key="site.id" class="hover:bg-slate-800/30 transition group">
              <!-- Domain -->
              <td class="py-3.5 px-4">
                <div class="font-bold text-slate-100 flex items-center gap-1.5">
                  <Globe class="w-3.5 h-3.5 text-brand-400 shrink-0" />
                  <a :href="`http://${site.domain}`" target="_blank" class="hover:text-brand-400 hover:underline flex items-center gap-1">
                    {{ site.domain }}
                    <ExternalLink class="w-2.5 h-2.5 opacity-60" />
                  </a>
                </div>
                <div v-if="site.domains?.length > 1" class="text-[11px] text-slate-500 mt-0.5">
                  +{{ site.domains.length - 1 }} 个附加域名
                </div>
              </td>

              <!-- PHP Version / Type -->
              <td class="py-3.5 px-4">
                <span
                  class="px-2 py-0.5 rounded text-[11px] font-bold border"
                  :class="getPhpBadgeClass(site.php_version)"
                >
                  {{ formatPhpVersion(site.php_version) }}
                </span>
                <span v-if="site.proxy_enabled" class="ml-1.5 px-1.5 py-0.2 rounded text-[10px] border" :class="site.grpc_enabled ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'">
                  {{ site.grpc_enabled ? 'gRPC 代理' : '反向代理' }}
                </span>
              </td>

              <!-- SSL -->
              <td class="py-3.5 px-4">
                <span
                  v-if="site.ssl_enabled"
                  class="inline-flex items-center gap-1 text-emerald-400 text-[11px]"
                >
                  <Lock class="w-3 h-3" />
                  <span>HTTPS {{ site.ssl_force_https ? '(强制)' : '' }}</span>
                </span>
                <span v-else class="text-slate-500 text-[11px] flex items-center gap-1">
                  <Unlock class="w-3 h-3" /> 未配置
                </span>
              </td>

              <!-- Path / Proxy Target -->
              <td class="py-3.5 px-4 text-slate-400">
                <div v-if="site.proxy_enabled && site.proxy_pass" class="text-cyan-400 text-[11px] font-semibold flex items-center gap-1">
                  <ArrowRightLeft class="w-3 h-3" />
                  {{ site.proxy_pass }}
                </div>
                <div v-else class="flex items-center gap-1">
                  <RouterLink
                    :to="{ path: '/files', query: { path: site.path } }"
                    class="group/folder inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-900/90 hover:bg-brand-500/15 text-slate-300 hover:text-brand-300 border border-slate-800 hover:border-brand-500/30 transition cursor-pointer"
                    title="点击在文件管理器中打开此网站根目录"
                  >
                    <Folder class="w-3.5 h-3.5 text-amber-400 group-hover/folder:text-brand-400 shrink-0 transition" />
                    <span class="text-[11px] font-mono group-hover/folder:underline">
                      {{ site.path }}{{ site.sub_dir ? ` (${site.sub_dir})` : '' }}
                    </span>
                    <ExternalLink class="w-2.5 h-2.5 opacity-0 group-hover/folder:opacity-100 transition text-brand-400" />
                  </RouterLink>
                </div>
              </td>

              <!-- Status -->
              <td class="py-3.5 px-4">
                <button
                  @click="toggleSiteStatus(site)"
                  :disabled="togglingSiteId === site.id"
                  class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border transition"
                  :class="site.status === 'running' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25' : 'bg-rose-500/15 text-rose-400 border-rose-500/30 hover:bg-rose-500/25'"
                >
                  <span class="w-1.5 h-1.5 rounded-full" :class="site.status === 'running' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'"></span>
                  {{ site.status === 'running' ? '运行中' : '已暂停' }}
                </button>
              </td>

              <!-- Actions -->
              <td class="py-3.5 px-4 text-right">
                <div class="inline-flex items-center gap-2">
                  <button
                    @click="openSettingsModal(site)"
                    class="px-2.5 py-1 rounded-lg bg-brand-600/20 hover:bg-brand-500 hover:text-slate-950 text-brand-300 font-bold border border-brand-500/30 transition flex items-center gap-1"
                  >
                    <Sliders class="w-3.5 h-3.5" />
                    设置
                  </button>
                  <button
                    @click="openDeleteModal(site)"
                    title="删除站点"
                    class="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 1. Create Site Modal -->
    <Modal v-model="showCreateModal" title="新建网站站点" size="lg">
      <form @submit.prevent="handleCreateSite" class="space-y-4 font-mono text-xs">
        <div>
          <label class="block text-slate-300 font-semibold mb-1">主域名 (必填)</label>
          <input
            v-model="createForm.domain"
            type="text"
            required
            placeholder="example.com"
            class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
          />
        </div>

        <div>
          <label class="block text-slate-300 font-semibold mb-1">附加域名 (每行一个，可选)</label>
          <textarea
            v-model="createForm.extraDomains"
            rows="2"
            placeholder="www.example.com&#10;api.example.com"
            class="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white focus:outline-none focus:border-brand-500"
          ></textarea>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-slate-300 font-semibold mb-1">运行环境 (PHP / 静态 / 反代)</label>
            <select
              v-model="createForm.php_version"
              class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
            >
              <option value="static">静态 HTML / Vue / React SPA 单页应用</option>
              <option value="php84">PHP 8.4 (最新稳定版)</option>
              <option value="php83">PHP 8.3 (ARM64 官方优化)</option>
              <option value="php82">PHP 8.2</option>
              <option value="php81">PHP 8.1</option>
              <option value="php74">PHP 7.4 (旧版兼容)</option>
              <option value="proxy">纯反向代理 (Node.js / Go / Docker)</option>
            </select>
          </div>

          <div v-if="createForm.php_version === 'proxy'" class="space-y-2">
            <div class="flex items-center justify-between">
              <label class="block text-slate-300 font-semibold mb-0">反向代理目标 URL</label>
              <label class="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 cursor-pointer select-none">
                <input type="checkbox" v-model="createForm.grpc_enabled" class="rounded text-purple-500 w-3.5 h-3.5" />
                <span>开启 gRPC 代理模式 (HTTP/2)</span>
              </label>
            </div>
            <input
              v-model="createForm.proxy_pass"
              type="text"
              :placeholder="createForm.grpc_enabled ? 'grpc://127.0.0.1:50051' : 'http://127.0.0.1:3000'"
              class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white font-mono text-xs focus:outline-none focus:border-brand-500"
            />
            <p v-if="createForm.grpc_enabled" class="text-[11px] text-purple-300/90 font-mono flex items-center gap-1">
              ⚡ 已激活 gRPC 模式：将使用 Nginx grpc_pass 并自动配置 HTTP/2 二进制帧传输
            </p>
          </div>

          <div v-else>
            <label class="block text-slate-300 font-semibold mb-1">伪静态预设</label>
            <select
              v-model="createForm.rewrite_preset"
              class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
            >
              <option value="spa">Vue / React SPA (History 模式防404)</option>
              <option value="wordpress">WordPress</option>
              <option value="laravel">Laravel / ThinkPHP</option>
              <option value="typecho">Typecho</option>
              <option value="none">默认 / 关闭伪静态</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-slate-300 font-semibold mb-1">监听外部端口 (默认 80)</label>
            <input
              v-model.number="createForm.port"
              type="number"
              min="1"
              max="65535"
              placeholder="80"
              class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
            />
          </div>
          <div>
            <label class="block text-slate-300 font-semibold mb-1">根目录路径 (留空自动生成)</label>
            <input
              v-model="createForm.path"
              type="text"
              :placeholder="`/www/wwwroot/${createForm.domain || 'example.com'}`"
              class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
            />
          </div>
        </div>

        <div class="pt-3 flex justify-end gap-3">
          <button
            type="button"
            @click="showCreateModal = false"
            class="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
          >
            取消
          </button>
          <button
            type="submit"
            :disabled="creatingSite"
            class="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold flex items-center gap-1.5"
          >
            <Loader2 v-if="creatingSite" class="w-3.5 h-3.5 animate-spin" />
            <span>{{ creatingSite ? '创建中...' : '立即创建' }}</span>
          </button>
        </div>
      </form>
    </Modal>

    <!-- 2. Comprehensive Site Settings Modal (Split Layout Workbench) -->
    <Modal
      v-model="showSettingsModal"
      :title="`站点设置: ${activeSite?.domain}`"
      size="2xl"
      :no-padding="true"
      height="h-[620px]"
    >
      <template #header-right>
        <div v-if="activeSite" class="flex items-center gap-2 text-xs font-mono">
          <span
            class="px-2 py-0.5 rounded-full flex items-center gap-1 text-[11px] font-bold border"
            :class="activeSite.status === 'running' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/15 text-rose-400 border-rose-500/30'"
          >
            <span class="w-1.5 h-1.5 rounded-full" :class="activeSite.status === 'running' ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'"></span>
            {{ activeSite.status === 'running' ? '运行中' : '已暂停' }}
          </span>

          <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px]">
            {{ formatPhpVersion(activeSite.php_version) }}
          </span>

          <a
            :href="`http://${activeSite.domain}`"
            target="_blank"
            class="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 flex items-center gap-1 text-[11px] transition"
            title="在新标签页中打开站点"
          >
            <span>访问</span>
            <ExternalLink class="w-3 h-3 text-brand-400" />
          </a>
        </div>
      </template>

      <!-- Loading State -->
      <div v-if="loadingDetails" class="h-full flex flex-col items-center justify-center text-slate-400 gap-3">
        <Loader2 class="w-8 h-8 animate-spin text-brand-400" />
        <span class="font-mono text-xs">正在读取站点详细配置与运行状态...</span>
      </div>

      <!-- Split Layout Container (Strictly locked to parent h-full min-h-0) -->
      <div v-else-if="activeSite" class="flex flex-1 h-full min-h-0 w-full overflow-hidden">
        <!-- Left Sidebar Navigation -->
        <div class="w-56 bg-slate-950/80 border-r border-slate-800 flex flex-col justify-between select-none shrink-0 h-full min-h-0">
          <div class="p-3 overflow-y-auto space-y-4 flex-1 min-h-0">
            <div v-for="group in tabGroups" :key="group.groupName" class="space-y-1">
              <div class="px-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                {{ group.groupName }}
              </div>
              <div class="space-y-0.5">
                <button
                  v-for="t in group.tabs"
                  :key="t.key"
                  @click="currentTab = t.key"
                  class="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-mono transition group"
                  :class="currentTab === t.key ? 'bg-brand-500/15 text-brand-300 font-bold border border-brand-500/30 shadow-sm' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'"
                >
                  <div class="flex items-center gap-2 truncate">
                    <component
                      :is="t.icon"
                      class="w-3.5 h-3.5 shrink-0 transition"
                      :class="currentTab === t.key ? 'text-brand-400' : 'text-slate-400 group-hover:text-slate-200'"
                    />
                    <span class="truncate">{{ t.label }}</span>
                  </div>
                  <span
                    v-if="t.badge && t.badge()"
                    class="text-[10px] px-1.5 py-0.2 rounded font-bold"
                    :class="t.badgeClass ? t.badgeClass() : 'bg-slate-800 text-slate-400'"
                  >
                    {{ t.badge() }}
                  </span>
                </button>
              </div>
            </div>
          </div>

          <!-- Left Sidebar Footer Info -->
          <div class="p-3 border-t border-slate-800/80 bg-slate-950/90 text-[11px] font-mono text-slate-500 space-y-1 shrink-0">
            <div class="flex items-center justify-between">
              <span>监听端口:</span>
              <strong class="text-slate-300">{{ activeSite.port || 80 }}</strong>
            </div>
            <div class="flex items-center justify-between">
              <span>SSL 模式:</span>
              <strong :class="activeSite.ssl_enabled ? 'text-emerald-400' : 'text-slate-400'">
                {{ activeSite.ssl_enabled ? 'HTTPS 开启' : '未开启' }}
              </strong>
            </div>
          </div>
        </div>

        <!-- Right Content Area (Fixed layout, independent scrolling) -->
        <div class="flex-1 flex flex-col justify-between overflow-hidden bg-slate-900/40 h-full min-h-0 min-w-0">
          <!-- Top Subheader of current tab -->
          <div class="px-6 py-3.5 border-b border-slate-800/80 bg-slate-950/50 flex items-center justify-between shrink-0">
            <div class="flex items-center gap-2.5">
              <div class="p-1.5 rounded-lg bg-brand-500/10 text-brand-400 border border-brand-500/20">
                <component :is="currentTabMeta.icon" class="w-4 h-4" />
              </div>
              <div>
                <h3 class="text-xs font-bold text-white tracking-tight flex items-center gap-2">
                  {{ currentTabMeta.label }}
                </h3>
                <p class="text-[11px] text-slate-400 font-mono">
                  {{ currentTabMeta.desc }}
                </p>
              </div>
            </div>

            <!-- Tab Context Action Buttons -->
            <div class="flex items-center gap-2 text-xs font-mono">
              <button
                v-if="currentTab === 'raw'"
                @click="copyRawConfig"
                class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1 transition"
                title="复制全部配置到剪贴板"
              >
                <Copy class="w-3 h-3 text-brand-400" />
                复制配置
              </button>
              <button
                v-if="currentTab === 'logs'"
                @click="loadLogs"
                class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1 transition"
              >
                <RefreshCw class="w-3 h-3 text-brand-400" :class="{ 'animate-spin': loadingLogs }" />
                刷新日志
              </button>
            </div>
          </div>

          <!-- Scrollable Tab Content Body (min-h-0 is crucial for flex child overflow) -->
          <div class="flex-1 p-6 overflow-y-auto space-y-4 font-mono text-xs min-h-0">
            <!-- TAB 1: 🌐 域名绑定 (Domains) -->
            <div v-if="currentTab === 'domains'" class="space-y-4">
              <!-- Add Domain Input Box ON TOP -->
              <div class="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                <label class="block text-slate-300 font-semibold">添加新的绑定域名</label>
                <div class="flex gap-2">
                  <input
                    v-model="newDomainInput"
                    type="text"
                    placeholder="输入要添加绑定的新域名 (如 m.example.com 或 *.example.com)"
                    @keyup.enter="addDomain"
                    class="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
                  />
                  <button
                    @click="addDomain"
                    class="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold flex items-center gap-1 transition"
                  >
                    <Plus class="w-3.5 h-3.5" />
                    添加绑定
                  </button>
                </div>
                <p class="text-[11px] text-slate-500">支持二级域名或泛域名。添加后请确保 DNS 记录已解析到本服务器 IP。</p>
              </div>

              <!-- Existing Domains List -->
              <div class="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2.5">
                <div class="flex items-center justify-between pb-2 border-b border-slate-800/80">
                  <span class="text-white font-semibold flex items-center gap-2">
                    <span>已绑定的域名列表</span>
                    <span class="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px]">{{ activeSite.domains?.length || 1 }} 个</span>
                  </span>
                  <span class="text-slate-400 text-[11px]">当前主域名: <strong class="text-brand-400">{{ activeSite.domain }}</strong></span>
                </div>

                <div class="space-y-1.5">
                  <div
                    v-for="(dom, idx) in activeSite.domains"
                    :key="dom"
                    class="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 transition"
                  >
                    <div class="flex items-center gap-2 text-slate-200">
                      <Globe class="w-3.5 h-3.5 text-brand-400" />
                      <span class="font-bold">{{ dom }}</span>
                      <span v-if="dom === activeSite.domain" class="px-2 py-0.5 rounded bg-brand-500/20 text-brand-400 border border-brand-500/30 text-[10px] font-bold">
                        主域名
                      </span>
                    </div>
                    <div class="flex items-center gap-2">
                      <button
                        v-if="dom !== activeSite.domain"
                        @click="setAsPrimaryDomain(dom)"
                        class="text-slate-400 hover:text-brand-400 text-[11px] px-2 py-1 rounded bg-slate-800/80 hover:bg-slate-800 border border-slate-700 transition"
                        title="将该域名设为虚拟主机主域名"
                      >
                        设为主域名
                      </button>
                      <button
                        v-if="dom !== activeSite.domain"
                        @click="removeDomain(idx)"
                        class="text-rose-400 hover:text-rose-300 text-[11px] px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition"
                      >
                        解绑
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- TAB 2: 📁 运行目录与默认文档 (Directory & Index) -->
            <div v-if="currentTab === 'directory'" class="space-y-4">
              <div class="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-4">
                <div>
                  <label class="block text-slate-300 font-semibold mb-1">网站物理根目录</label>
                  <div class="flex items-center gap-2">
                    <input :value="activeSite.path" readonly class="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-300 select-all" />
                    <RouterLink
                      :to="{ path: '/files', query: { path: activeSite.path } }"
                      class="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition shrink-0"
                    >
                      <Folder class="w-3.5 h-3.5 text-amber-400" />
                      <span>在文件管理器中打开</span>
                    </RouterLink>
                  </div>
                </div>

                <div>
                  <label class="block text-slate-300 font-semibold mb-1">运行子目录 (Laravel 请填写 /public，Vite/SPA 前端应用请填写 /dist)</label>
                  <input
                    v-model="activeSite.sub_dir"
                    type="text"
                    placeholder="留空为根目录，或填 /public, /dist"
                    class="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label class="block text-slate-300 font-semibold mb-1">默认首页文档 (按优先级从左到右依次查找)</label>
                  <input
                    v-model="activeSite.default_index"
                    type="text"
                    placeholder="index.html index.htm index.php"
                    class="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500"
                  />
                  <div class="flex items-center gap-2 mt-1.5 text-[11px] text-slate-400">
                    <span>常用预设:</span>
                    <button type="button" @click="activeSite.default_index = 'index.html index.htm index.php'" class="text-brand-400 hover:underline">通用 (HTML + PHP)</button>
                    <button type="button" @click="activeSite.default_index = 'index.html'" class="text-brand-400 hover:underline">纯静态 SPA</button>
                    <button type="button" @click="activeSite.default_index = 'index.php index.html'" class="text-brand-400 hover:underline">PHP 优先</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- TAB 3: 🐘 PHP 版本 (PHP Version) -->
            <div v-if="currentTab === 'php'" class="space-y-4">
              <div class="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-4">
                <div class="flex items-center justify-between">
                  <div>
                    <div class="text-white font-semibold flex items-center gap-2">
                      <span>PHP-FPM 运行池版本切换</span>
                      <span class="text-xs px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        当前: {{ formatPhpVersion(activeSite.php_version) }}
                      </span>
                    </div>
                    <div class="text-[11px] text-slate-400 mt-1">
                      选择网站绑定的 PHP-FPM 版本。保存设置后系统将自动更新 Nginx 虚拟主机的 fastcgi_pass socket 地址并平滑热重载。
                    </div>
                  </div>
                </div>

                <div class="space-y-2 pt-1">
                  <label class="block text-slate-300 font-semibold mb-1">选择目标运行环境</label>
                  <select
                    v-model="activeSite.php_version"
                    class="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white font-mono focus:outline-none focus:border-brand-500"
                  >
                    <option value="static">静态模式 (纯静态 HTML / Vue / React SPA，关闭 FastCGI 解析)</option>
                    <option value="php84">PHP 8.4 (套接字: /run/php/php8.4-fpm.sock)</option>
                    <option value="php83">PHP 8.3 (套接字: /run/php/php8.3-fpm.sock)</option>
                    <option value="php82">PHP 8.2 (套接字: /run/php/php8.2-fpm.sock)</option>
                    <option value="php81">PHP 8.1 (套接字: /run/php/php8.1-fpm.sock)</option>
                    <option value="php74">PHP 7.4 (套接字: /run/php/php7.4-fpm.sock)</option>
                  </select>
                </div>

                <div class="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400 space-y-1.5 font-mono">
                  <div class="text-slate-300 font-semibold flex items-center gap-1.5">
                    <span>💡 运行池无缝联动说明:</span>
                  </div>
                  <p>• 若访问出现 502 Bad Gateway，请在【应用商店】检查对应版本的 PHP-FPM 服务是否已安装并处于运行中。</p>
                  <p>• 点击右下角【保存设置并重载 Nginx】，系统将在毫秒级校验配置并平滑重载，不会中断运行中的连接。</p>
                </div>
              </div>
            </div>

            <!-- TAB 4: ⚡ 反向代理 (Reverse Proxy) -->
            <div v-if="currentTab === 'proxy'" class="space-y-4">
              <div class="flex items-center justify-between p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
                <div>
                  <div class="text-white font-semibold">开启反向代理模式 (Reverse Proxy)</div>
                  <div class="text-[11px] text-slate-400">将本域名的所有外部访问实时代理转发给本地后端微服务或 Docker 容器</div>
                </div>
                <input type="checkbox" v-model="activeSite.proxy_enabled" class="w-4 h-4 rounded text-brand-500" />
              </div>

              <div v-if="activeSite.proxy_enabled" class="space-y-3">
                <!-- gRPC Switch Card -->
                <div class="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
                  <div class="flex items-center justify-between">
                    <div>
                      <div class="text-white font-semibold flex items-center gap-2">
                        <span>开启 gRPC 代理模式 (gRPC Proxy)</span>
                        <span class="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-mono">HTTP/2</span>
                      </div>
                      <div class="text-[11px] text-slate-400">使用 Nginx 原生 grpc_pass 指令，支持 Google Protocol Buffers 二进制流与全双工 RPC 通信</div>
                    </div>
                    <input type="checkbox" v-model="activeSite.grpc_enabled" class="w-4 h-4 rounded text-purple-500 cursor-pointer" />
                  </div>
                  <div v-if="activeSite.grpc_enabled" class="p-2.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[11px] font-mono">
                    ⚡ 提示：目标格式应为 <code class="text-purple-200">grpc://127.0.0.1:50051</code> 或 TLS 加密的 <code class="text-purple-200">grpcs://host:port</code>。系统已自动为本虚拟主机配置 HTTP/2 与 300s 超时保障。
                  </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label class="block text-slate-400 mb-1">
                      目标后端 URL (<code class="text-brand-400 font-mono">{{ activeSite.grpc_enabled ? 'grpc_pass' : 'proxy_pass' }}</code>)
                    </label>
                    <input
                      v-model="activeSite.proxy_pass"
                      type="text"
                      :placeholder="activeSite.grpc_enabled ? 'grpc://127.0.0.1:50051' : 'http://127.0.0.1:3000'"
                      class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label class="block text-slate-400 mb-1">代理匹配路径 (默认 /)</label>
                    <input
                      v-model="activeSite.proxy_path"
                      type="text"
                      placeholder="/"
                      class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-brand-500"
                    />
                  </div>
                </div>

                <div v-if="!activeSite.grpc_enabled" class="flex items-center justify-between p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                  <div>
                    <div class="text-white font-semibold">支持 WebSocket 长连接协议升级</div>
                    <div class="text-[11px] text-slate-400">自动注入 Upgrade 与 Connection 请求头，适用于 Socket.io / ws / 实时通信服务</div>
                  </div>
                  <input type="checkbox" v-model="activeSite.websocket_enabled" class="w-4 h-4 rounded text-brand-500" />
                </div>
              </div>
            </div>

            <!-- TAB 5: 🔒 SSL / HTTPS 证书 (SSL & HTTPS) -->
            <div v-if="currentTab === 'ssl'" class="space-y-4">
              <div class="flex items-center justify-between p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
                <div>
                  <div class="text-white font-semibold">开启 HTTPS (SSL 443 加密与 HTTP/2)</div>
                  <div class="text-[11px] text-slate-400">证书目录: /etc/ssl/armguard/{{ activeSite.domain }}/</div>
                </div>
                <input type="checkbox" v-model="activeSite.ssl_enabled" class="w-4 h-4 rounded text-brand-500" />
              </div>

              <div v-if="activeSite.ssl_enabled" class="space-y-4">
                <div class="flex items-center justify-between p-3.5 rounded-xl bg-slate-950/70 border border-slate-800">
                  <div>
                    <div class="text-white font-semibold">HTTP 301 强制跳转 HTTPS</div>
                    <div class="text-[11px] text-slate-400">所有访问 http:// 的未加密请求将自动通过 301 永久重定向到 https://</div>
                  </div>
                  <input type="checkbox" v-model="activeSite.ssl_force_https" class="w-4 h-4 rounded text-brand-500" />
                </div>

                <!-- SSL Cert Status & Manual Paste -->
                <div class="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
                  <div class="flex items-center justify-between">
                    <span class="text-white font-semibold">部署自定义 SSL 证书与私钥</span>
                    <span v-if="sslData.has_cert_files" class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px]">
                      ✓ 证书文件已就绪 (fullchain.pem / privkey.pem)
                    </span>
                    <span v-else class="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px]">
                      未就绪 (请粘贴证书与私钥并部署)
                    </span>
                  </div>

                  <div>
                    <label class="block text-slate-400 mb-1">证书公钥 (PEM 格式，包含完整证书链 fullchain.pem)</label>
                    <textarea
                      v-model="sslData.cert"
                      rows="4"
                      placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
                      class="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-emerald-400 font-mono text-[11px] focus:outline-none focus:border-brand-500"
                    ></textarea>
                  </div>

                  <div>
                    <label class="block text-slate-400 mb-1">证书私钥 (KEY 格式 / privkey.pem)</label>
                    <textarea
                      v-model="sslData.key"
                      rows="4"
                      placeholder="-----BEGIN RSA PRIVATE KEY----- / -----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
                      class="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-amber-300 font-mono text-[11px] focus:outline-none focus:border-brand-500"
                    ></textarea>
                  </div>

                  <div class="flex justify-end">
                    <button
                      type="button"
                      @click="handleSaveSSL"
                      :disabled="sslData.saving"
                      class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 transition text-xs shadow-lg shadow-emerald-600/20"
                    >
                      <Loader2 v-if="sslData.saving" class="w-3.5 h-3.5 animate-spin" />
                      <span>{{ sslData.saving ? '部署中...' : '立即保存并部署 SSL 证书' }}</span>
                    </button>
                  </div>
                </div>

                <div class="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 space-y-1">
                  <div class="font-bold flex items-center gap-1.5">
                    <ShieldCheck class="w-4 h-4" />
                    已自动启用 ARM64 TLS 1.3 现代加密硬件加速
                  </div>
                  <p class="text-[11px] text-emerald-400/80">支持 HTTP/2 多路复用与 0-RTT 连接快速重试，提升网站加载速度 40% 以上。</p>
                </div>
              </div>
            </div>

            <!-- TAB 6: 📝 伪静态规则 (URL Rewrite) -->
            <div v-if="currentTab === 'rewrite'" class="space-y-4">
              <div class="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
                <div>
                  <label class="block text-slate-400 mb-1">选择常用预设伪静态模板</label>
                  <select
                    v-model="activeSite.rewrite_preset"
                    class="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="spa">Vue / React SPA (History 模式 try_files $uri $uri/ /index.html;)</option>
                    <option value="wordpress">WordPress (博客/独立站)</option>
                    <option value="laravel">Laravel / ThinkPHP (现代化 PHP 框架)</option>
                    <option value="typecho">Typecho (轻量博客)</option>
                    <option value="none">自定义 / 关闭伪静态</option>
                  </select>
                </div>

                <div v-if="activeSite.rewrite_preset === 'none'">
                  <label class="block text-slate-400 mb-1">自定义 Nginx Rewrite 指令</label>
                  <textarea
                    v-model="activeSite.custom_rewrite"
                    rows="6"
                    placeholder="location / {&#10;    try_files $uri $uri/ /index.php?$query_string;&#10;}"
                    class="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-emerald-400 font-mono text-[11px] focus:outline-none focus:border-brand-500"
                  ></textarea>
                </div>
              </div>
            </div>

            <!-- TAB 7: 🛡️ 访问保护与安全 (Basic Auth & Security) -->
            <div v-if="currentTab === 'security'" class="space-y-4">
              <div class="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-4">
                <div class="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div>
                    <div class="text-white font-semibold">HTTP Basic Auth 网站密码访问保护</div>
                    <div class="text-[11px] text-slate-400">开启后访问该网站必须输入设定的账号与密码验证才能访问</div>
                  </div>
                  <input type="checkbox" v-model="activeSite.basic_auth_enabled" class="w-4 h-4 rounded text-brand-500" />
                </div>

                <div v-if="activeSite.basic_auth_enabled" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label class="block text-slate-400 mb-1">验证用户名</label>
                    <input v-model="activeSite.basic_auth_user" type="text" placeholder="admin" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500" />
                  </div>
                  <div>
                    <label class="block text-slate-400 mb-1">验证密码</label>
                    <input v-model="activeSite.basic_auth_pass" type="password" placeholder="设置访问密码" class="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-brand-500" />
                  </div>
                </div>

                <div class="flex items-center justify-between pt-3 border-t border-slate-800">
                  <div>
                    <div class="text-white font-semibold">静态图片防盗链保护 (Hotlink Protection)</div>
                    <div class="text-[11px] text-slate-400">禁止外部第三方网站直接盗用本站图片与多媒体资源 (403 Forbidden)</div>
                  </div>
                  <input type="checkbox" v-model="activeSite.hotlink_protection" class="w-4 h-4 rounded text-brand-500" />
                </div>
              </div>
            </div>

            <!-- TAB 8: 📊 独立访问与错误日志 (Logs) -->
            <div v-if="currentTab === 'logs'" class="space-y-3">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="flex items-center gap-2">
                  <button
                    @click="switchLogType('access')"
                    class="px-2.5 py-1 rounded-lg text-xs font-mono transition"
                    :class="logType === 'access' ? 'bg-brand-600 text-slate-950 font-bold' : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'"
                  >
                    访问日志 (access.log)
                  </button>
                  <button
                    @click="switchLogType('error')"
                    class="px-2.5 py-1 rounded-lg text-xs font-mono transition"
                    :class="logType === 'error' ? 'bg-brand-600 text-slate-950 font-bold' : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'"
                  >
                    错误日志 (error.log)
                  </button>
                </div>

                <div class="flex items-center gap-2 flex-1 max-w-xs">
                  <div class="relative w-full">
                    <Search class="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-500" />
                    <input
                      v-model="logSearch"
                      type="text"
                      placeholder="搜索日志关键字 (IP, 404, 500)..."
                      class="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1 text-xs text-white focus:outline-none focus:border-brand-500 font-mono"
                    />
                  </div>
                  <button @click="clearLogs" class="text-rose-400 hover:text-rose-300 flex items-center gap-1 text-xs whitespace-nowrap px-2 py-1 rounded hover:bg-rose-500/10 transition">
                    <Trash2 class="w-3 h-3" />
                    清空
                  </button>
                </div>
              </div>

              <div class="p-3.5 bg-slate-950 rounded-xl font-mono text-[11px] text-slate-300 h-80 overflow-y-auto leading-relaxed border border-slate-800 space-y-1 select-text">
                <div v-for="(line, idx) in filteredSiteLogs" :key="idx" class="whitespace-pre-wrap hover:bg-slate-900/50 px-1 py-0.5 rounded transition">
                  {{ line }}
                </div>
                <div v-if="filteredSiteLogs.length === 0" class="text-slate-500 text-center py-12">
                  {{ logSearch ? '未匹配到包含该关键字的日志' : '暂无日志记录' }}
                </div>
              </div>
            </div>

            <!-- TAB 9: 🛠️ 原生 Nginx 配置 (Raw Config) -->
            <div v-if="currentTab === 'raw'" class="space-y-3">
              <div class="flex items-center justify-between text-slate-400 text-[11px]">
                <span>正在编辑: <strong class="text-brand-400 font-mono">/etc/nginx/conf.d/{{ activeSite.domain }}.conf</strong></span>
                <span class="text-slate-500">保存时将自动执行 nginx -t 语法预检</span>
              </div>
              <textarea
                v-model="rawNginxConf"
                rows="16"
                class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-emerald-400 font-mono text-[11px] leading-relaxed focus:outline-none focus:border-brand-500"
              ></textarea>
            </div>
          </div>

          <!-- Right Bottom Fixed Actions Footer -->
          <div class="px-6 py-3.5 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between shrink-0">
            <div class="text-[11px] text-slate-500 flex items-center gap-1.5 font-mono">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              <span>保存时将自动执行 nginx -t 语法预检并平滑重载</span>
            </div>

            <div class="flex items-center gap-2.5">
              <button
                type="button"
                @click="showSettingsModal = false"
                class="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-bold transition"
              >
                关闭
              </button>
              <button
                v-if="currentTab === 'raw'"
                @click="saveRawNginxConfig"
                :disabled="savingSettings"
                class="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold flex items-center gap-1.5 shadow transition"
              >
                <Loader2 v-if="savingSettings" class="w-3.5 h-3.5 animate-spin" />
                <span>{{ savingSettings ? '保存中...' : '保存原生配置并重载' }}</span>
              </button>
              <button
                v-else
                @click="saveSettings"
                :disabled="savingSettings"
                class="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold flex items-center gap-1.5 shadow-lg shadow-brand-500/20 transition"
              >
                <Loader2 v-if="savingSettings" class="w-3.5 h-3.5 animate-spin" />
                <span>{{ savingSettings ? '保存中...' : '保存设置并重载 Nginx' }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>

    <!-- 3. Delete Site Confirmation Modal -->
    <Modal v-model="showDeleteModal" title="确认删除站点" size="md">
      <div v-if="siteToDelete" class="space-y-4 font-mono text-xs">
        <div class="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-start gap-3">
          <Trash2 class="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />
          <div>
            <div class="font-bold text-white text-sm">危险操作警告</div>
            <p class="text-xs text-rose-300/90 mt-1">
              您正在删除站点 <strong class="text-white underline">{{ siteToDelete.domain }}</strong>。
              此操作将永久移除该站点的 Nginx 虚拟主机配置文件并平滑重载生效。
            </p>
          </div>
        </div>

        <div class="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
          <label class="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              v-model="deleteFilesChecked"
              class="w-4 h-4 rounded text-rose-500 bg-slate-900 border-slate-700 mt-0.5"
            />
            <div class="text-slate-300">
              <span class="font-bold text-rose-400">同时彻底删除网站根目录及物理文件</span>
              <p class="text-[11px] text-slate-500 mt-0.5">物理路径: <code class="text-slate-400">{{ siteToDelete.path }}</code></p>
              <p class="text-[10px] text-amber-400/80 mt-0.5">⚠️ 警告：勾选后根目录内所有源码及数据将直接彻底清除，无法找回！</p>
            </div>
          </label>
        </div>

        <div class="flex justify-end gap-3 pt-2">
          <button
            type="button"
            @click="showDeleteModal = false"
            class="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
          >
            取消
          </button>
          <button
            type="button"
            @click="confirmDeleteSite"
            :disabled="deletingSite"
            class="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center gap-1.5"
          >
            <Loader2 v-if="deletingSite" class="w-3.5 h-3.5 animate-spin" />
            <span>{{ deletingSite ? '删除中...' : '确认彻底删除' }}</span>
          </button>
        </div>
      </div>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import {
  Plus,
  Globe,
  Sliders,
  Trash2,
  Lock,
  Unlock,
  ExternalLink,
  ArrowRightLeft,
  Folder,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Server,
  Code2,
  Terminal,
  Copy,
  Search,
  CheckCircle2,
  FileCode2
} from 'lucide-vue-next'
import Modal from '@/components/Modal.vue'
import { siteApi, SiteItem } from '@/api/site'
import { toast } from '@/composables/useToast'
import { eventBus, EVENTS } from '@/utils/eventBus'

const showCreateModal = ref(false)
const showSettingsModal = ref(false)
const activeSite = ref<SiteItem | null>(null)
const creatingSite = ref(false)
const savingSettings = ref(false)
const loadingDetails = ref(false)
const togglingSiteId = ref<number | null>(null)

const showDeleteModal = ref(false)
const siteToDelete = ref<SiteItem | null>(null)
const deleteFilesChecked = ref(false)
const deletingSite = ref(false)

const currentTab = ref('domains')

interface TabItem {
  key: string
  label: string
  icon: any
  desc: string
  badge?: () => string | number | undefined
  badgeClass?: () => string | undefined
}

interface TabGroup {
  groupName: string
  tabs: TabItem[]
}

const tabGroups: TabGroup[] = [
  {
    groupName: '基础运行',
    tabs: [
      {
        key: 'domains',
        label: '域名绑定',
        icon: Globe,
        desc: '管理虚拟主机的主域名、附加别名与泛域名',
        badge: () => activeSite.value?.domains?.length || 1,
        badgeClass: () => 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
      },
      {
        key: 'directory',
        label: '目录与文档',
        icon: Folder,
        desc: '物理站点根路径、运行子目录与默认入口索引'
      },
      {
        key: 'php',
        label: 'PHP 运行池',
        icon: Server,
        desc: '切换后端 PHP-FPM 套接字或纯静态运行模式',
        badge: () => activeSite.value?.php_version === 'proxy' ? '反代' : (activeSite.value?.php_version === 'static' ? '静态' : activeSite.value?.php_version?.toUpperCase()),
        badgeClass: () => 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
      }
    ]
  },
  {
    groupName: '流量与网络',
    tabs: [
      {
        key: 'proxy',
        label: '反向代理',
        icon: ArrowRightLeft,
        desc: '将外部请求中继转发给本地微服务或 Docker 容器',
        badge: () => activeSite.value?.proxy_enabled ? (activeSite.value?.grpc_enabled ? 'gRPC' : '已开启') : undefined,
        badgeClass: () => activeSite.value?.grpc_enabled ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
      },
      {
        key: 'rewrite',
        label: '伪静态规则',
        icon: Code2,
        desc: 'Nginx URL 重写规则，支持 Vue/React SPA、WordPress、Laravel'
      }
    ]
  },
  {
    groupName: '安全与证书',
    tabs: [
      {
        key: 'ssl',
        label: 'SSL / HTTPS',
        icon: Lock,
        desc: 'HTTPS 证书部署、HTTP/2 加速与 301 强制跳转',
        badge: () => activeSite.value?.ssl_enabled ? 'HTTPS' : '未配置',
        badgeClass: () => activeSite.value?.ssl_enabled ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800 text-slate-400'
      },
      {
        key: 'security',
        label: '访问保护',
        icon: ShieldCheck,
        desc: 'HTTP Basic Auth 身份认证锁与多媒体防盗链防护',
        badge: () => activeSite.value?.basic_auth_enabled ? '加密' : undefined,
        badgeClass: () => 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
      }
    ]
  },
  {
    groupName: '监控与底层',
    tabs: [
      {
        key: 'logs',
        label: '网站日志',
        icon: Terminal,
        desc: '实时查看 access.log 与 error.log 并进行关键字检索'
      },
      {
        key: 'raw',
        label: '原生配置',
        icon: Sliders,
        desc: '直接编辑 /etc/nginx/conf.d/ 虚拟主机配置文件'
      }
    ]
  }
]

const currentTabMeta = computed(() => {
  for (const group of tabGroups) {
    const found = group.tabs.find(t => t.key === currentTab.value)
    if (found) return found
  }
  return tabGroups[0].tabs[0]
})

const newDomainInput = ref('')
const siteLogs = ref<string[]>([])
const logType = ref<'access' | 'error'>('access')
const loadingLogs = ref(false)
const logSearch = ref('')

const filteredSiteLogs = computed(() => {
  if (!logSearch.value.trim()) return siteLogs.value
  const q = logSearch.value.toLowerCase()
  return siteLogs.value.filter(line => line.toLowerCase().includes(q))
})

const rawNginxConf = ref('')

function setAsPrimaryDomain(dom: string) {
  if (!activeSite.value) return
  activeSite.value.domain = dom
  toast.info(`已将 [${dom}] 设为主域名，保存设置后生效`)
}

function copyRawConfig() {
  if (!rawNginxConf.value) return
  navigator.clipboard.writeText(rawNginxConf.value)
  toast.success('Nginx 配置文件已成功复制到剪贴板！')
}

const sslData = reactive({
  cert: '',
  key: '',
  has_cert_files: false,
  loading: false,
  saving: false
})

const sites = ref<SiteItem[]>([])

const createForm = reactive({
  domain: '',
  extraDomains: '',
  path: '',
  port: 80,
  php_version: 'static',
  proxy_pass: '',
  grpc_enabled: false,
  rewrite_preset: 'spa'
})

function getPhpBadgeClass(version: string) {
  if (version === 'static') return 'bg-slate-800 text-slate-300 border-slate-700'
  if (version === 'proxy') return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
  return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
}

function formatPhpVersion(version: string) {
  if (version === 'static') return '静态 SPA'
  if (version === 'proxy') return '反向代理'
  return version.toUpperCase()
}

async function loadSites() {
  try {
    const res = await siteApi.getSites()
    if (res.data && res.data.data) {
      sites.value = res.data.data.list
    }
  } catch (err: any) {
    console.error('Failed to load sites:', err)
  }
}

function openCreateModal() {
  createForm.domain = ''
  createForm.extraDomains = ''
  createForm.path = ''
  createForm.port = 80
  createForm.php_version = 'static'
  createForm.proxy_pass = ''
  createForm.grpc_enabled = false
  createForm.rewrite_preset = 'spa'
  showCreateModal.value = true
}

async function handleCreateSite() {
  creatingSite.value = true
  const extra = createForm.extraDomains.split('\n').map(d => d.trim()).filter(Boolean)
  try {
    await siteApi.createSite({
      domain: createForm.domain,
      domains: extra,
      path: createForm.path || `/www/wwwroot/${createForm.domain}`,
      port: createForm.port || 80,
      php_version: createForm.php_version,
      proxy_enabled: createForm.php_version === 'proxy',
      proxy_pass: createForm.proxy_pass,
      grpc_enabled: createForm.php_version === 'proxy' && createForm.grpc_enabled,
      rewrite_preset: createForm.rewrite_preset
    })
    showCreateModal.value = false
    await loadSites()
    eventBus.emit(EVENTS.SITES_UPDATED)
    toast.success(`站点 [${createForm.domain}] 创建成功并已自动生成 Nginx 虚拟主机！`)
  } catch (err: any) {
    toast.error(`创建站点失败: ${err.message}`)
  } finally {
    creatingSite.value = false
  }
}

async function openSettingsModal(site: SiteItem) {
  loadingDetails.value = true
  currentTab.value = 'domains'
  showSettingsModal.value = true
  try {
    const res = await siteApi.getSiteDetails(site.id)
    if (res.data && res.data.data) {
      activeSite.value = res.data.data
      if (!activeSite.value.domains || activeSite.value.domains.length === 0) {
        activeSite.value.domains = [activeSite.value.domain]
      }
    }
    // Load raw conf
    const confRes = await siteApi.getSiteConfig(site.id)
    rawNginxConf.value = confRes.data?.data?.nginx_conf || ''
    // Load SSL details
    await loadSSLData(site.id)
  } catch (e: any) {
    toast.error(`读取站点详情失败: ${e.message}`)
  } finally {
    loadingDetails.value = false
  }
}

async function loadSSLData(siteId: number) {
  sslData.loading = true
  try {
    const res = await siteApi.getSiteSSL(siteId)
    if (res.data && res.data.data) {
      sslData.cert = res.data.data.cert || ''
      sslData.key = res.data.data.key || ''
      sslData.has_cert_files = res.data.data.has_cert_files || false
    }
  } catch (err: any) {
    console.error('Failed to load SSL data:', err)
  } finally {
    sslData.loading = false
  }
}

async function handleSaveSSL() {
  if (!activeSite.value) return
  sslData.saving = true
  try {
    await siteApi.saveSiteSSL(activeSite.value.id, {
      cert: sslData.cert,
      key: sslData.key,
      ssl_enabled: activeSite.value.ssl_enabled,
      ssl_force_https: activeSite.value.ssl_force_https
    })
    sslData.has_cert_files = !!(sslData.cert && sslData.key)
    toast.success('SSL 证书配置已部署，Nginx 语法验证通过并热重载生效！')
    eventBus.emit(EVENTS.SITES_UPDATED)
    await loadSites()
  } catch (err: any) {
    toast.error(`SSL 部署失败: ${err.message}`)
  } finally {
    sslData.saving = false
  }
}

function addDomain() {
  if (!activeSite.value || !newDomainInput.value.trim()) return
  const d = newDomainInput.value.trim()
  if (!activeSite.value.domains.includes(d)) {
    activeSite.value.domains.push(d)
    newDomainInput.value = ''
    toast.info(`已暂存绑定域名 ${d}，点击保存即可生效`)
  }
}

function removeDomain(index: number) {
  if (!activeSite.value) return
  const removed = activeSite.value.domains.splice(index, 1)
  toast.info(`已移除域名 ${removed[0]}，点击保存即可生效`)
}

async function saveSettings() {
  if (!activeSite.value) return
  savingSettings.value = true
  try {
    await siteApi.updateSiteSettings(activeSite.value.id, activeSite.value)
    toast.success('站点设置已成功保存，Nginx 语法验证通过并已热重载生效！')
    eventBus.emit(EVENTS.SITES_UPDATED)
    await loadSites()
    // Refresh raw conf
    const confRes = await siteApi.getSiteConfig(activeSite.value.id)
    rawNginxConf.value = confRes.data?.data?.nginx_conf || ''
  } catch (e: any) {
    toast.error(`保存失败: ${e.message}`)
  } finally {
    savingSettings.value = false
  }
}

async function saveRawNginxConfig() {
  if (!activeSite.value) return
  savingSettings.value = true
  try {
    await siteApi.saveSiteConfig(activeSite.value.id, rawNginxConf.value)
    toast.success('原生 Nginx 配置验证通过 (nginx -t ok) 并已热重载生效！')
    eventBus.emit(EVENTS.SITES_UPDATED)
    await loadSites()
  } catch (e: any) {
    toast.error(`保存配置失败: ${e.message}`)
  } finally {
    savingSettings.value = false
  }
}

async function switchLogType(type: 'access' | 'error') {
  logType.value = type
  await loadLogs()
}

async function loadLogs() {
  if (!activeSite.value) return
  loadingLogs.value = true
  try {
    const res = await siteApi.getSiteLogs(activeSite.value.id, logType.value)
    siteLogs.value = res.data?.data?.logs || []
  } catch (e: any) {
    console.error('Failed to load logs:', e)
  } finally {
    loadingLogs.value = false
  }
}

async function clearLogs() {
  if (!activeSite.value) return
  if (confirm(`确定要清空该站点的 ${logType.value}.log 吗？`)) {
    try {
      await siteApi.clearSiteLogs(activeSite.value.id, logType.value)
      siteLogs.value = []
      toast.success('日志已清空')
    } catch (e: any) {
      toast.error(`清空失败: ${e.message}`)
    }
  }
}

async function toggleSiteStatus(site: SiteItem) {
  togglingSiteId.value = site.id
  try {
    const res = await siteApi.toggleSite(site.id)
    site.status = res.data?.data?.status || (site.status === 'running' ? 'stopped' : 'running')
    toast.success(`站点 [${site.domain}] 状态已切换为: ${site.status === 'running' ? '运行中' : '已停止'}`)
    eventBus.emit(EVENTS.SITES_UPDATED)
  } catch (e: any) {
    toast.error(`切换站点状态失败: ${e.message}`)
  } finally {
    togglingSiteId.value = null
  }
}

function openDeleteModal(site: SiteItem) {
  siteToDelete.value = site
  deleteFilesChecked.value = false
  showDeleteModal.value = true
}

async function confirmDeleteSite() {
  if (!siteToDelete.value) return
  deletingSite.value = true
  try {
    await siteApi.deleteSite(siteToDelete.value.id, deleteFilesChecked.value)
    showDeleteModal.value = false
    await loadSites()
    eventBus.emit(EVENTS.SITES_UPDATED)
    toast.success(`站点 [${siteToDelete.value.domain}] 已成功删除！`)
  } catch (err: any) {
    toast.error(`删除失败: ${err.message}`)
  } finally {
    deletingSite.value = false
    siteToDelete.value = null
  }
}

onMounted(() => {
  loadSites()
})
</script>
