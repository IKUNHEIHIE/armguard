import { Component, OnInit, inject, signal } from '@angular/core'
import { AgMaterialModule } from '../../core/material.module'
import { SystemService } from '../../core/system.service'
import { AuthService } from '../../core/auth.service'
import { ToastService } from '../../core/toast.service'
import { settingsApi, PanelSettings, PanelBackupItem } from '@/api/settings'
import { aiApi, AIConfig } from '@/api/ai'
import { downloadWithTicket } from '@/utils/download'

@Component({
  selector: 'ag-settings',
  standalone: true,
  imports: [AgMaterialModule],
  template: `
    <div class="m3-page">
      <div class="m3-page-header">
        <div>
          <h2 class="m3-page-title">
            <mat-icon style="color: var(--ag-primary)">tune</mat-icon>
            <span>面板核心设置与安全中心 (Panel Settings)</span>
          </h2>
          <p class="m3-page-subtitle font-mono">
            端口与 HTTPS 证书绑定、管理员凭证更新、大模型 API 接入、Eco 节能推流与面板配置灾备 · 版本:
            {{ settings.current_version || 'v0.2.0' }} ({{ settings.build_commit || settings.runtime?.build_commit || 'source' }})
          </p>
        </div>
        <div class="m3-page-actions">
          <button mat-stroked-button (click)="handleCreateBackup()" [disabled]="backingUp()">
            <mat-icon>archive</mat-icon>
            <span>{{ backingUp() ? '正在归档...' : '一键备份配置' }}</span>
          </button>
          <button mat-flat-button color="primary" (click)="saveBaseSettings()" [disabled]="saving()">
            <mat-icon>save</mat-icon>
            <span>{{ saving() ? '保存中...' : '保存当前设置' }}</span>
          </button>
        </div>
      </div>

      <!-- Plaintext HTTP Warning Banner (REV-004) -->
      <div
        *ngIf="(settings.runtime?.effective_protocol || 'http') === 'http'"
        class="m3-card font-mono"
        style="border-color: var(--ag-warning); background: var(--ag-warning-container); display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px"
      >
        <div style="display: flex; align-items: center; gap: 10px; color: var(--ag-warning)">
          <mat-icon>lock_open</mat-icon>
          <div>
            <strong>当前管理链路使用明文 HTTP / WS</strong>
            <div style="font-size: 0.76rem">
              在不受信任的网络环境中，登录密码、Bearer 令牌与 Web 终端流量可能被监听或篡改。建议立即配置受信任 TLS 证书或生成本机 HTTPS 证书。
            </div>
          </div>
        </div>
        <button mat-flat-button color="primary" (click)="generateSelfSignedHttps()" [disabled]="generatingSsl()">
          {{ generatingSsl() ? '正在生成...' : '一键生成自签名 HTTPS 证书并启用' }}
        </button>
      </div>

      <mat-tab-group animationDuration="160ms">
        <!-- Tab 1: Access & Security -->
        <mat-tab label="面板安全与访问">
          <div class="m3-grid-2 font-mono" style="margin-top: 14px">
            <div class="m3-card" style="display: flex; flex-direction: column; gap: 14px">
              <div style="font-weight: 700; font-size: 0.92rem">端口、安全入口与会话超时</div>

              <div class="m3-field">
                <label>面板监听端口 (Port 1-65535)</label>
                <input type="number" [(ngModel)]="settings.port" min="1" max="65535" />
                <div class="m3-hint">
                  当前生效:
                  <strong style="color: var(--ag-success)">
                    {{ (settings.runtime?.effective_protocol || 'http').toUpperCase() }} :{{
                      settings.runtime?.effective_port || settings.port
                    }}
                  </strong>
                  | 已保存端口: {{ settings.runtime?.saved_port || settings.port }}
                </div>
                <div *ngIf="settings.runtime?.restart_required" style="color: var(--ag-warning); font-size: 0.72rem">
                  端口或 HTTPS 配置已变更，重启面板服务后在新地址生效。
                </div>
              </div>

              <div class="m3-field">
                <label>安全入口路径 (Security Entrance)</label>
                <input type="text" [(ngModel)]="settings.security_entrance" placeholder="/armguard" />
              </div>

              <div class="m3-field">
                <label>会话无操作空闲超时 (分钟, 5 - 1440)</label>
                <input type="number" [(ngModel)]="settings.session_timeout_minutes" min="5" max="1440" />
              </div>
            </div>

            <div class="m3-card" style="display: flex; flex-direction: column; gap: 14px">
              <div style="font-weight: 700; font-size: 0.92rem">防爆破锁定、IP 白名单与面板 HTTPS</div>

              <div class="m3-field">
                <label>登录 IP 白名单 (留空允许所有 IP)</label>
                <textarea rows="3" [(ngModel)]="settings.ip_whitelist" placeholder="127.0.0.1&#10;192.168.1.0/24"></textarea>
              </div>

              <div class="m3-grid-2">
                <div class="m3-field">
                  <label>连续错误锁定阈值 (3-20 次)</label>
                  <input type="number" [(ngModel)]="settings.max_login_retry" min="3" max="20" />
                </div>
                <div class="m3-field">
                  <label>自动锁定时长 (分钟)</label>
                  <input type="number" [(ngModel)]="settings.login_lock_minutes" min="1" max="1440" />
                </div>
              </div>

              <div class="m3-tonal-card" style="display: flex; flex-direction: column; gap: 10px">
                <div style="display: flex; justify-content: space-between; align-items: center">
                  <strong>开启面板自身 HTTPS 加密监听</strong>
                  <mat-slide-toggle [(ngModel)]="settings.ssl_enabled"></mat-slide-toggle>
                </div>

                <ng-container *ngIf="settings.ssl_enabled">
                  <div class="m3-field">
                    <label>面板证书绝对路径 (PEM Fullchain)</label>
                    <input type="text" [(ngModel)]="settings.panel_ssl_cert" placeholder="/etc/ssl/armguard/fullchain.pem" />
                  </div>
                  <div class="m3-field">
                    <label>面板私钥绝对路径 (PEM Private Key)</label>
                    <input type="text" [(ngModel)]="settings.panel_ssl_key" placeholder="/etc/ssl/armguard/privkey.pem" />
                  </div>
                  <div class="m3-hint">
                    应急提示：若证书失效可在宿主机设置环境变量 <code>ARMGUARD_FORCE_HTTP=1</code> 重启恢复 HTTP。
                  </div>
                </ng-container>
              </div>
            </div>
          </div>
        </mat-tab>

        <!-- Tab 2: Admin Credentials & AI LLM -->
        <mat-tab label="管理员凭证与 AI 引擎">
          <div class="m3-grid-2 font-mono" style="margin-top: 14px">
            <div class="m3-card" style="display: flex; flex-direction: column; gap: 14px">
              <div style="font-weight: 700; font-size: 0.92rem">修改管理员用户名与密码</div>

              <div class="m3-field">
                <label>当前原密码 (必填)</label>
                <input type="password" [(ngModel)]="pwdForm.old_password" placeholder="请输入当前管理员密码" />
              </div>
              <div class="m3-field">
                <label>管理员新用户名 (可选，留空保持不变)</label>
                <input type="text" [(ngModel)]="pwdForm.new_username" placeholder="admin" />
              </div>
              <div class="m3-field">
                <label>新登录密码 (至少 8 位)</label>
                <input type="password" [(ngModel)]="pwdForm.new_password" placeholder="输入至少 8 位新密码" />
              </div>
              <button mat-flat-button color="primary" (click)="handleChangePassword()">
                确认修改管理员凭证
              </button>

              <div class="m3-tonal-card" style="margin-top: 8px">
                <div style="font-weight: 600; margin-bottom: 6px">OpenAPI Bearer Token</div>
                <div style="display: flex; gap: 8px">
                  <input
                    type="text"
                    readonly
                    [value]="settings.api_token"
                    style="flex: 1; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--ag-outline); background: var(--ag-surface-lowest); color: var(--ag-on-surface)"
                  />
                  <button mat-stroked-button (click)="copyToken()">复制</button>
                  <button mat-stroked-button color="warn" (click)="regenerateToken()">重置</button>
                </div>
              </div>
            </div>

            <div class="m3-card" style="display: flex; flex-direction: column; gap: 14px">
              <div style="display: flex; justify-content: space-between; align-items: center">
                <strong>大模型 API 引擎配置 (OpenAI 兼容)</strong>
                <mat-slide-toggle [(ngModel)]="aiForm.enabled">启用 AI</mat-slide-toggle>
              </div>

              <div class="m3-field">
                <label>API Base URL</label>
                <input type="text" [(ngModel)]="aiForm.api_url" placeholder="https://api.deepseek.com/v1" />
              </div>
              <div class="m3-field">
                <label>模型名称 (Model)</label>
                <input type="text" [(ngModel)]="aiForm.model" placeholder="deepseek-chat / gpt-4o-mini" />
              </div>
              <div class="m3-field">
                <label>API Key</label>
                <input type="password" [(ngModel)]="aiForm.api_key" placeholder="sk-..." />
              </div>

              <div style="display: flex; gap: 10px">
                <button mat-stroked-button (click)="testAi()">测试连通性</button>
                <button mat-flat-button color="primary" (click)="saveAi()">保存 AI 配置</button>
              </div>
            </div>
          </div>
        </mat-tab>

        <!-- Tab 3: Brand & Eco Mode -->
        <mat-tab label="品牌定制与 Eco 节能">
          <div class="m3-grid-2 font-mono" style="margin-top: 14px">
            <div class="m3-card" style="display: flex; flex-direction: column; gap: 14px">
              <div class="m3-field">
                <label>面板标题 (Panel Title)</label>
                <input type="text" [(ngModel)]="settings.panel_title" />
              </div>
              <div class="m3-field">
                <label>系统时区 (Timezone)</label>
                <select [(ngModel)]="settings.timezone" (change)="changeTimezone()">
                  <option value="Asia/Shanghai">Asia/Shanghai (CST +0800)</option>
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">America/New_York</option>
                  <option value="Europe/London">Europe/London</option>
                  <option value="Asia/Tokyo">Asia/Tokyo</option>
                </select>
              </div>
            </div>

            <div class="m3-card" style="display: flex; flex-direction: column; gap: 14px">
              <div style="display: flex; justify-content: space-between; align-items: center">
                <div>
                  <strong>ARM 自适应节能推流 (Eco Mode)</strong>
                  <div style="font-size: 0.72rem; color: var(--ag-on-surface-variant)">
                    单核或内存不高于阈值时自动将采样周期由 1000ms 调整为 3000ms
                  </div>
                </div>
                <mat-slide-toggle [(ngModel)]="settings.eco_mode_enabled"></mat-slide-toggle>
              </div>

              <div *ngIf="settings.eco_mode_enabled" class="m3-field">
                <label>节能触发内存阈值 (MB, 128 - 65536)</label>
                <input type="number" [(ngModel)]="settings.eco_mode_threshold_mb" min="128" max="65536" />
              </div>
            </div>
          </div>
        </mat-tab>

        <!-- Tab 4: Webhook Alerts -->
        <mat-tab label="Webhook 告警通知">
          <div class="m3-card font-mono" style="margin-top: 14px; display: flex; flex-direction: column; gap: 14px">
            <div class="m3-tonal-card" style="font-size: 0.78rem; border-color: var(--ag-warning); color: var(--ag-warning); display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px">
              <div>
                <strong>⚠️ 自动事件推送尚未实现 (alert_auto_push_supported = false)</strong>
                <div style="margin-top: 4px; color: var(--ag-on-surface-variant)">
                  当前版本仅支持保存 Webhook 通道配置及手动触发真实 HTTP 与平台业务状态码（飞书/钉钉/企业微信/Telegram）连通性测试，负载/磁盘/登录失败自动事件后台触发推送尚未实现。
                </div>
              </div>
              <span class="m3-badge warning">自动事件触发：未实现</span>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center">
              <strong>保存 Webhook 告警通道配置（仅用于连通性测试投递）</strong>
              <mat-slide-toggle [(ngModel)]="settings.webhook_enabled"></mat-slide-toggle>
            </div>

            <div *ngIf="settings.webhook_enabled" class="m3-grid-2">
              <div class="m3-field">
                <label>通道类型</label>
                <select [(ngModel)]="settings.webhook_type">
                  <option value="feishu">飞书自定义机器人 (Feishu)</option>
                  <option value="dingtalk">钉钉群机器人 (DingTalk)</option>
                  <option value="wecom">企业微信群机器人 (WeCom)</option>
                  <option value="telegram">Telegram Bot</option>
                  <option value="custom">自定义 JSON Webhook</option>
                </select>
              </div>
              <div class="m3-field">
                <label>Webhook URL</label>
                <input type="text" [(ngModel)]="settings.webhook_url" placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..." />
              </div>
            </div>

            <div *ngIf="settings.webhook_enabled">
              <button mat-stroked-button (click)="testWebhook()">发送真实连通性测试消息</button>
            </div>
          </div>
        </mat-tab>

        <!-- Tab 5: Backup & Restore -->
        <mat-tab label="备份与引擎维护">
          <div class="m3-card font-mono" style="margin-top: 14px; display: flex; flex-direction: column; gap: 14px">
            <div style="display: flex; justify-content: space-between; align-items: center">
              <div>
                <strong>面板配置数据归档 (/var/lib/armguard)</strong>
                <div style="font-size: 0.72rem; color: var(--ag-on-surface-variant)">
                  包含面板配置、管理员凭证哈希、站点/SSL/数据库/计划任务元数据与操作日志
                </div>
              </div>
              <div style="display: flex; gap: 8px">
                <button mat-stroked-button (click)="clearCache()">清理缓存</button>
                <button mat-stroked-button color="warn" (click)="restartEngine()">重启面板守护进程</button>
                <button mat-flat-button color="primary" (click)="handleCreateBackup()">生成新备份</button>
              </div>
            </div>

            <div *ngFor="let b of backups()" class="m3-tonal-card" style="display: flex; justify-content: space-between; align-items: center">
              <div>
                <strong>{{ b.file_name }}</strong>
                <div style="font-size: 0.72rem; color: var(--ag-on-surface-variant)">
                  {{ b.created_at }} | {{ b.size_kb }} KB
                </div>
              </div>
              <div style="display: flex; gap: 8px">
                <button mat-stroked-button (click)="downloadBackup(b)">下载归档</button>
                <button mat-stroked-button color="warn" (click)="deleteBackup(b)">删除</button>
              </div>
            </div>
            <div *ngIf="backups().length === 0" class="m3-empty-state">暂无历史面板备份归档。</div>
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
})
export class SettingsComponent implements OnInit {
  private system = inject(SystemService)
  private auth = inject(AuthService)
  private toast = inject(ToastService)

  readonly saving = signal(false)
  readonly backingUp = signal(false)
  readonly generatingSsl = signal(false)
  readonly backups = signal<PanelBackupItem[]>([])

  settings: PanelSettings = {
    panel_title: 'ArmGuard',
    port: 8888,
    security_entrance: '/armguard',
    ssl_enabled: false,
    panel_ssl_cert: '',
    panel_ssl_key: '',
    session_timeout_minutes: 120,
    ip_whitelist: '',
    max_login_retry: 5,
    login_lock_minutes: 15,
    eco_mode_enabled: true,
    eco_mode_threshold_mb: 2048,
    current_version: 'v0.2.0',
    latest_version: 'v0.2.0',
    has_update: false,
    timezone: 'Asia/Shanghai',
    api_token: '',
    two_factor_enabled: false,
    webhook_enabled: false,
    webhook_type: 'feishu',
    webhook_url: '',
    alert_events: ['high_load', 'disk_low', 'login_fail'],
  }

  pwdForm = { old_password: '', new_username: '', new_password: '' }

  aiForm: AIConfig = {
    enabled: true,
    api_url: 'https://api.deepseek.com/v1',
    api_key: '',
    model: 'deepseek-chat',
    temperature: 0.3,
    max_tokens: 2048,
    is_configured: false,
  }

  ngOnInit() {
    this.loadSettings()
    this.loadBackups()
    this.loadAi()
  }

  async loadSettings() {
    try {
      const res = await settingsApi.getSettings()
      if (res.data?.data) {
        this.settings = { ...this.settings, ...res.data.data }
        if (this.settings.panel_title) {
          this.system.setPanelTitle(this.settings.panel_title)
        }
      }
    } catch (e: any) {
      this.toast.error(`加载面板设置失败: ${e.message}`)
    }
  }

  async generateSelfSignedHttps() {
    this.generatingSsl.set(true)
    try {
      const res = await settingsApi.generateSelfSignedCert()
      await this.loadSettings()
      this.toast.success(res.data?.message || '自签名 HTTPS 证书已生成并启用，请重启面板服务生效')
    } catch (e: any) {
      this.toast.error(e.message)
    } finally {
      this.generatingSsl.set(false)
    }
  }

  async loadBackups() {
    try {
      const res = await settingsApi.getPanelBackups()
      this.backups.set(res.data?.data?.list || [])
    } catch (e: any) {
      this.toast.error(`加载备份列表失败: ${e.message}`)
    }
  }

  async loadAi() {
    try {
      const res = await aiApi.getConfig()
      if (res.data?.data) this.aiForm = { ...this.aiForm, ...res.data.data }
    } catch (e: any) {
      this.toast.error(`加载 AI 配置失败: ${e.message}`)
    }
  }

  async saveBaseSettings() {
    this.saving.set(true)
    try {
      const res = await settingsApi.updateSettings(this.settings)
      await this.loadSettings()
      this.toast.success(res.data?.message || '面板设置已保存')
    } catch (e: any) {
      this.toast.error(e.message)
    } finally {
      this.saving.set(false)
    }
  }

  async handleChangePassword() {
    try {
      await settingsApi.changeAdminPassword({
        old_password: this.pwdForm.old_password,
        new_username: this.pwdForm.new_username || undefined,
        new_password: this.pwdForm.new_password,
      })
      await this.auth.refreshUserInfo()
      this.toast.success('管理员凭证已成功更新')
      this.pwdForm = { old_password: '', new_username: '', new_password: '' }
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  copyToken() {
    navigator.clipboard.writeText(this.settings.api_token || '')
    this.toast.success('API Token 已复制')
  }

  async regenerateToken() {
    if (!confirm('确定重置 API Token 吗？')) return
    try {
      const res = await settingsApi.regenerateApiToken()
      if (res.data?.data?.api_token) {
        this.settings.api_token = res.data.data.api_token
        this.toast.success('API Token 已重置')
      }
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async saveAi() {
    try {
      await aiApi.updateConfig(this.aiForm)
      this.toast.success('大模型 API 配置已保存')
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async testAi() {
    try {
      const res = await aiApi.testConnection(this.aiForm)
      this.toast.success(res.data?.message || '大模型连通正常')
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async changeTimezone() {
    try {
      await settingsApi.updateTimezone(this.settings.timezone)
      this.toast.success(`系统时区已更新为 ${this.settings.timezone}`)
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async testWebhook() {
    try {
      const res = await settingsApi.testWebhook({
        webhook_type: this.settings.webhook_type,
        webhook_url: this.settings.webhook_url,
      })
      this.toast.success(res.data?.message || 'Webhook 测试消息投递成功')
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async handleCreateBackup() {
    this.backingUp.set(true)
    try {
      const res = await settingsApi.createPanelBackup()
      this.toast.success(`备份已生成: ${res.data?.data?.file_name}`)
      this.loadBackups()
    } catch (e: any) {
      this.toast.error(e.message)
    } finally {
      this.backingUp.set(false)
    }
  }

  async downloadBackup(b: PanelBackupItem) {
    try {
      await downloadWithTicket(
        `/api/v1/settings/backup/download?file_name=${encodeURIComponent(b.file_name)}`,
        b.file_name
      )
      this.toast.success(`开始下载: ${b.file_name}`)
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async deleteBackup(b: PanelBackupItem) {
    if (!confirm(`确定删除备份 ${b.file_name} 吗？`)) return
    try {
      await settingsApi.deletePanelBackup(b.file_name)
      this.toast.success('备份已删除')
      this.loadBackups()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async clearCache() {
    try {
      await settingsApi.clearPanelCache()
      this.toast.success('静态与运行缓存已清理')
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async restartEngine() {
    if (!confirm('确定重启面板守护进程吗？')) return
    try {
      const res = await settingsApi.restartPanelEngine()
      this.toast.info(res.data?.message || '面板正在重启')
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }
}
