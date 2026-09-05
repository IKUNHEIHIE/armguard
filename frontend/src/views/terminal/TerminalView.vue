<template>
  <div class="h-[calc(100vh-8.5rem)] flex flex-col glass-panel rounded-2xl border border-slate-800 overflow-hidden shadow-2xl space-y-0">
    <!-- Terminal Header / Toolbar -->
    <div class="h-11 px-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0 font-mono text-xs">
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-1.5">
          <span class="w-3 h-3 rounded-full bg-rose-500/80"></span>
          <span class="w-3 h-3 rounded-full bg-amber-500/80"></span>
          <span class="w-3 h-3 rounded-full bg-emerald-500/80"></span>
        </div>
        <span class="text-slate-400 font-bold flex items-center gap-1.5">
          <Terminal class="w-3.5 h-3.5 text-brand-400" />
          root@arm-server (ARM64 PTY)
        </span>
        <span
          class="px-2 py-0.5 rounded-full text-[10px] font-bold border"
          :class="connected ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/15 text-amber-300 border-amber-500/30'"
        >
          {{ connected ? '已连接' : '就绪/本地会话' }}
        </span>
      </div>

      <div class="flex items-center gap-2">
        <button
          @click="showAiDoctorModal = true"
          title="终端报错 AI 一键智能排障"
          class="px-2.5 py-1 rounded bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 transition flex items-center gap-1"
        >
          <Sparkles class="w-3.5 h-3.5" />
          <span>报错 AI 诊断</span>
        </button>
        <button
          @click="clearTerminal"
          title="清屏"
          class="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
        >
          清屏
        </button>
        <button
          @click="reconnect"
          title="重新连接"
          class="px-2.5 py-1 rounded bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold transition flex items-center gap-1"
        >
          <RefreshCw class="w-3 h-3" />
          重连
        </button>
      </div>
    </div>

    <!-- AI Command Copilot Bar -->
    <div class="px-4 py-2.5 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950/40 border-b border-slate-800 flex flex-col gap-2 font-mono text-xs">
      <div class="flex items-center gap-2">
        <div class="flex items-center gap-1.5 font-bold shrink-0">
          <Sparkles class="w-4 h-4 animate-pulse text-brand-400" />
          <span class="text-brand-400">AI Copilot:</span>
          <span
            class="text-[10px] px-2 py-0.5 rounded-full border font-mono"
            :class="aiConfig.is_configured ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'"
          >
            {{ aiConfig.is_configured ? (aiConfig.model || '大模型') : '离线规则' }}
          </span>
        </div>
        <div class="relative flex-1">
          <input
            v-model="aiPrompt"
            @keyup.enter="generateAiCommand"
            type="text"
            placeholder="输入自然语言需求，例如：查找大于100MB文件并按大小排序、重启Nginx、查看80端口占用..."
            class="w-full bg-slate-950/90 border border-slate-700 rounded-xl px-3.5 py-1.5 pr-20 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
          <button
            @click="generateAiCommand"
            :disabled="generatingAi || !aiPrompt.trim()"
            class="absolute right-1.5 top-1 px-3 py-1 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-slate-950 font-bold text-[11px] transition flex items-center gap-1"
          >
            <Loader2 v-if="generatingAi" class="w-3 h-3 animate-spin" />
            <span v-else>生成命令</span>
          </button>
        </div>
      </div>

      <!-- Generated Command Banner -->
      <div v-if="genResult" class="p-3 rounded-xl bg-slate-950/80 border border-brand-500/30 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div class="space-y-1 max-w-2xl">
          <div class="flex items-center gap-2">
            <span
              class="px-2 py-0.5 rounded text-[10px] font-bold uppercase border"
              :class="getRiskBadgeClass(genResult.risk)"
            >
              {{ getRiskLabel(genResult.risk) }}
            </span>
            <code class="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-brand-300 font-bold">
              {{ genResult.command }}
            </code>
          </div>
          <p class="text-[11px] text-slate-400">
            {{ genResult.explanation }}
            <span v-if="genResult.notes" class="text-amber-400/90 ml-1">({{ genResult.notes }})</span>
          </p>
        </div>

        <div class="flex items-center gap-2 shrink-0">
          <button
            @click="copyCommand(genResult.command)"
            class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] transition flex items-center gap-1"
          >
            <Copy class="w-3 h-3" />
            复制
          </button>
          <button
            @click="insertToTerminal(genResult.command)"
            class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 text-[11px] border border-cyan-500/30 transition flex items-center gap-1"
            title="将命令填入终端输入行但不立即执行"
          >
            <CornerDownLeft class="w-3 h-3" />
            填入终端
          </button>
          <button
            @click="runInTerminal(genResult.command, genResult.risk)"
            class="px-3 py-1 rounded-lg bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold text-[11px] transition flex items-center gap-1 shadow"
            title="立即发送至终端执行"
          >
            <Play class="w-3 h-3 fill-slate-950" />
            一键执行
          </button>
        </div>
      </div>
    </div>

    <!-- Terminal Container -->
    <div ref="terminalContainer" class="flex-1 bg-[#0c1017] p-2 overflow-hidden"></div>

    <!-- AI Error Doctor Modal -->
    <Modal v-model="showAiDoctorModal" title="🩺 终端报错 AI 一键智能排障" size="lg">
      <div class="space-y-4 font-mono text-xs">
        <div>
          <label class="block text-slate-300 font-semibold mb-1">粘贴终端中的报错日志或异常输出：</label>
          <textarea
            v-model="doctorErrorInput"
            rows="5"
            placeholder="例如：nginx: [emerg] bind() to 0.0.0.0:80 failed (98: Address already in use)..."
            class="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-slate-100 text-xs focus:outline-none focus:border-brand-500"
          ></textarea>
        </div>

        <div class="flex justify-between items-center">
          <span class="text-[11px] text-slate-500">AI 将结合当前 ARM64 Linux 环境进行深度排查</span>
          <button
            @click="diagnoseTerminalError"
            :disabled="diagnosing || !doctorErrorInput.trim()"
            class="px-4 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold flex items-center gap-1.5"
          >
            <Loader2 v-if="diagnosing" class="w-3.5 h-3.5 animate-spin" />
            <Sparkles v-else class="w-3.5 h-3.5" />
            <span>{{ diagnosing ? '深度分析中...' : '开始 AI 诊断' }}</span>
          </button>
        </div>

        <!-- Diagnosis Result -->
        <div v-if="doctorResult" class="p-4 rounded-xl bg-slate-950 border border-brand-500/30 space-y-3">
          <div class="flex items-center gap-2">
            <span
              class="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
              :class="doctorResult.severity === 'critical' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'"
            >
              {{ doctorResult.severity === 'critical' ? '严重故障 (Critical)' : '告警 (Warning)' }}
            </span>
            <span class="text-white font-bold">{{ doctorResult.affected_component }}</span>
          </div>

          <div>
            <div class="text-slate-400 font-semibold mb-0.5">故障根因 (Root Cause):</div>
            <div class="text-slate-200">{{ doctorResult.root_cause }}</div>
          </div>

          <div v-if="doctorResult.fix_steps?.length">
            <div class="text-slate-400 font-semibold mb-1">排障步骤建议:</div>
            <ul class="list-disc list-inside space-y-0.5 text-slate-300 text-[11px]">
              <li v-for="(step, idx) in doctorResult.fix_steps" :key="idx">{{ step }}</li>
            </ul>
          </div>

          <div v-if="doctorResult.fix_commands?.length" class="space-y-1 pt-1">
            <div class="text-emerald-400 font-semibold flex items-center justify-between">
              <span>推荐修复命令:</span>
            </div>
            <div
              v-for="(cmd, idx) in doctorResult.fix_commands"
              :key="idx"
              class="p-2 rounded bg-slate-900 border border-slate-800 flex items-center justify-between gap-2"
            >
              <code class="text-brand-300 font-bold text-[11px]">{{ cmd }}</code>
              <button
                @click="insertToTerminal(cmd); showAiDoctorModal = false"
                class="px-2 py-0.5 rounded bg-slate-800 hover:bg-brand-500 hover:text-slate-950 text-slate-300 text-[10px]"
              >
                填入终端执行
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { Terminal, RefreshCw, Sparkles, Loader2, Copy, CornerDownLeft, Play } from 'lucide-vue-next'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import Modal from '@/components/Modal.vue'
import { aiApi, AIConfig, CommandGenResult, LogDiagnosisResult } from '@/api/ai'
import { toast } from '@/composables/useToast'
import { eventBus, EVENTS } from '@/utils/eventBus'

const terminalContainer = ref<HTMLElement | null>(null)
const connected = ref(true)

const aiConfig = ref<AIConfig>({
  enabled: true,
  api_url: '',
  api_key: '',
  model: '',
  temperature: 0.3,
  max_tokens: 2048,
  is_configured: false
})

const aiPrompt = ref('')
const generatingAi = ref(false)
const genResult = ref<CommandGenResult | null>(null)

const showAiDoctorModal = ref(false)
const doctorErrorInput = ref('')
const diagnosing = ref(false)
const doctorResult = ref<LogDiagnosisResult | null>(null)

let term: XTerm | null = null
let fitAddon: FitAddon | null = null
let ws: WebSocket | null = null
let currentLine = ''

function initTerminal() {
  if (!terminalContainer.value) return

  term = new XTerm({
    cursorBlink: true,
    fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
    fontSize: 13,
    lineHeight: 1.2,
    theme: {
      background: '#0c1017',
      foreground: '#e6edf3',
      cursor: '#00D084',
      cursorAccent: '#0c1017',
      selectionBackground: 'rgba(0, 208, 132, 0.3)',
      black: '#484f58',
      red: '#ff7b72',
      green: '#3fb950',
      yellow: '#d29922',
      blue: '#58a6ff',
      magenta: '#bc8cff',
      cyan: '#39c5cf',
      white: '#b1bac4',
      brightBlack: '#6e7681',
      brightRed: '#ffa198',
      brightGreen: '#56d364',
      brightYellow: '#e3b341',
      brightBlue: '#79c0ff',
      brightMagenta: '#d2a8ff',
      brightCyan: '#56d4dd',
      brightWhite: '#f0f6fc'
    }
  })

  fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.open(terminalContainer.value)
  fitAddon.fit()

  // Connect real WebSocket PTY
  connectWebSocket()

  // Fallback interactive emulator for testing
  term.onData((data) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(data)
    } else {
      handleLocalKey(data)
    }
  })

  window.addEventListener('resize', handleResize)
}

function writePrompt() {
  if (term) {
    term.write('\r\n\x1b[1;32mroot@armguard-rpi4\x1b[0m:\x1b[1;34m~\x1b[0m# ')
  }
}

function handleLocalKey(data: string) {
  if (!term) return
  if (data === '\r') {
    const cmd = currentLine.trim()
    currentLine = ''
    executeMockCommand(cmd)
  } else if (data === '\u007F') {
    if (currentLine.length > 0) {
      currentLine = currentLine.slice(0, -1)
      term.write('\b \b')
    }
  } else if (data === '\u0003') {
    currentLine = ''
    term.write('^C')
    writePrompt()
  } else {
    currentLine += data
    term.write(data)
  }
}

function executeMockCommand(cmd: string) {
  if (!term) return
  term.writeln('')
  if (cmd === '') {
    writePrompt()
    return
  }
  if (cmd === 'clear') {
    term.clear()
    writePrompt()
    return
  }
  if (cmd.startsWith('find') || cmd.includes('grep')) {
    term.writeln('-rw-r--r-- 1 root root 142M Aug 24 20:00 /var/log/syslog.1')
    term.writeln('-rw-r--r-- 1 root root 115M Aug 23 18:30 /var/log/nginx/access.log.1')
  } else {
    term.writeln(`[ArmGuard Terminal] 执行完成: ${cmd}`)
  }
  writePrompt()
}

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const token = localStorage.getItem('armguard_token') || 'armguard_live_jwt_token'
  const url = `${protocol}//${window.location.host}/terminal/ws?token=${token}`

  try {
    ws = new WebSocket(url)
    ws.onopen = () => {
      connected.value = true
      if (term) {
        ws?.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
      }
    }
    ws.onmessage = (e) => {
      term?.write(e.data)
    }
    ws.onerror = () => {
      connected.value = false
    }
    ws.onclose = () => {
      connected.value = false
    }
  } catch {
    connected.value = false
  }
}

function reconnect() {
  if (ws) {
    ws.close()
  }
  term?.clear()
  connectWebSocket()
}

function openAiDoctor() {
  doctorErrorInput.value = ''
  doctorResult.value = null
  showAiDoctorModal.value = true
}

async function generateAiCommand() {
  if (!aiPrompt.value.trim()) return
  generatingAi.value = true
  genResult.value = null
  try {
    const res = await aiApi.generateCommand(aiPrompt.value)
    if (res.data?.data) {
      genResult.value = res.data.data
      toast.success('AI 命令生成成功！')
    }
  } catch (err: any) {
    toast.error(`AI 指令生成失败: ${err.message}`)
  } finally {
    generatingAi.value = false
  }
}

function getRiskBadgeClass(risk: 'safe' | 'warning' | 'danger') {
  if (risk === 'danger') return 'bg-rose-500/20 text-rose-300 border-rose-500/40'
  if (risk === 'warning') return 'bg-amber-500/20 text-amber-300 border-amber-500/40'
  return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
}

function getRiskLabel(risk: 'safe' | 'warning' | 'danger') {
  if (risk === 'danger') return '🔴 高危破坏性指令'
  if (risk === 'warning') return '🟡 变更性操作'
  return '🟢 安全指令'
}

function copyCommand(cmd: string) {
  navigator.clipboard.writeText(cmd)
  toast.success('命令已复制到剪贴板！')
}

function insertToTerminal(cmd: string) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(cmd)
  } else if (term) {
    currentLine += cmd
    term.write(cmd)
  }
}

function runInTerminal(cmd: string, risk: 'safe' | 'warning' | 'danger') {
  if (risk === 'danger') {
    if (!confirm(`⚠️ 警告：该指令被评估为高危操作！\n\n【${cmd}】\n\n确认立即在服务器中执行吗？`)) {
      return
    }
  }
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(cmd + '\r')
  } else if (term) {
    currentLine = cmd
    executeMockCommand(cmd)
  }
}

async function diagnoseTerminalError() {
  if (!doctorErrorInput.value.trim()) return
  diagnosing.value = true
  doctorResult.value = null
  try {
    const res = await aiApi.diagnoseLog('terminal', doctorErrorInput.value)
    if (res.data?.data) {
      doctorResult.value = res.data.data
      toast.success('终端错误诊断分析完成！')
    }
  } catch (err: any) {
    toast.error(`诊断失败: ${err.message}`)
  } finally {
    diagnosing.value = false
  }
}

function handleResize() {
  if (fitAddon && term) {
    fitAddon.fit()
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
    }
  }
}

function clearTerminal() {
  if (term) {
    term.clear()
    writePrompt()
  }
}

async function fetchAiConfig() {
  try {
    const res = await aiApi.getConfig()
    if (res.data?.data) {
      Object.assign(aiConfig.value, res.data.data)
    }
  } catch {}
}

let offAiConfig: (() => void) | null = null

onMounted(() => {
  fetchAiConfig()
  offAiConfig = eventBus.on(EVENTS.AI_CONFIG_UPDATED, (cfg) => {
    Object.assign(aiConfig.value, cfg)
  })
  nextTick(() => {
    initTerminal()
  })
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (ws) ws.close()
  term?.dispose()
  if (offAiConfig) offAiConfig()
})
</script>
