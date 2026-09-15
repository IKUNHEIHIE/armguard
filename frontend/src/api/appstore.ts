import apiClient, { ApiResponse } from './client'

export interface AppMarketItem {
  key: string
  name: string
  category: 'webserver' | 'database' | 'runtime' | 'tools' | 'cache' | 'network'
  description: string
  icon: string
  versions: string[]
  current_version?: string
  status: 'not_installed' | 'installing' | 'installed' | 'error'
  service_status?: 'running' | 'stopped'
  arch_support: ('arm64' | 'armv7' | 'x86_64')[]
  has_prebuilt: boolean // whether official prebuilt binary is available
  estimated_compile_minutes?: number // estimated build time on SBC (e.g. RPi4)
  homepage?: string
}

export interface AppTaskProgress {
  task_id: string
  app_key: string
  stage: 'downloading' | 'compiling' | 'installing' | 'configuring' | 'done' | 'failed'
  progress_percent: number
  log_tail: string
  logs?: string[]
  error_message?: string
}

export interface PhpVersionItem {
  version: string
  name: string
  installed: boolean
  is_default: boolean
  service_name: string
  status: 'running' | 'stopped'
  pid: number
  memory_mb: number
  socket: string
  config_path: string
}

export interface AppManagementData {
  app_key: string
  app_name: string
  service_name: string
  status: 'running' | 'stopped' | 'installed' | 'not_installed'
  pid: number
  memory_mb: number
  config_file_path: string
  raw_config: string
  visual_config: Record<string, any>
}

export const appStoreApi = {
  getMarketList: () => apiClient.get<ApiResponse<{ list: AppMarketItem[] }>>('/apps/market'),
  getInstalledList: () => apiClient.get<ApiResponse<{ list: AppMarketItem[] }>>('/apps/installed'),
  installApp: (key: string, version: string, compileFromSource = false) => apiClient.post<ApiResponse<{ task_id: string }>>(`/apps/${key}/install`, { version, compile_from_source: compileFromSource }),
  uninstallApp: (key: string) => apiClient.post<ApiResponse<void>>(`/apps/${key}/uninstall`),
  getTaskProgress: (key: string, taskId: string) => apiClient.get<ApiResponse<AppTaskProgress>>(`/apps/${key}/install-progress`, { params: { task_id: taskId } }),
  
  // Management & Control APIs
  getAppManagement: (key: string, version?: string) => apiClient.get<ApiResponse<AppManagementData>>(`/apps/${key}/management`, { params: version ? { version } : undefined }),
  controlAppService: (key: string, action: 'start' | 'stop' | 'restart' | 'reload', version?: string) => apiClient.post<ApiResponse<void>>(`/apps/${key}/service-control`, { action, version }),
  saveVisualConfig: (key: string, config: any) => apiClient.put<ApiResponse<void>>(`/apps/${key}/visual-config`, { config }),
  saveRawConfig: (key: string, filePath: string, content: string) => apiClient.put<ApiResponse<void>>(`/apps/${key}/raw-config`, { file_path: filePath, content }),
  getAppLogs: (key: string, version?: string, type?: string) => apiClient.get<ApiResponse<{ logs: string[] }>>(`/apps/${key}/logs`, { params: { version, type } }),
  
  // PHP Multi-Version Management APIs
  switchPhpVersion: (version: string) => apiClient.post<ApiResponse<void>>('/apps/php/switch-version', { version }),
  installPhpVersion: (version: string) => apiClient.post<ApiResponse<{ task_id: string }>>('/apps/php/install-version', { version }),

  // MySQL Management APIs
  changeMysqlRootPassword: (password: string) => apiClient.post<ApiResponse<void>>('/apps/mysql/root-password', { password }),
  switchMysqlVersion: (targetVersion: string) => apiClient.post<ApiResponse<{ task_id: string }>>('/apps/mysql/switch-version', { target_version: targetVersion }),
}
