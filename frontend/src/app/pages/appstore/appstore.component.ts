import { Component, OnInit, inject, signal, computed } from '@angular/core'
import { AgMaterialModule } from '../../core/material.module'
import { ToastService } from '../../core/toast.service'
import { WarpPluginDialogComponent } from '../../components/warp-plugin-dialog.component'
import { appStoreApi, AppMarketItem, AppManagementData } from '@/api/appstore'

@Component({
  selector: 'ag-appstore',
  standalone: true,
  imports: [AgMaterialModule, WarpPluginDialogComponent],
  template: `
    <div class="m3-page">
      <div class="m3-page-header">
        <div>
          <h2 class="m3-page-title">
            <mat-icon style="color: var(--ag-primary)">apps</mat-icon>
            <span>ARM 原生软件商店与守护进程编排 (App Store)</span>
          </h2>
          <p class="m3-page-subtitle font-mono">
            提供 ARM64 / ARMv7 预编译包一键安装、服务启停、配置文件在线微调与 Cloudflare WARP 网关
          </p>
        </div>
        <div class="m3-page-actions">
          <button mat-stroked-button (click)="warpOpen.set(true)">
            <mat-icon>cloud_sync</mat-icon>
            <span>Cloudflare WARP 插件</span>
          </button>
          <button mat-flat-button color="primary" (click)="loadApps()">
            <mat-icon>refresh</mat-icon>
            <span>刷新商店</span>
          </button>
        </div>
      </div>

      <!-- Category Filter Bar -->
      <div class="m3-card" style="padding: 12px 18px !important">
        <div style="display: flex; flex-wrap: wrap; gap: 8px">
          <button
            *ngFor="let c of categories"
            mat-stroked-button
            [style.background]="activeCategory() === c.key ? 'var(--ag-primary-container)' : ''"
            [style.color]="activeCategory() === c.key ? 'var(--ag-on-primary-container)' : ''"
            (click)="activeCategory.set(c.key)"
          >
            {{ c.label }}
          </button>
        </div>
      </div>

      <!-- Apps Grid -->
      <div class="m3-grid-3">
        <div *ngFor="let app of filteredApps()" class="m3-card app-card">
          <div class="app-card-top">
            <div>
              <div class="app-name font-display">{{ app.name }}</div>
              <div class="font-mono" style="font-size: 0.72rem; color: var(--ag-on-surface-variant)">
                支持架构: {{ app.arch_support.join(' / ') }}
              </div>
            </div>
            <span
              class="m3-badge"
              [ngClass]="
                app.service_status === 'running'
                  ? 'success'
                  : app.status === 'installed'
                    ? 'primary'
                    : 'neutral'
              "
            >
              {{
                app.service_status === 'running'
                  ? '● 运行中'
                  : app.status === 'installed'
                    ? '已安装'
                    : '未安装'
              }}
            </span>
          </div>

          <p class="app-desc">{{ app.description }}</p>

          <div class="app-meta font-mono">
            <span class="m3-badge neutral">
              {{ app.has_prebuilt ? '官方 ARM 预编译包' : 'SBC 源码编译' }}
            </span>
            <span>版本: {{ app.current_version || app.versions[0] }}</span>
          </div>

          <div class="app-actions">
            <button
              *ngIf="app.key === 'warp'"
              mat-flat-button
              color="primary"
              (click)="warpOpen.set(true)"
            >
              管理 WARP 隧道
            </button>
            <ng-container *ngIf="app.key !== 'warp'">
              <button
                *ngIf="app.status !== 'installed'"
                mat-flat-button
                color="primary"
                (click)="installApp(app)"
              >
                一键安装
              </button>
              <button
                *ngIf="app.status === 'installed'"
                mat-stroked-button
                color="primary"
                (click)="openManage(app)"
              >
                服务配置
              </button>
              <button
                *ngIf="app.status === 'installed'"
                mat-button
                color="warn"
                (click)="uninstallApp(app)"
              >
                卸载
              </button>
            </ng-container>
          </div>
        </div>
      </div>

      <!-- Manage App Modal -->
      <div *ngIf="managingApp()" class="m3-modal-backdrop" (click)="managingApp.set(null)">
        <div class="m3-modal-dialog lg" (click)="$event.stopPropagation()">
          <div class="m3-modal-header">
            <h3>
              <mat-icon style="color: var(--ag-primary)">settings_applications</mat-icon>
              <span>服务管理: {{ managingApp()!.app_name }} ({{ managingApp()!.service_name }})</span>
            </h3>
            <button mat-icon-button (click)="managingApp.set(null)">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <div class="m3-modal-body font-mono">
            <div class="m3-tonal-card" style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px">
              <div>
                状态: <strong>{{ managingApp()!.status }}</strong> | PID: {{ managingApp()!.pid }} |
                内存: {{ managingApp()!.memory_mb }} MB
              </div>
              <div style="display: flex; gap: 8px">
                <button mat-stroked-button (click)="controlService('start')">启动</button>
                <button mat-stroked-button (click)="controlService('restart')">重启</button>
                <button mat-stroked-button (click)="controlService('reload')">重载</button>
                <button mat-stroked-button color="warn" (click)="controlService('stop')">停止</button>
              </div>
            </div>

            <div class="m3-field">
              <label>配置文件 ({{ managingApp()!.config_file_path }})</label>
              <textarea rows="12" [(ngModel)]="managingApp()!.raw_config"></textarea>
            </div>
          </div>
          <div class="m3-modal-footer">
            <button mat-stroked-button (click)="managingApp.set(null)">关闭</button>
            <button mat-flat-button color="primary" (click)="saveRawConfig()">保存配置并重载</button>
          </div>
        </div>
      </div>

      <ag-warp-plugin-dialog
        [open]="warpOpen()"
        (close)="warpOpen.set(false)"
      ></ag-warp-plugin-dialog>
    </div>
  `,
  styles: [
    `
      .app-card {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 12px;
      }
      .app-card-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
      }
      .app-name {
        font-size: 1.05rem;
        font-weight: 700;
      }
      .app-desc {
        margin: 0;
        font-size: 0.8rem;
        color: var(--ag-on-surface-variant);
        line-height: 1.5;
      }
      .app-meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 0.75rem;
      }
      .app-actions {
        display: flex;
        gap: 8px;
        padding-top: 6px;
        border-top: 1px solid var(--ag-outline-variant);
      }
    `,
  ],
})
export class AppstoreComponent implements OnInit {
  private toast = inject(ToastService)
  readonly apps = signal<AppMarketItem[]>([])
  readonly activeCategory = signal('all')
  readonly managingApp = signal<AppManagementData | null>(null)
  readonly warpOpen = signal(false)

  categories = [
    { key: 'all', label: '全部软件' },
    { key: 'webserver', label: 'Web 服务器' },
    { key: 'database', label: '数据库' },
    { key: 'runtime', label: '运行环境' },
    { key: 'cache', label: '缓存与队列' },
    { key: 'tools', label: '运维工具' },
  ]

  readonly filteredApps = computed(() => {
    const cat = this.activeCategory()
    if (cat === 'all') return this.apps()
    return this.apps().filter((a) => a.category === cat)
  })

  ngOnInit() {
    this.loadApps()
  }

  async loadApps() {
    try {
      const res = await appStoreApi.getMarketList()
      this.apps.set(res.data?.data?.list || [])
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async installApp(app: AppMarketItem) {
    const ver = app.versions[0] || 'latest'
    try {
      await appStoreApi.installApp(app.key, ver, false)
      this.toast.success(`${app.name} (${ver}) 已开始安装`)
      setTimeout(() => this.loadApps(), 1200)
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async uninstallApp(app: AppMarketItem) {
    if (!confirm(`确定要卸载 ${app.name} 吗？`)) return
    try {
      await appStoreApi.uninstallApp(app.key)
      this.toast.success(`${app.name} 已卸载`)
      this.loadApps()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async openManage(app: AppMarketItem) {
    try {
      const res = await appStoreApi.getAppManagement(app.key, app.current_version)
      if (res.data?.data) {
        this.managingApp.set(res.data.data)
      }
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async controlService(action: 'start' | 'stop' | 'restart' | 'reload') {
    const m = this.managingApp()
    if (!m) return
    try {
      await appStoreApi.controlAppService(m.app_key, action)
      this.toast.success(`服务操作 (${action}) 已执行`)
      const res = await appStoreApi.getAppManagement(m.app_key)
      if (res.data?.data) this.managingApp.set(res.data.data)
      this.loadApps()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async saveRawConfig() {
    const m = this.managingApp()
    if (!m) return
    try {
      await appStoreApi.saveRawConfig(m.app_key, m.config_file_path, m.raw_config)
      this.toast.success('配置文件已保存')
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }
}
