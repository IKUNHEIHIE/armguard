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
    <div class="login-viewport">
      <div class="m3-login-shell">
        <!-- Left Brand & ARM Architecture Showcase -->
        <div class="brand-pane">
          <div class="brand-badge font-mono">
            <mat-icon>developer_board</mat-icon>
            <span>GOOGLE MATERIAL DESIGN 3 · ARM64 NATIVE</span>
          </div>

          <h1 class="brand-title font-display">
            {{ system.panelTitle() }}
          </h1>
          <p class="brand-desc">
            专为 ARM64 / ARMv7 Linux 服务器与单板机打造的超轻量可视化运维控制台。基于 Material You
            动态表面设计语言与低开销实时遥测引擎。
          </p>

          <div class="feature-pills font-mono">
            <div class="pill-item">
              <mat-icon>memory</mat-icon>
              <div>
                <strong>常驻内存 &lt; 35MB</strong>
                <span>专为 512MB~64GB ARM 实例调优</span>
              </div>
            </div>
            <div class="pill-item">
              <mat-icon>thermostat</mat-icon>
              <div>
                <strong>真实硅片传感器遥测</strong>
                <span>CPU 温度、cpufreq 频点与 vcgencmd 解码</span>
              </div>
            </div>
            <div class="pill-item">
              <mat-icon>verified_user</mat-icon>
              <div>
                <strong>高强度随机初始凭证</strong>
                <span>PBKDF2 哈希存储与单次下载票据保护</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Right Login Form Card -->
        <div class="form-pane">
          <div class="form-header">
            <div class="avatar-ring">
              <mat-icon>shield_lock</mat-icon>
            </div>
            <div>
              <h2 class="font-display">管理员身份认证</h2>
              <p class="font-mono">Sign in to ArmGuard Console</p>
            </div>
          </div>

          <div *ngIf="errorMsg()" class="error-banner font-mono" role="alert">
            <mat-icon>error_outline</mat-icon>
            <span>{{ errorMsg() }}</span>
          </div>

          <form (ngSubmit)="handleLogin()" class="login-form">
            <div class="m3-field">
              <label for="login-username">管理员账号 (Username) <span class="m3-req">*</span></label>
              <input
                id="login-username"
                type="text"
                [(ngModel)]="form.username"
                name="username"
                required
                autocomplete="username"
                placeholder="admin"
              />
            </div>

            <div class="m3-field">
              <label for="login-password">登录密码 (Password) <span class="m3-req">*</span></label>
              <div class="pwd-wrap">
                <input
                  id="login-password"
                  [type]="showPassword() ? 'text' : 'password'"
                  [(ngModel)]="form.password"
                  name="password"
                  required
                  autocomplete="current-password"
                  placeholder="请输入管理员密码"
                />
                <button
                  type="button"
                  mat-icon-button
                  class="eye-btn"
                  (click)="showPassword.set(!showPassword())"
                  [attr.aria-label]="showPassword() ? '隐藏密码' : '显示密码'"
                >
                  <mat-icon>{{ showPassword() ? 'visibility_off' : 'visibility' }}</mat-icon>
                </button>
              </div>
            </div>

            <div *ngIf="requireCaptcha()" class="m3-field">
              <label for="login-captcha">图形验证码</label>
              <div class="captcha-row">
                <input
                  id="login-captcha"
                  type="text"
                  [(ngModel)]="form.captcha_code"
                  name="captcha_code"
                  placeholder="输入右侧验证码"
                />
                <div class="captcha-img" (click)="refreshCaptcha()" title="点击刷新验证码" tabindex="0" role="button" aria-label="点击刷新验证码">
                  <img *ngIf="captchaImage()" [src]="captchaImage()" alt="图形验证码" />
                  <span *ngIf="!captchaImage()" class="font-mono">加载中...</span>
                </div>
              </div>
            </div>

            <div *ngIf="requireTotp()" class="m3-field">
              <label for="login-totp">双因素动态口令 (2FA TOTP)</label>
              <input
                id="login-totp"
                type="text"
                [(ngModel)]="form.totp_code"
                name="totp_code"
                maxlength="6"
                placeholder="6 位数字验证码"
              />
            </div>

            <button
              mat-flat-button
              color="primary"
              type="submit"
              class="submit-btn"
              [disabled]="loading() || !form.username || !form.password"
            >
              <mat-icon>{{ loading() ? 'hourglass_top' : 'login' }}</mat-icon>
              <span>{{ loading() ? '正在验证身份凭证...' : '安全登录控制台' }}</span>
            </button>
          </form>

          <div class="init-pwd-tip font-mono">
            <mat-icon>info_outline</mat-icon>
            <div>
              首次部署随机初始密码保存在宿主机
              <code>/var/lib/armguard/initial_admin_password</code> (权限 0600)。
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .login-viewport {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background:
          radial-gradient(circle at 15% 20%, rgba(8, 66, 160, 0.28), transparent 45%),
          radial-gradient(circle at 85% 80%, rgba(109, 213, 140, 0.14), transparent 45%),
          var(--ag-bg);
      }
      .m3-login-shell {
        width: 100%;
        max-width: 980px;
        display: grid;
        grid-template-columns: 1.1fr 1fr;
        background: var(--ag-surface-low);
        border: 1px solid var(--ag-outline-variant);
        border-radius: 32px;
        overflow: hidden;
        box-shadow: 0 28px 64px rgba(0, 0, 0, 0.45);
      }
      @media (max-width: 840px) {
        .m3-login-shell {
          grid-template-columns: 1fr;
        }
        .brand-pane {
          display: none !important;
        }
      }
      .brand-pane {
        padding: 44px 40px;
        background: linear-gradient(155deg, rgba(8, 66, 160, 0.36) 0%, var(--ag-surface) 100%);
        border-right: 1px solid var(--ag-outline-variant);
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 24px;
      }
      .brand-badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        align-self: flex-start;
        padding: 6px 14px;
        border-radius: 999px;
        background: var(--ag-primary-container);
        color: var(--ag-on-primary-container);
        font-size: 0.72rem;
        font-weight: 700;
      }
      .brand-title {
        font-size: 2rem;
        font-weight: 800;
        margin: 8px 0 0;
        letter-spacing: -0.02em;
      }
      .brand-desc {
        color: var(--ag-on-surface-variant);
        font-size: 0.9rem;
        line-height: 1.65;
        margin: 0;
      }
      .feature-pills {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .pill-item {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 12px 16px;
        border-radius: 18px;
        background: rgba(14, 19, 26, 0.45);
        border: 1px solid var(--ag-outline-variant);
      }
      .pill-item mat-icon {
        color: var(--ag-primary);
      }
      .pill-item strong {
        display: block;
        font-size: 0.82rem;
      }
      .pill-item span {
        font-size: 0.72rem;
        color: var(--ag-on-surface-variant);
      }
      .form-pane {
        padding: 44px 40px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 22px;
      }
      .form-header {
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .avatar-ring {
        width: 48px;
        height: 48px;
        border-radius: 16px;
        background: var(--ag-primary-container);
        color: var(--ag-on-primary-container);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .form-header h2 {
        margin: 0;
        font-size: 1.3rem;
        font-weight: 700;
      }
      .form-header p {
        margin: 2px 0 0;
        font-size: 0.75rem;
        color: var(--ag-on-surface-variant);
      }
      .error-banner {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 14px;
        border-radius: 14px;
        background: var(--ag-danger-container);
        color: var(--ag-danger);
        font-size: 0.78rem;
      }
      .login-form {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .pwd-wrap {
        position: relative;
      }
      .pwd-wrap input {
        padding-right: 44px !important;
      }
      .eye-btn {
        position: absolute !important;
        right: 4px;
        top: 50%;
        transform: translateY(-50%);
      }
      .captcha-row {
        display: flex;
        gap: 10px;
      }
      .captcha-img {
        width: 120px;
        height: 40px;
        border-radius: 12px;
        border: 1px solid var(--ag-outline);
        background: var(--ag-surface);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        overflow: hidden;
      }
      .captcha-img img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .submit-btn {
        height: 46px !important;
        border-radius: 999px !important;
        font-weight: 700 !important;
        margin-top: 4px;
      }
      .init-pwd-tip {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 12px 14px;
        border-radius: 16px;
        background: var(--ag-surface);
        border: 1px solid var(--ag-outline-variant);
        font-size: 0.73rem;
        color: var(--ag-on-surface-variant);
        line-height: 1.5;
      }
      .init-pwd-tip mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        color: var(--ag-primary);
        margin-top: 2px;
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

  form = {
    username: 'admin',
    password: '',
    captcha_id: '',
    captcha_code: '',
    totp_code: '',
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

  async handleLogin() {
    this.errorMsg.set('')
    this.loading.set(true)
    try {
      const ok = await this.auth.login(this.form)
      if (ok) {
        this.toast.success('欢迎回来，已进入 Google Material 3 运维工作台')
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
