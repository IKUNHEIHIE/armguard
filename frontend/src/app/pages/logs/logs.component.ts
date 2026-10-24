import { Component, OnInit, inject, signal } from '@angular/core'
import { AgMaterialModule } from '../../core/material.module'
import { ToastService } from '../../core/toast.service'
import { logsApi, OperationLog } from '@/api/logs'
import { siteApi, SiteItem } from '@/api/site'
import { aiApi, LogDiagnosisResult } from '@/api/ai'

@Component({
  selector: 'ag-logs',
  standalone: true,
  imports: [AgMaterialModule],
  template: `
    <div class="m3-page">
      <div class="m3-page-header">
        <div>
          <h2 class="m3-page-title">
            <mat-icon style="color: var(--ag-primary)">receipt_long</mat-icon>
            <span>全局审计与系统日志中心 (Audit & Journalctl)</span>
          </h2>
          <p class="m3-page-subtitle font-mono">
            面板操作审计分页检索、Systemd 守护进程 journalctl 日志流、Nginx 站点日志与 AI 故障根因诊断
          </p>
        </div>
        <div class="m3-page-actions">
          <button mat-stroked-button (click)="diagnoseCurrentLogs()" [disabled]="diagnosing()">
            <mat-icon>psychology</mat-icon>
            <span>{{ diagnosing() ? 'AI 诊断中...' : 'AI 根因诊断' }}</span>
          </button>
          <button mat-flat-button color="primary" (click)="reloadActive()">
            <mat-icon>refresh</mat-icon>
            <span>刷新日志</span>
          </button>
        </div>
      </div>

      <!-- AI Diagnosis Card -->
      <div *ngIf="diagnosis()" class="m3-card font-mono">
        <div style="display: flex; justify-content: space-between; align-items: center">
          <strong>AI 日志排障报告 ({{ diagnosis()!.affected_component }})</strong>
          <span class="m3-badge" [ngClass]="diagnosis()!.severity === 'critical' ? 'danger' : 'warning'">
            {{ diagnosis()!.severity }}
          </span>
        </div>
        <p style="margin: 8px 0; font-size: 0.82rem">{{ diagnosis()!.root_cause }}</p>
        <div style="font-size: 0.76rem; color: var(--ag-primary)">
          建议: {{ diagnosis()!.recommendation }}
        </div>
      </div>

      <mat-tab-group
        animationDuration="160ms"
        (selectedIndexChange)="onTabChange($event)"
      >
        <!-- Tab 1: Operation Logs -->
        <mat-tab label="面板操作审计">
          <div class="m3-card" style="margin-top: 14px">
            <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px" class="font-mono">
              <input
                type="text"
                [(ngModel)]="opFilter"
                placeholder="按用户名、动作或目标筛选..."
                style="flex: 1; min-width: 220px; padding: 8px 14px; border-radius: 999px; border: 1px solid var(--ag-outline); background: var(--ag-surface-lowest); color: var(--ag-on-surface)"
                (keyup.enter)="loadOperationLogs(1)"
              />
              <button mat-flat-button color="primary" (click)="loadOperationLogs(1)">检索</button>
            </div>

            <div class="m3-table-wrap font-mono">
              <table class="m3-data-table">
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>管理员</th>
                    <th>动作</th>
                    <th>操作目标</th>
                    <th>来源 IP</th>
                    <th>结果</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let log of opLogs()">
                    <td>{{ log.created_at }}</td>
                    <td><strong>{{ log.username }}</strong></td>
                    <td>{{ log.action }}</td>
                    <td><code>{{ log.target }}</code></td>
                    <td>{{ log.ip }}</td>
                    <td>
                      <span class="m3-badge" [ngClass]="log.status === 'success' ? 'success' : 'danger'">
                        {{ log.status }}
                      </span>
                    </td>
                  </tr>
                  <tr *ngIf="opLogs().length === 0">
                    <td colspan="6" class="m3-empty-state">未检索到匹配的操作审计日志。</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px" class="font-mono">
              <span style="font-size: 0.76rem; color: var(--ag-on-surface-variant)">
                共 {{ opTotal() }} 条记录 · 第 {{ opPage() }} 页
              </span>
              <div style="display: flex; gap: 8px">
                <button mat-stroked-button [disabled]="opPage() <= 1" (click)="loadOperationLogs(opPage() - 1)">上一页</button>
                <button mat-stroked-button [disabled]="opPage() * opPageSize >= opTotal()" (click)="loadOperationLogs(opPage() + 1)">下一页</button>
              </div>
            </div>
          </div>
        </mat-tab>

        <!-- Tab 2: Systemd Journalctl Logs -->
        <mat-tab label="系统服务日志 (journalctl)">
          <div class="m3-card font-mono" style="margin-top: 14px; display: flex; flex-direction: column; gap: 12px">
            <div style="display: flex; flex-wrap: wrap; gap: 12px">
              <div class="m3-field" style="min-width: 200px">
                <label>服务单元 (Systemd Unit)</label>
                <select [(ngModel)]="systemService" (change)="loadSystemLogs()">
                  <option value="all">全部核心日志 (system)</option>
                  <option value="nginx">Nginx (nginx.service)</option>
                  <option value="sshd">OpenSSH (ssh / sshd)</option>
                  <option value="docker">Docker (docker.service)</option>
                  <option value="mysql">MySQL / MariaDB</option>
                  <option value="redis">Redis Server</option>
                </select>
              </div>
              <div class="m3-field" style="width: 140px">
                <label>读取行数</label>
                <select [(ngModel)]="systemLines" (change)="loadSystemLogs()">
                  <option [ngValue]="100">100 行</option>
                  <option [ngValue]="200">200 行</option>
                  <option [ngValue]="500">500 行</option>
                </select>
              </div>
            </div>

            <pre class="m3-code-console">{{ systemLogs().join('\n') || '暂无系统服务日志输出' }}</pre>
          </div>
        </mat-tab>

        <!-- Tab 3: Site Logs -->
        <mat-tab label="Nginx 站点日志">
          <div class="m3-card font-mono" style="margin-top: 14px; display: flex; flex-direction: column; gap: 12px">
            <div style="display: flex; flex-wrap: wrap; gap: 12px">
              <div class="m3-field" style="min-width: 220px">
                <label>选择网站</label>
                <select [(ngModel)]="selectedSiteId" (change)="loadSiteLogs()">
                  <option *ngFor="let s of sites()" [ngValue]="s.id">{{ s.domain }}</option>
                </select>
              </div>
              <div class="m3-field" style="width: 160px">
                <label>日志类型</label>
                <select [(ngModel)]="siteLogType" (change)="loadSiteLogs()">
                  <option value="access">Access 访问日志</option>
                  <option value="error">Error 错误日志</option>
                </select>
              </div>
            </div>

            <pre class="m3-code-console">{{ siteLogs().join('\n') || '暂无站点日志输出' }}</pre>
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
})
export class LogsComponent implements OnInit {
  private toast = inject(ToastService)
  readonly activeTabIdx = signal(0)
  readonly opLogs = signal<OperationLog[]>([])
  readonly opTotal = signal(0)
  readonly opPage = signal(1)
  readonly systemLogs = signal<string[]>([])
  readonly siteLogs = signal<string[]>([])
  readonly sites = signal<SiteItem[]>([])
  readonly diagnosing = signal(false)
  readonly diagnosis = signal<LogDiagnosisResult | null>(null)

  opPageSize = 20
  opFilter = ''
  systemService = 'all'
  systemLines = 200
  selectedSiteId: number | null = null
  siteLogType: 'access' | 'error' = 'access'

  ngOnInit() {
    this.loadOperationLogs(1)
    this.loadSitesList()
  }

  onTabChange(idx: number) {
    this.activeTabIdx.set(idx)
    this.reloadActive()
  }

  reloadActive() {
    const idx = this.activeTabIdx()
    if (idx === 0) this.loadOperationLogs(this.opPage())
    else if (idx === 1) this.loadSystemLogs()
    else this.loadSiteLogs()
  }

  async loadOperationLogs(page: number) {
    this.opPage.set(page)
    try {
      const res = await logsApi.getOperationLogs(page, this.opPageSize, this.opFilter.trim())
      const d = res.data?.data
      if (d) {
        this.opLogs.set(d.list || [])
        this.opTotal.set(d.total ?? 0)
      }
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async loadSystemLogs() {
    try {
      const res = await logsApi.getSystemLogs(this.systemService, this.systemLines)
      this.systemLogs.set(res.data?.data?.logs || [])
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async loadSitesList() {
    try {
      const res = await siteApi.getSites(1, 100)
      const list = res.data?.data?.list || []
      this.sites.set(list)
      if (list.length > 0 && this.selectedSiteId === null) {
        this.selectedSiteId = list[0].id
      }
    } catch {}
  }

  async loadSiteLogs() {
    if (!this.selectedSiteId) return
    try {
      const res = await logsApi.getSiteLogs(this.selectedSiteId, this.siteLogType, 200)
      this.siteLogs.set(res.data?.data?.logs || [])
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async diagnoseCurrentLogs() {
    this.diagnosing.set(true)
    try {
      const idx = this.activeTabIdx()
      const content =
        idx === 1
          ? this.systemLogs().slice(-50).join('\n')
          : idx === 2
            ? this.siteLogs().slice(-50).join('\n')
            : this.opLogs()
                .slice(0, 20)
                .map((l) => `${l.created_at} ${l.username} ${l.action} ${l.target}`)
                .join('\n')
      const res = await aiApi.diagnoseLog(idx === 2 ? 'nginx' : 'system', content || 'No error lines')
      this.diagnosis.set(res.data?.data || null)
    } catch (e: any) {
      this.toast.error(e.message)
    } finally {
      this.diagnosing.set(false)
    }
  }
}
