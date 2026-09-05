<template>
  <header class="h-16 bg-slate-900/80 backdrop-blur border-b border-slate-800 px-6 flex items-center justify-between shrink-0 sticky top-0 z-30">
    <div class="flex items-center gap-4">
      <h1 class="text-lg font-semibold text-white tracking-tight">
        {{ currentTitle }}
      </h1>
      <ARMHardwareBadge
        :temp-c="systemStore.armThermal.temp_c"
        :throttled="systemStore.armThermal.throttled"
        :under-voltage="systemStore.armThermal.under_voltage"
        :board-model="systemStore.info?.arm_board_model || systemStore.armThermal.board_model || 'ARM Linux'"
      />
    </div>

    <div class="flex items-center gap-4">
      <!-- Quick Uptime & Host info -->
      <div class="hidden md:flex items-center gap-3 text-xs font-mono text-slate-400 bg-slate-950/40 px-3 py-1.5 rounded-lg border border-slate-800">
        <span class="flex items-center gap-1">
          <Server class="w-3.5 h-3.5 text-slate-400" />
          {{ systemStore.info?.hostname || 'arm-server' }}
        </span>
        <span class="text-slate-600">|</span>
        <span class="text-brand-400">{{ systemStore.info?.arch || 'aarch64' }}</span>
        <span class="text-slate-600">|</span>
        <span>运行: {{ uptimeFormat }}</span>
      </div>

      <!-- Quick Terminal Button -->
      <RouterLink
        to="/terminal"
        class="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 border border-slate-700 transition"
      >
        <Terminal class="w-3.5 h-3.5 text-emerald-400" />
        终端
      </RouterLink>

      <!-- User Menu -->
      <div class="relative flex items-center gap-3 pl-3 border-l border-slate-800">
        <div class="flex items-center gap-2">
          <div class="w-7 h-7 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30 flex items-center justify-center text-xs font-bold font-mono">
            {{ (authStore.user?.username || 'A')[0].toUpperCase() }}
          </div>
          <div class="hidden sm:block text-left">
            <div class="text-xs font-medium text-slate-200">{{ authStore.user?.username || 'admin' }}</div>
            <div class="text-[10px] text-slate-400 font-mono">{{ authStore.role }}</div>
          </div>
        </div>

        <button
          @click="handleLogout"
          title="退出登录"
          class="p-1.5 rounded-lg hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 transition"
        >
          <LogOut class="w-4 h-4" />
        </button>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Server, Terminal, LogOut } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useSystemStore } from '@/stores/system'
import ARMHardwareBadge from './ARMHardwareBadge.vue'

const $route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const systemStore = useSystemStore()

const currentTitle = computed(() => ($route.meta.title as string) || '仪表盘')

const uptimeFormat = computed(() => {
  const sec = systemStore.info?.uptime_seconds || 0
  const days = Math.floor(sec / 86400)
  const hours = Math.floor((sec % 86400) / 3600)
  const minutes = Math.floor((sec % 3600) / 60)
  if (days > 0) return `${days}天 ${hours}小时`
  if (hours > 0) return `${hours}小时 ${minutes}分`
  return `${minutes}分钟`
})

function handleLogout() {
  if (confirm('确定要退出登录吗？')) {
    authStore.logout()
    router.push('/login')
  }
}
</script>
