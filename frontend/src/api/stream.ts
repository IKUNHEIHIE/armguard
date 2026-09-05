import apiClient, { ApiResponse, PaginatedList } from './client'

export interface StreamRuleItem {
  id: number
  name: string
  protocol: 'tcp' | 'udp' | 'tcp+udp'
  listen_port: number
  target_host: string
  target_port: number
  proxy_timeout?: string
  proxy_connect_timeout?: string
  description?: string
  status: 'running' | 'stopped'
  created_at: string
}

export interface CreateStreamRuleParams {
  name: string
  protocol: 'tcp' | 'udp' | 'tcp+udp'
  listen_port: number
  target_host: string
  target_port: number
  proxy_timeout?: string
  proxy_connect_timeout?: string
  description?: string
}

export const streamApi = {
  getStreamList: () => apiClient.get<ApiResponse<PaginatedList<StreamRuleItem>>>('/stream/list'),
  createStreamRule: (data: CreateStreamRuleParams) => apiClient.post<ApiResponse<StreamRuleItem>>('/stream/create', data),
  updateStreamRule: (id: number, data: Partial<CreateStreamRuleParams>) => apiClient.put<ApiResponse<StreamRuleItem>>(`/stream/${id}`, data),
  toggleStreamRule: (id: number) => apiClient.post<ApiResponse<StreamRuleItem>>(`/stream/${id}/toggle`),
  deleteStreamRule: (id: number) => apiClient.delete<ApiResponse<void>>(`/stream/${id}`),
}
