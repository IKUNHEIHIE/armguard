import { Component, OnInit, inject, signal } from '@angular/core'
import { AgMaterialModule } from '../core/material.module'
import { SystemService } from '../core/system.service'
import { ToastService } from '../core/toast.service'
import { aiApi, AIConfig, CommandGenResult, HealthAuditResult } from '@/api/ai'
import { copyToClipboard } from '@/utils/clipboard'

@Component({
  selector: 'ag-floating-ai-companion',
  standalone: true,
  imports: [AgMaterialModule],
  template: `
    <!-- Google M3 Extended FAB -->
    <button
      *ngIf="aiConfig.enabled"
      type="button"
      mat-fab
      extended
      class="m3-ai-fab"
      aria-label="打开或关闭智能运维伴侣"
      (click)="toggleOpen()"
      matTooltip="打开 Google M3 智能运维伴侣"
    >
      <mat-icon aria-hidden="true">{{ isOpen() ? 'close' : 'auto_awesome' }}</mat-icon>
      <span>{{ isOpen() ? '收起助手' : 'AI 伴侣' }}</span>
    </button>

    <!-- Slide-over M3 Sheet -->
    <div
      *ngIf="isOpen()"
      class="m3-ai-sheet"
      role="dialog"
      aria-modal="false"
      aria-label="ArmGuard AI 运维伴侣"
    >
      <div class="sheet-header">
        <div class="header-title">
          <div class="gemini-badge" aria-hidden="true">
            <mat-icon>auto_awesome</mat-icon>
          </div>
          <div>
            <div class="title">ArmGuard AI 运维伴侣</div>
            <div class="subtitle font-mono">
              {{
                aiConfig.is_configured
                  ? '在线大模型 (' + (aiConfig.model || 'LLM') + ')'
                  : '本地离线规则引擎 · 数据不出本机'
              }}
            </div>
          </div>
        </div>
        <button
          type="button"
          mat-icon-button
          aria-label="关闭智能运维伴侣窗口"
          (click)="isOpen.set(false)"
        >
          <mat-icon>close</mat-icon>
        </button>
      </div>

      <!-- AI Privacy & Data Routing Disclosure Banner (FE-018) -->
      <div class="ai-privacy-strip font-mono">
        <mat-icon aria-hidden="true">{{ aiConfig.is_configured ? 'cloud_upload' : 'verified_user' }}</mat-icon>
        <span *ngIf="aiConfig.is_configured">
          数据流向：提问内容将发送至已配置的在线接口 ({{ aiConfig.api_url || '外部 LLM' }})，请勿粘贴明文私钥。
        </span>
        <span *ngIf="!aiConfig.is_configured">
          数据流向：当前使用宿主机本地离线专家规则库，所有对话与巡检均在本机完成。
        </span>
      </div>

      <mat-tab-group animationDuration="180ms" class="sheet-tabs">
        <!-- Tab 1: Chat -->
        <mat-tab label="智能问答">
          <div class="tab-pane chat-pane">
            <div class="messages-list font-mono" aria-live="polite">
              <div class="msg-bubble assistant">
                你好！我是 ARM Linux 智能运维助手。当前宿主机 CPU:
                <strong>{{
                  system.realtime().cpu.percent === null
                    ? '待就绪'
                    : system.realtime().cpu.percent!.toFixed(0) + '%'
                }}</strong>
                ，内存:
                <strong>{{
                  system.realtime().memory.percent === null
                    ? '待就绪'
                    : system.realtime().memory.percent!.toFixed(0) + '%'
                }}</strong>
                。有什么可以帮您？
              </div>

              <div
                *ngFor="let msg of messages"
                class="msg-bubble"
                [ngClass]="msg.role === 'user' ? 'user' : 'assistant'"
              >
                {{ msg.content }}
              </div>

              <div *ngIf="chatLoading()" class="msg-bubble assistant">正在思考与检索系统状态...</div>
            </div>

            <form (ngSubmit)="sendChat()" class="chat-input-bar">
              <input
                id="ag-ai-chat-input"
                type="text"
                [(ngModel)]="chatInput"
                name="chatInput"
                aria-label="输入运维问题"
                placeholder="询问 Nginx 反代、ARM 温控或排障指令..."
              />
              <button
                mat-flat-button
                color="primary"
                type="submit"
                aria-label="发送问题"
                [disabled]="chatLoading() || !chatInput.trim()"
              >
                <mat-icon>send</mat-icon>
              </button>
            </form>
          </div>
        </mat-tab>

        <!-- Tab 2: Command Generator -->
        <mat-tab label="指令生成">
          <div class="tab-pane">
            <div class="m3-field">
              <label for="ag-ai-cmd-prompt">自然语言描述运维需求</label>
              <textarea
                id="ag-ai-cmd-prompt"
                rows="3"
                [(ngModel)]="cmdPrompt"
                placeholder="例如：查找 /var/log 下大于 50MB 的日志文件并按大小排序"
              ></textarea>
            </div>
            <button
              type="button"
              mat-flat-button
              color="primary"
              (click)="generateCmd()"
              [disabled]="cmdLoading() || !cmdPrompt.trim()"
            >
              <mat-icon>terminal</mat-icon>
              <span>{{ cmdLoading() ? '生成中...' : '生成 Linux 命令' }}</span>
            </button>

            <div *ngIf="cmdResult" class="m3-tonal-card font-mono cmd-result">
              <div class="cmd-top">
                <span class="m3-badge" [ngClass]="riskClass(cmdResult.risk)">
                  风险等级: {{ cmdResult.risk }}
                </span>
                <button type="button" mat-stroked-button (click)="copyText(cmdResult.command)">
                  复制指令
                </button>
              </div>
              <pre class="m3-code-console">{{ cmdResult.command }}</pre>
              <div class="cmd-explain">{{ cmdResult.explanation }}</div>
            </div>
          </div>
        </mat-tab>

        <!-- Tab 3: Health Audit -->
        <mat-tab label="健康巡检">
          <div class="tab-pane">
            <button
              type="button"
              mat-flat-button
              color="primary"
              (click)="runAudit()"
              [disabled]="auditLoading()"
            >
              <mat-icon>health_and_safety</mat-icon>
              <span>{{ auditLoading() ? '正在深度扫描宿主机...' : '一键执行 ARM 系统体检' }}</span>
            </button>

            <div *ngIf="auditResult" class="audit-box font-mono">
              <div class="score-banner m3-tonal-card">
                <div class="score-num">{{ auditResult.score }}</div>
                <div>
                  <div class="score-title">健康评分 ({{ auditResult.level }})</div>
                  <div class="score-sum">{{ auditResult.summary }}</div>
                </div>
              </div>

              <div *ngFor="let item of auditResult.checks" class="check-item">
                <span
                  class="m3-badge"
                  [ngClass]="
                    item.status === 'pass'
                      ? 'success'
                      : item.status === 'warning'
                        ? 'warning'
                        : 'danger'
                  "
                >
                  {{ item.status }}
                </span>
                <div>
                  <div class="check-name">{{ item.item }}</div>
                  <div class="check-detail">{{ item.detail }}</div>
                </div>
              </div>
            </div>
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: [
    `
      .m3-ai-fab {
        position: fixed !important;
        right: 20px;
        bottom: 20px;
        z-index: 900;
        border-radius: 16px !important;
        background: var(--ag-primary-solid) !important;
        color: var(--ag-on-primary) !important;
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.38) !important;
      }
      .m3-ai-sheet {
        position: fixed;
        right: 20px;
        bottom: 84px;
        width: 410px;
        max-width: calc(100vw - 28px);
        height: 540px;
        max-height: calc(100dvh - 110px);
        z-index: 901;
        background: var(--ag-surface-low);
        border: 1px solid var(--ag-outline-variant);
        border-radius: 20px;
        box-shadow: var(--ag-shadow-3);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .sheet-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        background: var(--ag-surface);
        border-bottom: 1px solid var(--ag-outline-variant);
      }
      .header-title {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .gemini-badge {
        width: 34px;
        height: 34px;
        border-radius: 12px;
        background: var(--ag-primary-container);
        color: var(--ag-on-primary-container);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .title {
        font-weight: 700;
        font-size: 0.9rem;
      }
      .subtitle {
        font-size: 0.68rem;
        color: var(--ag-on-surface-variant);
      }
      .ai-privacy-strip {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 14px;
        background: var(--ag-surface-lowest);
        border-bottom: 1px solid var(--ag-outline-variant);
        font-size: 0.68rem;
        color: var(--ag-on-surface-variant);
      }
      .ai-privacy-strip mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
        color: var(--ag-primary);
      }
      .sheet-tabs {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 0;
      }
      .tab-pane {
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        height: 380px;
        overflow-y: auto;
      }
      .chat-pane {
        justify-content: space-between;
      }
      .messages-list {
        flex: 1;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding-right: 4px;
      }
      .msg-bubble {
        padding: 10px 14px;
        border-radius: 16px;
        font-size: 0.78rem;
        line-height: 1.5;
        white-space: pre-wrap;
      }
      .msg-bubble.assistant {
        background: var(--ag-surface);
        border: 1px solid var(--ag-outline-variant);
        align-self: flex-start;
        max-width: 90%;
      }
      .msg-bubble.user {
        background: var(--ag-primary-container);
        color: var(--ag-on-primary-container);
        align-self: flex-end;
        max-width: 85%;
      }
      .chat-input-bar {
        display: flex;
        gap: 8px;
        padding-top: 8px;
        border-top: 1px solid var(--ag-outline-variant);
      }
      .chat-input-bar input {
        flex: 1;
        padding: 9px 12px;
        border-radius: 999px;
        border: 1px solid var(--ag-outline);
        background: var(--ag-surface-lowest);
        color: var(--ag-on-surface);
        font-size: 0.8rem;
      }
      .cmd-result {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .cmd-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .cmd-explain {
        font-size: 0.75rem;
        color: var(--ag-on-surface-variant);
      }
      .audit-box {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .score-banner {
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .score-num {
        font-size: 1.8rem;
        font-weight: 800;
        color: var(--ag-primary);
      }
      .score-title {
        font-weight: 700;
        font-size: 0.85rem;
      }
      .score-sum {
        font-size: 0.74rem;
        color: var(--ag-on-surface-variant);
      }
      .check-item {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 8px 10px;
        border-radius: 12px;
        background: var(--ag-surface);
        font-size: 0.75rem;
      }
      .check-name {
        font-weight: 700;
      }
      .check-detail {
        color: var(--ag-on-surface-variant);
      }
    `,
  ],
})
export class FloatingAiCompanionComponent implements OnInit {
  readonly system = inject(SystemService)
  private toast = inject(ToastService)

  readonly isOpen = signal(false)
  readonly chatLoading = signal(false)
  readonly cmdLoading = signal(false)
  readonly auditLoading = signal(false)

  aiConfig: AIConfig = {
    enabled: true,
    api_url: '',
    api_key: '',
    model: '',
    temperature: 0.3,
    max_tokens: 2048,
    is_configured: false,
  }

  messages: Array<{ role: 'user' | 'assistant'; content: string }> = []
  chatInput = ''
  cmdPrompt = ''
  cmdResult: CommandGenResult | null = null
  auditResult: HealthAuditResult | null = null

  ngOnInit() {
    this.loadConfig()
  }

  async loadConfig() {
    try {
      const res = await aiApi.getConfig()
      if (res.data?.data) {
        this.aiConfig = { ...this.aiConfig, ...res.data.data }
      }
    } catch {}
  }

  toggleOpen() {
    this.isOpen.set(!this.isOpen())
    if (this.isOpen()) {
      this.loadConfig()
    }
  }

  async sendChat() {
    const text = this.chatInput.trim()
    if (!text || this.chatLoading()) return
    this.chatInput = ''
    this.messages.push({ role: 'user', content: text })
    this.chatLoading.set(true)
    try {
      const res = await aiApi.chat(text, this.messages.slice(-8))
      this.messages.push({
        role: 'assistant',
        content: res.data?.data?.reply || '未获取到有效回复',
      })
    } catch (e: any) {
      this.messages.push({
        role: 'assistant',
        content: `请求失败: ${e.message}`,
      })
    } finally {
      this.chatLoading.set(false)
    }
  }

  async generateCmd() {
    if (!this.cmdPrompt.trim() || this.cmdLoading()) return
    this.cmdLoading.set(true)
    try {
      const res = await aiApi.generateCommand(this.cmdPrompt.trim())
      this.cmdResult = res.data?.data || null
    } catch (e: any) {
      this.toast.error(`生成失败: ${e.message}`)
    } finally {
      this.cmdLoading.set(false)
    }
  }

  async runAudit() {
    this.auditLoading.set(true)
    try {
      const res = await aiApi.healthAudit()
      this.auditResult = res.data?.data || null
    } catch (e: any) {
      this.toast.error(`巡检失败: ${e.message}`)
    } finally {
      this.auditLoading.set(false)
    }
  }

  riskClass(risk: string) {
    if (risk === 'danger') return 'danger'
    if (risk === 'warning') return 'warning'
    return 'success'
  }

  async copyText(text: string) {
    const res = await copyToClipboard(text)
    if (res.ok) {
      this.toast.success('命令已复制到剪贴板')
    } else {
      this.toast.warning(res.reason || '复制失败，请手动选中命令复制')
    }
  }
}
