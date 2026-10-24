import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { systemApi, SystemInfo, RealtimeMonitorData, ARMThermalData, MonitorPolicy } from '@/api/system'
import { settingsApi } from '@/api/settings'

export const useSystemStore = defineStore('system', () => {
  const panelTitle = ref(localStorage.getItem('armguard_panel_title') || 'ArmGuard')
  const info = ref<SystemInfo | null>(null)
  const realtime = ref<RealtimeMonitorData>({
    timestamp: null,
    cpu: { percent: null, cores_percent: [], frequency_mhz: null, max_frequency_mhz: null, governor: null, policies: [] },
    memory: { total: null, used: null, free: null, percent: null, swap_total: null, swap_used: null, swap_percent: null },
    disk: { total: null, used: null, free: null, percent: null, status: 'pending', updated_at: null, read_bytes_sec: null, write_bytes_sec: null },
    network: { rx_bytes_sec: null, tx_bytes_sec: null, total_rx_bytes: null, total_tx_bytes: null },
    load_avg: [null, null, null]
  })
  const armThermal = ref<ARMThermalData>({
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
    board_model: null,
    collected_at: null
  })
  const monitorPolicy = ref<MonitorPolicy | null>(null)

  const wsConnected = ref(false)
  const monitorActive = ref(false)
  const lastError = ref<string | null>(null)
  const pollIntervalMs = ref(1000)

  let ws: WebSocket | null = null
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let monitorGeneration = 0

  const isStale = computed(() => {
    const ts = realtime.value.timestamp
    if (!ts) return true
    return Date.now() - ts > Math.max(10000, pollIntervalMs.value * 3)
  })

  function setPanelTitle(title: string) {
    if (!title) return
    panelTitle.value = title
    localStorage.setItem('armguard_panel_title', title)
    document.title = `${title} - ARM64 Linux 运维面板`
  }

  function applyMonitorPolicy(policy?: MonitorPolicy | null) {
    if (!policy) return
    monitorPolicy.value = policy
    if (typeof policy.interval_ms === 'number' && policy.interval_ms >= 500) {
      pollIntervalMs.value = policy.interval_ms
    }
  }

  async function fetchPanelSettings() {
    try {
      const res = await settingsApi.getSettings()
      const data = res.data?.data
      if (data?.panel_title) {
        setPanelTitle(data.panel_title)
      }
      if (data?.monitor) {
        applyMonitorPolicy(data.monitor)
      }
    } catch {}
  }

  async function fetchInfo() {
    try {
      const res = await systemApi.getSystemInfo()
      if (res.data.code === 0) {
        info.value = res.data.data
      }
    } catch (e) {
      console.warn('Failed to fetch system info:', e)
    }
  }

  async function fetchRealtime() {
    try {
      const [resRt, resTh] = await Promise.all([
        systemApi.getRealtimeMonitor(),
        systemApi.getARMThermal()
      ])
      if (resRt.data.code === 0 && resRt.data.data) {
        realtime.value = resRt.data.data
        if (resRt.data.data.monitor) {
          applyMonitorPolicy(resRt.data.data.monitor)
        }
      }
      if (resTh.data.code === 0 && resTh.data.data) {
        armThermal.value = resTh.data.data
      }
      lastError.value = null
    } catch (e: any) {
      lastError.value = e?.message || '采集失败'
    }
  }

  function clearPollTimer() {
    if (pollTimer !== null) {
      clearTimeout(pollTimer)
      pollTimer = null
    }
  }

  function closeSocket() {
    if (ws) {
      const sock = ws
      ws = null
      sock.onopen = null
      sock.onmessage = null
      sock.onerror = null
      sock.onclose = null
      try { sock.close() } catch {}
    }
    wsConnected.value = false
  }

  function schedulePoll(gen: number) {
    if (!monitorActive.value || gen !== monitorGeneration || wsConnected.value) return
    if (pollTimer !== null) return
    pollTimer = setTimeout(async () => {
      pollTimer = null
      if (!monitorActive.value || gen !== monitorGeneration || wsConnected.value) return
      await fetchRealtime()
      schedulePoll(gen)
    }, pollIntervalMs.value)
  }

  function startMonitoring() {
    const token = localStorage.getItem('armguard_token') || ''
    if (!token) {
      stopMonitoring()
      return
    }

    // Idempotent restart: clean up any previous connection or timer first
    const gen = ++monitorGeneration
    monitorActive.value = true
    clearPollTimer()
    closeSocket()

    void fetchPanelSettings()
    void fetchInfo()
    void fetchRealtime()

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const wsUrl = `${protocol}//${host}/system/monitor/ws`

    try {
      const sock = new WebSocket(wsUrl, ['armguard.v1', token])
      ws = sock
      sock.onopen = () => {
        if (!monitorActive.value || gen !== monitorGeneration) {
          try { sock.close() } catch {}
          return
        }
        wsConnected.value = true
        lastError.value = null
        clearPollTimer()
      }
      sock.onmessage = (event) => {
        if (!monitorActive.value || gen !== monitorGeneration) return
        try {
          const payload = JSON.parse(event.data)
          if (payload.realtime) realtime.value = payload.realtime
          if (payload.arm_thermal) armThermal.value = payload.arm_thermal
          if (payload.monitor) applyMonitorPolicy(payload.monitor)
          lastError.value = null
        } catch (err) {
          console.error('WS parse error:', err)
        }
      }
      sock.onerror = () => {
        if (!monitorActive.value || gen !== monitorGeneration) return
        wsConnected.value = false
        schedulePoll(gen)
      }
      sock.onclose = () => {
        if (!monitorActive.value || gen !== monitorGeneration) return
        wsConnected.value = false
        ws = null
        schedulePoll(gen)
      }
    } catch {
      schedulePoll(gen)
    }
  }

  function stopMonitoring() {
    monitorActive.value = false
    monitorGeneration++
    clearPollTimer()
    closeSocket()
  }

  return {
    panelTitle,
    setPanelTitle,
    fetchPanelSettings,
    info,
    realtime,
    armThermal,
    monitorPolicy,
    wsConnected,
    monitorActive,
    pollIntervalMs,
    lastError,
    isStale,
    fetchInfo,
    fetchRealtime,
    startMonitoring,
    stopMonitoring
  }
})
