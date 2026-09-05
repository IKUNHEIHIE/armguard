import { ref } from 'vue'

type EventCallback = (...args: any[]) => void

class EventBus {
  private events: Map<string, Set<EventCallback>> = new Map()

  on(event: string, callback: EventCallback) {
    if (!this.events.has(event)) {
      this.events.set(event, new Set())
    }
    this.events.get(event)!.add(callback)
    return () => this.off(event, callback)
  }

  off(event: string, callback: EventCallback) {
    const callbacks = this.events.get(event)
    if (callbacks) {
      callbacks.delete(callback)
      if (callbacks.size === 0) {
        this.events.delete(event)
      }
    }
  }

  emit(event: string, ...args: any[]) {
    const callbacks = this.events.get(event)
    if (callbacks) {
      callbacks.forEach(cb => {
        try {
          cb(...args)
        } catch (err) {
          console.error(`[EventBus] Error in listener for "${event}":`, err)
        }
      })
    }
  }
}

export const eventBus = new EventBus()

export const EVENTS = {
  SETTINGS_UPDATED: 'settings-updated',
  AI_CONFIG_UPDATED: 'ai-config-updated',
  APPS_UPDATED: 'apps-updated',
  WARP_UPDATED: 'warp-updated',
  SITES_UPDATED: 'sites-updated',
  DOCKER_UPDATED: 'docker-updated',
  CRON_UPDATED: 'cron-updated',
  TERMINAL_REFRESH: 'terminal-refresh'
} as const
