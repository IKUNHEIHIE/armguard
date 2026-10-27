import { Component, HostListener, OnInit, OnDestroy, inject, effect, signal, computed } from '@angular/core'
import { Router, NavigationEnd, NavigationError } from '@angular/router'
import { AgMaterialModule } from './core/material.module'
import { AuthService } from './core/auth.service'
import { SystemService } from './core/system.service'
import { ThemeService } from './core/theme.service'
import { ToastService } from './core/toast.service'
import { TaskCenterService } from './core/task-center.service'
import { ArmHardwareBadgeComponent } from './components/arm-hardware-badge.component'
import { FloatingAiCompanionComponent } from './components/floating-ai-companion.component'
import { AgConfirmDialogComponent } from './components/ag-confirm-dialog.component'
import { AgTaskDrawerComponent } from './components/ag-task-drawer.component'
import { AgCommandPaletteComponent, AgPaletteEntry } from './components/command-palette.component'

interface NavItem {
  path: string
  label: string
  icon: string
  badge?: string
  keywords?: string
}

interface NavGroup {
  group: string
  items: NavItem[]
}

@Component({
  selector: 'ag-root',
  standalone: true,
  imports: [
    AgMaterialModule,
    ArmHardwareBadgeComponent,
    FloatingAiCompanionComponent,
    AgConfirmDialogComponent,
    AgTaskDrawerComponent,
    AgCommandPaletteComponent,
  ],
  template: `
    <!-- 未登录：登录页独占视口 -->
    <ng-container *ngIf="isLoginRoute(); else appShell">
      <router-outlet></router-outlet>
    </ng-container>

    <ng-template #appShell>
      <div class="app-shell">
        <!-- ================= 顶部应用栏（64px，白底，极轻投影） ================= -->
        <header class="topbar">
          <div class="topbar-left">
            <button
              *ngIf="isMobile()"
              type="button"
              class="icon-btn"
              aria-label="打开导航菜单"
              (click)="mobileDrawerOpen.set(true)"
            >
              <mat-icon>menu</mat-icon>
            </button>

            <a class="brand" routerLink="/" aria-label="ArmGuard 首页">
              <span class="brand-logo" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
                  <path
                    d="M12 3.2 19 6v5.3c0 4.2-2.8 7.6-7 9.5-4.2-1.9-7-5.3-7-9.5V6l7-2.8Z"
                    fill="#ffffff"
                    fill-opacity="0.96"
                  />
                  <path d="M12 7.6v8.2M8.4 10.6h7.2" stroke="#1a73e8" stroke-width="1.6" stroke-linecap="round" />
                </svg>
              </span>
              <span class="brand-name">ArmGuard</span>
            </a>
            <span class="version-chip font-mono">ARM {{ shortArch() }} / LINUX {{ versionLabel() }}</span>

            <span class="topbar-divider hide-lg" aria-hidden="true"></span>

            <button
              type="button"
              class="host-chip font-mono hide-lg"
              [matTooltip]="'复制主机名'"
              (click)="copyHostname()"
            >
              <span class="host-chip-text">{{ system.info()?.hostname || 'armguard-node' }}</span>
              <mat-icon aria-hidden="true">content_copy</mat-icon>
            </button>

            <span class="status-chip hide-md">
              <span
                class="status-dot"
                [class.online]="!system.isStale() && system.connectionState() !== 'offline'"
              ></span>
              <span>{{ system.isStale() ? '遥测延迟' : '系统正常' }}</span>
            </span>

            <ag-arm-hardware-badge class="hide-xl"></ag-arm-hardware-badge>
          </div>

          <div class="topbar-right">
            <button type="button" class="search-pill" (click)="paletteOpen.set(true)" aria-label="搜索或跳转 (Ctrl+K)">
              <mat-icon aria-hidden="true">search</mat-icon>
              <span class="search-pill-text">搜索容器、服务、网关</span>
              <kbd>Ctrl+K</kbd>
            </button>

            <button
              type="button"
              class="icon-btn task-btn"
              [class.is-active]="taskCenter.activeCount() > 0"
              aria-label="后台任务中心"
              matTooltip="后台任务（安装 / 拉取 / 备份）"
              (click)="taskCenter.drawerOpen.set(true)"
            >
              <mat-icon>{{ taskCenter.activeCount() > 0 ? 'downloading' : 'assignment_turned_in' }}</mat-icon>
              <span *ngIf="taskCenter.activeCount() > 0" class="task-badge font-mono">{{
                taskCenter.activeCount()
              }}</span>
            </button>

            <button
              type="button"
              class="icon-btn"
              aria-label="切换主题"
              (click)="theme.toggleTheme()"
              [matTooltip]="theme.mode() === 'dark' ? '切换至浅色模式' : '切换至深色模式'"
            >
              <mat-icon>{{ theme.mode() === 'dark' ? 'light_mode' : 'dark_mode' }}</mat-icon>
            </button>

            <span class="topbar-divider" aria-hidden="true"></span>

            <button type="button" class="user-block" [matMenuTriggerFor]="userMenu" aria-label="账户菜单">
              <span class="avatar" aria-hidden="true">{{ userInitial() }}</span>
              <span class="user-text">
                <span class="user-name">{{ auth.user()?.username || 'root' }}</span>
                <span class="user-role">运维管理员</span>
              </span>
              <mat-icon class="user-caret hide-sm" aria-hidden="true">expand_more</mat-icon>
            </button>

            <mat-menu #userMenu="matMenu" xPosition="before">
              <button mat-menu-item routerLink="/settings">
                <mat-icon>manage_accounts</mat-icon>
                <span>管理员凭证与面板设置</span>
              </button>
              <button mat-menu-item routerLink="/logs">
                <mat-icon>receipt_long</mat-icon>
                <span>操作审计日志</span>
              </button>
              <mat-divider></mat-divider>
              <button mat-menu-item (click)="handleLogout()">
                <mat-icon>logout</mat-icon>
                <span>退出登录</span>
              </button>
            </mat-menu>
          </div>
        </header>

        <div class="app-body">
          <!-- ================= 侧边导航（216px） ================= -->
          <div
            *ngIf="isMobile() && mobileDrawerOpen()"
            class="drawer-scrim"
            (click)="mobileDrawerOpen.set(false)"
            aria-hidden="true"
          ></div>

          <aside class="sidebar" [class.is-open]="mobileDrawerOpen()" aria-label="主导航">
            <nav class="nav">
              <div *ngFor="let grp of navGroups" class="nav-group">
                <div class="nav-group-label">{{ grp.group }}</div>
                <a
                  *ngFor="let item of grp.items"
                  [routerLink]="item.path"
                  routerLinkActive="is-active"
                  [routerLinkActiveOptions]="{ exact: item.path === '/' }"
                  class="nav-item"
                  (click)="isMobile() && mobileDrawerOpen.set(false)"
                >
                  <mat-icon class="nav-icon" aria-hidden="true">{{ item.icon }}</mat-icon>
                  <span class="nav-label">{{ item.label }}</span>
                  <span *ngIf="item.badge" class="nav-tag font-mono">{{ item.badge }}</span>
                </a>
              </div>
            </nav>

            <div class="sidebar-footer font-mono">
              <div class="footer-row">
                <span class="footer-label">运行时长</span>
                <span class="footer-value">{{ uptimeLabel() }}</span>
              </div>
              <div class="footer-grid">
                <div class="footer-cell">
                  <span class="cell-label">CPU</span>
                  <span class="cell-value">{{ formatPercent(system.realtime().cpu.percent) }}</span>
                </div>
                <div class="footer-cell">
                  <span class="cell-label">MEM</span>
                  <span class="cell-value">{{ formatPercent(system.realtime().memory.percent) }}</span>
                </div>
                <div class="footer-cell">
                  <span class="cell-label">DISK</span>
                  <span class="cell-value">{{ formatPercent(system.realtime().disk.percent) }}</span>
                </div>
              </div>
            </div>
          </aside>

          <!-- ================= 内容画布 ================= -->
          <div class="canvas">
            <div class="crumbs">
              <span class="crumb-group">{{ currentGroup() }}</span>
              <mat-icon class="crumb-sep" aria-hidden="true">chevron_right</mat-icon>
              <span class="crumb-current">{{ currentPageTitle() }}</span>
              <span *ngIf="navError()" class="m3-badge danger" style="margin-left: 8px">连接异常</span>
            </div>

            <div *ngIf="navError()" class="nav-error" role="alert" aria-live="assertive">
              <div class="err-left">
                <mat-icon aria-hidden="true">cloud_off</mat-icon>
                <span>{{ navError() }}</span>
              </div>
              <div class="err-actions">
                <button type="button" mat-stroked-button (click)="retryNavigation()">重试加载</button>
                <button type="button" mat-flat-button color="primary" (click)="reloadWindow()">刷新页面</button>
              </div>
            </div>

            <main class="viewport">
              <router-outlet></router-outlet>
            </main>
          </div>

          <ag-floating-ai-companion></ag-floating-ai-companion>
        </div>
      </div>
    </ng-template>

    <ag-confirm-dialog></ag-confirm-dialog>
    <ag-task-drawer></ag-task-drawer>
    <ag-command-palette
      [open]="paletteOpen()"
      [entries]="paletteEntries"
      [extraActions]="paletteActions"
      (closed)="paletteOpen.set(false)"
      (navigate)="goTo($event)"
      (action)="runPaletteAction($event)"
    ></ag-command-palette>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }

      .app-shell {
        display: flex;
        flex-direction: column;
        height: 100vh;
        height: 100dvh;
        background: var(--ag-bg);
      }

      /* ---------- 顶部应用栏 ---------- */
      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        height: 64px;
        flex-shrink: 0;
        padding: 0 24px;
        background: var(--ag-surface-lowest);
        border-bottom: 1px solid var(--ag-outline-variant);
        box-shadow: 0 1px 8px rgba(0, 0, 0, 0.04);
        z-index: 30;
      }
      .topbar-left,
      .topbar-right {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      .topbar-left {
        gap: 12px;
      }

      .brand {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        flex-shrink: 0;
      }
      .brand-logo {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 10px;
        background: linear-gradient(150deg, #2b86f5, #1a73e8 60%, #1557b0);
        box-shadow: 0 1px 3px rgba(26, 115, 232, 0.35);
      }
      .brand-name {
        font-family: var(--ag-font-display);
        font-size: 1.125rem;
        font-weight: 600;
        letter-spacing: -0.2px;
        color: var(--ag-on-surface);
      }
      .version-chip {
        flex-shrink: 0;
        padding: 2px 6px;
        border-radius: var(--ag-radius-xs);
        background: #d8e2ff;
        color: #004493;
        font-size: 0.6875rem;
        font-weight: 600;
        letter-spacing: 0.3px;
        text-transform: uppercase;
        white-space: nowrap;
      }
      html.dark-theme .version-chip {
        background: rgba(168, 199, 250, 0.16);
        color: #adc7ff;
      }
      .topbar-divider {
        width: 1px;
        height: 20px;
        flex-shrink: 0;
        background: var(--ag-outline-variant);
      }

      .host-chip,
      .status-chip,
      .cpu-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 30px;
        padding: 0 10px;
        border-radius: var(--ag-radius-sm);
        background: var(--ag-surface-low);
        border: none;
        color: var(--ag-on-surface-variant);
        font-size: 0.8125rem;
        white-space: nowrap;
      }
      .host-chip {
        cursor: pointer;
        max-width: 220px;
      }
      .host-chip:hover {
        background: var(--ag-surface);
      }
      .host-chip-text {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .host-chip mat-icon {
        font-size: 15px;
        width: 15px;
        height: 15px;
        opacity: 0.7;
      }
      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--ag-warning);
        flex-shrink: 0;
      }
      .status-dot.online {
        background: #34a853;
        box-shadow: 0 0 0 3px rgba(52, 168, 83, 0.14);
      }

      .search-pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        height: 40px;
        width: 280px;
        padding: 0 12px;
        border: 1px solid transparent;
        border-radius: var(--ag-radius-pill);
        background: var(--ag-surface-low);
        color: var(--ag-on-surface-variant);
        font-family: inherit;
        font-size: 0.8125rem;
        cursor: pointer;
        transition:
          background-color 140ms ease,
          border-color 140ms ease;
      }
      .search-pill:hover {
        background: var(--ag-surface);
      }
      .search-pill mat-icon {
        font-size: 19px;
        width: 19px;
        height: 19px;
      }
      .search-pill-text {
        flex: 1;
        text-align: left;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .search-pill kbd {
        padding: 1px 5px;
        border: 1px solid var(--ag-outline-variant);
        border-radius: 4px;
        background: var(--ag-surface-lowest);
        color: var(--ag-on-surface-variant);
        font-family: var(--ag-font-mono);
        font-size: 0.625rem;
        line-height: 14px;
      }

      .icon-btn {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        padding: 0;
        border: none;
        border-radius: 50%;
        background: transparent;
        color: var(--ag-on-surface-variant);
        cursor: pointer;
        transition:
          background-color 130ms ease,
          color 130ms ease;
      }
      .icon-btn:hover {
        background: var(--ag-surface-low);
        color: var(--ag-on-surface);
      }
      .icon-btn mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
      .task-btn.is-active {
        color: var(--ag-primary);
      }
      .task-badge {
        position: absolute;
        top: 1px;
        right: 0;
        min-width: 15px;
        height: 15px;
        padding: 0 3px;
        border-radius: 999px;
        background: var(--ag-primary-solid);
        color: var(--ag-on-primary);
        font-size: 0.5625rem;
        line-height: 15px;
        text-align: center;
      }

      .user-block {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 2px 6px 2px 2px;
        border: none;
        border-radius: var(--ag-radius-pill);
        background: transparent;
        cursor: pointer;
        font-family: inherit;
      }
      .user-block:hover {
        background: var(--ag-surface-low);
      }
      .avatar {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: var(--ag-surface);
        border: 1px solid var(--ag-outline-variant);
        color: var(--ag-on-surface);
        font-size: 0.8125rem;
        font-weight: 600;
        text-transform: uppercase;
      }
      .user-text {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        line-height: 1.25;
      }
      .user-name {
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--ag-on-surface);
      }
      .user-role {
        font-size: 0.6875rem;
        color: var(--ag-on-surface-variant);
      }
      .user-caret {
        font-size: 16px;
        width: 16px;
        height: 16px;
        color: var(--ag-on-surface-variant);
      }

      /* ---------- 主体 ---------- */
      .app-body {
        display: flex;
        flex: 1;
        min-height: 0;
      }

      .sidebar {
        display: flex;
        flex-direction: column;
        width: 216px;
        flex-shrink: 0;
        padding: 12px 12px 0;
        background: var(--ag-surface-lowest);
        border-right: 1px solid var(--ag-outline-variant);
        overflow-y: auto;
      }
      .nav {
        display: flex;
        flex-direction: column;
        gap: 18px;
        flex: 1;
        padding-bottom: 12px;
      }
      .nav-group {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .nav-group-label {
        padding: 0 12px 6px;
        font-size: 0.6875rem;
        font-weight: 600;
        letter-spacing: 0.6px;
        text-transform: uppercase;
        color: var(--ag-on-surface-variant);
        opacity: 0.85;
      }
      .nav-item {
        display: flex;
        align-items: center;
        gap: 12px;
        height: 40px;
        padding: 0 12px;
        border-radius: var(--ag-radius-pill);
        color: var(--ag-on-surface-variant);
        font-size: 0.8125rem;
        font-weight: 500;
        text-decoration: none;
        transition:
          background-color 130ms ease,
          color 130ms ease;
      }
      .nav-item:hover {
        background: var(--ag-surface-low);
        color: var(--ag-on-surface);
      }
      .nav-item.is-active {
        background: var(--ag-primary-solid);
        color: var(--ag-on-primary);
        font-weight: 600;
      }
      .nav-item.is-active .nav-icon {
        color: var(--ag-on-primary);
      }
      .nav-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
        color: var(--ag-on-surface-variant);
      }
      .nav-label {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .nav-tag {
        padding: 0 4px;
        border-radius: 4px;
        border: 1px solid currentColor;
        font-size: 0.5625rem;
        line-height: 13px;
        opacity: 0.8;
      }

      .sidebar-footer {
        flex-shrink: 0;
        padding: 12px 0 12px;
        border-top: 1px solid var(--ag-outline-variant);
      }
      .footer-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 4px 8px;
        font-size: 0.6875rem;
      }
      .footer-label {
        color: var(--ag-on-surface-variant);
      }
      .footer-value {
        color: var(--ag-on-surface);
        font-weight: 500;
      }
      .footer-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        border: 1px solid var(--ag-outline-variant);
        border-radius: var(--ag-radius-sm);
        overflow: hidden;
      }
      .footer-cell {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 6px 8px;
        border-right: 1px solid var(--ag-outline-variant);
      }
      .footer-cell:last-child {
        border-right: none;
      }
      .cell-label {
        font-size: 0.5625rem;
        letter-spacing: 0.4px;
        color: var(--ag-on-surface-variant);
      }
      .cell-value {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--ag-on-surface);
      }

      /* ---------- 画布 ---------- */
      .canvas {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
        overflow-y: auto;
        container-type: inline-size;
      }
      .crumbs {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 16px 24px 0;
        font-size: 0.8125rem;
        color: var(--ag-on-surface-variant);
      }
      .crumb-group {
        white-space: nowrap;
      }
      .crumb-sep {
        font-size: 16px;
        width: 16px;
        height: 16px;
        opacity: 0.6;
      }
      .crumb-current {
        font-weight: 600;
        color: var(--ag-on-surface);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .viewport {
        width: 100%;
        max-width: 1600px;
        padding: 12px 24px 88px;
      }

      .nav-error {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin: 12px 24px 0;
        padding: 10px 14px;
        border-radius: var(--ag-radius-sm);
        background: var(--ag-danger-container);
        border: 1px solid color-mix(in srgb, var(--ag-danger) 24%, transparent);
        color: var(--ag-danger);
        font-size: 0.8125rem;
      }
      .err-left {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .err-actions {
        display: flex;
        gap: 8px;
      }

      .drawer-scrim {
        position: fixed;
        inset: 64px 0 0 0;
        z-index: 40;
        background: rgba(32, 33, 36, 0.36);
      }

      /* ---------- 响应式 ---------- */
      @media (max-width: 1360px) {
        .hide-xl {
          display: none !important;
        }
      }
      @media (max-width: 1240px) {
        .hide-lg {
          display: none !important;
        }
      }
      @media (max-width: 1080px) {
        .hide-md {
          display: none !important;
        }
        .search-pill {
          width: 200px;
        }
      }
      @media (max-width: 1024px) {
        .sidebar {
          position: fixed;
          top: 64px;
          bottom: 0;
          left: 0;
          z-index: 45;
          transform: translateX(-100%);
          transition: transform 220ms cubic-bezier(0.2, 0, 0, 1);
          box-shadow: var(--ag-shadow-2);
        }
        .sidebar.is-open {
          transform: translateX(0);
        }
        .topbar {
          padding: 0 14px;
        }
        .crumbs {
          padding: 12px 14px 0;
        }
        .viewport {
          padding: 10px 14px 88px;
        }
        .nav-error {
          margin: 10px 14px 0;
        }
      }
      @media (max-width: 820px) {
        .search-pill {
          display: none;
        }
        .hide-sm {
          display: none !important;
        }
        .user-text {
          display: none;
        }
        .version-chip {
          display: none;
        }
      }
    `,
  ],
})
export class AppComponent implements OnInit, OnDestroy {
  readonly auth = inject(AuthService)
  readonly system = inject(SystemService)
  readonly theme = inject(ThemeService)
  readonly taskCenter = inject(TaskCenterService)
  private router = inject(Router)
  private toast = inject(ToastService)

  readonly isLoginRoute = signal(window.location.pathname.startsWith('/login'))
  readonly isMobile = signal(window.innerWidth < 1024)
  readonly mobileDrawerOpen = signal(false)
  readonly currentPageTitle = signal('首页仪表盘')
  readonly currentGroup = signal('监控与概览')
  readonly navError = signal<string | null>(null)
  readonly paletteOpen = signal(false)

  private lastFailedUrl: string | null = null
  private sessionBootstrapped = false

  readonly navGroups: NavGroup[] = [
    {
      group: '监控与概览',
      items: [
        { path: '/', label: '首页仪表盘', icon: 'space_dashboard', keywords: 'dashboard 概览 监控 首页' },
        { path: '/terminal', label: 'Web 终端', icon: 'terminal', keywords: 'shell ssh 命令行 pty' },
      ],
    },
    {
      group: '应用与网络',
      items: [
        { path: '/sites', label: '网站与反代', icon: 'language', keywords: 'nginx site proxy php 反代' },
        { path: '/stream', label: '端口转发', icon: 'swap_horiz', badge: 'L4', keywords: 'tcp udp stream 四层' },
        { path: '/ssl', label: 'SSL 证书', icon: 'verified_user', keywords: 'certbot 证书 https acme' },
      ],
    },
    {
      group: '容器与存储',
      items: [
        { path: '/docker', label: 'Docker 容器', icon: 'deployed_code', keywords: 'container image 镜像' },
        { path: '/databases', label: '数据库管理', icon: 'database', keywords: 'mysql sqlite 备份' },
        { path: '/files', label: '文件管理器', icon: 'folder_open', keywords: 'file 文件 上传' },
      ],
    },
    {
      group: '系统与安全',
      items: [
        { path: '/appstore', label: '软件应用商店', icon: 'apps', keywords: 'apt install 安装 应用' },
        { path: '/security', label: '安全与防火墙', icon: 'security', keywords: 'firewall ufw ssh fail2ban' },
        { path: '/toolbox', label: '系统工具箱', icon: 'handyman', keywords: 'dns swap timezone hosts mirror' },
        { path: '/crontab', label: '计划任务', icon: 'schedule', keywords: 'cron 定时' },
        { path: '/logs', label: '日志与审计', icon: 'receipt_long', keywords: 'log 日志 audit' },
        { path: '/settings', label: '面板设置', icon: 'tune', keywords: 'settings 配置' },
      ],
    },
  ]

  readonly paletteEntries: AgPaletteEntry[] = this.navGroups.flatMap((grp) =>
    grp.items.map((item) => ({
      label: item.label,
      path: item.path,
      icon: item.icon,
      group: grp.group,
      keywords: item.keywords,
    }))
  )

  readonly paletteActions = [
    { id: 'toggle-theme', label: '切换深色 / 浅色主题', icon: 'light_mode', hint: 'theme' },
    { id: 'open-tasks', label: '打开后台任务中心', icon: 'assignment_turned_in', hint: 'tasks' },
    { id: 'reload', label: '重新加载当前页面', icon: 'refresh', hint: 'reload' },
    { id: 'logout', label: '退出登录', icon: 'logout', hint: 'logout' },
  ]

  readonly userInitial = computed(() => (this.auth.user()?.username || 'root').slice(0, 1))

  readonly shortArch = computed(() => {
    const arch = (this.system.info()?.arch || 'aarch64').toLowerCase()
    if (arch.includes('aarch64') || arch.includes('arm64')) return 'v8'
    if (arch.includes('armv7')) return 'v7'
    if (arch.includes('x86_64') || arch.includes('amd64')) return 'x64'
    return arch.slice(0, 4)
  })

  readonly versionLabel = computed(() => {
    const v = this.system.info()?.panel_version || 'v0.2.1'
    return v.startsWith('v') ? v.toUpperCase() : `V${v}`
  })

  readonly uptimeLabel = computed(() => this.formatUptime(this.system.info()?.uptime_seconds || 0))

  private resizeListener = () => {
    this.isMobile.set(window.innerWidth < 1024)
    if (!this.isMobile()) this.mobileDrawerOpen.set(false)
  }

  constructor() {
    this.router.events.subscribe((ev) => {
      if (ev instanceof NavigationEnd) {
        this.navError.set(null)
        const url = ev.urlAfterRedirects || ev.url
        const onLogin = url.startsWith('/login')
        this.isLoginRoute.set(onLogin)
        this.updateTitleFromUrl(url)
        if (!onLogin && localStorage.getItem('armguard_token')) {
          this.ensureSessionBootstrapped()
        } else if (onLogin) {
          this.sessionBootstrapped = false
          this.system.stopMonitoring()
        }
      } else if (ev instanceof NavigationError) {
        this.lastFailedUrl = ev.url
        this.navError.set('页面模块资源加载失败（可能因网络波动或版本更新），请重试或刷新浏览器。')
      }
    })

    effect(() => {
      if (this.auth.isLoggedIn() && !this.isLoginRoute()) {
        this.ensureSessionBootstrapped()
      }
    })
  }

  ngOnInit() {
    window.addEventListener('resize', this.resizeListener)
    if (!this.isLoginRoute() && localStorage.getItem('armguard_token')) {
      this.ensureSessionBootstrapped()
    }
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.resizeListener)
    this.system.stopMonitoring()
  }

  /** 全局命令面板快捷键：Ctrl / Cmd + K */
  @HostListener('document:keydown', ['$event'])
  onGlobalKeydown(event: KeyboardEvent) {
    const isPaletteKey = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k'
    if (!isPaletteKey || this.isLoginRoute()) return
    event.preventDefault()
    this.paletteOpen.set(!this.paletteOpen())
  }

  private ensureSessionBootstrapped() {
    this.system.startMonitoring()
    if (this.sessionBootstrapped) return
    this.sessionBootstrapped = true
    this.auth.refreshUserInfo()
    this.system.fetchPanelSettings()
    this.system.fetchInfo()
    this.taskCenter.syncServerAppTasks()
  }

  async copyHostname() {
    const name = this.system.info()?.hostname
    if (!name) return
    try {
      await navigator.clipboard.writeText(name)
      this.toast.success(`已复制主机名 ${name}`)
    } catch {
      this.toast.warning('复制失败，请手动选择主机名')
    }
  }

  goTo(path: string) {
    if (this.isMobile()) this.mobileDrawerOpen.set(false)
    this.router.navigateByUrl(path)
  }

  runPaletteAction(id: string) {
    switch (id) {
      case 'toggle-theme':
        this.theme.toggleTheme()
        break
      case 'open-tasks':
        this.taskCenter.drawerOpen.set(true)
        break
      case 'reload':
        this.reloadWindow()
        break
      case 'logout':
        this.handleLogout()
        break
    }
  }

  private updateTitleFromUrl(url: string) {
    const cleanUrl = url.split('?')[0]
    for (const grp of this.navGroups) {
      for (const item of grp.items) {
        if ((item.path === '/' && cleanUrl === '/') || (item.path !== '/' && cleanUrl.startsWith(item.path))) {
          this.currentPageTitle.set(item.label)
          this.currentGroup.set(grp.group)
          return
        }
      }
    }
  }

  retryNavigation() {
    if (this.lastFailedUrl) {
      this.router.navigateByUrl(this.lastFailedUrl)
    } else {
      this.navError.set(null)
    }
  }

  reloadWindow() {
    window.location.reload()
  }

  formatPercent(value: number | null | undefined): string {
    if (value === null || value === undefined || isNaN(value)) return '--'
    return `${value.toFixed(0)}%`
  }

  formatUptime(seconds: number): string {
    if (!seconds) return '--'
    const d = Math.floor(seconds / 86400)
    const h = Math.floor((seconds % 86400) / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (d > 0) return `${d}天 ${h}小时`
    if (h > 0) return `${h}小时 ${m}分`
    return `${m}分钟`
  }

  async handleLogout() {
    this.sessionBootstrapped = false
    this.system.stopMonitoring()
    await this.auth.logout()
    this.toast.info('已安全退出登录')
    this.router.navigateByUrl('/login')
  }
}
