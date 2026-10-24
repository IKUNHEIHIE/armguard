import { Component, OnInit, inject, signal } from '@angular/core'
import { AgMaterialModule } from '../../core/material.module'
import { ToastService } from '../../core/toast.service'
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
  imports: [AgMaterialModule],
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
          <button mat-stroked-button (click)="loadAll()">
            <mat-icon>refresh</mat-icon>
            <span>刷新</span>
          </button>
          <button mat-flat-button color="primary" (click)="showCreateModal.set(true)">
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

      <div class="m3-card">
        <div class="m3-table-wrap font-mono">
          <table class="m3-data-table">
            <thead>
              <tr>
                <th>数据库名称</th>
                <th>引擎类型</th>
                <th>用户名</th>
                <th>字符集</th>
                <th>数据体积</th>
                <th>备份数</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let db of databases()">
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
              <tr *ngIf="databases().length === 0">
                <td colspan="7" class="m3-empty-state">暂无数据库实例，点击右上角「创建数据库」添加。</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Create DB Modal -->
      <div *ngIf="showCreateModal()" class="m3-modal-backdrop" (click)="showCreateModal.set(false)">
        <div class="m3-modal-dialog" (click)="$event.stopPropagation()">
          <div class="m3-modal-header">
            <h3>新建数据库实例</h3>
            <button mat-icon-button (click)="showCreateModal.set(false)">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <div class="m3-modal-body font-mono">
            <div class="m3-grid-2">
              <div class="m3-field">
                <label>数据库引擎</label>
                <select [(ngModel)]="createForm.type">
                  <option value="sqlite">SQLite 3 (零配置嵌入式)</option>
                  <option value="mysql">MySQL / MariaDB</option>
                  <option value="postgresql">PostgreSQL</option>
                </select>
              </div>
              <div class="m3-field">
                <label>数据库名称</label>
                <input type="text" [(ngModel)]="createForm.db_name" placeholder="app_prod" />
              </div>
              <div class="m3-field" *ngIf="createForm.type !== 'sqlite'">
                <label>授权用户名</label>
                <input type="text" [(ngModel)]="createForm.username" placeholder="app_user" />
              </div>
              <div class="m3-field" *ngIf="createForm.type !== 'sqlite'">
                <label>访问密码</label>
                <input type="password" [(ngModel)]="createForm.password" placeholder="输入强密码" />
              </div>
            </div>
          </div>
          <div class="m3-modal-footer">
            <button mat-stroked-button (click)="showCreateModal.set(false)">取消</button>
            <button mat-flat-button color="primary" (click)="handleCreateDb()">确认创建</button>
          </div>
        </div>
      </div>

      <!-- SQL Query Modal -->
      <div *ngIf="activeQueryDb()" class="m3-modal-backdrop" (click)="activeQueryDb.set(null)">
        <div class="m3-modal-dialog lg" (click)="$event.stopPropagation()">
          <div class="m3-modal-header">
            <h3>Web SQL 查询器: {{ activeQueryDb()!.db_name }}</h3>
            <button mat-icon-button (click)="activeQueryDb.set(null)">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <div class="m3-modal-body font-mono">
            <div class="m3-field">
              <label>输入 SQL 语句</label>
              <textarea rows="4" [(ngModel)]="sqlText"></textarea>
            </div>
            <div>
              <button mat-flat-button color="primary" (click)="runSql()">执行 SQL</button>
            </div>
            <pre *ngIf="sqlResult()" class="m3-code-console">{{ sqlResult() | json }}</pre>
          </div>
        </div>
      </div>

      <!-- Backups Modal -->
      <div *ngIf="activeBackupDb()" class="m3-modal-backdrop" (click)="activeBackupDb.set(null)">
        <div class="m3-modal-dialog lg" (click)="$event.stopPropagation()">
          <div class="m3-modal-header">
            <h3>数据库备份归档: {{ activeBackupDb()!.db_name }}</h3>
            <button mat-icon-button (click)="activeBackupDb.set(null)">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <div class="m3-modal-body font-mono">
            <div *ngFor="let b of backups()" class="m3-tonal-card" style="display: flex; justify-content: space-between; align-items: center">
              <div>
                <strong>{{ b.file_name }}</strong>
                <div style="font-size: 0.72rem; color: var(--ag-on-surface-variant)">
                  {{ b.created_at }} | {{ formatBytes(b.file_size_bytes) }}
                </div>
              </div>
              <div style="display: flex; gap: 8px">
                <button mat-stroked-button (click)="downloadBackup(b)">安全下载</button>
                <button mat-stroked-button color="warn" (click)="deleteBackup(b)">删除</button>
              </div>
            </div>
            <div *ngIf="backups().length === 0" class="m3-empty-state">暂无备份归档记录。</div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class DatabasesComponent implements OnInit {
  private toast = inject(ToastService)
  readonly databases = signal<DatabaseItem[]>([])
  readonly engines = signal<DatabaseEngineItem[]>([])
  readonly backups = signal<BackupRecord[]>([])
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

  ngOnInit() {
    this.loadAll()
  }

  async loadAll() {
    try {
      const [dbRes, engRes] = await Promise.all([
        databaseApi.getDatabases(),
        databaseApi.getAvailableEngines(),
      ])
      this.databases.set(dbRes.data?.data?.list || [])
      this.engines.set(engRes.data?.data?.list || [])
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async handleCreateDb() {
    try {
      await databaseApi.createDatabase(this.createForm)
      this.toast.success(`数据库 ${this.createForm.db_name} 创建成功`)
      this.showCreateModal.set(false)
      this.loadAll()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  openQueryModal(db: DatabaseItem) {
    this.activeQueryDb.set(db)
    this.sqlResult.set(null)
  }

  async runSql() {
    const db = this.activeQueryDb()
    if (!db) return
    try {
      const res = await databaseApi.executeQuery(db.id, this.sqlText)
      this.sqlResult.set(res.data?.data)
    } catch (e: any) {
      this.toast.error(e.message)
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

  async deleteBackup(b: BackupRecord) {
    try {
      await databaseApi.deleteBackup(b.file_name)
      this.toast.success('备份文件已删除')
      if (this.activeBackupDb()) this.openBackupModal(this.activeBackupDb()!)
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async deleteDb(db: DatabaseItem) {
    if (!confirm(`确定要删除数据库 ${db.db_name} 吗？`)) return
    try {
      await databaseApi.deleteDatabase(db.id)
      this.toast.success('数据库已删除')
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
