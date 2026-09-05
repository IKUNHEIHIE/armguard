<template>
  <div
    :class="[
      embedded
        ? 'flex flex-col justify-between relative overflow-hidden'
        : 'glass-panel p-5 rounded-2xl border border-slate-800 flex flex-col justify-between relative overflow-hidden transition-all duration-300 hover:border-slate-700/80'
    ]"
  >
    <!-- Header Controls -->
    <div
      class="flex flex-wrap items-center justify-between gap-3 pb-3 mb-2"
      :class="embedded ? 'border-t border-slate-800/80 pt-4' : 'border-b border-slate-800/80'"
    >
      <div class="flex items-center gap-2.5">
        <div v-if="!embedded" class="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <Activity class="w-4 h-4" />
        </div>
        <div>
          <h2 class="text-sm font-bold text-white tracking-tight flex items-center gap-2">
            {{ activeMode === 'cpu_temp' ? 'CPU 负载与 ARM 芯片温度实时波动' : '网络吞吐实时出入站速率 (RX/TX)' }}
            <span class="text-[10px] px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 font-mono">
              ECharts 5.5 · 60 FPS
            </span>
          </h2>
          <p class="text-xs text-slate-400 font-mono">
            {{ activeMode === 'cpu_temp' ? '贝塞尔曲线平滑渲染 · 毫秒级双轴十字游标跟踪' : '实时双向吞吐监测 · 动态带宽波峰识别' }}
          </p>
        </div>
      </div>

      <!-- Controls Switchers -->
      <div class="flex items-center gap-2">
        <!-- Metric Mode Switcher -->
        <div class="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-xs font-mono">
          <button
            @click="activeMode = 'cpu_temp'"
            class="px-2.5 py-1 rounded-md transition"
            :class="activeMode === 'cpu_temp' ? 'bg-brand-500/20 text-brand-400 font-bold border border-brand-500/30 shadow-sm' : 'text-slate-400 hover:text-slate-200'"
          >
            CPU / 温度
          </button>
          <button
            @click="activeMode = 'network'"
            class="px-2.5 py-1 rounded-md transition"
            :class="activeMode === 'network' ? 'bg-cyan-500/20 text-cyan-400 font-bold border border-cyan-500/30 shadow-sm' : 'text-slate-400 hover:text-slate-200'"
          >
            网络 I/O
          </button>
        </div>

        <!-- Window Scope Switcher -->
        <div class="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-xs font-mono">
          <button
            v-for="win in ['30s', '5m', '15m']"
            :key="win"
            @click="activeWindow = win"
            class="px-2 py-1 rounded-md transition"
            :class="activeWindow === win ? 'bg-slate-800 text-slate-100 font-bold' : 'text-slate-500 hover:text-slate-300'"
          >
            {{ win }}
          </button>
        </div>
      </div>
    </div>

    <!-- ECharts DOM Container -->
    <div class="relative w-full h-56 min-h-[220px]">
      <div ref="chartRef" class="w-full h-full"></div>
    </div>

    <!-- Live Telemetry Quick Footer Readout -->
    <div class="mt-2 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-xs font-mono text-slate-400 gap-2">
      <div class="flex items-center gap-4">
        <span class="flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
          <span>{{ activeMode === 'cpu_temp' ? 'CPU 利用率' : '下行 RX' }}:</span>
          <strong class="text-slate-100 tabular-nums font-bold">
            {{ activeMode === 'cpu_temp' ? `${(systemStore.realtime.cpu.percent || 0).toFixed(1)}%` : formatNetworkSpeed(systemStore.realtime.network.rx_bytes_sec) }}
          </strong>
        </span>
        <span class="flex items-center gap-1.5">
          <span class="w-2.5 h-2.5 rounded-full" :class="activeMode === 'cpu_temp' ? 'bg-amber-400' : 'bg-cyan-400'"></span>
          <span>{{ activeMode === 'cpu_temp' ? 'ARM 温度' : '上行 TX' }}:</span>
          <strong class="text-slate-100 tabular-nums font-bold">
            {{ activeMode === 'cpu_temp' ? `${(systemStore.armThermal.temp_c || 0).toFixed(1)}°C` : formatNetworkSpeed(systemStore.realtime.network.tx_bytes_sec) }}
          </strong>
        </span>
      </div>

      <div class="text-[11px] text-slate-500">
        十字准星：移动鼠标查看任意采样点实时快照
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as echarts from 'echarts'
import { Activity } from 'lucide-vue-next'
import { useSystemStore } from '@/stores/system'

const props = withDefaults(defineProps<{
  embedded?: boolean
}>(), {
  embedded: false
})

const systemStore = useSystemStore()
const chartRef = ref<HTMLDivElement | null>(null)
let chartInstance: echarts.ECharts | null = null
let resizeObserver: ResizeObserver | null = null

const activeMode = ref<'cpu_temp' | 'network'>('cpu_temp')
const activeWindow = ref<string>('30s')

interface DataPoint {
  time: string
  cpu: number
  temp: number
  rxKb: number
  txKb: number
}

const historyBuffer = ref<DataPoint[]>([])

function getWindowMaxPoints(): number {
  if (activeWindow.value === '15m') return 90
  if (activeWindow.value === '5m') return 50
  return 30 // 30s (~1.5s per tick)
}

function formatNetworkSpeed(bytesSec?: number): string {
  if (!bytesSec || bytesSec === 0) return '0 KB/s'
  const kb = bytesSec / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB/s`
  return `${(kb / 1024).toFixed(2)} MB/s`
}

function initMockSeed() {
  const now = Date.now()
  const initialPoints: DataPoint[] = []
  const max = getWindowMaxPoints()
  for (let i = max; i >= 1; i--) {
    const t = new Date(now - i * 2000)
    const timeStr = `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}:${t.getSeconds().toString().padStart(2, '0')}`
    initialPoints.push({
      time: timeStr,
      cpu: Math.max(2, Math.min(25, 8 + Math.sin(i / 2) * 5 + (Math.random() * 4 - 2))),
      temp: Math.max(35, Math.min(50, 38.5 + (Math.random() * 2 - 1))),
      rxKb: Math.max(5, 30 + Math.sin(i / 3) * 20 + Math.random() * 10),
      txKb: Math.max(2, 15 + Math.cos(i / 3) * 10 + Math.random() * 5)
    })
  }
  historyBuffer.value = initialPoints
}

function updateChart() {
  if (!chartInstance) return

  const times = historyBuffer.value.map(d => d.time)
  const isCpuTemp = activeMode.value === 'cpu_temp'

  const seriesCpuTemp: echarts.LineSeriesOption[] = [
    {
      name: 'CPU 使用率 (%)',
      type: 'line' as const,
      smooth: 0.4,
      showSymbol: false,
      yAxisIndex: 0,
      data: historyBuffer.value.map(d => d.cpu),
      lineStyle: {
        width: 2.5,
        color: '#10b981'
      },
      itemStyle: {
        color: '#10b981'
      },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(16, 185, 129, 0.38)' },
          { offset: 1, color: 'rgba(16, 185, 129, 0.00)' }
        ])
      }
    },
    {
      name: '核心温度 (°C)',
      type: 'line' as const,
      smooth: 0.4,
      showSymbol: false,
      yAxisIndex: 1,
      data: historyBuffer.value.map(d => d.temp),
      lineStyle: {
        width: 2,
        color: '#f59e0b',
        type: 'solid'
      },
      itemStyle: {
        color: '#f59e0b'
      },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(245, 158, 11, 0.25)' },
          { offset: 1, color: 'rgba(245, 158, 11, 0.00)' }
        ])
      }
    }
  ]

  const seriesNetwork: echarts.LineSeriesOption[] = [
    {
      name: '下行流速 (RX KB/s)',
      type: 'line' as const,
      smooth: 0.4,
      showSymbol: false,
      data: historyBuffer.value.map(d => parseFloat(d.rxKb.toFixed(1))),
      lineStyle: {
        width: 2.5,
        color: '#10b981'
      },
      itemStyle: {
        color: '#10b981'
      },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(16, 185, 129, 0.35)' },
          { offset: 1, color: 'rgba(16, 185, 129, 0.00)' }
        ])
      }
    },
    {
      name: '上行流速 (TX KB/s)',
      type: 'line' as const,
      smooth: 0.4,
      showSymbol: false,
      data: historyBuffer.value.map(d => parseFloat(d.txKb.toFixed(1))),
      lineStyle: {
        width: 2,
        color: '#06b6d4'
      },
      itemStyle: {
        color: '#06b6d4'
      },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(6, 182, 212, 0.30)' },
          { offset: 1, color: 'rgba(6, 182, 212, 0.00)' }
        ])
      }
    }
  ]

  const option: echarts.EChartsOption = {
    backgroundColor: 'transparent',
    animationDuration: 300,
    grid: {
      left: '1%',
      right: isCpuTemp ? '3%' : '2%',
      top: '12%',
      bottom: '3%',
      containLabel: true
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
        label: {
          backgroundColor: '#1e293b',
          color: '#e2e8f0',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 11
        },
        crossStyle: {
          color: 'rgba(148, 163, 184, 0.4)',
          type: 'dashed'
        }
      },
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderColor: 'rgba(51, 65, 85, 0.8)',
      borderWidth: 1,
      padding: [8, 12],
      textStyle: {
        color: '#f8fafc',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 12
      },
      formatter: (params: any) => {
        if (!params || !params.length) return ''
        let header = `<div style="font-weight:bold;margin-bottom:4px;color:#94a3b8;font-size:11px;">⏱ 采样时间: ${params[0].axisValue}</div>`
        let body = params.map((p: any) => {
          const unit = isCpuTemp ? (p.seriesIndex === 0 ? '%' : '°C') : ' KB/s'
          return `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin:2px 0;">
            <span style="display:flex;align-items:center;gap:6px;">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};"></span>
              <span style="color:#cbd5e1;font-size:11px;">${p.seriesName}</span>
            </span>
            <span style="font-weight:bold;color:#f1f5f9;font-variant-numeric:tabular-nums;">${p.value}${unit}</span>
          </div>`
        }).join('')
        return header + body
      }
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: times,
      axisLine: { lineStyle: { color: 'rgba(51, 65, 85, 0.6)' } },
      axisLabel: {
        color: '#64748b',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
        interval: 'auto',
        showMaxLabel: true
      },
      splitLine: {
        show: true,
        lineStyle: {
          color: 'rgba(51, 65, 85, 0.2)',
          type: 'dashed'
        }
      }
    },
    yAxis: isCpuTemp ? [
      {
        type: 'value',
        name: 'CPU %',
        min: 0,
        max: 100,
        position: 'left',
        axisLine: { show: false },
        axisLabel: {
          color: '#64748b',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10,
          formatter: '{value}%'
        },
        splitLine: {
          show: true,
          lineStyle: {
            color: 'rgba(51, 65, 85, 0.25)',
            type: 'dashed'
          }
        }
      },
      {
        type: 'value',
        name: '温度 °C',
        min: 20,
        max: 85,
        position: 'right',
        axisLine: { show: false },
        axisLabel: {
          color: '#64748b',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10,
          formatter: '{value}°C'
        },
        splitLine: { show: false }
      }
    ] : [
      {
        type: 'value',
        name: 'KB/s',
        min: 0,
        axisLine: { show: false },
        axisLabel: {
          color: '#64748b',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10,
          formatter: '{value}'
        },
        splitLine: {
          show: true,
          lineStyle: {
            color: 'rgba(51, 65, 85, 0.25)',
            type: 'dashed'
          }
        }
      }
    ],
    series: isCpuTemp ? seriesCpuTemp : seriesNetwork
  }

  chartInstance.setOption(option, true)
}

function pushRealtimeData() {
  const now = new Date()
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`

  const cpu = parseFloat((systemStore.realtime.cpu.percent || 0).toFixed(1))
  const temp = parseFloat((systemStore.armThermal.temp_c || 38.5).toFixed(1))
  const rxKb = (systemStore.realtime.network.rx_bytes_sec || 0) / 1024
  const txKb = (systemStore.realtime.network.tx_bytes_sec || 0) / 1024

  historyBuffer.value.push({ time: timeStr, cpu, temp, rxKb, txKb })

  const maxPoints = getWindowMaxPoints()
  while (historyBuffer.value.length > maxPoints) {
    historyBuffer.value.shift()
  }

  updateChart()
}

watch([() => systemStore.realtime.timestamp, () => activeMode.value, () => activeWindow.value], () => {
  pushRealtimeData()
})

onMounted(async () => {
  initMockSeed()
  await nextTick()

  if (chartRef.value) {
    chartInstance = echarts.init(chartRef.value)
    updateChart()

    resizeObserver = new ResizeObserver(() => {
      if (chartInstance) {
        chartInstance.resize()
      }
    })
    resizeObserver.observe(chartRef.value)
  }
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }
})
</script>
