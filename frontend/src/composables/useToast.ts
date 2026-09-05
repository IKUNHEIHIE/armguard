import { ref } from 'vue'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastItem {
  id: string
  type: ToastType
  title?: string
  message: string
  duration: number
  timer?: any
}

const toasts = ref<ToastItem[]>([])

let idCounter = 0

function addToast(type: ToastType, message: string, title?: string, duration = 3500) {
  const id = `toast-${Date.now()}-${++idCounter}`
  const item: ToastItem = {
    id,
    type,
    title,
    message,
    duration
  }

  // Limit max visible toasts to 5
  if (toasts.value.length >= 5) {
    toasts.value.shift()
  }

  toasts.value.push(item)

  if (duration > 0) {
    item.timer = setTimeout(() => {
      removeToast(id)
    }, duration)
  }

  return id
}

function removeToast(id: string) {
  const idx = toasts.value.findIndex(t => t.id === id)
  if (idx !== -1) {
    const [removed] = toasts.value.splice(idx, 1)
    if (removed.timer) {
      clearTimeout(removed.timer)
    }
  }
}

function clearToasts() {
  toasts.value.forEach(t => {
    if (t.timer) clearTimeout(t.timer)
  })
  toasts.value = []
}

export const toast = {
  success: (message: string, title?: string, duration?: number) => addToast('success', message, title, duration),
  error: (message: string, title?: string, duration?: number) => addToast('error', message, title, duration || 5000),
  warning: (message: string, title?: string, duration?: number) => addToast('warning', message, title, duration || 4000),
  info: (message: string, title?: string, duration?: number) => addToast('info', message, title, duration),
  remove: removeToast,
  clear: clearToasts
}

// Global hook
export function useToast() {
  return {
    toasts,
    toast,
    removeToast,
    clearToasts
  }
}

// Attach to window for convenience/debugging
if (typeof window !== 'undefined') {
  ;(window as any).$toast = toast
}
