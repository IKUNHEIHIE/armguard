import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  inject,
  effect,
  signal,
} from '@angular/core'
import * as echarts from 'echarts'
import { AgMaterialModule } from '../core/material.module'
import { SystemService } from '../core/system.service'

interface SamplePoint {
  time: string
  cpu: number | null
  mem: number | null
  rxKb: number | null
  txKb: number | null
}

@Component({
  selector: 'ag-telemetry-chart',
  standalone: true,
  imports: [AgMaterialModule],
  template: `
    <div class="m3-card chart-card">
      <div class="chart-header">
        <div>
          <div class="chart-title">
            <mat-icon class="title-icon">Timeline</mat-icon>
            <span>实时遥测时序波形 (M3 Live Telemetry)</span>
            <span class="m3-badge" [ngClass]="system.wsConnected() ? 'success' : 'neutral'">
              {{ system.wsConnected() ? 'WebSocket 实时流' : 'HTTP 轮询模式' }}
            </span>
          </div>
          <div class="chart-subtitle font-mono">
            采样间隔: {{ system.pollIntervalMs() }}ms
            <span *ngIf="system.monitorPolicy()?.eco_mode_active"> · Eco 节能已启用</span>
          </div>
        </div>

        <mat-button-toggle-group
          [value]="chartMode()"
          (change)="setMode($event.value)"
          aria-label="Chart Mode"
          class="mode-toggle"
        >
          <mat-button-toggle value="load">CPU 与内存 (%)</mat-button-toggle>
          <mat-button-toggle value="network">网络吞吐 (KB/s)</mat-button-toggle>
        </mat-button-toggle-group>
      </div>

      <div #chartCanvas class="chart-canvas"></div>
    </div>
  `,
  styles: [
    `
      .chart-card {
        display: flex;
        flex-direction: column;
        gap: 14px;
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
        align-items: center;
        gap: 8px;
        font-family: var(--ag-font-display);
        font-weight: 700;
        font-size: 0.98rem;
      }
      .title-icon {
        color: var(--ag-primary);
      }
      .chart-subtitle {
        font-size: 0.74rem;
        color: var(--ag-on-surface-variant);
        margin-top: 2px;
      }
      .chart-canvas {
        width: 100%;
        height: 290px;
      }
    `,
  ],
})
export class TelemetryChartComponent implements AfterViewInit, OnDestroy {
  @ViewChild('chartCanvas', { static: true }) chartCanvas!: ElementRef<HTMLDivElement>
  readonly system = inject(SystemService)
  readonly chartMode = signal<'load' | 'network'>('load')

  private chart: echarts.ECharts | null = null
  private history: SamplePoint[] = []
  private lastTimestamp: number | null = null
  private resizeHandler = () => this.chart?.resize()

  constructor() {
    effect(() => {
      const rt = this.system.realtime()
      const mode = this.chartMode()
      if (rt.timestamp && rt.timestamp !== this.lastTimestamp) {
        this.lastTimestamp = rt.timestamp
        const d = new Date(rt.timestamp)
        const label = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
        this.history.push({
          time: label,
          cpu: rt.cpu.percent === null ? null : Number(rt.cpu.percent.toFixed(1)),
          mem: rt.memory.percent === null ? null : Number(rt.memory.percent.toFixed(1)),
          rxKb:
            rt.network.rx_bytes_sec === null
              ? null
              : Number((rt.network.rx_bytes_sec / 1024).toFixed(1)),
          txKb:
            rt.network.tx_bytes_sec === null
              ? null
              : Number((rt.network.tx_bytes_sec / 1024).toFixed(1)),
        })
        if (this.history.length > 40) {
          this.history.shift()
        }
      }
      this.renderChart(mode)
    })
  }

  ngAfterViewInit() {
    this.chart = echarts.init(this.chartCanvas.nativeElement)
    this.renderChart(this.chartMode())
    window.addEventListener('resize', this.resizeHandler)
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.resizeHandler)
    this.chart?.dispose()
    this.chart = null
  }

  setMode(mode: 'load' | 'network') {
    this.chartMode.set(mode)
    this.renderChart(mode)
  }

  private renderChart(mode: 'load' | 'network') {
    if (!this.chart) return
    const times = this.history.map((p) => p.time)
    const isLoad = mode === 'load'

    const option: echarts.EChartsOption = {
      animation: false,
      grid: { top: 34, right: 20, bottom: 26, left: 48 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#18202c',
        borderColor: 'rgba(168, 199, 250, 0.25)',
        textStyle: { color: '#e2e8f0', fontFamily: 'JetBrains Mono', fontSize: 12 },
      },
      legend: {
        top: 0,
        right: 0,
        textStyle: { color: '#94a3b8', fontSize: 12 },
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: times.length ? times : ['--:--:--'],
        axisLabel: { color: '#94a3b8', fontSize: 11, fontFamily: 'JetBrains Mono' },
        axisLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.2)' } },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: isLoad ? 100 : undefined,
        axisLabel: {
          color: '#94a3b8',
          fontSize: 11,
          fontFamily: 'JetBrains Mono',
          formatter: isLoad ? '{value}%' : '{value} KB',
        },
        splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.12)', type: 'dashed' } },
      },
      series: isLoad
        ? [
            {
              name: 'CPU 使用率 (%)',
              type: 'line',
              smooth: 0.35,
              showSymbol: false,
              data: this.history.map((p) => p.cpu),
              lineStyle: { width: 2.5, color: '#a8c7fa' },
              itemStyle: { color: '#a8c7fa' },
              areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: 'rgba(168, 199, 250, 0.35)' },
                  { offset: 1, color: 'rgba(168, 199, 250, 0.01)' },
                ]),
              },
            },
            {
              name: '内存占用 (%)',
              type: 'line',
              smooth: 0.35,
              showSymbol: false,
              data: this.history.map((p) => p.mem),
              lineStyle: { width: 2.2, color: '#6dd58c' },
              itemStyle: { color: '#6dd58c' },
              areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: 'rgba(109, 213, 140, 0.28)' },
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
              data: this.history.map((p) => p.rxKb),
              lineStyle: { width: 2.5, color: '#6dd58c' },
              itemStyle: { color: '#6dd58c' },
              areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: 'rgba(109, 213, 140, 0.35)' },
                  { offset: 1, color: 'rgba(109, 213, 140, 0.01)' },
                ]),
              },
            },
            {
              name: '上行速率 (TX KB/s)',
              type: 'line',
              smooth: 0.35,
              showSymbol: false,
              data: this.history.map((p) => p.txKb),
              lineStyle: { width: 2.2, color: '#a8c7fa' },
              itemStyle: { color: '#a8c7fa' },
              areaStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                  { offset: 0, color: 'rgba(168, 199, 250, 0.30)' },
                  { offset: 1, color: 'rgba(168, 199, 250, 0.01)' },
                ]),
              },
            },
          ],
    }

    this.chart.setOption(option, true)
  }
}
