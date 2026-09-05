import apiClient, { ApiResponse, PaginatedList } from './client'

export interface SiteItem {
  id: number
  domain: string
  domains: string[]
  path: string
  sub_dir?: string
  port?: number
  php_version: string // 'static', 'php74', 'php81', 'php82', 'php83', 'php84', 'proxy'
  proxy_enabled?: boolean
  proxy_pass?: string
  proxy_path?: string
  grpc_enabled?: boolean
  websocket_enabled?: boolean
  rewrite_preset?: 'spa' | 'wordpress' | 'laravel' | 'typecho' | 'none'
  custom_rewrite?: string
  default_index?: string
  basic_auth_enabled?: boolean
  basic_auth_user?: string
  basic_auth_pass?: string
  hotlink_protection?: boolean
  status: 'running' | 'stopped'
  ssl_enabled: boolean
  ssl_force_https?: boolean
  ssl_expires_at?: string
  created_at: string
}

export interface CreateSiteParams {
  domain: string
  domains?: string[]
  path?: string
  sub_dir?: string
  port?: number
  php_version: string
  proxy_enabled?: boolean
  proxy_pass?: string
  grpc_enabled?: boolean
  rewrite_preset?: string
  remark?: string
}

export const siteApi = {
  getSites: (page = 1, pageSize = 20) => apiClient.get<ApiResponse<PaginatedList<SiteItem>>>('/sites', { params: { page, page_size: pageSize } }),
  getSiteDetails: (id: number) => apiClient.get<ApiResponse<SiteItem>>(`/sites/${id}/details`),
  createSite: (data: CreateSiteParams) => apiClient.post<ApiResponse<SiteItem>>('/sites', data),
  updateSiteSettings: (id: number, data: Partial<SiteItem>) => apiClient.put<ApiResponse<SiteItem>>(`/sites/${id}/settings`, data),
  deleteSite: (id: number, deleteFiles = false) => apiClient.delete<ApiResponse<void>>(`/sites/${id}`, { params: { delete_files: deleteFiles } }),
  toggleSite: (id: number) => apiClient.put<ApiResponse<{ status: 'running' | 'stopped' }>>(`/sites/${id}/toggle`),
  getSiteConfig: (id: number) => apiClient.get<ApiResponse<{ nginx_conf: string }>>(`/sites/${id}/config`),
  saveSiteConfig: (id: number, conf: string) => apiClient.put<ApiResponse<void>>(`/sites/${id}/config`, { nginx_conf: conf }),
  getSiteLogs: (id: number, type: 'access' | 'error' = 'access') => apiClient.get<ApiResponse<{ logs: string[] }>>(`/sites/${id}/logs`, { params: { type } }),
  clearSiteLogs: (id: number, type: 'access' | 'error' = 'access') => apiClient.delete<ApiResponse<void>>(`/sites/${id}/logs`, { params: { type } }),
  getSiteSSL: (id: number) => apiClient.get<ApiResponse<{ ssl_enabled: boolean; ssl_force_https: boolean; cert: string; key: string; has_cert_files: boolean }>>(`/sites/${id}/ssl`),
  saveSiteSSL: (id: number, data: { cert?: string; key?: string; ssl_enabled: boolean; ssl_force_https?: boolean }) => apiClient.put<ApiResponse<void>>(`/sites/${id}/ssl`, data),
}
