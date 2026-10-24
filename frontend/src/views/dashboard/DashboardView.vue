<template>
  <div class="space-y-6">
    <!-- Top Hardware Alert Banner if Throttling or Under-voltage detected -->
    <div
      v-if="!dismissAlert && (systemStore.armThermal.under_voltage === true || systemStore.armThermal.throttled === true)"
      class="p-4 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-200 flex items-center justify-between gap-3 shadow-lg"
    >
      <div class="flex items-center gap-3">
        <AlertTriangle class="w-5 h-5 text-rose-400 shrink-0 animate-bounce" />
        <div>
          <div class="font-bold text-sm">检测到 ARM 硬件异常告警</div>
          <div class="text-xs text-rose-300/80 font-mono mt-0.5">
            <span v-if="systemStore.armThermal.under_voltage === true">⚠️ 供电欠压（Under-voltage detected）：电源输入电压不足，可能引发单板机死机或降频。 </span>
            <span v-if="systemStore.armThermal.throttled === true">🔥 触发温控降频（Frequency throttled）：CPU 核心温度过高，已被动降频保护。</span>
          </div>
        </div>
      </div>
      <button
        @click="dismissAlert = true"
        class="text-xs px-2.5 py-1 bg-rose-900/60 hover:bg-rose-800 rounded-lg border border-rose-700 transition"
      >
        已了解
      </button>
    </div>

    <!-- Metric Gauges Row -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      <!-- CPU Usage -->
      <GaugeCard
        title="CPU 使用率"
        :value-text="systemStore.realtime.cpu.percent !== null ? `${systemStore.realtime.cpu.percent.toFixed(1)}%` : '--'"
        :percent="systemStore.realtime.cpu.percent ?? 0"
        :sub-text="`${systemStore.info?.cpu_cores ?? '--'} 核心 / ${systemStore.realtime.cpu.frequency_mhz !== null ? systemStore.realtime.cpu.frequency_mhz + ' MHz' : '频率未知'}`"
        variant="brand"
      >
        <template #icon>
          <Cpu class="w-5 h-5" />
        </template>
      </GaugeCard>

      <!-- RAM Usage -->
      <GaugeCard
        title="物理内存 (RAM)"
        :value-text="systemStore.realtime.memory.percent !== null ? `${systemStore.realtime.memory.percent.toFixed(1)}%` : '--'"
        :percent="systemStore.realtime.memory.percent ?? 0"
        :sub-text="`${formatBytes(systemStore.realtime.memory.used)} / ${formatBytes(systemStore.realtime.memory.total)} (Swap: ${systemStore.realtime.memory.swap_total !== null ? (systemStore.realtime.memory.swap_total > 0 ? `${formatBytes(systemStore.realtime.memory.swap_used)}/${formatBytes(systemStore.realtime.memory.swap_total)}` : '未启用') : '未知'})`"
        variant="cyan"
      >
        <template #icon>
          <Microchip class="w-5 h-5" />
        </template>
      </GaugeCard>

      <!-- ARM Thermal / Temperature -->
      <GaugeCard
        title="ARM 核心温度"
        :value-text="systemStore.armThermal.temp_c !== null && systemStore.armThermal.temp_c !== undefined ? `${systemStore.armThermal.temp_c.toFixed(1)} °C` : '不可用'"
        :percent="systemStore.armThermal.temp_c !== null && systemStore.armThermal.temp_c !== undefined ? Math.min(100, (systemStore.armThermal.temp_c / 85) * 100) : 0"
        percent-label="发热比例 (最高85°C)"
        :sub-text="systemStore.armThermal.voltage_v !== null && systemStore.armThermal.voltage_v !== undefined ? `核心电压: ${systemStore.armThermal.voltage_v.toFixed(2)}V` : (systemStore.armThermal.temp_source ? `来源: ${systemStore.armThermal.temp_source}` : '核心电压: 不支持读取')"
        :variant="getTempVariant(systemStore.armThermal.temp_c)"
      >
        <template #icon>
          <Flame class="w-5 h-5" />
        </template>
      </GaugeCard>

      <!-- Disk Usage -->
      <GaugeCard
        title="主磁盘存储"
        :value-text="systemStore.realtime.disk.percent !== null ? `${systemStore.realtime.disk.percent.toFixed(1)}%` : '--'"
        :percent="systemStore.realtime.disk.percent ?? 0"
        :sub-text="`${formatBytes(systemStore.realtime.disk.used)} / ${formatBytes(systemStore.realtime.disk.total)}${systemStore.realtime.disk.read_bytes_sec !== null ? ` · R:${formatNetworkSpeed(systemStore.realtime.disk.read_bytes_sec)} W:${formatNetworkSpeed(systemStore.realtime.disk.write_bytes_sec)}` : ''}`"
        variant="indigo"
      >
        <template #icon>
          <HardDrive class="w-5 h-5" />
        </template>
      </GaugeCard>
    </div>

    <!-- ARM Hardware Exclusive Diagnostic Card + Network I/O -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- ARM Exclusive Hardware Diagnostics (2 cols) -->
      <div class="lg:col-span-2 glass-panel p-6 rounded-2xl border border-slate-800">
        <div class="flex items-center justify-between pb-4 mb-4 border-b border-slate-800/80">
          <div class="flex items-center gap-2.5">
            <div class="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <Zap class="w-4 h-4" />
            </div>
            <div>
              <h2 class="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                ARM 硬件专属传感器诊断
                <span class="text-[10px] px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 font-mono">
                  {{ systemStore.armThermal.throttle_source || 'thermal / cpufreq' }}
                </span>
              </h2>
              <p class="text-xs text-slate-400 font-mono">
                实时硬件状态、电源电压与芯片温控机制
                <span v-if="systemStore.realtime.timestamp" class="ml-2 text-slate-500">
                  (采集: {{ new Date(systemStore.realtime.timestamp).toLocaleTimeString() }})
                </span>
                <span v-if="systemStore.isStale" class="ml-2 text-amber-400">[数据已过期]</span>
              </p>
            </div>
          </div>
          <span class="text-xs font-mono px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-300">
            架构: {{ systemStore.info?.arch || '未知' }}
          </span>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <!-- Board model -->
          <div class="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800/80">
            <div class="text-[11px] text-slate-400 mb-1">主板芯片型号</div>
            <div class="text-xs font-bold text-slate-100 truncate" :title="systemStore.info?.arm_board_model || systemStore.armThermal.board_model || '未知型号'">
              {{ systemStore.info?.arm_board_model || systemStore.armThermal.board_model || '未知型号' }}
            </div>
          </div>

          <!-- Voltage -->
          <div class="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800/80">
            <div class="text-[11px] text-slate-400 mb-1">供电状态</div>
            <div
              class="flex items-center gap-1.5 text-xs font-bold font-mono"
              :class="systemStore.armThermal.under_voltage === true ? 'text-rose-400' : (systemStore.armThermal.under_voltage === false ? 'text-emerald-400' : 'text-slate-400')"
            >
              <span
                class="w-2 h-2 rounded-full"
                :class="systemStore.armThermal.under_voltage === true ? 'bg-rose-500' : (systemStore.armThermal.under_voltage === false ? 'bg-emerald-400' : 'bg-slate-500')"
              ></span>
              <span v-if="systemStore.armThermal.under_voltage === true">欠压异常</span>
              <span v-else-if="systemStore.armThermal.under_voltage === false">
                电压正常{{ systemStore.armThermal.voltage_v !== null && systemStore.armThermal.voltage_v !== undefined ? ` (${systemStore.armThermal.voltage_v.toFixed(2)}V)` : '' }}
              </span>
              <span v-else>不支持读取</span>
            </div>
          </div>

          <!-- Throttling state -->
          <div class="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800/80">
            <div class="text-[11px] text-slate-400 mb-1">CPU 降频检测</div>
            <div
              class="flex items-center gap-1.5 text-xs font-bold font-mono"
              :class="systemStore.armThermal.throttled === true ? 'text-amber-400' : (systemStore.armThermal.throttled === false ? 'text-emerald-400' : 'text-slate-400')"
            >
              <span
                class="w-2 h-2 rounded-full"
                :class="systemStore.armThermal.throttled === true ? 'bg-amber-500' : (systemStore.armThermal.throttled === false ? 'bg-emerald-400' : 'bg-slate-500')"
              ></span>
              <span v-if="systemStore.armThermal.throttled === true">已被动降频</span>
              <span v-else-if="systemStore.armThermal.throttled === false">未降频</span>
              <span v-else>不支持 (无 vcgencmd)</span>
            </div>
          </div>

          <!-- Governor -->
          <div class="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800/80">
            <div class="text-[11px] text-slate-400 mb-1">调频策略 (Governor)</div>
            <div class="text-xs font-mono font-bold text-cyan-400 truncate" :title="cpuPolicySummary">
              {{ systemStore.armThermal.governor || systemStore.realtime.cpu.governor || '不支持 / 未知' }}
            </div>
          </div>
        </div>

        <!-- ECharts 5.5 Realtime Telemetry Area Chart -->
        <TelemetryChart :embedded="true" />
      </div>

      <!-- Network I/O & System Overview (1 col) -->
      <div class="glass-panel p-6 rounded-2xl border border-slate-800 flex flex-col justify-between">
        <div>
          <div class="flex items-center justify-between pb-3 mb-4 border-b border-slate-800/80">
            <h2 class="text-sm font-bold text-white flex items-center gap-2">
              <Activity class="w-4 h-4 text-cyan-400" />
              实时网络 I/O 与负载
            </h2>
            <span class="text-xs font-mono text-cyan-400 truncate max-w-[160px]" :title="systemStore.info?.distribution || '未知发行版'">
              {{ systemStore.info?.distribution || '未知发行版' }}
            </span>
          </div>

          <div class="space-y-4">
            <!-- Downlink -->
            <div class="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <div class="flex items-center justify-between text-xs mb-1">
                <span class="text-slate-400 flex items-center gap-1.5">
                  <ArrowDownLeft class="w-3.5 h-3.5 text-emerald-400" />
                  实时下行 (RX)
                </span>
                <span class="font-mono font-bold text-emerald-400 text-sm tabular-nums">
                  {{ formatNetworkSpeed(systemStore.realtime.network.rx_bytes_sec) }}
                </span>
              </div>
              <div class="text-[10px] text-slate-500 font-mono text-right tabular-nums">
                累计流入: {{ formatBytes(systemStore.realtime.network.total_rx_bytes) }}
              </div>
            </div>

            <!-- Uplink -->
            <div class="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <div class="flex items-center justify-between text-xs mb-1">
                <span class="text-slate-400 flex items-center gap-1.5">
                  <ArrowUpRight class="w-3.5 h-3.5 text-cyan-400" />
                  实时上行 (TX)
                </span>
                <span class="font-mono font-bold text-cyan-400 text-sm tabular-nums">
                  {{ formatNetworkSpeed(systemStore.realtime.network.tx_bytes_sec) }}
                </span>
              </div>
              <div class="text-[10px] text-slate-500 font-mono text-right tabular-nums">
                累计流出: {{ formatBytes(systemStore.realtime.network.total_tx_bytes) }}
              </div>
            </div>

            <!-- System Load -->
            <div class="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
              <div class="text-xs text-slate-400 mb-1.5">系统平均负载 (1 / 5 / 15 分钟)</div>
              <div class="flex items-center gap-3 font-mono font-bold text-sm text-slate-200">
                <span class="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 tabular-nums">{{ formatLoad(systemStore.realtime.load_avg[0]) }}</span>
                <span class="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 tabular-nums">{{ formatLoad(systemStore.realtime.load_avg[1]) }}</span>
                <span class="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 tabular-nums">{{ formatLoad(systemStore.realtime.load_avg[2]) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Kernel & System Specs -->
        <div class="pt-4 border-t border-slate-800 text-[11px] font-mono text-slate-400 space-y-1">
          <div><span class="text-slate-500">内核:</span> {{ systemStore.info?.kernel || '未知' }}</div>
          <div><span class="text-slate-500">CPU:</span> {{ systemStore.info?.cpu_model || '未知型号' }}</div>
          <div v-if="cpuPolicySummary"><span class="text-slate-500">集群:</span> {{ cpuPolicySummary }}</div>
        </div>
      </div>
    </div>

    <!-- Pinned Core Services & Applications (Synced with AppStore "首页显示" switches) -->
    <div class="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
      <div class="flex items-center justify-between pb-3 border-b border-slate-800/80">
        <div class="flex items-center gap-2">
          <AppWindow class="w-4 h-4 text-brand-400" />
          <h2 class="text-sm font-bold text-white">快捷常用软件与核心服务监控</h2>
          <span class="text-[10px] text-slate-500 font-mono">(可在软件商店自定义「首页显示」)</span>
        </div>
        <button
          @click="loadPinnedApps"
          title="刷新服务状态"
          class="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition"
        >
          <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': loadingPinnedApps }" />
        </button>
      </div>

      <div v-if="pinnedApps.length === 0" class="p-6 text-center text-slate-500 font-mono text-xs rounded-xl bg-slate-950/60 border border-slate-800">
        暂无首页展示的软件。前往「软件商店」勾选「首页显示」即可在此处快速监控与控制！
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono text-xs">
        <div
          v-for="app in pinnedApps"
          :key="app.key"
          class="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 transition space-y-3"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <span class="text-2xl">{{ app.icon || '📦' }}</span>
              <div>
                <div class="text-sm font-bold text-white">{{ app.name }}</div>
                <div class="text-[10px] text-slate-500">{{ app.current_version || app.category }}</div>
              </div>
            </div>
            <span
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border"
              :class="app.service_status === 'running' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'"
            >
              <span class="w-1.5 h-1.5 rounded-full" :class="app.service_status === 'running' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'"></span>
              {{ app.service_status === 'running' ? '运行中' : '已停止' }}
            </span>
          </div>

          <div class="flex items-center justify-between pt-2 border-t border-slate-800/60 text-[11px]">
            <button
              v-if="app.service_status === 'running'"
              @click="handleRestartService(app)"
              :disabled="actionLoadingKey === app.key"
              class="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-cyan-300 border border-slate-800 flex items-center gap-1 transition"
            >
              <RefreshCw class="w-3 h-3" :class="{ 'animate-spin': actionLoadingKey === app.key }" />
              重启
            </button>
            <button
              v-else
              @click="handleStartService(app)"
              :disabled="actionLoadingKey === app.key"
              class="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 transition"
            >
              <Play class="w-3 h-3" />
              启动
            </button>

            <button
              @click="goToAppStore"
              class="text-slate-400 hover:text-brand-300 transition text-[11px]"
            >
              管理 &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Process Top Table -->
    <div class="glass-panel p-6 rounded-2xl border border-slate-800">
      <div class="flex items-center justify-between pb-4 mb-4 border-b border-slate-800/80">
        <div class="flex items-center gap-2">
          <Layers class="w-4 h-4 text-brand-400" />
          <h2 class="text-sm font-bold text-white">系统进程 Top 列表</h2>
        </div>
        <div class="flex items-center gap-2">
          <button
            @click="sortBy = 'cpu'; loadProcesses()"
            class="px-2.5 py-1 rounded-lg text-xs font-mono transition"
            :class="sortBy === 'cpu' ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30' : 'bg-slate-900 text-slate-400 hover:text-slate-200'"
          >
            按 CPU 排序
          </button>
          <button
            @click="sortBy = 'mem'; loadProcesses()"
            class="px-2.5 py-1 rounded-lg text-xs font-mono transition"
            :class="sortBy === 'mem' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'bg-slate-900 text-slate-400 hover:text-slate-200'"
          >
            按 内存 排序
          </button>
          <button
            @click="loadProcesses"
            title="刷新进程"
            class="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition"
          >
            <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': loadingProcesses }" />
          </button>
        </div>
      </div>

      <!-- Process Table -->
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs font-mono">
          <thead>
            <tr class="text-slate-400 border-b border-slate-800/80 pb-2">
              <th class="py-2.5 px-3">PID</th>
              <th class="py-2.5 px-3">进程名</th>
              <th class="py-2.5 px-3">用户</th>
              <th class="py-2.5 px-3">CPU %</th>
              <th class="py-2.5 px-3">内存 %</th>
              <th class="py-2.5 px-3">内存占用</th>
              <th class="py-2.5 px-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/40">
            <tr v-for="proc in processes" :key="proc.pid" class="hover:bg-slate-800/30 transition">
              <td class="py-2.5 px-3 text-slate-400 tabular-nums">{{ proc.pid }}</td>
              <td class="py-2.5 px-3 font-semibold text-slate-200 flex items-center gap-1.5">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                <span class="truncate max-w-[220px]" :title="proc.name || proc.command">{{ proc.name || proc.command || 'process' }}</span>
              </td>
              <td class="py-2.5 px-3 text-slate-400">{{ proc.user }}</td>
              <td class="py-2.5 px-3 text-brand-400 font-bold tabular-nums">{{ proc.cpu_percent.toFixed(1) }}%</td>
              <td class="py-2.5 px-3 text-cyan-400 font-bold tabular-nums">{{ proc.mem_percent.toFixed(1) }}%</td>
              <td class="py-2.5 px-3 text-slate-300 tabular-nums">{{ formatBytes(proc.mem_bytes) }}</td>
              <td class="py-2.5 px-3 text-right">
                <button
                  @click="killProcess(proc.pid, proc.name)"
                  class="px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/25 text-rose-400 border border-rose-500/20 text-[11px] transition"
                >
                  结束
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  Cpu,
  Flame,
  HardDrive,
  Activity,
  Zap,
  Layers,
  RefreshCw,
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  AppWindow,
  Play
} from 'lucide-vue-next'
import Microchip from '@/components/icons/Microchip.vue'
import GaugeCard from '@/components/GaugeCard.vue'
import TelemetryChart from '@/components/TelemetryChart.vue'
import { useSystemStore } from '@/stores/system'
import { systemApi, ProcessItem } from '@/api/system'
import { appStoreApi, AppMarketItem } from '@/api/appstore'
import { useToast, toast } from '@/composables/useToast'

const router = useRouter()
const systemStore = useSystemStore()
const dismissAlert = ref(false)
const sortBy = ref<'cpu' | 'mem'>('cpu')
const loadingProcesses = ref(false)

const pinnedApps = ref<AppMarketItem[]>([])
const loadingPinnedApps = ref(false)
const actionLoadingKey = ref('')

async function loadPinnedApps() {
  loadingPinnedApps.value = true
  try {
    const raw = localStorage.getItem('armguard_home_apps')
    const keys: string[] = raw ? JSON.parse(raw) : ['nginx', 'mysql', 'redis', 'warp']
    const res = await appStoreApi.getMarketList()
    if (res.data?.data?.list) {
      const allApps = res.data.data.list
      pinnedApps.value = allApps.filter((a: AppMarketItem) => keys.includes(a.key))
    }
  } catch (e) {
    console.error('Failed to load pinned apps:', e)
  } finally {
    loadingPinnedApps.value = false
  }
}

async function handleRestartService(app: AppMarketItem) {
  actionLoadingKey.value = app.key
  try {
    await appStoreApi.controlAppService(app.key, 'restart')
    toast.success(`服务 [${app.name}] 已成功平滑重启！`)
    await loadPinnedApps()
  } catch (e: any) {
    toast.error(`重启服务失败: ${e.message}`)
  } finally {
    actionLoadingKey.value = ''
  }
}

async function handleStartService(app: AppMarketItem) {
  actionLoadingKey.value = app.key
  try {
    await appStoreApi.controlAppService(app.key, 'start')
    toast.success(`服务 [${app.name}] 已启动！`)
    await loadPinnedApps()
  } catch (e: any) {
    toast.error(`启动服务失败: ${e.message}`)
  } finally {
    actionLoadingKey.value = ''
  }
}

function goToAppStore() {
  router.push('/appstore')
}

const processes = ref<ProcessItem[]>([])

const cpuPolicySummary = computed(() => {
  const policies = systemStore.realtime.cpu.policies
  if (!policies || !policies.length) return ''
  return policies
    .map(p => {
      const cpuRange = p.cpus.length > 1 ? `CPU${p.cpus[0]}-${p.cpus[p.cpus.length - 1]}` : `CPU${p.cpus[0] ?? 0}`
      const freq = p.cur_mhz ?? p.max_mhz
      const max = p.max_mhz
      return `${cpuRange}: ${freq !== null ? freq + 'MHz' : '--'}${max !== null && freq !== max ? ` (上限 ${max}MHz)` : ''}`
    })
    .join(' · ')
})

function formatLoad(val?: number | null): string {
  if (val === null || val === undefined || !Number.isFinite(val)) return '--'
  return val.toFixed(2)
}

function getTempVariant(temp?: number | null): 'brand' | 'amber' | 'rose' {
  if (temp === null || temp === undefined || !Number.isFinite(temp)) return 'brand'
  if (temp >= 70) return 'rose'
  if (temp >= 55) return 'amber'
  return 'brand'
}

function formatBytes(bytes?: number | null): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return '--'
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function formatNetworkSpeed(bytesSec?: number | null): string {
  if (bytesSec === null || bytesSec === undefined || !Number.isFinite(bytesSec)) return '--'
  if (bytesSec === 0) return '0 KB/s'
  const kb = bytesSec / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB/s`
  return `${(kb / 1024).toFixed(2)} MB/s`
}

async function loadProcesses() {
  loadingProcesses.value = true
  try {
    const res = await systemApi.getProcesses(sortBy.value, 15)
    if (res.data.code === 0 && Array.isArray(res.data.data?.list)) {
      processes.value = res.data.data.list
    }
  } catch {
    processes.value = []
  } finally {
    loadingProcesses.value = false
  }
}

async function killProcess(pid: number, name: string) {
  if (confirm(`确定要强制结束进程 [${name}] (PID: ${pid}) 吗？`)) {
    try {
      await systemApi.killProcess(pid)
      processes.value = processes.value.filter(p => p.pid !== pid)
      toast.success(`进程 [${name}] (PID: ${pid}) 已被成功终止`)
      loadProcesses()
    } catch (e: any) {
      toast.error(`结束进程失败: ${e.message}`)
    }
  }
}

onMounted(() => {
  systemStore.startMonitoring()
  loadProcesses()
  loadPinnedApps()
})

onUnmounted(() => {
  systemStore.stopMonitoring()
})
</script>
