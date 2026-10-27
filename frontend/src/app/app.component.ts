import { Component, OnInit, OnDestroy, inject, effect, signal } from '@angular/core'
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

interface NavItem {
  path: string
  label: string
  icon: string
  badge?: string
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
  ],
  template: `
    <!-- Unauthenticated Route (Login) -->
    <ng-container *ngIf="isLoginRoute(); else m3Shell">
      <router-outlet></router-outlet>
    </ng-container>

    <!-- Google Material Design 3 Workspace Shell -->
    <ng-template #m3Shell>
      <mat-sidenav-container class="m3-shell-container">
        <!-- M3 Navigation Drawer -->
        <mat-sidenav
          #drawer
          [mode]="isMobile() ? 'over' : 'side'"
          [opened]="!isMobile() || mobileDrawerOpen()"
          (closedStart)="mobileDrawerOpen.set(false)"
          class="m3-nav-drawer"
          aria-label="主导航栏"
        >
          <div class="drawer-brand">
            <div class="brand-logo" aria-hidden="true">
              <mat-icon>developer_board</mat-icon>
            </div>
            <div class="brand-text">
              <div class="brand-name font-display">{{ system.panelTitle() }}</div>
              <div class="brand-tag font-mono">MATERIAL 3 · ARM64</div>
            </div>
          </div>

          <nav class="nav-groups" aria-label="功能模块导航">
            <div *ngFor="let grp of navGroups" class="nav-group">
              <button
                type="button"
                class="group-label group-toggle"
                [attr.aria-expanded]="!isGroupCollapsed(grp.group)"
                [attr.aria-controls]="'nav-group-' + grp.group"
                (click)="toggleGroup(grp.group)"
              >
                <span class="group-label-text">{{ grp.group }}</span>
                <mat-icon
                  class="group-chevron"
                  [class.group-chevron-expanded]="!isGroupCollapsed(grp.group)"
                  aria-hidden="true"
                >
                  expand_more
                </mat-icon>
              </button>
              <div
                class="group-items"
                [class.group-items-collapsed]="isGroupCollapsed(grp.group)"
                [id]="'nav-group-' + grp.group"
                [attr.inert]="isGroupCollapsed(grp.group) ? '' : null"
              >
                <div class="group-items-inner">
                  <a
                    *ngFor="let item of grp.items"
                    [routerLink]="item.path"
                    routerLinkActive="active-pill"
                    [routerLinkActiveOptions]="{ exact: item.path === '/' }"
                    class="m3-nav-item"
                    (click)="isMobile() && mobileDrawerOpen.set(false)"
                  >
                    <mat-icon class="nav-icon" aria-hidden="true">{{ item.icon }}</mat-icon>
                    <span class="nav-label">{{ item.label }}</span>
                    <span *ngIf="item.badge" class="nav-badge font-mono">{{ item.badge }}</span>
                  </a>
                </div>
              </div>
            </div>
          </nav>

          <!-- Bottom Host Summary Card in Sidenav -->
          <div class="drawer-footer font-mono">
            <div class="host-chip" role="status" aria-live="polite">
              <span
                class="dot"
                [class.live]="system.wsConnected()"
                [class.warn]="system.isStale()"
              ></span>
              <div class="host-info">
                <div class="host-name">{{ system.info()?.hostname || 'armguard-node' }}</div>
                <div class="host-arch">
                  {{ system.info()?.arch || 'aarch64' }} · {{ system.info()?.panel_version || 'v0.2.0' }}
                  <span *ngIf="system.info()?.build_commit">({{ system.info()!.build_commit }})</span>
                </div>
              </div>
            </div>
          </div>
        </mat-sidenav>

        <!-- Main Content Area -->
        <mat-sidenav-content class="m3-main-content">
          <!-- Google M3 Top App Bar -->
          <mat-toolbar class="m3-top-appbar">
            <div class="appbar-left">
              <button
                *ngIf="isMobile()"
                type="button"
                mat-icon-button
                aria-label="打开或关闭侧边导航菜单"
                (click)="mobileDrawerOpen.set(!mobileDrawerOpen())"
              >
                <mat-icon>menu</mat-icon>
              </button>
              <div class="breadcrumb-title font-display">
                <span>{{ currentPageTitle() }}</span>
              </div>
            </div>

            <div class="appbar-right">
              <!-- Global Task Center Pill (FE-006) -->
              <button
                type="button"
                mat-stroked-button
                class="task-pill font-mono"
                [class.active]="taskCenter.activeCount() > 0"
                aria-label="打开后台任务进度中心"
                matTooltip="查看软件安装、镜像拉取与数据备份任务进度"
                (click)="taskCenter.drawerOpen.set(true)"
              >
                <mat-icon class="task-icon">
                  {{ taskCenter.activeCount() > 0 ? 'downloading' : 'assignment_turned_in' }}
                </mat-icon>
                <span class="hide-xs">
                  {{
                    taskCenter.activeCount() > 0
                      ? '任务进行中 (' + taskCenter.activeCount() + ')'
                      : '任务中心'
                  }}
                </span>
                <span *ngIf="taskCenter.tasks().length > 0 && taskCenter.activeCount() === 0" class="task-count">
                  {{ taskCenter.tasks().length }}
                </span>
              </button>

              <!-- ARM Silicon Hardware Sensor Badge -->
              <ag-arm-hardware-badge></ag-arm-hardware-badge>

              <!-- M3 Dark / Light Theme Switcher -->
              <button
                type="button"
                mat-icon-button
                aria-label="切换深色或浅色主题"
                (click)="theme.toggleTheme()"
                [matTooltip]="theme.mode() === 'dark' ? '切换至浅色模式' : '切换至深色模式'"
              >
                <mat-icon>{{ theme.mode() === 'dark' ? 'light_mode' : 'dark_mode' }}</mat-icon>
              </button>

              <!-- Admin Account Menu -->
              <button
                type="button"
                mat-stroked-button
                [matMenuTriggerFor]="userMenu"
                class="user-pill font-mono"
                aria-label="管理员账户菜单"
              >
                <mat-icon aria-hidden="true">account_circle</mat-icon>
                <span>{{ auth.user()?.username || 'admin' }}</span>
                <mat-icon aria-hidden="true">expand_more</mat-icon>
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
                  <mat-icon color="warn">logout</mat-icon>
                  <span>安全退出登录</span>
                </button>
              </mat-menu>
            </div>
          </mat-toolbar>

          <!-- Chunk Load / Navigation Error Recovery Banner (FE-015) -->
          <div
            *ngIf="navError()"
            class="nav-error-banner font-mono"
            role="alert"
            aria-live="assertive"
          >
            <div class="err-left">
              <mat-icon>cloud_off</mat-icon>
              <span>{{ navError() }}</span>
            </div>
            <div class="err-actions">
              <button type="button" mat-stroked-button (click)="retryNavigation()">重试加载</button>
              <button type="button" mat-flat-button color="primary" (click)="reloadWindow()">刷新页面</button>
            </div>
          </div>

          <!-- Routed Page Viewport -->
          <main class="m3-viewport">
            <router-outlet></router-outlet>
          </main>

          <!-- Floating AI Companion -->
          <ag-floating-ai-companion></ag-floating-ai-companion>
        </mat-sidenav-content>
      </mat-sidenav-container>
    </ng-template>

    <!-- Global Unified Dialogs (FE-006 & FE-009) -->
    <ag-confirm-dialog></ag-confirm-dialog>
    <ag-task-drawer></ag-task-drawer>
  `,
  styles: [
    `
      .m3-shell-container {
        height: 100vh;
        height: 100dvh;
        width: 100vw;
        background: var(--ag-bg) !important;
      }
      .m3-nav-drawer {
        width: 264px !important;
        background: var(--ag-surface-lowest) !important;
        border-right: 1px solid var(--ag-outline-variant) !important;
        display: flex;
        flex-direction: column;
        padding: 16px 12px;
      }
      .drawer-brand {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 14px 18px;
        border-bottom: 1px solid var(--ag-outline-variant);
      }
      .brand-logo {
        width: 40px;
        height: 40px;
        border-radius: 14px;
        background: var(--ag-primary-container);
        color: var(--ag-on-primary-container);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .brand-name {
        font-weight: 800;
        font-size: 1.05rem;
        color: var(--ag-on-surface);
        letter-spacing: -0.01em;
      }
      .brand-tag {
        font-size: 0.65rem;
        color: var(--ag-primary);
        font-weight: 600;
      }
      .nav-groups {
        flex: 1;
        overflow-y: auto;
        padding: 12px 0;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .group-label {
        padding: 0 16px 6px;
        font-size: 0.72rem;
        font-weight: 700;
        color: var(--ag-on-surface-variant);
        letter-spacing: 0.03em;
      }
      .group-toggle {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        width: calc(100% - 16px);
        margin: 0 8px 6px;
        padding: 6px 8px;
        border: none;
        border-radius: 8px;
        background: transparent;
        cursor: pointer;
        text-align: left;
        min-height: 32px;
        transition: background 0.15s ease, color 0.15s ease;
      }
      .group-toggle:hover {
        background: color-mix(in srgb, var(--ag-primary) 8%, transparent);
        color: var(--ag-primary);
      }
      .group-toggle:focus-visible {
        outline: 2px solid var(--ag-primary);
        outline-offset: 1px;
      }
      .group-label-text {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .group-chevron {
        width: 16px;
        height: 16px;
        font-size: 16px;
        line-height: 16px;
        opacity: 0.75;
      }
      .group-items {
        display: grid;
        grid-template-rows: 1fr;
        transition:
          grid-template-rows 260ms cubic-bezier(0.4, 0, 0.2, 1),
          opacity 200ms ease;
        opacity: 1;
      }
      .group-items-collapsed {
        grid-template-rows: 0fr;
        opacity: 0;
      }
      .group-items-inner {
        overflow: hidden;
        display: flex;
        flex-direction: column;
        min-height: 0;
      }
      .group-chevron {
        transition: transform 260ms cubic-bezier(0.4, 0, 0.2, 1);
      }
      .group-chevron-expanded {
        transform: rotate(180deg);
      }
      /* 尊重系统的「减少动态效果」偏好 */
      @media (prefers-reduced-motion: reduce) {
        .group-items,
        .group-chevron {
          transition: none;
        }
      }
      .m3-nav-item {
        display: flex;
        align-items: center;
        gap: 12px;
        min-height: 44px;
        padding: 0 16px;
        border-radius: 999px;
        color: var(--ag-on-surface-variant);
        text-decoration: none;
        font-size: 0.85rem;
        font-weight: 500;
        transition: background-color 140ms, color 140ms;
        margin-bottom: 2px;
      }
      .m3-nav-item:hover {
        background: var(--ag-surface-low);
        color: var(--ag-on-surface);
      }
      .m3-nav-item.active-pill {
        background: var(--ag-secondary-container);
        color: var(--ag-on-secondary-container);
        font-weight: 700;
      }
      .m3-nav-item.active-pill .nav-icon {
        color: var(--ag-primary);
      }
      .nav-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
      .nav-label {
        flex: 1;
      }
      .nav-badge {
        font-size: 0.65rem;
        padding: 1px 7px;
        border-radius: 999px;
        background: var(--ag-primary-container);
        color: var(--ag-on-primary-container);
      }
      .drawer-footer {
        padding-top: 12px;
        border-top: 1px solid var(--ag-outline-variant);
      }
      .host-chip {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        border-radius: 16px;
        background: var(--ag-surface-low);
        border: 1px solid var(--ag-outline-variant);
      }
      .host-chip .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: var(--ag-warning);
        flex-shrink: 0;
      }
      .host-chip .dot.live {
        background: var(--ag-success);
        box-shadow: 0 0 8px var(--ag-success);
      }
      .host-chip .dot.warn {
        background: var(--ag-danger);
      }
      .host-name {
        font-size: 0.78rem;
        font-weight: 700;
        color: var(--ag-on-surface);
      }
      .host-arch {
        font-size: 0.68rem;
        color: var(--ag-on-surface-variant);
      }
      .m3-main-content {
        display: flex !important;
        flex-direction: column;
        height: 100vh;
        height: 100dvh;
        background: var(--ag-bg) !important;
        container-type: inline-size;
      }
      .m3-top-appbar {
        min-height: 64px !important;
        padding: 0 20px !important;
        background: var(--ag-surface-lowest) !important;
        border-bottom: 1px solid var(--ag-outline-variant);
        display: flex;
        align-items: center;
        justify-content: space-between;
        position: sticky;
        top: 0;
        z-index: 50;
      }
      .appbar-left {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .breadcrumb-title {
        font-size: 1.05rem;
        font-weight: 700;
        color: var(--ag-on-surface);
      }
      .appbar-right {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .task-pill {
        border-radius: 999px !important;
        height: 36px;
        padding: 0 12px !important;
        border-color: var(--ag-outline-variant) !important;
        background: var(--ag-surface) !important;
        font-size: 0.76rem;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .task-pill.active {
        border-color: var(--ag-primary) !important;
        background: var(--ag-primary-container) !important;
        color: var(--ag-on-primary-container) !important;
      }
      .task-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        color: var(--ag-primary);
      }
      .task-pill.active .task-icon {
        color: var(--ag-on-primary-container);
      }
      .task-count {
        background: var(--ag-surface-high);
        color: var(--ag-on-surface);
        padding: 1px 6px;
        border-radius: 999px;
        font-size: 0.68rem;
      }
      .user-pill {
        border-radius: 999px !important;
        height: 36px;
        border-color: var(--ag-outline-variant) !important;
      }
      .nav-error-banner {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 10px 24px;
        background: var(--ag-danger-container);
        border-bottom: 1px solid var(--ag-danger);
        color: var(--ag-danger);
        font-size: 0.8rem;
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
      .m3-viewport {
        flex: 1;
        overflow-y: auto;
        padding: 20px 24px 88px;
        max-width: 1520px;
        width: 100%;
        margin: 0 auto;
      }
      @media (max-width: 680px) {
        .hide-xs {
          display: none;
        }
        .m3-viewport {
          padding: 14px 14px 88px;
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
  readonly currentPageTitle = signal('首页')
  readonly navError = signal<string | null>(null)
  /** 侧边栏分组折叠状态（按分组名持久化到 localStorage） */
  readonly collapsedGroups = signal<Record<string, boolean>>(this.readCollapsedGroups())
  private lastFailedUrl: string | null = null
  private sessionBootstrapped = false

  navGroups: NavGroup[] = [
    {
      group: '监控与概览',
      items: [
        { path: '/', label: '首页', icon: 'space_dashboard', badge: 'M3' },
        { path: '/terminal', label: 'Web SSH 终端', icon: 'terminal' },
      ],
    },
    {
      group: 'Web 与网络编排',
      items: [
        { path: '/sites', label: '网站与反向代理', icon: 'language' },
        { path: '/stream', label: '四层端口转发', icon: 'swap_horiz', badge: 'L4' },
        { path: '/ssl', label: 'SSL 证书中心', icon: 'verified_user' },
      ],
    },
    {
      group: '容器、数据与软件',
      items: [
        { path: '/docker', label: 'Docker 容器与镜像', icon: 'deployed_code' },
        { path: '/databases', label: '数据库管理', icon: 'database' },
        { path: '/appstore', label: '软件商店', icon: 'apps' },
        { path: '/files', label: '文件资源管理器', icon: 'folder_open' },
      ],
    },
    {
      group: '安全与系统运维',
      items: [
        { path: '/security', label: '防火墙与 SSH 加固', icon: 'security' },
        { path: '/toolbox', label: '工具箱', icon: 'handyman' },
        { path: '/crontab', label: '计划任务 (Cron)', icon: 'schedule' },
        { path: '/logs', label: '审计与系统日志', icon: 'receipt_long' },
        { path: '/settings', label: '面板设置', icon: 'tune' },
      ],
    },
  ]

  private resizeListener = () => this.isMobile.set(window.innerWidth < 1024)

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

  private ensureSessionBootstrapped() {
    this.system.startMonitoring()
    if (this.sessionBootstrapped) return
    this.sessionBootstrapped = true
    this.auth.refreshUserInfo()
    this.system.fetchPanelSettings()
    this.system.fetchInfo()
    this.taskCenter.syncServerAppTasks()
  }

  private readCollapsedGroups(): Record<string, boolean> {
    try {
      const raw = localStorage.getItem('armguard_nav_collapsed')
      const parsed = raw ? JSON.parse(raw) : {}
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  private persistCollapsedGroups(state: Record<string, boolean>) {
    try {
      localStorage.setItem('armguard_nav_collapsed', JSON.stringify(state))
    } catch {
      /* 隐私模式下 localStorage 可能不可写，忽略即可 */
    }
  }

  isGroupCollapsed(group: string): boolean {
    return this.collapsedGroups()[group] === true
  }

  toggleGroup(group: string) {
    const next = { ...this.collapsedGroups() }
    if (next[group]) delete next[group]
    else next[group] = true
    this.collapsedGroups.set(next)
    this.persistCollapsedGroups(next)
  }

  expandGroup(group: string) {
    if (!this.collapsedGroups()[group]) return
    const next = { ...this.collapsedGroups() }
    delete next[group]
    this.collapsedGroups.set(next)
    this.persistCollapsedGroups(next)
  }

  private updateTitleFromUrl(url: string) {
    const cleanUrl = url.split('?')[0]
    for (const grp of this.navGroups) {
      for (const item of grp.items) {
        if (
          (item.path === '/' && cleanUrl === '/') ||
          (item.path !== '/' && cleanUrl.startsWith(item.path))
        ) {
          this.currentPageTitle.set(item.label)
          // 导航到某个分组内的页面时自动展开该分组，避免「点了链接却看不见当前项」
          if (this.isGroupCollapsed(grp.group)) {
            this.expandGroup(grp.group)
          }
          return
        }
      }
    }
  }

  retryNavigation() {    if (this.lastFailedUrl) {
      this.router.navigateByUrl(this.lastFailedUrl)
    } else {
      this.navError.set(null)
    }
  }

  reloadWindow() {
    window.location.reload()
  }

  async handleLogout() {
    this.sessionBootstrapped = false
    this.system.stopMonitoring()
    await this.auth.logout()
    this.toast.info('已安全退出登录')
    this.router.navigateByUrl('/login')
  }
}
