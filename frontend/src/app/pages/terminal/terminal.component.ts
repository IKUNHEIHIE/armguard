import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  inject,
  signal,
} from '@angular/core'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { AgMaterialModule } from '../../core/material.module'
import { ToastService } from '../../core/toast.service'
import { aiApi, CommandGenResult } from '@/api/ai'

@Component({
  selector: 'ag-terminal',
  standalone: true,
  imports: [AgMaterialModule],
  template: `
    <div class="m3-page">
      <div class="m3-page-header">
        <div>
          <h2 class="m3-page-title">
            <mat-icon style="color: var(--ag-primary)">terminal</mat-icon>
            <span>Web SSH 终端与 AI Copilot (Xterm.js Console)</span>
          </h2>
          <p class="m3-page-subtitle font-mono">
            基于 Sec-WebSocket-Protocol 安全握手的实时 PTY 会话，内置常用 ARM 诊断指令与 AI 命令生成
          </p>
        </div>
        <div class="m3-page-actions">
          <span class="m3-badge" [ngClass]="connected() ? 'success' : 'warning'">
            {{ connected() ? '● 终端已连接' : '○ 本地交互 / 待重连' }}
          </span>
          <button mat-stroked-button (click)="clearTerm()">
            <mat-icon>cleaning_services</mat-icon>
            <span>清屏</span>
          </button>
          <button mat-flat-button color="primary" (click)="reconnect()">
            <mat-icon>refresh</mat-icon>
            <span>重新连接</span>
          </button>
        </div>
      </div>

      <!-- Quick Command Chips + AI Prompt Bar -->
      <div class="m3-card font-mono" style="display: flex; flex-direction: column; gap: 12px">
        <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center">
          <span style="font-size: 0.76rem; color: var(--ag-on-surface-variant)">快捷指令:</span>
          <button mat-stroked-button *ngFor="let q of quickCmds" (click)="sendCommand(q.cmd)">
            {{ q.label }}
          </button>
        </div>

        <div style="display: flex; gap: 10px">
          <input
            type="text"
            [(ngModel)]="aiPrompt"
            placeholder="AI Copilot: 输入想要执行的运维操作（如：查看占用 80 端口的进程）..."
            style="flex: 1; padding: 8px 14px; border-radius: 999px; border: 1px solid var(--ag-outline); background: var(--ag-surface-lowest); color: var(--ag-on-surface)"
            (keyup.enter)="generateAiCmd()"
          />
          <button mat-flat-button color="primary" (click)="generateAiCmd()" [disabled]="aiLoading()">
            <mat-icon>auto_awesome</mat-icon>
            <span>{{ aiLoading() ? '生成中...' : 'AI 生成指令' }}</span>
          </button>
        </div>

        <div *ngIf="aiResult()" class="m3-tonal-card" style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px">
          <div>
            <code>{{ aiResult()!.command }}</code>
            <div style="font-size: 0.72rem; color: var(--ag-on-surface-variant); margin-top: 4px">
              {{ aiResult()!.explanation }}
            </div>
          </div>
          <div style="display: flex; gap: 8px">
            <button mat-flat-button color="primary" (click)="sendCommand(aiResult()!.command)">
              注入终端执行
            </button>
          </div>
        </div>
      </div>

      <!-- Xterm Container -->
      <div class="m3-card term-frame">
        <div #termContainer class="xterm-box"></div>
      </div>
    </div>
  `,
  styles: [
    `
      .term-frame {
        background: #090d14 !important;
        padding: 14px !important;
      }
      .xterm-box {
        width: 100%;
        height: 480px;
      }
    `,
  ],
})
export class TerminalComponent implements AfterViewInit, OnDestroy {
  @ViewChild('termContainer', { static: true }) termContainer!: ElementRef<HTMLDivElement>
  private toast = inject(ToastService)

  readonly connected = signal(false)
  readonly aiLoading = signal(false)
  readonly aiResult = signal<CommandGenResult | null>(null)
  aiPrompt = ''

  quickCmds = [
    { label: 'htop / top', cmd: 'top -b -n 1 | head -n 20' },
    { label: '磁盘空间 (df -h)', cmd: 'df -h' },
    { label: '内存详情 (free -m)', cmd: 'free -m' },
    { label: 'CPU 拓扑 (lscpu)', cmd: 'lscpu' },
    { label: 'Nginx 配置预检', cmd: 'nginx -t' },
    { label: '监听端口 (ss -tulnp)', cmd: 'ss -tulnp' },
  ]

  private term: Terminal | null = null
  private fitAddon: FitAddon | null = null
  private ws: WebSocket | null = null
  private resizeHandler = () => this.fitAddon?.fit()

  ngAfterViewInit() {
    this.term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', monospace",
      theme: {
        background: '#090d14',
        foreground: '#e2e8f0',
        cursor: '#a8c7fa',
      },
    })
    this.fitAddon = new FitAddon()
    this.term.loadAddon(this.fitAddon)
    this.term.open(this.termContainer.nativeElement)
    this.fitAddon.fit()

    this.term.onData((data) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(data)
      }
    })

    window.addEventListener('resize', this.resizeHandler)
    this.connectWs()
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.resizeHandler)
    this.ws?.close()
    this.term?.dispose()
  }

  connectWs() {
    const token = localStorage.getItem('armguard_token') || ''
    if (!token) return
    this.ws?.close()

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${proto}//${window.location.host}/terminal/ws`
    try {
      const socket = new WebSocket(wsUrl, ['armguard.v1', token])
      this.ws = socket

      socket.onopen = () => {
        this.connected.set(true)
        this.term?.writeln('\x1b[1;32m[ArmGuard M3 WebSSH] Connected to host shell.\x1b[0m\r\n')
      }

      socket.onmessage = (ev) => {
        this.term?.write(typeof ev.data === 'string' ? ev.data : '')
      }

      socket.onclose = () => {
        this.connected.set(false)
        this.term?.writeln('\r\n\x1b[1;33m[ArmGuard] Session closed.\x1b[0m')
      }
    } catch {}
  }

  reconnect() {
    this.connectWs()
  }

  clearTerm() {
    this.term?.clear()
  }

  sendCommand(cmd: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(cmd + '\n')
    } else {
      this.toast.warning('当前终端未连接')
    }
  }

  async generateAiCmd() {
    if (!this.aiPrompt.trim()) return
    this.aiLoading.set(true)
    try {
      const res = await aiApi.generateCommand(this.aiPrompt.trim())
      this.aiResult.set(res.data?.data || null)
    } catch (e: any) {
      this.toast.error(e.message)
    } finally {
      this.aiLoading.set(false)
    }
  }
}
