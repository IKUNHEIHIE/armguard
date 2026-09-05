<template>
  <aside class="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0 select-none">
    <div>
      <!-- Brand Header -->
      <div class="h-16 px-6 flex items-center gap-3 border-b border-slate-800/80">
        <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-emerald-400 flex items-center justify-center shadow-lg shadow-brand-500/20">
          <Cpu class="w-5 h-5 text-slate-950 font-bold" />
        </div>
        <div>
          <div class="font-bold text-base tracking-tight text-white flex items-center gap-1.5 truncate max-w-[140px]" :title="systemStore.panelTitle">
            {{ systemStore.panelTitle }}
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-400 border border-brand-500/30 font-mono shrink-0">ARM</span>
          </div>
          <div class="text-[11px] text-slate-400 font-mono">v0.1.0-alpha</div>
        </div>
      </div>

      <!-- Navigation Menu -->
      <nav class="p-3 space-y-1">
        <RouterLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all group relative"
          :class="[
            $route.path === item.path
              ? 'bg-brand-500/15 text-brand-400 border border-brand-500/30 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          ]"
        >
          <component :is="item.icon" class="w-4 h-4 transition-transform group-hover:scale-110" />
          <span>{{ item.label }}</span>
          <span v-if="item.badge" class="ml-auto text-[10px] px-1.5 py-0.2 rounded font-mono" :class="item.badgeClass">
            {{ item.badge }}
          </span>
        </RouterLink>
      </nav>
    </div>

    <!-- Bottom System Health Glance -->
    <div class="p-4 m-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
      <div class="flex items-center justify-between text-xs text-slate-400 font-mono">
        <span class="flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full" :class="systemStore.wsConnected ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'"></span>
          {{ systemStore.wsConnected ? '实时监控推流' : '轮询模式' }}
        </span>
        <span>{{ systemStore.armThermal.temp_c ? systemStore.armThermal.temp_c.toFixed(1) + '°C' : '--' }}</span>
      </div>

      <div class="space-y-1.5 text-xs font-mono">
        <div class="flex justify-between text-slate-400">
          <span>CPU</span>
          <span class="text-slate-200">{{ systemStore.realtime.cpu.percent.toFixed(0) }}%</span>
        </div>
        <div class="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
          <div class="h-full bg-brand-500 rounded-full transition-all duration-500" :style="{ width: `${systemStore.realtime.cpu.percent}%` }"></div>
        </div>

        <div class="flex justify-between text-slate-400 pt-1">
          <span>RAM</span>
          <span class="text-slate-200">{{ systemStore.realtime.memory.percent.toFixed(0) }}%</span>
        </div>
        <div class="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
          <div class="h-full bg-cyan-500 rounded-full transition-all duration-500" :style="{ width: `${systemStore.realtime.memory.percent}%` }"></div>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import {
  Cpu,
  LayoutDashboard,
  Globe,
  Network,
  Database,
  FolderTree,
  Terminal,
  Store,
  Box,
  Lock,
  ShieldCheck,
  Clock,
  ScrollText,
  Settings
} from 'lucide-vue-next'
import { useSystemStore } from '@/stores/system'

const $route = useRoute()
const systemStore = useSystemStore()

const navItems = computed(() => [
  { path: '/', label: '系统概览', icon: LayoutDashboard },
  { path: '/sites', label: '网站管理', icon: Globe },
  { path: '/stream', label: '四层转发', icon: Network, badge: 'TCP/UDP', badgeClass: 'bg-purple-500/20 text-purple-300' },
  { path: '/ssl', label: 'SSL 证书', icon: Lock },
  { path: '/docker', label: 'Docker 容器', icon: Box, badge: 'MultiArch', badgeClass: 'bg-cyan-500/20 text-cyan-300' },
  { path: '/databases', label: '数据库管理', icon: Database },
  { path: '/files', label: '文件管理器', icon: FolderTree },
  { path: '/terminal', label: 'Web 终端', icon: Terminal, badge: 'SSH', badgeClass: 'bg-emerald-500/20 text-emerald-300' },
  { path: '/appstore', label: 'ARM 软件商店', icon: Store, badge: 'ARM64', badgeClass: 'bg-indigo-500/20 text-indigo-300' },
  { path: '/security', label: '安全防护', icon: ShieldCheck },
  { path: '/crontab', label: '计划任务', icon: Clock },
  { path: '/logs', label: '日志中心', icon: ScrollText },
  { path: '/settings', label: '系统设置', icon: Settings },
])
</script>
