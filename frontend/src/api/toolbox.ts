import apiClient, { ApiResponse } from './client'

export interface DnsState {
  mode: 'networkmanager' | 'systemd-resolved' | 'resolv.conf'
  servers: string[]
  effective: string[]
  auto_dns: boolean | null
  connection?: string | null
  file: string
  hint: string
}

export interface SwapDevice {
  filename: string
  type: string
  size_kb: number
  used_kb: number
  priority: number
}

export interface SwapState {
  devices: SwapDevice[]
  swap_total_mb: number
  swap_used_mb: number
  memory_total_mb: number | null
  swappiness: number
  swap_file: string
  swap_file_exists: boolean
  swap_file_size_mb: number
  persisted: boolean
  fstab_path: string
}

export interface TimezoneState {
  current: string
  zones: string[]
  zoneinfo_dir: string
}

export interface HostsState {
  path: string
  content: string
  size_bytes: number
}

export interface MirrorPreset {
  id: string
  name: string
  debian: string
  security: string
  note: string
}

export interface MirrorState {
  os: { id: string | null; codename: string | null; pretty: string | null }
  format: 'one-line' | 'deb822'
  file: string
  presets: MirrorPreset[]
  current_id: string | null
  current_url: string | null
  content: string
}

export const toolboxApi = {
  getDns: () => apiClient.get<ApiResponse<DnsState>>('/toolbox/dns'),
  setDns: (servers: string[]) => apiClient.put<ApiResponse<any>>('/toolbox/dns', { servers }),

  getSwap: () => apiClient.get<ApiResponse<SwapState>>('/toolbox/swap'),
  createSwap: (sizeMb: number, swappiness?: number) =>
    apiClient.post<ApiResponse<any>>('/toolbox/swap', { size_mb: sizeMb, swappiness }),
  removeSwap: () => apiClient.delete<ApiResponse<any>>('/toolbox/swap'),
  setSwappiness: (swappiness: number) =>
    apiClient.put<ApiResponse<any>>('/toolbox/swap/swappiness', { swappiness }),

  getTimezone: () => apiClient.get<ApiResponse<TimezoneState>>('/toolbox/timezone'),
  setTimezone: (timezone: string) => apiClient.put<ApiResponse<any>>('/toolbox/timezone', { timezone }),

  getHosts: () => apiClient.get<ApiResponse<HostsState>>('/toolbox/hosts'),
  setHosts: (content: string) => apiClient.put<ApiResponse<any>>('/toolbox/hosts', { content }),

  getMirrors: () => apiClient.get<ApiResponse<MirrorState>>('/toolbox/mirrors'),
  setMirror: (payload: { mirror_id: string; url?: string; security_url?: string }) =>
    apiClient.put<ApiResponse<any>>('/toolbox/mirrors', payload),
  updateIndex: () => apiClient.post<ApiResponse<{ output: string }>>('/toolbox/mirrors/update'),
}
