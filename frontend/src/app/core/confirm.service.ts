import { Injectable, signal } from '@angular/core'

export interface AgConfirmOptions {
  title: string
  message: string
  resourceName?: string
  impact?: string
  checkboxLabel?: string
  checkboxDefault?: boolean
  requireMatchText?: string
  confirmText?: string
  cancelText?: string
  tone?: 'danger' | 'warning' | 'primary'
  severity?: 'danger' | 'warning' | 'primary'
}

export interface AgConfirmResult {
  confirmed: boolean
  checkboxChecked: boolean
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly activeOptions = signal<AgConfirmOptions | null>(null)
  private resolver: ((result: AgConfirmResult) => void) | null = null

  ask(options: AgConfirmOptions): Promise<AgConfirmResult> {
    if (this.resolver) {
      this.resolver({ confirmed: false, checkboxChecked: false })
      this.resolver = null
    }
    const effectiveTone = options.tone || options.severity || 'danger'
    this.activeOptions.set({
      confirmText: '确认执行',
      cancelText: '取消',
      tone: effectiveTone,
      ...options,
    })
    return new Promise<AgConfirmResult>((resolve) => {
      this.resolver = resolve
    })
  }

  resolve(confirmed: boolean, checkboxChecked = false) {
    const r = this.resolver
    this.resolver = null
    this.activeOptions.set(null)
    if (r) {
      r({ confirmed, checkboxChecked })
    }
  }
}
