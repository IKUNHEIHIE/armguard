<template>
  <div class="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden selection:bg-brand-500 selection:text-white">
    <!-- Ambient background glow -->
    <div class="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand-500/10 rounded-full blur-3xl pointer-events-none"></div>
    <div class="absolute bottom-10 right-10 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>

    <div class="w-full max-w-md relative z-10">
      <!-- Brand Logo & Header -->
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-brand-600 to-emerald-400 shadow-xl shadow-brand-500/20 mb-3">
          <Cpu class="w-8 h-8 text-slate-950 font-bold" />
        </div>
        <h1 class="text-2xl font-bold text-white tracking-tight flex items-center justify-center gap-2">
          {{ systemStore.panelTitle || 'ArmGuard' }}
          <span class="text-xs px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-400 border border-brand-500/30 font-mono">ARM Native</span>
        </h1>
        <p class="text-slate-400 text-xs mt-1.5 font-mono">专为 ARM 架构 Linux 服务器设计的轻量级运维面板</p>
      </div>

      <!-- Login Form Card -->
      <div class="glass-panel p-8 rounded-2xl border border-slate-800 shadow-2xl backdrop-blur-xl">
        <form @submit.prevent="handleLogin" class="space-y-4">
          <div v-if="errorMessage" class="p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle class="w-4 h-4 shrink-0" />
            <span>{{ errorMessage }}</span>
          </div>

          <!-- Username -->
          <div>
            <label class="block text-xs font-medium text-slate-300 mb-1.5">用户名</label>
            <div class="relative">
              <input
                v-model="form.username"
                type="text"
                required
                autocomplete="username"
                placeholder="请输入用户名 (默认 admin)"
                class="w-full bg-slate-900/90 border border-slate-700 rounded-xl px-4 py-2.5 pl-10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition"
              />
              <User class="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
            </div>
          </div>

          <!-- Password -->
          <div>
            <label class="block text-xs font-medium text-slate-300 mb-1.5">密码</label>
            <div class="relative">
              <input
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                required
                autocomplete="current-password"
                placeholder="请输入密码 (默认 armguard)"
                class="w-full bg-slate-900/90 border border-slate-700 rounded-xl px-4 py-2.5 pl-10 pr-10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition"
              />
              <Lock class="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              <button
                type="button"
                @click="showPassword = !showPassword"
                class="absolute right-3 top-3 text-slate-500 hover:text-slate-300"
              >
                <Eye v-if="!showPassword" class="w-4 h-4" />
                <EyeOff v-else class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- Captcha -->
          <div v-if="captchaRequired">
            <label class="block text-xs font-medium text-slate-300 mb-1.5">图形验证码</label>
            <div class="flex items-center gap-3">
              <input
                v-model="form.captcha_code"
                type="text"
                placeholder="输入验证码"
                class="w-full bg-slate-900/90 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition font-mono"
              />
              <div
                @click="refreshCaptcha"
                title="点击刷新验证码"
                class="h-10 px-3 bg-slate-800 rounded-xl border border-slate-700 flex items-center justify-center cursor-pointer hover:bg-slate-700 transition select-none font-mono text-emerald-400 font-bold tracking-widest text-base min-w-[90px]"
              >
                {{ captchaText }}
              </div>
            </div>
          </div>

          <!-- TOTP Code (Optional) -->
          <div v-if="totpRequired">
            <label class="block text-xs font-medium text-slate-300 mb-1.5">双因素认证 (TOTP 动态口令)</label>
            <div class="relative">
              <input
                v-model="form.totp_code"
                type="text"
                maxlength="6"
                placeholder="6 位动态口令"
                class="w-full bg-slate-900/90 border border-slate-700 rounded-xl px-4 py-2.5 pl-10 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition font-mono tracking-widest"
              />
              <ShieldAlert class="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
            </div>
          </div>

          <!-- Submit Button -->
          <button
            type="submit"
            :disabled="loading"
            class="w-full mt-2 bg-gradient-to-r from-brand-600 to-emerald-500 hover:from-brand-500 hover:to-emerald-400 text-slate-950 font-bold py-2.5 rounded-xl shadow-lg shadow-brand-500/25 transition-all transform active:scale-[0.99] flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Loader2 v-if="loading" class="w-4 h-4 animate-spin" />
            <span>{{ loading ? '验证登录中...' : '登 录' }}</span>
          </button>
        </form>

        <div class="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500 font-mono">
          <span>安全端口: 8888</span>
          <span>ARM64 / ARMv7 原生加速</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Cpu, User, Lock, Eye, EyeOff, AlertCircle, ShieldAlert, Loader2 } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useSystemStore } from '@/stores/system'

const router = useRouter()
const authStore = useAuthStore()
const systemStore = useSystemStore()

const form = reactive({
  username: 'admin',
  password: '',
  captcha_id: '1',
  captcha_code: '',
  totp_code: ''
})

const showPassword = ref(false)
const loading = ref(false)
const errorMessage = ref('')
const captchaRequired = ref(false)
const totpRequired = ref(false)
const captchaText = ref('7829')

function refreshCaptcha() {
  captchaText.value = Math.floor(1000 + Math.random() * 9000).toString()
}

async function handleLogin() {
  loading.value = true
  errorMessage.value = ''
  try {
    const res = await authStore.login(form)
    if (res.success) {
      router.push('/')
    } else {
      errorMessage.value = res.message || '用户名或密码错误'
    }
  } catch (err: any) {
    errorMessage.value = err.message || '登录异常'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  systemStore.fetchPanelSettings()
  refreshCaptcha()
})
</script>
