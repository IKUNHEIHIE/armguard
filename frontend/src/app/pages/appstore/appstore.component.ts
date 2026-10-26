import { Component, OnInit, OnDestroy, computed, inject, signal } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { AgMaterialModule } from '../../core/material.module'
import { ToastService } from '../../core/toast.service'
import { ConfirmService } from '../../core/confirm.service'
import { TaskCenterService } from '../../core/task-center.service'
import { HasUnsavedChanges } from '../../core/unsaved-changes.guard'
import { AgStateBannerComponent } from '../../components/ag-state-banner.component'
import { AgModalComponent } from '../../components/ag-modal.component'
import { WarpPluginDialogComponent } from '../../components/warp-plugin-dialog.component'
import { appStoreApi, AppMarketItem, AppManagementData } from '@/api/appstore'

@Component({
  selector: 'ag-appstore',
  standalone: true,
  imports: [AgMaterialModule, AgStateBannerComponent, AgModalComponent, WarpPluginDialogComponent],
  template: `
    <div class="m3-page">
      <div class="m3-page-header">
        <div>
          <h2 class="m3-page-title">
            <mat-icon style="color: var(--ag-primary)">apps</mat-icon>
            <span>ARM 原生软件商店与守护进程编排 (App Store)</span>
          </h2>
          <p class="m3-page-subtitle font-mono">
            提供 ARM64 / ARMv7 预编译包一键安装、服务启停、配置文件在线微调与 Cloudflare WARP 网关
          </p>
        </div>
        <div class="m3-page-actions">
          <button mat-stroked-button (click)="warpOpen.set(true)">
            <mat-icon>cloud_sync</mat-icon>
            <span>Cloudflare WARP 插件</span>
          </button>
          <button mat-flat-button color="primary" (click)="loadApps()" [disabled]="loading()">
            <mat-icon>refresh</mat-icon>
            <span>刷新商店</span>
          </button>
        </div>
      </div>

      <!-- Filter & Search Bar (FE-011) -->
      <div class="m3-filter-bar font-mono">
        <div class="search-box">
          <mat-icon>search</mat-icon>
          <input
            type="search"
            [ngModel]="searchQuery()"
            (ngModelChange)="onSearchChange($event)"
            placeholder="搜索软件名称、关键词或架构支持 (如 php, nginx, redis)..."
            aria-label="搜索软件名称"
          />
        </div>
        <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px">
          <label for="appstore-status-filter" style="font-size: 0.75rem; color: var(--ag-on-surface-variant)">安装状态:</label>
          <select
            id="appstore-status-filter"
            [ngModel]="statusFilter()"
            (ngModelChange)="onStatusChange($event)"
            aria-label="按安装状态过滤"
            style="padding: 6px 10px; border-radius: 999px; border: 1px solid var(--ag-outline-variant); background: var(--ag-surface-lowest); color: var(--ag-on-surface); font-size: 0.76rem"
          >
            <option value="all">全部状态</option>
            <option value="installed">仅已安装</option>
            <option value="not_installed">未安装</option>
          </select>
        </div>
      </div>

      <!-- Category Filter Bar (FE-011) -->
      <div class="m3-card" style="padding: 10px 16px !important">
        <div style="display: flex; flex-wrap: wrap; gap: 8px">
          <button
            *ngFor="let c of categories"
            mat-stroked-button
            [style.background]="activeCategory() === c.key ? 'var(--ag-primary-container)' : ''"
            [style.color]="activeCategory() === c.key ? 'var(--ag-on-primary-container)' : ''"
            (click)="onCategoryChange(c.key)"
          >
            {{ c.label }}
          </button>
        </div>
      </div>

      <!-- State Banners (FE-001) -->
      <ag-state-banner
        *ngIf="loading() && apps().length === 0"
        state="loading"
        title="正在加载 ARM 软件商店应用列表..."
      />

      <ag-state-banner
        *ngIf="loadError()"
        state="error"
        title="应用列表加载失败"
        [description]="loadError()!"
        primaryActionLabel="重试加载"
        (primaryAction)="loadApps()"
      />

      <!-- Apps Grid (FE-012) -->
      <div class="m3-grid-3" *ngIf="!loadError()">
        <div *ngFor="let app of filteredApps()" class="m3-card app-card">
          <div class="app-card-top">
            <div>
              <div class="app-name font-display">{{ app.name }}</div>
              <div class="font-mono" style="font-size: 0.72rem; color: var(--ag-on-surface-variant)">
                支持架构: {{ app.arch_support.join(' / ') }}
              </div>
            </div>
            <span
              class="m3-badge"
              [ngClass]="
                app.service_status === 'running'
                  ? 'success'
                  : app.status === 'installed'
                    ? 'primary'
                    : 'neutral'
              "
            >
              {{
                app.service_status === 'running'
                  ? '● 运行中'
                  : app.status === 'installed'
                    ? '已安装'
                    : '未安装'
              }}
            </span>
          </div>

          <p class="app-desc">{{ app.description }}</p>

          <!-- Multi-version PHP indicator (FE-008) & Source Metadata -->
          <div class="app-meta font-mono" style="flex-direction: column; align-items: flex-start; gap: 4px">
            <div style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center">
              <span class="m3-badge neutral">
                {{ app.install_source || (app.has_prebuilt ? 'APT 官方预编译包' : 'SBC 源码编译') }}
              </span>
              <span *ngIf="app.status === 'installed'" style="color: var(--ag-success); font-weight: 600">
                当前版本: {{ app.current_version || '已安装' }}
              </span>
              <span *ngIf="app.status !== 'installed'" style="color: var(--ag-on-surface-variant)">
                可选版本: {{ app.versions.join(', ') || 'APT 默认版本' }}
              </span>
            </div>
            <div *ngIf="app.key === 'php' && app.installed_versions && app.installed_versions.length > 0" style="font-size: 0.72rem; color: var(--ag-primary)">
              已装 PHP 版本: <strong>{{ app.installed_versions.join(', ') }}</strong>
            </div>
          </div>

          <div class="app-actions">
            <button
              *ngIf="app.key === 'warp'"
              mat-flat-button
              color="primary"
              (click)="warpOpen.set(true)"
            >
              管理 WARP 隧道
            </button>
            <ng-container *ngIf="app.key !== 'warp'">
              <button
                *ngIf="app.status !== 'installed'"
                mat-flat-button
                color="primary"
                [disabled]="isInstallingApp(app.key) || taskCenter.hasActiveAptTask()"
                (click)="installApp(app)"
              >
                {{ isInstallingApp(app.key) ? '正在后台安装...' : '一键安装 (APT)' }}
              </button>
              <button
                *ngIf="app.status === 'installed'"
                mat-stroked-button
                color="primary"
                (click)="openManage(app)"
              >
                服务配置
              </button>
              <!-- Self-Protection for Panel Runtime (REV-009) -->
              <span
                *ngIf="app.status === 'installed' && (app.protected_runtime || app.key === 'nodejs')"
                class="m3-badge primary font-mono"
                style="margin-left: auto"
                [matTooltip]="app.protected_reason || 'ArmGuard 面板核心运行时依赖，禁止卸载'"
              >
                🔒 面板核心依赖
              </span>
              <button
                *ngIf="app.status === 'installed' && !app.protected_runtime && app.key !== 'nodejs'"
                mat-button
                color="warn"
                [disabled]="isInstallingApp(app.key) || taskCenter.hasActiveAptTask()"
                (click)="uninstallApp(app)"
              >
                卸载
              </button>
            </ng-container>
          </div>
        </div>

        <div *ngIf="filteredApps().length === 0 && !loading()" class="m3-empty-state" style="grid-column: 1 / -1">
          暂无匹配筛选条件的软件项目。
        </div>
      </div>

      <!-- Manage App Modal with Dirty Protection (FE-002, FE-003, FE-009) -->
      <ag-modal
        [open]="!!managingApp()"
        [title]="'服务管理: ' + (managingApp()?.app_name || '') + ' (' + (managingApp()?.service_name || '') + ')'"
        icon="settings_applications"
        size="lg"
        [dirty]="isConfigDirty()"
        [submitting]="savingConfig()"
        (closed)="closeManage()"
      >
        <div class="font-mono" *ngIf="managingApp()" style="display: flex; flex-direction: column; gap: 14px">
          <div class="m3-tonal-card" style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px">
            <div>
              状态: <strong>{{ managingApp()!.status }}</strong> | PID: {{ managingApp()!.pid }} |
              内存: {{ managingApp()!.memory_mb }} MB
            </div>
            <div style="display: flex; gap: 8px">
              <button mat-stroked-button (click)="controlService('start')">启动</button>
              <button mat-stroked-button (click)="controlService('restart')">重启</button>
              <button mat-stroked-button (click)="controlService('reload')">重载</button>
              <button mat-stroked-button color="warn" (click)="controlService('stop')">停止</button>
            </div>
          </div>

          <div class="m3-field">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px">
              <label for="appstore-raw-config-editor">
                配置文件 ({{ managingApp()!.config_file_path }}) — 保存前自动执行语法校验，失败自动回滚
              </label>
              <span *ngIf="isConfigDirty()" class="m3-badge warning">● 未保存修改</span>
            </div>
            <textarea
              id="appstore-raw-config-editor"
              rows="14"
              [(ngModel)]="currentRawConfig"
              style="line-height: 1.5; tab-size: 2"
            ></textarea>
          </div>
        </div>
        <div modal-footer>
          <button mat-stroked-button (click)="closeManage()" [disabled]="savingConfig()">关闭</button>
          <button
            mat-flat-button
            color="primary"
            [disabled]="savingConfig() || !isConfigDirty()"
            (click)="saveRawConfig()"
          >
            {{ savingConfig() ? '保存校验中...' : '保存配置并重载' }}
          </button>
        </div>
      </ag-modal>

      <ag-warp-plugin-dialog
        [open]="warpOpen()"
        (close)="warpOpen.set(false)"
      ></ag-warp-plugin-dialog>
    </div>
  `,
  styles: [
    `
      .app-card {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 12px;
      }
      .app-card-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
      }
      .app-name {
        font-size: 1.05rem;
        font-weight: 700;
      }
      .app-desc {
        margin: 0;
        font-size: 0.8rem;
        color: var(--ag-on-surface-variant);
        line-height: 1.5;
      }
      .app-meta {
        display: flex;
        font-size: 0.75rem;
      }
      .app-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        padding-top: 6px;
        border-top: 1px solid var(--ag-outline-variant);
      }
    `,
  ],
})
export class AppstoreComponent implements OnInit, OnDestroy, HasUnsavedChanges {
  private toast = inject(ToastService)
  private confirmSvc = inject(ConfirmService)
  readonly taskCenter = inject(TaskCenterService)
  private route = inject(ActivatedRoute)
  private router = inject(Router)

  readonly apps = signal<AppMarketItem[]>([])
  readonly loading = signal(false)
  readonly loadError = signal<string | null>(null)
  readonly activeCategory = signal('all')
  readonly statusFilter = signal<'all' | 'installed' | 'not_installed'>('all')
  readonly searchQuery = signal('')

  readonly managingApp = signal<AppManagementData | null>(null)
  readonly originalRawConfig = signal('')
  currentRawConfig = ''
  readonly savingConfig = signal(false)

  readonly warpOpen = signal(false)

  private unlistenTaskComplete: (() => void) | null = null

  categories = [
    { key: 'all', label: '全部软件' },
    { key: 'webserver', label: 'Web 服务器' },
    { key: 'database', label: '数据库' },
    { key: 'runtime', label: '运行环境' },
    { key: 'cache', label: '缓存与队列' },
    { key: 'tools', label: '运维工具' },
  ]

  readonly filteredApps = computed(() => {
    const cat = this.activeCategory()
    const st = this.statusFilter()
    const q = this.searchQuery().trim().toLowerCase()

    return this.apps().filter((a) => {
      if (cat !== 'all' && a.category !== cat) return false
      if (st === 'installed' && a.status !== 'installed') return false
      if (st === 'not_installed' && a.status === 'installed') return false
      if (q) {
        const text = `${a.name} ${a.key} ${a.description} ${(a.arch_support || []).join(' ')}`.toLowerCase()
        if (!text.includes(q)) return false
      }
      return true
    })
  })

  ngOnInit() {
    const qp = this.route.snapshot.queryParamMap
    if (qp.get('cat')) this.activeCategory.set(qp.get('cat')!)
    if (qp.get('st')) this.statusFilter.set(qp.get('st') as any)
    if (qp.get('q')) this.searchQuery.set(qp.get('q')!)

    this.loadApps()
    this.taskCenter.syncServerAppTasks()

    this.unlistenTaskComplete = this.taskCenter.onTaskComplete((task) => {
      if (task.type === 'app_install') {
        this.loadApps()
      }
    })
  }

  ngOnDestroy() {
    if (this.unlistenTaskComplete) {
      this.unlistenTaskComplete()
      this.unlistenTaskComplete = null
    }
  }

  hasUnsavedChanges(): boolean {
    return this.isConfigDirty()
  }

  isConfigDirty(): boolean {
    return !!this.managingApp() && this.currentRawConfig !== this.originalRawConfig()
  }

  isInstallingApp(appKey: string): boolean {
    return this.taskCenter.isAppInstalling(appKey)
  }

  onCategoryChange(cat: string) {
    this.activeCategory.set(cat)
    this.syncUrlParams()
  }

  onStatusChange(st: 'all' | 'installed' | 'not_installed') {
    this.statusFilter.set(st)
    this.syncUrlParams()
  }

  onSearchChange(q: string) {
    this.searchQuery.set(q)
    this.syncUrlParams()
  }

  private syncUrlParams() {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        cat: this.activeCategory() !== 'all' ? this.activeCategory() : null,
        st: this.statusFilter() !== 'all' ? this.statusFilter() : null,
        q: this.searchQuery().trim() || null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    })
  }

  async loadApps() {
    this.loading.set(true)
    this.loadError.set(null)
    try {
      const res = await appStoreApi.getMarketList()
      this.apps.set(res.data?.data?.list || [])
    } catch (e: any) {
      const msg = e.message || '加载应用商店失败'
      this.loadError.set(msg)
      this.toast.error(msg)
    } finally {
      this.loading.set(false)
    }
  }

  async installApp(app: AppMarketItem) {
    const ver = app.versions[0] || 'default'
    try {
      const res = await appStoreApi.installApp(app.key, ver, false)
      const taskId = res.data?.data?.task_id
      if (!taskId) {
        this.toast.error('未获取到安装任务 ID')
        return
      }
      this.taskCenter.trackAppInstall(taskId, app.key, app.name)
      this.toast.info(`已在后台启动安装 ${app.name}，可随时在右上角任务中心查看进度`)
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async uninstallApp(app: AppMarketItem) {
    if (app.protected_runtime || app.key === 'nodejs') {
      this.toast.warning(app.protected_reason || 'Node.js 为面板核心依赖，禁止卸载')
      return
    }
    const res = await this.confirmSvc.ask({
      title: '卸载软件确认',
      resourceName: app.name,
      message: `确定要卸载软件 “${app.name}” 吗？`,
      impact: '卸载后该守护进程将被终止并从系统中移除包，已创建的配置文件可能会被清除。',
      confirmText: '确认卸载',
      severity: 'danger',
    })
    if (!res.confirmed) return

    try {
      await appStoreApi.uninstallApp(app.key)
      this.toast.success(`${app.name} 已成功卸载`)
      this.loadApps()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async openManage(app: AppMarketItem) {
    try {
      const res = await appStoreApi.getAppManagement(app.key, app.current_version)
      if (res.data?.data) {
        const d = res.data.data
        this.managingApp.set(d)
        this.currentRawConfig = d.raw_config || ''
        this.originalRawConfig.set(d.raw_config || '')
      }
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  closeManage() {
    this.managingApp.set(null)
    this.currentRawConfig = ''
    this.originalRawConfig.set('')
  }

  async controlService(action: 'start' | 'stop' | 'restart' | 'reload') {
    const m = this.managingApp()
    if (!m) return

    if (action === 'stop') {
      const res = await this.confirmSvc.ask({
        title: '停止服务确认',
        resourceName: `${m.app_name} (${m.service_name})`,
        message: `停止该服务将导致相关依赖网站或业务无法正常响应请求。`,
        impact: '服务将被停用，直到手动重新启动。',
        confirmText: '停止服务',
        severity: 'warning',
      })
      if (!res.confirmed) return
    }

    try {
      await appStoreApi.controlAppService(m.app_key, action)
      this.toast.success(`服务操作 (${action}) 已执行`)
      const res = await appStoreApi.getAppManagement(m.app_key)
      if (res.data?.data) {
        const d = res.data.data
        this.managingApp.set(d)
        this.currentRawConfig = d.raw_config || ''
        this.originalRawConfig.set(d.raw_config || '')
      }
      this.loadApps()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async saveRawConfig() {
    const m = this.managingApp()
    if (!m) return
    this.savingConfig.set(true)
    try {
      await appStoreApi.saveRawConfig(m.app_key, m.config_file_path, this.currentRawConfig)
      this.originalRawConfig.set(this.currentRawConfig)
      this.toast.success('配置文件已通过语法校验并成功重载生效')
    } catch (e: any) {
      this.toast.error(e.message)
      // Reload actual config from disk so rolled-back content is reflected in the editor
      try {
        const res = await appStoreApi.getAppManagement(m.app_key)
        if (res.data?.data) {
          this.managingApp.set(res.data.data)
          this.currentRawConfig = res.data.data.raw_config || ''
          this.originalRawConfig.set(res.data.data.raw_config || '')
        }
      } catch {}
    } finally {
      this.savingConfig.set(false)
    }
  }
}
