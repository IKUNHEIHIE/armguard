import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi, LoginParams, LoginResult } from '@/api/auth'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string>(localStorage.getItem('armguard_token') || '')
  const user = ref<LoginResult['user'] | null>(
    localStorage.getItem('armguard_user')
      ? JSON.parse(localStorage.getItem('armguard_user')!)
      : null
  )

  const isAuthenticated = computed(() => !!token.value)
  const role = computed(() => user.value?.role || 'readonly')
  const isAdmin = computed(() => role.value === 'admin')

  async function login(params: LoginParams) {
    try {
      const res = await authApi.login(params)
      if (res.data.code === 0) {
        token.value = res.data.data.token
        user.value = res.data.data.user
        localStorage.setItem('armguard_token', token.value)
        localStorage.setItem('armguard_user', JSON.stringify(user.value))
        return { success: true }
      }
      return { success: false, message: res.data.message }
    } catch (err: any) {
      return { success: false, message: err.message || '登录失败' }
    }
  }

  function logout() {
    try {
      authApi.logout().catch(() => {})
    } finally {
      token.value = ''
      user.value = null
      localStorage.removeItem('armguard_token')
      localStorage.removeItem('armguard_user')
    }
  }

  return {
    token,
    user,
    isAuthenticated,
    role,
    isAdmin,
    login,
    logout
  }
})
