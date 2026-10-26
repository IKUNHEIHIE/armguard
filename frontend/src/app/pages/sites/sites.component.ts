import { Component, OnInit, inject, signal, computed } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { AgMaterialModule } from '../../core/material.module'
import { ToastService } from '../../core/toast.service'
import { ConfirmService } from '../../core/confirm.service'
import { HasUnsavedChanges } from '../../core/unsaved-changes.guard'
import { AgModalComponent } from '../../components/ag-modal.component'
import { AgStateBannerComponent } from '../../components/ag-state-banner.component'
import { siteApi, SiteItem, CreateSiteParams } from '@/api/site'
import { appStoreApi } from '@/api/appstore'

const SITE_DRAFT_KEY = 'armguard_site_draft_v1'

@Component({
  selector: 'ag-sites',
  standalone: true,
  imports: [AgMaterialModule, AgModalComponent, AgStateBannerComponent],
  template: `
    <div class="m3-page">
      <div class="m3-page-header">
        <div>
          <h2 class="m3-page-title">
            <mat-icon style="color: var(--ag-primary)" aria-hidden="true">language</mat-icon>
            <span>网站与反向代理管理</span>
          </h2>
          <p class="m3-page-subtitle">
            管理 Nginx IPv4/IPv6 双栈虚拟主机、PHP 多版本运行池与 HTTP/2 gRPC 反向代理网关
          </p>
        </div>
        <div class="m3-page-actions">
          <button
            type="button"
            mat-stroked-button
            [disabled]="loading()"
            (click)="loadSites()"
          >
            <mat-icon>refresh</mat-icon>
            <span>{{ loading() ? '刷新中...' : '刷新列表' }}</span>
          </button>
          <button
            type="button"
            mat-flat-button
            color="primary"
            (click)="openCreateModal()"
          >
            <mat-icon>add</mat-icon>
            <span>新建站点 / 反代</span>
          </button>
        </div>
      </div>

      <!-- Missing Nginx Dependency Guidance (FE-008) -->
      <ag-state-banner
        *ngIf="!nginxInstalled()"
        state="missing_dep"
        title="检测到宿主机尚未安装 Nginx Web 服务器"
        description="创建或重载站点需要 Nginx 支持。您可以先前往软件商店一键安装 Nginx，再回来创建站点。"
        actionLabel="前往软件商店安装 Nginx"
        actionIcon="apps"
        (action)="router.navigateByUrl('/appstore')"
      ></ag-state-banner>

      <!-- Partial Failure / Stale Data Banner (FE-001) -->
      <ag-state-banner
        *ngIf="loadError() && sites().length > 0"
        state="partial_error"
        title="刷新站点列表失败，当前显示上次缓存记录"
        [description]="loadError()!"
        [lastUpdated]="lastUpdated()"
        actionLabel="重试刷新"
        (action)="loadSites()"
      ></ag-state-banner>

      <div class="m3-card">
        <!-- Unified Search & Filter Bar (FE-011) -->
        <div class="m3-filter-bar">
          <div class="filter-left">
            <input
              type="text"
              [(ngModel)]="searchQuery"
              (ngModelChange)="syncUrlParams()"
              aria-label="搜索域名、根目录或反代地址"
              placeholder="搜索域名、端口、目录或反代目标..."
              class="m3-search-input"
            />
            <select
              [(ngModel)]="statusFilter"
              (ngModelChange)="syncUrlParams()"
              aria-label="按站点运行状态筛选"
              class="m3-filter-select"
            >
              <option value="all">全部状态 ({{ sites().length }})</option>
              <option value="running">运行中</option>
              <option value="stopped">已停用</option>
            </select>
            <select
              [(ngModel)]="modeFilter"
              (ngModelChange)="syncUrlParams()"
              aria-label="按运行模式筛选"
              class="m3-filter-select"
            >
              <option value="all">全部模式</option>
              <option value="static">纯静态 / SPA</option>
              <option value="php">PHP 动态站点</option>
              <option value="proxy">反向代理 / gRPC</option>
            </select>
            <button
              *ngIf="searchQuery || statusFilter !== 'all' || modeFilter !== 'all'"
              type="button"
              mat-button
              (click)="clearFilters()"
            >
              清除筛选
            </button>
          </div>
          <div class="filter-right font-mono" style="font-size: 0.76rem; color: var(--ag-on-surface-variant)">
            显示 {{ filteredSites().length }} / {{ sites().length }} 个站点
            <span *ngIf="lastUpdated()"> · 更新于 {{ lastUpdated() }}</span>
          </div>
        </div>

        <!-- Loading / Error / Empty States (FE-001) -->
        <ag-state-banner
          *ngIf="loading() && sites().length === 0"
          state="loading"
          title="正在加载站点与反向代理配置..."
          description="正在从 Nginx 配置目录读取虚拟主机列表"
        ></ag-state-banner>

        <ag-state-banner
          *ngIf="!loading() && loadError() && sites().length === 0"
          state="error"
          title="无法加载站点列表"
          [description]="loadError()!"
          actionLabel="重新加载"
          actionIcon="refresh"
          (action)="loadSites()"
        ></ag-state-banner>

        <div *ngIf="!loading() && (!loadError() || sites().length > 0)" class="m3-table-wrap font-mono">
          <table class="m3-data-table">
            <thead>
              <tr>
                <th>主域名 / 绑定域名</th>
                <th>运行模式</th>
                <th>监听端口</th>
                <th>根目录 / 反代目标</th>
                <th>HTTPS / SSL</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                *ngFor="let site of filteredSites()"
                [style.background]="lastCreatedDomain() === site.domain ? 'rgba(168, 199, 250, 0.08)' : ''"
              >
                <td>
                  <strong>{{ site.domain }}</strong>
                  <div *ngIf="site.domains.length" style="font-size: 0.7rem; color: var(--ag-on-surface-variant)">
                    +{{ site.domains.length }} 绑定域名
                  </div>
                </td>
                <td>
                  <span class="m3-badge primary">{{ formatMode(site) }}</span>
                  <span *ngIf="site.grpc_enabled" class="m3-badge success" style="margin-left: 4px">gRPC</span>
                </td>
                <td>:{{ site.port || 80 }}</td>
                <td>{{ site.proxy_enabled ? site.proxy_pass : site.path }}</td>
                <td>
                  <span class="m3-badge" [ngClass]="site.ssl_enabled ? 'success' : 'neutral'">
                    {{ site.ssl_enabled ? 'HTTPS 已启用' : 'HTTP' }}
                  </span>
                </td>
                <td>
                  <span class="m3-badge" [ngClass]="site.status === 'running' ? 'success' : 'warning'">
                    {{ site.status === 'running' ? '● 运行中' : '○ 已停用' }}
                  </span>
                </td>
                <td>
                  <button type="button" mat-button color="primary" (click)="openManageModal(site)">配置</button>
                  <button type="button" mat-button (click)="toggleStatus(site)">
                    {{ site.status === 'running' ? '停用' : '启用' }}
                  </button>
                  <button type="button" mat-button color="warn" (click)="deleteSite(site)">删除</button>
                </td>
              </tr>
              <tr *ngIf="filteredSites().length === 0">
                <td colspan="7" class="m3-empty-state">
                  <ng-container *ngIf="sites().length === 0; else noFilterMatch">
                    <div>当前尚未创建任何网站或反向代理站点。</div>
                    <div style="margin-top: 10px">
                      <button type="button" mat-flat-button color="primary" (click)="openCreateModal()">
                        <mat-icon>add</mat-icon>
                        <span>立即新建第一个站点</span>
                      </button>
                    </div>
                  </ng-container>
                  <ng-template #noFilterMatch>
                    <div>没有匹配当前检索或筛选条件的站点。</div>
                    <div style="margin-top: 10px">
                      <button type="button" mat-stroked-button (click)="clearFilters()">
                        清除筛选条件
                      </button>
                    </div>
                  </ng-template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Create Site Modal (FE-002, FE-003, FE-004, FE-008, FE-014) -->
      <ag-modal
        [open]="showCreateModal()"
        title="新建 Nginx 双栈站点 / 反向代理"
        icon="add_circle"
        size="md"
        [dirty]="createFormDirty()"
        [submitting]="creating()"
        (close)="showCreateModal.set(false)"
      >
        <div class="font-mono" style="display: flex; flex-direction: column; gap: 14px">
          <!-- Restored Draft Notice -->
          <div
            *ngIf="draftRestored()"
            class="m3-tonal-card"
            style="display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 0.76rem"
          >
            <span>已为您恢复上次未提交的站点草稿内容。</span>
            <button type="button" mat-button (click)="resetCreateForm()">清空重置</button>
          </div>

          <!-- API Submit Error Banner (FE-004) -->
          <div
            *ngIf="createSubmitError()"
            class="m3-tonal-card"
            role="alert"
            style="border-color: var(--ag-danger); background: var(--ag-danger-container); color: var(--ag-danger); font-size: 0.8rem"
          >
            <strong>创建失败：</strong>{{ createSubmitError() }}
          </div>

          <div class="m3-grid-2">
            <div class="m3-field">
              <label for="site-create-domain">
                <span>主域名 (Domain)</span>
                <span class="m3-req">*</span>
              </label>
              <input
                id="site-create-domain"
                type="text"
                [(ngModel)]="createForm.domain"
                (ngModelChange)="onCreateFieldChange()"
                [attr.aria-invalid]="!!createErrors().domain"
                placeholder="example.com 或 sub.example.com"
              />
              <div *ngIf="createErrors().domain" class="m3-field-error" role="alert">
                {{ createErrors().domain }}
              </div>
              <div *ngIf="!createErrors().domain" class="m3-hint">
                支持标准域名或内网主机名，无需包含 http://
              </div>
            </div>

            <div class="m3-field">
              <label for="site-create-port">
                <span>监听端口 (Port)</span>
                <span class="m3-req">*</span>
              </label>
              <input
                id="site-create-port"
                type="number"
                min="1"
                max="65535"
                [(ngModel)]="createForm.port"
                (ngModelChange)="onCreateFieldChange()"
                [attr.aria-invalid]="!!createErrors().port"
                placeholder="80"
              />
              <div *ngIf="createErrors().port" class="m3-field-error" role="alert">
                {{ createErrors().port }}
              </div>
              <div *ngIf="!createErrors().port" class="m3-hint">
                默认 80 端口，有效范围 1 ~ 65535
              </div>
            </div>
          </div>

          <div class="m3-field">
            <label for="site-create-mode">站点运行环境 / 代理类型</label>
            <select
              id="site-create-mode"
              [(ngModel)]="createForm.php_version"
              (change)="onPhpModeChange()"
            >
              <option value="static">纯静态 / HTML / SPA 单页应用 (无需 PHP)</option>
              <option value="proxy">七层 HTTP / WebSocket / gRPC 反向代理</option>
              <option *ngFor="let p of phpOptions()" [value]="p.value">
                {{ p.label }} {{ p.installed ? '(已安装)' : '(未安装 - 需前往软件商店安装)' }}
              </option>
            </select>
            <div
              *ngIf="isSelectedPhpMissing(createForm.php_version)"
              class="m3-field-error"
              style="color: var(--ag-warning)"
            >
              <span>当前宿主机尚未安装该 PHP 版本，创建后站点可能无法解析 PHP 脚本。</span>
              <button type="button" mat-button color="primary" (click)="router.navigateByUrl('/appstore')">
                前往软件商店安装 →
              </button>
            </div>
          </div>

          <div *ngIf="!createForm.proxy_enabled" class="m3-field">
            <label for="site-create-path">网站根目录 (Document Root，留空使用默认路径)</label>
            <input
              id="site-create-path"
              type="text"
              [(ngModel)]="createForm.path"
              (ngModelChange)="onCreateFieldChange()"
              [attr.aria-invalid]="!!createErrors().path"
              [placeholder]="'/www/wwwroot/' + (createForm.domain || 'example.com')"
            />
            <div *ngIf="createErrors().path" class="m3-field-error" role="alert">
              {{ createErrors().path }}
            </div>
            <div class="m3-hint">必须为以 / 开头的绝对路径，留空将自动创建 /www/wwwroot/域名</div>
          </div>

          <div *ngIf="createForm.proxy_enabled" class="m3-grid-2">
            <div class="m3-field">
              <label for="site-create-proxy">
                <span>后端目标地址 (Upstream URL)</span>
                <span class="m3-req">*</span>
              </label>
              <input
                id="site-create-proxy"
                type="text"
                [(ngModel)]="createForm.proxy_pass"
                (ngModelChange)="onCreateFieldChange()"
                [attr.aria-invalid]="!!createErrors().proxy_pass"
                placeholder="http://127.0.0.1:8080 或 grpc://127.0.0.1:50051"
              />
              <div *ngIf="createErrors().proxy_pass" class="m3-field-error" role="alert">
                {{ createErrors().proxy_pass }}
              </div>
              <div class="m3-hint">支持 http://, https://, grpc://, grpcs://, ws://, wss://</div>
            </div>
            <div class="m3-field">
              <label for="site-create-grpc">启用原生 gRPC HTTP/2 网关</label>
              <mat-slide-toggle
                id="site-create-grpc"
                [(ngModel)]="createForm.grpc_enabled"
                (change)="onCreateFieldChange()"
              >
                开启 grpc_pass 模式
              </mat-slide-toggle>
            </div>
          </div>
        </div>

        <ng-container modal-footer>
          <button
            type="button"
            mat-stroked-button
            [disabled]="creating()"
            (click)="closeCreateModalWithGuard()"
          >
            取消
          </button>
          <button
            type="button"
            mat-flat-button
            color="primary"
            [disabled]="creating()"
            (click)="handleCreateSite()"
          >
            <mat-icon>{{ creating() ? 'hourglass_top' : 'check' }}</mat-icon>
            <span>{{ creating() ? '正在校验并创建...' : '确认创建站点' }}</span>
          </button>
        </ng-container>
      </ag-modal>

      <!-- Site Settings & Config Modal (FE-002, FE-003, FE-004, FE-014) -->
      <ag-modal
        [open]="!!activeSite()"
        [title]="'站点管理: ' + (activeSite()?.domain || '')"
        icon="settings"
        size="lg"
        [dirty]="manageDirty()"
        [submitting]="savingManage()"
        [showFooter]="false"
        (close)="activeSite.set(null); manageDirty.set(false)"
      >
        <div *ngIf="activeSite()" class="font-mono">
          <div
            *ngIf="manageError()"
            class="m3-tonal-card"
            role="alert"
            style="margin-bottom: 12px; border-color: var(--ag-danger); background: var(--ag-danger-container); color: var(--ag-danger); font-size: 0.8rem"
          >
            <strong>保存失败：</strong>{{ manageError() }}
          </div>

          <mat-tab-group animationDuration="160ms">
            <mat-tab label="基础与反代设置">
              <div style="padding: 16px 0; display: flex; flex-direction: column; gap: 14px">
                <div class="m3-grid-2">
                  <div class="m3-field">
                    <label for="site-edit-path">网站根目录</label>
                    <input
                      id="site-edit-path"
                      type="text"
                      [(ngModel)]="activeSite()!.path"
                      (ngModelChange)="manageDirty.set(true)"
                    />
                  </div>
                  <div class="m3-field">
                    <label for="site-edit-php">PHP 运行时版本</label>
                    <select
                      id="site-edit-php"
                      [(ngModel)]="activeSite()!.php_version"
                      (ngModelChange)="manageDirty.set(true)"
                    >
                      <option value="static">纯静态 (Static)</option>
                      <option value="proxy">反向代理 (Reverse Proxy)</option>
                      <option *ngFor="let p of phpOptions()" [value]="p.value">
                        {{ p.label }} {{ p.installed ? '(已安装)' : '(未安装)' }}
                      </option>
                    </select>
                  </div>
                  <div class="m3-field">
                    <label for="site-edit-rewrite">伪静态规则预设 (Rewrite)</label>
                    <select
                      id="site-edit-rewrite"
                      [(ngModel)]="activeSite()!.rewrite_preset"
                      (ngModelChange)="manageDirty.set(true)"
                    >
                      <option value="none">不启用伪静态</option>
                      <option value="spa">Vue / Angular / React SPA (try_files)</option>
                      <option value="wordpress">WordPress</option>
                      <option value="laravel">Laravel</option>
                      <option value="typecho">Typecho</option>
                    </select>
                  </div>
                  <div class="m3-field">
                    <label for="site-edit-proxy">反向代理目标地址 (可选)</label>
                    <input
                      id="site-edit-proxy"
                      type="text"
                      [(ngModel)]="activeSite()!.proxy_pass"
                      (ngModelChange)="manageDirty.set(true)"
                      placeholder="http://127.0.0.1:3000"
                    />
                  </div>
                </div>
                <div style="display: flex; gap: 20px">
                  <mat-slide-toggle
                    [(ngModel)]="activeSite()!.proxy_enabled"
                    (change)="manageDirty.set(true)"
                  >
                    启用反向代理
                  </mat-slide-toggle>
                  <mat-slide-toggle
                    [(ngModel)]="activeSite()!.grpc_enabled"
                    (change)="manageDirty.set(true)"
                  >
                    原生 gRPC 模式
                  </mat-slide-toggle>
                </div>
                <div style="display: flex; justify-content: flex-end; gap: 10px">
                  <button
                    type="button"
                    mat-flat-button
                    color="primary"
                    [disabled]="savingManage()"
                    (click)="saveSiteSettings()"
                  >
                    {{ savingManage() ? '正在保存并校验 Nginx...' : '保存站点设置' }}
                  </button>
                </div>
              </div>
            </mat-tab>

            <mat-tab label="SSL / HTTPS 证书">
              <div style="padding: 16px 0; display: flex; flex-direction: column; gap: 12px">
                <div style="display: flex; gap: 20px">
                  <mat-slide-toggle
                    [(ngModel)]="sslForm.ssl_enabled"
                    (change)="manageDirty.set(true)"
                  >
                    启用 HTTPS
                  </mat-slide-toggle>
                  <mat-slide-toggle
                    [(ngModel)]="sslForm.ssl_force_https"
                    (change)="manageDirty.set(true)"
                  >
                    301 强制跳转 HTTPS
                  </mat-slide-toggle>
                </div>
                <div class="m3-field">
                  <label for="site-ssl-cert">PEM 证书链 (Fullchain PEM)</label>
                  <textarea
                    id="site-ssl-cert"
                    rows="5"
                    [(ngModel)]="sslForm.cert"
                    (ngModelChange)="manageDirty.set(true)"
                    placeholder="-----BEGIN CERTIFICATE-----"
                  ></textarea>
                </div>
                <div class="m3-field">
                  <label for="site-ssl-key">PEM 私钥 (Private Key PEM · 不会缓存至本地草稿)</label>
                  <textarea
                    id="site-ssl-key"
                    rows="5"
                    [(ngModel)]="sslForm.key"
                    (ngModelChange)="manageDirty.set(true)"
                    placeholder="-----BEGIN PRIVATE KEY-----"
                  ></textarea>
                </div>
                <div style="display: flex; justify-content: flex-end">
                  <button
                    type="button"
                    mat-flat-button
                    color="primary"
                    [disabled]="savingManage()"
                    (click)="saveSiteSSL()"
                  >
                    {{ savingManage() ? '正在部署 SSL...' : '保存并部署 SSL' }}
                  </button>
                </div>
              </div>
            </mat-tab>

            <mat-tab label="Nginx 原始配置文件">
              <div style="padding: 16px 0; display: flex; flex-direction: column; gap: 12px">
                <div class="m3-field">
                  <label for="site-raw-nginx">
                    Nginx 虚拟主机配置 (保存时自动执行 nginx -t 校验，失败自动回滚)
                  </label>
                  <textarea
                    id="site-raw-nginx"
                    rows="12"
                    [(ngModel)]="rawNginxConf"
                    (ngModelChange)="manageDirty.set(true)"
                  ></textarea>
                </div>
                <div style="display: flex; justify-content: flex-end">
                  <button
                    type="button"
                    mat-flat-button
                    color="primary"
                    [disabled]="savingManage()"
                    (click)="saveNginxConf()"
                  >
                    {{ savingManage() ? '正在校验语法并重载...' : '保存并重载 Nginx' }}
                  </button>
                </div>
              </div>
            </mat-tab>

            <mat-tab label="站点日志">
              <div style="padding: 16px 0; display: flex; flex-direction: column; gap: 12px">
                <div style="display: flex; gap: 10px">
                  <button type="button" mat-stroked-button (click)="loadSiteLogs('access')">
                    访问日志 (Access)
                  </button>
                  <button type="button" mat-stroked-button (click)="loadSiteLogs('error')">
                    错误日志 (Error)
                  </button>
                </div>
                <pre class="m3-code-console">{{ siteLogs.join('\n') || '暂无日志输出' }}</pre>
              </div>
            </mat-tab>
          </mat-tab-group>
        </div>
      </ag-modal>
    </div>
  `,
})
export class SitesComponent implements OnInit, HasUnsavedChanges {
  readonly router = inject(Router)
  private route = inject(ActivatedRoute)
  private toast = inject(ToastService)
  private confirm = inject(ConfirmService)

  readonly sites = signal<SiteItem[]>([])
  readonly loading = signal<boolean>(false)
  readonly loadError = signal<string | null>(null)
  readonly lastUpdated = signal<string | null>(null)

  readonly nginxInstalled = signal<boolean>(true)
  readonly installedPhpVersions = signal<string[]>([])

  readonly showCreateModal = signal(false)
  readonly createFormDirty = signal(false)
  readonly draftRestored = signal(false)
  readonly creating = signal(false)
  readonly createSubmitError = signal<string | null>(null)
  readonly createErrors = signal<Record<string, string>>({})
  readonly lastCreatedDomain = signal<string | null>(null)

  readonly activeSite = signal<SiteItem | null>(null)
  readonly manageDirty = signal(false)
  readonly savingManage = signal(false)
  readonly manageError = signal<string | null>(null)

  searchQuery = ''
  statusFilter = 'all'
  modeFilter = 'all'

  createForm: CreateSiteParams = {
    domain: '',
    port: 80,
    php_version: 'static',
    path: '',
    proxy_enabled: false,
    proxy_pass: '',
    grpc_enabled: false,
    rewrite_preset: 'spa',
  }

  sslForm = { ssl_enabled: false, ssl_force_https: false, cert: '', key: '' }
  rawNginxConf = ''
  siteLogs: string[] = []

  readonly phpOptions = computed(() => {
    const installed = this.installedPhpVersions()
    const list = [
      { value: 'php83', ver: '8.3', label: 'PHP 8.3 (FastCGI Unix Socket)' },
      { value: 'php82', ver: '8.2', label: 'PHP 8.2 (FastCGI Unix Socket)' },
      { value: 'php81', ver: '8.1', label: 'PHP 8.1 (FastCGI Unix Socket)' },
      { value: 'php74', ver: '7.4', label: 'PHP 7.4 (FastCGI Unix Socket)' },
    ]
    return list.map((item) => ({
      ...item,
      installed: installed.includes(item.ver),
    }))
  })

  hasUnsavedChanges(): boolean {
    return (this.showCreateModal() && this.createFormDirty()) || (!!this.activeSite() && this.manageDirty())
  }

  ngOnInit() {
    const qp = this.route.snapshot.queryParamMap
    if (qp.get('q')) this.searchQuery = qp.get('q') || ''
    if (qp.get('status')) this.statusFilter = qp.get('status') || 'all'
    if (qp.get('mode')) this.modeFilter = qp.get('mode') || 'all'

    this.loadSites()
    this.loadCapabilities()
  }

  syncUrlParams() {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: this.searchQuery.trim() || null,
        status: this.statusFilter === 'all' ? null : this.statusFilter,
        mode: this.modeFilter === 'all' ? null : this.modeFilter,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    })
  }

  clearFilters() {
    this.searchQuery = ''
    this.statusFilter = 'all'
    this.modeFilter = 'all'
    this.syncUrlParams()
  }

  filteredSites(): SiteItem[] {
    const q = this.searchQuery.trim().toLowerCase()
    return this.sites().filter((s) => {
      if (this.statusFilter !== 'all' && s.status !== this.statusFilter) return false
      if (this.modeFilter === 'static' && (s.proxy_enabled || s.php_version !== 'static')) return false
      if (this.modeFilter === 'proxy' && !s.proxy_enabled && s.php_version !== 'proxy') return false
      if (this.modeFilter === 'php' && (s.proxy_enabled || s.php_version === 'static' || s.php_version === 'proxy'))
        return false
      if (!q) return true
      return (
        s.domain.toLowerCase().includes(q) ||
        String(s.port || 80).includes(q) ||
        (s.path || '').toLowerCase().includes(q) ||
        (s.proxy_pass || '').toLowerCase().includes(q)
      )
    })
  }

  async loadCapabilities() {
    try {
      const res = await appStoreApi.getMarketList()
      const list = res.data?.data?.list || []
      const nginx = list.find((a) => a.key === 'nginx')
      if (nginx) {
        this.nginxInstalled.set(nginx.status === 'installed')
      }
      const php = list.find((a) => a.key === 'php')
      if (php && Array.isArray(php.installed_versions)) {
        this.installedPhpVersions.set(php.installed_versions)
      }
    } catch {}
  }

  async loadSites() {
    this.loading.set(true)
    this.loadError.set(null)
    try {
      const res = await siteApi.getSites(1, 100)
      this.sites.set(res.data?.data?.list || [])
      const now = new Date()
      this.lastUpdated.set(
        `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
      )
    } catch (e: any) {
      this.loadError.set(e?.message || '读取站点列表失败')
      this.toast.error(e.message)
    } finally {
      this.loading.set(false)
    }
  }

  formatMode(site: SiteItem) {
    if (site.proxy_enabled || site.php_version === 'proxy') return '反向代理'
    if (site.php_version === 'static') return '纯静态 / SPA'
    return site.php_version.toUpperCase()
  }

  isSelectedPhpMissing(phpVal: string): boolean {
    if (!phpVal || phpVal === 'static' || phpVal === 'proxy') return false
    const opt = this.phpOptions().find((p) => p.value === phpVal)
    return Boolean(opt && !opt.installed)
  }

  openCreateModal() {
    this.createSubmitError.set(null)
    this.createErrors.set({})
    try {
      const saved = sessionStorage.getItem(SITE_DRAFT_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed && (parsed.domain || parsed.proxy_pass || parsed.path)) {
          this.createForm = {
            domain: parsed.domain || '',
            port: parsed.port || 80,
            php_version: parsed.php_version || 'static',
            path: parsed.path || '',
            proxy_enabled: Boolean(parsed.proxy_enabled),
            proxy_pass: parsed.proxy_pass || '',
            grpc_enabled: Boolean(parsed.grpc_enabled),
            rewrite_preset: parsed.rewrite_preset || 'spa',
          }
          this.createFormDirty.set(true)
          this.draftRestored.set(true)
          this.showCreateModal.set(true)
          return
        }
      }
    } catch {}
    this.resetCreateForm()
    this.showCreateModal.set(true)
  }

  resetCreateForm() {
    this.createForm = {
      domain: '',
      port: 80,
      php_version: 'static',
      path: '',
      proxy_enabled: false,
      proxy_pass: '',
      grpc_enabled: false,
      rewrite_preset: 'spa',
    }
    this.createFormDirty.set(false)
    this.draftRestored.set(false)
    this.createErrors.set({})
    this.createSubmitError.set(null)
    try {
      sessionStorage.removeItem(SITE_DRAFT_KEY)
    } catch {}
  }

  onCreateFieldChange() {
    this.createFormDirty.set(true)
    this.createSubmitError.set(null)
    try {
      sessionStorage.setItem(SITE_DRAFT_KEY, JSON.stringify(this.createForm))
    } catch {}
  }

  onPhpModeChange() {
    this.createForm.proxy_enabled = this.createForm.php_version === 'proxy'
    this.onCreateFieldChange()
  }

  validateCreateForm(): boolean {
    const errs: Record<string, string> = {}
    const domain = (this.createForm.domain || '').trim()
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
    if (!domain) {
      errs['domain'] = '请输入主域名（如 example.com）'
    } else if (!domainRegex.test(domain)) {
      errs['domain'] = '域名格式不合法，请勿包含协议前缀或斜杠'
    }

    const port = Number(this.createForm.port)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      errs['port'] = '监听端口必须为 1 ~ 65535 之间的整数'
    }

    const currentPath = (this.createForm.path || '').trim()
    if (!this.createForm.proxy_enabled && currentPath) {
      if (!currentPath.startsWith('/')) {
        errs['path'] = '网站根目录必须是以 / 开头的绝对路径'
      }
    }

    if (this.createForm.proxy_enabled) {
      const proxy = (this.createForm.proxy_pass || '').trim()
      if (!proxy) {
        errs['proxy_pass'] = '启用反向代理时必须填写后端目标地址'
      } else if (!/^(https?|grpcs?|wss?):\/\/[^\s/$.?#].[^\s]*$/i.test(proxy)) {
        errs['proxy_pass'] = '目标地址需以 http://, https://, grpc:// 或 ws:// 开头'
      }
    }

    this.createErrors.set(errs)
    return Object.keys(errs).length === 0
  }

  async closeCreateModalWithGuard() {
    if (!this.createFormDirty()) {
      this.showCreateModal.set(false)
      return
    }
    const res = await this.confirm.ask({
      title: '放弃未提交的站点草稿？',
      message: '当前站点创建表单已有输入内容，关闭并清空将丢弃这些修改。',
      impact: '若您只是想稍后继续填写，也可以直接保留草稿。',
      confirmText: '放弃并清空草稿',
      cancelText: '继续编辑',
      tone: 'warning',
    })
    if (res.confirmed) {
      this.resetCreateForm()
      this.showCreateModal.set(false)
    }
  }

  async handleCreateSite() {
    if (this.creating()) return
    if (!this.validateCreateForm()) {
      const firstErrKey = Object.keys(this.createErrors())[0]
      const mapId: Record<string, string> = {
        domain: 'site-create-domain',
        port: 'site-create-port',
        path: 'site-create-path',
        proxy_pass: 'site-create-proxy',
      }
      const el = document.getElementById(mapId[firstErrKey] || '')
      el?.focus()
      return
    }

    this.creating.set(true)
    this.createSubmitError.set(null)
    try {
      const createdDomain = this.createForm.domain.trim()
      await siteApi.createSite({
        ...this.createForm,
        domain: createdDomain,
      })
      this.lastCreatedDomain.set(createdDomain)
      this.resetCreateForm()
      this.showCreateModal.set(false)
      this.toast.success(`站点 ${createdDomain} 创建成功`)
      await this.loadSites()
    } catch (e: any) {
      this.createSubmitError.set(e?.message || '创建站点失败，请检查 Nginx 配置或端口占用')
      this.toast.error(e.message)
    } finally {
      this.creating.set(false)
    }
  }

  async openManageModal(site: SiteItem) {
    this.activeSite.set({ ...site })
    this.manageDirty.set(false)
    this.manageError.set(null)
    try {
      const [confRes, sslRes, logRes] = await Promise.all([
        siteApi.getSiteConfig(site.id),
        siteApi.getSiteSSL(site.id),
        siteApi.getSiteLogs(site.id, 'access'),
      ])
      this.rawNginxConf = confRes.data?.data?.nginx_conf || ''
      if (sslRes.data?.data) {
        this.sslForm = {
          ssl_enabled: sslRes.data.data.ssl_enabled,
          ssl_force_https: sslRes.data.data.ssl_force_https,
          cert: sslRes.data.data.cert || '',
          key: sslRes.data.data.key || '',
        }
      }
      this.siteLogs = logRes.data?.data?.logs || []
    } catch (e: any) {
      this.manageError.set(e?.message || '读取站点详细配置失败')
    }
  }

  async saveSiteSettings() {
    const s = this.activeSite()
    if (!s || this.savingManage()) return
    this.savingManage.set(true)
    this.manageError.set(null)
    try {
      await siteApi.updateSiteSettings(s.id, s)
      this.manageDirty.set(false)
      this.toast.success('站点配置已通过校验并更新')
      this.loadSites()
    } catch (e: any) {
      this.manageError.set(e?.message || '保存站点设置失败')
      this.toast.error(e.message)
    } finally {
      this.savingManage.set(false)
    }
  }

  async saveSiteSSL() {
    const s = this.activeSite()
    if (!s || this.savingManage()) return
    this.savingManage.set(true)
    this.manageError.set(null)
    try {
      await siteApi.saveSiteSSL(s.id, this.sslForm)
      this.manageDirty.set(false)
      this.toast.success('SSL 证书配置已生效')
      this.loadSites()
    } catch (e: any) {
      this.manageError.set(e?.message || '部署 SSL 证书失败')
      this.toast.error(e.message)
    } finally {
      this.savingManage.set(false)
    }
  }

  async saveNginxConf() {
    const s = this.activeSite()
    if (!s || this.savingManage()) return
    this.savingManage.set(true)
    this.manageError.set(null)
    try {
      await siteApi.saveSiteConfig(s.id, this.rawNginxConf)
      this.manageDirty.set(false)
      this.toast.success('Nginx 配置已通过预检并热重载')
    } catch (e: any) {
      this.manageError.set(e?.message || 'Nginx 配置语法校验未通过，已自动回滚')
      this.toast.error(e.message)
    } finally {
      this.savingManage.set(false)
    }
  }

  async loadSiteLogs(type: 'access' | 'error') {
    const s = this.activeSite()
    if (!s) return
    try {
      const res = await siteApi.getSiteLogs(s.id, type)
      this.siteLogs = res.data?.data?.logs || []
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async toggleStatus(site: SiteItem) {
    try {
      await siteApi.toggleSite(site.id)
      this.toast.success(`站点 ${site.domain} 状态已切换`)
      this.loadSites()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async deleteSite(site: SiteItem) {
    const res = await this.confirm.ask({
      title: '删除网站与反向代理配置',
      resourceName: `${site.domain} (端口 :${site.port || 80})`,
      message: `确定要删除站点 ${site.domain} 的 Nginx 虚拟主机配置吗？`,
      impact: `默认仅移除 Nginx 站点配置文件并重载服务，保留网站根目录 (${site.path}) 下的网页源码。若勾选下方选项，将同时永久删除根目录文件。`,
      checkboxLabel: `同时彻底删除站点根目录文件 (${site.path})`,
      checkboxDefault: false,
      confirmText: '确认删除站点',
      tone: 'danger',
    })
    if (!res.confirmed) return

    try {
      await siteApi.deleteSite(site.id, res.checkboxChecked)
      this.toast.success(`站点 ${site.domain} 已删除`)
      this.loadSites()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }
}
