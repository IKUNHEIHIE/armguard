import { Injectable, signal, computed } from '@angular/core'
import { authApi, LoginParams } from '@/api/auth'

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly token = signal<string>(localStorage.getItem('armguard_token') || '')
  readonly user = signal<any>(this.loadStoredUser())
  readonly isLoggedIn = computed(() => Boolean(this.token()))

  private loadStoredUser() {
    try {
      const raw = localStorage.getItem('armguard_user')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  async login(params: LoginParams): Promise<boolean> {
    const res = await authApi.login(params)
    if (res.data.code === 0 && res.data.data) {
      this.token.set(res.data.data.token)
      this.user.set(res.data.data.user)
      localStorage.setItem('armguard_token', res.data.data.token)
      localStorage.setItem('armguard_user', JSON.stringify(res.data.data.user))
      return true
    }
    return false
  }

  async refreshUserInfo() {
    if (!this.token()) return null
    try {
      const res = await authApi.getUserInfo()
      if (res.data?.code === 0 && res.data.data) {
        this.user.set(res.data.data)
        localStorage.setItem('armguard_user', JSON.stringify(res.data.data))
        return res.data.data
      }
    } catch {}
    return null
  }

  async logout() {
    try {
      await authApi.logout()
    } catch {
      // Ignore network errors on logout
    } finally {
      this.token.set('')
      this.user.set(null)
      localStorage.removeItem('armguard_token')
      localStorage.removeItem('armguard_user')
    }
  }
}
