import { Component, OnInit, OnDestroy, inject, computed, signal } from '@angular/core'
import { Router } from '@angular/router'
import { AgMaterialModule } from '../../core/material.module'
import { SystemService } from '../../core/system.service'
import { ToastService } from '../../core/toast.service'
import { ConfirmService } from '../../core/confirm.service'
import { TelemetryChartComponent } from '../../components/telemetry-chart.component'
import { AgStateBannerComponent } from '../../components/ag-state-banner.component'
import { appStoreApi, AppMarketItem } from '@/api/appstore'

@Component({
  selector: 'ag-dashboard',
  standalone: true,
  imports: [AgMaterialModule, TelemetryChartComponent, AgStateBannerComponent],
  template: `
    <div class="m3-page">
      <!-- 1. Compact Host Health & Status Strip (FE-012 & FE-007) -->
      <div class="m3-card host-summary-bar">
        <div class="summary-main">
          <div class="health-indicator" [ngClass]="overallHealth().tone">
            <mat-icon aria-hidden="true">{{ overallHealth().icon }}</mat-icon>
          </div>

          <div class="host-primary">
            <div class="host-headline">
              <h2 class="host-title font-display">{{ boardDisplayName() }}</h2>
              <span class="m3-badge" [ngClass]="overallHealth().badgeClass">
                {{ overallHealth().label }}
              </span>
              <span class="m3-badge" [ngClass]="system.connectionBadgeClass()">
                {{ system.connectionBadgeLabel() }}
              </span>
              <span class="m3-badge neutral font-mono">
                运行 {{ formatUptime(system.info()?.uptime_seconds || 0) }}
              </span>
            </div>

            <div class="host-subline">
              <span>主机: <strong class="font-mono">{{ system.info()?.hostname || '加载中...' }}</strong></span>
              <span> · 架构: <strong class="font-mono">{{ system.info()?.arch || 'ARM64' }}</strong></span>
              <span> · 系统: <strong>{{ system.info()?.distribution || system.info()?.os || 'Linux' }}</strong></span>
              <span>
                · CPU: <strong>{{ system.info()?.cpu_model || '识别中...' }}</strong>
                <span class="font-mono" style="opacity: 0.75">({{ system.info()?.cpu_cores || 1 }} 核)</span>
              </span>
              <span> · 最后采集: <strong class="font-mono">{{ system.lastUpdatedLabel() }}</strong></span>
            </div>
          </div>

          <div class="summary-actions">
            <button
              type="button"
              mat-button
              (click)="showHostDetail.set(!showHostDetail())"
              [attr.aria-expanded]="showHostDetail()"
            >
              <mat-icon>{{ showHostDetail() ? 'expand_less' : 'expand_more' }}</mat-icon>
              <span>{{ showHostDetail() ? '收起硬件参数' : '硬件详情' }}</span>
            </button>
            <button type="button" mat-stroked-button routerLink="/terminal">
              <mat-icon>terminal</mat-icon>
              <span>Web 终端</span>
            </button>
            <button
              type="button"
              mat-flat-button
              color="primary"
              [disabled]="refreshing()"
              (click)="refreshAll()"
            >
              <mat-icon>refresh</mat-icon>
              <span>{{ refreshing() ? '刷新中...' : '刷新状态' }}</span>
            </button>
          </div>
        </div>

        <!-- Expandable Hardware Details -->
        <div *ngIf="showHostDetail()" class="host-detail-drawer font-mono">
          <div>处理器型号: <strong>{{ system.info()?.cpu_model || 'ARM SoC' }}</strong> · 逻辑核心: <strong class="font-mono">{{ system.info()?.cpu_cores || 1 }}</strong></div>
          <div>内核版本: <strong>{{ system.info()?.kernel || '未知' }}</strong></div>
          <div>调速器策略: <strong>{{ rt().cpu.governor || '默认' }} ({{ system.pollIntervalMs() }}ms 采样)</strong></div>
          <div>面板版本: <strong>{{ system.info()?.panel_version || 'v0.2.0' }} ({{ system.info()?.build_commit || 'source' }})</strong></div>
        </div>

        <!-- Actionable Alerts Strip (when issues detected) -->
        <div *ngIf="healthAlerts().length > 0" class="health-alerts-strip" role="alert">
          <div *ngFor="let alert of healthAlerts()" class="alert-item">
            <mat-icon aria-hidden="true">warning_amber</mat-icon>
            <span>{{ alert }}</span>
          </div>
          <button
            *ngIf="system.isStale()"
            type="button"
            mat-stroked-button
            color="warn"
            (click)="system.reconnectNow()"
          >
            立即重连遥测
          </button>
        </div>
      </div>

      <!-- 2. Primary 4 Metric Cards (Strict 4-Col Desktop / 2x2 Tablet Grid, FE-012) -->
      <div class="m3-grid-4">
        <!-- CPU Card -->
        <div class="m3-card metric-card">
          <div class="metric-top">
            <span class="metric-label">CPU 处理器负载</span>
            <mat-icon class="metric-icon" aria-hidden="true">memory</mat-icon>
          </div>
          <div class="metric-value font-mono">
            {{
              rt().cpu.percent === null || rt().cpu.percent === undefined
                ? '暂无数据'
                : rt().cpu.percent!.toFixed(1) + '%'
            }}
          </div>
          <mat-progress-bar
            mode="determinate"
            [value]="rt().cpu.percent ?? 0"
            aria-label="CPU 使用率进度条"
          ></mat-progress-bar>
          <div class="metric-foot">
            <span>主频: <strong class="font-mono">{{ rt().cpu.frequency_mhz ? rt().cpu.frequency_mhz + ' MHz' : '硬件不支持' }}</strong></span>
            <span>{{ system.info()?.cpu_cores || coreList().length }} 核心</span>
          </div>
        </div>

        <!-- Memory Card -->
        <div class="m3-card metric-card">
          <div class="metric-top">
            <span class="metric-label">物理内存与交换区</span>
            <mat-icon class="metric-icon" aria-hidden="true">storage</mat-icon>
          </div>
          <div class="metric-value font-mono">
            {{
              rt().memory.percent === null || rt().memory.percent === undefined
                ? '暂无数据'
                : rt().memory.percent!.toFixed(1) + '%'
            }}
          </div>
          <mat-progress-bar
            mode="determinate"
            [value]="rt().memory.percent ?? 0"
            aria-label="物理内存使用率进度条"
          ></mat-progress-bar>
          <div class="metric-foot">
            <span class="font-mono">{{ formatBytes(rt().memory.used) }} / {{ formatBytes(rt().memory.total) }}</span>
            <span>交换区: <strong class="font-mono">{{ rt().memory.swap_percent === null ? '未启用' : rt().memory.swap_percent!.toFixed(0) + '%' }}</strong></span>
          </div>
        </div>

        <!-- Disk Card -->
        <div class="m3-card metric-card">
          <div class="metric-top">
            <span class="metric-label">根分区存储与读写</span>
            <mat-icon class="metric-icon" aria-hidden="true">hard_drive</mat-icon>
          </div>
          <div class="metric-value font-mono">
            {{
              rt().disk.percent === null || rt().disk.percent === undefined
                ? '暂无数据'
                : rt().disk.percent!.toFixed(1) + '%'
            }}
          </div>
          <mat-progress-bar
            mode="determinate"
            [value]="rt().disk.percent ?? 0"
            aria-label="根分区存储使用率进度条"
          ></mat-progress-bar>
          <div class="metric-foot">
            <span class="font-mono">{{ formatBytes(rt().disk.used) }} / {{ formatBytes(rt().disk.total) }}</span>
            <span class="font-mono">读 {{ formatRate(rt().disk.read_bytes_sec) }} · 写 {{ formatRate(rt().disk.write_bytes_sec) }}</span>
          </div>
        </div>

        <!-- Load Average, Network & Thermal Summary Card -->
        <div class="m3-card metric-card">
          <div class="metric-top">
            <span class="metric-label">系统负载与网络吞吐</span>
            <mat-icon class="metric-icon" aria-hidden="true">speed</mat-icon>
          </div>
          <div class="metric-value font-mono">
            {{ formatLoadAvg(rt().load_avg) }}
          </div>
          <mat-progress-bar
            mode="determinate"
            [value]="loadBarPercent()"
            aria-label="系统平均负载进度条"
          ></mat-progress-bar>
          <div class="metric-foot font-mono">
            <span>↓ {{ formatRate(rt().network.rx_bytes_sec) }}</span>
            <span>↑ {{ formatRate(rt().network.tx_bytes_sec) }}</span>
          </div>
        </div>
      </div>

      <!-- 3. Live ECharts Telemetry Canvas (Moved Up Above-the-Fold, FE-012) -->
      <ag-telemetry-chart></ag-telemetry-chart>

      <!-- 4. Compact Per-Core & Thermal Diagnostic Strip -->
      <div class="m3-card silicon-deck">
        <div class="deck-header">
          <div class="deck-title">
            <mat-icon style="color: var(--ag-primary)" aria-hidden="true">ssid_chart</mat-icon>
            <span>多核负载与芯片传感器状态</span>
          </div>
          <div class="deck-badges font-mono">
            <span class="m3-badge" [ngClass]="thermal().temp_c !== null ? 'primary' : 'neutral'">
              核心温度: {{ thermal().temp_c !== null ? thermal().temp_c!.toFixed(1) + '°C' : '无传感器' }}
            </span>
            <span class="m3-badge neutral">
              供电电压: {{ thermal().voltage_v !== null && thermal().voltage_v !== undefined ? thermal().voltage_v!.toFixed(3) + ' V' : '硬件不支持' }}
            </span>
            <span class="m3-badge" [ngClass]="thermal().throttled ? 'danger' : 'success'">
              {{ thermal().throttle_source ? (thermal().throttled ? '温控降频中' : '供电与频点正常') : '标准 Linux 热管理' }}
            </span>
          </div>
        </div>

        <div class="core-grid font-mono">
          <div
            *ngFor="let corePct of coreList(); let i = index"
            class="core-pill"
          >
            <div class="core-top">
              <span class="core-id">核心 {{ i }}</span>
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

      <!-- 5. Bottom Two-Column Layout: Top Processes & Quick App Launcher -->
      <div class="m3-grid-2 dash-bottom-grid">
        <!-- Top Processes -->
        <div class="m3-card dash-bottom-card">
          <div class="section-header">
            <div class="section-title">
              <mat-icon style="color: var(--ag-primary)" aria-hidden="true">tune</mat-icon>
              <span>高占用进程管理</span>
            </div>
            <div class="sort-controls">
              <button
                type="button"
                mat-stroked-button
                [class.active-sort]="procSort() === 'cpu'"
                (click)="changeProcessSort('cpu')"
              >
                按 CPU
              </button>
              <button
                type="button"
                mat-stroked-button
                [class.active-sort]="procSort() === 'mem'"
                (click)="changeProcessSort('mem')"
              >
                按内存
              </button>
              <button
                type="button"
                mat-stroked-button
                [matTooltip]="procAutoRefresh() ? '点击暂停每 5 秒自动刷新' : '点击恢复每 5 秒自动刷新'"
                (click)="procAutoRefresh.set(!procAutoRefresh())"
              >
                {{ procAutoRefresh() ? '自动刷新: 开' : '自动刷新: 停' }}
              </button>
            </div>
          </div>

          <div class="m3-filter-bar" style="margin-top: 12px; margin-bottom: 8px">
            <input
              type="text"
              [(ngModel)]="procSearch"
              aria-label="按进程名、PID 或用户名筛选进程"
              placeholder="筛选进程名、PID 或所属用户..."
              class="m3-search-input"
              style="flex: 1"
            />
          </div>

          <ag-state-banner
            *ngIf="system.processesError() && system.processes().length > 0"
            state="partial_error"
            title="进程列表刷新失败，当前显示上次记录"
            [description]="system.processesError()!"
            actionLabel="重试"
            (action)="system.fetchProcesses(procSort(), 15, false)"
          ></ag-state-banner>

          <div class="m3-table-wrap font-mono dash-scroll" style="margin-top: 8px">
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
                <tr *ngFor="let p of filteredProcesses()">
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
                    <div style="display: flex; gap: 4px; align-items: center">
                      <button
                        type="button"
                        mat-button
                        color="primary"
                        [disabled]="p.pid <= 1"
                        matTooltip="发送 SIGTERM (-15) 请求进程保存状态并优雅退出"
                        [attr.aria-label]="'温和结束进程 ' + p.name + ' (SIGTERM)'"
                        (click)="handleKillProcess(p.pid, p.name, false)"
                      >
                        结束 (SIGTERM)
                      </button>
                      <button
                        type="button"
                        mat-button
                        color="warn"
                        [disabled]="p.pid <= 1"
                        matTooltip="发送 SIGKILL (-9) 强制立即终止进程（未保存数据可能丢失）"
                        [attr.aria-label]="'强制终止进程 ' + p.name + ' (SIGKILL)'"
                        (click)="handleKillProcess(p.pid, p.name, true)"
                      >
                        强杀 (SIGKILL)
                      </button>
                    </div>
                  </td>
                </tr>
                <tr *ngIf="system.processesLoading() && system.processes().length === 0">
                  <td colspan="6" class="m3-empty-state">正在读取宿主机活跃进程列表...</td>
                </tr>
                <tr *ngIf="!system.processesLoading() && filteredProcesses().length === 0">
                  <td colspan="6" class="m3-empty-state">
                    {{ procSearch.trim() ? '没有匹配筛选条件的进程。' : '未读取到活跃进程记录。' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Installed / Featured ARM Apps Quick Deck -->
        <div class="m3-card dash-bottom-card">
          <div class="section-header">
            <div class="section-title">
              <mat-icon style="color: var(--ag-primary)" aria-hidden="true">apps</mat-icon>
              <span>核心运行环境与服务状态</span>
            </div>
            <button type="button" mat-button color="primary" routerLink="/appstore">
              进入软件商店 →
            </button>
          </div>

          <ag-state-banner
            *ngIf="appsError()"
            state="error"
            title="无法加载软件状态"
            [description]="appsError()!"
            actionLabel="重试"
            (action)="loadQuickApps()"
          ></ag-state-banner>

          <div *ngIf="!appsError()" class="apps-mini-grid dash-scroll" style="margin-top: 12px">
            <div
              *ngFor="let app of quickApps()"
              class="m3-tonal-card app-mini-tile"
              role="button"
              tabindex="0"
              (click)="router.navigateByUrl('/appstore')"
              (keydown.enter)="router.navigateByUrl('/appstore')"
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
                版本: {{ app.current_version || app.versions[0] || '默认版本' }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .host-summary-bar {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 16px 20px !important;
      }
      .summary-main {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
      }
      .health-indicator {
        width: 44px;
        height: 44px;
        border-radius: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        background: var(--ag-success-container);
        color: var(--ag-success);
      }
      .health-indicator.warning {
        background: var(--ag-warning-container);
        color: var(--ag-warning);
      }
      .health-indicator.danger {
        background: var(--ag-danger-container);
        color: var(--ag-danger);
      }
      .host-primary {
        flex: 1;
        min-width: 260px;
      }
      .host-headline {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
      }
      .host-title {
        margin: 0;
        font-size: 1.18rem;
        font-weight: 800;
      }
      .host-subline {
        margin-top: 4px;
        font-size: 0.78rem;
        color: var(--ag-on-surface-variant);
      }
      .summary-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
      }
      .host-detail-drawer {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 10px;
        padding: 12px 14px;
        border-radius: 14px;
        background: var(--ag-surface);
        border: 1px solid var(--ag-outline-variant);
        font-size: 0.76rem;
        color: var(--ag-on-surface-variant);
      }
      .host-detail-drawer strong {
        color: var(--ag-on-surface);
      }
      .health-alerts-strip {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 10px 14px;
        border-radius: 14px;
        background: var(--ag-warning-container);
        border: 1px solid var(--ag-warning);
        font-size: 0.8rem;
      }
      .alert-item {
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--ag-warning);
        font-weight: 600;
      }
      .metric-card {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 16px 18px !important;
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
        font-size: 1.55rem;
        font-weight: 800;
        color: var(--ag-on-surface);
      }
      .metric-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        font-size: 0.73rem;
        color: var(--ag-on-surface-variant);
      }
      .silicon-deck {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 16px 20px !important;
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
        font-size: 0.95rem;
      }
      .deck-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .core-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(115px, 1fr));
        gap: 8px;
      }
      .core-pill {
        background: var(--ag-surface);
        border: 1px solid var(--ag-outline-variant);
        border-radius: 12px;
        padding: 8px 10px;
      }
      .core-top {
        display: flex;
        justify-content: space-between;
        font-size: 0.74rem;
        margin-bottom: 5px;
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
        font-size: 0.95rem;
      }
      .sort-controls {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .active-sort {
        background: var(--ag-primary-container) !important;
        color: var(--ag-on-primary-container) !important;
      }
      /* 底部两张卡片等高：高度差过大会显得留白突兀，统一固定高度 + 内部滚动 */
      .dash-bottom-grid {
        align-items: stretch;
      }
      .dash-bottom-card {
        display: flex;
        flex-direction: column;
        height: 460px;
        min-height: 0;
      }
      .dash-scroll {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
      }
      @media (max-width: 1024px) {
        .dash-bottom-card {
          height: auto;
          max-height: 520px;
        }
      }
      .apps-mini-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 10px;
        align-content: start;
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
  private confirm = inject(ConfirmService)

  readonly rt = this.system.realtime
  readonly thermal = this.system.thermal
  readonly procSort = signal<'cpu' | 'mem'>('cpu')
  readonly procAutoRefresh = signal<boolean>(true)
  readonly showHostDetail = signal<boolean>(false)
  readonly refreshing = signal<boolean>(false)
  readonly quickApps = signal<AppMarketItem[]>([])
  readonly appsError = signal<string | null>(null)

  procSearch = ''
  private procInterval: ReturnType<typeof setInterval> | null = null

  readonly boardDisplayName = computed(() => {
    const info = this.system.info()
    return (
      info?.arm_board_model ||
      this.thermal().board_model ||
      info?.cpu_model ||
      info?.hostname ||
      'ARM Linux 服务器'
    )
  })

  readonly healthAlerts = computed(() => {
    const alerts: string[] = []
    if (this.system.isStale()) {
      alerts.push(`遥测连接中断或数据已过期 (${this.system.lastError() || '请检查面板网络'})`)
    }
    const cpu = this.rt().cpu.percent
    if (cpu !== null && cpu >= 85) {
      alerts.push(`CPU 负载偏高 (${cpu.toFixed(1)}%)`)
    }
    const mem = this.rt().memory.percent
    if (mem !== null && mem >= 85) {
      alerts.push(`物理内存占用偏高 (${mem.toFixed(1)}%)`)
    }
    const disk = this.rt().disk.percent
    if (disk !== null && disk >= 85) {
      alerts.push(`根分区磁盘空间不足 (${disk.toFixed(1)}%)`)
    }
    const th = this.thermal()
    if (th.throttled || th.under_voltage || (th.temp_c !== null && th.temp_c >= 75)) {
      alerts.push('检测到 ARM 芯片高温或降频告警')
    }
    return alerts
  })

  readonly overallHealth = computed(() => {
    const alerts = this.healthAlerts()
    if (this.system.connectionState() === 'offline') {
      return {
        tone: 'danger',
        badgeClass: 'danger',
        icon: 'cloud_off',
        label: '遥测离线',
      }
    }
    if (alerts.length > 0) {
      return {
        tone: 'warning',
        badgeClass: 'warning',
        icon: 'warning_amber',
        label: `${alerts.length} 项待关注`,
      }
    }
    return {
      tone: 'ok',
      badgeClass: 'success',
      icon: 'verified',
      label: '系统运行正常',
    }
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

  filteredProcesses(): any[] {
    const list = this.system.processes()
    const q = this.procSearch.trim().toLowerCase()
    const filtered = q
      ? list.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            String(p.pid).includes(q) ||
            (p.user || '').toLowerCase().includes(q)
        )
      : list
    return filtered.slice(0, 10)
  }

  ngOnInit() {
    this.refreshAll()
    this.procInterval = setInterval(() => {
      if (!this.procAutoRefresh()) return
      if (typeof document !== 'undefined' && document.hidden) return
      this.system.fetchProcesses(this.procSort(), 15, true)
    }, 5000)
  }

  ngOnDestroy() {
    if (this.procInterval) clearInterval(this.procInterval)
  }

  async refreshAll() {
    this.refreshing.set(true)
    try {
      await Promise.all([
        this.system.fetchInfo(true),
        this.system.fetchRealtime(false),
        this.system.fetchProcesses(this.procSort(), 15, false),
        this.loadQuickApps(),
      ])
    } finally {
      this.refreshing.set(false)
    }
  }

  async loadQuickApps() {
    this.appsError.set(null)
    try {
      const res = await appStoreApi.getMarketList()
      if (res.data?.data?.list) {
        this.quickApps.set(res.data.data.list.slice(0, 6))
      }
    } catch (e: any) {
      this.appsError.set(e?.message || '读取软件商店列表失败')
    }
  }

  changeProcessSort(sort: 'cpu' | 'mem') {
    this.procSort.set(sort)
    this.system.fetchProcesses(sort, 15, false)
  }

  async handleKillProcess(pid: number, name: string, force = false) {
    const res = await this.confirm.ask({
      title: force ? '强制终止进程 (SIGKILL)' : '温和停止进程 (SIGTERM)',
      resourceName: `${name} (PID: ${pid})`,
      message: force
        ? `确定要向进程 ${name} (PID: ${pid}) 发送 SIGKILL (-9) 强制终止信号吗？`
        : `确定要向进程 ${name} (PID: ${pid}) 发送 SIGTERM (-15) 温和退出信号吗？`,
      impact: force
        ? 'SIGKILL 由 Linux 内核直接强行销毁进程，进程无法执行清理逻辑，未落盘的缓存或事务数据可能丢失。'
        : 'SIGTERM 允许目标进程捕获信号、保存当前状态并关闭连接后优雅退出；若进程无响应，再使用强杀 (SIGKILL)。',
      confirmText: force ? '发送 SIGKILL 强杀' : '发送 SIGTERM 结束',
      tone: force ? 'danger' : 'warning',
    })
    if (!res.confirmed) return

    try {
      await this.system.killProcess(pid, force)
      this.toast.success(`已向进程 ${name} (PID ${pid}) 发送 ${force ? 'SIGKILL' : 'SIGTERM'} 信号`)
    } catch (e: any) {
      this.toast.error(`终止进程失败: ${e.message}`)
    }
  }

  formatBytes(bytes: number | null | undefined): string {
    if (bytes === null || bytes === undefined || isNaN(bytes)) return '暂无数据'
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
    return `${(bytes / Math.pow(1024, i)).toFixed(i >= 2 ? 1 : 0)} ${units[i]}`
  }

  formatRate(bytesPerSec: number | null | undefined): string {
    if (bytesPerSec === null || bytesPerSec === undefined || isNaN(bytesPerSec)) return '暂无数据'
    return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  }

  formatLoadAvg(loads: [number | null, number | null, number | null] | undefined): string {
    if (!loads || loads[0] === null) return '暂无数据'
    return loads.map((v) => (v === null ? '-' : v.toFixed(2))).join(' / ')
  }

  formatUptime(seconds: number): string {
    if (!seconds) return '0分钟'
    const d = Math.floor(seconds / 86400)
    const h = Math.floor((seconds % 86400) / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (d > 0) return `${d}天 ${h}小时`
    if (h > 0) return `${h}小时 ${m}分`
    return `${m}分钟`
  }
}
