import {
  Component,
  EventEmitter,
  Input,
  Output,
  OnChanges,
  SimpleChanges,
  inject,
  signal,
} from '@angular/core'
import { AgMaterialModule } from '../core/material.module'
import { ToastService } from '../core/toast.service'
import { warpApi, WarpConfig, WarpTraceInfo, WarpSystemHealth } from '@/api/warp'
import { AgModalComponent } from './ag-modal.component'

@Component({
  selector: 'ag-warp-plugin-dialog',
  standalone: true,
  imports: [AgMaterialModule, AgModalComponent],
  template: `
    <ag-modal
      [open]="open"
      title="Cloudflare WARP 双栈出站路由网关"
      icon="cloud_sync"
      [badge]="config.status === 'connected' ? '已连接' : '未连接'"
      [badgeClass]="config.status === 'connected' ? 'success' : 'neutral'"
      size="lg"
      [dirty]="isDirty()"
      [submitting]="busy"
      (close)="close.emit()"
    >
      <div class="font-mono" style="display: flex; flex-direction: column; gap: 16px">
        <!-- Trace Banner -->
        <div class="m3-tonal-card trace-grid">
          <div>
            <div class="label">出站 IPv4</div>
            <div class="val">{{ trace.ipv4 || '未分配' }}</div>
          </div>
          <div>
            <div class="label">出站 IPv6</div>
            <div class="val">{{ trace.ipv6 || '未分配' }}</div>
          </div>
          <div>
            <div class="label">边缘数据中心 (Colo)</div>
            <div class="val">{{ trace.colo || '暂无' }} ({{ trace.latency_ms || 0 }} ms)</div>
          </div>
          <div>
            <div class="label">WireGuard 内核态</div>
            <div class="val">{{ health.kernel_wireguard ? 'Kernel Native' : 'wireguard-go' }}</div>
          </div>
        </div>

        <div class="m3-grid-2">
          <div class="m3-field">
            <label for="warp-mode">工作模式 (Routing Mode)</label>
            <select id="warp-mode" [(ngModel)]="config.mode" (ngModelChange)="isDirty.set(true)">
              <option value="socks5">本地 SOCKS5 代理模式 (不影响全局路由)</option>
              <option value="ipv4">全局 IPv4 出站接管</option>
              <option value="ipv6">全局 IPv6 拓展出站</option>
              <option value="dual">IPv4 + IPv6 双栈全接管</option>
            </select>
          </div>

          <div class="m3-field">
            <label for="warp-socks-port">本地 SOCKS5 端口</label>
            <input
              id="warp-socks-port"
              type="number"
              [(ngModel)]="config.socks5_port"
              (ngModelChange)="isDirty.set(true)"
            />
          </div>

          <div class="m3-field">
            <label for="warp-license">WARP+ License Key (可选)</label>
            <input
              id="warp-license"
              type="text"
              [(ngModel)]="config.license_key"
              (ngModelChange)="isDirty.set(true)"
              placeholder="留空则使用免费 Cloudflare WARP 账户"
            />
          </div>

          <div class="m3-field">
            <label for="warp-endpoint">优选 Endpoint 节点</label>
            <input
              id="warp-endpoint"
              type="text"
              [(ngModel)]="config.endpoint"
              (ngModelChange)="isDirty.set(true)"
              placeholder="engage.cloudflareclient.com:2408"
            />
          </div>
        </div>

        <div class="action-strip">
          <button type="button" mat-stroked-button (click)="handleInstallEngine()" [disabled]="busy">
            <mat-icon>build</mat-icon>
            <span>安装/修复 WG 引擎</span>
          </button>
          <button type="button" mat-stroked-button (click)="handleRegisterAccount()" [disabled]="busy">
            <mat-icon>verified_user</mat-icon>
            <span>重新注册设备凭证</span>
          </button>
          <button type="button" mat-stroked-button (click)="handleProbeTrace()" [disabled]="busy">
            <mat-icon>network_check</mat-icon>
            <span>探测 Cloudflare Trace</span>
          </button>
        </div>
      </div>

      <ng-container modal-footer>
        <button type="button" mat-stroked-button (click)="handleSaveConfig()" [disabled]="busy">
          保存配置参数
        </button>
        <button
          *ngIf="config.status === 'connected'"
          type="button"
          mat-flat-button
          color="warn"
          (click)="handleDisconnect()"
          [disabled]="busy"
        >
          断开 WARP 隧道
        </button>
        <button
          *ngIf="config.status !== 'connected'"
          type="button"
          mat-flat-button
          color="primary"
          (click)="handleConnect()"
          [disabled]="busy"
        >
          立即启动 WARP 隧道
        </button>
      </ng-container>
    </ag-modal>
  `,
  styles: [
    `
      .trace-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 12px;
      }
      .trace-grid .label {
        font-size: 0.72rem;
        color: var(--ag-on-surface-variant);
      }
      .trace-grid .val {
        font-size: 0.88rem;
        font-weight: 700;
        color: var(--ag-primary);
        margin-top: 2px;
      }
      .action-strip {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
    `,
  ],
})
export class WarpPluginDialogComponent implements OnChanges {
  @Input() open = false
  @Output() close = new EventEmitter<void>()

  private toast = inject(ToastService)
  busy = false
  readonly isDirty = signal(false)

  config: WarpConfig = {
    installed: true,
    status: 'disconnected',
    mode: 'socks5',
    wireguard_type: 'kernel',
    license_key: '',
    account_type: 'free',
    reserved_bytes: '0,0,0',
    socks5_port: 40000,
    auto_start: true,
    endpoint: 'engage.cloudflareclient.com:2408',
  }

  trace: WarpTraceInfo = {
    warp_status: 'off',
    ipv4: '-',
    ipv6: '-',
    colo: '-',
    latency_ms: 0,
    isp: 'Cloudflare',
    country: '-',
    account_type: 'free',
    wireguard_type: 'kernel',
    mode: 'socks5',
    socks5_port: 40000,
  }

  health: WarpSystemHealth = {
    kernel_wireguard: true,
    wireguard_tools: true,
    wireguard_go: { installed: true, version: '0.0.2023', path: '/usr/bin/wireguard-go' },
    account: { registered: false, account_id: '', v4: '', v6: '', account_type: 'free' },
    tunnel: { active: false, interface: 'wgcf', transfer: '0 B' },
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['open'] && this.open) {
      this.isDirty.set(false)
      this.loadStatus()
    }
  }

  async loadStatus() {
    try {
      const res = await warpApi.getStatus()
      const d = res.data?.data
      if (d) {
        if (d.config) this.config = { ...this.config, ...d.config }
        if (d.trace) this.trace = { ...this.trace, ...d.trace }
        if (d.system_health) this.health = { ...this.health, ...d.system_health }
        this.isDirty.set(false)
      }
    } catch {}
  }

  async handleInstallEngine() {
    this.busy = true
    try {
      await warpApi.installEngine()
      this.toast.success('WireGuard 引擎组件安装就绪')
      await this.loadStatus()
    } catch (e: any) {
      this.toast.error(e.message)
    } finally {
      this.busy = false
    }
  }

  async handleRegisterAccount() {
    this.busy = true
    try {
      await warpApi.registerAccount()
      this.toast.success('WARP 设备凭证注册成功')
      await this.loadStatus()
    } catch (e: any) {
      this.toast.error(e.message)
    } finally {
      this.busy = false
    }
  }

  async handleProbeTrace() {
    this.busy = true
    try {
      const res = await warpApi.probeTrace()
      if (res.data?.data?.trace) this.trace = res.data.data.trace
      this.toast.success('Cloudflare 边缘节点探测完成')
    } catch (e: any) {
      this.toast.error(e.message)
    } finally {
      this.busy = false
    }
  }

  async handleSaveConfig() {
    this.busy = true
    try {
      await warpApi.updateConfig(this.config)
      this.isDirty.set(false)
      this.toast.success('WARP 配置已保存')
    } catch (e: any) {
      this.toast.error(e.message)
    } finally {
      this.busy = false
    }
  }

  async handleConnect() {
    this.busy = true
    try {
      const res = await warpApi.connect(this.config)
      if (res.data?.data?.config) this.config = res.data.data.config
      if (res.data?.data?.trace) this.trace = res.data.data.trace
      this.isDirty.set(false)
      this.toast.success('Cloudflare WARP 双栈隧道已连接')
    } catch (e: any) {
      this.toast.error(e.message)
    } finally {
      this.busy = false
    }
  }

  async handleDisconnect() {
    this.busy = true
    try {
      const res = await warpApi.disconnect()
      if (res.data?.data?.config) this.config = res.data.data.config
      this.toast.info('WARP 隧道已断开')
    } catch (e: any) {
      this.toast.error(e.message)
    } finally {
      this.busy = false
    }
  }
}
