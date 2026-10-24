import { Component, OnInit, inject, signal } from '@angular/core'
import { AgMaterialModule } from '../../core/material.module'
import { ToastService } from '../../core/toast.service'
import { siteApi, SiteItem, CreateSiteParams } from '@/api/site'

@Component({
  selector: 'ag-sites',
  standalone: true,
  imports: [AgMaterialModule],
  template: `
    <div class="m3-page">
      <div class="m3-page-header">
        <div>
          <h2 class="m3-page-title">
            <mat-icon style="color: var(--ag-primary)">language</mat-icon>
            <span>网站与七层反向代理编排 (Web Hosting & gRPC)</span>
          </h2>
          <p class="m3-page-subtitle font-mono">
            Nginx IPv4/IPv6 双栈虚拟主机、PHP 多版本热切换、WebSocket 与原生 HTTP/2 gRPC 微服务网关
          </p>
        </div>
        <div class="m3-page-actions">
          <button mat-stroked-button (click)="loadSites()">
            <mat-icon>refresh</mat-icon>
            <span>刷新列表</span>
          </button>
          <button mat-flat-button color="primary" (click)="openCreateModal()">
            <mat-icon>add</mat-icon>
            <span>新建站点 / 反代</span>
          </button>
        </div>
      </div>

      <div class="m3-card">
        <div class="m3-table-wrap font-mono">
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
              <tr *ngFor="let site of sites()">
                <td>
                  <strong>{{ site.domain }}</strong>
                  <div *ngIf="site.domains?.length" style="font-size: 0.7rem; color: var(--ag-on-surface-variant)">
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
                    {{ site.status === 'running' ? '运行中' : '已停用' }}
                  </span>
                </td>
                <td>
                  <button mat-button color="primary" (click)="openManageModal(site)">配置</button>
                  <button mat-button (click)="toggleStatus(site)">
                    {{ site.status === 'running' ? '停用' : '启用' }}
                  </button>
                  <button mat-button color="warn" (click)="deleteSite(site)">删除</button>
                </td>
              </tr>
              <tr *ngIf="sites().length === 0">
                <td colspan="7" class="m3-empty-state">
                  暂无网站或反向代理站点，点击右上角「新建站点 / 反代」立即创建。
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Create Site Modal -->
      <div *ngIf="showCreateModal()" class="m3-modal-backdrop" (click)="showCreateModal.set(false)">
        <div class="m3-modal-dialog" (click)="$event.stopPropagation()">
          <div class="m3-modal-header">
            <h3>
              <mat-icon style="color: var(--ag-primary)">add_circle</mat-icon>
              <span>新建 Nginx 双栈站点 / 反向代理</span>
            </h3>
            <button mat-icon-button (click)="showCreateModal.set(false)">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <div class="m3-modal-body font-mono">
            <div class="m3-grid-2">
              <div class="m3-field">
                <label>主域名 (Domain)</label>
                <input type="text" [(ngModel)]="createForm.domain" placeholder="example.com" />
              </div>
              <div class="m3-field">
                <label>监听端口 (Port)</label>
                <input type="number" [(ngModel)]="createForm.port" placeholder="80" />
              </div>
            </div>

            <div class="m3-field">
              <label>站点运行环境 / 代理类型</label>
              <select [(ngModel)]="createForm.php_version" (change)="onPhpModeChange()">
                <option value="static">纯静态 / HTML / SPA 单页应用</option>
                <option value="php83">PHP 8.3 (FastCGI Unix Socket)</option>
                <option value="php82">PHP 8.2 (FastCGI Unix Socket)</option>
                <option value="php81">PHP 8.1 (FastCGI Unix Socket)</option>
                <option value="php74">PHP 7.4 (FastCGI Unix Socket)</option>
                <option value="proxy">七层 HTTP / WebSocket / gRPC 反向代理</option>
              </select>
            </div>

            <div *ngIf="!createForm.proxy_enabled" class="m3-field">
              <label>网站根目录 (Document Root)</label>
              <input
                type="text"
                [(ngModel)]="createForm.path"
                [placeholder]="'/www/wwwroot/' + (createForm.domain || 'example.com')"
              />
            </div>

            <div *ngIf="createForm.proxy_enabled" class="m3-grid-2">
              <div class="m3-field">
                <label>后端目标地址 (Upstream URL / grpc://)</label>
                <input
                  type="text"
                  [(ngModel)]="createForm.proxy_pass"
                  placeholder="http://127.0.0.1:8080 或 grpc://127.0.0.1:50051"
                />
              </div>
              <div class="m3-field">
                <label>启用原生 gRPC HTTP/2 网关</label>
                <mat-slide-toggle [(ngModel)]="createForm.grpc_enabled">
                  开启 grpc_pass 模式
                </mat-slide-toggle>
              </div>
            </div>
          </div>
          <div class="m3-modal-footer">
            <button mat-stroked-button (click)="showCreateModal.set(false)">取消</button>
            <button mat-flat-button color="primary" (click)="handleCreateSite()">确认创建</button>
          </div>
        </div>
      </div>

      <!-- Site Settings & Config Modal -->
      <div *ngIf="activeSite()" class="m3-modal-backdrop" (click)="activeSite.set(null)">
        <div class="m3-modal-dialog lg" (click)="$event.stopPropagation()">
          <div class="m3-modal-header">
            <h3>
              <mat-icon style="color: var(--ag-primary)">settings</mat-icon>
              <span>站点管理: {{ activeSite()!.domain }}</span>
            </h3>
            <button mat-icon-button (click)="activeSite.set(null)">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <div class="m3-modal-body font-mono">
            <mat-tab-group animationDuration="160ms">
              <mat-tab label="基础与反代设置">
                <div style="padding: 16px 0; display: flex; flex-direction: column; gap: 14px">
                  <div class="m3-grid-2">
                    <div class="m3-field">
                      <label>网站根目录</label>
                      <input type="text" [(ngModel)]="activeSite()!.path" />
                    </div>
                    <div class="m3-field">
                      <label>PHP 运行时版本</label>
                      <select [(ngModel)]="activeSite()!.php_version">
                        <option value="static">纯静态 (Static)</option>
                        <option value="php83">PHP 8.3</option>
                        <option value="php82">PHP 8.2</option>
                        <option value="php81">PHP 8.1</option>
                        <option value="php74">PHP 7.4</option>
                        <option value="proxy">反向代理 (Reverse Proxy)</option>
                      </select>
                    </div>
                    <div class="m3-field">
                      <label>伪静态规则预设 (Rewrite)</label>
                      <select [(ngModel)]="activeSite()!.rewrite_preset">
                        <option value="none">不启用伪静态</option>
                        <option value="spa">Vue / Angular / React SPA (try_files)</option>
                        <option value="wordpress">WordPress</option>
                        <option value="laravel">Laravel</option>
                        <option value="typecho">Typecho</option>
                      </select>
                    </div>
                    <div class="m3-field">
                      <label>反向代理目标地址 (可选)</label>
                      <input type="text" [(ngModel)]="activeSite()!.proxy_pass" placeholder="http://127.0.0.1:3000" />
                    </div>
                  </div>
                  <div style="display: flex; gap: 20px">
                    <mat-slide-toggle [(ngModel)]="activeSite()!.proxy_enabled">启用反向代理</mat-slide-toggle>
                    <mat-slide-toggle [(ngModel)]="activeSite()!.grpc_enabled">原生 gRPC 模式</mat-slide-toggle>
                  </div>
                  <div>
                    <button mat-flat-button color="primary" (click)="saveSiteSettings()">保存站点设置</button>
                  </div>
                </div>
              </mat-tab>

              <mat-tab label="SSL / HTTPS 证书">
                <div style="padding: 16px 0; display: flex; flex-direction: column; gap: 12px">
                  <div style="display: flex; gap: 20px">
                    <mat-slide-toggle [(ngModel)]="sslForm.ssl_enabled">启用 HTTPS</mat-slide-toggle>
                    <mat-slide-toggle [(ngModel)]="sslForm.ssl_force_https">301 强制跳转 HTTPS</mat-slide-toggle>
                  </div>
                  <div class="m3-field">
                    <label>PEM 证书链 (Fullchain PEM)</label>
                    <textarea rows="5" [(ngModel)]="sslForm.cert" placeholder="-----BEGIN CERTIFICATE-----"></textarea>
                  </div>
                  <div class="m3-field">
                    <label>PEM 私钥 (Private Key PEM)</label>
                    <textarea rows="5" [(ngModel)]="sslForm.key" placeholder="-----BEGIN PRIVATE KEY-----"></textarea>
                  </div>
                  <div>
                    <button mat-flat-button color="primary" (click)="saveSiteSSL()">保存并部署 SSL</button>
                  </div>
                </div>
              </mat-tab>

              <mat-tab label="Nginx 原始配置文件">
                <div style="padding: 16px 0; display: flex; flex-direction: column; gap: 12px">
                  <div class="m3-field">
                    <label>Nginx 虚拟主机配置 (保存时自动执行 nginx -t 校验)</label>
                    <textarea rows="12" [(ngModel)]="rawNginxConf"></textarea>
                  </div>
                  <div>
                    <button mat-flat-button color="primary" (click)="saveNginxConf()">保存并重载 Nginx</button>
                  </div>
                </div>
              </mat-tab>

              <mat-tab label="站点日志">
                <div style="padding: 16px 0; display: flex; flex-direction: column; gap: 12px">
                  <div style="display: flex; gap: 10px">
                    <button mat-stroked-button (click)="loadSiteLogs('access')">访问日志 (Access)</button>
                    <button mat-stroked-button (click)="loadSiteLogs('error')">错误日志 (Error)</button>
                  </div>
                  <pre class="m3-code-console">{{ siteLogs.join('\n') || '暂无日志输出' }}</pre>
                </div>
              </mat-tab>
            </mat-tab-group>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class SitesComponent implements OnInit {
  private toast = inject(ToastService)
  readonly sites = signal<SiteItem[]>([])
  readonly showCreateModal = signal(false)
  readonly activeSite = signal<SiteItem | null>(null)

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

  ngOnInit() {
    this.loadSites()
  }

  async loadSites() {
    try {
      const res = await siteApi.getSites(1, 50)
      this.sites.set(res.data?.data?.list || [])
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  formatMode(site: SiteItem) {
    if (site.proxy_enabled || site.php_version === 'proxy') return 'Reverse Proxy'
    if (site.php_version === 'static') return 'Static / SPA'
    return site.php_version.toUpperCase()
  }

  openCreateModal() {
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
    this.showCreateModal.set(true)
  }

  onPhpModeChange() {
    this.createForm.proxy_enabled = this.createForm.php_version === 'proxy'
  }

  async handleCreateSite() {
    if (!this.createForm.domain.trim()) {
      this.toast.warning('请输入主域名')
      return
    }
    try {
      await siteApi.createSite(this.createForm)
      this.toast.success(`站点 ${this.createForm.domain} 创建成功`)
      this.showCreateModal.set(false)
      this.loadSites()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async openManageModal(site: SiteItem) {
    this.activeSite.set({ ...site })
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
    } catch {}
  }

  async saveSiteSettings() {
    const s = this.activeSite()
    if (!s) return
    try {
      await siteApi.updateSiteSettings(s.id, s)
      this.toast.success('站点配置已更新')
      this.loadSites()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async saveSiteSSL() {
    const s = this.activeSite()
    if (!s) return
    try {
      await siteApi.saveSiteSSL(s.id, this.sslForm)
      this.toast.success('SSL 证书配置已生效')
      this.loadSites()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async saveNginxConf() {
    const s = this.activeSite()
    if (!s) return
    try {
      await siteApi.saveSiteConfig(s.id, this.rawNginxConf)
      this.toast.success('Nginx 配置已通过预检并热重载')
    } catch (e: any) {
      this.toast.error(e.message)
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
      this.toast.success('站点状态已切换')
      this.loadSites()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async deleteSite(site: SiteItem) {
    if (!confirm(`确定要删除站点 ${site.domain} 吗？`)) return
    try {
      await siteApi.deleteSite(site.id, false)
      this.toast.success(`站点 ${site.domain} 已删除`)
      this.loadSites()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }
}
