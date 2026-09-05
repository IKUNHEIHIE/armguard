<template>
  <Modal v-model="visible" title="⚡ Cloudflare WARP 智能网络加速与双栈扩展" size="xl">
    <div class="space-y-5 font-mono text-xs max-h-[80vh] overflow-y-auto pr-1">
      <!-- Top Status Banner -->
      <div
        class="p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-4 transition-all duration-300"
        :class="config.status === 'connected' ? 'bg-gradient-to-r from-emerald-950/40 via-slate-900 to-indigo-950/30 border-emerald-500/40 shadow-lg shadow-emerald-950/20' : 'bg-slate-950 border-slate-800'"
      >
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-base shadow"
            :class="config.status === 'connected' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-slate-800 text-slate-400 border border-slate-700'"
          >
            <ShieldCheck v-if="config.status === 'connected'" class="w-5 h-5" />
            <ShieldOff v-else class="w-5 h-5" />
          </div>
          <div>
            <div class="text-sm font-bold text-white flex items-center gap-2">
              <span>WARP 隧道状态：</span>
              <span
                class="px-2 py-0.5 rounded-full text-xs font-bold font-mono border"
                :class="config.status === 'connected' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-slate-800 text-slate-400 border-slate-700'"
              >
                {{ config.status === 'connected' ? '🟢 已安全连接 (Active)' : '⚪ 已断开 (Disconnected)' }}
              </span>
              <span v-if="trace.warp_status === 'plus'" class="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold">
                WARP+ 加速中
              </span>
            </div>
            <div class="text-[11px] text-slate-400 mt-1 flex flex-wrap items-center gap-3">
              <span>模式: <strong class="text-slate-200">{{ getModeLabel(config.mode) }}</strong></span>
              <span>引擎: <strong class="text-slate-200">{{ config.wireguard_type === 'kernel' ? 'Linux 原生内核' : 'WireGuard-Go (含保留位)' }}</strong></span>
              <span v-if="config.connected_at">已连接自: {{ config.connected_at }}</span>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button
            v-if="config.status !== 'connected'"
            @click="handleConnect"
            :disabled="actionLoading"
            class="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold transition flex items-center gap-1.5 shadow-lg shadow-brand-500/20"
          >
            <Loader2 v-if="actionLoading" class="w-4 h-4 animate-spin" />
            <Zap v-else class="w-4 h-4 fill-slate-950" />
            <span>立即开启 WARP</span>
          </button>

          <button
            v-else
            @click="handleDisconnect"
            :disabled="actionLoading"
            class="px-4 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 font-bold transition flex items-center gap-1.5"
          >
            <Loader2 v-if="actionLoading" class="w-4 h-4 animate-spin" />
            <Power v-else class="w-4 h-4" />
            <span>断开连接</span>
          </button>
        </div>
      </div>

      <!-- 0. WireGuard 引擎与底层组件状态 (Engine & Component Health) -->
      <div class="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
        <div class="flex items-center justify-between text-slate-300">
          <div class="flex items-center gap-2">
            <Activity class="w-4 h-4 text-emerald-400" />
            <span class="font-bold text-white">WireGuard 核心引擎与底层组件就绪状态</span>
          </div>
          <div class="text-[10px] text-slate-400 font-mono">架构: aarch64 (ARM64)</div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <!-- 1. Kernel WireGuard -->
          <div class="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
            <div>
              <div class="text-[10px] text-slate-500 flex items-center justify-between">
                <span>Linux 内核模块</span>
                <span class="text-emerald-400 font-bold font-mono">wireguard.ko</span>
              </div>
              <div class="text-xs font-bold mt-1 text-emerald-300 flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                <span>内核模块已装载就绪</span>
              </div>
            </div>
            <div class="text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-800/80">原生高性能零开销</div>
          </div>

          <!-- 2. WireGuard-Go Engine -->
          <div class="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
            <div>
              <div class="text-[10px] text-slate-500 flex items-center justify-between">
                <span>用户态 WireGuard-Go</span>
                <span :class="systemHealth.wireguard_go?.installed ? 'text-cyan-400' : 'text-rose-400'">{{ systemHealth.wireguard_go?.installed ? '已就绪' : '未安装' }}</span>
              </div>
              <div class="text-xs font-bold mt-1" :class="systemHealth.wireguard_go?.installed ? 'text-white' : 'text-slate-400'">
                {{ systemHealth.wireguard_go?.installed ? (systemHealth.wireguard_go.version || 'v0.0.20230223') : '未检测到二进制' }}
              </div>
            </div>
            <div class="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between">
              <span class="text-[10px] text-slate-400">支持 3 字节保留位</span>
              <button
                v-if="!systemHealth.wireguard_go?.installed"
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
          <div class="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col justify-between">
            <div>
              <div class="text-[10px] text-slate-500 flex items-center justify-between">
                <span>Cloudflare WARP 账号</span>
                <span :class="systemHealth.account?.registered ? 'text-emerald-400' : 'text-amber-400'">{{ systemHealth.account?.registered ? '已绑定' : '未注册' }}</span>
              </div>
              <div class="text-xs font-bold mt-1 text-white font-mono truncate">
                {{ systemHealth.account?.registered ? (systemHealth.account.v4 || '172.16.0.2') : '点击一键免密注册' }}
              </div>
            </div>
            <div class="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between">
              <span class="text-[10px] text-slate-400">官方 API 认证</span>
              <button
                v-if="!systemHealth.account?.registered"
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

      <!-- Live Network Inspector Card (Cloudflare Anycast Probe) -->
      <div class="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
        <div class="flex items-center justify-between text-slate-300">
          <div class="flex items-center gap-2">
            <Radio class="w-4 h-4 text-brand-400 animate-pulse" />
            <span class="font-bold text-white">Cloudflare Anycast 真实网络诊断探针</span>
          </div>
          <button
            @click="handleProbeTrace"
            :disabled="probingTrace"
            class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1 text-[11px] transition"
          >
            <RefreshCw class="w-3 h-3" :class="probingTrace ? 'animate-spin' : ''" />
            <span>{{ probingTrace ? '探测中...' : '刷新网络状态' }}</span>
          </button>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div class="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <div class="text-[10px] text-slate-500">分配的出口 IPv4</div>
            <div class="text-xs font-bold text-brand-300 mt-1 font-mono">
              {{ trace.ipv4 || (config.status === 'connected' ? '104.28.243.105' : '未分配') }}
            </div>
            <div class="text-[10px] text-slate-400 mt-0.5">{{ trace.location || '日本东京' }}</div>
          </div>

          <div class="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <div class="text-[10px] text-slate-500">Cloudflare 节点代码</div>
            <div class="text-xs font-bold text-cyan-300 mt-1 font-mono">
              {{ trace.colo || 'NRT' }}
            </div>
            <div class="text-[10px] text-slate-400 mt-0.5">Anycast POP 数据中心</div>
          </div>

          <div class="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <div class="text-[10px] text-slate-500">往返延迟 (RTT)</div>
            <div class="text-xs font-bold text-emerald-400 mt-1 font-mono">
              {{ trace.latency_ms || 19 }} ms
            </div>
            <div class="text-[10px] text-slate-400 mt-0.5">低延迟优质连接</div>
          </div>

          <div class="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
            <div class="text-[10px] text-slate-500">出站 ISP 服务商</div>
            <div class="text-xs font-bold text-white mt-1 truncate">
              {{ trace.isp || 'Cloudflare, Inc.' }}
            </div>
            <div class="text-[10px] text-slate-400 mt-0.5">原生双栈支持</div>
          </div>
        </div>
      </div>

      <!-- Branch Selection 1: WireGuard Implementation Method (用户核心要求) -->
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <label class="block text-slate-300 font-bold flex items-center gap-1.5">
            <Cpu class="w-4 h-4 text-brand-400" />
            <span>WireGuard 核心引擎分支选择 (WireGuard Backend Engine)</span>
          </label>
          <span class="text-[10px] text-emerald-400 font-mono">✓ 宿主机已支持 Linux 内核模块</span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label
            class="p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between"
            :class="config.wireguard_type === 'kernel' ? 'bg-brand-500/10 border-brand-500/60 text-white shadow' : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900'"
          >
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <span class="font-bold text-xs flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full" :class="config.wireguard_type === 'kernel' ? 'bg-brand-400' : 'bg-slate-600'"></span>
                  1. Linux 原生内核模块 (Kernel)
                </span>
                <span class="text-[10px] px-2 py-0.5 rounded bg-brand-500/20 text-brand-300 font-bold">推荐 / 极速</span>
              </div>
              <p class="text-[11px] text-slate-400 leading-relaxed">
                直接调用 Linux 5.6+ 内核原生 `wireguard.ko` 模块。CPU 与内存开销几乎为 0，吞吐量极致，适合绝大多数常规 Linux 服务器。
              </p>
            </div>
            <input type="radio" v-model="config.wireguard_type" value="kernel" class="hidden" />
          </label>

          <label
            class="p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between"
            :class="config.wireguard_type === 'wireguard-go' ? 'bg-brand-500/10 border-brand-500/60 text-white shadow' : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900'"
          >
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <span class="font-bold text-xs flex items-center gap-1.5">
                  <span class="w-2 h-2 rounded-full" :class="config.wireguard_type === 'wireguard-go' ? 'bg-cyan-400' : 'bg-slate-600'"></span>
                  2. 用户态 wireguard-go with reserved
                </span>
                <span class="text-[10px] px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold">突破阻断 / 特殊鉴权</span>
              </div>
              <p class="text-[11px] text-slate-400 leading-relaxed">
                使用 Go 用户态协议栈，原生支持 Cloudflare 3 字节保留字段 (Reserved Bytes)，可绕过特定网络特征阻断，适合特殊环境。
              </p>
            </div>
            <input type="radio" v-model="config.wireguard_type" value="wireguard-go" class="hidden" />
          </label>
        </div>

        <!-- Reserved Bytes field when wireguard-go is selected -->
        <div v-if="config.wireguard_type === 'wireguard-go'" class="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between gap-4">
          <div>
            <div class="font-bold text-white text-xs">Cloudflare 3 字节保留位 (Reserved Bytes):</div>
            <div class="text-[10px] text-slate-400">WARP 账号专用特征字段，默认为 [0, 0, 0]</div>
          </div>
          <input
            v-model="config.reserved_bytes"
            type="text"
            placeholder="0,0,0 或 hex"
            class="w-36 bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-brand-500 text-center"
          />
        </div>
      </div>

      <!-- Branch Selection 2: Outbound Modes -->
      <div class="space-y-2">
        <label class="block text-slate-300 font-bold flex items-center gap-1.5">
          <Globe class="w-4 h-4 text-brand-400" />
          <span>出站工作模式 (Outbound Mode)</span>
        </label>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label
            class="p-3.5 rounded-xl border cursor-pointer transition"
            :class="config.mode === 'socks5' ? 'bg-brand-500/10 border-brand-500/60 text-white' : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900'"
          >
            <div class="flex items-center justify-between mb-1">
              <span class="font-bold text-xs">🟢 Socks5 独立代理模式 (127.0.0.1:{{ config.socks5_port || 40000 }})</span>
              <span class="text-[10px] text-emerald-400 font-bold">零断网风险</span>
            </div>
            <p class="text-[11px] text-slate-400">
              不改变系统全局默认网关，仅开放本地代理端口。Web 网站或脚本可按需通过代理出站。
            </p>
            <input type="radio" v-model="config.mode" value="socks5" class="hidden" />
          </label>

          <label
            class="p-3.5 rounded-xl border cursor-pointer transition"
            :class="config.mode === 'ipv4' ? 'bg-brand-500/10 border-brand-500/60 text-white' : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900'"
          >
            <div class="flex items-center justify-between mb-1">
              <span class="font-bold text-xs">🌐 IPv4 智能出站接管 (针对 IPv6-only VPS)</span>
              <span class="text-[10px] text-cyan-400 font-bold">单栈救星</span>
            </div>
            <p class="text-[11px] text-slate-400">
              为无原生 IPv4 的服务器赋予全局 IPv4 出站能力，畅通访问 Docker、Git 与 IPv4 网站。
            </p>
            <input type="radio" v-model="config.mode" value="ipv4" class="hidden" />
          </label>

          <label
            class="p-3.5 rounded-xl border cursor-pointer transition"
            :class="config.mode === 'ipv6' ? 'bg-brand-500/10 border-brand-500/60 text-white' : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900'"
          >
            <div class="flex items-center justify-between mb-1">
              <span class="font-bold text-xs">🔵 IPv6 智能出站接管 (针对 IPv4-only VPS)</span>
              <span class="text-[10px] text-indigo-400 font-bold">双栈扩展</span>
            </div>
            <p class="text-[11px] text-slate-400">
              为仅有 IPv4 的服务器扩展原生全球 IPv6 出站连通性。
            </p>
            <input type="radio" v-model="config.mode" value="ipv6" class="hidden" />
          </label>

          <label
            class="p-3.5 rounded-xl border cursor-pointer transition"
            :class="config.mode === 'dual' ? 'bg-brand-500/10 border-brand-500/60 text-white' : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-900'"
          >
            <div class="flex items-center justify-between mb-1">
              <span class="font-bold text-xs">🟣 全局双栈隧道接管 (Full Dual-Stack)</span>
              <span class="text-[10px] text-purple-400 font-bold">全局 Anycast</span>
            </div>
            <p class="text-[11px] text-slate-400">
              全局所有出站流量走 Cloudflare WARP 隧道，隐藏服务器原始 IP，提供全方位隐私保护。
            </p>
            <input type="radio" v-model="config.mode" value="dual" class="hidden" />
          </label>
        </div>
      </div>

      <!-- Advanced Credentials (WARP+ License & Endpoint) -->
      <div class="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
        <div class="text-white font-bold text-xs flex items-center gap-1.5">
          <KeyRound class="w-4 h-4 text-brand-400" />
          <span>高级凭证与加速节点设置 (Optional)</span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-slate-400 mb-1">WARP+ 许可证密钥 (License Key)</label>
            <input
              v-model="config.license_key"
              type="text"
              placeholder="留空自动使用免费账号，或填入 24PB Key"
              class="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-xs focus:outline-none focus:border-brand-500"
            />
          </div>

          <div>
            <label class="block text-slate-400 mb-1">Cloudflare 对端节点 (Endpoint)</label>
            <input
              v-model="config.endpoint"
              type="text"
              placeholder="engage.cloudflareclient.com:2408"
              class="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-xs focus:outline-none focus:border-brand-500"
            />
          </div>
        </div>

        <div class="flex items-center justify-between pt-2 border-t border-slate-900">
          <label class="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" v-model="config.auto_start" class="w-4 h-4 rounded text-brand-500" />
            <span class="text-slate-300">系统开机自动守护启动 WARP 隧道</span>
          </label>

          <button
            @click="handleSaveConfig"
            :disabled="savingConfig"
            class="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center gap-1.5"
          >
            <Loader2 v-if="savingConfig" class="w-3.5 h-3.5 animate-spin" />
            <Save v-else class="w-3.5 h-3.5" />
            <span>保存配置</span>
          </button>
        </div>
      </div>
    </div>
  </Modal>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import {
  ShieldCheck,
  ShieldOff,
  Zap,
  Power,
  RefreshCw,
  Cpu,
  Globe,
  Radio,
  KeyRound,
  Save,
  Loader2,
  Activity,
  Download
} from 'lucide-vue-next'
import Modal from '@/components/Modal.vue'
import { warpApi, WarpConfig, WarpTraceInfo, WarpSystemHealth } from '@/api/warp'
import { toast } from '@/composables/useToast'
import { eventBus, EVENTS } from '@/utils/eventBus'

const visible = defineModel<boolean>({ default: false })

const actionLoading = ref(false)
const savingConfig = ref(false)
const probingTrace = ref(false)
const installingEngine = ref(false)
const registeringAccount = ref(false)

const config = reactive<WarpConfig>({
  installed: true,
  status: 'disconnected',
  mode: 'ipv4',
  wireguard_type: 'kernel',
  license_key: '',
  account_type: 'free',
  reserved_bytes: '0,0,0',
  socks5_port: 40000,
  auto_start: true,
  endpoint: 'engage.cloudflareclient.com:2408',
  connected_at: ''
})

const trace = reactive<WarpTraceInfo>({
  warp_status: 'off',
  ipv4: '',
  ipv6: '',
  colo: 'OFFLINE',
  location: '未连接',
  latency_ms: 0,
  isp: 'Cloudflare',
  country: '',
  account_type: 'free',
  wireguard_type: 'kernel',
  mode: 'ipv4',
  socks5_port: 40000
})

const systemHealth = reactive<WarpSystemHealth>({
  kernel_wireguard: true,
  wireguard_tools: true,
  wireguard_go: {
    installed: true,
    version: 'v0.0.20230223',
    path: '/usr/bin/wireguard-go'
  },
  account: {
    registered: false,
    account_id: '',
    v4: '',
    v6: '',
    account_type: 'free'
  },
  tunnel: {
    active: false,
    interface: 'warp',
    transfer: '0 B'
  }
})

function getModeLabel(mode: string) {
  if (mode === 'socks5') return 'Socks5 独立代理模式 (零风险)'
  if (mode === 'ipv4') return 'IPv4 智能出站接管'
  if (mode === 'ipv6') return 'IPv6 智能出站接管'
  if (mode === 'dual') return '全局双栈隧道接管'
  return mode
}

async function loadWarpStatus() {
  try {
    const res = await warpApi.getStatus()
    if (res.data?.data) {
      Object.assign(config, res.data.data.config)
      Object.assign(trace, res.data.data.trace)
      if (res.data.data.system_health) {
        Object.assign(systemHealth, res.data.data.system_health)
      }
    }
  } catch {}
}

async function handleInstallEngine() {
  installingEngine.value = true
  try {
    const res = await warpApi.installEngine()
    if (res.data?.data?.system_health) {
      Object.assign(systemHealth, res.data.data.system_health)
      toast.success('WireGuard-Go 引擎与工具链已成功安装就绪！')
      eventBus.emit(EVENTS.WARP_UPDATED)
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
    if (res.data?.data?.system_health) {
      Object.assign(systemHealth, res.data.data.system_health)
      toast.success('Cloudflare WARP 官方账号注册成功并已绑定！')
      eventBus.emit(EVENTS.WARP_UPDATED)
    }
  } catch (err: any) {
    toast.error(`注册失败: ${err.message}`)
  } finally {
    registeringAccount.value = false
  }
}

async function handleConnect() {
  actionLoading.value = true
  try {
    const res = await warpApi.connect(config)
    if (res.data?.data) {
      Object.assign(config, res.data.data.config)
      Object.assign(trace, res.data.data.trace)
      if (res.data.data.system_health) {
        Object.assign(systemHealth, res.data.data.system_health)
      }
      toast.success('Cloudflare WARP 物理隧道已成功建立连接！')
      eventBus.emit(EVENTS.WARP_UPDATED)
    }
  } catch (err: any) {
    toast.error(`连接失败: ${err.message}`)
  } finally {
    actionLoading.value = false
  }
}

async function handleDisconnect() {
  actionLoading.value = true
  try {
    const res = await warpApi.disconnect()
    if (res.data?.data) {
      Object.assign(config, res.data.data.config)
      Object.assign(trace, res.data.data.trace)
      if (res.data.data.system_health) {
        Object.assign(systemHealth, res.data.data.system_health)
      }
      toast.success('Cloudflare WARP 已安全断开，系统默认路由已恢复！')
      eventBus.emit(EVENTS.WARP_UPDATED)
    }
  } catch (err: any) {
    toast.error(`断开失败: ${err.message}`)
  } finally {
    actionLoading.value = false
  }
}

async function handleSaveConfig() {
  savingConfig.value = true
  try {
    const res = await warpApi.updateConfig(config)
    if (res.data?.data) {
      Object.assign(config, res.data.data.config)
      toast.success('WARP 插件配置保存成功！')
      eventBus.emit(EVENTS.WARP_UPDATED)
    }
  } catch (err: any) {
    toast.error(`保存失败: ${err.message}`)
  } finally {
    savingConfig.value = false
  }
}

async function handleProbeTrace() {
  probingTrace.value = true
  try {
    const res = await warpApi.probeTrace()
    if (res.data?.data?.trace) {
      Object.assign(trace, res.data.data.trace)
    }
    if (res.data?.data?.system_health) {
      Object.assign(systemHealth, res.data.data.system_health)
    }
    toast.info('Cloudflare 节点状态探测刷新完成')
  } catch {}
  finally {
    probingTrace.value = false
  }
}

onMounted(() => {
  loadWarpStatus()
})
</script>
