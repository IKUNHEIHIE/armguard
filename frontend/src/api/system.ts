import apiClient, { ApiResponse } from './client'

export interface SystemInfo {
  hostname: string
  os: string
  distribution: string | null
  kernel: string
  arch: string
  uptime_seconds: number
  cpu_model: string | null
  cpu_cores: number
  is_arm: boolean
  arm_board_model?: string | null
  panel_version: string
  memory_total_bytes: number | null
  disk_total_bytes: number | null
}

export interface CpuFreqPolicy {
  id: string
  cpus: number[]
  cur_mhz: number | null
  min_mhz: number | null
  max_mhz: number | null
  hw_max_mhz: number | null
  governor: string | null
}

export interface MonitorPolicy {
  eco_mode_enabled: boolean
  eco_mode_active: boolean
  eco_mode_threshold_mb: number
  eco_reason: string
  interval_ms: number
  host_cores: number
  host_memory_mb: number
}

export interface RealtimeMonitorData {
  timestamp: number | null
  cpu: {
    percent: number | null
    cores_percent: (number | null)[]
    frequency_mhz: number | null
    max_frequency_mhz?: number | null
    governor?: string | null
    policies?: CpuFreqPolicy[]
  }
  memory: {
    total: number | null
    used: number | null
    free: number | null
    percent: number | null
    swap_total: number | null
    swap_used: number | null
    swap_percent: number | null
  }
  disk: {
    total: number | null
    used: number | null
    free: number | null
    percent: number | null
    status?: string
    updated_at?: number | null
    read_bytes_sec: number | null
    write_bytes_sec: number | null
  }
  network: {
    rx_bytes_sec: number | null
    tx_bytes_sec: number | null
    total_rx_bytes: number | null
    total_tx_bytes: number | null
  }
  load_avg: [number | null, number | null, number | null]
  monitor?: MonitorPolicy
}

export interface ARMThermalData {
  temp_c: number | null
  temp_status: 'normal' | 'warm' | 'hot' | 'critical' | 'unknown'
  temp_source?: string | null
  throttle_source?: string | null
  throttled: boolean | null
  under_voltage: boolean | null
  freq_capped: boolean | null
  throttling_flags_hex?: string | null
  voltage_v?: number | null
  freq_mhz?: number | null
  max_freq_mhz?: number | null
  governor?: string | null
  board_model?: string | null
  collected_at?: number | null
  cooling_device?: {
    type: string
    cur_state: number
    max_state: number
  }
}

export interface ProcessItem {
  pid: number
  name: string
  user: string
  cpu_percent: number
  mem_percent: number
  mem_bytes: number
  status: string
  command: string
}

export const systemApi = {
  getSystemInfo: () => apiClient.get<ApiResponse<SystemInfo>>('/system/info'),
  getRealtimeMonitor: () => apiClient.get<ApiResponse<RealtimeMonitorData>>('/system/monitor/realtime'),
  getARMThermal: () => apiClient.get<ApiResponse<ARMThermalData>>('/system/hardware/thermal'),
  getHistory: (range = '1h') => apiClient.get<ApiResponse<{ timestamps: string[]; cpu: number[]; memory: number[]; temp: number[]; net_rx: number[]; net_tx: number[] }>>('/system/monitor/history', { params: { range } }),
  getProcesses: (sortBy: 'cpu' | 'mem' = 'cpu', limit = 30) => apiClient.get<ApiResponse<{ list: ProcessItem[] }>>('/system/processes', { params: { sort_by: sortBy, limit } }),
  killProcess: (pid: number) => apiClient.post<ApiResponse<void>>(`/system/processes/${pid}/kill`),
}
