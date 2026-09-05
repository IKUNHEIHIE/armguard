import { defineStore } from 'pinia'
import { ref } from 'vue'
import { systemApi, SystemInfo, RealtimeMonitorData, ARMThermalData } from '@/api/system'
import { settingsApi } from '@/api/settings'

export const useSystemStore = defineStore('system', () => {
  const panelTitle = ref(localStorage.getItem('armguard_panel_title') || 'ArmGuard')
  const info = ref<SystemInfo | null>(null)
  const realtime = ref<RealtimeMonitorData>({
    timestamp: Date.now(),
    cpu: { percent: 0, cores_percent: [], frequency_mhz: 0 },
    memory: { total: 1024 * 1024 * 1024, used: 0, free: 0, percent: 0, swap_total: 0, swap_used: 0, swap_percent: 0 },
    disk: { total: 10 * 1024 * 1024 * 1024, used: 0, free: 0, percent: 0, read_bytes_sec: 0, write_bytes_sec: 0 },
    network: { rx_bytes_sec: 0, tx_bytes_sec: 0, total_rx_bytes: 0, total_tx_bytes: 0 },
    load_avg: [0, 0, 0]
  })
  const armThermal = ref<ARMThermalData>({
    temp_c: 42.5,
    temp_status: 'normal',
    throttled: false,
    under_voltage: false,
    freq_capped: false,
    voltage_v: 0.85,
    freq_mhz: 1500,
    board_model: 'Raspberry Pi 4 Model B (aarch64)'
  })

  const wsConnected = ref(false)
  let ws: WebSocket | null = null
  let pollTimer: any = null

  function setPanelTitle(title: string) {
    if (!title) return
    panelTitle.value = title
    localStorage.setItem('armguard_panel_title', title)
    document.title = `${title} - ARM64 Linux 运维面板`
  }

  async function fetchPanelSettings() {
    try {
      const res = await settingsApi.getSettings()
      if (res.data?.data?.panel_title) {
        setPanelTitle(res.data.data.panel_title)
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
      if (resRt.data.code === 0) realtime.value = resRt.data.data
      if (resTh.data.code === 0) armThermal.value = resTh.data.data
    } catch (e) {
      // ignore
    }
  }

  function startMonitoring() {
    fetchPanelSettings()
    fetchInfo()
    fetchRealtime()

    // Try WebSocket connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const token = localStorage.getItem('armguard_token') || ''
    const wsUrl = `${protocol}//${host}/system/monitor/ws?token=${token}`

    try {
      ws = new WebSocket(wsUrl)
      ws.onopen = () => {
        wsConnected.value = true
        if (pollTimer) clearInterval(pollTimer)
      }
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data)
          if (payload.realtime) realtime.value = payload.realtime
          if (payload.arm_thermal) armThermal.value = payload.arm_thermal
        } catch (err) {
          console.error('WS parse error:', err)
        }
      }
      ws.onerror = () => {
        wsConnected.value = false
        fallbackToPolling()
      }
      ws.onclose = () => {
        wsConnected.value = false
        fallbackToPolling()
      }
    } catch {
      fallbackToPolling()
    }
  }

  function fallbackToPolling() {
    if (!pollTimer) {
      pollTimer = setInterval(fetchRealtime, 2000)
    }
  }

  function stopMonitoring() {
    if (ws) {
      ws.close()
      ws = null
    }
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
    wsConnected.value = false
  }

  return {
    panelTitle,
    setPanelTitle,
    fetchPanelSettings,
    info,
    realtime,
    armThermal,
    wsConnected,
    fetchInfo,
    fetchRealtime,
    startMonitoring,
    stopMonitoring
  }
})
