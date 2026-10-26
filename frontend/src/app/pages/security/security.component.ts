import { Component, OnInit, computed, inject, signal } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { AgMaterialModule } from '../../core/material.module'
import { ToastService } from '../../core/toast.service'
import { ConfirmService } from '../../core/confirm.service'
import { AgStateBannerComponent } from '../../components/ag-state-banner.component'
import { AgModalComponent } from '../../components/ag-modal.component'
import { securityApi, FirewallRule, SSHConfig, Fail2banStatus } from '@/api/security'

@Component({
  selector: 'ag-security',
  standalone: true,
  imports: [AgMaterialModule, AgStateBannerComponent, AgModalComponent],
  template: `
    <div class="m3-page">
      <div class="m3-page-header">
        <div>
          <h2 class="m3-page-title">
            <mat-icon style="color: var(--ag-primary)">security</mat-icon>
            <span>系统防火墙、SSH 安全加固与 Fail2ban 防爆破</span>
          </h2>
          <p class="m3-page-subtitle font-mono">
            双栈 (IPv4/IPv6) 入站端口管控、ICMP 禁 Ping、SSH 端口/密钥策略与恶意 IP 自动封禁
          </p>
        </div>
        <div class="m3-page-actions">
          <button mat-stroked-button (click)="loadAll()" [disabled]="loading()">
            <mat-icon>refresh</mat-icon>
            <span>刷新状态</span>
          </button>
          <button mat-flat-button color="primary" (click)="openAddRuleModal()">
            <mat-icon>add_moderator</mat-icon>
            <span>添加防火墙规则</span>
          </button>
        </div>
      </div>

      <!-- Top Security Summary Cards -->
      <div class="m3-grid-3 font-mono">
        <div class="m3-card">
          <div style="display: flex; justify-content: space-between; align-items: center">
            <strong>系统防火墙 ({{ firewallType() }})</strong>
            <span class="m3-badge" [ngClass]="firewallStatus() === 'active' ? 'success' : 'warning'">
              {{ firewallStatus() === 'active' ? '已启用' : '未启用' }}
            </span>
          </div>
          <div style="margin-top: 12px; display: flex; align-items: center; justify-content: space-between">
            <span style="font-size: 0.78rem; color: var(--ag-on-surface-variant)">禁止外部 ICMP Ping 探测</span>
            <mat-slide-toggle [ngModel]="pingBanned()" (change)="togglePing($event.checked)"></mat-slide-toggle>
          </div>
        </div>

        <div class="m3-card">
          <div style="display: flex; justify-content: space-between; align-items: center">
            <strong>SSH 守护进程 (Port :{{ sshConfig.port }})</strong>
            <span class="m3-badge" [ngClass]="sshConfig.status === 'running' ? 'success' : 'danger'">
              {{ sshConfig.status }}
            </span>
          </div>
          <div style="margin-top: 12px; display: flex; gap: 10px">
            <button mat-stroked-button (click)="showSshModal.set(true)">SSH 安全策略设置</button>
          </div>
        </div>

        <div class="m3-card">
          <div style="display: flex; justify-content: space-between; align-items: center">
            <strong>Fail2ban 防暴力破解</strong>
            <span class="m3-badge" [ngClass]="fail2ban.running ? 'success' : 'neutral'">
              已封禁 {{ fail2ban.banned_ips.length || 0 }} 个 IP
            </span>
          </div>
          <div style="margin-top: 12px; display: flex; gap: 8px">
            <input
              type="text"
              [(ngModel)]="manualBanIp"
              placeholder="输入恶意 IP 手动拉黑"
              style="flex: 1; padding: 6px 10px; border-radius: 10px; border: 1px solid var(--ag-outline); background: var(--ag-surface-lowest); color: var(--ag-on-surface); font-size: 0.78rem"
            />
            <button mat-stroked-button color="warn" [disabled]="!manualBanIp.trim()" (click)="banIpNow()">封禁</button>
          </div>
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
            placeholder="搜索规则端口、来源 IP 或备注..."
            aria-label="搜索防火墙规则"
          />
        </div>
      </div>

      <!-- State Banners (FE-001) -->
      <ag-state-banner
        *ngIf="loading() && rules().length === 0"
        state="loading"
        title="正在加载系统安全策略与防火墙规则..."
      />

      <ag-state-banner
        *ngIf="loadError()"
        state="error"
        title="安全状态加载失败"
        [description]="loadError()!"
        primaryActionLabel="重试刷新"
        (primaryAction)="loadAll()"
      />

      <!-- Firewall Rules Table -->
      <div class="m3-card" *ngIf="!loadError()">
        <div style="font-weight: 700; margin-bottom: 12px">入站防火墙规则列表 ({{ filteredRules().length }}/{{ rules().length }})</div>
        <div class="m3-table-wrap font-mono">
          <table class="m3-data-table" aria-label="入站防火墙规则">
            <thead>
              <tr>
                <th>ID</th>
                <th>协议</th>
                <th>端口范围</th>
                <th>来源 IP (Source)</th>
                <th>策略动作</th>
                <th>备注</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let r of filteredRules()">
                <td>#{{ r.id }}</td>
                <td><span class="m3-badge primary">{{ r.protocol.toUpperCase() }}</span></td>
                <td><strong>{{ r.port }}</strong></td>
                <td>{{ r.source_ip }}</td>
                <td>
                  <span class="m3-badge" [ngClass]="r.action === 'accept' ? 'success' : 'danger'">
                    {{ r.action.toUpperCase() }}
                  </span>
                </td>
                <td>{{ r.description || '-' }}</td>
                <td>
                  <button mat-button color="warn" (click)="confirmDeleteRule(r)">删除</button>
                </td>
              </tr>
              <tr *ngIf="filteredRules().length === 0 && !loading()">
                <td colspan="7" class="m3-empty-state">
                  {{ searchQuery() ? '未检索到匹配的防火墙规则。' : '暂无自定义入站防火墙规则。' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Add Rule Modal (FE-002, FE-004) -->
      <ag-modal
        [open]="showAddRuleModal()"
        title="新增防火墙入站规则"
        icon="add_moderator"
        [submitting]="submitting()"
        (closed)="showAddRuleModal.set(false)"
      >
        <div class="font-mono" style="display: flex; flex-direction: column; gap: 14px">
          <div class="m3-grid-2">
            <div class="m3-field">
              <label for="rule-protocol-select">协议</label>
              <select id="rule-protocol-select" [(ngModel)]="ruleForm.protocol">
                <option value="TCP">TCP</option>
                <option value="UDP">UDP</option>
                <option value="ALL">TCP + UDP</option>
              </select>
            </div>
            <div class="m3-field" [class.has-error]="!!portError()">
              <label for="rule-port-input">端口 (如 80, 443 或 8000-8100) <span class="m3-req">*</span></label>
              <input
                id="rule-port-input"
                type="text"
                [(ngModel)]="ruleForm.port"
                (ngModelChange)="portError.set('')"
                placeholder="8080"
              />
              <div *ngIf="portError()" class="m3-field-error" role="alert">{{ portError() }}</div>
            </div>
            <div class="m3-field">
              <label for="rule-source-input">来源 IP (0.0.0.0/0 代表任意)</label>
              <input id="rule-source-input" type="text" [(ngModel)]="ruleForm.source_ip" placeholder="0.0.0.0/0" />
            </div>
            <div class="m3-field">
              <label for="rule-action-select">动作</label>
              <select id="rule-action-select" [(ngModel)]="ruleForm.action">
                <option value="accept">放行 (Accept)</option>
                <option value="drop">丢弃 (Drop)</option>
              </select>
            </div>
          </div>
          <div class="m3-field">
            <label for="rule-desc-input">备注描述</label>
            <input id="rule-desc-input" type="text" [(ngModel)]="ruleForm.description" placeholder="业务 Web 端口" />
          </div>
        </div>
        <div modal-footer>
          <button mat-stroked-button (click)="showAddRuleModal.set(false)" [disabled]="submitting()">取消</button>
          <button mat-flat-button color="primary" [disabled]="submitting()" (click)="addRule()">
            {{ submitting() ? '正在保存...' : '保存规则' }}
          </button>
        </div>
      </ag-modal>

      <!-- SSH Config Modal (FE-002, FE-009) -->
      <ag-modal
        [open]="showSshModal()"
        title="SSH 远程登录安全加固"
        icon="terminal"
        [submitting]="submitting()"
        (closed)="showSshModal.set(false)"
      >
        <div class="font-mono" style="display: flex; flex-direction: column; gap: 14px">
          <div class="m3-field">
            <label for="ssh-port-input">SSH 监听端口 <span class="m3-req">*</span></label>
            <input id="ssh-port-input" type="number" [(ngModel)]="sshConfig.port" min="1" max="65535" />
          </div>
          <mat-slide-toggle [(ngModel)]="sshConfig.allow_root_login">允许 Root 账号直接登录</mat-slide-toggle>
          <mat-slide-toggle [(ngModel)]="sshConfig.allow_password_auth">允许密码认证登录</mat-slide-toggle>
          <mat-slide-toggle [(ngModel)]="sshConfig.allow_pubkey_auth">允许公钥 (SSH Key) 登录</mat-slide-toggle>
          <div class="m3-hint">
            注意：若同时关闭密码认证与 Root 登录，请务必确认已成功配置非 Root 用户的公钥，否则将失去 SSH 访问能力。
          </div>
        </div>
        <div modal-footer>
          <button mat-stroked-button (click)="showSshModal.set(false)" [disabled]="submitting()">取消</button>
          <button mat-flat-button color="primary" [disabled]="submitting()" (click)="saveSshConfig()">
            {{ submitting() ? '保存重载中...' : '保存并重载 sshd' }}
          </button>
        </div>
      </ag-modal>
    </div>
  `,
})
export class SecurityComponent implements OnInit {
  private toast = inject(ToastService)
  private confirmSvc = inject(ConfirmService)
  private route = inject(ActivatedRoute)
  private router = inject(Router)

  readonly rules = signal<FirewallRule[]>([])
  readonly firewallType = signal('ufw/iptables')
  readonly firewallStatus = signal<'active' | 'inactive'>('active')
  readonly pingBanned = signal(false)
  readonly loading = signal(false)
  readonly loadError = signal<string | null>(null)
  readonly submitting = signal(false)

  readonly searchQuery = signal('')
  readonly showAddRuleModal = signal(false)
  readonly showSshModal = signal(false)
  readonly portError = signal('')

  sshConfig: SSHConfig = {
    port: 22,
    status: 'running',
    allow_password_auth: true,
    allow_root_login: true,
    allow_pubkey_auth: true,
  }

  fail2ban: Fail2banStatus = {
    installed: true,
    running: true,
    banned_ips: [],
  }

  manualBanIp = ''
  ruleForm = {
    protocol: 'TCP',
    port: '8080',
    source_ip: '0.0.0.0/0',
    action: 'accept',
    description: '',
  }

  readonly filteredRules = computed(() => {
    const q = this.searchQuery().trim().toLowerCase()
    return this.rules().filter((r) => {
      if (!q) return true
      const text = `${r.port} ${r.source_ip} ${r.protocol} ${r.description || ''}`.toLowerCase()
      return text.includes(q)
    })
  })

  ngOnInit() {
    const qp = this.route.snapshot.queryParamMap
    if (qp.get('q')) this.searchQuery.set(qp.get('q')!)
    this.loadAll()
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

  async loadAll() {
    this.loading.set(true)
    this.loadError.set(null)
    try {
      const [fwRes, sshRes, f2bRes] = await Promise.all([
        securityApi.getFirewallRules(),
        securityApi.getSSHConfig(),
        securityApi.getFail2banStatus(),
      ])
      if (fwRes.data?.data) {
        this.rules.set(fwRes.data.data.rules || [])
        this.firewallType.set(fwRes.data.data.firewall_type || 'ufw')
        this.firewallStatus.set(fwRes.data.data.status || 'active')
        this.pingBanned.set(Boolean(fwRes.data.data.ping_banned))
      }
      if (sshRes.data?.data) this.sshConfig = sshRes.data.data
      if (f2bRes.data?.data) this.fail2ban = f2bRes.data.data
    } catch (e: any) {
      const msg = e.message || '加载系统安全状态失败'
      this.loadError.set(msg)
      this.toast.error(msg)
    } finally {
      this.loading.set(false)
    }
  }

  async togglePing(ban: boolean) {
    try {
      await securityApi.setIcmpBan(ban)
      this.pingBanned.set(ban)
      this.toast.success(ban ? '已开启 ICMP 禁 Ping' : '已恢复 ICMP Ping 响应')
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  openAddRuleModal() {
    this.ruleForm = {
      protocol: 'TCP',
      port: '8080',
      source_ip: '0.0.0.0/0',
      action: 'accept',
      description: '',
    }
    this.portError.set('')
    this.showAddRuleModal.set(true)
  }

  async addRule() {
    if (!this.ruleForm.port.trim()) {
      this.portError.set('请输入端口号或端口范围')
      return
    }
    this.submitting.set(true)
    try {
      await securityApi.addFirewallRule(this.ruleForm)
      this.toast.success(`防火墙规则 (Port ${this.ruleForm.port}) 已添加`)
      this.showAddRuleModal.set(false)
      this.loadAll()
    } catch (e: any) {
      this.toast.error(e.message)
    } finally {
      this.submitting.set(false)
    }
  }

  async confirmDeleteRule(r: FirewallRule) {
    const res = await this.confirmSvc.ask({
      title: '删除防火墙规则确认',
      resourceName: `规则 #${r.id} (Port ${r.port} / ${r.protocol})`,
      message: `确定要删除该防火墙入站规则吗？`,
      impact: '删除后，相关端口将遵循默认防火墙出入站策略。',
      confirmText: '确认删除',
      severity: 'danger',
    })
    if (!res.confirmed) return

    try {
      await securityApi.deleteFirewallRule(r.id, r.raw_spec, r.chain)
      this.toast.success('规则已删除')
      this.loadAll()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async saveSshConfig() {
    const res = await this.confirmSvc.ask({
      title: '更新 SSH 安全策略确认',
      resourceName: `sshd (Port :${this.sshConfig.port})`,
      message: '确定要保存并重载 OpenSSH 守护进程吗？',
      impact: '若端口修改或禁用了密码登录，请确保公钥或新端口可用，以免意外锁在门外。',
      confirmText: '确认重载 sshd',
      severity: 'warning',
    })
    if (!res.confirmed) return

    this.submitting.set(true)
    try {
      await securityApi.updateSSHConfig(this.sshConfig)
      this.toast.success('SSH 安全策略已更新并重载')
      this.showSshModal.set(false)
    } catch (e: any) {
      this.toast.error(e.message)
    } finally {
      this.submitting.set(false)
    }
  }

  async banIpNow() {
    const ip = this.manualBanIp.trim()
    if (!ip) return
    try {
      await securityApi.banIP(ip)
      this.toast.success(`已封禁 IP: ${ip}`)
      this.manualBanIp = ''
      this.loadAll()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }
}
