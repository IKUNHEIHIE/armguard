import { Component, OnInit, computed, inject, signal } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { AgMaterialModule } from '../../core/material.module'
import { SystemService } from '../../core/system.service'
import { AuthService } from '../../core/auth.service'
import { ToastService } from '../../core/toast.service'
import { ConfirmService } from '../../core/confirm.service'
import { TaskCenterService } from '../../core/task-center.service'
import { HasUnsavedChanges } from '../../core/unsaved-changes.guard'
import { AgStateBannerComponent } from '../../components/ag-state-banner.component'
import { settingsApi, PanelSettings, PanelBackupItem } from '@/api/settings'
import { aiApi, AIConfig } from '@/api/ai'
import { downloadWithTicket } from '@/utils/download'
import { copyToClipboard } from '@/utils/clipboard'

@Component({
  selector: 'ag-settings',
  standalone: true,
  imports: [AgMaterialModule, AgStateBannerComponent],
  template: `
    <div class="m3-page">
      <div class="m3-page-header">
        <div>
          <h2 class="m3-page-title">
            <mat-icon style="color: var(--ag-primary)">tune</mat-icon>
            <span>面板设置</span>
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
          <button
            *ngIf="settings.runtime?.restart_required"
            mat-flat-button
            color="warn"
            (click)="restartEngine()"
          >
            <mat-icon>restart_alt</mat-icon>
            <span>立即重启面板生效</span>
          </button>
        </div>
      </div>

      <!-- Restart Required Persistent Notification Strip (FE-005) -->
      <div
        *ngIf="settings.runtime?.restart_required"
        class="m3-tonal-card font-mono"
        style="border-color: var(--ag-warning); background: var(--ag-warning-container); color: var(--ag-on-warning-container); display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px"
      >
        <div style="display: flex; align-items: center; gap: 8px">
          <mat-icon style="color: var(--ag-warning)">info_outline</mat-icon>
          <span><strong>端口或 HTTPS 证书配置已变更 (已保存)</strong>：需重启面板守护进程后在新地址生效。</span>
        </div>
        <button mat-flat-button color="warn" (click)="restartEngine()">立即重启面板</button>
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

      <!-- Unified State Banners (FE-001) -->
      <ag-state-banner
        *ngIf="loading()"
        state="loading"
        title="正在加载系统设置与安全策略..."
      />

      <ag-state-banner
        *ngIf="loadError()"
        state="error"
        title="系统设置加载失败"
        [description]="loadError()!"
        primaryActionLabel="重试加载"
        (primaryAction)="loadSettings()"
      />

      <mat-tab-group
        *ngIf="!loading() && !loadError()"
        [selectedIndex]="selectedTabIndex()"
        (selectedIndexChange)="onTabChange($event)"
        animationDuration="160ms"
      >
        <!-- Tab 0: Access & Security (FE-005) -->
        <mat-tab label="安全设置">
          <div class="m3-grid-2 font-mono" style="margin-top: 14px">
            <div class="m3-card" style="display: flex; flex-direction: column; gap: 14px">
              <div style="display: flex; justify-content: space-between; align-items: center">
                <div style="font-weight: 700; font-size: 0.92rem">端口、安全入口与会话超时</div>
                <span *ngIf="isAccessDirty()" class="m3-badge warning">● 未保存修改</span>
              </div>

              <div class="m3-field">
                <label for="settings-port-input">面板监听端口 (Port 1-65535) <span class="m3-req">*</span></label>
                <input id="settings-port-input" type="number" [(ngModel)]="settings.port" min="1" max="65535" />
                <div class="m3-hint">
                  当前生效:
                  <strong style="color: var(--ag-success)">
                    {{ (settings.runtime?.effective_protocol || 'http').toUpperCase() }} :{{
                      settings.runtime?.effective_port || settings.port
                    }}
                  </strong>
                  | 已保存端口: {{ settings.runtime?.saved_port || settings.port }}
                </div>
              </div>

              <div class="m3-field">
                <label for="settings-sec-entrance">安全入口路径 (Security Entrance) <span class="m3-req">*</span></label>
                <input id="settings-sec-entrance" type="text" [(ngModel)]="settings.security_entrance" placeholder="/armguard" />
                <div class="m3-hint">必须以 / 开头，例如 /armguard 或 /mgr88</div>
              </div>

              <div class="m3-field">
                <label for="settings-timeout">会话无操作空闲超时 (分钟, 5 - 1440)</label>
                <input id="settings-timeout" type="number" [(ngModel)]="settings.session_timeout_minutes" min="5" max="1440" />
              </div>
            </div>

            <div class="m3-card" style="display: flex; flex-direction: column; gap: 14px">
              <div style="font-weight: 700; font-size: 0.92rem">防爆破锁定、IP 白名单与面板 HTTPS</div>

              <div class="m3-field">
                <label for="settings-ip-whitelist">登录 IP 白名单 (留空允许所有 IP，每行一个 IP 或 CIDR)</label>
                <textarea id="settings-ip-whitelist" rows="3" [(ngModel)]="settings.ip_whitelist" placeholder="127.0.0.1&#10;192.168.1.0/24"></textarea>
              </div>

              <div class="m3-grid-2">
                <div class="m3-field">
                  <label for="settings-max-retry">连续错误锁定阈值 (3-20 次)</label>
                  <input id="settings-max-retry" type="number" [(ngModel)]="settings.max_login_retry" min="3" max="20" />
                </div>
                <div class="m3-field">
                  <label for="settings-lock-min">自动锁定时长 (分钟)</label>
                  <input id="settings-lock-min" type="number" [(ngModel)]="settings.login_lock_minutes" min="1" max="1440" />
                </div>
              </div>

              <div class="m3-tonal-card" style="display: flex; flex-direction: column; gap: 10px">
                <div style="display: flex; justify-content: space-between; align-items: center">
                  <strong>开启面板自身 HTTPS 加密监听</strong>
                  <mat-slide-toggle [(ngModel)]="settings.ssl_enabled"></mat-slide-toggle>
                </div>

                <ng-container *ngIf="settings.ssl_enabled">
                  <div class="m3-field">
                    <label for="settings-ssl-cert">面板证书绝对路径 (PEM Fullchain)</label>
                    <input id="settings-ssl-cert" type="text" [(ngModel)]="settings.panel_ssl_cert" placeholder="/etc/ssl/armguard/fullchain.pem" />
                  </div>
                  <div class="m3-field">
                    <label for="settings-ssl-key">面板私钥绝对路径 (PEM Private Key)</label>
                    <input id="settings-ssl-key" type="text" [(ngModel)]="settings.panel_ssl_key" placeholder="/etc/ssl/armguard/privkey.pem" />
                  </div>
                  <div class="m3-hint">
                    应急提示：若证书失效可在宿主机设置环境变量 <code>ARMGUARD_FORCE_HTTP=1</code> 重启恢复 HTTP。
                  </div>
                </ng-container>
              </div>
            </div>
          </div>

          <div style="margin-top: 14px; display: flex; justify-content: flex-end; gap: 10px">
            <button
              mat-flat-button
              color="primary"
              [disabled]="savingAccess() || !isAccessDirty()"
              (click)="saveAccessSettings()"
            >
              {{ savingAccess() ? '保存中...' : '保存访问与安全设置' }}
            </button>
          </div>

          <!-- 管理员凭证与 AI 引擎（已合并进安全设置） -->
          <div class="m3-grid-2 font-mono" style="margin-top: 14px">
            <!-- Admin Credentials -->
            <div class="m3-card" style="display: flex; flex-direction: column; gap: 14px">
              <div style="display: flex; justify-content: space-between; align-items: center">
                <div style="font-weight: 700; font-size: 0.92rem">修改管理员用户名与密码</div>
                <span *ngIf="isPwdDirty()" class="m3-badge warning">● 未保存输入</span>
              </div>

              <div class="m3-field" [class.has-error]="!!pwdOldError()">
                <label for="pwd-old">当前原密码 <span class="m3-req">*</span></label>
                <div style="display: flex; gap: 8px">
                  <input
                    id="pwd-old"
                    [type]="showOldPwd() ? 'text' : 'password'"
                    [(ngModel)]="pwdForm.old_password"
                    (ngModelChange)="pwdOldError.set('')"
                    placeholder="请输入当前管理员密码"
                    style="flex: 1"
                  />
                  <button mat-icon-button type="button" (click)="showOldPwd.set(!showOldPwd())" aria-label="切换原密码可见性">
                    <mat-icon>{{ showOldPwd() ? 'visibility_off' : 'visibility' }}</mat-icon>
                  </button>
                </div>
                <div *ngIf="pwdOldError()" class="m3-field-error" role="alert">{{ pwdOldError() }}</div>
              </div>

              <div class="m3-field">
                <label for="pwd-new-user">管理员新用户名 (可选，留空保持当前不变)</label>
                <input id="pwd-new-user" type="text" [(ngModel)]="pwdForm.new_username" placeholder="admin" />
              </div>

              <div class="m3-field" [class.has-error]="!!pwdNewError()">
                <label for="pwd-new">新登录密码 (至少 8 位) <span class="m3-req">*</span></label>
                <div style="display: flex; gap: 8px">
                  <input
                    id="pwd-new"
                    [type]="showNewPwd() ? 'text' : 'password'"
                    [(ngModel)]="pwdForm.new_password"
                    (ngModelChange)="validateNewPassword()"
                    placeholder="输入至少 8 位新密码"
                    style="flex: 1"
                  />
                  <button mat-icon-button type="button" (click)="showNewPwd.set(!showNewPwd())" aria-label="切换新密码可见性">
                    <mat-icon>{{ showNewPwd() ? 'visibility_off' : 'visibility' }}</mat-icon>
                  </button>
                </div>
                <div *ngIf="pwdNewError()" class="m3-field-error" role="alert">{{ pwdNewError() }}</div>
              </div>

              <button
                mat-flat-button
                color="primary"
                [disabled]="savingPwd() || !pwdForm.old_password || !pwdForm.new_password"
                (click)="handleChangePassword()"
              >
                {{ savingPwd() ? '正在更新凭证...' : '更新管理员凭证' }}
              </button>

              <!-- OpenAPI Token (FE-018: Masked by default) -->
              <div class="m3-tonal-card" style="margin-top: 8px">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px">
                  <span style="font-weight: 600">OpenAPI Bearer Token</span>
                  <span class="m3-badge neutral" style="font-size: 0.68rem">外部调用鉴权</span>
                </div>
                <div style="display: flex; gap: 8px; align-items: center">
                  <input
                    id="settings-api-token"
                    [type]="showToken() ? 'text' : 'password'"
                    readonly
                    [value]="settings.api_token || '尚未生成 Token'"
                    style="flex: 1; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--ag-outline); background: var(--ag-surface-lowest); color: var(--ag-on-surface); font-family: 'JetBrains Mono', monospace"
                  />
                  <button
                    mat-icon-button
                    type="button"
                    (click)="showToken.set(!showToken())"
                    [attr.aria-label]="showToken() ? '隐藏 Token' : '显示 Token'"
                  >
                    <mat-icon>{{ showToken() ? 'visibility_off' : 'visibility' }}</mat-icon>
                  </button>
                  <button
                    mat-stroked-button
                    [disabled]="!settings.api_token"
                    (click)="copyApiToken()"
                  >
                    复制
                  </button>
                  <button mat-stroked-button color="warn" (click)="regenerateToken()">重置</button>
                </div>
              </div>
            </div>

            <!-- AI LLM Settings -->
            <div class="m3-card" style="display: flex; flex-direction: column; gap: 14px">
              <div style="display: flex; justify-content: space-between; align-items: center">
                <div style="display: flex; align-items: center; gap: 8px">
                  <strong>大模型 API 引擎配置 (OpenAI 兼容)</strong>
                  <span *ngIf="isAiDirty()" class="m3-badge warning">● 未保存修改</span>
                </div>
                <mat-slide-toggle [(ngModel)]="aiForm.enabled">启用 AI</mat-slide-toggle>
              </div>

              <div class="m3-field">
                <label for="ai-url">API Base URL</label>
                <input id="ai-url" type="text" [(ngModel)]="aiForm.api_url" placeholder="https://api.deepseek.com/v1" />
              </div>
              <div class="m3-field">
                <label for="ai-model">模型名称 (Model)</label>
                <input id="ai-model" type="text" [(ngModel)]="aiForm.model" placeholder="deepseek-chat / gpt-4o-mini" />
              </div>
              <div class="m3-field">
                <label for="ai-key">API Key (密钥将加密保存在本机)</label>
                <div style="display: flex; gap: 8px">
                  <input
                    id="ai-key"
                    [type]="showAiKey() ? 'text' : 'password'"
                    [(ngModel)]="aiForm.api_key"
                    placeholder="sk-..."
                    style="flex: 1"
                  />
                  <button mat-icon-button type="button" (click)="showAiKey.set(!showAiKey())" aria-label="切换 AI 密钥可见性">
                    <mat-icon>{{ showAiKey() ? 'visibility_off' : 'visibility' }}</mat-icon>
                  </button>
                </div>
              </div>

              <div style="display: flex; gap: 10px; margin-top: auto">
                <button mat-stroked-button [disabled]="testingAi()" (click)="testAi()">
                  {{ testingAi() ? '连通性测试中...' : '测试连通性' }}
                </button>
                <button
                  mat-flat-button
                  color="primary"
                  [disabled]="savingAi() || !isAiDirty()"
                  (click)="saveAi()"
                >
                  {{ savingAi() ? '保存中...' : '保存 AI 引擎配置' }}
                </button>
              </div>
            </div>
          </div>
        </mat-tab>

        <!-- Tab 2: Brand & Eco Mode (FE-005) -->
        <mat-tab label="基础设置">
          <div class="m3-grid-2 font-mono" style="margin-top: 14px">
            <div class="m3-card" style="display: flex; flex-direction: column; gap: 14px">
              <div style="display: flex; justify-content: space-between; align-items: center">
                <div style="font-weight: 700; font-size: 0.92rem">品牌标题与系统时区</div>
                <span *ngIf="isBrandDirty()" class="m3-badge warning">● 未保存修改</span>
              </div>

              <div class="m3-field">
                <label for="settings-panel-title">面板标题 (Panel Title) <span class="m3-req">*</span></label>
                <input id="settings-panel-title" type="text" [(ngModel)]="settings.panel_title" />
              </div>

              <div class="m3-field">
                <label for="settings-timezone-select">系统时区 (Timezone)</label>
                <select id="settings-timezone-select" [(ngModel)]="settings.timezone">
                  <option value="Asia/Shanghai">Asia/Shanghai (CST +0800)</option>
                  <option value="UTC">UTC (协调世界时)</option>
                  <option value="America/New_York">America/New_York (EST/EDT)</option>
                  <option value="Europe/London">Europe/London (GMT/BST)</option>
                  <option value="Asia/Tokyo">Asia/Tokyo (JST +0900)</option>
                </select>
                <div class="m3-hint">保存后将同步写入系统 /etc/timezone 并更新计划任务时间调度基准。</div>
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
                <label for="settings-eco-threshold">节能触发内存阈值 (MB, 128 - 65536)</label>
                <input id="settings-eco-threshold" type="number" [(ngModel)]="settings.eco_mode_threshold_mb" min="128" max="65536" />
              </div>
            </div>
          </div>

          <div class="m3-card font-mono" style="margin-top: 14px; display: flex; flex-direction: column; gap: 14px">
            <div style="display: flex; justify-content: space-between; align-items: center">
              <div>
                <strong>面板日志定时清理</strong>
                <div style="font-size: 0.72rem; color: var(--ag-on-surface-variant)">
                  按保留天数自动清理审计与操作日志（operations.json），启动时与每 6 小时执行一次
                </div>
              </div>
            </div>
            <div class="m3-field">
              <label for="settings-log-retention">日志保留天数 (1 - 365，默认 15 天)</label>
              <input
                id="settings-log-retention"
                type="number"
                min="1"
                max="365"
                [(ngModel)]="settings.log_retention_days"
              />
              <div class="m3-hint">
                超过该天数的日志会在下次清理时被删除；审计日志最多保留最近 500 条。
              </div>
            </div>
          </div>

          <div style="margin-top: 14px; display: flex; justify-content: flex-end; gap: 10px">
            <button
              mat-flat-button
              color="primary"
              [disabled]="savingBrand() || !isBrandDirty()"
              (click)="saveBrandSettings()"
            >
              {{ savingBrand() ? '保存中...' : '保存基础设置' }}
            </button>
          </div>
        </mat-tab>

        <!-- Tab 3: Webhook Alerts (FE-005) -->
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
              <div>
                <strong>保存 Webhook 告警通道配置（仅用于连通性测试投递）</strong>
                <span *ngIf="isWebhookDirty()" class="m3-badge warning" style="margin-left: 8px">● 未保存修改</span>
              </div>
              <mat-slide-toggle [(ngModel)]="settings.webhook_enabled"></mat-slide-toggle>
            </div>

            <div *ngIf="settings.webhook_enabled" class="m3-grid-2">
              <div class="m3-field">
                <label for="settings-webhook-type">通道类型</label>
                <select id="settings-webhook-type" [(ngModel)]="settings.webhook_type">
                  <option value="feishu">飞书自定义机器人 (Feishu)</option>
                  <option value="dingtalk">钉钉群机器人 (DingTalk)</option>
                  <option value="wecom">企业微信群机器人 (WeCom)</option>
                  <option value="telegram">Telegram Bot</option>
                  <option value="custom">自定义 JSON Webhook</option>
                </select>
              </div>
              <div class="m3-field">
                <label for="settings-webhook-url">Webhook URL</label>
                <input id="settings-webhook-url" type="text" [(ngModel)]="settings.webhook_url" placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..." />
              </div>
            </div>

            <div style="display: flex; justify-content: flex-end; gap: 10px">
              <button *ngIf="settings.webhook_enabled" mat-stroked-button [disabled]="testingWebhook()" (click)="testWebhook()">
                {{ testingWebhook() ? '发送中...' : '发送真实连通性测试消息' }}
              </button>
              <button
                mat-flat-button
                color="primary"
                [disabled]="savingWebhook() || !isWebhookDirty()"
                (click)="saveWebhookSettings()"
              >
                {{ savingWebhook() ? '保存中...' : '保存告警通道配置' }}
              </button>
            </div>
          </div>
        </mat-tab>

        <!-- Tab 4: Backup & Restore (FE-006, FE-009) -->
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
                <button mat-flat-button color="primary" (click)="handleCreateBackup()" [disabled]="backingUp()">
                  {{ backingUp() ? '正在生成备份...' : '生成新备份' }}
                </button>
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
export class SettingsComponent implements OnInit, HasUnsavedChanges {
  private system = inject(SystemService)
  private auth = inject(AuthService)
  private toast = inject(ToastService)
  private confirmSvc = inject(ConfirmService)
  private taskCenter = inject(TaskCenterService)
  private route = inject(ActivatedRoute)
  private router = inject(Router)

  readonly loading = signal(false)
  readonly loadError = signal<string | null>(null)
  readonly selectedTabIndex = signal(0)

  // Per-section saving states (FE-005)
  readonly savingAccess = signal(false)
  readonly savingBrand = signal(false)
  readonly savingWebhook = signal(false)
  readonly savingPwd = signal(false)
  readonly savingAi = signal(false)
  readonly testingAi = signal(false)
  readonly testingWebhook = signal(false)
  readonly backingUp = signal(false)
  readonly generatingSsl = signal(false)

  // Token & password masking states (FE-018)
  readonly showToken = signal(false)
  readonly showOldPwd = signal(false)
  readonly showNewPwd = signal(false)
  readonly showAiKey = signal(false)
  readonly pwdOldError = signal('')
  readonly pwdNewError = signal('')

  readonly backups = signal<PanelBackupItem[]>([])

  // Working copy
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

  // Baselines for dirty checking (FE-005)
  private baselineSettings: PanelSettings = { ...this.settings }
  private baselineAiConfig: AIConfig = {
    enabled: true,
    api_url: 'https://api.deepseek.com/v1',
    api_key: '',
    model: 'deepseek-chat',
    temperature: 0.3,
    max_tokens: 2048,
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
    const qp = this.route.snapshot.queryParamMap
    const tab = qp.get('tab')
    if (tab !== null) {
      const idx = parseInt(tab, 10)
      if (!isNaN(idx) && idx >= 0 && idx <= 4) this.selectedTabIndex.set(idx)
    }

    this.loadSettings()
    this.loadBackups()
    this.loadAi()
  }

  onTabChange(idx: number) {
    this.selectedTabIndex.set(idx)
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: idx },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    })
  }

  hasUnsavedChanges(): boolean {
    return this.isAccessDirty() || this.isBrandDirty() || this.isWebhookDirty() || this.isAiDirty() || this.isPwdDirty()
  }

  isAccessDirty(): boolean {
    const b = this.baselineSettings
    const s = this.settings
    return (
      s.port !== b.port ||
      s.security_entrance !== b.security_entrance ||
      s.session_timeout_minutes !== b.session_timeout_minutes ||
      s.ip_whitelist !== b.ip_whitelist ||
      s.max_login_retry !== b.max_login_retry ||
      s.login_lock_minutes !== b.login_lock_minutes ||
      s.ssl_enabled !== b.ssl_enabled ||
      s.panel_ssl_cert !== b.panel_ssl_cert ||
      s.panel_ssl_key !== b.panel_ssl_key
    )
  }

  isBrandDirty(): boolean {
    const b = this.baselineSettings
    const s = this.settings
    return (
      s.panel_title !== b.panel_title ||
      s.timezone !== b.timezone ||
      s.eco_mode_enabled !== b.eco_mode_enabled ||
      s.eco_mode_threshold_mb !== b.eco_mode_threshold_mb
    )
  }

  isWebhookDirty(): boolean {
    const b = this.baselineSettings
    const s = this.settings
    return (
      s.webhook_enabled !== b.webhook_enabled ||
      s.webhook_type !== b.webhook_type ||
      s.webhook_url !== b.webhook_url
    )
  }

  isAiDirty(): boolean {
    const b = this.baselineAiConfig
    const a = this.aiForm
    return (
      a.enabled !== b.enabled ||
      a.api_url !== b.api_url ||
      a.model !== b.model ||
      a.api_key !== b.api_key
    )
  }

  isPwdDirty(): boolean {
    return !!this.pwdForm.old_password || !!this.pwdForm.new_username || !!this.pwdForm.new_password
  }

  async loadSettings() {
    this.loading.set(true)
    this.loadError.set(null)
    try {
      const res = await settingsApi.getSettings()
      if (res.data?.data) {
        this.settings = { ...this.settings, ...res.data.data }
        this.baselineSettings = JSON.parse(JSON.stringify(this.settings))
        if (this.settings.panel_title) {
          this.system.setPanelTitle(this.settings.panel_title)
        }
      }
    } catch (e: any) {
      const msg = e.message || '加载面板设置失败'
      this.loadError.set(msg)
      this.toast.error(msg)
    } finally {
      this.loading.set(false)
    }
  }

  async saveAccessSettings() {
    if (!this.settings.port || this.settings.port < 1 || this.settings.port > 65535) {
      this.toast.warning('请输入 1 - 65535 范围内的有效监听端口')
      return
    }
    if (!this.settings.security_entrance || !this.settings.security_entrance.startsWith('/')) {
      this.toast.warning('安全入口路径必须以 / 开头')
      return
    }
    this.savingAccess.set(true)
    try {
      const res = await settingsApi.updateSettings(this.settings)
      await this.loadSettings()
      this.toast.success(res.data?.message || '访问与安全设置已保存')
    } catch (e: any) {
      this.toast.error(e.message)
    } finally {
      this.savingAccess.set(false)
    }
  }

  async saveBrandSettings() {
    if (!this.settings.panel_title?.trim()) {
      this.toast.warning('面板标题不能为空')
      return
    }
    this.savingBrand.set(true)
    try {
      await settingsApi.updateSettings(this.settings)
      if (this.settings.timezone && this.settings.timezone !== this.baselineSettings.timezone) {
        await settingsApi.updateTimezone(this.settings.timezone)
      }
      await this.loadSettings()
      this.toast.success('品牌与节能设置已保存')
    } catch (e: any) {
      this.toast.error(e.message)
    } finally {
      this.savingBrand.set(false)
    }
  }

  async saveWebhookSettings() {
    if (this.settings.webhook_enabled && !this.settings.webhook_url?.trim()) {
      this.toast.warning('已启用 Webhook，请输入有效的 Webhook URL')
      return
    }
    this.savingWebhook.set(true)
    try {
      await settingsApi.updateSettings(this.settings)
      await this.loadSettings()
      this.toast.success('告警通道配置已保存')
    } catch (e: any) {
      this.toast.error(e.message)
    } finally {
      this.savingWebhook.set(false)
    }
  }

  validateNewPassword() {
    if (this.pwdForm.new_password && this.pwdForm.new_password.length < 8) {
      this.pwdNewError.set('密码长度至少为 8 位')
    } else {
      this.pwdNewError.set('')
    }
  }

  async handleChangePassword() {
    if (!this.pwdForm.old_password) {
      this.pwdOldError.set('请输入当前原密码')
      return
    }
    if (!this.pwdForm.new_password || this.pwdForm.new_password.length < 8) {
      this.pwdNewError.set('新登录密码长度至少为 8 位')
      return
    }

    const res = await this.confirmSvc.ask({
      title: '修改管理员凭证确认',
      resourceName: this.pwdForm.new_username || '当前管理员',
      message: '修改管理员用户名或密码后，现有会话将在稍后刷新或重新登录。',
      impact: '请务必妥善记录新凭证，丢失需在服务器终端手动重置。',
      confirmText: '确认更新凭证',
      severity: 'warning',
    })
    if (!res.confirmed) return

    this.savingPwd.set(true)
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
    } finally {
      this.savingPwd.set(false)
    }
  }

  async copyApiToken() {
    const ok = await copyToClipboard(this.settings.api_token || '')
    if (ok) this.toast.success('API Token 已复制到剪贴板')
    else this.toast.error('复制失败')
  }

  async regenerateToken() {
    const res = await this.confirmSvc.ask({
      title: '重置 API Token 确认',
      resourceName: 'OpenAPI Bearer Token',
      message: '重置后，原 API Token 将立即失效，所有使用旧 Token 的外部脚本和监控探针将鉴权失败。',
      impact: '需要将新 Token 同步更新到调用方。',
      confirmText: '确认重置 Token',
      severity: 'danger',
    })
    if (!res.confirmed) return

    try {
      const resp = await settingsApi.regenerateApiToken()
      if (resp.data?.data?.api_token) {
        this.settings.api_token = resp.data.data.api_token
        this.baselineSettings.api_token = resp.data.data.api_token
        this.toast.success('API Token 已重置')
      }
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async generateSelfSignedHttps() {
    const res = await this.confirmSvc.ask({
      title: '生成自签名 HTTPS 证书确认',
      resourceName: 'ArmGuard Local SSL',
      message: '面板将为当前 IP/主机名自动签发 10 年期自签名 TLS 证书并启用 SSL 监听。',
      impact: '浏览器初次访问会提示不受信任的证书（ERR_CERT_AUTHORITY_INVALID），需手动点击信任高级继续访问。',
      confirmText: '生成并启用',
      severity: 'warning',
    })
    if (!res.confirmed) return

    this.generatingSsl.set(true)
    try {
      const resp = await settingsApi.generateSelfSignedCert()
      await this.loadSettings()
      this.toast.success(resp.data?.message || '自签名 HTTPS 证书已生成并启用，请重启面板服务生效')
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
      if (res.data?.data) {
        this.aiForm = { ...this.aiForm, ...res.data.data }
        this.baselineAiConfig = JSON.parse(JSON.stringify(this.aiForm))
      }
    } catch (e: any) {
      this.toast.error(`加载 AI 配置失败: ${e.message}`)
    }
  }

  async saveAi() {
    this.savingAi.set(true)
    try {
      await aiApi.updateConfig(this.aiForm)
      this.baselineAiConfig = JSON.parse(JSON.stringify(this.aiForm))
      this.toast.success('大模型 API 配置已保存')
    } catch (e: any) {
      this.toast.error(e.message)
    } finally {
      this.savingAi.set(false)
    }
  }

  async testAi() {
    this.testingAi.set(true)
    try {
      const res = await aiApi.testConnection(this.aiForm)
      this.toast.success(res.data?.message || '大模型连通正常')
    } catch (e: any) {
      this.toast.error(e.message)
    } finally {
      this.testingAi.set(false)
    }
  }

  async testWebhook() {
    this.testingWebhook.set(true)
    try {
      const res = await settingsApi.testWebhook({
        webhook_type: this.settings.webhook_type,
        webhook_url: this.settings.webhook_url,
      })
      this.toast.success(res.data?.message || 'Webhook 测试消息投递成功')
    } catch (e: any) {
      this.toast.error(e.message)
    } finally {
      this.testingWebhook.set(false)
    }
  }

  async handleCreateBackup() {
    this.backingUp.set(true)
    try {
      await this.taskCenter.runTrackedTask({
        type: 'backup',
        title: '生成面板元数据与配置备份',
        targetKey: 'panel-backup',
        initialLog: '正在打包面板核心数据 (/var/lib/armguard)...',
        viewRoute: '/settings',
        viewLabel: '查看备份列表',
        executor: async () => {
          const res = await settingsApi.createPanelBackup()
          const fileName = res.data?.data?.file_name || 'backup.tar.gz'
          return {
            summary: `备份归档生成完毕: ${fileName}`,
            logs: [`[armguard-backup] 成功打包 /var/lib/armguard -> ${fileName}`],
            result: res,
          }
        },
      })
      this.toast.success('面板配置备份已生成')
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
    const res = await this.confirmSvc.ask({
      title: '删除面板备份确认',
      resourceName: b.file_name,
      message: `确定要删除备份归档 ${b.file_name} (${b.size_kb} KB) 吗？`,
      impact: '删除后无法从该归档恢复面板历史配置。',
      confirmText: '确认删除',
      severity: 'danger',
    })
    if (!res.confirmed) return

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
    const res = await this.confirmSvc.ask({
      title: '重启面板守护进程确认',
      resourceName: 'armguard.service',
      message: '确定要重启面板守护进程吗？',
      impact: '重启期间 Web 面板将短暂失去响应约 2-5 秒；重启完成后请在生效的端口重新连接。',
      confirmText: '立即重启',
      severity: 'warning',
    })
    if (!res.confirmed) return

    try {
      const resp = await settingsApi.restartPanelEngine()
      this.toast.info(resp.data?.message || '面板守护进程正在重启中，稍后将自动重新连接...')
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }
}
