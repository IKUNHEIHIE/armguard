import { Component, OnInit, inject, signal } from '@angular/core'
import { AgMaterialModule } from '../../core/material.module'
import { ToastService } from '../../core/toast.service'
import { streamApi, StreamRuleItem, CreateStreamRuleParams } from '@/api/stream'

@Component({
  selector: 'ag-stream',
  standalone: true,
  imports: [AgMaterialModule],
  template: `
    <div class="m3-page">
      <div class="m3-page-header">
        <div>
          <h2 class="m3-page-title">
            <mat-icon style="color: var(--ag-primary)">swap_horiz</mat-icon>
            <span>四层 TCP/UDP 流量转发网关 (Nginx Stream Proxy)</span>
          </h2>
          <p class="m3-page-subtitle font-mono">
            原生集成 Nginx Stream 四层中继，内置常用协议模板与系统核心端口防冲突保护
          </p>
        </div>
        <div class="m3-page-actions">
          <button mat-stroked-button (click)="loadRules()">
            <mat-icon>refresh</mat-icon>
            <span>刷新</span>
          </button>
          <button mat-flat-button color="primary" (click)="openCreateModal()">
            <mat-icon>add</mat-icon>
            <span>新建转发规则</span>
          </button>
        </div>
      </div>

      <!-- Preset Quick Templates -->
      <div class="m3-card">
        <div style="font-size: 0.82rem; font-weight: 600; margin-bottom: 10px">
          常用四层协议快速模板 (点击自动填充创建):
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px" class="font-mono">
          <button mat-stroked-button *ngFor="let p of presets" (click)="applyPreset(p)">
            {{ p.label }} ({{ p.protocol.toUpperCase() }} :{{ p.listen_port }})
          </button>
        </div>
      </div>

      <div class="m3-card">
        <div class="m3-table-wrap font-mono">
          <table class="m3-data-table">
            <thead>
              <tr>
                <th>规则名称</th>
                <th>协议</th>
                <th>本地监听端口</th>
                <th>上游目标地址</th>
                <th>超时设定</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let rule of rules()">
                <td>
                  <strong>{{ rule.name }}</strong>
                  <div style="font-size: 0.7rem; color: var(--ag-on-surface-variant)">
                    {{ rule.description || '-' }}
                  </div>
                </td>
                <td>
                  <span class="m3-badge primary">{{ rule.protocol.toUpperCase() }}</span>
                </td>
                <td>:{{ rule.listen_port }}</td>
                <td>{{ rule.target_host }}:{{ rule.target_port }}</td>
                <td>{{ rule.proxy_timeout || '10m' }}</td>
                <td>
                  <span class="m3-badge" [ngClass]="rule.status === 'running' ? 'success' : 'warning'">
                    {{ rule.status === 'running' ? '转发中' : '已暂停' }}
                  </span>
                </td>
                <td>
                  <button mat-button color="primary" (click)="openEditModal(rule)">编辑</button>
                  <button mat-button (click)="toggleRule(rule)">
                    {{ rule.status === 'running' ? '停用' : '启用' }}
                  </button>
                  <button mat-button color="warn" (click)="deleteRule(rule)">删除</button>
                </td>
              </tr>
              <tr *ngIf="rules().length === 0">
                <td colspan="7" class="m3-empty-state">
                  暂无四层端口转发规则，可点击上方常用协议模板或右上角按钮创建。
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Create / Edit Modal -->
      <div *ngIf="showModal()" class="m3-modal-backdrop" (click)="showModal.set(false)">
        <div class="m3-modal-dialog" (click)="$event.stopPropagation()">
          <div class="m3-modal-header">
            <h3>
              <mat-icon style="color: var(--ag-primary)">swap_horiz</mat-icon>
              <span>{{ editingId ? '编辑四层转发规则' : '新建四层转发规则' }}</span>
            </h3>
            <button mat-icon-button (click)="showModal.set(false)">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <div class="m3-modal-body font-mono">
            <div class="m3-grid-2">
              <div class="m3-field">
                <label>规则名称</label>
                <input type="text" [(ngModel)]="form.name" placeholder="MySQL 远程中继" />
              </div>
              <div class="m3-field">
                <label>传输层协议</label>
                <select [(ngModel)]="form.protocol">
                  <option value="tcp">TCP</option>
                  <option value="udp">UDP</option>
                  <option value="tcp+udp">TCP + UDP 双栈</option>
                </select>
              </div>
              <div class="m3-field">
                <label>本地监听端口 (禁止 22/80/443/8888)</label>
                <input type="number" [(ngModel)]="form.listen_port" placeholder="13306" />
              </div>
              <div class="m3-field">
                <label>上游目标主机 IP / 域名</label>
                <input type="text" [(ngModel)]="form.target_host" placeholder="10.0.0.12" />
              </div>
              <div class="m3-field">
                <label>上游目标端口</label>
                <input type="number" [(ngModel)]="form.target_port" placeholder="3306" />
              </div>
              <div class="m3-field">
                <label>会话保持超时 (proxy_timeout)</label>
                <input type="text" [(ngModel)]="form.proxy_timeout" placeholder="10m" />
              </div>
            </div>
            <div class="m3-field">
              <label>备注说明</label>
              <input type="text" [(ngModel)]="form.description" placeholder="内网数据库穿透" />
            </div>
          </div>
          <div class="m3-modal-footer">
            <button mat-stroked-button (click)="showModal.set(false)">取消</button>
            <button mat-flat-button color="primary" (click)="submitForm()">保存规则</button>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class StreamComponent implements OnInit {
  private toast = inject(ToastService)
  readonly rules = signal<StreamRuleItem[]>([])
  readonly showModal = signal(false)
  editingId: number | null = null

  presets = [
    { label: 'MySQL 中继', name: 'MySQL Proxy', protocol: 'tcp' as const, listen_port: 13306, target_port: 3306 },
    { label: 'Redis 中继', name: 'Redis Proxy', protocol: 'tcp' as const, listen_port: 16379, target_port: 6379 },
    { label: 'PostgreSQL', name: 'PGSQL Proxy', protocol: 'tcp' as const, listen_port: 15432, target_port: 5432 },
    { label: 'SSH 跳板', name: 'SSH Jump', protocol: 'tcp' as const, listen_port: 2222, target_port: 22 },
    { label: 'DNS 转发', name: 'DNS Relay', protocol: 'udp' as const, listen_port: 5353, target_port: 53 },
    { label: 'Minecraft', name: 'MC Server', protocol: 'tcp+udp' as const, listen_port: 25565, target_port: 25565 },
  ]

  form: CreateStreamRuleParams = {
    name: '',
    protocol: 'tcp',
    listen_port: 13306,
    target_host: '127.0.0.1',
    target_port: 3306,
    proxy_timeout: '10m',
    proxy_connect_timeout: '5s',
    description: '',
  }

  ngOnInit() {
    this.loadRules()
  }

  async loadRules() {
    try {
      const res = await streamApi.getStreamList()
      this.rules.set(res.data?.data?.list || [])
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  openCreateModal() {
    this.editingId = null
    this.form = {
      name: '',
      protocol: 'tcp',
      listen_port: 13306,
      target_host: '127.0.0.1',
      target_port: 3306,
      proxy_timeout: '10m',
      proxy_connect_timeout: '5s',
      description: '',
    }
    this.showModal.set(true)
  }

  applyPreset(p: any) {
    this.editingId = null
    this.form = {
      name: p.name,
      protocol: p.protocol,
      listen_port: p.listen_port,
      target_host: '127.0.0.1',
      target_port: p.target_port,
      proxy_timeout: '10m',
      proxy_connect_timeout: '5s',
      description: `${p.label} 规则`,
    }
    this.showModal.set(true)
  }

  openEditModal(rule: StreamRuleItem) {
    this.editingId = rule.id
    this.form = {
      name: rule.name,
      protocol: rule.protocol,
      listen_port: rule.listen_port,
      target_host: rule.target_host,
      target_port: rule.target_port,
      proxy_timeout: rule.proxy_timeout || '10m',
      proxy_connect_timeout: rule.proxy_connect_timeout || '5s',
      description: rule.description || '',
    }
    this.showModal.set(true)
  }

  async submitForm() {
    try {
      if (this.editingId) {
        await streamApi.updateStreamRule(this.editingId, this.form)
        this.toast.success('转发规则更新成功')
      } else {
        await streamApi.createStreamRule(this.form)
        this.toast.success('四层转发规则创建成功')
      }
      this.showModal.set(false)
      this.loadRules()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async toggleRule(rule: StreamRuleItem) {
    try {
      await streamApi.toggleStreamRule(rule.id)
      this.toast.success('规则状态已切换')
      this.loadRules()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async deleteRule(rule: StreamRuleItem) {
    if (!confirm(`确定要删除四层转发规则 ${rule.name} 吗？`)) return
    try {
      await streamApi.deleteStreamRule(rule.id)
      this.toast.success('转发规则已删除')
      this.loadRules()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }
}
