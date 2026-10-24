import { Component, OnInit, inject, signal } from '@angular/core'
import { AgMaterialModule } from '../../core/material.module'
import { ToastService } from '../../core/toast.service'
import { securityApi, FirewallRule, SSHConfig, Fail2banStatus } from '@/api/security'

@Component({
  selector: 'ag-security',
  standalone: true,
  imports: [AgMaterialModule],
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
          <button mat-stroked-button (click)="loadAll()">
            <mat-icon>refresh</mat-icon>
            <span>刷新状态</span>
          </button>
          <button mat-flat-button color="primary" (click)="showAddRuleModal.set(true)">
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
              style="flex: 1; padding: 6px 10px; border-radius: 10px; border: 1px solid var(--ag-outline); background: var(--ag-surface-lowest); color: var(--ag-on-surface)"
            />
            <button mat-stroked-button color="warn" (click)="banIpNow()">封禁</button>
          </div>
        </div>
      </div>

      <!-- Firewall Rules Table -->
      <div class="m3-card">
        <div style="font-weight: 700; margin-bottom: 12px">入站防火墙规则列表</div>
        <div class="m3-table-wrap font-mono">
          <table class="m3-data-table">
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
              <tr *ngFor="let r of rules()">
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
                  <button mat-button color="warn" (click)="deleteRule(r)">删除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Add Rule Modal -->
      <div *ngIf="showAddRuleModal()" class="m3-modal-backdrop" (click)="showAddRuleModal.set(false)">
        <div class="m3-modal-dialog" (click)="$event.stopPropagation()">
          <div class="m3-modal-header">
            <h3>新增防火墙规则</h3>
            <button mat-icon-button (click)="showAddRuleModal.set(false)">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <div class="m3-modal-body font-mono">
            <div class="m3-grid-2">
              <div class="m3-field">
                <label>协议</label>
                <select [(ngModel)]="ruleForm.protocol">
                  <option value="TCP">TCP</option>
                  <option value="UDP">UDP</option>
                  <option value="ALL">TCP + UDP</option>
                </select>
              </div>
              <div class="m3-field">
                <label>端口 (如 80, 443 或 8000-8100)</label>
                <input type="text" [(ngModel)]="ruleForm.port" placeholder="8080" />
              </div>
              <div class="m3-field">
                <label>来源 IP (0.0.0.0/0 代表任意)</label>
                <input type="text" [(ngModel)]="ruleForm.source_ip" placeholder="0.0.0.0/0" />
              </div>
              <div class="m3-field">
                <label>动作</label>
                <select [(ngModel)]="ruleForm.action">
                  <option value="accept">放行 (Accept)</option>
                  <option value="drop">丢弃 (Drop)</option>
                </select>
              </div>
            </div>
            <div class="m3-field">
              <label>备注描述</label>
              <input type="text" [(ngModel)]="ruleForm.description" placeholder="业务 Web 端口" />
            </div>
          </div>
          <div class="m3-modal-footer">
            <button mat-stroked-button (click)="showAddRuleModal.set(false)">取消</button>
            <button mat-flat-button color="primary" (click)="addRule()">保存规则</button>
          </div>
        </div>
      </div>

      <!-- SSH Config Modal -->
      <div *ngIf="showSshModal()" class="m3-modal-backdrop" (click)="showSshModal.set(false)">
        <div class="m3-modal-dialog" (click)="$event.stopPropagation()">
          <div class="m3-modal-header">
            <h3>SSH 远程登录安全加固</h3>
            <button mat-icon-button (click)="showSshModal.set(false)">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <div class="m3-modal-body font-mono">
            <div class="m3-field">
              <label>SSH 监听端口</label>
              <input type="number" [(ngModel)]="sshConfig.port" />
            </div>
            <mat-slide-toggle [(ngModel)]="sshConfig.allow_root_login">允许 Root 账号直接登录</mat-slide-toggle>
            <mat-slide-toggle [(ngModel)]="sshConfig.allow_password_auth">允许密码认证登录</mat-slide-toggle>
            <mat-slide-toggle [(ngModel)]="sshConfig.allow_pubkey_auth">允许公钥 (SSH Key) 登录</mat-slide-toggle>
          </div>
          <div class="m3-modal-footer">
            <button mat-stroked-button (click)="showSshModal.set(false)">取消</button>
            <button mat-flat-button color="primary" (click)="saveSshConfig()">保存并重载 sshd</button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class SecurityComponent implements OnInit {
  private toast = inject(ToastService)
  readonly rules = signal<FirewallRule[]>([])
  readonly firewallType = signal('ufw/iptables')
  readonly firewallStatus = signal<'active' | 'inactive'>('active')
  readonly pingBanned = signal(false)
  readonly showAddRuleModal = signal(false)
  readonly showSshModal = signal(false)

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

  ngOnInit() {
    this.loadAll()
  }

  async loadAll() {
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
      this.toast.error(e.message)
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

  async addRule() {
    try {
      await securityApi.addFirewallRule(this.ruleForm)
      this.toast.success('防火墙规则已添加')
      this.showAddRuleModal.set(false)
      this.loadAll()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async deleteRule(r: FirewallRule) {
    if (!confirm(`确定删除端口 ${r.port} 的规则吗？`)) return
    try {
      await securityApi.deleteFirewallRule(r.id, r.raw_spec, r.chain)
      this.toast.success('规则已删除')
      this.loadAll()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async saveSshConfig() {
    try {
      await securityApi.updateSSHConfig(this.sshConfig)
      this.toast.success('SSH 安全策略已更新')
      this.showSshModal.set(false)
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async banIpNow() {
    if (!this.manualBanIp.trim()) return
    try {
      await securityApi.banIP(this.manualBanIp.trim())
      this.toast.success(`已封禁 IP: ${this.manualBanIp}`)
      this.manualBanIp = ''
      this.loadAll()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }
}
