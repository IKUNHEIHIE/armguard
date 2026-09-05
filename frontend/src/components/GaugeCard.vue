<template>
  <div
    class="glass-panel p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden group transition-all duration-300 hover:translate-y-[-2px] hover:border-slate-700/90"
    :class="cardGlowClass"
  >
    <div class="flex items-center justify-between z-10">
      <div class="flex items-center gap-3">
        <div class="p-2.5 rounded-xl transition-transform duration-300 group-hover:scale-105" :class="iconBgClass">
          <slot name="icon"></slot>
        </div>
        <div>
          <div class="text-xs font-medium text-slate-400">{{ title }}</div>
          <div class="text-xl font-bold font-mono tracking-tight text-white mt-0.5 tabular-nums">
            {{ valueText }}
          </div>
        </div>
      </div>
      <div v-if="subText" class="text-right font-mono text-xs text-slate-400/90 tabular-nums">
        {{ subText }}
      </div>
    </div>

    <!-- Progress / Mini bar -->
    <div class="mt-4 z-10">
      <div class="flex justify-between text-[11px] font-mono text-slate-400 mb-1.5">
        <span>{{ percentLabel || '使用率' }}</span>
        <span class="font-bold text-slate-200 tabular-nums">{{ percent.toFixed(1) }}%</span>
      </div>
      <div class="h-2 w-full bg-slate-950/80 rounded-full overflow-hidden p-0.5 border border-slate-800/80">
        <div
          class="h-full rounded-full transition-all duration-500 ease-out shadow-sm"
          :class="barColorClass"
          :style="{ width: `${Math.min(100, Math.max(0, percent))}%` }"
        ></div>
      </div>
    </div>

    <!-- Background glow -->
    <div
      class="absolute -right-8 -bottom-8 w-28 h-28 rounded-full blur-2xl opacity-20 pointer-events-none transition-all duration-500 group-hover:opacity-40 group-hover:scale-110"
      :class="glowColorClass"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    title: string
    valueText: string
    percent: number
    percentLabel?: string
    subText?: string
    variant?: 'brand' | 'cyan' | 'amber' | 'rose' | 'indigo'
  }>(),
  {
    variant: 'brand'
  }
)

const iconBgClass = computed(() => {
  switch (props.variant) {
    case 'cyan': return 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
    case 'amber': return 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
    case 'rose': return 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
    case 'indigo': return 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
    default: return 'bg-brand-500/15 text-brand-400 border border-brand-500/30'
  }
})

const barColorClass = computed(() => {
  if (props.percent >= 90) return 'bg-rose-500'
  if (props.percent >= 75) return 'bg-amber-500'
  switch (props.variant) {
    case 'cyan': return 'bg-cyan-400'
    case 'amber': return 'bg-amber-400'
    case 'rose': return 'bg-rose-400'
    case 'indigo': return 'bg-indigo-400'
    default: return 'bg-brand-500'
  }
})

const glowColorClass = computed(() => {
  switch (props.variant) {
    case 'cyan': return 'bg-cyan-500'
    case 'amber': return 'bg-amber-500'
    case 'rose': return 'bg-rose-500'
    case 'indigo': return 'bg-indigo-500'
    default: return 'bg-brand-500'
  }
})

const cardGlowClass = computed(() => {
  if (props.percent >= 90) return 'glow-rose'
  if (props.percent >= 80) return 'glow-amber'
  switch (props.variant) {
    case 'cyan': return 'hover:glow-cyan'
    case 'indigo': return 'hover:glow-cyan'
    case 'amber': return 'hover:glow-amber'
    case 'rose': return 'hover:glow-rose'
    default: return 'hover:glow-brand'
  }
})
</script>
