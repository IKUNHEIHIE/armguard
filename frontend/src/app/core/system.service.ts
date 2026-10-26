import { Injectable, computed, signal } from '@angular/core'
import {
  systemApi,
  SystemInfo,
  RealtimeMonitorData,
  ARMThermalData,
  ProcessItem,
  MonitorPolicy,
} from '@/api/system'
import { settingsApi } from '@/api/settings'

export interface TelemetrySamplePoint {
  timestamp: number
  time: string
  cpu: number | null
  mem: number | null
  rxKb: number | null
  txKb: number | null
}

export type TelemetryConnectionState = 'ws_live' | 'http_polling' | 'reconnecting' | 'offline'

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
  readonly processesLoading = signal<boolean>(false)
  readonly processesError = signal<string | null>(null)

  readonly wsConnected = signal<boolean>(false)
  readonly connectionState = signal<TelemetryConnectionState>('reconnecting')
  readonly lastSuccessAt = signal<number | null>(null)
  readonly lastError = signal<string | null>(null)
  readonly consecutiveFailures = signal<number>(0)

  readonly monitorPolicy = signal<MonitorPolicy | null>(null)
  readonly pollIntervalMs = signal<number>(1000)

  // Persistent session telemetry history so navigating away from Dashboard and back preserves chart curve (FE-016)
  readonly telemetryHistory = signal<TelemetrySamplePoint[]>([])
  private lastSampleTimestamp: number | null = null

  readonly isStale = computed(() => {
    const fails = this.consecutiveFailures()
    if (fails >= 2) return true
    const last = this.lastSuccessAt()
    if (!last) return false
    const threshold = Math.max(12000, this.pollIntervalMs() * 4)
    return Date.now() - last > threshold
  })

  readonly lastUpdatedLabel = computed(() => {
    const ts = this.lastSuccessAt()
    if (!ts) return '尚未完成首次采集'
    const d = new Date(ts)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
  })

  readonly connectionBadgeLabel = computed(() => {
    const state = this.connectionState()
    if (state === 'ws_live') return 'WebSocket 实时流'
    if (state === 'http_polling') return 'HTTP 轮询模式'
    if (state === 'reconnecting') return '正在重连遥测链路...'
    return '连接中断 · 数据已过期'
  })

  readonly connectionBadgeClass = computed(() => {
    const state = this.connectionState()
    if (state === 'ws_live') return 'success'
    if (state === 'http_polling') return 'primary'
    if (state === 'reconnecting') return 'warning'
    return 'danger'
  })

  private monitorActive = false
  private monitorGeneration = 0
  private pollTimer: ReturnType<typeof setTimeout> | null = null
  private wsRetryTimer: ReturnType<typeof setTimeout> | null = null
  private wsInstance: WebSocket | null = null
  private wsBackoffAttempt = 0

  private lastSettingsFetchedAt = 0
  private lastInfoFetchedAt = 0

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && this.monitorActive) {
          if (!this.wsConnected()) {
            this.fetchRealtime(true)
          }
        }
      })
    }
  }

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

  private recordSample(rt: RealtimeMonitorData) {
    const ts = rt.timestamp || Date.now()
    if (ts === this.lastSampleTimestamp) return
    this.lastSampleTimestamp = ts
    const d = new Date(ts)
    const label = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
    const pt: TelemetrySamplePoint = {
      timestamp: ts,
      time: label,
      cpu: rt.cpu.percent === null || rt.cpu.percent === undefined ? null : Number(rt.cpu.percent.toFixed(1)),
      mem: rt.memory.percent === null || rt.memory.percent === undefined ? null : Number(rt.memory.percent.toFixed(1)),
      rxKb:
        rt.network.rx_bytes_sec === null || rt.network.rx_bytes_sec === undefined
          ? null
          : Number((rt.network.rx_bytes_sec / 1024).toFixed(1)),
      txKb:
        rt.network.tx_bytes_sec === null || rt.network.tx_bytes_sec === undefined
          ? null
          : Number((rt.network.tx_bytes_sec / 1024).toFixed(1)),
    }
    this.telemetryHistory.update((prev) => {
      const next = [...prev, pt]
      return next.length > 60 ? next.slice(next.length - 60) : next
    })
  }

  private markTelemetrySuccess(isWs: boolean) {
    this.lastSuccessAt.set(Date.now())
    this.consecutiveFailures.set(0)
    this.lastError.set(null)
    this.connectionState.set(isWs ? 'ws_live' : 'http_polling')
  }

  private markTelemetryFailure(errMessage: string) {
    const nextFails = this.consecutiveFailures() + 1
    this.consecutiveFailures.set(nextFails)
    this.lastError.set(errMessage)
    this.connectionState.set(nextFails >= 3 ? 'offline' : 'reconnecting')
  }

  async fetchPanelSettings(force = false) {
    const now = Date.now()
    if (!force && now - this.lastSettingsFetchedAt < 60000) return
    try {
      const res = await settingsApi.getSettings()
      const data = res.data?.data
      this.lastSettingsFetchedAt = now
      if (data?.panel_title) {
        this.setPanelTitle(data.panel_title)
      }
      if (data?.monitor) {
        this.applyMonitorPolicy(data.monitor)
      }
    } catch {}
  }

  async fetchInfo(force = false) {
    const now = Date.now()
    if (!force && this.info() && now - this.lastInfoFetchedAt < 60000) return
    try {
      const res = await systemApi.getSystemInfo()
      if (res.data.code === 0 && res.data.data) {
        this.info.set(res.data.data)
        this.lastInfoFetchedAt = now
      }
    } catch (e: any) {
      this.lastError.set(e?.message || '获取宿主机概要失败')
    }
  }

  async fetchRealtime(passive = true) {
    try {
      const [resRt, resTh] = await Promise.all([
        systemApi.getRealtimeMonitor(passive),
        systemApi.getARMThermal(passive),
      ])
      if (resRt.data.code === 0 && resRt.data.data) {
        this.realtime.set(resRt.data.data)
        this.recordSample(resRt.data.data)
        if (resRt.data.data.monitor) {
          this.applyMonitorPolicy(resRt.data.data.monitor)
        }
      }
      if (resTh.data.code === 0 && resTh.data.data) {
        this.thermal.set(resTh.data.data)
      }
      if (!this.wsConnected()) {
        this.markTelemetrySuccess(false)
      }
    } catch (e: any) {
      if (!this.wsConnected()) {
        this.markTelemetryFailure(e?.message || '遥测轮询请求失败')
      }
    }
  }

  async fetchProcesses(sortBy: 'cpu' | 'mem' = 'cpu', limit = 30, passive = false) {
    if (!passive && this.processes().length === 0) {
      this.processesLoading.set(true)
    }
    try {
      const res = await systemApi.getProcesses(sortBy, limit, passive)
      if (res.data.code === 0 && res.data.data) {
        this.processes.set(res.data.data.list || [])
        this.processesError.set(null)
      }
    } catch (e: any) {
      this.processesError.set(e?.message || '无法读取活跃进程列表')
    } finally {
      this.processesLoading.set(false)
    }
  }

  async killProcess(pid: number, force = false) {
    const res = await systemApi.killProcess(pid, force)
    if (res.data.code === 0) {
      await this.fetchProcesses('cpu', 15, false)
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

  private clearWsRetryTimer() {
    if (this.wsRetryTimer) {
      clearTimeout(this.wsRetryTimer)
      this.wsRetryTimer = null
    }
  }

  private scheduleFallbackPoll(gen: number) {
    this.clearPollTimer()
    if (!this.monitorActive || gen !== this.monitorGeneration) return
    const fails = this.consecutiveFailures()
    const baseMs =
      typeof document !== 'undefined' && document.hidden
        ? Math.max(this.pollIntervalMs() * 3, 5000)
        : this.pollIntervalMs()
    // Exponential backoff on consecutive failures (1x, 2x, 4x, 8x up to 15s) (FE-007)
    const delayMs =
      fails === 0 ? baseMs : Math.min(15000, baseMs * Math.pow(2, Math.min(fails, 4)))

    this.pollTimer = setTimeout(async () => {
      if (!this.monitorActive || gen !== this.monitorGeneration) return
      await this.fetchRealtime(true)
      this.scheduleFallbackPoll(gen)
    }, delayMs)
  }

  private startFallbackPolling(gen: number) {
    if (!this.monitorActive || gen !== this.monitorGeneration) return
    this.clearPollTimer()
    this.fetchRealtime(true).finally(() => {
      this.scheduleFallbackPoll(gen)
    })
  }

  private scheduleWsReconnect(gen: number) {
    this.clearWsRetryTimer()
    if (!this.monitorActive || gen !== this.monitorGeneration) return
    this.wsBackoffAttempt += 1
    const delay = Math.min(20000, 2000 * Math.pow(2, Math.min(this.wsBackoffAttempt - 1, 3)))
    this.wsRetryTimer = setTimeout(() => {
      if (!this.monitorActive || gen !== this.monitorGeneration || this.wsConnected()) return
      this.openWebSocket(gen)
    }, delay)
  }

  private openWebSocket(gen: number) {
    const token = localStorage.getItem('armguard_token')
    if (!token || !this.monitorActive || gen !== this.monitorGeneration) return

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
        this.wsBackoffAttempt = 0
        this.wsConnected.set(true)
        this.markTelemetrySuccess(true)
        this.clearPollTimer()
        this.clearWsRetryTimer()
      }

      ws.onmessage = (event) => {
        if (!this.monitorActive || gen !== this.monitorGeneration) return
        try {
          const data = JSON.parse(event.data)
          if (data.realtime) {
            this.realtime.set(data.realtime)
            this.recordSample(data.realtime)
          }
          if (data.arm_thermal) this.thermal.set(data.arm_thermal)
          if (data.monitor) this.applyMonitorPolicy(data.monitor)
          this.markTelemetrySuccess(true)
        } catch {}
      }

      ws.onclose = () => {
        if (this.wsInstance === ws) this.wsInstance = null
        this.wsConnected.set(false)
        if (this.monitorActive && gen === this.monitorGeneration) {
          this.startFallbackPolling(gen)
          this.scheduleWsReconnect(gen)
        }
      }

      ws.onerror = () => {
        try {
          ws.close()
        } catch {}
      }
    } catch {
      this.startFallbackPolling(gen)
      this.scheduleWsReconnect(gen)
    }
  }

  startMonitoring() {
    if (this.monitorActive) return
    const token = localStorage.getItem('armguard_token')
    if (!token) return

    this.monitorActive = true
    this.monitorGeneration += 1
    this.wsBackoffAttempt = 0
    this.connectionState.set('reconnecting')
    const gen = this.monitorGeneration
    this.openWebSocket(gen)
  }

  reconnectNow() {
    this.stopMonitoring()
    this.consecutiveFailures.set(0)
    this.startMonitoring()
    this.fetchInfo(true)
    this.fetchRealtime(false)
  }

  stopMonitoring() {
    this.monitorActive = false
    this.monitorGeneration += 1
    this.clearPollTimer()
    this.clearWsRetryTimer()
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
