<template>
  <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono border transition-all"
    :class="statusClasses">
    <span class="w-2 h-2 rounded-full" :class="dotClasses"></span>
    <span class="font-semibold">{{ boardModel || 'ARM64' }}</span>
    <span class="opacity-70">|</span>
    <span>{{ tempText }}</span>
    <span v-if="throttled" class="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-bold animate-pulse">
      降频警报
    </span>
    <span v-if="underVoltage" class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold animate-pulse">
      欠压告警
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  tempC?: number
  throttled?: boolean
  underVoltage?: boolean
  boardModel?: string
}>()

const tempText = computed(() => {
  if (props.tempC === undefined || props.tempC === null) return '-- °C'
  return `${props.tempC.toFixed(1)}°C`
})

const isHot = computed(() => (props.tempC || 0) >= 70)
const isWarm = computed(() => (props.tempC || 0) >= 55 && (props.tempC || 0) < 70)

const statusClasses = computed(() => {
  if (props.underVoltage || props.throttled || isHot.value) {
    return 'bg-rose-950/40 border-rose-800/60 text-rose-200'
  }
  if (isWarm.value) {
    return 'bg-amber-950/40 border-amber-800/60 text-amber-200'
  }
  return 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
})

const dotClasses = computed(() => {
  if (props.underVoltage || props.throttled || isHot.value) {
    return 'bg-rose-400 animate-arm-pulse'
  }
  if (isWarm.value) {
    return 'bg-amber-400 animate-arm-pulse'
  }
  return 'bg-emerald-400'
})
</script>
