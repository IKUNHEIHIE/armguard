import { Component, OnInit, inject, signal } from '@angular/core'
import { AgMaterialModule } from '../../core/material.module'
import { ToastService } from '../../core/toast.service'
import { sslApi, SSLCertificate, SSLCertDetail, ApplyCertParams, UploadCertParams } from '@/api/ssl'
import { siteApi, SiteItem } from '@/api/site'

@Component({
  selector: 'ag-ssl',
  standalone: true,
  imports: [AgMaterialModule],
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
          <button mat-stroked-button (click)="showUploadModal.set(true)">
            <mat-icon>upload_file</mat-icon>
            <span>上传自有 PEM 证书</span>
          </button>
          <button mat-flat-button color="primary" (click)="showApplyModal.set(true)">
            <mat-icon>add_moderator</mat-icon>
            <span>申请免费 ACME 证书</span>
          </button>
        </div>
      </div>

      <div class="m3-card">
        <div class="m3-table-wrap font-mono">
          <table class="m3-data-table">
            <thead>
              <tr>
                <th>主域名 / SANs</th>
                <th>颁发机构 (Issuer)</th>
                <th>到期时间</th>
                <th>剩余天数</th>
                <th>已部署站点</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let cert of certs()">
                <td>
                  <strong>{{ cert.domain }}</strong>
                  <div *ngIf="cert.sans.length" style="font-size: 0.7rem; color: var(--ag-on-surface-variant)">
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
                  <span *ngIf="cert.deployed_sites.length" class="m3-badge primary">
                    {{ cert.deployed_sites.join(', ') }}
                  </span>
                  <span *ngIf="!cert.deployed_sites.length" class="m3-badge neutral">未部署</span>
                </td>
                <td>
                  <button mat-button color="primary" (click)="openDetail(cert)">详情</button>
                  <button mat-button color="primary" (click)="openDeploy(cert)">部署到站点</button>
                  <button mat-button (click)="renewCert(cert)">续签</button>
                  <button mat-button color="warn" (click)="deleteCert(cert)">删除</button>
                </td>
              </tr>
              <tr *ngIf="certs().length === 0">
                <td colspan="6" class="m3-empty-state">
                  暂无 SSL 证书，点击右上角「申请免费 ACME 证书」或「上传自有 PEM 证书」。
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Apply ACME Modal -->
      <div *ngIf="showApplyModal()" class="m3-modal-backdrop" (click)="showApplyModal.set(false)">
        <div class="m3-modal-dialog" (click)="$event.stopPropagation()">
          <div class="m3-modal-header">
            <h3>
              <mat-icon style="color: var(--ag-primary)">add_moderator</mat-icon>
              <span>申请 Let's Encrypt / ZeroSSL 免费证书</span>
            </h3>
            <button mat-icon-button (click)="showApplyModal.set(false)">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <div class="m3-modal-body font-mono">
            <div class="m3-grid-2">
              <div class="m3-field">
                <label>申请主域名</label>
                <input type="text" [(ngModel)]="applyForm.domain" placeholder="panel.example.com" />
              </div>
              <div class="m3-field">
                <label>通知邮箱 (ACME Account Email)</label>
                <input type="email" [(ngModel)]="applyForm.email" placeholder="admin@example.com" />
              </div>
              <div class="m3-field">
                <label>CA 签发机构</label>
                <select [(ngModel)]="applyForm.provider">
                  <option value="letsencrypt">Let's Encrypt (官方 ACME)</option>
                  <option value="zerossl">ZeroSSL</option>
                </select>
              </div>
              <div class="m3-field">
                <label>验证方式 (Challenge)</label>
                <select [(ngModel)]="applyForm.challenge_type">
                  <option value="http-01">HTTP-01 文件穿透验证</option>
                  <option value="dns-01">DNS-01 API 自动解析</option>
                </select>
              </div>
            </div>
          </div>
          <div class="m3-modal-footer">
            <button mat-stroked-button (click)="showApplyModal.set(false)">取消</button>
            <button mat-flat-button color="primary" (click)="handleApply()">立即签发</button>
          </div>
        </div>
      </div>

      <!-- Upload Custom Cert Modal -->
      <div *ngIf="showUploadModal()" class="m3-modal-backdrop" (click)="showUploadModal.set(false)">
        <div class="m3-modal-dialog" (click)="$event.stopPropagation()">
          <div class="m3-modal-header">
            <h3>
              <mat-icon style="color: var(--ag-primary)">upload_file</mat-icon>
              <span>上传自有 PEM 证书与私钥</span>
            </h3>
            <button mat-icon-button (click)="showUploadModal.set(false)">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <div class="m3-modal-body font-mono">
            <div class="m3-field">
              <label>证书关联域名</label>
              <input type="text" [(ngModel)]="uploadForm.domain" placeholder="example.com" />
            </div>
            <div class="m3-field">
              <label>PEM 证书内容 (Fullchain)</label>
              <textarea rows="5" [(ngModel)]="uploadForm.certificate" placeholder="-----BEGIN CERTIFICATE-----"></textarea>
            </div>
            <div class="m3-field">
              <label>PEM 私钥内容 (Private Key)</label>
              <textarea rows="5" [(ngModel)]="uploadForm.private_key" placeholder="-----BEGIN PRIVATE KEY-----"></textarea>
            </div>
          </div>
          <div class="m3-modal-footer">
            <button mat-stroked-button (click)="showUploadModal.set(false)">取消</button>
            <button mat-flat-button color="primary" (click)="handleUpload()">保存并入库</button>
          </div>
        </div>
      </div>

      <!-- Deploy to Site Modal -->
      <div *ngIf="deployingCert()" class="m3-modal-backdrop" (click)="deployingCert.set(null)">
        <div class="m3-modal-dialog" (click)="$event.stopPropagation()">
          <div class="m3-modal-header">
            <h3>部署证书 {{ deployingCert()!.domain }} 到 Nginx 站点</h3>
            <button mat-icon-button (click)="deployingCert.set(null)">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <div class="m3-modal-body font-mono">
            <div class="m3-field">
              <label>选择目标网站</label>
              <select [(ngModel)]="targetSiteId">
                <option *ngFor="let s of sites()" [ngValue]="s.id">{{ s.domain }} (:{{ s.port || 80 }})</option>
              </select>
            </div>
          </div>
          <div class="m3-modal-footer">
            <button mat-stroked-button (click)="deployingCert.set(null)">取消</button>
            <button mat-flat-button color="primary" (click)="confirmDeploy()">立即部署</button>
          </div>
        </div>
      </div>

      <!-- Detail Modal -->
      <div *ngIf="detailCert()" class="m3-modal-backdrop" (click)="detailCert.set(null)">
        <div class="m3-modal-dialog lg" (click)="$event.stopPropagation()">
          <div class="m3-modal-header">
            <h3>X.509 证书详情: {{ detailCert()!.domain }}</h3>
            <button mat-icon-button (click)="detailCert.set(null)">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <div class="m3-modal-body font-mono">
            <div class="m3-tonal-card">
              <div>证书路径: {{ detailCert()!.cert_path }}</div>
              <div>私钥路径: {{ detailCert()!.key_path }}</div>
              <div>签发者: {{ detailCert()!.issuer }} | 到期: {{ detailCert()!.expires_at }}</div>
            </div>
            <div class="m3-field">
              <label>Fullchain PEM</label>
              <textarea rows="6" readonly [ngModel]="detailCert()!.fullchain"></textarea>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class SslComponent implements OnInit {
  private toast = inject(ToastService)
  readonly certs = signal<SSLCertificate[]>([])
  readonly sites = signal<SiteItem[]>([])
  readonly showApplyModal = signal(false)
  readonly showUploadModal = signal(false)
  readonly deployingCert = signal<SSLCertificate | null>(null)
  readonly detailCert = signal<SSLCertDetail | null>(null)
  targetSiteId: number | null = null

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

  ngOnInit() {
    this.loadCerts()
    this.loadSites()
  }

  async loadCerts() {
    try {
      const res = await sslApi.getCerts()
      this.certs.set(res.data?.data?.list || [])
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async loadSites() {
    try {
      const res = await siteApi.getSites(1, 100)
      this.sites.set(res.data?.data?.list || [])
      if (this.sites().length > 0) {
        this.targetSiteId = this.sites()[0].id
      }
    } catch {}
  }

  async handleApply() {
    try {
      await sslApi.applyCert(this.applyForm)
      this.toast.success('ACME 证书签发成功')
      this.showApplyModal.set(false)
      this.loadCerts()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async handleUpload() {
    try {
      await sslApi.uploadCert(this.uploadForm)
      this.toast.success('PEM 证书上传成功')
      this.showUploadModal.set(false)
      this.loadCerts()
    } catch (e: any) {
      this.toast.error(e.message)
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
    try {
      await sslApi.deployCertToSite(c.id, this.targetSiteId)
      this.toast.success('证书已部署至目标 Nginx 站点')
      this.deployingCert.set(null)
      this.loadCerts()
    } catch (e: any) {
      this.toast.error(e.message)
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

  async deleteCert(cert: SSLCertificate) {
    if (!confirm(`确定要删除证书 ${cert.domain} 吗？`)) return
    try {
      await sslApi.deleteCert(cert.id)
      this.toast.success('证书已删除')
      this.loadCerts()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }
}
