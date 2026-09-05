import apiClient, { ApiResponse } from './client'

export interface WarpConfig {
  installed: boolean
  status: 'connected' | 'disconnected' | 'connecting' | 'error'
  mode: 'socks5' | 'ipv4' | 'ipv6' | 'dual'
  wireguard_type: 'kernel' | 'wireguard-go'
  license_key: string
  account_type: 'free' | 'plus' | 'teams'
  reserved_bytes: string
  socks5_port: number
  auto_start: boolean
  endpoint: string
  connected_at?: string
  error_message?: string
}

export interface WarpTraceInfo {
  warp_status: 'on' | 'plus' | 'off'
  ipv4: string
  ipv6: string
  colo: string
  location?: string
  latency_ms: number
  isp: string
  country: string
  account_type: string
  wireguard_type: string
  mode: string
  socks5_port: number
}

export interface WarpSystemHealth {
  kernel_wireguard: boolean
  wireguard_tools: boolean
  wireguard_go: {
    installed: boolean
    version: string
    path: string
  }
  account: {
    registered: boolean
    account_id: string
    v4: string
    v6: string
    account_type: string
  }
  tunnel: {
    active: boolean
    interface: string
    transfer: string
  }
}

export interface WarpStatusResponse {
  config: WarpConfig
  trace: WarpTraceInfo
  system_health: WarpSystemHealth
  has_kernel_support: boolean
}

export const warpApi = {
  getStatus: () => apiClient.get<ApiResponse<WarpStatusResponse>>('/plugins/warp/status'),
  updateConfig: (data: Partial<WarpConfig>) => apiClient.post<ApiResponse<{ config: WarpConfig; trace: WarpTraceInfo; system_health: WarpSystemHealth }>>('/plugins/warp/config', data),
  connect: (data?: Partial<WarpConfig>) => apiClient.post<ApiResponse<{ config: WarpConfig; trace: WarpTraceInfo; system_health: WarpSystemHealth }>>('/plugins/warp/connect', data || {}),
  disconnect: () => apiClient.post<ApiResponse<{ config: WarpConfig; trace: WarpTraceInfo; system_health: WarpSystemHealth }>>('/plugins/warp/disconnect', {}),
  installEngine: () => apiClient.post<ApiResponse<{ system_health: WarpSystemHealth }>>('/plugins/warp/install-engine', {}),
  registerAccount: () => apiClient.post<ApiResponse<{ account: any; system_health: WarpSystemHealth }>>('/plugins/warp/register-account', {}),
  probeTrace: () => apiClient.post<ApiResponse<{ trace: WarpTraceInfo; system_health: WarpSystemHealth }>>('/plugins/warp/trace', {})
}
