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
import { appStoreApi, AppMarketItem, AppManagementData, InstallablePackage, NodeVersionInfo } from '@/api/appstore'

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
            <span>软件商店</span>
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
        title="正在加载软件商店应用列表..."
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
                *ngIf="app.status !== 'installed' && app.key !== 'nodejs'"
                mat-stroked-button
                [disabled]="isInstallingApp(app.key) || taskCenter.hasActiveAptTask()"
                (click)="openVersionPicker(app)"
                matTooltip="查询 apt 源中真实可安装的版本后再选择"
              >
                选择版本
              </button>
              <button
                *ngIf="app.status === 'installed'"
                mat-stroked-button
                color="primary"
                (click)="openManage(app)"
              >
                服务配置
              </button>
              <button
                *ngIf="app.key === 'nodejs'"
                mat-stroked-button
                (click)="openNodeManager()"
                matTooltip="安装多个 Node.js 版本并切换命令行默认版本"
              >
                <mat-icon>layers</mat-icon>
                <span>版本管理</span>
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
                {{ isInstallingApp(app.key) ? '任务进行中...' : '卸载' }}
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

      <!-- 安装版本选择（AG-PKG-01）：先向 apt 查询真实可安装版本，再由用户挑选 -->
      <ag-modal
        [open]="!!versionPicker()"
        [title]="'选择安装版本: ' + (versionPicker()?.app?.name || '')"
        icon="tune"
        size="lg"
        [submitting]="versionInstalling()"
        (close)="closeVersionPicker()"
      >
        <div class="font-mono" *ngIf="versionPicker() as vp" style="display: flex; flex-direction: column; gap: 14px">
          <ag-state-banner
            *ngIf="vp.loading"
            state="loading"
            title="正在查询 apt 源中的可安装版本..."
          />
          <ag-state-banner
            *ngIf="vp.error"
            state="error"
            title="查询可安装版本失败"
            [description]="vp.error"
            primaryActionLabel="重试"
            (primaryAction)="openVersionPicker(vp.app)"
          />

          <ng-container *ngIf="!vp.loading && !vp.error">
            <p class="m3-hint" style="margin: 0">
              以下版本来自当前已启用的 apt 源。若只有一个版本，说明该系统源里只提供这一个包；
              可先在「工具箱 → 镜像源」切换到其他源后再查询。
            </p>

            <div *ngFor="let p of vp.packages" class="m3-card" style="display: flex; flex-direction: column; gap: 8px">
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap">
                <strong>{{ p.label }}</strong>
                <span class="m3-badge font-mono">{{ p.pkg }}</span>
                <span *ngIf="p.installed_version" class="m3-badge font-mono">
                  已安装 {{ p.installed_version }}
                </span>
              </div>

              <div *ngIf="p.versions.length === 0" class="m3-hint">
                当前 apt 源中没有可安装版本（该软件包可能未包含在已启用的源中）。
              </div>

              <label
                *ngFor="let v of p.versions"
                class="version-option"
                [class.version-option-active]="isVersionSelected(p.pkg, v.version)"
              >
                <input
                  type="radio"
                  [name]="'ver-' + p.pkg"
                  [checked]="isVersionSelected(p.pkg, v.version)"
                  (change)="selectVersion(p.pkg, v.version)"
                />
                <span class="font-mono" style="font-weight: 600">{{ v.version }}</span>
                <span class="version-repo">{{ v.repo }}</span>
                <span *ngIf="v.installed" class="m3-badge primary">当前已装</span>
              </label>
            </div>
          </ng-container>
        </div>

        <div modal-footer style="display: flex; gap: 10px; justify-content: flex-end">
          <button mat-stroked-button (click)="closeVersionPicker()">取消</button>
          <button
            mat-flat-button
            color="primary"
            [disabled]="versionInstalling() || !selectedVersionPkg()"
            (click)="confirmVersionInstall()"
          >
            {{ versionInstalling() ? '正在提交...' : '安装所选版本' }}
          </button>
        </div>
      </ag-modal>

      <!-- Node.js 版本管理器 -->
      <ag-modal
        [open]="!!nodeMgr()"
        title="Node.js 版本管理"
        icon="layers"
        size="lg"
        [submitting]="!!nodeBusy()"
        (close)="closeNodeManager()"
      >
        <div class="font-mono" *ngIf="nodeMgr() as nm" style="display: flex; flex-direction: column; gap: 14px">
          <ag-state-banner *ngIf="nm.loading" state="loading" title="正在读取版本信息..." />
          <ag-state-banner
            *ngIf="nm.error"
            state="error"
            title="读取失败"
            [description]="nm.error"
            primaryActionLabel="重试"
            (primaryAction)="loadNodeVersions()"
          />

          <ng-container *ngIf="!nm.loading && nm.info as info">
            <div class="m3-tonal-card" style="display: flex; flex-direction: column; gap: 6px">
              <div>
                当前 CLI 版本:
                <strong style="color: var(--ag-success)">
                  {{ info.current ? 'v' + info.current.version : '未接管（使用系统 /usr/bin/node ' + info.system_node + '）' }}
                </strong>
              </div>
              <div class="m3-hint">
                版本安装目录 <span class="font-mono">{{ info.install_root }}</span> ·
                架构 <span class="font-mono">{{ info.arch }}</span> ·
                切换后对<strong>新开的终端</strong>生效，不影响面板自身运行时
              </div>
            </div>

            <div>
              <h4 style="margin: 0 0 8px">已安装版本（{{ info.installed.length }}）</h4>
              <div *ngIf="info.installed.length === 0" class="m3-hint">还没有通过面板安装过任何版本。</div>
              <label
                *ngFor="let v of info.installed"
                class="version-option"
                [class.version-option-active]="info.current?.version === v.version"
              >
                <span class="font-mono" style="font-weight: 600; min-width: 88px">v{{ v.version }}</span>
                <span class="version-repo">{{ v.path }}</span>
                <span *ngIf="info.current?.version === v.version" class="m3-badge primary">当前默认</span>
                <span style="margin-left: auto; display: flex; gap: 6px">
                  <button
                    mat-stroked-button
                    type="button"
                    [disabled]="!!nodeBusy() || info.current?.version === v.version"
                    (click)="switchNodeVersion(v.version)"
                  >
                    {{ nodeBusy() === 'switch:' + v.version ? '切换中...' : '设为默认' }}
                  </button>
                  <button
                    mat-button
                    color="warn"
                    type="button"
                    [disabled]="!!nodeBusy()"
                    (click)="removeNodeVersion(v.version)"
                  >
                    删除
                  </button>
                </span>
              </label>
            </div>

            <div>
              <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px">
                <h4 style="margin: 0">可安装版本</h4>
                <button mat-button type="button" (click)="loadNodeVersions()" [disabled]="nm.loading">
                  <mat-icon>refresh</mat-icon>
                  <span>刷新</span>
                </button>
              </div>
              <div *ngIf="info.available_error" class="m3-hint" style="color: var(--ag-warning)">
                版本索引获取失败：{{ info.available_error }}（不影响已安装版本的切换）
              </div>
              <div class="node-version-grid" *ngIf="info.available.length">
                <button
                  type="button"
                  class="node-version-chip"
                  *ngFor="let a of info.available"
                  [disabled]="!!nodeBusy() || isNodeInstalled(a.version)"
                  (click)="installNodeVersion(a.version)"
                  [matTooltip]="a.lts ? 'LTS ' + a.lts + ' · ' + a.date : a.date"
                >
                  <span class="font-mono">v{{ a.version }}</span>
                  <span *ngIf="a.lts" class="m3-badge primary">LTS</span>
                  <span *ngIf="isNodeInstalled(a.version)" class="m3-badge neutral">已装</span>
                  <mat-icon *ngIf="nodeBusy() === 'install:' + a.version" class="node-spin">progress_activity</mat-icon>
                </button>
              </div>
            </div>
          </ng-container>
        </div>

        <div modal-footer style="display: flex; justify-content: flex-end">
          <button mat-stroked-button (click)="closeNodeManager()">关闭</button>
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
      .version-option {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 12px;
        border-radius: 10px;
        border: 1px solid var(--ag-outline-variant);
        cursor: pointer;
        transition: border-color 0.15s ease, background 0.15s ease;
      }
      .version-option:hover {
        border-color: var(--ag-primary);
      }
      .version-option-active {
        border-color: var(--ag-primary);
        background: color-mix(in srgb, var(--ag-primary) 10%, transparent);
      }
      .version-option input {
        accent-color: var(--ag-primary);
      }
      .version-repo {
        font-size: 0.72rem;
        color: var(--ag-on-surface-variant);
        word-break: break-all;
      }
      .node-version-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 8px;
        max-height: 260px;
        overflow-y: auto;
        padding-right: 4px;
      }
      .node-version-chip {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 10px;
        border-radius: 10px;
        border: 1px solid var(--ag-outline-variant);
        background: transparent;
        cursor: pointer;
        font-size: 0.8rem;
        transition: border-color 0.15s ease, background 0.15s ease;
      }
      .node-version-chip:hover:not(:disabled) {
        border-color: var(--ag-primary);
        background: color-mix(in srgb, var(--ag-primary) 8%, transparent);
      }
      .node-version-chip:disabled {
        opacity: 0.55;
        cursor: not-allowed;
      }
      .node-spin {
        animation: node-spin 1s linear infinite;
      }
      @keyframes node-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
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

  // 安装版本选择（AG-PKG-01）
  readonly versionPicker = signal<{
    app: AppMarketItem
    loading: boolean
    error: string | null
    packages: InstallablePackage[]
  } | null>(null)
  readonly selectedVersionPkg = signal('')
  readonly versionInstalling = signal(false)

  // Node.js 版本管理器
  readonly nodeMgr = signal<{ loading: boolean; error: string | null; info: NodeVersionInfo | null } | null>(null)
  readonly nodeBusy = signal('')

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

  async loadApps(force = false) {
    this.loading.set(true)
    this.loadError.set(null)
    try {
      const res = await appStoreApi.getMarketList(force)
      this.apps.set(res.data?.data?.list || [])
    } catch (e: any) {
      const msg = e.message || '加载应用商店失败'
      this.loadError.set(msg)
      this.toast.error(msg)
    } finally {
      this.loading.set(false)
    }
  }

  async installApp(app: AppMarketItem, pkg?: string, version?: string) {
    const ver = version || app.versions[0] || 'default'
    try {
      const res = await appStoreApi.installApp(app.key, ver, false, pkg)
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

  // ================= Node.js 版本管理器 =================
  openNodeManager() {
    this.nodeMgr.set({ loading: true, error: null, info: null })
    this.loadNodeVersions()
  }

  async loadNodeVersions() {
    const prev = this.nodeMgr()
    this.nodeMgr.set({ loading: true, error: null, info: prev?.info ?? null })
    try {
      const res = await appStoreApi.getNodeVersions()
      this.nodeMgr.set({ loading: false, error: null, info: res.data.data })
    } catch (e: any) {
      this.nodeMgr.set({ loading: false, error: e?.message || '读取版本信息失败', info: null })
    }
  }

  closeNodeManager() {
    this.nodeMgr.set(null)
    this.nodeBusy.set('')
  }

  isNodeInstalled(version: string): boolean {
    return (this.nodeMgr()?.info?.installed || []).some(v => v.version === version)
  }

  async installNodeVersion(version: string) {
    this.nodeBusy.set('install:' + version)
    try {
      const res = await appStoreApi.installNodeVersion(version)
      const taskId = res.data?.data?.task_id
      if (taskId) {
        this.taskCenter.trackAppInstall(taskId, 'nodejs', `Node.js v${version}`)
      }
      this.toast.info(`已开始安装 Node.js v${version}，可在右上角任务中心查看进度`)
      // 下载解压需要一段时间，稍后自动刷新一次
      setTimeout(() => this.loadNodeVersions(), 5000)
    } catch (e: any) {
      this.toast.error(e?.message || '安装失败')
    } finally {
      this.nodeBusy.set('')
    }
  }

  async switchNodeVersion(version: string) {
    this.nodeBusy.set('switch:' + version)
    try {
      const res = await appStoreApi.switchNodeVersion(version)
      this.toast.success(res.data?.message || `已切换默认 Node.js 为 v${version}`)
      await this.loadNodeVersions()
    } catch (e: any) {
      this.toast.error(e?.message || '切换失败')
    } finally {
      this.nodeBusy.set('')
    }
  }

  async removeNodeVersion(version: string) {
    const res = await this.confirmSvc.ask({
      title: '删除 Node.js 版本',
      resourceName: `v${version}`,
      message: `将删除 ${version} 的整个安装目录，不可恢复。`,
      impact: '如果这是当前默认版本，删除后 CLI 的 node 命令会回落到系统自带的 /usr/bin/node，需重新选择版本。',
      confirmText: '确认删除',
      tone: 'danger',
    })
    if (!res.confirmed) return
    this.nodeBusy.set('remove:' + version)
    try {
      const r = await appStoreApi.removeNodeVersion(version)
      this.toast.success(r.data?.message || `已删除 v${version}`)
      await this.loadNodeVersions()
    } catch (e: any) {
      this.toast.error(e?.message || '删除失败')
    } finally {
      this.nodeBusy.set('')
    }
  }

  // ================= 安装版本选择 =================
  async openVersionPicker(app: AppMarketItem) {
    this.versionPicker.set({ app, loading: true, error: null, packages: [] })
    this.selectedVersionPkg.set('')
    try {
      const res = await appStoreApi.getInstallableVersions(app.key)
      const packages = res.data?.data?.packages || []
      this.versionPicker.set({ app, loading: false, error: null, packages })
      const first = packages.find(p => p.versions.length > 0)
      if (first) {
        const pick = first.versions.find(v => v.installed) || first.versions[0]
        this.selectedVersionPkg.set(`${first.pkg}=${pick.version}`)
      }
    } catch (e: any) {
      this.versionPicker.set({ app, loading: false, error: e?.message || '查询失败', packages: [] })
    }
  }

  closeVersionPicker() {
    this.versionPicker.set(null)
    this.selectedVersionPkg.set('')
  }

  isVersionSelected(pkg: string, version: string): boolean {
    return this.selectedVersionPkg() === `${pkg}=${version}`
  }

  selectVersion(pkg: string, version: string) {
    this.selectedVersionPkg.set(`${pkg}=${version}`)
  }

  async confirmVersionInstall() {
    const vp = this.versionPicker()
    const sel = this.selectedVersionPkg()
    if (!vp || !sel) return
    const idx = sel.indexOf('=')
    const pkg = sel.slice(0, idx)
    const version = sel.slice(idx + 1)
    this.versionInstalling.set(true)
    try {
      await this.installApp(vp.app, pkg, version)
      this.closeVersionPicker()
      this.loadApps()
    } finally {
      this.versionInstalling.set(false)
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
      // 卸载改为后台任务：立即返回 task_id，进度在右上角任务中心查看
      const r = await appStoreApi.uninstallApp(app.key)
      const taskId = r.data?.data?.task_id
      if (!taskId) {
        this.toast.error('未获取到卸载任务 ID')
        return
      }
      this.taskCenter.trackAppUninstall(taskId, app.key, app.name)
      this.toast.info(`已在后台开始卸载 ${app.name}，可在右上角任务中心查看进度`)
    } catch (e: any) {
      this.toast.error(e.message || '卸载失败')
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
