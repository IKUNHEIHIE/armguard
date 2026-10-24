import apiClient, { ApiResponse } from './client'

export interface OperationLog {
  id: number
  username: string
  action: string
  target: string
  ip: string
  user_agent: string
  status: 'success' | 'failed' | 'blocked'
  details?: string
  created_at: string
}

export interface SystemLogLine {
  line: string
  time: string
  level: string
  source: string
}

export const logsApi = {
  getOperationLogs: (page = 1, pageSize = 20, action?: string) =>
    apiClient.get<ApiResponse<{ list: OperationLog[]; total: number; page: number; page_size: number }>>('/logs/operation', {
      params: { page, page_size: pageSize, action: action || undefined }
    }),
  getSiteLogs: (siteId: number, type: 'access' | 'error' = 'access', lines = 200) =>
    apiClient.get<ApiResponse<{ logs: string[]; file?: string; exists?: boolean; empty?: boolean }>>(`/logs/site/${siteId}`, {
      params: { type, lines }
    }),
  getSystemLogs: (service = 'all', lines = 200) =>
    apiClient.get<ApiResponse<{ logs: string[]; service?: string; lines?: number; empty?: boolean }>>('/logs/system', {
      params: { service, lines }
    }),
}
