import apiClient, { ApiResponse } from './client'

export interface SystemInfo {
  hostname: string
  os: string
  distribution: string
  kernel: string
  arch: string
  uptime_seconds: number
  cpu_model: string
  cpu_cores: number
  is_arm: boolean
  arm_board_model?: string
  panel_version: string
  memory_total_bytes: number
  disk_total_bytes: number
}

export interface RealtimeMonitorData {
  timestamp: number
  cpu: {
    percent: number
    cores_percent: number[]
    frequency_mhz: number
  }
  memory: {
    total: number
    used: number
    free: number
    percent: number
    swap_total: number
    swap_used: number
    swap_percent: number
  }
  disk: {
    total: number
    used: number
    free: number
    percent: number
    read_bytes_sec: number
    write_bytes_sec: number
  }
  network: {
    rx_bytes_sec: number
    tx_bytes_sec: number
    total_rx_bytes: number
    total_tx_bytes: number
  }
  load_avg: [number, number, number]
}

export interface ARMThermalData {
  temp_c: number
  temp_status: 'normal' | 'warm' | 'hot' | 'critical'
  throttled: boolean
  under_voltage: boolean
  freq_capped: boolean
  throttling_flags_hex?: string
  voltage_v?: number
  freq_mhz?: number
  governor?: string
  board_model?: string
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
