import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  inject,
  effect,
  signal,
  computed,
} from '@angular/core'
import * as echarts from 'echarts'
import { AgMaterialModule } from '../core/material.module'
import { SystemService } from '../core/system.service'
import { ThemeService } from '../core/theme.service'

@Component({
  selector: 'ag-telemetry-chart',
  standalone: true,
  imports: [AgMaterialModule],
  template: `
    <div class="m3-card chart-card">
      <div class="chart-header">
        <div>
          <div class="chart-title">
            <mat-icon class="title-icon" aria-hidden="true">timeline</mat-icon>
            <span>实时资源趋势</span>
            <span class="m3-badge" [ngClass]="system.connectionBadgeClass()">
              {{ system.connectionBadgeLabel() }}
            </span>
            <span *ngIf="system.isStale()" class="m3-badge danger">
              ⚠ 数据已过期
            </span>
          </div>
          <div class="chart-subtitle font-mono">
            <span>最后采集: {{ system.lastUpdatedLabel() }}</span>
            <span> · 采样周期: {{ system.pollIntervalMs() }}ms</span>
            <span> · 窗口: 最近 {{ windowSeconds() }}s ({{ history().length }} 点)</span>
            <span *ngIf="system.monitorPolicy()?.eco_mode_active"> · Eco 节能已启用</span>
          </div>
        </div>

        <div class="chart-controls">
          <button
            *ngIf="system.isStale() || system.connectionState() === 'offline'"
            type="button"
            mat-stroked-button
            color="warn"
            aria-label="立即重新连接实时监控"
            (click)="system.reconnectNow()"
          >
            <mat-icon>sync</mat-icon>
            <span>重连监控</span>
          </button>

          <mat-button-toggle-group
            [value]="chartMode()"
            (change)="setMode($event.value)"
            aria-label="切换监控指标视图"
            class="mode-toggle"
          >
            <mat-button-toggle value="load">CPU 与内存 (%)</mat-button-toggle>
            <mat-button-toggle value="network">网络吞吐 (KB/s)</mat-button-toggle>
          </mat-button-toggle-group>
        </div>
      </div>

      <!-- Accessible Text Summary Strip (FE-014) -->
      <div class="chart-a11y-summary font-mono" role="status" aria-live="polite">
        <ng-container *ngIf="chartMode() === 'load'; else netSummary">
          <span>当前 CPU: <strong>{{ formatVal(system.realtime().cpu.percent, '%') }}</strong></span>
          <span>当前内存: <strong>{{ formatVal(system.realtime().memory.percent, '%') }}</strong></span>
          <span>峰值 CPU: <strong>{{ formatVal(peakCpu(), '%') }}</strong></span>
        </ng-container>
        <ng-template #netSummary>
          <span>当前下行 (RX): <strong>{{ formatRateKb(system.realtime().network.rx_bytes_sec) }}</strong></span>
          <span>当前上行 (TX): <strong>{{ formatRateKb(system.realtime().network.tx_bytes_sec) }}</strong></span>
          <span>峰值下行: <strong>{{ formatVal(peakRxKb(), ' KB/s') }}</strong></span>
        </ng-template>
      </div>

      <div
        #chartCanvas
        class="chart-canvas"
        role="img"
        [attr.aria-label]="chartAriaLabel()"
      ></div>
    </div>
  `,
  styles: [
    `
      .chart-card {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 16px 20px;
      }
      .chart-header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .chart-title {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        font-family: var(--ag-font-display);
        font-weight: 700;
        font-size: 0.96rem;
      }
      .title-icon {
        color: var(--ag-primary);
      }
      .chart-subtitle {
        font-size: 0.73rem;
        color: var(--ag-on-surface-variant);
        margin-top: 3px;
      }
      .chart-controls {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
      }
      .chart-a11y-summary {
        display: flex;
        flex-wrap: wrap;
        gap: 18px;
        padding: 6px 12px;
        border-radius: 10px;
        background: var(--ag-surface);
        font-size: 0.74rem;
        color: var(--ag-on-surface-variant);
      }
      .chart-a11y-summary strong {
        color: var(--ag-on-surface);
      }
      .chart-canvas {
        width: 100%;
        height: 240px;
      }
    `,
  ],
})
export class TelemetryChartComponent implements AfterViewInit, OnDestroy {
  @ViewChild('chartCanvas', { static: true }) chartCanvas!: ElementRef<HTMLDivElement>
  readonly system = inject(SystemService)
  readonly theme = inject(ThemeService)
  readonly chartMode = signal<'load' | 'network'>('load')

  readonly history = this.system.telemetryHistory

  readonly windowSeconds = computed(() => {
    const pts = this.history()
    if (pts.length >= 2) {
      return Math.max(1, Math.round((pts[pts.length - 1].timestamp - pts[0].timestamp) / 1000))
    }
    return Math.round((Math.max(1, pts.length) * this.system.pollIntervalMs()) / 1000)
  })

  readonly peakCpu = computed(() => {
    const vals = this.history().map((p) => p.cpu).filter((v): v is number => v !== null)
    return vals.length ? Math.max(...vals) : null
  })

  readonly peakRxKb = computed(() => {
    const vals = this.history().map((p) => p.rxKb).filter((v): v is number => v !== null)
    return vals.length ? Math.max(...vals) : null
  })

  readonly chartAriaLabel = computed(() => {
    const rt = this.system.realtime()
    if (this.chartMode() === 'load') {
      return `CPU 与内存使用率趋势图。当前 CPU ${this.formatVal(rt.cpu.percent, '%')}，当前内存 ${this.formatVal(rt.memory.percent, '%')}。`
    }
    return `网络吞吐趋势图。当前下行速率 ${this.formatRateKb(rt.network.rx_bytes_sec)}，上行速率 ${this.formatRateKb(rt.network.tx_bytes_sec)}。`
  })

  private chart: echarts.ECharts | null = null
  private resizeObserver: ResizeObserver | null = null
  private resizeHandler = () => this.chart?.resize()

  constructor() {
    effect(() => {
      const pts = this.history()
      const mode = this.chartMode()
      const themeMode = this.theme.mode()
      this.renderChart(mode, themeMode, pts.length)
    })
  }

  ngAfterViewInit() {
    const el = this.chartCanvas.nativeElement
    this.chart = echarts.init(el)
    this.renderChart(this.chartMode(), this.theme.mode(), this.history().length)
    window.addEventListener('resize', this.resizeHandler)
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.chart?.resize())
      this.resizeObserver.observe(el)
    }
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.resizeHandler)
    this.resizeObserver?.disconnect()
    this.chart?.dispose()
    this.chart = null
  }

  setMode(mode: 'load' | 'network') {
    this.chartMode.set(mode)
    this.renderChart(mode, this.theme.mode(), this.history().length)
  }

  formatVal(val: number | null | undefined, suffix: string): string {
    if (val === null || val === undefined || isNaN(val)) return '暂无数据'
    return `${val.toFixed(1)}${suffix}`
  }

  formatRateKb(bytesPerSec: number | null | undefined): string {
    if (bytesPerSec === null || bytesPerSec === undefined || isNaN(bytesPerSec)) return '暂无数据'
    return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  }

  private renderChart(mode: 'load' | 'network', themeMode: 'dark' | 'light', _len: number) {
    if (!this.chart) return
    const pts = this.history()
    const times = pts.map((p) => p.time)
    const isLoad = mode === 'load'
    const isDark = themeMode === 'dark'

    const primaryColor = isDark ? '#a8c7fa' : '#0b57d0'
    const successColor = isDark ? '#6dd58c' : '#146c2e'
    const textMuted = isDark ? '#94a3b8' : '#444746'
    const tooltipBg = isDark ? '#18202c' : '#ffffff'
    const tooltipText = isDark ? '#e2e8f0' : '#1f1f1f'
    const tooltipBorder = isDark ? 'rgba(168, 199, 250, 0.25)' : 'rgba(11, 87, 208, 0.22)'
    const splitLineColor = isDark ? 'rgba(148, 163, 184, 0.14)' : 'rgba(68, 71, 70, 0.15)'
    const axisLineColor = isDark ? 'rgba(148, 163, 184, 0.22)' : 'rgba(68, 71, 70, 0.25)'

    const option: echarts.EChartsOption = {
      animation: false,
      grid: { top: 32, right: 20, bottom: 24, left: 56 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: tooltipBg,
        borderColor: tooltipBorder,
        textStyle: { color: tooltipText, fontFamily: 'JetBrains Mono, monospace', fontSize: 12 },
      },
      legend: {
        top: 0,
        right: 0,
        textStyle: { color: textMuted, fontSize: 12 },
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: times.length ? times : ['--:--:--'],
        axisLabel: { color: textMuted, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' },
        axisLine: { lineStyle: { color: axisLineColor } },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: isLoad ? 100 : undefined,
        axisLabel: {
          color: textMuted,
          fontSize: 11,
          fontFamily: 'JetBrains Mono, monospace',
          formatter: isLoad ? '{value}%' : '{value} KB/s',
        },
        splitLine: { lineStyle: { color: splitLineColor, type: 'dashed' } },
      },
      series: isLoad
        ? [
            {
              name: 'CPU 使用率 (%)',
              type: 'line',
              smooth: 0.35,
              showSymbol: false,
              data: pts.map((p) => p.cpu),
              lineStyle: { width: 2.4, color: primaryColor },
              itemStyle: { color: primaryColor },
              areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: isDark ? 'rgba(168, 199, 250, 0.32)' : 'rgba(11, 87, 208, 0.22)' },
                  { offset: 1, color: 'rgba(168, 199, 250, 0.01)' },
                ]),
              },
            },
            {
              name: '内存占用 (%)',
              type: 'line',
              smooth: 0.35,
              showSymbol: false,
              data: pts.map((p) => p.mem),
              lineStyle: { width: 2.2, color: successColor },
              itemStyle: { color: successColor },
              areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: isDark ? 'rgba(109, 213, 140, 0.26)' : 'rgba(20, 108, 46, 0.18)' },
                  { offset: 1, color: 'rgba(109, 213, 140, 0.01)' },
                ]),
              },
            },
          ]
        : [
            {
              name: '下行速率 (RX KB/s)',
              type: 'line',
              smooth: 0.35,
              showSymbol: false,
              data: pts.map((p) => p.rxKb),
              lineStyle: { width: 2.4, color: successColor },
              itemStyle: { color: successColor },
              areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: isDark ? 'rgba(109, 213, 140, 0.32)' : 'rgba(20, 108, 46, 0.22)' },
                  { offset: 1, color: 'rgba(109, 213, 140, 0.01)' },
                ]),
              },
            },
            {
              name: '上行速率 (TX KB/s)',
              type: 'line',
              smooth: 0.35,
              showSymbol: false,
              data: pts.map((p) => p.txKb),
              lineStyle: { width: 2.2, color: primaryColor },
              itemStyle: { color: primaryColor },
              areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: isDark ? 'rgba(168, 199, 250, 0.28)' : 'rgba(11, 87, 208, 0.18)' },
                  { offset: 1, color: 'rgba(168, 199, 250, 0.01)' },
                ]),
              },
            },
          ],
    }

    this.chart.setOption(option)
  }
}
