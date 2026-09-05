import apiClient, { ApiResponse } from './client'

export interface CronJobItem {
  id: number
  name: string
  schedule: string // e.g. "0 3 * * *"
  command: string
  status: 'enabled' | 'disabled'
  last_run_at?: string
  last_run_status?: 'success' | 'failed'
  last_run_duration_ms?: number
  created_at: string
}

export interface CronLogItem {
  id: number
  cron_id: number
  status: 'success' | 'failed'
  output: string
  duration_ms: number
  run_at: string
}

export const crontabApi = {
  getList: () => apiClient.get<ApiResponse<{ list: CronJobItem[] }>>('/crontabs'),
  create: (data: { name: string; schedule: string; command: string }) => apiClient.post<ApiResponse<CronJobItem>>('/crontabs', data),
  update: (id: number, data: Partial<CronJobItem>) => apiClient.put<ApiResponse<CronJobItem>>(`/crontabs/${id}`, data),
  delete: (id: number) => apiClient.delete<ApiResponse<void>>(`/crontabs/${id}`),
  runOnce: (id: number) => apiClient.post<ApiResponse<{ log_id: number; output: string }>>(`/crontabs/${id}/run-once`),
  getHistory: (id: number) => apiClient.get<ApiResponse<{ list: CronLogItem[] }>>(`/crontabs/${id}/history`),
}
