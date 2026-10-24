import { Injectable, signal } from '@angular/core'

export type M3ThemeMode = 'dark' | 'light'

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<M3ThemeMode>(
    (localStorage.getItem('armguard_theme') as M3ThemeMode) === 'light' ? 'light' : 'dark'
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
  }
}
