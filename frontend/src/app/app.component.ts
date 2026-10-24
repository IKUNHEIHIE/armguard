import { Component, OnInit, OnDestroy, inject, effect, signal } from '@angular/core'
import { Router, NavigationEnd } from '@angular/router'
import { filter } from 'rxjs/operators'
import { AgMaterialModule } from './core/material.module'
import { AuthService } from './core/auth.service'
import { SystemService } from './core/system.service'
import { ThemeService } from './core/theme.service'
import { ToastService } from './core/toast.service'
import { ArmHardwareBadgeComponent } from './components/arm-hardware-badge.component'
import { FloatingAiCompanionComponent } from './components/floating-ai-companion.component'

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
  imports: [AgMaterialModule, ArmHardwareBadgeComponent, FloatingAiCompanionComponent],
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
        >
          <div class="drawer-brand">
            <div class="brand-logo">
              <mat-icon>developer_board</mat-icon>
            </div>
            <div class="brand-text">
              <div class="brand-name font-display">{{ system.panelTitle() }}</div>
              <div class="brand-tag font-mono">MATERIAL 3 · ARM64</div>
            </div>
          </div>

          <div class="nav-groups">
            <div *ngFor="let grp of navGroups" class="nav-group">
              <div class="group-label font-mono">{{ grp.group }}</div>
              <a
                *ngFor="let item of grp.items"
                [routerLink]="item.path"
                routerLinkActive="active-pill"
                [routerLinkActiveOptions]="{ exact: item.path === '/' }"
                class="m3-nav-item"
                (click)="isMobile() && mobileDrawerOpen.set(false)"
              >
                <mat-icon class="nav-icon">{{ item.icon }}</mat-icon>
                <span class="nav-label">{{ item.label }}</span>
                <span *ngIf="item.badge" class="nav-badge font-mono">{{ item.badge }}</span>
              </a>
            </div>
          </div>

          <!-- Bottom Host Summary Card in Sidenav -->
          <div class="drawer-footer font-mono">
            <div class="host-chip">
              <span class="dot" [class.live]="system.wsConnected()"></span>
              <div class="host-info">
                <div class="host-name">{{ system.info()?.hostname || 'armguard-node' }}</div>
                <div class="host-arch">
                  {{ system.info()?.arch || 'aarch64' }} · {{ system.info()?.panel_version || 'v0.2.0' }}
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
                mat-icon-button
                (click)="mobileDrawerOpen.set(!mobileDrawerOpen())"
              >
                <mat-icon>menu</mat-icon>
              </button>
              <div class="breadcrumb-title font-display">
                <span>{{ currentPageTitle() }}</span>
              </div>
            </div>

            <div class="appbar-right">
              <!-- ARM Silicon Hardware Sensor Badge -->
              <ag-arm-hardware-badge></ag-arm-hardware-badge>

              <!-- M3 Dark / Light Theme Switcher -->
              <button
                mat-icon-button
                (click)="theme.toggleTheme()"
                [matTooltip]="theme.mode() === 'dark' ? '切换至 Material 3 浅色模式' : '切换至 Material 3 深色模式'"
              >
                <mat-icon>{{ theme.mode() === 'dark' ? 'light_mode' : 'dark_mode' }}</mat-icon>
              </button>

              <!-- Admin Account Menu -->
              <button mat-stroked-button [matMenuTriggerFor]="userMenu" class="user-pill font-mono">
                <mat-icon>account_circle</mat-icon>
                <span>{{ auth.user()?.username || 'admin' }}</span>
                <mat-icon>expand_more</mat-icon>
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

          <!-- Routed Page Viewport -->
          <main class="m3-viewport">
            <router-outlet></router-outlet>
          </main>

          <!-- Floating AI Companion -->
          <ag-floating-ai-companion></ag-floating-ai-companion>
        </mat-sidenav-content>
      </mat-sidenav-container>
    </ng-template>
  `,
  styles: [
    `
      .m3-shell-container {
        height: 100vh;
        width: 100vw;
        background: var(--ag-bg) !important;
      }
      .m3-nav-drawer {
        width: 268px !important;
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
        font-size: 0.68rem;
        font-weight: 700;
        color: var(--ag-on-surface-variant);
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }
      .m3-nav-item {
        display: flex;
        align-items: center;
        gap: 12px;
        height: 44px;
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
      }
      .host-chip .dot.live {
        background: var(--ag-success);
        box-shadow: 0 0 8px var(--ag-success);
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
        background: var(--ag-bg) !important;
      }
      .m3-top-appbar {
        height: 64px !important;
        padding: 0 24px !important;
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
        gap: 10px;
      }
      .user-pill {
        border-radius: 999px !important;
        height: 36px;
        border-color: var(--ag-outline-variant) !important;
      }
      .m3-viewport {
        flex: 1;
        overflow-y: auto;
        padding: 24px;
        max-width: 1520px;
        width: 100%;
        margin: 0 auto;
      }
    `,
  ],
})
export class AppComponent implements OnInit, OnDestroy {
  readonly auth = inject(AuthService)
  readonly system = inject(SystemService)
  readonly theme = inject(ThemeService)
  private router = inject(Router)
  private toast = inject(ToastService)

  readonly isLoginRoute = signal(window.location.pathname.startsWith('/login'))
  readonly isMobile = signal(window.innerWidth < 960)
  readonly mobileDrawerOpen = signal(false)
  readonly currentPageTitle = signal('系统概览与硅片监控')

  navGroups: NavGroup[] = [
    {
      group: '监控与概览',
      items: [
        { path: '/', label: '硅片概览与遥测', icon: 'space_dashboard', badge: 'M3' },
        { path: '/terminal', label: 'Web SSH 终端', icon: 'terminal' },
      ],
    },
    {
      group: 'Web 与网络编排',
      items: [
        { path: '/sites', label: '网站与 gRPC 反代', icon: 'language' },
        { path: '/stream', label: '四层端口转发', icon: 'swap_horiz', badge: 'L4' },
        { path: '/ssl', label: 'SSL 证书中心', icon: 'verified_user' },
      ],
    },
    {
      group: '容器、数据与软件',
      items: [
        { path: '/docker', label: 'Docker 与架构预检', icon: 'deployed_code' },
        { path: '/databases', label: '数据库管理', icon: 'database' },
        { path: '/appstore', label: 'ARM 软件商店', icon: 'apps' },
        { path: '/files', label: '文件资源管理器', icon: 'folder_open' },
      ],
    },
    {
      group: '安全与系统运维',
      items: [
        { path: '/security', label: '防火墙与 SSH 加固', icon: 'security' },
        { path: '/crontab', label: '计划任务 (Cron)', icon: 'schedule' },
        { path: '/logs', label: '审计与系统日志', icon: 'receipt_long' },
        { path: '/settings', label: '面板核心设置', icon: 'tune' },
      ],
    },
  ]

  private resizeListener = () => this.isMobile.set(window.innerWidth < 960)

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((ev) => {
        const url = ev.urlAfterRedirects || ev.url
        this.isLoginRoute.set(url.startsWith('/login'))
        this.updateTitleFromUrl(url)
        if (!url.startsWith('/login') && localStorage.getItem('armguard_token')) {
          this.bootstrapSession()
        } else {
          this.system.stopMonitoring()
        }
      })

    effect(() => {
      if (this.auth.isLoggedIn() && !this.isLoginRoute()) {
        this.bootstrapSession()
      }
    })
  }

  ngOnInit() {
    window.addEventListener('resize', this.resizeListener)
    if (!this.isLoginRoute() && localStorage.getItem('armguard_token')) {
      this.bootstrapSession()
    }
  }

  ngOnDestroy() {
    window.removeEventListener('resize', this.resizeListener)
    this.system.stopMonitoring()
  }

  private bootstrapSession() {
    this.auth.refreshUserInfo()
    this.system.fetchPanelSettings()
    this.system.fetchInfo()
    this.system.startMonitoring()
  }

  private updateTitleFromUrl(url: string) {
    for (const grp of this.navGroups) {
      for (const item of grp.items) {
        if ((item.path === '/' && url === '/') || (item.path !== '/' && url.startsWith(item.path))) {
          this.currentPageTitle.set(item.label)
          return
        }
      }
    }
  }

  async handleLogout() {
    this.system.stopMonitoring()
    await this.auth.logout()
    this.toast.info('已安全退出登录')
    this.router.navigateByUrl('/login')
  }
}
