import { Component, OnInit, computed, inject, signal } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { AgMaterialModule } from '../../core/material.module'
import { ToastService } from '../../core/toast.service'
import { ConfirmService } from '../../core/confirm.service'
import { AgStateBannerComponent } from '../../components/ag-state-banner.component'
import { AgModalComponent } from '../../components/ag-modal.component'
import {
  databaseApi,
  DatabaseItem,
  DatabaseEngineItem,
  BackupRecord,
  CreateDatabaseParams,
} from '@/api/database'
import { downloadWithTicket } from '@/utils/download'

@Component({
  selector: 'ag-databases',
  standalone: true,
  imports: [AgMaterialModule, AgStateBannerComponent, AgModalComponent],
  template: `
    <div class="m3-page">
      <div class="m3-page-header">
        <div>
          <h2 class="m3-page-title">
            <mat-icon style="color: var(--ag-primary)">database</mat-icon>
            <span>数据库实例、Web SQL 控制台与 Gzip 备份</span>
          </h2>
          <p class="m3-page-subtitle font-mono">
            管理 MySQL / MariaDB / PostgreSQL / SQLite / Redis 实例，支持单次授权票据流式下载备份
          </p>
        </div>
        <div class="m3-page-actions">
          <button mat-stroked-button (click)="loadAll()" [disabled]="loading()">
            <mat-icon>refresh</mat-icon>
            <span>刷新</span>
          </button>
          <button mat-flat-button color="primary" (click)="openCreateModal()">
            <mat-icon>add</mat-icon>
            <span>创建数据库</span>
          </button>
        </div>
      </div>

      <!-- Engines Strip -->
      <div class="m3-grid-4">
        <div *ngFor="let eng of engines()" class="m3-tonal-card font-mono">
          <div style="display: flex; justify-content: space-between; align-items: center">
            <strong>{{ eng.name }}</strong>
            <span class="m3-badge" [ngClass]="eng.is_available ? 'success' : 'neutral'">
              {{ eng.is_available ? '已就绪' : '未安装' }}
            </span>
          </div>
          <div style="font-size: 0.72rem; color: var(--ag-on-surface-variant); margin-top: 6px">
            {{ eng.description }}
          </div>
        </div>
      </div>

      <!-- Filter Bar (FE-011) -->
      <div class="m3-filter-bar font-mono">
        <div class="search-box">
          <mat-icon>search</mat-icon>
          <input
            type="search"
            [ngModel]="searchQuery()"
            (ngModelChange)="onSearchChange($event)"
            placeholder="搜索数据库名称或用户名..."
            aria-label="搜索数据库实例"
          />
        </div>
        <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px">
          <label for="db-engine-filter" style="font-size: 0.75rem; color: var(--ag-on-surface-variant)">引擎类型:</label>
          <select
            id="db-engine-filter"
            [ngModel]="typeFilter()"
            (ngModelChange)="onTypeChange($event)"
            aria-label="按引擎类型过滤"
            style="padding: 6px 10px; border-radius: 999px; border: 1px solid var(--ag-outline-variant); background: var(--ag-surface-lowest); color: var(--ag-on-surface); font-size: 0.76rem"
          >
            <option value="all">全部引擎</option>
            <option value="sqlite">SQLite</option>
            <option value="mysql">MySQL / MariaDB</option>
            <option value="postgresql">PostgreSQL</option>
          </select>
        </div>
      </div>

      <!-- State Banners (FE-001) -->
      <ag-state-banner
        *ngIf="loading() && databases().length === 0"
        state="loading"
        title="正在加载数据库实例与引擎状态..."
      />

      <ag-state-banner
        *ngIf="loadError()"
        state="error"
        title="数据库列表加载失败"
        [description]="loadError()!"
        primaryActionLabel="重试刷新"
        (primaryAction)="loadAll()"
      />

      <!-- Table Card -->
      <div class="m3-card" *ngIf="!loadError()">
        <div class="m3-table-wrap font-mono">
          <table class="m3-data-table" aria-label="数据库实例列表">
            <thead>
              <tr>
                <th>数据库名称 ({{ filteredDatabases().length }}/{{ databases().length }})</th>
                <th>引擎类型</th>
                <th>用户名</th>
                <th>字符集</th>
                <th>数据体积</th>
                <th>备份数</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let db of filteredDatabases()">
                <td><strong>{{ db.db_name }}</strong></td>
                <td><span class="m3-badge primary">{{ db.type.toUpperCase() }}</span></td>
                <td>{{ db.username || '-' }}</td>
                <td>{{ db.character_set }}</td>
                <td>{{ formatBytes(db.size_bytes) }}</td>
                <td>{{ db.backup_count }} 份</td>
                <td>
                  <button mat-button color="primary" (click)="openQueryModal(db)">SQL 查询</button>
                  <button mat-button color="primary" (click)="openBackupModal(db)">备份管理</button>
                  <button mat-button (click)="instantBackup(db)">一键备份</button>
                  <button mat-button color="warn" (click)="deleteDb(db)">删除</button>
                </td>
              </tr>
              <tr *ngIf="filteredDatabases().length === 0 && !loading()">
                <td colspan="7" class="m3-empty-state">
                  {{ searchQuery() ? '未检索到匹配的数据库实例。' : '暂无数据库实例，点击右上角「创建数据库」添加。' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Create DB Modal (FE-002, FE-004) -->
      <ag-modal
        [open]="showCreateModal()"
        title="新建数据库实例"
        icon="database"
        [submitting]="submitting()"
        (closed)="showCreateModal.set(false)"
      >
        <div class="font-mono" style="display: flex; flex-direction: column; gap: 14px">
          <div class="m3-grid-2">
            <div class="m3-field">
              <label for="create-db-engine">数据库引擎 <span class="m3-req">*</span></label>
              <select id="create-db-engine" [(ngModel)]="createForm.type">
                <option value="sqlite">SQLite 3 (零配置嵌入式)</option>
                <option value="mysql">MySQL / MariaDB</option>
                <option value="postgresql">PostgreSQL</option>
              </select>
            </div>
            <div class="m3-field" [class.has-error]="!!dbNameError()">
              <label for="create-db-name">数据库名称 <span class="m3-req">*</span></label>
              <input
                id="create-db-name"
                type="text"
                [(ngModel)]="createForm.db_name"
                (ngModelChange)="dbNameError.set('')"
                placeholder="app_prod"
              />
              <div *ngIf="dbNameError()" class="m3-field-error" role="alert">{{ dbNameError() }}</div>
            </div>
            <div class="m3-field" *ngIf="createForm.type !== 'sqlite'">
              <label for="create-db-user">授权用户名</label>
              <input id="create-db-user" type="text" [(ngModel)]="createForm.username" placeholder="app_user" />
            </div>
            <div class="m3-field" *ngIf="createForm.type !== 'sqlite'">
              <label for="create-db-pass">访问密码</label>
              <input id="create-db-pass" type="password" [(ngModel)]="createForm.password" placeholder="输入访问密码" />
            </div>
          </div>
        </div>
        <div modal-footer>
          <button mat-stroked-button (click)="showCreateModal.set(false)" [disabled]="submitting()">取消</button>
          <button mat-flat-button color="primary" [disabled]="submitting()" (click)="handleCreateDb()">
            {{ submitting() ? '创建中...' : '确认创建' }}
          </button>
        </div>
      </ag-modal>

      <!-- SQL Query Modal (FE-002) -->
      <ag-modal
        [open]="!!activeQueryDb()"
        [title]="'Web SQL 查询器: ' + (activeQueryDb()?.db_name || '')"
        icon="terminal"
        size="lg"
        [submitting]="submitting()"
        (closed)="activeQueryDb.set(null)"
      >
        <div class="font-mono" style="display: flex; flex-direction: column; gap: 12px">
          <div class="m3-field">
            <label for="sql-query-input">输入 SQL 语句 (只读/安全受控环境):</label>
            <textarea id="sql-query-input" rows="4" [(ngModel)]="sqlText" style="line-height: 1.4"></textarea>
          </div>
          <div>
            <button mat-flat-button color="primary" [disabled]="submitting() || !sqlText.trim()" (click)="runSql()">
              {{ submitting() ? '正在执行...' : '执行 SQL' }}
            </button>
          </div>
          <pre *ngIf="sqlResult()" class="m3-code-console" style="max-height: 260px; overflow: auto">{{ sqlResult() | json }}</pre>
        </div>
        <div modal-footer>
          <button mat-stroked-button (click)="activeQueryDb.set(null)">关闭</button>
        </div>
      </ag-modal>

      <!-- Backups Modal (FE-002, FE-009) -->
      <ag-modal
        [open]="!!activeBackupDb()"
        [title]="'数据库备份归档: ' + (activeBackupDb()?.db_name || '')"
        icon="inventory"
        size="lg"
        (closed)="activeBackupDb.set(null)"
      >
        <div class="font-mono" style="display: flex; flex-direction: column; gap: 10px">
          <div *ngFor="let b of backups()" class="m3-tonal-card" style="display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px">
            <div>
              <strong>{{ b.file_name }}</strong>
              <div style="font-size: 0.72rem; color: var(--ag-on-surface-variant)">
                {{ b.created_at }} | {{ formatBytes(b.file_size_bytes) }}
              </div>
            </div>
            <div style="display: flex; gap: 8px">
              <button mat-stroked-button (click)="downloadBackup(b)">安全下载</button>
              <button mat-stroked-button color="warn" (click)="confirmDeleteBackup(b)">删除</button>
            </div>
          </div>
          <div *ngIf="backups().length === 0" class="m3-empty-state">暂无备份归档记录。</div>
        </div>
        <div modal-footer>
          <button mat-stroked-button (click)="activeBackupDb.set(null)">关闭</button>
        </div>
      </ag-modal>
    </div>
  `,
})
export class DatabasesComponent implements OnInit {
  private toast = inject(ToastService)
  private confirmSvc = inject(ConfirmService)
  private route = inject(ActivatedRoute)
  private router = inject(Router)

  readonly databases = signal<DatabaseItem[]>([])
  readonly engines = signal<DatabaseEngineItem[]>([])
  readonly backups = signal<BackupRecord[]>([])
  readonly loading = signal(false)
  readonly loadError = signal<string | null>(null)
  readonly submitting = signal(false)

  readonly searchQuery = signal('')
  readonly typeFilter = signal('all')
  readonly dbNameError = signal('')

  readonly showCreateModal = signal(false)
  readonly activeQueryDb = signal<DatabaseItem | null>(null)
  readonly activeBackupDb = signal<DatabaseItem | null>(null)
  readonly sqlResult = signal<any>(null)

  sqlText = 'SELECT sqlite_version();'
  createForm: CreateDatabaseParams = {
    type: 'sqlite',
    db_name: '',
    username: '',
    password: '',
    character_set: 'utf8mb4',
  }

  readonly filteredDatabases = computed(() => {
    const q = this.searchQuery().trim().toLowerCase()
    const t = this.typeFilter()
    return this.databases().filter((db) => {
      if (t !== 'all' && db.type !== t) return false
      if (q) {
        const text = `${db.db_name} ${db.username || ''}`.toLowerCase()
        if (!text.includes(q)) return false
      }
      return true
    })
  })

  ngOnInit() {
    const qp = this.route.snapshot.queryParamMap
    if (qp.get('q')) this.searchQuery.set(qp.get('q')!)
    if (qp.get('type')) this.typeFilter.set(qp.get('type')!)
    this.loadAll()
  }

  onSearchChange(q: string) {
    this.searchQuery.set(q)
    this.syncUrlParams()
  }

  onTypeChange(t: string) {
    this.typeFilter.set(t)
    this.syncUrlParams()
  }

  private syncUrlParams() {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: this.searchQuery().trim() || null,
        type: this.typeFilter() !== 'all' ? this.typeFilter() : null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    })
  }

  async loadAll() {
    this.loading.set(true)
    this.loadError.set(null)
    try {
      const [dbRes, engRes] = await Promise.all([
        databaseApi.getDatabases(),
        databaseApi.getAvailableEngines(),
      ])
      this.databases.set(dbRes.data?.data?.list || [])
      this.engines.set(engRes.data?.data?.list || [])
    } catch (e: any) {
      const msg = e.message || '加载数据库列表失败'
      this.loadError.set(msg)
      this.toast.error(msg)
    } finally {
      this.loading.set(false)
    }
  }

  openCreateModal() {
    this.createForm = {
      type: 'sqlite',
      db_name: '',
      username: '',
      password: '',
      character_set: 'utf8mb4',
    }
    this.dbNameError.set('')
    this.showCreateModal.set(true)
  }

  async handleCreateDb() {
    const name = this.createForm.db_name.trim()
    if (!name) {
      this.dbNameError.set('请输入数据库名称')
      return
    }
    this.submitting.set(true)
    try {
      await databaseApi.createDatabase(this.createForm)
      this.toast.success(`数据库 ${name} 创建成功`)
      this.showCreateModal.set(false)
      this.loadAll()
    } catch (e: any) {
      this.toast.error(e.message)
    } finally {
      this.submitting.set(false)
    }
  }

  openQueryModal(db: DatabaseItem) {
    this.activeQueryDb.set(db)
    this.sqlResult.set(null)
    this.sqlText = db.type === 'sqlite' ? 'SELECT sqlite_version();' : 'SELECT VERSION();'
  }

  async runSql() {
    const db = this.activeQueryDb()
    if (!db || !this.sqlText.trim()) return
    this.submitting.set(true)
    try {
      const res = await databaseApi.executeQuery(db.id, this.sqlText)
      this.sqlResult.set(res.data?.data)
    } catch (e: any) {
      this.toast.error(e.message)
    } finally {
      this.submitting.set(false)
    }
  }

  async instantBackup(db: DatabaseItem) {
    try {
      const res = await databaseApi.backupDatabase(db.id)
      this.toast.success(`备份完成: ${res.data?.data?.file_name}`)
      this.loadAll()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async openBackupModal(db: DatabaseItem) {
    this.activeBackupDb.set(db)
    try {
      const res = await databaseApi.getBackups(db.id)
      this.backups.set(res.data?.data?.list || [])
    } catch {}
  }

  async downloadBackup(b: BackupRecord) {
    try {
      await downloadWithTicket(databaseApi.downloadBackupPath(b.file_name), b.file_name)
      this.toast.success(`开始下载备份: ${b.file_name}`)
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async confirmDeleteBackup(b: BackupRecord) {
    const res = await this.confirmSvc.ask({
      title: '删除备份确认',
      resourceName: b.file_name,
      message: `确定要删除备份归档 ${b.file_name} 吗？`,
      impact: '该备份文件将从磁盘永久删除。',
      confirmText: '确认删除',
      severity: 'danger',
    })
    if (!res.confirmed) return

    try {
      await databaseApi.deleteBackup(b.file_name)
      this.toast.success('备份文件已删除')
      if (this.activeBackupDb()) this.openBackupModal(this.activeBackupDb()!)
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async deleteDb(db: DatabaseItem) {
    const res = await this.confirmSvc.ask({
      title: '删除数据库确认',
      resourceName: `${db.db_name} (${db.type.toUpperCase()})`,
      message: `确定要永久删除数据库 “${db.db_name}” 吗？`,
      impact: '该数据库内所有表及数据将被永久删除，不可恢复。',
      confirmText: '确认删除数据库',
      severity: 'danger',
    })
    if (!res.confirmed) return

    try {
      await databaseApi.deleteDatabase(db.id)
      this.toast.success(`数据库 ${db.db_name} 已删除`)
      this.loadAll()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  formatBytes(bytes: number) {
    if (!bytes) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
  }
}
