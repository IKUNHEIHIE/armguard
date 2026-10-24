import apiClient, { ApiResponse } from './client'

export interface CaptchaData {
  captcha_id: string
  image_base64: string
}

export interface LoginParams {
  username: string
  password: string
  captcha_id?: string
  captcha_code?: string
  totp_code?: string
}

export interface LoginResult {
  token: string
  refresh_token: string
  expires_in: number
  user: {
    id: number
    username: string
    role: 'admin' | 'operator' | 'readonly'
    totp_enabled: boolean
  }
}

export interface UserItem {
  id: number
  username: string
  role: 'admin' | 'operator' | 'readonly'
  status: 'active' | 'disabled'
  created_at: string
}

export const authApi = {
  getCaptcha: () => apiClient.get<ApiResponse<CaptchaData>>('/auth/captcha'),
  login: (data: LoginParams) => apiClient.post<ApiResponse<LoginResult>>('/auth/login', data),
  logout: () => apiClient.post<ApiResponse<void>>('/auth/logout'),
  getUserInfo: () => apiClient.get<ApiResponse<{ id: number; username: string; role: 'admin' | 'operator' | 'readonly'; totp_enabled: boolean; last_login_ip?: string }>>('/auth/user-info'),
  refreshToken: (refreshToken?: string) => apiClient.post<ApiResponse<{ token: string; refresh_token: string; expires_in: number }>>('/auth/refresh-token', { refresh_token: refreshToken }),
  createDownloadTicket: (path: string) => apiClient.post<ApiResponse<{ url: string; expires_in: number }>>('/auth/download-ticket', { path }),
  getTotpSetup: () => apiClient.get<ApiResponse<{ secret: string; qr_code_svg: string }>>('/auth/totp/setup'),
  verifyTotp: (code: string) => apiClient.post<ApiResponse<{ success: boolean }>>('/auth/totp/verify', { code }),
  getUsers: (page = 1, pageSize = 20) => apiClient.get<ApiResponse<{ list: UserItem[]; total: number }>>('/users', { params: { page, page_size: pageSize } }),
  createUser: (data: { username: string; password: string; role: string }) => apiClient.post<ApiResponse<UserItem>>('/users', data),
  updateUser: (id: number, data: { role?: string; status?: string; password?: string }) => apiClient.put<ApiResponse<UserItem>>(`/users/${id}`, data),
  deleteUser: (id: number) => apiClient.delete<ApiResponse<void>>(`/users/${id}`)
}
