import apiClient, { ApiResponse } from './client'

export interface PanelBackupItem {
  file_name: string
  size_kb: number
  created_at: string
}

export interface PanelSettings {
  panel_title: string
  port: number
  security_entrance: string
  ssl_enabled: boolean
  session_timeout_minutes: number
  ip_whitelist: string
  max_login_retry: number
  eco_mode_enabled: boolean
  current_version: string
  latest_version: string
  has_update: boolean
  timezone: string
  api_token: string
  two_factor_enabled: boolean
  webhook_enabled: boolean
  webhook_type: 'feishu' | 'dingtalk' | 'wecom' | 'telegram'
  webhook_url: string
  alert_events: string[]
}

export const settingsApi = {
  getSettings: () => apiClient.get<ApiResponse<PanelSettings>>('/settings/panel'),
  updateSettings: (data: Partial<PanelSettings>) => apiClient.put<ApiResponse<void>>('/settings/panel', data),
  checkUpdate: () => apiClient.get<ApiResponse<{ current_version: string; latest_version: string; changelog: string; has_update: boolean }>>('/settings/panel/update-check'),
  
  // Admin credentials & API key
  changeAdminPassword: (data: { old_password: string; new_username?: string; new_password?: string }) => 
    apiClient.post<ApiResponse<void>>('/settings/admin/password', data),
  regenerateApiToken: () => apiClient.post<ApiResponse<{ api_token: string }>>('/settings/admin/api-token/regenerate'),
  
  // Webhooks
  testWebhook: (data: { webhook_type: string; webhook_url: string }) => 
    apiClient.post<ApiResponse<void>>('/settings/webhook-test', data),
  
  // Panel Backup & Restore
  createPanelBackup: () => apiClient.post<ApiResponse<PanelBackupItem>>('/settings/backup/create'),
  getPanelBackups: () => apiClient.get<ApiResponse<{ list: PanelBackupItem[] }>>('/settings/backup/list'),
  
  // Engine Lifecycle & Cache
  clearPanelCache: () => apiClient.post<ApiResponse<void>>('/settings/panel/clear-cache'),
  restartPanelEngine: () => apiClient.post<ApiResponse<void>>('/settings/panel/restart'),
  updateTimezone: (timezone: string) => apiClient.put<ApiResponse<void>>('/settings/system/timezone', { timezone }),
}
