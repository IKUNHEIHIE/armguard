<template>
  <div class="space-y-6">
    <!-- Header with Quick Navigation & Action Button -->
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-3">
          <h2 class="text-lg font-bold text-white tracking-tight flex items-center gap-2">
            四层端口转发 (Layer 4 Stream)
            <span class="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-mono">
              ngx_stream_core
            </span>
          </h2>

          <!-- Navigation Pills: L7 Sites vs L4 Stream -->
          <div class="flex items-center p-0.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono">
            <RouterLink
              to="/sites"
              class="px-2.5 py-1 rounded-lg text-slate-400 hover:text-slate-200 transition"
            >
              七层网站 (HTTP/HTTPS)
            </RouterLink>
            <span class="px-2.5 py-1 rounded-lg bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30 shadow-sm">
              四层转发 (TCP/UDP)
            </span>
          </div>
        </div>
        <p class="text-xs text-slate-400 font-mono mt-1">
          基于 Linux Nginx Stream 内核级的高性能四层数据流代理，支持 MySQL、Redis、SSH、DNS、游戏及自定义 TCP/UDP 服务中继
        </p>
      </div>

      <div class="flex items-center gap-3">
        <button
          @click="loadRules"
          class="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
          title="刷新列表"
        >
          <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': loading }" />
        </button>
        <button
          @click="openCreateModal"
          class="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition shadow-lg shadow-purple-500/20"
        >
          <Plus class="w-4 h-4" />
          新建转发规则
        </button>
      </div>
    </div>

    <!-- Quick Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 font-mono">
      <div class="glass-panel p-4 rounded-2xl border border-slate-800 flex items-center gap-3.5">
        <div class="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center shrink-0">
          <Network class="w-5 h-5 text-purple-400" />
        </div>
        <div>
          <div class="text-[11px] text-slate-400">总转发规则数</div>
          <div class="text-xl font-bold text-white">{{ rules.length }} <span class="text-xs text-slate-500 font-normal">条</span></div>
        </div>
      </div>

      <div class="glass-panel p-4 rounded-2xl border border-slate-800 flex items-center gap-3.5">
        <div class="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center shrink-0">
          <ArrowRightLeft class="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <div class="text-[11px] text-slate-400">TCP 运行中</div>
          <div class="text-xl font-bold text-blue-400">{{ runningTcpCount }} <span class="text-xs text-slate-500 font-normal">条</span></div>
        </div>
      </div>

      <div class="glass-panel p-4 rounded-2xl border border-slate-800 flex items-center gap-3.5">
        <div class="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
          <Radio class="w-5 h-5 text-amber-400" />
        </div>
        <div>
          <div class="text-[11px] text-slate-400">UDP 运行中</div>
          <div class="text-xl font-bold text-amber-400">{{ runningUdpCount }} <span class="text-xs text-slate-500 font-normal">条</span></div>
        </div>
      </div>

      <div class="glass-panel p-4 rounded-2xl border border-slate-800 flex items-center gap-3.5">
        <div class="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
          <ShieldCheck class="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <div class="text-[11px] text-slate-400">Nginx Stream 引擎</div>
          <div class="text-xs font-bold text-emerald-400 flex items-center gap-1.5 mt-1">
            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>已加载 / 热重载就绪</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Rules Table Card -->
    <div class="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs font-mono">
          <thead>
            <tr class="bg-slate-950/60 text-slate-400 border-b border-slate-800">
              <th class="py-3.5 px-4 font-semibold">规则名称 / 备注</th>
              <th class="py-3.5 px-4 font-semibold">传输协议</th>
              <th class="py-3.5 px-4 font-semibold">外部监听端口 (IPv4/IPv6)</th>
              <th class="py-3.5 px-4 font-semibold">目标后端地址 (Target)</th>
              <th class="py-3.5 px-4 font-semibold">超时设置</th>
              <th class="py-3.5 px-4 font-semibold">运行状态</th>
              <th class="py-3.5 px-4 font-semibold text-right">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/60">
            <tr v-for="rule in rules" :key="rule.id" class="hover:bg-slate-800/30 transition group">
              <!-- Name & Desc -->
              <td class="py-3.5 px-4">
                <div class="font-bold text-slate-100 flex items-center gap-2">
                  <Network class="w-3.5 h-3.5 text-purple-400 shrink-0" />
                  <span>{{ rule.name }}</span>
                </div>
                <div v-if="rule.description" class="text-[11px] text-slate-500 mt-0.5 truncate max-w-xs">
                  {{ rule.description }}
                </div>
              </td>

              <!-- Protocol -->
              <td class="py-3.5 px-4">
                <span
                  class="px-2 py-0.5 rounded text-[11px] font-bold border uppercase"
                  :class="getProtocolBadgeClass(rule.protocol)"
                >
                  {{ rule.protocol }}
                </span>
              </td>

              <!-- Listen Port -->
              <td class="py-3.5 px-4">
                <div class="flex items-center gap-1.5">
                  <span class="font-bold text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                    :{{ rule.listen_port }}
                  </span>
                  <button
                    @click="copyText(String(rule.listen_port))"
                    class="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-white transition p-1"
                    title="复制监听端口"
                  >
                    <Copy class="w-3 h-3" />
                  </button>
                </div>
                <div class="text-[10px] text-slate-500 mt-0.5">0.0.0.0 & [::] 全栈监听</div>
              </td>

              <!-- Target Host & Port -->
              <td class="py-3.5 px-4 text-slate-300">
                <div class="flex items-center gap-1 font-semibold text-slate-200">
                  <ArrowRight class="w-3 h-3 text-slate-500" />
                  <span class="text-brand-300">{{ rule.target_host }}</span>
                  <span class="text-slate-400">:</span>
                  <span class="text-emerald-400">{{ rule.target_port }}</span>
                </div>
              </td>

              <!-- Timeout -->
              <td class="py-3.5 px-4 text-slate-400">
                <div>空闲: {{ rule.proxy_timeout || '10m' }}</div>
                <div class="text-[10px] text-slate-500">握手: {{ rule.proxy_connect_timeout || '5s' }}</div>
              </td>

              <!-- Status & Toggle -->
              <td class="py-3.5 px-4">
                <div class="flex items-center gap-2">
                  <button
                    @click="handleToggle(rule)"
                    :disabled="togglingId === rule.id"
                    class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
                    :class="rule.status === 'running' ? 'bg-purple-600' : 'bg-slate-700'"
                    :title="rule.status === 'running' ? '点击暂停转发' : '点击启用转发'"
                  >
                    <span
                      class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out"
                      :class="rule.status === 'running' ? 'translate-x-4' : 'translate-x-0'"
                    />
                  </button>
                  <span
                    class="text-[11px] font-semibold"
                    :class="rule.status === 'running' ? 'text-emerald-400' : 'text-slate-500'"
                  >
                    {{ rule.status === 'running' ? '运行中' : '已暂停' }}
                  </span>
                </div>
              </td>

              <!-- Actions -->
              <td class="py-3.5 px-4 text-right">
                <div class="flex items-center justify-end gap-2">
                  <button
                    @click="openEditModal(rule)"
                    class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                  >
                    编辑
                  </button>
                  <button
                    @click="openDeleteModal(rule)"
                    class="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition"
                  >
                    删除
                  </button>
                </div>
              </td>
            </tr>

            <!-- Empty State -->
            <tr v-if="rules.length === 0 && !loading">
              <td colspan="7" class="py-16 text-center text-slate-500">
                <Network class="w-10 h-10 mx-auto mb-3 opacity-30 text-purple-400" />
                <p class="text-sm font-semibold text-slate-400">暂无四层转发规则</p>
                <p class="text-xs text-slate-500 mt-1">点击右上角【新建转发规则】为数据库、游戏或中继服务配置端口映射</p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Create / Edit Modal -->
    <Modal
      v-model="showModal"
      :title="isEditing ? '编辑四层转发规则' : '新建四层端口转发规则'"
      size="lg"
    >
      <form @submit.prevent="handleSubmit" class="space-y-4 font-mono text-xs">
        <!-- Quick Presets -->
        <div v-if="!isEditing" class="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 space-y-2">
          <div class="flex items-center justify-between text-[11px] text-purple-300">
            <span class="font-bold flex items-center gap-1.5">
              <Zap class="w-3.5 h-3.5 text-purple-400" />
              常用服务一键预设填充:
            </span>
            <span class="text-purple-400/70 text-[10px]">点击自动填入参数</span>
          </div>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="p in presets"
              :key="p.name"
              type="button"
              @click="applyPreset(p)"
              class="px-2.5 py-1 rounded-lg bg-slate-900/90 hover:bg-purple-600/30 text-slate-200 border border-purple-500/30 hover:border-purple-400 text-[11px] transition flex items-center gap-1"
            >
              <span>{{ p.name }}</span>
              <span class="text-purple-400 text-[10px]">(:{{ p.port }})</span>
            </button>
          </div>
        </div>

        <!-- Rule Name & Protocol -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-slate-300 font-semibold mb-1">
              规则名称 <span class="text-rose-400">*</span>
            </label>
            <input
              v-model="formData.name"
              type="text"
              required
              placeholder="例如: 内网 MySQL 数据库转发"
              class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label class="block text-slate-300 font-semibold mb-1">传输协议</label>
            <div class="grid grid-cols-3 gap-2">
              <button
                type="button"
                @click="formData.protocol = 'tcp'"
                class="py-2 rounded-xl border text-center font-bold transition"
                :class="formData.protocol === 'tcp' ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'"
              >
                TCP
              </button>
              <button
                type="button"
                @click="formData.protocol = 'udp'"
                class="py-2 rounded-xl border text-center font-bold transition"
                :class="formData.protocol === 'udp' ? 'bg-amber-600 text-white border-amber-500' : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'"
              >
                UDP
              </button>
              <button
                type="button"
                @click="formData.protocol = 'tcp+udp'"
                class="py-2 rounded-xl border text-center font-bold transition"
                :class="formData.protocol === 'tcp+udp' ? 'bg-purple-600 text-white border-purple-500' : 'bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700'"
              >
                TCP + UDP
              </button>
            </div>
          </div>
        </div>

        <!-- Ports & Target -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label class="block text-slate-300 font-semibold mb-1">
              外部监听端口 <span class="text-rose-400">*</span>
            </label>
            <input
              v-model.number="formData.listen_port"
              type="number"
              min="1"
              max="65535"
              required
              placeholder="33060"
              class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-purple-500 font-mono"
            />
            <p v-if="[8888, 22, 80, 443].includes(formData.listen_port)" class="text-[10px] text-rose-400 mt-1">
              ⚠️ 该端口为面板或系统保留端口，禁止占用
            </p>
          </div>

          <div>
            <label class="block text-slate-300 font-semibold mb-1">
              目标后端主机 (IP/域名) <span class="text-rose-400">*</span>
            </label>
            <input
              v-model="formData.target_host"
              type="text"
              required
              placeholder="127.0.0.1 或内网 IP"
              class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-purple-500 font-mono"
            />
          </div>

          <div>
            <label class="block text-slate-300 font-semibold mb-1">
              目标后端端口 <span class="text-rose-400">*</span>
            </label>
            <input
              v-model.number="formData.target_port"
              type="number"
              min="1"
              max="65535"
              required
              placeholder="3306"
              class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-purple-500 font-mono"
            />
          </div>
        </div>

        <!-- Advanced Timeout Settings -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-slate-300 font-semibold mb-1">连接空闲超时 (proxy_timeout)</label>
            <select
              v-model="formData.proxy_timeout"
              class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-purple-500"
            >
              <option value="5m">5 分钟 (默认通用)</option>
              <option value="10m">10 分钟 (推荐数据库)</option>
              <option value="1h">1 小时 (长任务中继)</option>
              <option value="24h">24 小时 (长连接/游戏)</option>
              <option value="7d">7 天 (永久连接)</option>
            </select>
          </div>

          <div>
            <label class="block text-slate-300 font-semibold mb-1">备注说明 (可选)</label>
            <input
              v-model="formData.description"
              type="text"
              placeholder="如: 跳板机穿透、开发调试"
              class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>

        <!-- Bottom Warning Notice -->
        <div class="p-3 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
          <ShieldCheck class="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
          <div>
            <span class="text-slate-300 font-semibold">自动化热生效保障:</span>
            保存时系统将自动生成独立 Nginx stream 配置文件，执行 <code class="text-purple-300 font-mono">nginx -t</code> 语法校验，确认无误后毫秒级重载生效；若语法有误将自动安全回滚。
          </div>
        </div>

        <!-- Actions -->
        <div class="pt-2 flex justify-end gap-3">
          <button
            type="button"
            @click="showModal = false"
            class="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 font-bold transition"
          >
            取消
          </button>
          <button
            type="submit"
            :disabled="submitting"
            class="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold flex items-center gap-1.5 transition shadow-lg shadow-purple-600/20"
          >
            <Loader2 v-if="submitting" class="w-3.5 h-3.5 animate-spin" />
            <span>{{ submitting ? '保存中...' : (isEditing ? '保存修改并重载' : '立即创建并生效') }}</span>
          </button>
        </div>
      </form>
    </Modal>

    <!-- Delete Confirmation Modal -->
    <Modal v-model="showDeleteModal" title="确认删除转发规则" size="md">
      <div v-if="ruleToDelete" class="space-y-4 font-mono text-xs">
        <div class="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-start gap-3">
          <Trash2 class="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />
          <div>
            <div class="font-bold text-white text-sm">确认移除该四层转发规则？</div>
            <p class="text-xs text-rose-300/90 mt-1">
              规则名称: <strong class="text-white">{{ ruleToDelete.name }}</strong><br>
              端口映射: <code class="text-white">:{{ ruleToDelete.listen_port }} -> {{ ruleToDelete.target_host }}:{{ ruleToDelete.target_port }}</code> ({{ ruleToDelete.protocol.toUpperCase() }})
            </p>
          </div>
        </div>
        <p class="text-slate-400 text-[11px]">
          删除后将自动清理对应的 Nginx stream 规则文件并平滑重载 Nginx，释放该端口的监听绑定。
        </p>

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
            @click="confirmDelete"
            :disabled="deleting"
            class="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center gap-1.5"
          >
            <Loader2 v-if="deleting" class="w-3.5 h-3.5 animate-spin" />
            <span>{{ deleting ? '删除中...' : '确认彻底删除' }}</span>
          </button>
        </div>
      </div>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import {
  Network,
  Plus,
  RefreshCw,
  Copy,
  ArrowRight,
  ArrowRightLeft,
  Radio,
  ShieldCheck,
  Zap,
  Trash2,
  Loader2
} from 'lucide-vue-next'
import Modal from '@/components/Modal.vue'
import { streamApi, StreamRuleItem, CreateStreamRuleParams } from '@/api/stream'
import { toast } from '@/composables/useToast'

const rules = ref<StreamRuleItem[]>([])
const loading = ref(false)
const showModal = ref(false)
const isEditing = ref(false)
const editingId = ref<number | null>(null)
const submitting = ref(false)
const togglingId = ref<number | null>(null)

const showDeleteModal = ref(false)
const ruleToDelete = ref<StreamRuleItem | null>(null)
const deleting = ref(false)

const runningTcpCount = computed(() => rules.value.filter(r => r.status === 'running' && (r.protocol === 'tcp' || r.protocol === 'tcp+udp')).length)
const runningUdpCount = computed(() => rules.value.filter(r => r.status === 'running' && (r.protocol === 'udp' || r.protocol === 'tcp+udp')).length)

const formData = reactive<CreateStreamRuleParams>({
  name: '',
  protocol: 'tcp',
  listen_port: 33060,
  target_host: '127.0.0.1',
  target_port: 3306,
  proxy_timeout: '10m',
  proxy_connect_timeout: '5s',
  description: ''
})

const presets = [
  { name: 'MySQL', port: 3306, defaultListen: 33060, protocol: 'tcp' as const },
  { name: 'Redis', port: 6379, defaultListen: 63790, protocol: 'tcp' as const },
  { name: 'PostgreSQL', port: 5432, defaultListen: 54320, protocol: 'tcp' as const },
  { name: 'SSH 跳板', port: 22, defaultListen: 2222, protocol: 'tcp' as const },
  { name: 'DNS 中继', port: 53, defaultListen: 5353, protocol: 'udp' as const },
  { name: 'RDP 远程桌面', port: 3389, defaultListen: 33890, protocol: 'tcp' as const },
  { name: 'Minecraft', port: 25565, defaultListen: 25565, protocol: 'tcp+udp' as const }
]

function applyPreset(preset: typeof presets[0]) {
  formData.name = `${preset.name} 转发`
  formData.protocol = preset.protocol
  formData.listen_port = preset.defaultListen
  formData.target_host = '127.0.0.1'
  formData.target_port = preset.port
  toast.info(`已填充 ${preset.name} 常用配置模板`)
}

function getProtocolBadgeClass(proto: string) {
  if (proto === 'tcp') return 'bg-blue-500/20 text-blue-300 border-blue-500/30'
  if (proto === 'udp') return 'bg-amber-500/20 text-amber-300 border-amber-500/30'
  return 'bg-purple-500/20 text-purple-300 border-purple-500/30'
}

function copyText(val: string) {
  navigator.clipboard.writeText(val)
  toast.success(`端口 :${val} 已复制到剪贴板`)
}

async function loadRules() {
  loading.value = true
  try {
    const res = await streamApi.getStreamList()
    if (res.data && res.data.data) {
      rules.value = res.data.data.list
    }
  } catch (err: any) {
    console.error('Failed to load stream rules:', err)
  } finally {
    loading.value = false
  }
}

function openCreateModal() {
  isEditing.value = false
  editingId.value = null
  formData.name = ''
  formData.protocol = 'tcp'
  formData.listen_port = 33060
  formData.target_host = '127.0.0.1'
  formData.target_port = 3306
  formData.proxy_timeout = '10m'
  formData.description = ''
  showModal.value = true
}

function openEditModal(rule: StreamRuleItem) {
  isEditing.value = true
  editingId.value = rule.id
  formData.name = rule.name
  formData.protocol = rule.protocol
  formData.listen_port = rule.listen_port
  formData.target_host = rule.target_host
  formData.target_port = rule.target_port
  formData.proxy_timeout = rule.proxy_timeout || '10m'
  formData.description = rule.description || ''
  showModal.value = true
}

async function handleSubmit() {
  submitting.value = true
  try {
    if (isEditing.value && editingId.value) {
      await streamApi.updateStreamRule(editingId.value, formData)
      toast.success(`转发规则 [${formData.name}] 已成功更新并重载生效！`)
    } else {
      await streamApi.createStreamRule(formData)
      toast.success(`四层转发规则 [${formData.name}] 创建成功！`)
    }
    showModal.value = false
    await loadRules()
  } catch (err: any) {
    toast.error(`操作失败: ${err.message}`)
  } finally {
    submitting.value = false
  }
}

async function handleToggle(rule: StreamRuleItem) {
  togglingId.value = rule.id
  try {
    const res = await streamApi.toggleStreamRule(rule.id)
    if (res.data?.data) {
      rule.status = res.data.data.status
    }
    toast.success(`规则 [${rule.name}] 已${rule.status === 'running' ? '恢复运行' : '暂停'}`)
  } catch (err: any) {
    toast.error(`切换状态失败: ${err.message}`)
  } finally {
    togglingId.value = null
  }
}

function openDeleteModal(rule: StreamRuleItem) {
  ruleToDelete.value = rule
  showDeleteModal.value = true
}

async function confirmDelete() {
  if (!ruleToDelete.value) return
  deleting.value = true
  try {
    await streamApi.deleteStreamRule(ruleToDelete.value.id)
    toast.success(`规则 [${ruleToDelete.value.name}] 已成功删除并释放端口`)
    showDeleteModal.value = false
    await loadRules()
  } catch (err: any) {
    toast.error(`删除失败: ${err.message}`)
  } finally {
    deleting.value = false
  }
}

onMounted(() => {
  loadRules()
})
</script>
