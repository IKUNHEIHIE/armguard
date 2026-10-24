import { Injectable, signal } from '@angular/core'
import {
  systemApi,
  SystemInfo,
  RealtimeMonitorData,
  ARMThermalData,
  ProcessItem,
  MonitorPolicy,
} from '@/api/system'
import { settingsApi } from '@/api/settings'

@Injectable({ providedIn: 'root' })
export class SystemService {
  readonly panelTitle = signal<string>(localStorage.getItem('armguard_panel_title') || 'ArmGuard')
  readonly info = signal<SystemInfo | null>(null)
  readonly realtime = signal<RealtimeMonitorData>({
    timestamp: null,
    cpu: {
      percent: null,
      cores_percent: [],
      frequency_mhz: null,
      max_frequency_mhz: null,
      governor: null,
      policies: [],
    },
    memory: {
      total: null,
      used: null,
      free: null,
      percent: null,
      swap_total: null,
      swap_used: null,
      swap_percent: null,
    },
    disk: {
      total: null,
      used: null,
      free: null,
      percent: null,
      read_bytes_sec: null,
      write_bytes_sec: null,
    },
    network: {
      rx_bytes_sec: null,
      tx_bytes_sec: null,
      total_rx_bytes: null,
      total_tx_bytes: null,
    },
    load_avg: [null, null, null],
  })

  readonly thermal = signal<ARMThermalData>({
    temp_c: null,
    temp_status: 'unknown',
    temp_source: null,
    throttle_source: null,
    throttled: null,
    under_voltage: null,
    freq_capped: null,
    throttling_flags_hex: null,
    voltage_v: null,
    freq_mhz: null,
    max_freq_mhz: null,
    governor: null,
  })

  readonly processes = signal<ProcessItem[]>([])
  readonly wsConnected = signal<boolean>(false)
  readonly monitorPolicy = signal<MonitorPolicy | null>(null)
  readonly pollIntervalMs = signal<number>(1000)

  private monitorActive = false
  private monitorGeneration = 0
  private pollTimer: ReturnType<typeof setTimeout> | null = null
  private wsInstance: WebSocket | null = null

  setPanelTitle(title: string) {
    if (!title) return
    this.panelTitle.set(title)
    localStorage.setItem('armguard_panel_title', title)
    document.title = `${title} - Material Design 3 ARM 运维控制台`
  }

  applyMonitorPolicy(policy?: MonitorPolicy | null) {
    if (!policy) return
    this.monitorPolicy.set(policy)
    if (typeof policy.interval_ms === 'number' && policy.interval_ms >= 500) {
      this.pollIntervalMs.set(policy.interval_ms)
    }
  }

  async fetchPanelSettings() {
    try {
      const res = await settingsApi.getSettings()
      const data = res.data?.data
      if (data?.panel_title) {
        this.setPanelTitle(data.panel_title)
      }
      if (data?.monitor) {
        this.applyMonitorPolicy(data.monitor)
      }
    } catch {}
  }

  async fetchInfo() {
    try {
      const res = await systemApi.getSystemInfo()
      if (res.data.code === 0 && res.data.data) {
        this.info.set(res.data.data)
      }
    } catch (e) {
      console.warn('Failed to fetch system info:', e)
    }
  }

  async fetchRealtime() {
    try {
      const [resRt, resTh] = await Promise.all([
        systemApi.getRealtimeMonitor(),
        systemApi.getARMThermal(),
      ])
      if (resRt.data.code === 0 && resRt.data.data) {
        this.realtime.set(resRt.data.data)
        if (resRt.data.data.monitor) {
          this.applyMonitorPolicy(resRt.data.data.monitor)
        }
      }
      if (resTh.data.code === 0 && resTh.data.data) {
        this.thermal.set(resTh.data.data)
      }
    } catch (e) {
      console.warn('Failed to poll realtime telemetry:', e)
    }
  }

  async fetchProcesses(sortBy: 'cpu' | 'mem' = 'cpu', limit = 30, passive = false) {
    try {
      const res = await systemApi.getProcesses(sortBy, limit, passive)
      if (res.data.code === 0 && res.data.data) {
        this.processes.set(res.data.data.list || [])
      }
    } catch (e) {
      console.warn('Failed to fetch processes:', e)
    }
  }

  async killProcess(pid: number, force = false) {
    const res = await systemApi.killProcess(pid, force)
    if (res.data.code === 0) {
      await this.fetchProcesses()
      return true
    }
    return false
  }

  private clearPollTimer() {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer)
      this.pollTimer = null
    }
  }

  private scheduleFallbackPoll(gen: number) {
    this.clearPollTimer()
    if (!this.monitorActive || gen !== this.monitorGeneration) return
    this.pollTimer = setTimeout(async () => {
      if (!this.monitorActive || gen !== this.monitorGeneration) return
      await this.fetchRealtime()
      this.scheduleFallbackPoll(gen)
    }, this.pollIntervalMs())
  }

  private startFallbackPolling(gen: number) {
    if (!this.monitorActive || gen !== this.monitorGeneration) return
    this.clearPollTimer()
    this.fetchRealtime().finally(() => {
      this.scheduleFallbackPoll(gen)
    })
  }

  startMonitoring() {
    if (this.monitorActive) return
    const token = localStorage.getItem('armguard_token')
    if (!token) return

    this.monitorActive = true
    this.monitorGeneration += 1
    const gen = this.monitorGeneration

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${window.location.host}/system/monitor/ws`

    try {
      const ws = new WebSocket(wsUrl, ['armguard.v1', token])
      this.wsInstance = ws

      ws.onopen = () => {
        if (!this.monitorActive || gen !== this.monitorGeneration) {
          ws.close()
          return
        }
        this.wsConnected.set(true)
        this.clearPollTimer()
      }

      ws.onmessage = (event) => {
        if (!this.monitorActive || gen !== this.monitorGeneration) return
        try {
          const data = JSON.parse(event.data)
          if (data.realtime) this.realtime.set(data.realtime)
          if (data.arm_thermal) this.thermal.set(data.arm_thermal)
          if (data.monitor) this.applyMonitorPolicy(data.monitor)
        } catch (e) {
          console.error('Invalid WS telemetry payload:', e)
        }
      }

      ws.onclose = () => {
        if (this.wsInstance === ws) this.wsInstance = null
        this.wsConnected.set(false)
        if (this.monitorActive && gen === this.monitorGeneration) {
          this.startFallbackPolling(gen)
        }
      }

      ws.onerror = () => {
        ws.close()
      }
    } catch {
      this.startFallbackPolling(gen)
    }
  }

  stopMonitoring() {
    this.monitorActive = false
    this.monitorGeneration += 1
    this.clearPollTimer()
    if (this.wsInstance) {
      const ws = this.wsInstance
      this.wsInstance = null
      ws.onclose = null
      ws.onerror = null
      ws.onmessage = null
      try {
        ws.close()
      } catch {}
    }
    this.wsConnected.set(false)
  }
}
