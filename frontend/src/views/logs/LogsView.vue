<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { logsApi, type OperationLog } from '@/api/logs'
import { siteApi, type SiteItem } from '@/api/site'

type LogTab = 'operation' | 'system' | 'site'

const activeTab = ref<LogTab>('operation')
const loading = ref(false)
const errorMessage = ref('')

// Operation logs state (pagination + filter)
const operationLogs = ref<OperationLog[]>([])
const opTotal = ref(0)
const opPage = ref(1)
const opPageSize = ref(20)
const opActionFilter = ref('')
const totalPages = computed(() => Math.max(1, Math.ceil(opTotal.value / opPageSize.value)))

// System logs state
const systemService = ref('all')
const systemLines = ref(100)
const systemLogs = ref<string[]>([])
const systemEmpty = ref(false)

const serviceOptions = [
  { value: 'all', label: '全部系统服务 (all)' },
  { value: 'armguard', label: 'ArmGuard 面板 (armguard)' },
  { value: 'nginx', label: 'Nginx (nginx)' },
  { value: 'ssh', label: 'SSH 服务 (ssh)' },
  { value: 'docker', label: 'Docker (docker)' },
  { value: 'mariadb', label: 'MariaDB (mariadb)' },
  { value: 'mysql', label: 'MySQL (mysql)' },
  { value: 'redis-server', label: 'Redis (redis-server)' },
  { value: 'fail2ban', label: 'Fail2ban (fail2ban)' }
]

// Site logs state
const sites = ref<SiteItem[]>([])
const selectedSiteId = ref<number | null>(null)
const siteLogType = ref<'access' | 'error'>('access')
const siteLines = ref(200)
const siteLogs = ref<string[]>([])
const siteLogFile = ref('')
const siteLogExists = ref(true)

async function loadSites() {
  try {
    const res = await siteApi.getSites(1, 100)
    const list = res.data?.data?.list || []
    sites.value = list
    if (selectedSiteId.value === null && list.length > 0) {
      selectedSiteId.value = list[0].id
    }
  } catch {
    sites.value = []
  }
}

async function loadLogs() {
  loading.value = true
  errorMessage.value = ''
  try {
    if (activeTab.value === 'operation') {
      const response = await logsApi.getOperationLogs(opPage.value, opPageSize.value, opActionFilter.value.trim())
      const payload = response.data.data
      operationLogs.value = payload.list || []
      opTotal.value = payload.total ?? operationLogs.value.length
    } else if (activeTab.value === 'system') {
      const response = await logsApi.getSystemLogs(systemService.value, systemLines.value)
      const payload = response.data.data
      systemLogs.value = payload.logs || []
      systemEmpty.value = Boolean(payload.empty) || systemLogs.value.length === 0
    } else if (activeTab.value === 'site') {
      if (!sites.value.length) {
        await loadSites()
      }
      if (selectedSiteId.value === null) {
        siteLogs.value = []
        siteLogFile.value = ''
        return
      }
      const response = await logsApi.getSiteLogs(selectedSiteId.value, siteLogType.value, siteLines.value)
      const payload = response.data.data
      siteLogs.value = payload.logs || []
      siteLogFile.value = payload.file || ''
      siteLogExists.value = payload.exists !== false
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '日志加载失败'
  } finally {
    loading.value = false
  }
}

function selectTab(tab: LogTab) {
  activeTab.value = tab
  void loadLogs()
}

function applyOpFilter() {
  opPage.value = 1
  void loadLogs()
}

function changeOpPage(nextPage: number) {
  if (nextPage < 1 || nextPage > totalPages.value) return
  opPage.value = nextPage
  void loadLogs()
}

onMounted(() => {
  void loadLogs()
})
</script>

<template>
  <div class="space-y-6" :aria-busy="loading">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 class="text-lg font-bold text-white">日志中心</h2>
        <p class="text-xs text-slate-400">查看面板操作审计、systemd 系统日志与 Nginx 站点日志</p>
      </div>
      <button
        :disabled="loading"
        @click="loadLogs"
        class="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold text-xs disabled:opacity-50"
      >
        {{ loading ? '加载中…' : '刷新' }}
      </button>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        v-for="tab in ([
          { key: 'operation', label: '面板操作审计' },
          { key: 'system', label: '系统服务日志 (journalctl)' },
          { key: 'site', label: '网站访问与错误日志' }
        ] as const)"
        :key="tab.key"
        :disabled="loading"
        @click="selectTab(tab.key)"
        :aria-pressed="activeTab === tab.key"
        class="px-4 py-2 rounded-xl border text-xs disabled:opacity-50"
        :class="activeTab === tab.key ? 'border-brand-500 text-brand-400 bg-brand-500/10' : 'border-slate-700 text-slate-400'"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Filter Controls -->
    <div v-if="activeTab === 'operation'" class="flex flex-wrap items-center gap-3 text-xs">
      <input
        v-model="opActionFilter"
        type="text"
        placeholder="按操作、目标或用户名筛选…"
        @keyup.enter="applyOpFilter"
        class="bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 w-64"
      />
      <select
        v-model.number="opPageSize"
        @change="applyOpFilter"
        class="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
      >
        <option :value="20">每页 20 条</option>
        <option :value="50">每页 50 条</option>
        <option :value="100">每页 100 条</option>
      </select>
      <button
        :disabled="loading"
        @click="applyOpFilter"
        class="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
      >
        筛选
      </button>
      <span class="text-slate-400 ml-auto font-mono">共 {{ opTotal }} 条记录</span>
    </div>

    <div v-else-if="activeTab === 'system'" class="flex flex-wrap items-center gap-3 text-xs">
      <label class="text-slate-400">服务单元:</label>
      <select
        v-model="systemService"
        @change="loadLogs"
        class="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
      >
        <option v-for="opt in serviceOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
      </select>
      <label class="text-slate-400">行数:</label>
      <select
        v-model.number="systemLines"
        @change="loadLogs"
        class="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
      >
        <option :value="50">最近 50 行</option>
        <option :value="100">最近 100 行</option>
        <option :value="200">最近 200 行</option>
        <option :value="500">最近 500 行</option>
      </select>
    </div>

    <div v-else-if="activeTab === 'site'" class="flex flex-wrap items-center gap-3 text-xs">
      <label class="text-slate-400">站点:</label>
      <select
        v-model.number="selectedSiteId"
        @change="loadLogs"
        class="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
      >
        <option v-if="!sites.length" :value="null">暂无站点</option>
        <option v-for="s in sites" :key="s.id" :value="s.id">{{ s.domain }} (#{{ s.id }})</option>
      </select>
      <label class="text-slate-400">类型:</label>
      <select
        v-model="siteLogType"
        @change="loadLogs"
        class="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
      >
        <option value="access">访问日志 (access.log)</option>
        <option value="error">错误日志 (error.log)</option>
      </select>
      <label class="text-slate-400">行数:</label>
      <select
        v-model.number="siteLines"
        @change="loadLogs"
        class="bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono"
      >
        <option :value="100">最近 100 行</option>
        <option :value="200">最近 200 行</option>
        <option :value="500">最近 500 行</option>
      </select>
      <span v-if="siteLogFile" class="text-slate-500 font-mono ml-auto">{{ siteLogFile }}</span>
    </div>

    <div
      v-if="errorMessage"
      role="alert"
      class="p-4 rounded-xl bg-rose-950/60 border border-rose-800 text-xs text-rose-300 font-mono"
    >
      {{ errorMessage }}
    </div>

    <div v-else-if="activeTab === 'operation'" class="space-y-3">
      <div class="glass-panel rounded-2xl border border-slate-800 overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead class="bg-slate-950/60 text-slate-400">
            <tr>
              <th class="p-4">时间</th>
              <th class="p-4">用户</th>
              <th class="p-4">操作</th>
              <th class="p-4">目标</th>
              <th class="p-4">来源 IP</th>
              <th class="p-4">状态</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800 text-slate-300 font-mono">
            <tr v-for="log in operationLogs" :key="log.id">
              <td class="p-4 whitespace-nowrap">{{ log.created_at }}</td>
              <td class="p-4">{{ log.username }}</td>
              <td class="p-4">{{ log.action }}</td>
              <td class="p-4 break-all">{{ log.target }}</td>
              <td class="p-4 whitespace-nowrap">{{ log.ip }}</td>
              <td class="p-4">
                <span
                  class="px-2 py-0.5 rounded text-[10px]"
                  :class="log.status === 'success' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'"
                >
                  {{ log.status }}
                </span>
              </td>
            </tr>
            <tr v-if="!loading && !operationLogs.length">
              <td colspan="6" class="p-6 text-center text-slate-500">暂无匹配的操作日志</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="opTotal > opPageSize" class="flex items-center justify-end gap-2 text-xs font-mono">
        <button
          :disabled="loading || opPage <= 1"
          @click="changeOpPage(opPage - 1)"
          class="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 disabled:opacity-40"
        >
          上一页
        </button>
        <span class="text-slate-400">第 {{ opPage }} / {{ totalPages }} 页</span>
        <button
          :disabled="loading || opPage >= totalPages"
          @click="changeOpPage(opPage + 1)"
          class="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-300 disabled:opacity-40"
        >
          下一页
        </button>
      </div>
    </div>

    <pre
      v-else-if="activeTab === 'system'"
      class="glass-panel p-4 rounded-2xl border border-slate-800 text-xs text-slate-300 font-mono overflow-auto max-h-[70vh] whitespace-pre-wrap break-all"
    >{{ systemLogs.length ? systemLogs.join('\n') : (loading ? '加载中…' : (systemEmpty ? '当前筛选条件下暂无系统日志记录' : '暂无系统日志')) }}</pre>

    <pre
      v-else
      class="glass-panel p-4 rounded-2xl border border-slate-800 text-xs text-slate-300 font-mono overflow-auto max-h-[70vh] whitespace-pre-wrap break-all"
    >{{ siteLogs.length ? siteLogs.join('\n') : (loading ? '加载中…' : (!siteLogExists ? '站点日志文件尚未生成' : '站点日志当前为空')) }}</pre>
  </div>
</template>
