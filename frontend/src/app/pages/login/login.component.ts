import { Component, OnInit, inject, signal } from '@angular/core'
import { Router } from '@angular/router'
import { AgMaterialModule } from '../../core/material.module'
import { AuthService } from '../../core/auth.service'
import { SystemService } from '../../core/system.service'
import { ToastService } from '../../core/toast.service'
import { authApi } from '@/api/auth'

@Component({
  selector: 'ag-login',
  standalone: true,
  imports: [AgMaterialModule],
  template: `
    <div class="login-view">
      <div class="login-main">
        <!-- 品牌卡（居中，Level 3 浮层） -->
        <section class="auth-card">
          <div class="logo-wrap">
            <div class="logo-tile" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none">
                <path
                  d="M12 2.6 20 5.9v6.2c0 4.9-3.3 8.9-8 11-4.7-2.1-8-6.1-8-11V5.9L12 2.6Z"
                  fill="#ffffff"
                  fill-opacity="0.96"
                />
                <path d="M12 7.2v9.6M7.9 10.8h8.2" stroke="#1a73e8" stroke-width="1.7" stroke-linecap="round" />
              </svg>
            </div>
            <span class="logo-dot" aria-hidden="true"></span>
          </div>

          <h1 class="brand-title">ArmGuard</h1>
          <p class="brand-sub">Linux ARM 运维管理控制台</p>

          <div class="node-chip font-mono">
            <mat-icon aria-hidden="true">verified_user</mat-icon>
            <span class="node-label">当前节点:</span>
            <strong class="node-name">{{ system.info()?.hostname || 'armguard-node' }}</strong>
            <span class="node-arch">{{ system.info()?.arch || 'aarch64' }}</span>
            <span class="node-dot" aria-hidden="true"></span>
            <span class="node-secure">安全连接</span>
          </div>

          <div *ngIf="errorMsg()" class="error-banner" role="alert">
            <mat-icon aria-hidden="true">error_outline</mat-icon>
            <span>{{ errorMsg() }}</span>
          </div>

          <form (ngSubmit)="handleLogin()" class="login-form">
            <!-- 管理员账号 -->
            <div class="field">
              <div class="field-head">
                <label for="login-username">管理员账号</label>
                <span class="field-hint font-mono">root / admin</span>
              </div>
              <div class="input-shell">
                <mat-icon class="input-icon" aria-hidden="true">person</mat-icon>
                <input
                  id="login-username"
                  type="text"
                  [(ngModel)]="form.username"
                  name="username"
                  required
                  autocomplete="username"
                  placeholder="root"
                />
              </div>
            </div>

            <!-- 密码 -->
            <div class="field">
              <div class="field-head">
                <label for="login-password">安全访问密码</label>
                <button type="button" class="field-link" (click)="onForgot()">忘记凭证?</button>
              </div>
              <div class="input-shell">
                <mat-icon class="input-icon" aria-hidden="true">lock</mat-icon>
                <input
                  id="login-password"
                  [type]="showPassword() ? 'text' : 'password'"
                  [(ngModel)]="form.password"
                  name="password"
                  required
                  autocomplete="current-password"
                  placeholder="••••••••••"
                />
                <button
                  type="button"
                  class="eye-btn"
                  (click)="showPassword.set(!showPassword())"
                  [attr.aria-label]="showPassword() ? '隐藏密码' : '显示密码'"
                >
                  <mat-icon aria-hidden="true">{{ showPassword() ? 'visibility_off' : 'visibility' }}</mat-icon>
                </button>
              </div>
            </div>

            <!-- 图形验证码（触发风控时才出现） -->
            <div *ngIf="requireCaptcha()" class="field">
              <div class="field-head">
                <label for="login-captcha">图形验证码</label>
                <span class="field-hint">点击图片刷新</span>
              </div>
              <div class="captcha-row">
                <div class="input-shell">
                  <mat-icon class="input-icon" aria-hidden="true">pin</mat-icon>
                  <input
                    id="login-captcha"
                    type="text"
                    [(ngModel)]="form.captcha_code"
                    name="captcha_code"
                    placeholder="输入右侧验证码"
                    autocomplete="off"
                  />
                </div>
                <button
                  type="button"
                  class="captcha-img"
                  (click)="refreshCaptcha()"
                  title="点击刷新验证码"
                  aria-label="点击刷新验证码"
                >
                  <img *ngIf="captchaImage()" [src]="captchaImage()" alt="图形验证码" />
                  <span *ngIf="!captchaImage()" class="font-mono">加载中…</span>
                </button>
              </div>
            </div>

            <!-- 两步验证 -->
            <div class="field">
              <div class="field-head">
                <label for="login-totp">
                  两步验证口令
                  <mat-icon class="hint-icon" aria-hidden="true">info_outline</mat-icon>
                  <span class="optional">(若启用)</span>
                </label>
                <span class="field-hint">可选配置</span>
              </div>
              <div class="input-shell">
                <mat-icon class="input-icon" aria-hidden="true">smartphone</mat-icon>
                <input
                  id="login-totp"
                  type="text"
                  [(ngModel)]="form.totp_code"
                  name="totp_code"
                  maxlength="6"
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  placeholder="000 000"
                  class="font-mono"
                />
              </div>
            </div>

            <label class="remember-row">
              <input type="checkbox" [(ngModel)]="rememberDevice" name="remember" />
              <span>记住此设备 (30 天免密信任)</span>
            </label>

            <div class="notice">
              <mat-icon aria-hidden="true">shield</mat-icon>
              <span>
                仅允许已授权管理员访问。所有登录尝试均计入系统安全审计日志
                (<code>/var/lib/armguard-auth.log</code>)。
              </span>
            </div>

            <button
              type="submit"
              class="submit-btn"
              [disabled]="loading() || !form.username || !form.password"
            >
              <mat-icon aria-hidden="true">{{ loading() ? 'progress_activity' : 'login' }}</mat-icon>
              <span>{{ loading() ? '正在验证身份凭证…' : '安全登入控制台' }}</span>
            </button>
          </form>
        </section>

        <footer class="login-footer font-mono">
          <div class="footer-line">
            <span class="live-dot" aria-hidden="true"></span>
            <span>ArmGuard {{ versionLabel }} ({{ system.info()?.arch || 'aarch64' }}) · 开源轻量 Linux 运维套件</span>
          </div>
          <div class="footer-links">
            <span>系统诊断模式</span>
            <span class="sep">|</span>
            <span>重置登录限制</span>
            <span class="sep">|</span>
            <span>帮助文档</span>
          </div>
          <div class="footer-credit">基于 Google Material Design 3 规范与 Angular Material 构建</div>
        </footer>
      </div>
    </div>
  `,
  styles: [
    `
      .login-view {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        min-height: 100dvh;
        padding: 32px 16px;
        overflow-y: auto;
        background:
          radial-gradient(760px 520px at 82% 8%, rgba(26, 115, 232, 0.1), transparent 62%),
          radial-gradient(680px 520px at 12% 92%, rgba(18, 181, 203, 0.08), transparent 60%),
          var(--ag-bg);
      }
      .login-main {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 20px;
        width: 100%;
        max-width: 420px;
      }

      .auth-card {
        width: 100%;
        padding: 32px 32px 28px;
        background: var(--ag-surface-lowest);
        border: 1px solid var(--ag-outline-variant);
        border-radius: 24px;
        box-shadow: 0 12px 40px rgba(60, 64, 67, 0.1);
        display: flex;
        flex-direction: column;
        align-items: center;
      }

      .logo-wrap {
        position: relative;
        margin-bottom: 14px;
      }
      .logo-tile {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 56px;
        height: 56px;
        border-radius: 16px;
        background: linear-gradient(150deg, #2b86f5, #1a73e8 62%, #1557b0);
        box-shadow: 0 6px 16px rgba(26, 115, 232, 0.32);
      }
      .logo-dot {
        position: absolute;
        top: -3px;
        right: -3px;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #34a853;
        border: 2px solid var(--ag-surface-lowest);
      }

      .brand-title {
        margin: 0;
        font-family: var(--ag-font-display);
        font-size: 1.875rem;
        line-height: 2.25rem;
        font-weight: 600;
        letter-spacing: -0.6px;
        color: var(--ag-on-surface);
      }
      .brand-sub {
        margin: 4px 0 0;
        font-size: 0.8125rem;
        color: var(--ag-on-surface-variant);
      }

      .node-chip {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 16px;
        padding: 6px 12px;
        border-radius: var(--ag-radius-pill);
        background: var(--ag-surface-low);
        font-size: 0.6875rem;
        color: var(--ag-on-surface-variant);
        max-width: 100%;
      }
      .node-chip mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
        color: var(--ag-primary);
      }
      .node-name {
        color: var(--ag-on-surface);
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .node-arch {
        padding-left: 6px;
        border-left: 1px solid var(--ag-outline-variant);
        margin-left: 2px;
      }
      .node-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #34a853;
        margin-left: 2px;
      }
      .node-secure {
        color: #188038;
        font-weight: 500;
      }

      .error-banner {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        width: 100%;
        margin-top: 16px;
        padding: 10px 12px;
        border-radius: var(--ag-radius-sm);
        background: var(--ag-danger-container);
        color: var(--ag-danger);
        font-size: 0.75rem;
        line-height: 1.5;
      }
      .error-banner mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        margin-top: 1px;
      }

      .login-form {
        display: flex;
        flex-direction: column;
        gap: 14px;
        width: 100%;
        margin-top: 20px;
      }
      .field {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .field-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .field-head label {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        font-size: 0.75rem;
        font-weight: 500;
        color: var(--ag-on-surface-variant);
      }
      .hint-icon {
        font-size: 13px;
        width: 13px;
        height: 13px;
        opacity: 0.7;
      }
      .optional {
        color: var(--ag-on-surface-variant);
        opacity: 0.8;
      }
      .field-hint {
        font-size: 0.6875rem;
        color: var(--ag-on-surface-variant);
      }
      .field-link {
        padding: 0;
        border: none;
        background: transparent;
        color: var(--ag-primary);
        font-family: inherit;
        font-size: 0.6875rem;
        cursor: pointer;
      }
      .field-link:hover {
        text-decoration: underline;
      }

      .input-shell {
        position: relative;
        display: flex;
        align-items: center;
        height: 42px;
        padding: 0 12px;
        gap: 10px;
        border: 1px solid transparent;
        border-radius: var(--ag-radius-sm);
        background: var(--ag-surface-low);
        transition:
          background-color 140ms ease,
          border-color 140ms ease,
          box-shadow 140ms ease;
      }
      .input-shell:focus-within {
        background: var(--ag-surface-lowest);
        border-color: var(--ag-primary);
        box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.12);
      }
      .input-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        color: var(--ag-on-surface-variant);
        flex-shrink: 0;
      }
      .input-shell input {
        flex: 1;
        min-width: 0;
        height: 100%;
        border: none;
        background: transparent;
        color: var(--ag-on-surface);
        font-family: inherit;
        font-size: 0.875rem;
        outline: none;
      }
      .input-shell input::placeholder {
        color: #9aa0ac;
      }
      .eye-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        padding: 0;
        border: none;
        border-radius: 50%;
        background: transparent;
        color: var(--ag-on-surface-variant);
        cursor: pointer;
      }
      .eye-btn:hover {
        background: var(--ag-surface);
      }
      .eye-btn mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }

      .captcha-row {
        display: flex;
        gap: 10px;
      }
      .captcha-row .input-shell {
        flex: 1;
      }
      .captcha-img {
        width: 116px;
        height: 42px;
        padding: 0;
        border: 1px solid var(--ag-outline-strong);
        border-radius: var(--ag-radius-sm);
        background: var(--ag-surface-lowest);
        cursor: pointer;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.6875rem;
        color: var(--ag-on-surface-variant);
      }
      .captcha-img img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .remember-row {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 0.75rem;
        color: var(--ag-on-surface-variant);
        cursor: pointer;
        user-select: none;
      }
      .remember-row input {
        width: 15px;
        height: 15px;
        accent-color: var(--ag-primary);
        cursor: pointer;
      }

      .notice {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 10px 12px;
        border-radius: var(--ag-radius-sm);
        background: var(--ag-surface-low);
        color: var(--ag-on-surface-variant);
        font-size: 0.6875rem;
        line-height: 1.6;
      }
      .notice mat-icon {
        font-size: 15px;
        width: 15px;
        height: 15px;
        color: var(--ag-primary);
        margin-top: 1px;
        flex-shrink: 0;
      }
      .notice code {
        font-size: 0.6875rem;
        color: var(--ag-on-surface);
      }

      .submit-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        height: 44px;
        margin-top: 2px;
        border: none;
        border-radius: var(--ag-radius-pill);
        background: var(--ag-primary-solid);
        color: var(--ag-on-primary);
        font-family: inherit;
        font-size: 0.875rem;
        font-weight: 600;
        letter-spacing: 0.2px;
        cursor: pointer;
        transition:
          background-color 140ms ease,
          box-shadow 140ms ease;
      }
      .submit-btn:hover:not(:disabled) {
        filter: brightness(0.94);
        box-shadow: 0 4px 14px rgba(26, 115, 232, 0.3);
      }
      .submit-btn:disabled {
        background: var(--ag-surface-high);
        color: #9aa0ac;
        cursor: not-allowed;
      }
      .submit-btn mat-icon {
        font-size: 19px;
        width: 19px;
        height: 19px;
      }

      .login-footer {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        font-size: 0.6875rem;
        color: var(--ag-on-surface-variant);
        text-align: center;
      }
      .footer-line {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .live-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #34a853;
      }
      .footer-links {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .footer-links .sep {
        opacity: 0.4;
      }
      .footer-credit {
        opacity: 0.7;
      }

      @media (max-width: 480px) {
        .auth-card {
          padding: 26px 20px 22px;
        }
        .brand-title {
          font-size: 1.625rem;
        }
      }
    `,
  ],
})
export class LoginComponent implements OnInit {
  private auth = inject(AuthService)
  readonly system = inject(SystemService)
  private router = inject(Router)
  private toast = inject(ToastService)

  readonly loading = signal(false)
  readonly showPassword = signal(false)
  readonly errorMsg = signal('')
  readonly requireCaptcha = signal(false)
  readonly requireTotp = signal(false)
  readonly captchaImage = signal('')
  rememberDevice = false

  form = {
    username: 'admin',
    password: '',
    captcha_id: '',
    captcha_code: '',
    totp_code: '',
  }

  get versionLabel(): string {
    const v = this.system.info()?.panel_version || 'v0.2.1'
    return v.startsWith('v') ? v : `v${v}`
  }

  ngOnInit() {
    this.refreshCaptcha()
  }

  async refreshCaptcha() {
    try {
      const res = await authApi.getCaptcha()
      if (res.data?.code === 0 && res.data.data) {
        this.form.captcha_id = res.data.data.captcha_id
        this.captchaImage.set(res.data.data.image_base64)
      }
    } catch {}
  }

  onForgot() {
    this.toast.info('请在服务器执行 sudo node /opt/armguard/backend/scripts/reset_admin.js 重置凭证')
  }

  async handleLogin() {
    this.errorMsg.set('')
    this.loading.set(true)
    try {
      const ok = await this.auth.login(this.form)
      if (ok) {
        this.toast.success('身份校验通过，正在进入控制台')
        this.router.navigateByUrl('/')
      }
    } catch (err: any) {
      const msg = err.message || '用户名或密码错误'
      this.errorMsg.set(msg)
      this.requireCaptcha.set(true)
      this.refreshCaptcha()
      if (msg.includes('TOTP') || msg.includes('两步验证')) {
        this.requireTotp.set(true)
      }
    } finally {
      this.loading.set(false)
    }
  }
}
