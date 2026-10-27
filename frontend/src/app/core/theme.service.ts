import { Injectable, signal } from '@angular/core'

export type M3ThemeMode = 'dark' | 'light'

/**
 * 主题模式。设计稿以浅色为基准（Google Cloud Console 风格），
 * 因此默认浅色；深色是 MD3 角色化令牌的另一套取值，仅在用户主动切换时启用。
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<M3ThemeMode>(
    localStorage.getItem('armguard_theme') === 'dark' ? 'dark' : 'light'
  )

  constructor() {
    this.applyTheme(this.mode())
  }

  toggleTheme() {
    const next: M3ThemeMode = this.mode() === 'dark' ? 'light' : 'dark'
    this.setTheme(next)
  }

  setTheme(mode: M3ThemeMode) {
    this.mode.set(mode)
    localStorage.setItem('armguard_theme', mode)
    this.applyTheme(mode)
  }

  private applyTheme(mode: M3ThemeMode) {
    const html = document.documentElement
    html.classList.remove('dark-theme', 'light-theme')
    html.classList.add(mode === 'light' ? 'light-theme' : 'dark-theme')
    // 浏览器 UI（地址栏 / 滚动条）跟随主题
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', mode === 'light' ? '#f7f9ff' : '#111318')
  }
}
