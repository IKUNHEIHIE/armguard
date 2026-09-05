<template>
  <div class="fixed top-5 right-5 z-[99999] flex flex-col gap-2.5 pointer-events-none max-w-[92vw] w-96">
    <TransitionGroup
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="transform translate-y-[-20px] opacity-0 scale-95"
      enter-to-class="transform translate-y-0 opacity-100 scale-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="transform translate-y-0 opacity-100 scale-100"
      leave-to-class="transform translate-x-8 opacity-0 scale-95"
    >
      <div
        v-for="item in toasts"
        :key="item.id"
        class="pointer-events-auto relative overflow-hidden rounded-2xl p-4 border shadow-2xl backdrop-blur-2xl transition-all duration-200 select-none"
        :class="getToastStyles(item.type)"
      >
        <!-- Background subtle glow -->
        <div class="flex items-start gap-3">
          <!-- Icon -->
          <div class="shrink-0 mt-0.5">
            <CheckCircle2 v-if="item.type === 'success'" class="w-5 h-5 text-emerald-400" />
            <AlertCircle v-else-if="item.type === 'error'" class="w-5 h-5 text-rose-400" />
            <AlertTriangle v-else-if="item.type === 'warning'" class="w-5 h-5 text-amber-400" />
            <Info v-else class="w-5 h-5 text-cyan-400" />
          </div>

          <!-- Text content -->
          <div class="flex-1 min-w-0 pr-2">
            <h4 v-if="item.title" class="text-xs font-bold text-white mb-0.5 tracking-tight">
              {{ item.title }}
            </h4>
            <p class="text-xs text-slate-200 leading-relaxed font-mono whitespace-pre-wrap break-words">
              {{ item.message }}
            </p>
          </div>

          <!-- Close button -->
          <button
            @click="removeToast(item.id)"
            class="shrink-0 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
            title="关闭"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        <!-- Progress bar countdown -->
        <div
          v-if="item.duration > 0"
          class="absolute bottom-0 left-0 h-[2px] opacity-70"
          :class="getProgressBarColor(item.type)"
          :style="{
            animation: `toastProgress ${item.duration}ms linear forwards`
          }"
        ></div>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-vue-next'
import { useToast, ToastType } from '@/composables/useToast'

const { toasts, removeToast } = useToast()

function getToastStyles(type: ToastType) {
  switch (type) {
    case 'success':
      return 'bg-slate-950/95 border-emerald-500/40 text-emerald-300 shadow-emerald-950/30'
    case 'error':
      return 'bg-slate-950/95 border-rose-500/40 text-rose-300 shadow-rose-950/30'
    case 'warning':
      return 'bg-slate-950/95 border-amber-500/40 text-amber-300 shadow-amber-950/30'
    case 'info':
    default:
      return 'bg-slate-950/95 border-cyan-500/40 text-cyan-300 shadow-cyan-950/30'
  }
}

function getProgressBarColor(type: ToastType) {
  switch (type) {
    case 'success': return 'bg-emerald-400'
    case 'error': return 'bg-rose-400'
    case 'warning': return 'bg-amber-400'
    case 'info':
    default: return 'bg-cyan-400'
  }
}
</script>

<style scoped>
@keyframes toastProgress {
  from {
    width: 100%;
  }
  to {
    width: 0%;
  }
}
</style>
