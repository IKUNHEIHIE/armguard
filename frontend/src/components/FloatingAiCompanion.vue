<template>
  <div>
    <!-- Floating Trigger Button -->
    <button
      v-if="!isOpen"
      @click="openCompanion"
      class="fixed bottom-6 right-6 z-40 group flex items-center gap-2 p-3 rounded-2xl bg-gradient-to-tr from-brand-500 via-emerald-400 to-cyan-400 text-slate-950 font-bold shadow-2xl shadow-brand-500/40 hover:scale-105 active:scale-95 transition-all duration-300 select-none cursor-pointer"
      title="点击唤起 ArmGuard AI 智能运维伴侣"
    >
      <div class="relative">
        <Bot class="w-6 h-6 animate-pulse" />
        <span
          class="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-slate-950"
          :class="aiConfig.is_configured ? 'bg-emerald-400' : 'bg-amber-400'"
        ></span>
      </div>
      <span class="hidden sm:inline text-xs tracking-tight font-extrabold pr-1">AI 运维伴侣</span>
    </button>

    <!-- Expanding AI Companion Panel -->
    <div
      v-if="isOpen"
      class="fixed bottom-6 right-6 z-50 w-[92vw] sm:w-[480px] h-[620px] max-h-[85vh] glass-panel rounded-3xl border border-brand-500/30 bg-slate-950/95 backdrop-blur-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
    >
      <!-- Header -->
      <div class="p-4 bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950/60 border-b border-slate-800 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-2.5">
          <div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-brand-600 to-cyan-400 flex items-center justify-center text-slate-950 shadow-md">
            <Bot class="w-4 h-4 font-bold" />
          </div>
          <div>
            <div class="text-xs font-bold text-white flex items-center gap-1.5">
              ArmGuard AI 运维伴侣
              <span class="text-[9px] px-1.5 py-0.2 rounded-full bg-brand-500/20 text-brand-300 font-mono border border-brand-500/30">ARM64</span>
            </div>
            <div class="text-[10px] text-slate-400 font-mono mt-0.5 flex items-center gap-2">
              <span>CPU: {{ systemStore.realtime.cpu.percent.toFixed(0) }}%</span>
              <span>RAM: {{ systemStore.realtime.memory.percent.toFixed(0) }}%</span>
              <span>{{ systemStore.armThermal.temp_c ? systemStore.armThermal.temp_c.toFixed(0) + '°C' : '38°C' }}</span>
            </div>
          </div>
        </div>

        <div class="flex items-center gap-1">
          <button
            @click="clearHistory"
            title="清空对话"
            class="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
          >
            <Trash2 class="w-4 h-4" />
          </button>
          <button
            @click="isOpen = false"
            title="收起"
            class="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- Engine Status Notice Bar -->
      <div
        class="px-4 py-2 text-[11px] font-mono flex items-center justify-between gap-2 border-b border-slate-800/80"
        :class="aiConfig.is_configured ? 'bg-emerald-950/20 text-emerald-300' : 'bg-amber-950/20 text-amber-300'"
      >
        <div class="flex items-center gap-1.5 truncate">
          <span class="w-2 h-2 rounded-full shrink-0" :class="aiConfig.is_configured ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'"></span>
          <span v-if="aiConfig.is_configured">已连接在线大模型 ({{ aiConfig.model || 'LLM' }})</span>
          <span v-else class="truncate">正在使用离线引擎，为了更好体验请配置大模型API</span>
        </div>

        <RouterLink
          v-if="!aiConfig.is_configured"
          to="/settings"
          @click="isOpen = false"
          class="shrink-0 px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 font-bold transition flex items-center gap-1"
        >
          <span>去配置</span>
          <ArrowRight class="w-3 h-3" />
        </RouterLink>
      </div>

      <!-- Tab Switcher -->
      <div class="flex items-center p-1 bg-slate-900/90 border-b border-slate-800 text-xs font-mono">
        <button
          @click="activeTab = 'chat'"
          class="flex-1 py-1.5 rounded-lg transition text-center flex items-center justify-center gap-1.5"
          :class="activeTab === 'chat' ? 'bg-brand-600 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-slate-200'"
        >
          <MessageSquare class="w-3.5 h-3.5" />
          智能问答 (Chat)
        </button>
        <button
          @click="activeTab = 'audit'"
          class="flex-1 py-1.5 rounded-lg transition text-center flex items-center justify-center gap-1.5"
          :class="activeTab === 'audit' ? 'bg-brand-600 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-slate-200'"
        >
          <Activity class="w-3.5 h-3.5" />
          一键体检 (Audit)
        </button>
      </div>

      <!-- TAB 1: Chat Body -->
      <div v-if="activeTab === 'chat'" class="flex-1 flex flex-col min-h-0">
        <!-- Messages Area -->
        <div ref="chatContainer" class="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs">
          <!-- Initial Welcome Message (Differential Greeting) -->
          <div class="flex gap-2.5 items-start">
            <div class="w-6 h-6 rounded-lg bg-brand-500/20 text-brand-400 flex items-center justify-center shrink-0 mt-0.5">
              <Bot class="w-3.5 h-3.5" />
            </div>
            <div class="p-3 rounded-2xl bg-slate-900 border border-slate-800 text-slate-200 leading-relaxed max-w-[85%]">
              <template v-if="aiConfig.is_configured">
                你好！我是由 <strong>{{ aiConfig.model || '大模型' }}</strong> 驱动的 <strong>ARM Linux 专属智能运维伴侣</strong>。已深度感知当前服务器运行环境（CPU: {{ systemStore.realtime.cpu.percent.toFixed(0) }}%、内存占用 {{ systemStore.realtime.memory.percent.toFixed(0) }}%），请随时向我提问！
              </template>
              <template v-else>
                你好！当前正在以 <strong>【本地专家规则模式】</strong> 运行，已内置基础状态与常用 Linux 命令库。若需获得由大模型驱动的深度排障与代码生成能力，建议前往「系统设置-管理员与凭证」配置大模型 API。
              </template>
            </div>
          </div>

          <!-- Dialog Messages -->
          <div
            v-for="(msg, idx) in messages"
            :key="idx"
            class="flex gap-2.5 items-start"
            :class="msg.role === 'user' ? 'flex-row-reverse' : ''"
          >
            <div
              class="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold"
              :class="msg.role === 'user' ? 'bg-cyan-500/20 text-cyan-300' : 'bg-brand-500/20 text-brand-400'"
            >
              <User v-if="msg.role === 'user'" class="w-3.5 h-3.5" />
              <Bot v-else class="w-3.5 h-3.5" />
            </div>
            <div
              class="p-3 rounded-2xl leading-relaxed max-w-[85%] whitespace-pre-wrap select-text"
              :class="msg.role === 'user' ? 'bg-brand-600 text-slate-950 font-medium' : 'bg-slate-900 border border-slate-800 text-slate-200'"
            >
              {{ msg.content }}
            </div>
          </div>

          <!-- Loading Indicator -->
          <div v-if="loadingChat" class="flex gap-2.5 items-center text-slate-500">
            <div class="w-6 h-6 rounded-lg bg-brand-500/10 flex items-center justify-center shrink-0">
              <Loader2 class="w-3.5 h-3.5 animate-spin text-brand-400" />
            </div>
            <span>AI 正在思考分析中...</span>
          </div>
        </div>

        <!-- Quick Prompt Chips -->
        <div class="px-3 py-2 bg-slate-950/60 border-t border-slate-800/80 flex items-center gap-1.5 overflow-x-auto text-[11px] font-mono shrink-0">
          <button
            v-for="chip in quickChips"
            :key="chip"
            @click="sendQuickPrompt(chip)"
            class="px-2.5 py-1 rounded-full bg-slate-900 hover:bg-brand-500/20 text-slate-400 hover:text-brand-300 border border-slate-800 hover:border-brand-500/30 whitespace-nowrap transition"
          >
            {{ chip }}
          </button>
        </div>

        <!-- Input Bar -->
        <div class="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2 shrink-0">
          <input
            v-model="inputMessage"
            @keyup.enter="sendMessage"
            type="text"
            placeholder="输入您的问题..."
            class="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
          />
          <button
            @click="sendMessage"
            :disabled="loadingChat || !inputMessage.trim()"
            class="p-2 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-slate-950 font-bold transition"
          >
            <Send class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- TAB 2: One-Click Audit Body -->
      <div v-if="activeTab === 'audit'" class="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-xs">
        <div class="p-4 rounded-2xl bg-gradient-to-r from-slate-900 to-indigo-950/30 border border-slate-800 flex items-center justify-between">
          <div>
            <div class="text-sm font-bold text-white">全盘智能健康体检</div>
            <div class="text-[11px] text-slate-400 mt-0.5">多维度评估 CPU、内存、磁盘、温控与 Web 服务</div>
          </div>
          <button
            @click="runHealthAudit"
            :disabled="runningAudit"
            class="px-3.5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold flex items-center gap-1.5 shadow"
          >
            <Loader2 v-if="runningAudit" class="w-3.5 h-3.5 animate-spin" />
            <Sparkles v-else class="w-3.5 h-3.5" />
            <span>{{ runningAudit ? '体检中...' : '重新体检' }}</span>
          </button>
        </div>

        <div v-if="auditResult" class="space-y-4">
          <!-- Score Banner -->
          <div class="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
            <div>
              <div class="text-xs text-slate-400 font-semibold">健康综合评分</div>
              <div class="text-2xl font-bold text-emerald-400 mt-1 font-mono">{{ auditResult.score }} <span class="text-xs text-slate-400">/ 100 分</span></div>
              <div class="text-[11px] text-slate-300 mt-1">{{ auditResult.summary }}</div>
            </div>
            <div class="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-xl font-bold font-mono">
              {{ auditResult.score }}
            </div>
          </div>

          <!-- Checks List -->
          <div class="space-y-2">
            <div class="text-xs font-bold text-slate-300">体检扫描项详情:</div>
            <div
              v-for="(c, idx) in auditResult.checks"
              :key="idx"
              class="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex items-start gap-2.5"
            >
              <CheckCircle2 v-if="c.status === 'pass'" class="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <AlertCircle v-else class="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div class="font-bold text-white text-xs">{{ c.item }}</div>
                <div class="text-[11px] text-slate-400 mt-0.5">{{ c.detail }}</div>
              </div>
            </div>
          </div>

          <!-- Optimizations -->
          <div v-if="auditResult.optimizations?.length" class="space-y-2">
            <div class="text-xs font-bold text-brand-300">智能优化建议:</div>
            <div class="p-3 rounded-xl bg-slate-950 border border-brand-500/20 space-y-1.5 text-[11px] text-slate-300">
              <div v-for="(opt, idx) in auditResult.optimizations" :key="idx" class="flex items-center gap-2">
                <span class="w-1.5 h-1.5 rounded-full bg-brand-400 shrink-0"></span>
                <span>{{ opt }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-else-if="!runningAudit" class="p-8 text-center text-slate-500">
          点击右上角「重新体检」立即运行全盘扫描。
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, nextTick, onMounted, onUnmounted } from 'vue'
import { RouterLink } from 'vue-router'
import {
  Bot,
  X,
  Send,
  Trash2,
  User,
  Sparkles,
  MessageSquare,
  Activity,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight
} from 'lucide-vue-next'
import { useSystemStore } from '@/stores/system'
import { aiApi, AIConfig, HealthAuditResult } from '@/api/ai'
import { toast } from '@/composables/useToast'
import { eventBus, EVENTS } from '@/utils/eventBus'

const systemStore = useSystemStore()
let offEvent: (() => void) | null = null

const isOpen = ref(false)
const activeTab = ref<'chat' | 'audit'>('chat')

const inputMessage = ref('')
const loadingChat = ref(false)
const runningAudit = ref(false)

const chatContainer = ref<HTMLElement | null>(null)

const aiConfig = reactive<AIConfig>({
  enabled: true,
  api_url: 'https://api.deepseek.com/v1',
  api_key: '',
  model: 'deepseek-chat',
  temperature: 0.3,
  max_tokens: 2048,
  is_configured: false
})

const messages = reactive<Array<{ role: 'user' | 'assistant'; content: string }>>([])

const quickChips = [
  '🔍 检查当前服务器状态',
  '📊 内存占用分析',
  '🛡️ 检查黑客攻击与封禁日志',
  '⚡ 针对 ARM64 的调优建议'
]

const auditResult = ref<HealthAuditResult | null>(null)

async function fetchAiConfig() {
  try {
    const res = await aiApi.getConfig()
    if (res.data?.data) {
      Object.assign(aiConfig, res.data.data)
    }
  } catch {}
}

function openCompanion() {
  isOpen.value = true
  fetchAiConfig()
}

async function sendMessage() {
  const text = inputMessage.value.trim()
  if (!text || loadingChat.value) return

  messages.push({ role: 'user', content: text })
  inputMessage.value = ''
  loadingChat.value = true
  scrollToBottom()

  try {
    const res = await aiApi.chat(text, messages.slice(0, -1))
    if (res.data?.data?.reply) {
      messages.push({ role: 'assistant', content: res.data.data.reply })
    }
  } catch (err: any) {
    messages.push({ role: 'assistant', content: `交互失败: ${err.message || '网络连接异常'}` })
  } finally {
    loadingChat.value = false
    scrollToBottom()
  }
}

function sendQuickPrompt(prompt: string) {
  inputMessage.value = prompt
  sendMessage()
}

function clearHistory() {
  messages.length = 0
  toast.info('对话历史已清空')
}

function scrollToBottom() {
  nextTick(() => {
    if (chatContainer.value) {
      chatContainer.value.scrollTop = chatContainer.value.scrollHeight
    }
  })
}

async function runHealthAudit() {
  runningAudit.value = true
  try {
    const res = await aiApi.healthAudit()
    if (res.data?.data) {
      auditResult.value = res.data.data
    }
  } catch (err: any) {
    toast.error(`体检失败: ${err.message}`)
  } finally {
    runningAudit.value = false
  }
}

onMounted(() => {
  fetchAiConfig()
  runHealthAudit()
  offEvent = eventBus.on(EVENTS.AI_CONFIG_UPDATED, () => {
    fetchAiConfig()
  })
})

onUnmounted(() => {
  if (offEvent) offEvent()
})
</script>
