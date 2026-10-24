import { Component, OnInit, OnDestroy, inject, computed, signal } from '@angular/core'
import { Router } from '@angular/router'
import { AgMaterialModule } from '../../core/material.module'
import { SystemService } from '../../core/system.service'
import { ToastService } from '../../core/toast.service'
import { TelemetryChartComponent } from '../../components/telemetry-chart.component'
import { appStoreApi, AppMarketItem } from '@/api/appstore'

@Component({
  selector: 'ag-dashboard',
  standalone: true,
  imports: [AgMaterialModule, TelemetryChartComponent],
  template: `
    <div class="m3-page">
      <!-- 1. M3 Silicon Identity Hero Banner -->
      <div class="m3-hero-banner">
        <div class="hero-row">
          <div class="hero-left">
            <div class="silicon-icon">
              <mat-icon>developer_board</mat-icon>
            </div>
            <div>
              <div class="hero-badges font-mono">
                <span class="m3-badge primary">{{ system.info()?.arch || 'ARM64' }}</span>
                <span class="m3-badge success">● 在线运行 ({{ formatUptime(system.info()?.uptime_seconds || 0) }})</span>
                <span *ngIf="system.monitorPolicy()?.eco_mode_active" class="m3-badge warning">
                  Eco 节能采样 ({{ system.pollIntervalMs() }}ms)
                </span>
              </div>
              <h2 class="hero-title font-display">
                {{ boardDisplayName() }}
              </h2>
              <div class="hero-meta font-mono">
                <span>主机名: <strong>{{ system.info()?.hostname || 'loading...' }}</strong></span>
                <span>系统: <strong>{{ system.info()?.distribution || system.info()?.os || 'Linux' }}</strong></span>
                <span>内核: <strong>{{ system.info()?.kernel || '-' }}</strong></span>
                <span>处理器: <strong>{{ system.info()?.cpu_model || 'ARM SoC' }} ({{ system.info()?.cpu_cores || 1 }} Cores)</strong></span>
              </div>
            </div>
          </div>

          <div class="hero-actions">
            <button mat-stroked-button routerLink="/terminal">
              <mat-icon>terminal</mat-icon>
              <span>Web 终端</span>
            </button>
            <button mat-flat-button color="primary" (click)="refreshAll()">
              <mat-icon>refresh</mat-icon>
              <span>刷新状态</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 2. Primary 4 M3 Metric Cards -->
      <div class="m3-grid-4">
        <!-- CPU Card -->
        <div class="m3-card metric-card">
          <div class="metric-top">
            <span class="metric-label">CPU 算力负载</span>
            <mat-icon class="metric-icon">memory</mat-icon>
          </div>
          <div class="metric-value font-mono">
            {{
              rt().cpu.percent === null || rt().cpu.percent === undefined
                ? '采集待就绪'
                : rt().cpu.percent!.toFixed(1) + '%'
            }}
          </div>
          <mat-progress-bar
            mode="determinate"
            [value]="rt().cpu.percent ?? 0"
          ></mat-progress-bar>
          <div class="metric-foot font-mono">
            <span>主频: {{ rt().cpu.frequency_mhz ? rt().cpu.frequency_mhz + ' MHz' : 'N/A' }}</span>
            <span>{{ rt().cpu.governor || 'schedutil' }}</span>
          </div>
        </div>

        <!-- Memory Card -->
        <div class="m3-card metric-card">
          <div class="metric-top">
            <span class="metric-label">物理内存 (RAM & Swap)</span>
            <mat-icon class="metric-icon">storage</mat-icon>
          </div>
          <div class="metric-value font-mono">
            {{
              rt().memory.percent === null || rt().memory.percent === undefined
                ? 'N/A'
                : rt().memory.percent!.toFixed(1) + '%'
            }}
          </div>
          <mat-progress-bar
            mode="determinate"
            [value]="rt().memory.percent ?? 0"
          ></mat-progress-bar>
          <div class="metric-foot font-mono">
            <span>{{ formatBytes(rt().memory.used) }} / {{ formatBytes(rt().memory.total) }}</span>
            <span>Swap: {{ (rt().memory.swap_percent ?? 0).toFixed(0) + '%' }}</span>
          </div>
        </div>

        <!-- Disk Card -->
        <div class="m3-card metric-card">
          <div class="metric-top">
            <span class="metric-label">根分区存储与 I/O</span>
            <mat-icon class="metric-icon">hard_drive</mat-icon>
          </div>
          <div class="metric-value font-mono">
            {{
              rt().disk.percent === null || rt().disk.percent === undefined
                ? 'N/A'
                : rt().disk.percent!.toFixed(1) + '%'
            }}
          </div>
          <mat-progress-bar
            mode="determinate"
            [value]="rt().disk.percent ?? 0"
          ></mat-progress-bar>
          <div class="metric-foot font-mono">
            <span>{{ formatBytes(rt().disk.used) }} / {{ formatBytes(rt().disk.total) }}</span>
            <span>R:{{ formatRate(rt().disk.read_bytes_sec) }} W:{{ formatRate(rt().disk.write_bytes_sec) }}</span>
          </div>
        </div>

        <!-- Load Average & Network Summary Card -->
        <div class="m3-card metric-card">
          <div class="metric-top">
            <span class="metric-label">系统平均负载 (Load Avg)</span>
            <mat-icon class="metric-icon">speed</mat-icon>
          </div>
          <div class="metric-value font-mono">
            {{ formatLoadAvg(rt().load_avg) }}
          </div>
          <mat-progress-bar
            mode="determinate"
            [value]="loadBarPercent()"
          ></mat-progress-bar>
          <div class="metric-foot font-mono">
            <span>↓ {{ formatRate(rt().network.rx_bytes_sec) }}</span>
            <span>↑ {{ formatRate(rt().network.tx_bytes_sec) }}</span>
          </div>
        </div>
      </div>

      <!-- 3. Signature Element: ARM Silicon Per-Core & Thermal Diagnostic Strip -->
      <div class="m3-card silicon-deck">
        <div class="deck-header">
          <div class="deck-title">
            <mat-icon style="color: var(--ag-primary)">ssid_chart</mat-icon>
            <span>ARM 多核拓扑与硅片热力学监控 (Silicon Die Telemetry)</span>
          </div>
          <div class="deck-badges font-mono">
            <span class="m3-badge" [ngClass]="thermal().temp_c !== null ? 'primary' : 'neutral'">
              核心温度: {{ thermal().temp_c !== null ? thermal().temp_c!.toFixed(1) + '°C' : '无传感器 (N/A)' }}
            </span>
            <span class="m3-badge neutral">
              供电电压: {{ thermal().voltage_v !== null && thermal().voltage_v !== undefined ? thermal().voltage_v!.toFixed(3) + ' V' : 'N/A' }}
            </span>
            <span class="m3-badge" [ngClass]="thermal().throttled ? 'danger' : 'success'">
              {{ thermal().throttle_source ? (thermal().throttled ? '温控降频中' : 'vcgencmd 满血无降频') : '标准 Linux 热管理' }}
            </span>
          </div>
        </div>

        <div class="core-grid font-mono">
          <div
            *ngFor="let corePct of coreList(); let i = index"
            class="core-pill"
          >
            <div class="core-top">
              <span class="core-id">CPU{{ i }}</span>
              <span class="core-val">{{ corePct === null ? '--' : corePct.toFixed(0) + '%' }}</span>
            </div>
            <div class="core-bar-bg">
              <div
                class="core-bar-fill"
                [style.width.%]="corePct ?? 0"
                [class.high]="(corePct ?? 0) >= 80"
              ></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 4. Live ECharts Telemetry Canvas -->
      <ag-telemetry-chart></ag-telemetry-chart>

      <!-- 5. Bottom Two-Column Layout: Top Processes & Quick App Launcher -->
      <div class="m3-grid-2">
        <!-- Top Processes -->
        <div class="m3-card">
          <div class="section-header">
            <div class="section-title">
              <mat-icon style="color: var(--ag-primary)">tune</mat-icon>
              <span>实时活躍进程追踪 (Top Processes)</span>
            </div>
            <div class="sort-controls">
              <button
                mat-stroked-button
                [class.active-sort]="procSort() === 'cpu'"
                (click)="changeProcessSort('cpu')"
              >
                按 CPU 排序
              </button>
              <button
                mat-stroked-button
                [class.active-sort]="procSort() === 'mem'"
                (click)="changeProcessSort('mem')"
              >
                按内存排序
              </button>
            </div>
          </div>

          <div class="m3-table-wrap font-mono" style="margin-top: 12px">
            <table class="m3-data-table">
              <thead>
                <tr>
                  <th>PID</th>
                  <th>进程名</th>
                  <th>用户</th>
                  <th>CPU%</th>
                  <th>内存</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let p of system.processes().slice(0, 10)">
                  <td>{{ p.pid }}</td>
                  <td>
                    <strong>{{ p.name }}</strong>
                  </td>
                  <td>{{ p.user }}</td>
                  <td>
                    <span [style.color]="p.cpu_percent > 50 ? 'var(--ag-danger)' : 'var(--ag-primary)'">
                      {{ p.cpu_percent.toFixed(1) }}%
                    </span>
                  </td>
                  <td>{{ formatBytes(p.mem_bytes) }} ({{ p.mem_percent.toFixed(1) }}%)</td>
                  <td>
                    <button
                      mat-icon-button
                      color="warn"
                      matTooltip="终止进程 (SIGTERM)"
                      (click)="handleKillProcess(p.pid, p.name)"
                    >
                      <mat-icon>cancel</mat-icon>
                    </button>
                  </td>
                </tr>
                <tr *ngIf="system.processes().length === 0">
                  <td colspan="6" style="text-align: center; color: var(--ag-on-surface-variant)">
                    正在加载宿主机活跃进程列表...
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Installed / Featured ARM Apps Quick Deck -->
        <div class="m3-card">
          <div class="section-header">
            <div class="section-title">
              <mat-icon style="color: var(--ag-primary)">apps</mat-icon>
              <span>核心运行时与服务快捷矩阵</span>
            </div>
            <button mat-button color="primary" routerLink="/appstore">
              进入软件商店 →
            </button>
          </div>

          <div class="apps-mini-grid" style="margin-top: 12px">
            <div
              *ngFor="let app of quickApps()"
              class="m3-tonal-card app-mini-tile"
              (click)="router.navigateByUrl('/appstore')"
            >
              <div class="app-mini-top">
                <strong>{{ app.name }}</strong>
                <span
                  class="m3-badge"
                  [ngClass]="
                    app.service_status === 'running'
                      ? 'success'
                      : app.status === 'installed'
                        ? 'warning'
                        : 'neutral'
                  "
                >
                  {{
                    app.service_status === 'running'
                      ? '运行中'
                      : app.status === 'installed'
                        ? '已安装'
                        : '未安装'
                  }}
                </span>
              </div>
              <div class="app-mini-desc">{{ app.description }}</div>
              <div class="app-mini-ver font-mono">
                版本: {{ app.current_version || app.versions[0] || 'latest' }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .hero-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
      }
      .hero-left {
        display: flex;
        align-items: flex-start;
        gap: 18px;
      }
      .silicon-icon {
        width: 56px;
        height: 56px;
        border-radius: 18px;
        background: var(--ag-primary-container);
        color: var(--ag-on-primary-container);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .silicon-icon mat-icon {
        font-size: 30px;
        width: 30px;
        height: 30px;
      }
      .hero-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 6px;
      }
      .hero-title {
        margin: 0;
        font-size: 1.45rem;
        font-weight: 800;
      }
      .hero-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        margin-top: 6px;
        font-size: 0.78rem;
        color: var(--ag-on-surface-variant);
      }
      .hero-meta strong {
        color: var(--ag-on-surface);
      }
      .hero-actions {
        display: flex;
        gap: 10px;
      }
      .metric-card {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .metric-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .metric-label {
        font-size: 0.8rem;
        font-weight: 600;
        color: var(--ag-on-surface-variant);
      }
      .metric-icon {
        color: var(--ag-primary);
      }
      .metric-value {
        font-size: 1.7rem;
        font-weight: 800;
        color: var(--ag-on-surface);
      }
      .metric-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 0.72rem;
        color: var(--ag-on-surface-variant);
      }
      .silicon-deck {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .deck-header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .deck-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-family: var(--ag-font-display);
        font-weight: 700;
        font-size: 0.98rem;
      }
      .deck-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .core-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
        gap: 10px;
      }
      .core-pill {
        background: var(--ag-surface);
        border: 1px solid var(--ag-outline-variant);
        border-radius: 14px;
        padding: 10px 12px;
      }
      .core-top {
        display: flex;
        justify-content: space-between;
        font-size: 0.75rem;
        margin-bottom: 6px;
      }
      .core-id {
        color: var(--ag-on-surface-variant);
      }
      .core-val {
        font-weight: 700;
        color: var(--ag-primary);
      }
      .core-bar-bg {
        height: 6px;
        border-radius: 999px;
        background: var(--ag-surface-highest);
        overflow: hidden;
      }
      .core-bar-fill {
        height: 100%;
        background: var(--ag-primary);
        transition: width 250ms ease;
      }
      .core-bar-fill.high {
        background: var(--ag-danger);
      }
      .section-header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .section-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-family: var(--ag-font-display);
        font-weight: 700;
        font-size: 0.96rem;
      }
      .sort-controls {
        display: flex;
        gap: 6px;
      }
      .active-sort {
        background: var(--ag-primary-container) !important;
        color: var(--ag-on-primary-container) !important;
      }
      .apps-mini-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
        gap: 12px;
      }
      .app-mini-tile {
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 6px;
        transition: transform 140ms;
      }
      .app-mini-tile:hover {
        transform: translateY(-2px);
      }
      .app-mini-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .app-mini-desc {
        font-size: 0.75rem;
        color: var(--ag-on-surface-variant);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .app-mini-ver {
        font-size: 0.7rem;
        color: var(--ag-primary);
      }
    `,
  ],
})
export class DashboardComponent implements OnInit, OnDestroy {
  readonly system = inject(SystemService)
  readonly router = inject(Router)
  private toast = inject(ToastService)

  readonly rt = this.system.realtime
  readonly thermal = this.system.thermal
  readonly procSort = signal<'cpu' | 'mem'>('cpu')
  readonly quickApps = signal<AppMarketItem[]>([])

  private procInterval: ReturnType<typeof setInterval> | null = null

  readonly boardDisplayName = computed(() => {
    const info = this.system.info()
    return (
      info?.arm_board_model ||
      this.thermal().board_model ||
      info?.cpu_model ||
      info?.hostname ||
      'ARM Linux Server'
    )
  })

  readonly coreList = computed(() => {
    const cores = this.rt().cpu.cores_percent
    if (cores && cores.length > 0) return cores
    const count = this.system.info()?.cpu_cores || 4
    return Array.from({ length: count }, () => this.rt().cpu.percent)
  })

  readonly loadBarPercent = computed(() => {
    const l1 = this.rt().load_avg?.[0]
    const cores = this.system.info()?.cpu_cores || 1
    if (l1 === null || l1 === undefined) return 0
    return Math.min(100, Math.round((l1 / cores) * 100))
  })

  ngOnInit() {
    this.refreshAll()
    this.procInterval = setInterval(() => {
      this.system.fetchProcesses(this.procSort(), 15)
    }, 5000)
  }

  ngOnDestroy() {
    if (this.procInterval) clearInterval(this.procInterval)
  }

  async refreshAll() {
    await Promise.all([
      this.system.fetchInfo(),
      this.system.fetchRealtime(),
      this.system.fetchProcesses(this.procSort(), 15),
      this.loadQuickApps(),
    ])
  }

  async loadQuickApps() {
    try {
      const res = await appStoreApi.getMarketList()
      if (res.data?.data?.list) {
        this.quickApps.set(res.data.data.list.slice(0, 6))
      }
    } catch {}
  }

  changeProcessSort(sort: 'cpu' | 'mem') {
    this.procSort.set(sort)
    this.system.fetchProcesses(sort, 15)
  }

  async handleKillProcess(pid: number, name: string) {
    if (!confirm(`确定要向进程 ${name} (PID: ${pid}) 发送 SIGTERM 终止信号吗？`)) return
    try {
      await this.system.killProcess(pid)
      this.toast.success(`已终止进程 ${name} (PID ${pid})`)
    } catch (e: any) {
      this.toast.error(`终止进程失败: ${e.message}`)
    }
  }

  formatBytes(bytes: number | null | undefined): string {
    if (bytes === null || bytes === undefined || isNaN(bytes)) return 'N/A'
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
    return `${(bytes / Math.pow(1024, i)).toFixed(i >= 2 ? 1 : 0)} ${units[i]}`
  }

  formatRate(bytesPerSec: number | null | undefined): string {
    if (bytesPerSec === null || bytesPerSec === undefined || isNaN(bytesPerSec)) return '0 KB/s'
    return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  }

  formatLoadAvg(loads: [number | null, number | null, number | null] | undefined): string {
    if (!loads || loads[0] === null) return 'N/A'
    return loads.map((v) => (v === null ? '-' : v.toFixed(2))).join(' / ')
  }

  formatUptime(seconds: number): string {
    if (!seconds) return '0m'
    const d = Math.floor(seconds / 86400)
    const h = Math.floor((seconds % 86400) / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (d > 0) return `${d}天 ${h}小时`
    if (h > 0) return `${h}小时 ${m}分`
    return `${m}分钟`
  }
}
