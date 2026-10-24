import apiClient, { ApiResponse } from './client'
import type { MonitorPolicy } from './system'

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
  panel_ssl_cert?: string
  panel_ssl_key?: string
  session_timeout_minutes: number
  ip_whitelist: string
  max_login_retry: number
  login_lock_minutes?: number
  eco_mode_enabled: boolean
  eco_mode_threshold_mb?: number
  current_version: string
  build_commit?: string
  latest_version: string
  has_update: boolean
  timezone: string
  api_token: string
  two_factor_enabled: boolean
  webhook_enabled: boolean
  webhook_type: 'feishu' | 'dingtalk' | 'wecom' | 'telegram' | 'custom'
  webhook_url: string
  alert_events: string[]
  alert_auto_push_supported?: boolean
  runtime?: {
    effective_port: number
    saved_port: number
    port_source?: string
    port_error?: string | null
    port_overridden_by_env?: boolean
    restart_required: boolean
    effective_protocol: 'http' | 'https'
    saved_ssl_enabled?: boolean
    tls_ready?: boolean
    tls_error?: string | null
    ssl_error?: string | null
    version?: string
    build_commit?: string
  }
  monitor?: MonitorPolicy & {
    sample_interval_ms?: number
  }
}

export const settingsApi = {
  getSettings: () => apiClient.get<ApiResponse<PanelSettings>>('/settings/panel'),
  updateSettings: (data: Partial<PanelSettings>) => apiClient.put<ApiResponse<Partial<PanelSettings>>>('/settings/panel', data),
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
  deletePanelBackup: (file_name: string) =>
    apiClient.delete<ApiResponse<void>>('/settings/backup', { params: { file_name } }),
  generateSelfSignedCert: () =>
    apiClient.post<ApiResponse<{ cert_path: string; key_path: string; runtime: any }>>(
      '/settings/panel/generate-self-signed'
    ),
  
  // Engine Lifecycle & Cache
  clearPanelCache: () => apiClient.post<ApiResponse<void>>('/settings/panel/clear-cache'),
  restartPanelEngine: () => apiClient.post<ApiResponse<void>>('/settings/panel/restart'),
  updateTimezone: (timezone: string) => apiClient.put<ApiResponse<void>>('/settings/system/timezone', { timezone }),
}
