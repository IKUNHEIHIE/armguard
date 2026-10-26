import { Component, OnInit, computed, inject, signal } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { AgMaterialModule } from '../../core/material.module'
import { ToastService } from '../../core/toast.service'
import { ConfirmService } from '../../core/confirm.service'
import { AgStateBannerComponent } from '../../components/ag-state-banner.component'
import { AgModalComponent } from '../../components/ag-modal.component'
import { sslApi, SSLCertificate, SSLCertDetail, ApplyCertParams, UploadCertParams } from '@/api/ssl'
import { siteApi, SiteItem } from '@/api/site'

@Component({
  selector: 'ag-ssl',
  standalone: true,
  imports: [AgMaterialModule, AgStateBannerComponent, AgModalComponent],
  template: `
    <div class="m3-page">
      <div class="m3-page-header">
        <div>
          <h2 class="m3-page-title">
            <mat-icon style="color: var(--ag-primary)">verified_user</mat-icon>
            <span>ACME / Let's Encrypt SSL 证书中心</span>
          </h2>
          <p class="m3-page-subtitle font-mono">
            Certbot HTTP-01 / DNS-01 自动签发、OpenSSL X.509 物理证书解析、Nginx 一键部署与到期自动续签
          </p>
        </div>
        <div class="m3-page-actions">
          <button mat-stroked-button (click)="openUploadModal()">
            <mat-icon>upload_file</mat-icon>
            <span>上传自有 PEM 证书</span>
          </button>
          <button mat-flat-button color="primary" (click)="openApplyModal()">
            <mat-icon>add_moderator</mat-icon>
            <span>申请免费 ACME 证书</span>
          </button>
        </div>
      </div>

      <!-- Filter Bar (FE-011) -->
      <div class="m3-filter-bar font-mono">
        <div class="search-box">
          <mat-icon>search</mat-icon>
          <input
            type="search"
            [ngModel]="searchQuery()"
            (ngModelChange)="onSearchChange($event)"
            placeholder="搜索主域名、SANs 别名或颁发者..."
            aria-label="搜索 SSL 证书"
          />
        </div>
      </div>

      <!-- State Banners (FE-001) -->
      <ag-state-banner
        *ngIf="loading() && certs().length === 0"
        state="loading"
        title="正在加载 SSL 证书列表..."
      />

      <ag-state-banner
        *ngIf="loadError()"
        state="error"
        title="证书列表加载失败"
        [description]="loadError()!"
        primaryActionLabel="重试刷新"
        (primaryAction)="loadCerts()"
      />

      <!-- Table Card -->
      <div class="m3-card" *ngIf="!loadError()">
        <div class="m3-table-wrap font-mono">
          <table class="m3-data-table" aria-label="SSL 证书列表">
            <thead>
              <tr>
                <th>主域名 / SANs ({{ filteredCerts().length }}/{{ certs().length }})</th>
                <th>颁发机构 (Issuer)</th>
                <th>到期时间</th>
                <th>剩余天数</th>
                <th>已部署站点</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let cert of filteredCerts()">
                <td>
                  <strong>{{ cert.domain }}</strong>
                  <div *ngIf="cert.sans && cert.sans.length" style="font-size: 0.7rem; color: var(--ag-on-surface-variant)">
                    SANs: {{ cert.sans.join(', ') }}
                  </div>
                </td>
                <td>{{ cert.issuer }}</td>
                <td>{{ cert.expires_at }}</td>
                <td>
                  <span
                    class="m3-badge"
                    [ngClass]="cert.days_remaining > 15 ? 'success' : cert.days_remaining > 0 ? 'warning' : 'danger'"
                  >
                    {{ cert.days_remaining }} 天
                  </span>
                </td>
                <td>
                  <span *ngIf="cert.deployed_sites && cert.deployed_sites.length" class="m3-badge primary">
                    {{ cert.deployed_sites.join(', ') }}
                  </span>
                  <span *ngIf="!cert.deployed_sites || !cert.deployed_sites.length" class="m3-badge neutral">未部署</span>
                </td>
                <td>
                  <button mat-button color="primary" (click)="openDetail(cert)">详情</button>
                  <button mat-button color="primary" (click)="openDeploy(cert)">部署到站点</button>
                  <button mat-button (click)="renewCert(cert)">续签</button>
                  <button mat-button color="warn" (click)="confirmDeleteCert(cert)">删除</button>
                </td>
              </tr>
              <tr *ngIf="filteredCerts().length === 0 && !loading()">
                <td colspan="6" class="m3-empty-state">
                  {{ searchQuery() ? '未检索到匹配的 SSL 证书。' : '暂无 SSL 证书，点击右上角「申请免费 ACME 证书」或「上传自有 PEM 证书」。' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Apply ACME Modal (FE-002, FE-004) -->
      <ag-modal
        [open]="showApplyModal()"
        title="申请 Let's Encrypt / ZeroSSL 免费证书"
        icon="add_moderator"
        [submitting]="submitting()"
        (closed)="showApplyModal.set(false)"
      >
        <div class="font-mono" style="display: flex; flex-direction: column; gap: 14px">
          <div class="m3-grid-2">
            <div class="m3-field" [class.has-error]="!!applyDomainError()">
              <label for="apply-domain-input">申请主域名 <span class="m3-req">*</span></label>
              <input
                id="apply-domain-input"
                type="text"
                [(ngModel)]="applyForm.domain"
                (ngModelChange)="applyDomainError.set('')"
                placeholder="panel.example.com"
              />
              <div *ngIf="applyDomainError()" class="m3-field-error" role="alert">{{ applyDomainError() }}</div>
            </div>
            <div class="m3-field" [class.has-error]="!!applyEmailError()">
              <label for="apply-email-input">通知邮箱 (ACME Email) <span class="m3-req">*</span></label>
              <input
                id="apply-email-input"
                type="email"
                [(ngModel)]="applyForm.email"
                (ngModelChange)="applyEmailError.set('')"
                placeholder="admin@example.com"
              />
              <div *ngIf="applyEmailError()" class="m3-field-error" role="alert">{{ applyEmailError() }}</div>
            </div>
            <div class="m3-field">
              <label for="apply-ca-provider">CA 签发机构</label>
              <select id="apply-ca-provider" [(ngModel)]="applyForm.provider">
                <option value="letsencrypt">Let's Encrypt (官方 ACME)</option>
                <option value="zerossl">ZeroSSL</option>
              </select>
            </div>
            <div class="m3-field">
              <label for="apply-challenge-type">验证方式 (Challenge)</label>
              <select id="apply-challenge-type" [(ngModel)]="applyForm.challenge_type">
                <option value="http-01">HTTP-01 文件穿透验证</option>
                <option value="dns-01">DNS-01 API 自动解析</option>
              </select>
            </div>
          </div>
        </div>
        <div modal-footer>
          <button mat-stroked-button (click)="showApplyModal.set(false)" [disabled]="submitting()">取消</button>
          <button mat-flat-button color="primary" [disabled]="submitting()" (click)="handleApply()">
            {{ submitting() ? '正在签发验证中...' : '立即签发' }}
          </button>
        </div>
      </ag-modal>

      <!-- Upload Custom Cert Modal (FE-002, FE-004) -->
      <ag-modal
        [open]="showUploadModal()"
        title="上传自有 PEM 证书与私钥"
        icon="upload_file"
        [submitting]="submitting()"
        (closed)="showUploadModal.set(false)"
      >
        <div class="font-mono" style="display: flex; flex-direction: column; gap: 14px">
          <div class="m3-field" [class.has-error]="!!uploadDomainError()">
            <label for="upload-cert-domain">证书关联域名 <span class="m3-req">*</span></label>
            <input
              id="upload-cert-domain"
              type="text"
              [(ngModel)]="uploadForm.domain"
              (ngModelChange)="uploadDomainError.set('')"
              placeholder="example.com"
            />
            <div *ngIf="uploadDomainError()" class="m3-field-error" role="alert">{{ uploadDomainError() }}</div>
          </div>
          <div class="m3-field" [class.has-error]="!!uploadCertError()">
            <label for="upload-cert-fullchain">PEM 证书内容 (Fullchain) <span class="m3-req">*</span></label>
            <textarea
              id="upload-cert-fullchain"
              rows="5"
              [(ngModel)]="uploadForm.certificate"
              (ngModelChange)="uploadCertError.set('')"
              placeholder="-----BEGIN CERTIFICATE-----"
            ></textarea>
            <div *ngIf="uploadCertError()" class="m3-field-error" role="alert">{{ uploadCertError() }}</div>
          </div>
          <div class="m3-field" [class.has-error]="!!uploadKeyError()">
            <label for="upload-cert-key">PEM 私钥内容 (Private Key) <span class="m3-req">*</span></label>
            <textarea
              id="upload-cert-key"
              rows="5"
              [(ngModel)]="uploadForm.private_key"
              (ngModelChange)="uploadKeyError.set('')"
              placeholder="-----BEGIN PRIVATE KEY-----"
            ></textarea>
            <div *ngIf="uploadKeyError()" class="m3-field-error" role="alert">{{ uploadKeyError() }}</div>
          </div>
        </div>
        <div modal-footer>
          <button mat-stroked-button (click)="showUploadModal.set(false)" [disabled]="submitting()">取消</button>
          <button mat-flat-button color="primary" [disabled]="submitting()" (click)="handleUpload()">
            {{ submitting() ? '校验入库中...' : '保存并入库' }}
          </button>
        </div>
      </ag-modal>

      <!-- Deploy to Site Modal (FE-002) -->
      <ag-modal
        [open]="!!deployingCert()"
        [title]="'部署证书 ' + (deployingCert()?.domain || '') + ' 到 Nginx 站点'"
        icon="dns"
        [submitting]="submitting()"
        (closed)="deployingCert.set(null)"
      >
        <div class="font-mono" style="display: flex; flex-direction: column; gap: 14px">
          <div class="m3-field">
            <label for="deploy-target-site">选择目标网站</label>
            <select id="deploy-target-site" [(ngModel)]="targetSiteId">
              <option *ngFor="let s of sites()" [ngValue]="s.id">{{ s.domain }} (:{{ s.port || 80 }})</option>
            </select>
          </div>
        </div>
        <div modal-footer>
          <button mat-stroked-button (click)="deployingCert.set(null)" [disabled]="submitting()">取消</button>
          <button mat-flat-button color="primary" [disabled]="submitting() || !targetSiteId" (click)="confirmDeploy()">
            {{ submitting() ? '正在配置重载...' : '立即部署' }}
          </button>
        </div>
      </ag-modal>

      <!-- Detail Modal (FE-002) -->
      <ag-modal
        [open]="!!detailCert()"
        [title]="'X.509 证书详情: ' + (detailCert()?.domain || '')"
        icon="security"
        size="lg"
        (closed)="detailCert.set(null)"
      >
        <div class="font-mono" *ngIf="detailCert()" style="display: flex; flex-direction: column; gap: 12px">
          <div class="m3-tonal-card" style="display: flex; flex-direction: column; gap: 6px">
            <div>证书路径: <code>{{ detailCert()!.cert_path }}</code></div>
            <div>私钥路径: <code>{{ detailCert()!.key_path }}</code></div>
            <div>签发者: <strong>{{ detailCert()!.issuer }}</strong> | 到期时间: <strong>{{ detailCert()!.expires_at }}</strong></div>
          </div>
          <div class="m3-field">
            <label for="detail-cert-fullchain">Fullchain PEM 证书内容</label>
            <textarea id="detail-cert-fullchain" rows="6" readonly [ngModel]="detailCert()!.fullchain"></textarea>
          </div>
        </div>
        <div modal-footer>
          <button mat-stroked-button (click)="detailCert.set(null)">关闭</button>
        </div>
      </ag-modal>
    </div>
  `,
})
export class SslComponent implements OnInit {
  private toast = inject(ToastService)
  private confirmSvc = inject(ConfirmService)
  private route = inject(ActivatedRoute)
  private router = inject(Router)

  readonly certs = signal<SSLCertificate[]>([])
  readonly sites = signal<SiteItem[]>([])
  readonly loading = signal(false)
  readonly loadError = signal<string | null>(null)
  readonly submitting = signal(false)

  readonly searchQuery = signal('')
  readonly showApplyModal = signal(false)
  readonly showUploadModal = signal(false)
  readonly deployingCert = signal<SSLCertificate | null>(null)
  readonly detailCert = signal<SSLCertDetail | null>(null)
  targetSiteId: number | null = null

  readonly applyDomainError = signal('')
  readonly applyEmailError = signal('')
  readonly uploadDomainError = signal('')
  readonly uploadCertError = signal('')
  readonly uploadKeyError = signal('')

  applyForm: ApplyCertParams = {
    domain: '',
    email: '',
    provider: 'letsencrypt',
    challenge_type: 'http-01',
  }

  uploadForm: UploadCertParams = {
    domain: '',
    certificate: '',
    private_key: '',
  }

  readonly filteredCerts = computed(() => {
    const q = this.searchQuery().trim().toLowerCase()
    return this.certs().filter((c) => {
      if (!q) return true
      const text = `${c.domain} ${(c.sans || []).join(' ')} ${c.issuer}`.toLowerCase()
      return text.includes(q)
    })
  })

  ngOnInit() {
    const qp = this.route.snapshot.queryParamMap
    if (qp.get('q')) this.searchQuery.set(qp.get('q')!)
    this.loadCerts()
    this.loadSites()
  }

  onSearchChange(q: string) {
    this.searchQuery.set(q)
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: q.trim() || null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    })
  }

  async loadCerts() {
    this.loading.set(true)
    this.loadError.set(null)
    try {
      const res = await sslApi.getCerts()
      this.certs.set(res.data?.data?.list || [])
    } catch (e: any) {
      const msg = e.message || '加载证书列表失败'
      this.loadError.set(msg)
      this.toast.error(msg)
    } finally {
      this.loading.set(false)
    }
  }

  async loadSites() {
    try {
      const res = await siteApi.getSites(1, 100)
      const list = res.data?.data?.list || []
      this.sites.set(list)
      if (list.length > 0) {
        this.targetSiteId = list[0].id
      }
    } catch {}
  }

  openApplyModal() {
    this.applyForm = {
      domain: '',
      email: '',
      provider: 'letsencrypt',
      challenge_type: 'http-01',
    }
    this.applyDomainError.set('')
    this.applyEmailError.set('')
    this.showApplyModal.set(true)
  }

  async handleApply() {
    if (!this.applyForm.domain.trim()) {
      this.applyDomainError.set('请输入申请域名')
      return
    }
    if (!this.applyForm.email.trim() || !this.applyForm.email.includes('@')) {
      this.applyEmailError.set('请输入合法的通知邮箱')
      return
    }
    this.submitting.set(true)
    try {
      await sslApi.applyCert(this.applyForm)
      this.toast.success(`ACME 证书 ${this.applyForm.domain} 签发成功`)
      this.showApplyModal.set(false)
      this.loadCerts()
    } catch (e: any) {
      this.toast.error(e.message)
    } finally {
      this.submitting.set(false)
    }
  }

  openUploadModal() {
    this.uploadForm = {
      domain: '',
      certificate: '',
      private_key: '',
    }
    this.uploadDomainError.set('')
    this.uploadCertError.set('')
    this.uploadKeyError.set('')
    this.showUploadModal.set(true)
  }

  async handleUpload() {
    if (!this.uploadForm.domain.trim()) {
      this.uploadDomainError.set('请输入证书域名')
      return
    }
    if (!this.uploadForm.certificate.trim() || !this.uploadForm.certificate.includes('CERTIFICATE')) {
      this.uploadCertError.set('请输入合法的 PEM 格式证书内容')
      return
    }
    if (!this.uploadForm.private_key.trim() || !this.uploadForm.private_key.includes('PRIVATE KEY')) {
      this.uploadKeyError.set('请输入合法的 PEM 格式私钥内容')
      return
    }
    this.submitting.set(true)
    try {
      await sslApi.uploadCert(this.uploadForm)
      this.toast.success('PEM 证书上传成功')
      this.showUploadModal.set(false)
      this.loadCerts()
    } catch (e: any) {
      this.toast.error(e.message)
    } finally {
      this.submitting.set(false)
    }
  }

  async openDetail(cert: SSLCertificate) {
    try {
      const res = await sslApi.getCertDetail(cert.id)
      if (res.data?.data) this.detailCert.set(res.data.data)
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  openDeploy(cert: SSLCertificate) {
    this.deployingCert.set(cert)
  }

  async confirmDeploy() {
    const c = this.deployingCert()
    if (!c || !this.targetSiteId) return
    this.submitting.set(true)
    try {
      await sslApi.deployCertToSite(c.id, this.targetSiteId)
      this.toast.success('证书已部署至目标 Nginx 站点')
      this.deployingCert.set(null)
      this.loadCerts()
    } catch (e: any) {
      this.toast.error(e.message)
    } finally {
      this.submitting.set(false)
    }
  }

  async renewCert(cert: SSLCertificate) {
    try {
      await sslApi.renewCert(cert.id)
      this.toast.success(`证书 ${cert.domain} 续签成功`)
      this.loadCerts()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async confirmDeleteCert(cert: SSLCertificate) {
    const res = await this.confirmSvc.ask({
      title: '删除 SSL 证书确认',
      resourceName: `${cert.domain} (${cert.issuer})`,
      message: `确定要删除证书 ${cert.domain} 吗？`,
      impact: '如果该证书已被部署到网站，站点可能无法继续支持 HTTPS 访问。',
      confirmText: '确认删除',
      severity: 'danger',
    })
    if (!res.confirmed) return

    try {
      await sslApi.deleteCert(cert.id)
      this.toast.success('证书已删除')
      this.loadCerts()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }
}
