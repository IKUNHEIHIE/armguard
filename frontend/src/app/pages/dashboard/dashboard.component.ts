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
      <!-- ============ 1. 主机概览枢纽 ============ -->
      <section class="hub-card">
        <div class="hub-left">
          <div class="hub-icon" aria-hidden="true">
            <mat-icon>developer_board</mat-icon>
            <span class="hub-pulse">
              <span class="pulse-ring"></span>
              <span class="pulse-dot"></span>
            </span>
          </div>

          <div class="hub-main">
            <div class="hub-title-row">
              <h1 class="hub-title">{{ system.info()?.hostname || 'armguard-node' }}</h1>
              <span class="m3-badge" [ngClass]="overallHealth().badgeClass">{{ overallHealth().label }}</span>
              <span class="arch-chip font-mono">{{ archChipLabel() }}</span>
            </div>

            <div class="hub-meta font-mono">
              <span class="meta-item">
                <mat-icon aria-hidden="true">lan</mat-icon>
                {{ system.info()?.hostname }} · {{ system.info()?.arch }}
              </span>
              <span class="meta-item">
                <mat-icon aria-hidden="true">memory</mat-icon>
                {{ system.info()?.cpu_model || 'ARM SoC' }} ({{ system.info()?.cpu_cores || 1 }} 核)
              </span>
              <span class="meta-item">
                <mat-icon aria-hidden="true">deployed_code</mat-icon>
                {{ system.info()?.distribution || system.info()?.os || 'Linux' }} · {{ system.info()?.kernel || '' }}
              </span>
            </div>
          </div>
        </div>

        <div class="hub-right">
          <div class="hub-stat">
            <span class="stat-label">运行时长</span>
            <span class="stat-value font-mono">{{ formatUptime(system.info()?.uptime_seconds || 0) }}</span>
          </div>
          <div class="hub-stat">
            <span class="stat-label">负载 AVG (1/5/15)</span>
            <span class="stat-value font-mono">{{ formatLoadAvg(rt().load_avg) }}</span>
          </div>
          <button type="button" class="refresh-btn" [disabled]="refreshing()" (click)="refreshAll()">
            <mat-icon aria-hidden="true">refresh</mat-icon>
            <span>{{ refreshing() ? '刷新中…' : '刷新遥测' }}</span>
          </button>
        </div>

        <!-- 告警条 -->
        <div *ngIf="healthAlerts().length > 0" class="hub-alerts" role="alert">
          <div class="alerts-left">
            <mat-icon aria-hidden="true">warning_amber</mat-icon>
            <span>{{ healthAlerts().join(' · ') }}</span>
          </div>
          <button *ngIf="system.isStale()" type="button" class="alerts-btn" (click)="system.reconnectNow()">
            立即重连
          </button>
        </div>
      </section>

      <!-- ============ 2. 四项核心指标 ============ -->
      <div class="m3-grid-4">
        <!-- CPU -->
        <section class="m3-card metric-card">
          <header class="metric-head">
            <mat-icon class="metric-icon" aria-hidden="true">memory</mat-icon>
            <span class="metric-title">CPU 算力利用率</span>
            <span class="metric-chip font-mono">{{ rt().cpu.frequency_mhz ? rt().cpu.frequency_mhz + ' MHz' : '—' }}</span>
          </header>
          <div class="metric-value font-mono">
            {{ rt().cpu.percent === null ? '—' : rt().cpu.percent!.toFixed(1) }}<span class="unit">%</span>
          </div>
          <div class="metric-sub">{{ system.info()?.cpu_cores || 0 }} 核心 · 集群动态调度</div>
          <div class="bar">
            <div class="bar-fill" [style.width.%]="rt().cpu.percent ?? 0" [ngClass]="toneClass(rt().cpu.percent)"></div>
          </div>
          <div class="metric-foot">
            <span class="font-mono">调速器 {{ rt().cpu.governor || '—' }}</span>
            <svg class="spark" viewBox="0 0 120 28" preserveAspectRatio="none" aria-hidden="true">
              <path [attr.d]="cpuSpark()" fill="none" stroke="var(--ag-primary)" stroke-width="1.6" />
            </svg>
          </div>
        </section>

        <!-- 内存 -->
        <section class="m3-card metric-card">
          <header class="metric-head">
            <mat-icon class="metric-icon" aria-hidden="true">storage</mat-icon>
            <span class="metric-title">物理内存 & ZRAM</span>
            <span class="metric-chip font-mono">{{ memoryTypeLabel() }}</span>
          </header>
          <div class="metric-value font-mono">
            {{ rt().memory.percent === null ? '—' : rt().memory.percent!.toFixed(1) }}<span class="unit">%</span>
          </div>
          <div class="metric-sub font-mono">
            {{ formatBytes(rt().memory.used) }} / {{ formatBytes(rt().memory.total) }}
          </div>
          <div class="bar">
            <div class="bar-fill" [style.width.%]="rt().memory.percent ?? 0" [ngClass]="toneClass(rt().memory.percent)"></div>
          </div>
          <div class="metric-foot">
            <span class="font-mono">Swap {{ rt().memory.swap_percent === null ? '未启用' : rt().memory.swap_percent!.toFixed(0) + '%' }}</span>
            <span class="font-mono">{{ formatBytes(rt().memory.swap_used) }} / {{ formatBytes(rt().memory.swap_total) }}</span>
          </div>
        </section>

        <!-- 磁盘 -->
        <section class="m3-card metric-card">
          <header class="metric-head">
            <mat-icon class="metric-icon" aria-hidden="true">hard_drive</mat-icon>
            <span class="metric-title">系统存储池</span>
            <span class="metric-chip font-mono">/ 根分区</span>
          </header>
          <div class="metric-value font-mono">
            {{ rt().disk.percent === null ? '—' : rt().disk.percent!.toFixed(1) }}<span class="unit">%</span>
          </div>
          <div class="metric-sub font-mono">
            {{ formatBytes(rt().disk.used) }} / {{ formatBytes(rt().disk.total) }}
          </div>
          <div class="bar">
            <div class="bar-fill" [style.width.%]="rt().disk.percent ?? 0" [ngClass]="toneClass(rt().disk.percent)"></div>
          </div>
          <div class="metric-foot">
            <span class="font-mono">读 {{ formatRate(rt().disk.read_bytes_sec) }}</span>
            <span class="font-mono">写 {{ formatRate(rt().disk.write_bytes_sec) }}</span>
          </div>
        </section>

        <!-- 网络 -->
        <section class="m3-card metric-card">
          <header class="metric-head">
            <mat-icon class="metric-icon" aria-hidden="true">swap_vert</mat-icon>
            <span class="metric-title">网络吞吐速率</span>
            <span class="metric-chip font-mono">Dual-Stack</span>
          </header>
          <div class="net-values">
            <div class="net-item">
              <span class="net-label"><mat-icon aria-hidden="true">arrow_upward</mat-icon>上行 TX</span>
              <span class="net-value font-mono">{{ formatRate(rt().network.tx_bytes_sec) }}</span>
            </div>
            <div class="net-item">
              <span class="net-label"><mat-icon aria-hidden="true">arrow_downward</mat-icon>下行 RX</span>
              <span class="net-value font-mono">{{ formatRate(rt().network.rx_bytes_sec) }}</span>
            </div>
          </div>
          <svg class="spark spark-wide" viewBox="0 0 240 28" preserveAspectRatio="none" aria-hidden="true">
            <path [attr.d]="netSpark()" fill="none" stroke="var(--ag-secondary)" stroke-width="1.6" />
          </svg>
          <div class="metric-foot">
            <span class="font-mono">累计 ↓ {{ formatBytes(rt().network.total_rx_bytes) }}</span>
            <span class="font-mono">↑ {{ formatBytes(rt().network.total_tx_bytes) }}</span>
          </div>
        </section>
      </div>

      <!-- ============ 3. 实时趋势 ============ -->
      <ag-telemetry-chart></ag-telemetry-chart>

      <!-- ============ 4. ARM 专属硬件健康遥测 ============ -->
      <section class="m3-card telemetry-card">
        <header class="section-head">
          <div class="section-title-wrap">
            <span class="section-icon" aria-hidden="true"><mat-icon>developer_board</mat-icon></span>
            <div>
              <h2 class="section-title">ARM 专属硬件健康遥测 (Hardware Telemetry)</h2>
              <p class="section-sub">
                基于 SoC 内置 Thermal Sensor、PMIC 电源管理单元与内核 cpufreq 实时抓取
              </p>
            </div>
          </div>
          <span class="m3-badge" [ngClass]="thermalBadge().cls">{{ thermalBadge().text }}</span>
        </header>

        <div class="hw-grid">
          <!-- SoC 温度 -->
          <div class="hw-tile">
            <div class="hw-head">
              <span class="hw-label">SoC 核心温度</span>
              <mat-icon class="hw-icon" [style.color]="tempColor()" aria-hidden="true">thermostat</mat-icon>
            </div>
            <div class="hw-value font-mono" [style.color]="tempColor()">
              {{ thermal().temp_c === null ? '—' : thermal().temp_c!.toFixed(1) }}<span class="unit">°C</span>
            </div>
            <div class="hw-desc">{{ tempStatusText() }}</div>
            <div class="hw-bar">
              <div class="hw-bar-fill" [style.width.%]="tempPercent()" [style.background]="tempColor()"></div>
            </div>
          </div>

          <!-- 核心电压 -->
          <div class="hw-tile">
            <div class="hw-head">
              <span class="hw-label">核心工作电压</span>
              <mat-icon class="hw-icon" style="color: var(--ag-secondary)" aria-hidden="true">bolt</mat-icon>
            </div>
            <div class="hw-value font-mono">
              {{ thermal().voltage_v === null || thermal().voltage_v === undefined ? '—' : thermal().voltage_v!.toFixed(2) }}<span class="unit">V</span>
            </div>
            <div class="hw-desc">动态 DVFS 调压稳定</div>
            <div class="hw-foot font-mono">PMIC 采样 · {{ thermal().throttle_source || '未接入 vcgencmd' }}</div>
          </div>

          <!-- 温控降频 -->
          <div class="hw-tile">
            <div class="hw-head">
              <span class="hw-label">温控降频监测</span>
              <mat-icon
                class="hw-icon"
                [style.color]="thermal().throttled ? 'var(--ag-danger)' : 'var(--ag-success)'"
                aria-hidden="true"
              >
                {{ thermal().throttled ? 'trending_down' : 'check_circle' }}
              </mat-icon>
            </div>
            <div class="hw-value hw-value-text" [style.color]="thermal().throttled ? 'var(--ag-danger)' : 'var(--ag-success)'">
              {{ thermal().throttled === null ? '硬件不支持' : thermal().throttled ? '降频中' : '无降频' }}
            </div>
            <div class="hw-desc">{{ thermal().throttled ? '检测到温控降频保护已介入' : '核心频点满额释放' }}</div>
            <div class="hw-foot font-mono">Throttled 掩码 {{ thermal().throttling_flags_hex || '—' }}</div>
          </div>

          <!-- 供电欠压 -->
          <div class="hw-tile">
            <div class="hw-head">
              <span class="hw-label">供电欠压诊断</span>
              <mat-icon
                class="hw-icon"
                [style.color]="thermal().under_voltage ? 'var(--ag-danger)' : 'var(--ag-success)'"
                aria-hidden="true"
              >
                {{ thermal().under_voltage ? 'battery_alert' : 'battery_full' }}
              </mat-icon>
            </div>
            <div class="hw-value hw-value-text" [style.color]="thermal().under_voltage ? 'var(--ag-danger)' : 'var(--ag-success)'">
              {{ thermal().under_voltage === null ? '硬件不支持' : thermal().under_voltage ? '欠压告警' : '供电正常' }}
            </div>
            <div class="hw-desc">{{ thermal().under_voltage ? '请检查电源适配器与线材' : '12V/5A 适配器稳定' }}</div>
            <div class="hw-foot font-mono">Under-voltage 标志位</div>
          </div>

          <!-- 调频策略 -->
          <div class="hw-tile">
            <div class="hw-head">
              <span class="hw-label">CPU 调频策略</span>
              <mat-icon class="hw-icon" style="color: var(--ag-primary)" aria-hidden="true">speed</mat-icon>
            </div>
            <div class="hw-value font-mono">
              {{ thermal().freq_mhz ? (thermal().freq_mhz! / 1000).toFixed(2) : '—' }}<span class="unit">GHz</span>
            </div>
            <div class="hw-desc font-mono">{{ thermal().governor || rt().cpu.governor || '未识别调速器' }}</div>
            <div class="hw-foot font-mono">当前频点 / 硬件峰值 {{ thermal().max_freq_mhz ? (thermal().max_freq_mhz! / 1000).toFixed(1) + ' GHz' : '—' }}</div>
          </div>
        </div>
      </section>

      <!-- ============ 5. 进程与服务双栏 ============ -->
      <div class="bottom-grid">
        <!-- 热门高占用进程 -->
        <section class="m3-card proc-card">
          <header class="section-head">
            <div class="section-title-wrap">
              <span class="section-icon" aria-hidden="true"><mat-icon>list_alt</mat-icon></span>
              <div>
                <h2 class="section-title">热门高占用进程 (Top Processes)</h2>
                <p class="section-sub">按 {{ procSort() === 'cpu' ? 'CPU' : '内存' }} 占用降序，每 5 秒自动刷新</p>
              </div>
            </div>
            <div class="proc-tools">
              <button type="button" class="tool-btn" [class.on]="procSort() === 'cpu'" (click)="changeProcessSort('cpu')">
                按 CPU
              </button>
              <button type="button" class="tool-btn" [class.on]="procSort() === 'mem'" (click)="changeProcessSort('mem')">
                按内存
              </button>
              <button type="button" class="tool-btn" (click)="procAutoRefresh.set(!procAutoRefresh())">
                {{ procAutoRefresh() ? '自动刷新 开' : '自动刷新 停' }}
              </button>
            </div>
          </header>

          <div class="proc-search">
            <mat-icon aria-hidden="true">filter_list</mat-icon>
            <input
              type="text"
              [(ngModel)]="procSearch"
              aria-label="按进程名、PID 或用户名筛选"
              placeholder="过滤进程名、PID 或所属用户…"
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

          <div class="m3-table-wrap proc-table-wrap">
            <table class="m3-data-table">
              <thead>
                <tr>
                  <th>PID</th>
                  <th>进程命令</th>
                  <th>用户</th>
                  <th class="num">CPU</th>
                  <th class="num">内存</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let p of filteredProcesses()">
                  <td class="font-mono">{{ p.pid }}</td>
                  <td>
                    <span class="proc-name">
                      <span class="proc-dot" aria-hidden="true"></span>
                      <strong>{{ p.name }}</strong>
                    </span>
                  </td>
                  <td class="proc-user font-mono">{{ p.user }}</td>
                  <td class="num font-mono">
                    <span [class.hot]="p.cpu_percent > 50">{{ p.cpu_percent.toFixed(1) }}%</span>
                  </td>
                  <td class="num font-mono">{{ formatBytes(p.mem_bytes) }}</td>
                  <td>
                    <div class="row-actions">
                      <button
                        type="button"
                        class="row-btn"
                        [disabled]="p.pid <= 1"
                        matTooltip="发送 SIGTERM 优雅退出"
                        (click)="handleKillProcess(p.pid, p.name, false)"
                      >
                        结束
                      </button>
                      <button
                        type="button"
                        class="row-btn danger"
                        [disabled]="p.pid <= 1"
                        matTooltip="发送 SIGKILL 强制终止"
                        (click)="handleKillProcess(p.pid, p.name, true)"
                      >
                        强杀
                      </button>
                    </div>
                  </td>
                </tr>
                <tr *ngIf="system.processesLoading() && system.processes().length === 0">
                  <td colspan="6" class="m3-empty-state">正在读取宿主机活跃进程列表…</td>
                </tr>
                <tr *ngIf="!system.processesLoading() && filteredProcesses().length === 0">
                  <td colspan="6" class="m3-empty-state">
                    {{ procSearch.trim() ? '没有匹配筛选条件的进程。' : '未读取到活跃进程记录。' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <footer class="proc-foot">
            <span class="font-mono">共 {{ system.processes().length }} 个活跃系统进程</span>
            <button type="button" class="link-btn" (click)="router.navigateByUrl('/terminal')">
              打开终端查看完整进程树
              <mat-icon aria-hidden="true">arrow_forward</mat-icon>
            </button>
          </footer>
        </section>

        <!-- 右侧：服务状态 + 快捷执行 -->
        <div class="side-col">
          <section class="m3-card">
            <header class="section-head compact">
              <div class="section-title-wrap">
                <span class="section-icon" aria-hidden="true"><mat-icon>dns</mat-icon></span>
                <h2 class="section-title">核心服务状态</h2>
              </div>
              <span class="m3-badge success">全部守护中</span>
            </header>

            <ag-state-banner
              *ngIf="appsError()"
              state="error"
              title="无法加载软件状态"
              [description]="appsError()!"
              actionLabel="重试"
              (action)="loadQuickApps()"
            ></ag-state-banner>

            <div *ngIf="!appsError()" class="service-grid">
              <button
                *ngFor="let app of quickApps().slice(0, 4)"
                type="button"
                class="service-item"
                (click)="router.navigateByUrl('/appstore')"
              >
                <span class="service-icon" aria-hidden="true"><mat-icon>apps</mat-icon></span>
                <span class="service-meta">
                  <span class="service-name">{{ app.name }}</span>
                  <span class="service-ver font-mono">{{ app.current_version || app.versions[0] || '—' }}</span>
                </span>
                <span class="m3-badge" [ngClass]="serviceBadgeClass(app)">
                  {{ serviceBadgeLabel(app) }}
                </span>
              </button>
              <div *ngIf="quickApps().length === 0" class="m3-empty-state">暂无服务数据</div>
            </div>
          </section>

          <section class="m3-card">
            <header class="section-head compact">
              <div class="section-title-wrap">
                <span class="section-icon" aria-hidden="true"><mat-icon>bolt</mat-icon></span>
                <h2 class="section-title">运维快捷执行</h2>
              </div>
              <span class="mono-hint font-mono">Sudo Privileges</span>
            </header>

            <div class="quick-grid">
              <button type="button" class="quick-tile" (click)="refreshAll()">
                <mat-icon aria-hidden="true">autorenew</mat-icon>
                <span class="quick-label">刷新遥测</span>
                <span class="quick-sub font-mono">telemetry</span>
              </button>
              <button type="button" class="quick-tile" (click)="router.navigateByUrl('/terminal')">
                <mat-icon aria-hidden="true">terminal</mat-icon>
                <span class="quick-label">Web 终端</span>
                <span class="quick-sub font-mono">ssh pty</span>
              </button>
              <button type="button" class="quick-tile danger" (click)="router.navigateByUrl('/logs')">
                <mat-icon aria-hidden="true">receipt_long</mat-icon>
                <span class="quick-label">审计日志</span>
                <span class="quick-sub font-mono">audit</span>
              </button>
            </div>

            <div class="cron-strip">
              <mat-icon aria-hidden="true">schedule</mat-icon>
              <div class="cron-text">
                <span class="cron-title">计划任务 (Crontab)</span>
                <span class="cron-sub font-mono">面板版本 {{ system.info()?.panel_version || 'v0.2.1' }} · 内核 {{ system.info()?.kernel || '—' }}</span>
              </div>
              <button type="button" class="link-btn" (click)="router.navigateByUrl('/crontab')">管理</button>
            </div>
          </section>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      /* ---------- 主机概览 ---------- */
      .hub-card {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 20px;
        padding: 24px;
        background: var(--ag-surface-lowest);
        border: 1px solid var(--ag-outline-strong);
        border-radius: var(--ag-radius-lg);
        box-shadow: var(--ag-shadow-1);
      }
      .hub-left {
        display: flex;
        align-items: center;
        gap: 20px;
        min-width: 0;
        flex: 1;
      }
      .hub-icon {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 64px;
        height: 64px;
        flex-shrink: 0;
        border-radius: var(--ag-radius-md);
        background: var(--ag-primary-container);
        color: var(--ag-on-primary-container);
      }
      .hub-icon mat-icon {
        font-size: 34px;
        width: 34px;
        height: 34px;
      }
      .hub-pulse {
        position: absolute;
        right: -3px;
        bottom: -3px;
        width: 16px;
        height: 16px;
      }
      .pulse-ring {
        position: absolute;
        inset: 0;
        border-radius: 50%;
        background: rgba(52, 168, 83, 0.45);
        animation: hubPing 1.8s cubic-bezier(0, 0, 0.2, 1) infinite;
      }
      .pulse-dot {
        position: absolute;
        inset: 3px;
        border-radius: 50%;
        background: #34a853;
        border: 2px solid var(--ag-surface-lowest);
      }
      @keyframes hubPing {
        75%,
        100% {
          transform: scale(1.9);
          opacity: 0;
        }
      }
      .hub-main {
        min-width: 0;
      }
      .hub-title-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
      }
      .hub-title {
        margin: 0;
        font-family: var(--ag-font-display);
        font-size: 1.5rem;
        line-height: 2rem;
        font-weight: 600;
        letter-spacing: -0.3px;
        color: var(--ag-on-surface);
      }
      .arch-chip {
        padding: 2px 8px;
        border-radius: var(--ag-radius-pill);
        background: var(--ag-surface-low);
        color: var(--ag-on-surface-variant);
        font-size: 0.6875rem;
        font-weight: 500;
      }
      .hub-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 18px;
        margin-top: 8px;
        font-size: 0.75rem;
        color: var(--ag-on-surface-variant);
      }
      .meta-item {
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }
      .meta-item mat-icon {
        font-size: 15px;
        width: 15px;
        height: 15px;
        opacity: 0.75;
      }
      .hub-right {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      .hub-stat {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 8px 14px;
        border-radius: var(--ag-radius-sm);
        background: var(--ag-surface-low);
        min-width: 132px;
      }
      .stat-label {
        font-size: 0.6875rem;
        color: var(--ag-on-surface-variant);
      }
      .stat-value {
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--ag-on-surface);
      }
      .refresh-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 36px;
        padding: 0 14px;
        border: 1px solid var(--ag-outline-strong);
        border-radius: var(--ag-radius-sm);
        background: var(--ag-surface-lowest);
        color: var(--ag-primary);
        font-family: inherit;
        font-size: 0.8125rem;
        font-weight: 500;
        cursor: pointer;
      }
      .refresh-btn:hover {
        background: var(--ag-surface-low);
      }
      .refresh-btn:disabled {
        color: var(--ag-on-surface-variant);
        cursor: progress;
      }
      .refresh-btn mat-icon {
        font-size: 17px;
        width: 17px;
        height: 17px;
      }
      .hub-alerts {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        width: 100%;
        padding: 10px 14px;
        border-radius: var(--ag-radius-sm);
        background: var(--ag-warning-container);
        color: var(--ag-on-warning-container);
        font-size: 0.8125rem;
      }
      .alerts-left {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .alerts-btn {
        height: 30px;
        padding: 0 12px;
        border: 1px solid currentColor;
        border-radius: var(--ag-radius-sm);
        background: transparent;
        color: inherit;
        font-family: inherit;
        font-size: 0.75rem;
        font-weight: 500;
        cursor: pointer;
      }

      /* ---------- 指标卡 ---------- */
      .metric-card {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 16px !important;
      }
      .metric-head {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .metric-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        color: var(--ag-primary);
      }
      .metric-title {
        flex: 1;
        font-size: 0.75rem;
        font-weight: 500;
        color: var(--ag-on-surface-variant);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .metric-chip {
        padding: 1px 6px;
        border-radius: var(--ag-radius-xs);
        background: var(--ag-surface-low);
        color: var(--ag-on-surface-variant);
        font-size: 0.625rem;
        white-space: nowrap;
      }
      .metric-value {
        font-size: 2rem;
        line-height: 2.4rem;
        font-weight: 600;
        color: var(--ag-on-surface);
        letter-spacing: -0.5px;
      }
      .metric-value .unit {
        font-size: 0.9375rem;
        font-weight: 500;
        margin-left: 2px;
        color: var(--ag-on-surface-variant);
      }
      .metric-sub {
        font-size: 0.6875rem;
        color: var(--ag-on-surface-variant);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .bar {
        height: 6px;
        border-radius: 999px;
        background: var(--ag-surface);
        overflow: hidden;
        margin-top: 2px;
      }
      .bar-fill {
        height: 100%;
        border-radius: 999px;
        background: var(--ag-primary);
        transition: width 320ms ease;
      }
      .bar-fill.warn {
        background: var(--ag-warning);
      }
      .bar-fill.danger {
        background: var(--ag-danger);
      }
      .metric-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-top: 2px;
        font-size: 0.6875rem;
        color: var(--ag-on-surface-variant);
      }
      .spark {
        width: 120px;
        height: 28px;
        flex-shrink: 0;
      }
      .spark-wide {
        width: 100%;
        height: 30px;
      }
      .net-values {
        display: flex;
        align-items: center;
        gap: 18px;
        margin: 2px 0 0;
      }
      .net-item {
        display: flex;
        flex-direction: column;
        gap: 1px;
      }
      .net-label {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        font-size: 0.6875rem;
        color: var(--ag-on-surface-variant);
      }
      .net-label mat-icon {
        font-size: 13px;
        width: 13px;
        height: 13px;
      }
      .net-value {
        font-size: 1.125rem;
        font-weight: 600;
        color: var(--ag-on-surface);
      }

      /* ---------- 区块通用 ---------- */
      .section-head {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
      }
      .section-head.compact {
        margin-bottom: 10px;
      }
      .section-title-wrap {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      .section-icon {
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
      .section-icon mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
      .section-title {
        margin: 0;
        font-family: var(--ag-font-display);
        font-size: 0.9375rem;
        line-height: 1.4;
        font-weight: 600;
        color: var(--ag-on-surface);
      }
      .section-sub {
        margin: 2px 0 0;
        font-size: 0.6875rem;
        color: var(--ag-on-surface-variant);
      }
      .mono-hint {
        font-size: 0.6875rem;
        color: var(--ag-on-surface-variant);
      }

      /* ---------- 硬件遥测 ---------- */
      .telemetry-card {
        padding: 20px !important;
      }
      .hw-grid {
        display: grid;
        grid-template-columns: repeat(5, minmax(0, 1fr));
        gap: 12px;
      }
      .hw-tile {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 12px 14px;
        border-radius: var(--ag-radius-md);
        background: var(--ag-surface-low);
        border: 1px solid transparent;
      }
      .hw-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
      }
      .hw-label {
        font-size: 0.6875rem;
        font-weight: 500;
        color: var(--ag-on-surface-variant);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .hw-icon {
        font-size: 17px;
        width: 17px;
        height: 17px;
        flex-shrink: 0;
      }
      .hw-value {
        font-size: 1.375rem;
        line-height: 1.8rem;
        font-weight: 600;
        color: var(--ag-on-surface);
        letter-spacing: -0.3px;
      }
      .hw-value .unit {
        font-size: 0.75rem;
        font-weight: 500;
        margin-left: 2px;
        color: var(--ag-on-surface-variant);
      }
      .hw-value-text {
        font-size: 0.9375rem;
        line-height: 1.8rem;
        font-weight: 600;
      }
      .hw-desc {
        font-size: 0.6875rem;
        color: var(--ag-on-surface-variant);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .hw-bar {
        height: 4px;
        margin-top: 4px;
        border-radius: 999px;
        background: var(--ag-surface-high);
        overflow: hidden;
      }
      .hw-bar-fill {
        height: 100%;
        border-radius: 999px;
        transition: width 320ms ease;
      }
      .hw-foot {
        margin-top: auto;
        padding-top: 6px;
        font-size: 0.625rem;
        color: var(--ag-on-surface-variant);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      @media (max-width: 1400px) {
        .hw-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }
      @media (max-width: 860px) {
        .hw-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      @media (max-width: 560px) {
        .hw-grid {
          grid-template-columns: 1fr;
        }
      }

      /* ---------- 底部双栏 ---------- */
      .bottom-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.65fr) minmax(0, 1fr);
        gap: 16px;
        align-items: start;
      }
      @media (max-width: 1180px) {
        .bottom-grid {
          grid-template-columns: 1fr;
        }
      }
      .side-col {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .proc-card {
        display: flex;
        flex-direction: column;
        padding: 20px !important;
      }
      .proc-tools {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .tool-btn {
        height: 28px;
        padding: 0 10px;
        border: 1px solid var(--ag-outline-strong);
        border-radius: var(--ag-radius-pill);
        background: var(--ag-surface-lowest);
        color: var(--ag-on-surface-variant);
        font-family: inherit;
        font-size: 0.6875rem;
        font-weight: 500;
        cursor: pointer;
      }
      .tool-btn:hover {
        background: var(--ag-surface-low);
      }
      .tool-btn.on {
        background: var(--ag-primary-container);
        border-color: transparent;
        color: var(--ag-on-primary-container);
      }
      .proc-search {
        display: flex;
        align-items: center;
        gap: 8px;
        height: 34px;
        padding: 0 12px;
        margin-bottom: 10px;
        border-radius: var(--ag-radius-sm);
        background: var(--ag-surface-low);
        color: var(--ag-on-surface-variant);
      }
      .proc-search mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
      .proc-search input {
        flex: 1;
        min-width: 0;
        border: none;
        background: transparent;
        color: var(--ag-on-surface);
        font-family: inherit;
        font-size: 0.75rem;
        outline: none;
      }
      .proc-table-wrap {
        max-height: 340px;
      }
      .proc-name {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .proc-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--ag-success);
        flex-shrink: 0;
      }
      .proc-user {
        color: var(--ag-on-surface-variant);
      }
      .num {
        text-align: right;
      }
      .hot {
        color: var(--ag-danger);
        font-weight: 600;
      }
      .row-actions {
        display: flex;
        gap: 4px;
      }
      .row-btn {
        height: 26px;
        padding: 0 8px;
        border: 1px solid var(--ag-outline-strong);
        border-radius: var(--ag-radius-xs);
        background: var(--ag-surface-lowest);
        color: var(--ag-on-surface-variant);
        font-family: inherit;
        font-size: 0.6875rem;
        cursor: pointer;
      }
      .row-btn:hover:not(:disabled) {
        border-color: var(--ag-primary);
        color: var(--ag-primary);
      }
      .row-btn.danger:hover:not(:disabled) {
        border-color: var(--ag-danger);
        color: var(--ag-danger);
      }
      .row-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .proc-foot {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-top: 12px;
        font-size: 0.6875rem;
        color: var(--ag-on-surface-variant);
      }
      .link-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 0;
        border: none;
        background: transparent;
        color: var(--ag-primary);
        font-family: inherit;
        font-size: 0.75rem;
        font-weight: 500;
        cursor: pointer;
      }
      .link-btn mat-icon {
        font-size: 15px;
        width: 15px;
        height: 15px;
      }

      /* ---------- 服务 ---------- */
      .service-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
      }
      .service-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px;
        border: 1px solid var(--ag-outline-variant);
        border-radius: var(--ag-radius-md);
        background: var(--ag-surface-lowest);
        cursor: pointer;
        text-align: left;
        font-family: inherit;
      }
      .service-item:hover {
        border-color: var(--ag-primary);
        box-shadow: var(--ag-shadow-1);
      }
      .service-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        flex-shrink: 0;
        border-radius: var(--ag-radius-sm);
        background: var(--ag-surface-low);
        color: var(--ag-primary);
      }
      .service-icon mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
      .service-meta {
        display: flex;
        flex-direction: column;
        gap: 1px;
        flex: 1;
        min-width: 0;
      }
      .service-name {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--ag-on-surface);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .service-ver {
        font-size: 0.625rem;
        color: var(--ag-on-surface-variant);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .service-item .m3-badge {
        flex-shrink: 0;
      }

      /* ---------- 快捷执行 ---------- */
      .quick-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
      }
      .quick-tile {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 12px 6px;
        border: 1px solid transparent;
        border-radius: var(--ag-radius-md);
        background: var(--ag-primary-container);
        color: var(--ag-on-primary-container);
        cursor: pointer;
        font-family: inherit;
      }
      .quick-tile:hover {
        box-shadow: var(--ag-shadow-1);
      }
      .quick-tile mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
      .quick-tile.danger {
        background: var(--ag-danger-container);
        color: var(--ag-danger);
      }
      .quick-label {
        font-size: 0.75rem;
        font-weight: 600;
      }
      .quick-sub {
        font-size: 0.5625rem;
        opacity: 0.7;
      }
      .cron-strip {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: 10px;
        padding: 10px 12px;
        border-radius: var(--ag-radius-md);
        background: var(--ag-surface-low);
      }
      .cron-strip mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        color: var(--ag-primary);
      }
      .cron-text {
        display: flex;
        flex-direction: column;
        gap: 1px;
        flex: 1;
        min-width: 0;
      }
      .cron-title {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--ag-on-surface);
      }
      .cron-sub {
        font-size: 0.625rem;
        color: var(--ag-on-surface-variant);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
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
  readonly refreshing = signal<boolean>(false)
  readonly quickApps = signal<AppMarketItem[]>([])
  readonly appsError = signal<string | null>(null)

  procSearch = ''
  private procInterval: ReturnType<typeof setInterval> | null = null

  readonly boardFamily = computed(() => {
    const info = this.system.info()
    const model = info?.arm_board_model || this.thermal().board_model || ''
    if (model) return model
    return info?.is_arm === false ? 'x86_64' : 'ARMv8-A'
  })

  readonly memoryTypeLabel = computed(() => {
    const total = this.rt().memory.total
    if (!total) return 'RAM'
    return 'LPDDR'
  })

  readonly archChipLabel = computed(() => {
    const arch = this.system.info()?.arch || 'aarch64'
    const board = this.boardFamily()
    return board && board.toLowerCase() !== arch.toLowerCase() ? `${board} / ${arch}` : arch
  })

  readonly healthAlerts = computed(() => {
    const alerts: string[] = []
    if (this.system.isStale()) {
      alerts.push(`遥测数据已过期（${this.system.lastError() || '检查面板网络'}）`)
    }
    const cpu = this.rt().cpu.percent
    if (cpu !== null && cpu >= 85) alerts.push(`CPU 负载偏高 ${cpu.toFixed(0)}%`)
    const mem = this.rt().memory.percent
    if (mem !== null && mem >= 85) alerts.push(`内存占用偏高 ${mem.toFixed(0)}%`)
    const disk = this.rt().disk.percent
    if (disk !== null && disk >= 85) alerts.push(`磁盘空间不足 ${disk.toFixed(0)}%`)
    const th = this.thermal()
    if (th.throttled || th.under_voltage || (th.temp_c !== null && th.temp_c >= 75)) {
      alerts.push('检测到 ARM 芯片高温或降频告警')
    }
    return alerts
  })

  readonly overallHealth = computed(() => {
    if (this.system.connectionState() === 'offline') {
      return { badgeClass: 'danger', label: '遥测离线' }
    }
    const alerts = this.healthAlerts()
    if (alerts.length > 0) return { badgeClass: 'warning', label: `${alerts.length} 项待关注` }
    return { badgeClass: 'success', label: '运行正常 (Normal)' }
  })

  readonly thermalBadge = computed(() => {
    const th = this.thermal()
    if (this.system.isStale()) return { cls: 'warning', text: '数据已过期' }
    if (th.throttled || th.under_voltage) return { cls: 'danger', text: '过热 / 欠压告警' }
    if (th.temp_c === null) return { cls: 'neutral', text: '无温度传感器' }
    return { cls: 'success', text: 'PMIC 供电正常' }
  })

  readonly tempColor = computed(() => {
    const t = this.thermal().temp_c
    if (t === null) return 'var(--ag-on-surface-variant)'
    if (t >= 75) return 'var(--ag-danger)'
    if (t >= 60) return 'var(--ag-warning)'
    return 'var(--ag-success)'
  })

  readonly tempPercent = computed(() => {
    const t = this.thermal().temp_c
    if (t === null) return 0
    return Math.min(100, Math.max(0, (t / 100) * 100))
  })

  readonly tempStatusText = computed(() => {
    const t = this.thermal().temp_c
    if (t === null) return '硬件不支持或无传感器'
    if (t >= 75) return '温度偏高，已接近降频阈值 80°C'
    if (t >= 60) return '温度略高，散热正常'
    return '健康散热 (警戒值 80°C)'
  })

  readonly cpuSpark = computed(() => this.buildSpark(this.system.telemetryHistory().map((p) => p.cpu), 120, 28))
  readonly netSpark = computed(() =>
    this.buildSpark(this.system.telemetryHistory().map((p) => p.rxKb), 240, 28)
  )

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
        this.quickApps.set(res.data.data.list.slice(0, 4))
      }
    } catch (e: any) {
      this.appsError.set(e?.message || '读取软件商店列表失败')
    }
  }

  changeProcessSort(sort: 'cpu' | 'mem') {
    this.procSort.set(sort)
    this.system.fetchProcesses(sort, 15, false)
  }

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

  serviceBadgeClass(app: AppMarketItem): string {
    if (app.service_status === 'running') return 'success'
    if (app.status === 'installed') return 'warning'
    return 'neutral'
  }

  serviceBadgeLabel(app: AppMarketItem): string {
    if (app.service_status === 'running') return 'Active'
    if (app.status === 'installed') return '已安装'
    return '未安装'
  }

  toneClass(value: number | null | undefined): string {
    if (value === null || value === undefined) return ''
    if (value >= 90) return 'danger'
    if (value >= 80) return 'warn'
    return ''
  }

  async handleKillProcess(pid: number, name: string, force = false) {
    const res = await this.confirm.ask({
      title: force ? '强制终止进程 (SIGKILL)' : '温和停止进程 (SIGTERM)',
      resourceName: `${name} (PID: ${pid})`,
      message: force
        ? `确定要向进程 ${name} (PID: ${pid}) 发送 SIGKILL (-9) 强制终止信号吗？`
        : `确定要向进程 ${name} (PID: ${pid}) 发送 SIGTERM (-15) 温和退出信号吗？`,
      impact: force
        ? 'SIGKILL 由内核直接销毁进程，进程无法执行清理逻辑，未落盘的缓存或事务数据可能丢失。'
        : 'SIGTERM 允许目标进程捕获信号、保存状态并关闭连接后优雅退出；若无响应再使用强杀。',
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

  /** 生成迷你折线路径（无数据时给一条平线，避免卡片高度跳动） */
  private buildSpark(values: (number | null)[], width: number, height: number): string {
    const pts = values.slice(-40).filter((v): v is number => v !== null && !isNaN(v))
    if (pts.length < 2) return `M0 ${height - 4} L${width} ${height - 4}`
    const max = Math.max(...pts, 1)
    const stepX = width / (pts.length - 1)
    return pts
      .map((v, i) => {
        const x = (i * stepX).toFixed(1)
        const y = (height - 3 - (v / max) * (height - 6)).toFixed(1)
        return `${i === 0 ? 'M' : 'L'}${x} ${y}`
      })
      .join(' ')
  }

  formatBytes(bytes: number | null | undefined): string {
    if (bytes === null || bytes === undefined || isNaN(bytes)) return '—'
    if (bytes === 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
    return `${(bytes / Math.pow(1024, i)).toFixed(i >= 2 ? 1 : 0)} ${units[i]}`
  }

  formatRate(bytesPerSec: number | null | undefined): string {
    if (bytesPerSec === null || bytesPerSec === undefined || isNaN(bytesPerSec)) return '—'
    if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / 1024 / 1024).toFixed(2)} MB/s`
    return `${(bytesPerSec / 1024).toFixed(1)} KB/s`
  }

  formatLoadAvg(loads: [number | null, number | null, number | null] | undefined): string {
    if (!loads || loads[0] === null) return '—'
    return loads.map((v) => (v === null ? '-' : v.toFixed(2))).join(' · ')
  }

  formatUptime(seconds: number): string {
    if (!seconds) return '—'
    const d = Math.floor(seconds / 86400)
    const h = Math.floor((seconds % 86400) / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (d > 0) return `${d}天 ${h}小时 ${m}分`
    if (h > 0) return `${h}小时 ${m}分`
    return `${m}分钟`
  }
}
