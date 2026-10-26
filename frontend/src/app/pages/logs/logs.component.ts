import { Component, OnInit, computed, inject, signal } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { AgMaterialModule } from '../../core/material.module'
import { ToastService } from '../../core/toast.service'
import { AgStateBannerComponent } from '../../components/ag-state-banner.component'
import { AgModalComponent } from '../../components/ag-modal.component'
import { logsApi, OperationLog } from '@/api/logs'
import { siteApi, SiteItem } from '@/api/site'
import { aiApi, LogDiagnosisResult, AIConfig } from '@/api/ai'
import { sanitizeSensitiveLogContent, copyToClipboard } from '@/utils/clipboard'

@Component({
  selector: 'ag-logs',
  standalone: true,
  imports: [AgMaterialModule, AgStateBannerComponent, AgModalComponent],
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
          <button mat-stroked-button (click)="openAiDiagnosisDialog()" [disabled]="diagnosing()">
            <mat-icon>psychology</mat-icon>
            <span>{{ diagnosing() ? 'AI 诊断中...' : 'AI 根因排障' }}</span>
          </button>
          <button mat-flat-button color="primary" (click)="reloadActive()" [disabled]="loading()">
            <mat-icon>refresh</mat-icon>
            <span>刷新日志</span>
          </button>
        </div>
      </div>

      <!-- AI Diagnosis Result Card -->
      <div *ngIf="diagnosis()" class="m3-card font-mono" style="border-left: 4px solid var(--ag-primary)">
        <div style="display: flex; justify-content: space-between; align-items: center">
          <div style="display: flex; align-items: center; gap: 8px">
            <mat-icon style="color: var(--ag-primary)">psychology</mat-icon>
            <strong>AI 日志排障报告 ({{ diagnosis()!.affected_component }})</strong>
          </div>
          <div style="display: flex; align-items: center; gap: 8px">
            <span class="m3-badge" [ngClass]="diagnosis()!.severity === 'critical' ? 'danger' : 'warning'">
              {{ diagnosis()!.severity }}
            </span>
            <button mat-icon-button (click)="diagnosis.set(null)" aria-label="关闭排障报告">
              <mat-icon>close</mat-icon>
            </button>
          </div>
        </div>
        <p style="margin: 8px 0; font-size: 0.82rem; line-height: 1.5">{{ diagnosis()!.root_cause }}</p>
        <div style="font-size: 0.76rem; color: var(--ag-primary); background: var(--ag-surface-low); padding: 8px 12px; border-radius: 8px">
          💡 处置建议: {{ diagnosis()!.recommendation }}
        </div>
      </div>

      <!-- State Banners (FE-001) -->
      <ag-state-banner
        *ngIf="loading() && isFirstLoad()"
        state="loading"
        title="正在读取日志流..."
      />

      <ag-state-banner
        *ngIf="loadError()"
        state="error"
        title="日志加载失败"
        [description]="loadError()!"
        primaryActionLabel="重试刷新"
        (primaryAction)="reloadActive()"
      />

      <mat-tab-group
        [selectedIndex]="activeTabIdx()"
        (selectedIndexChange)="onTabChange($event)"
        animationDuration="160ms"
      >
        <!-- Tab 0: Operation Logs (FE-011) -->
        <mat-tab label="面板操作审计">
          <div class="m3-card" style="margin-top: 14px">
            <div class="m3-filter-bar font-mono" style="padding: 0 0 12px 0; border: none; background: transparent">
              <div class="search-box">
                <mat-icon>search</mat-icon>
                <input
                  type="search"
                  [ngModel]="opFilter()"
                  (ngModelChange)="onOpFilterChange($event)"
                  placeholder="按管理员用户名、动作或目标关键词筛选..."
                  aria-label="筛选操作审计日志"
                />
              </div>
              <button mat-flat-button color="primary" (click)="loadOperationLogs(1)">检索</button>
            </div>

            <div class="m3-table-wrap font-mono">
              <table class="m3-data-table" aria-label="面板操作审计记录">
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
                  <tr *ngIf="opLogs().length === 0 && !loading()">
                    <td colspan="6" class="m3-empty-state">未检索到匹配的操作审计日志。</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; margin-top: 12px; gap: 8px" class="font-mono">
              <span style="font-size: 0.76rem; color: var(--ag-on-surface-variant)">
                共 {{ opTotal() }} 条记录 · 第 {{ opPage() }} 页 / 共 {{ maxOpPage() }} 页
              </span>
              <div style="display: flex; gap: 8px">
                <button mat-stroked-button [disabled]="opPage() <= 1" (click)="loadOperationLogs(opPage() - 1)">上一页</button>
                <button mat-stroked-button [disabled]="opPage() >= maxOpPage()" (click)="loadOperationLogs(opPage() + 1)">下一页</button>
              </div>
            </div>
          </div>
        </mat-tab>

        <!-- Tab 1: Systemd Journalctl Logs -->
        <mat-tab label="系统服务日志 (journalctl)">
          <div class="m3-card font-mono" style="margin-top: 14px; display: flex; flex-direction: column; gap: 12px">
            <div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center">
              <div class="m3-field" style="min-width: 220px">
                <label for="system-unit-select">服务单元 (Systemd Unit)</label>
                <select id="system-unit-select" [(ngModel)]="systemService" (change)="loadSystemLogs()">
                  <option value="all">全部核心日志 (system)</option>
                  <option value="nginx">Nginx (nginx.service)</option>
                  <option value="sshd">OpenSSH (ssh / sshd)</option>
                  <option value="docker">Docker (docker.service)</option>
                  <option value="mysql">MySQL / MariaDB</option>
                  <option value="redis">Redis Server</option>
                </select>
              </div>
              <div class="m3-field" style="width: 140px">
                <label for="system-lines-select">读取行数</label>
                <select id="system-lines-select" [(ngModel)]="systemLines" (change)="loadSystemLogs()">
                  <option [ngValue]="100">100 行</option>
                  <option [ngValue]="200">200 行</option>
                  <option [ngValue]="500">500 行</option>
                </select>
              </div>
              <div style="margin-left: auto; display: flex; gap: 8px">
                <button mat-stroked-button (click)="copyLogs(systemLogs().join('\n'))">
                  <mat-icon>content_copy</mat-icon>
                  <span>复制日志</span>
                </button>
              </div>
            </div>

            <pre class="m3-code-console" role="region" aria-label="Systemd 日志输出" style="max-height: 480px; overflow: auto">{{ systemLogs().join('\n') || '暂无系统服务日志输出' }}</pre>
          </div>
        </mat-tab>

        <!-- Tab 2: Site Logs -->
        <mat-tab label="Nginx 站点日志">
          <div class="m3-card font-mono" style="margin-top: 14px; display: flex; flex-direction: column; gap: 12px">
            <div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center">
              <div class="m3-field" style="min-width: 240px">
                <label for="site-select">选择网站</label>
                <select id="site-select" [(ngModel)]="selectedSiteId" (change)="loadSiteLogs()">
                  <option *ngFor="let s of sites()" [ngValue]="s.id">{{ s.domain }}</option>
                </select>
              </div>
              <div class="m3-field" style="width: 160px">
                <label for="site-log-type-select">日志类型</label>
                <select id="site-log-type-select" [(ngModel)]="siteLogType" (change)="loadSiteLogs()">
                  <option value="access">Access 访问日志</option>
                  <option value="error">Error 错误日志</option>
                </select>
              </div>
              <div style="margin-left: auto; display: flex; gap: 8px">
                <button mat-stroked-button (click)="copyLogs(siteLogs().join('\n'))">
                  <mat-icon>content_copy</mat-icon>
                  <span>复制日志</span>
                </button>
              </div>
            </div>

            <pre class="m3-code-console" role="region" aria-label="Nginx 站点日志输出" style="max-height: 480px; overflow: auto">{{ siteLogs().join('\n') || '暂无站点日志输出' }}</pre>
          </div>
        </mat-tab>
      </mat-tab-group>

      <!-- AI Diagnosis Preparation & Privacy Dialog (FE-018) -->
      <ag-modal
        [open]="diagModalOpen()"
        title="AI 根因排障诊断预检"
        icon="psychology"
        size="lg"
        [submitting]="diagnosing()"
        (closed)="diagModalOpen.set(false)"
      >
        <div class="font-mono" style="display: flex; flex-direction: column; gap: 12px">
          <div class="m3-tonal-card" style="display: flex; flex-direction: column; gap: 6px">
            <div style="display: flex; justify-content: space-between; align-items: center">
              <strong>当前 AI 引擎模式:</strong>
              <span class="m3-badge" [ngClass]="aiConfig()?.enabled && aiConfig()?.api_key ? 'primary' : 'neutral'">
                {{ aiConfig()?.enabled && aiConfig()?.api_key ? '在线大模型 API' : '本地离线内置规则引擎' }}
              </span>
            </div>
            <div style="font-size: 0.74rem; color: var(--ag-on-surface-variant)">
              <ng-container *ngIf="aiConfig()?.enabled && aiConfig()?.api_key; else offlineNotice">
                目标接口: {{ aiConfig()?.api_url }} · 模型: {{ aiConfig()?.model }}
              </ng-container>
              <ng-template #offlineNotice>
                未配置或未启用外部大模型 API，系统将通过本地启发式规则分析日志，分析全程不出本机，100% 离线运行。
              </ng-template>
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; align-items: center; padding: 4px 0">
            <div>
              <strong>脱敏隐私过滤 (推荐开启)</strong>
              <div style="font-size: 0.72rem; color: var(--ag-on-surface-variant)">
                自动模糊日志中出现的 Token (ag_live_...)、API Key (sk-...)、Bearer 凭证与密码
              </div>
            </div>
            <mat-slide-toggle [(ngModel)]="sanitizeBeforeDiag" (change)="refreshPreparedLogs()"></mat-slide-toggle>
          </div>

          <div class="m3-field">
            <label for="diag-logs-preview">待分析日志预览 (可在此直接编辑或精简):</label>
            <textarea
              id="diag-logs-preview"
              rows="12"
              [(ngModel)]="preparedLogs"
              style="line-height: 1.45; font-size: 0.76rem"
            ></textarea>
          </div>
        </div>

        <div modal-footer>
          <button mat-stroked-button (click)="diagModalOpen.set(false)" [disabled]="diagnosing()">取消</button>
          <button
            mat-flat-button
            color="primary"
            [disabled]="diagnosing() || !preparedLogs.trim()"
            (click)="submitAiDiagnosis()"
          >
            {{ diagnosing() ? '正在分析排障...' : '开始 AI 诊断' }}
          </button>
        </div>
      </ag-modal>
    </div>
  `,
})
export class LogsComponent implements OnInit {
  private toast = inject(ToastService)
  private route = inject(ActivatedRoute)
  private router = inject(Router)

  readonly activeTabIdx = signal(0)
  readonly isFirstLoad = signal(true)
  readonly loading = signal(false)
  readonly loadError = signal<string | null>(null)

  readonly opLogs = signal<OperationLog[]>([])
  readonly opTotal = signal(0)
  readonly opPage = signal(1)
  readonly opFilter = signal('')

  readonly systemLogs = signal<string[]>([])
  readonly siteLogs = signal<string[]>([])
  readonly sites = signal<SiteItem[]>([])

  readonly diagnosing = signal(false)
  readonly diagnosis = signal<LogDiagnosisResult | null>(null)
  readonly diagModalOpen = signal(false)
  readonly aiConfig = signal<AIConfig | null>(null)

  sanitizeBeforeDiag = true
  preparedLogs = ''
  rawPreparedLogs = ''

  opPageSize = 20
  systemService = 'all'
  systemLines = 200
  selectedSiteId: number | null = null
  siteLogType: 'access' | 'error' = 'access'

  readonly maxOpPage = computed(() => {
    const total = this.opTotal()
    return total > 0 ? Math.ceil(total / this.opPageSize) : 1
  })

  ngOnInit() {
    const qp = this.route.snapshot.queryParamMap
    const tab = qp.get('tab')
    if (tab !== null) {
      const idx = parseInt(tab, 10)
      if (!isNaN(idx) && idx >= 0 && idx <= 2) this.activeTabIdx.set(idx)
    }
    if (qp.get('q')) this.opFilter.set(qp.get('q')!)

    this.loadOperationLogs(1)
    this.loadSitesList()
    this.fetchAiConfig()
  }

  onTabChange(idx: number) {
    this.activeTabIdx.set(idx)
    this.syncUrlParams()
    this.reloadActive()
  }

  onOpFilterChange(q: string) {
    this.opFilter.set(q)
  }

  private syncUrlParams() {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        tab: this.activeTabIdx() !== 0 ? this.activeTabIdx() : null,
        q: this.opFilter().trim() || null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    })
  }

  reloadActive() {
    const idx = this.activeTabIdx()
    if (idx === 0) this.loadOperationLogs(this.opPage())
    else if (idx === 1) this.loadSystemLogs()
    else this.loadSiteLogs()
  }

  async fetchAiConfig() {
    try {
      const res = await aiApi.getConfig()
      if (res.data?.data) this.aiConfig.set(res.data.data)
    } catch {}
  }

  async loadOperationLogs(page: number) {
    this.loading.set(true)
    this.loadError.set(null)
    this.opPage.set(page)
    try {
      const res = await logsApi.getOperationLogs(page, this.opPageSize, this.opFilter().trim())
      const d = res.data?.data
      if (d) {
        this.opLogs.set(d.list || [])
        this.opTotal.set(d.total ?? 0)
        this.syncUrlParams()
      }
    } catch (e: any) {
      const msg = e.message || '加载操作日志失败'
      this.loadError.set(msg)
      this.toast.error(msg)
    } finally {
      this.loading.set(false)
      this.isFirstLoad.set(false)
    }
  }

  async loadSystemLogs() {
    this.loading.set(true)
    this.loadError.set(null)
    try {
      const res = await logsApi.getSystemLogs(this.systemService, this.systemLines)
      this.systemLogs.set(res.data?.data?.logs || [])
    } catch (e: any) {
      const msg = e.message || '加载系统服务日志失败'
      this.loadError.set(msg)
      this.toast.error(msg)
    } finally {
      this.loading.set(false)
      this.isFirstLoad.set(false)
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
    this.loading.set(true)
    this.loadError.set(null)
    try {
      const res = await logsApi.getSiteLogs(this.selectedSiteId, this.siteLogType, 200)
      this.siteLogs.set(res.data?.data?.logs || [])
    } catch (e: any) {
      const msg = e.message || '加载站点日志失败'
      this.loadError.set(msg)
      this.toast.error(msg)
    } finally {
      this.loading.set(false)
      this.isFirstLoad.set(false)
    }
  }

  async copyLogs(text: string) {
    if (!text.trim()) {
      this.toast.warning('日志内容为空')
      return
    }
    const ok = await copyToClipboard(text)
    if (ok) this.toast.success('日志已复制到剪贴板')
    else this.toast.error('复制失败')
  }

  openAiDiagnosisDialog() {
    const idx = this.activeTabIdx()
    let raw = ''
    if (idx === 1) {
      raw = this.systemLogs().slice(-60).join('\n')
    } else if (idx === 2) {
      raw = this.siteLogs().slice(-60).join('\n')
    } else {
      raw = this.opLogs()
        .slice(0, 30)
        .map((l) => `[${l.created_at}] admin=${l.username} action=${l.action} target=${l.target} status=${l.status} ip=${l.ip}`)
        .join('\n')
    }

    if (!raw.trim()) {
      this.toast.warning('当前暂无可用于诊断的日志内容')
      return
    }

    this.rawPreparedLogs = raw
    this.refreshPreparedLogs()
    this.diagModalOpen.set(true)
  }

  refreshPreparedLogs() {
    if (this.sanitizeBeforeDiag) {
      this.preparedLogs = sanitizeSensitiveLogContent(this.rawPreparedLogs)
    } else {
      this.preparedLogs = this.rawPreparedLogs
    }
  }

  async submitAiDiagnosis() {
    if (!this.preparedLogs.trim()) return
    this.diagnosing.set(true)
    try {
      const idx = this.activeTabIdx()
      const componentType = idx === 2 ? 'nginx' : 'system'
      const res = await aiApi.diagnoseLog(componentType, this.preparedLogs)
      this.diagnosis.set(res.data?.data || null)
      this.diagModalOpen.set(false)
      this.toast.success('AI 根因排障诊断完成')
    } catch (e: any) {
      this.toast.error(e.message || 'AI 诊断失败')
    } finally {
      this.diagnosing.set(false)
    }
  }
}
