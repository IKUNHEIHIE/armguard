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
        <div class="title-wrap">
          <span class="title-icon" aria-hidden="true"><mat-icon>timeline</mat-icon></span>
          <div>
            <div class="chart-title">
              <span>实时资源趋势</span>
              <span class="m3-badge" [ngClass]="system.connectionBadgeClass()">
                {{ system.connectionBadgeLabel() }}
              </span>
              <span *ngIf="system.isStale()" class="m3-badge danger">数据已过期</span>
            </div>
            <div class="chart-subtitle font-mono">
              <span>最后采集 {{ system.lastUpdatedLabel() }}</span>
              <span> · 采样 {{ system.pollIntervalMs() }}ms</span>
              <span> · 窗口 {{ windowSeconds() }}s ({{ history().length }} 点)</span>
              <span *ngIf="system.monitorPolicy()?.eco_mode_active"> · Eco 节能中</span>
            </div>
          </div>
        </div>

        <div class="chart-controls">
          <button
            *ngIf="system.isStale() || system.connectionState() === 'offline'"
            type="button"
            mat-stroked-button
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
            <mat-button-toggle value="load">CPU 与内存</mat-button-toggle>
            <mat-button-toggle value="network">网络吞吐</mat-button-toggle>
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
        padding: 20px !important;
      }
      .chart-header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .title-wrap {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .title-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        flex-shrink: 0;
        border-radius: var(--ag-radius-sm);
        background: var(--ag-surface-low);
        color: var(--ag-primary);
      }
      .title-icon mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
      .chart-title {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        font-family: var(--ag-font-display);
        font-size: 0.9375rem;
        font-weight: 600;
        color: var(--ag-on-surface);
      }
      .chart-subtitle {
        font-size: 0.6875rem;
        color: var(--ag-on-surface-variant);
        margin-top: 2px;
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
        padding: 8px 12px;
        border-radius: var(--ag-radius-sm);
        background: var(--ag-surface-low);
        font-size: 0.6875rem;
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

    const primaryColor = isDark ? '#a8c7fa' : '#1a73e8'
    const secondaryColor = isDark ? '#4dd0e1' : '#12b5cb'
    const textMuted = isDark ? '#a9b0bd' : '#414754'
    const tooltipBg = isDark ? '#24272c' : '#ffffff'
    const tooltipText = isDark ? '#e3e6eb' : '#181c20'
    const tooltipBorder = isDark ? 'rgba(168, 199, 250, 0.28)' : '#dadce0'
    const splitLineColor = isDark ? 'rgba(255, 255, 255, 0.08)' : '#e8eaed'
    const axisLineColor = isDark ? 'rgba(255, 255, 255, 0.16)' : '#dfe3e8'
    const primaryArea = isDark ? 'rgba(168, 199, 250, 0.3)' : 'rgba(26, 115, 232, 0.18)'
    const secondaryArea = isDark ? 'rgba(77, 208, 225, 0.28)' : 'rgba(18, 181, 203, 0.16)'

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
              lineStyle: { width: 2, color: primaryColor },
              itemStyle: { color: primaryColor },
              areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: primaryArea },
                  { offset: 1, color: 'rgba(26, 115, 232, 0.01)' },
                ]),
              },
            },
            {
              name: '内存占用 (%)',
              type: 'line',
              smooth: 0.35,
              showSymbol: false,
              data: pts.map((p) => p.mem),
              lineStyle: { width: 2, color: secondaryColor },
              itemStyle: { color: secondaryColor },
              areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: secondaryArea },
                  { offset: 1, color: 'rgba(18, 181, 203, 0.01)' },
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
              lineStyle: { width: 2, color: secondaryColor },
              itemStyle: { color: secondaryColor },
              areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: secondaryArea },
                  { offset: 1, color: 'rgba(18, 181, 203, 0.01)' },
                ]),
              },
            },
            {
              name: '上行速率 (TX KB/s)',
              type: 'line',
              smooth: 0.35,
              showSymbol: false,
              data: pts.map((p) => p.txKb),
              lineStyle: { width: 2, color: primaryColor },
              itemStyle: { color: primaryColor },
              areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: primaryArea },
                  { offset: 1, color: 'rgba(26, 115, 232, 0.01)' },
                ]),
              },
            },
          ],
    }

    this.chart.setOption(option)
  }
}
