import { Component, OnInit, computed, inject, signal } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { AgMaterialModule } from '../../core/material.module'
import { ToastService } from '../../core/toast.service'
import { ConfirmService } from '../../core/confirm.service'
import { AgStateBannerComponent } from '../../components/ag-state-banner.component'
import { AgModalComponent } from '../../components/ag-modal.component'
import { streamApi, StreamRuleItem, CreateStreamRuleParams } from '@/api/stream'

@Component({
  selector: 'ag-stream',
  standalone: true,
  imports: [AgMaterialModule, AgStateBannerComponent, AgModalComponent],
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
          <button mat-stroked-button (click)="loadRules()" [disabled]="loading()">
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

      <!-- Filter Bar (FE-011) -->
      <div class="m3-filter-bar font-mono">
        <div class="search-box">
          <mat-icon>search</mat-icon>
          <input
            type="search"
            [ngModel]="searchQuery()"
            (ngModelChange)="onSearchChange($event)"
            placeholder="搜索规则名称、端口或目标主机..."
            aria-label="搜索转发规则"
          />
        </div>
        <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px">
          <label for="stream-protocol-filter" style="font-size: 0.75rem; color: var(--ag-on-surface-variant)">协议类型:</label>
          <select
            id="stream-protocol-filter"
            [ngModel]="protocolFilter()"
            (ngModelChange)="onProtocolChange($event)"
            aria-label="按协议过滤"
            style="padding: 6px 10px; border-radius: 999px; border: 1px solid var(--ag-outline-variant); background: var(--ag-surface-lowest); color: var(--ag-on-surface); font-size: 0.76rem"
          >
            <option value="all">全部协议</option>
            <option value="tcp">TCP</option>
            <option value="udp">UDP</option>
            <option value="tcp+udp">TCP + UDP</option>
          </select>
        </div>
      </div>

      <!-- State Banners (FE-001) -->
      <ag-state-banner
        *ngIf="loading() && rules().length === 0"
        state="loading"
        title="正在加载四层转发规则..."
      />

      <ag-state-banner
        *ngIf="loadError()"
        state="error"
        title="转发规则加载失败"
        [description]="loadError()!"
        primaryActionLabel="重试刷新"
        (primaryAction)="loadRules()"
      />

      <!-- Table Card -->
      <div class="m3-card" *ngIf="!loadError()">
        <div class="m3-table-wrap font-mono">
          <table class="m3-data-table" aria-label="四层流量转发规则列表">
            <thead>
              <tr>
                <th>规则名称 ({{ filteredRules().length }}/{{ rules().length }})</th>
                <th>协议</th>
                <th>本地监听端口</th>
                <th>上游目标地址</th>
                <th>超时设定</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let rule of filteredRules()">
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
                  <button mat-button color="warn" (click)="confirmDeleteRule(rule)">删除</button>
                </td>
              </tr>
              <tr *ngIf="filteredRules().length === 0 && !loading()">
                <td colspan="7" class="m3-empty-state">
                  {{ searchQuery() ? '未检索到匹配的四层转发规则。' : '暂无四层端口转发规则，可点击上方常用协议模板或右上角按钮创建。' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Create / Edit Modal (FE-002, FE-004) -->
      <ag-modal
        [open]="showModal()"
        [title]="editingId ? '编辑四层转发规则' : '新建四层转发规则'"
        icon="swap_horiz"
        size="lg"
        [submitting]="submitting()"
        (closed)="showModal.set(false)"
      >
        <div class="font-mono" style="display: flex; flex-direction: column; gap: 14px">
          <div class="m3-grid-2">
            <div class="m3-field" [class.has-error]="!!nameError()">
              <label for="stream-rule-name">规则名称 <span class="m3-req">*</span></label>
              <input
                id="stream-rule-name"
                type="text"
                [(ngModel)]="form.name"
                (ngModelChange)="nameError.set('')"
                placeholder="MySQL 远程中继"
              />
              <div *ngIf="nameError()" class="m3-field-error" role="alert">{{ nameError() }}</div>
            </div>
            <div class="m3-field">
              <label for="stream-rule-proto">传输层协议</label>
              <select id="stream-rule-proto" [(ngModel)]="form.protocol">
                <option value="tcp">TCP</option>
                <option value="udp">UDP</option>
                <option value="tcp+udp">TCP + UDP 双栈</option>
              </select>
            </div>
            <div class="m3-field" [class.has-error]="!!portError()">
              <label for="stream-listen-port">本地监听端口 (禁止 22/80/443/8888) <span class="m3-req">*</span></label>
              <input
                id="stream-listen-port"
                type="number"
                [(ngModel)]="form.listen_port"
                (ngModelChange)="portError.set('')"
                placeholder="13306"
              />
              <div *ngIf="portError()" class="m3-field-error" role="alert">{{ portError() }}</div>
            </div>
            <div class="m3-field" [class.has-error]="!!targetHostError()">
              <label for="stream-target-host">上游目标主机 IP / 域名 <span class="m3-req">*</span></label>
              <input
                id="stream-target-host"
                type="text"
                [(ngModel)]="form.target_host"
                (ngModelChange)="targetHostError.set('')"
                placeholder="10.0.0.12"
              />
              <div *ngIf="targetHostError()" class="m3-field-error" role="alert">{{ targetHostError() }}</div>
            </div>
            <div class="m3-field" [class.has-error]="!!targetPortError()">
              <label for="stream-target-port">上游目标端口 <span class="m3-req">*</span></label>
              <input
                id="stream-target-port"
                type="number"
                [(ngModel)]="form.target_port"
                (ngModelChange)="targetPortError.set('')"
                placeholder="3306"
              />
              <div *ngIf="targetPortError()" class="m3-field-error" role="alert">{{ targetPortError() }}</div>
            </div>
            <div class="m3-field">
              <label for="stream-proxy-timeout">会话保持超时 (proxy_timeout)</label>
              <input id="stream-proxy-timeout" type="text" [(ngModel)]="form.proxy_timeout" placeholder="10m" />
            </div>
          </div>
          <div class="m3-field">
            <label for="stream-rule-desc">备注说明</label>
            <input id="stream-rule-desc" type="text" [(ngModel)]="form.description" placeholder="内网数据库穿透" />
          </div>
        </div>
        <div modal-footer>
          <button mat-stroked-button (click)="showModal.set(false)" [disabled]="submitting()">取消</button>
          <button mat-flat-button color="primary" [disabled]="submitting()" (click)="submitForm()">
            {{ submitting() ? '正在校验保存...' : '保存规则' }}
          </button>
        </div>
      </ag-modal>
    </div>
  `,
})
export class StreamComponent implements OnInit {
  private toast = inject(ToastService)
  private confirmSvc = inject(ConfirmService)
  private route = inject(ActivatedRoute)
  private router = inject(Router)

  readonly rules = signal<StreamRuleItem[]>([])
  readonly loading = signal(false)
  readonly loadError = signal<string | null>(null)
  readonly submitting = signal(false)

  readonly searchQuery = signal('')
  readonly protocolFilter = signal('all')
  readonly showModal = signal(false)
  editingId: number | null = null

  readonly nameError = signal('')
  readonly portError = signal('')
  readonly targetHostError = signal('')
  readonly targetPortError = signal('')

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

  readonly filteredRules = computed(() => {
    const q = this.searchQuery().trim().toLowerCase()
    const p = this.protocolFilter()
    return this.rules().filter((r) => {
      if (p !== 'all' && r.protocol !== p) return false
      if (q) {
        const text = `${r.name} ${r.listen_port} ${r.target_host} ${r.target_port} ${r.description || ''}`.toLowerCase()
        if (!text.includes(q)) return false
      }
      return true
    })
  })

  ngOnInit() {
    const qp = this.route.snapshot.queryParamMap
    if (qp.get('q')) this.searchQuery.set(qp.get('q')!)
    if (qp.get('proto')) this.protocolFilter.set(qp.get('proto')!)
    this.loadRules()
  }

  onSearchChange(q: string) {
    this.searchQuery.set(q)
    this.syncUrlParams()
  }

  onProtocolChange(p: string) {
    this.protocolFilter.set(p)
    this.syncUrlParams()
  }

  private syncUrlParams() {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: this.searchQuery().trim() || null,
        proto: this.protocolFilter() !== 'all' ? this.protocolFilter() : null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    })
  }

  async loadRules() {
    this.loading.set(true)
    this.loadError.set(null)
    try {
      const res = await streamApi.getStreamList()
      this.rules.set(res.data?.data?.list || [])
    } catch (e: any) {
      const msg = e.message || '加载转发规则失败'
      this.loadError.set(msg)
      this.toast.error(msg)
    } finally {
      this.loading.set(false)
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
    this.clearErrors()
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
    this.clearErrors()
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
    this.clearErrors()
    this.showModal.set(true)
  }

  private clearErrors() {
    this.nameError.set('')
    this.portError.set('')
    this.targetHostError.set('')
    this.targetPortError.set('')
  }

  async submitForm() {
    let valid = true
    if (!this.form.name.trim()) {
      this.nameError.set('请输入规则名称')
      valid = false
    }
    if (!this.form.listen_port || this.form.listen_port < 1 || this.form.listen_port > 65535) {
      this.portError.set('请输入 1-65535 范围内的监听端口')
      valid = false
    }
    if (!this.form.target_host?.trim()) {
      this.targetHostError.set('请输入上游目标地址')
      valid = false
    }
    if (!this.form.target_port || this.form.target_port < 1 || this.form.target_port > 65535) {
      this.targetPortError.set('请输入 1-65535 范围内的目标端口')
      valid = false
    }
    if (!valid) return

    this.submitting.set(true)
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
    } finally {
      this.submitting.set(false)
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

  async confirmDeleteRule(rule: StreamRuleItem) {
    const res = await this.confirmSvc.ask({
      title: '删除四层转发规则确认',
      resourceName: `${rule.name} (:${rule.listen_port} -> ${rule.target_host}:${rule.target_port})`,
      message: `确定要删除四层转发规则 “${rule.name}” 吗？`,
      impact: '删除后，该端口的中继监听将被立即解除并重载 Nginx。',
      confirmText: '确认删除',
      severity: 'danger',
    })
    if (!res.confirmed) return

    try {
      await streamApi.deleteStreamRule(rule.id)
      this.toast.success('转发规则已删除')
      this.loadRules()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }
}
