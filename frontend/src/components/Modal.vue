<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm transition-opacity"
      @click.self="handleClose"
    >
      <div
        class="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        :class="[maxWidthClass, height]"
      >
        <!-- Header -->
        <div class="px-6 py-4 border-b border-slate-800 flex items-center justify-between shrink-0">
          <h3 class="text-base font-semibold text-white flex items-center gap-2">
            <slot name="icon"></slot>
            {{ title }}
          </h3>
          <div class="flex items-center gap-3">
            <slot name="header-right"></slot>
            <button
              @click="handleClose"
              class="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition"
            >
              <X class="w-5 h-5" />
            </button>
          </div>
        </div>

        <!-- Body -->
        <div :class="noPadding ? 'flex-1 flex flex-col overflow-hidden min-h-0' : 'p-6 overflow-y-auto flex-1'">
          <slot></slot>
        </div>

        <!-- Footer -->
        <div v-if="$slots.footer" class="px-6 py-3.5 bg-slate-950/40 border-t border-slate-800 flex items-center justify-end gap-3">
          <slot name="footer"></slot>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { X } from 'lucide-vue-next'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title: string
    size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'
    noPadding?: boolean
    height?: string
  }>(),
  {
    size: 'md',
    noPadding: false,
    height: ''
  }
)

const emit = defineEmits(['update:modelValue', 'close'])

const maxWidthClass = computed(() => {
  switch (props.size) {
    case 'sm': return 'max-w-md'
    case 'lg': return 'max-w-2xl'
    case 'xl': return 'max-w-4xl'
    case '2xl': return 'max-w-5xl'
    case 'full': return 'max-w-[95vw] h-[90vh]'
    default: return 'max-w-lg'
  }
})

function handleClose() {
  emit('update:modelValue', false)
  emit('close')
}
</script>
