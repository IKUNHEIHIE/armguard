import { Component, OnInit, inject, signal } from '@angular/core'
import { AgMaterialModule } from '../../core/material.module'
import { ToastService } from '../../core/toast.service'
import { fileApi, FileItem } from '@/api/file'
import { downloadWithTicket } from '@/utils/download'

@Component({
  selector: 'ag-files',
  standalone: true,
  imports: [AgMaterialModule],
  template: `
    <div class="m3-page">
      <div class="m3-page-header">
        <div>
          <h2 class="m3-page-title">
            <mat-icon style="color: var(--ag-primary)">folder_open</mat-icon>
            <span>Web 文件资源管理器 (File Explorer)</span>
          </h2>
          <p class="m3-page-subtitle font-mono">
            在线编辑代码配置、chmod 权限管控、tar.gz/zip 安全归档解压与单次票据流式下载
          </p>
        </div>
        <div class="m3-page-actions">
          <button mat-stroked-button (click)="openCreateModal(true)">
            <mat-icon>create_new_folder</mat-icon>
            <span>新建目录</span>
          </button>
          <button mat-stroked-button (click)="openCreateModal(false)">
            <mat-icon>note_add</mat-icon>
            <span>新建文件</span>
          </button>
          <label class="upload-btn" aria-label="上传文件到当前目录">
            <input type="file" hidden (change)="onFileSelected($event)" />
            <span mat-flat-button color="primary" class="mat-mdc-unelevated-button mat-primary">
              <mat-icon>upload</mat-icon>
              <span>{{ uploading() ? '上传中 ' + uploadPercent() + '%' : '上传文件' }}</span>
            </span>
          </label>
        </div>
      </div>

      <!-- Path Bar & Sandbox Root Shortcuts -->
      <div class="m3-card font-mono" style="display: flex; flex-direction: column; gap: 10px; padding: 12px 16px !important">
        <div class="path-bar">
          <button
            mat-icon-button
            (click)="navigateUp()"
            [disabled]="currentPath() === parentPath()"
            matTooltip="返回上级可访问目录"
            aria-label="返回上级目录"
          >
            <mat-icon>arrow_upward</mat-icon>
          </button>
          <input
            type="text"
            [(ngModel)]="pathInput"
            (keyup.enter)="loadPath(pathInput)"
            placeholder="/www/wwwroot"
            aria-label="当前目录路径"
            class="path-input"
          />
          <button mat-flat-button color="primary" (click)="loadPath(pathInput)">跳转</button>
          <button mat-stroked-button (click)="loadPath(currentPath())" aria-label="刷新当前目录">
            <mat-icon>refresh</mat-icon>
            <span>刷新</span>
          </button>
        </div>

        <div *ngIf="allowedRoots().length > 0" style="display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 0.74rem">
          <span style="color: var(--ag-on-surface-variant)">受控沙箱目录:</span>
          <button
            *ngFor="let root of allowedRoots()"
            mat-stroked-button
            style="height: 26px; font-size: 0.72rem; padding: 0 10px"
            [style.background]="currentPath().startsWith(root) ? 'var(--ag-primary-container)' : ''"
            [style.color]="currentPath().startsWith(root) ? 'var(--ag-on-primary-container)' : ''"
            (click)="loadPath(root)"
          >
            {{ root }}
          </button>
        </div>

        <mat-progress-bar *ngIf="uploading()" mode="determinate" [value]="uploadPercent()"></mat-progress-bar>
      </div>

      <!-- Persistent Error State Banner (REV-012) -->
      <div
        *ngIf="loadError()"
        class="m3-card font-mono"
        style="border-color: var(--ag-danger); background: var(--ag-danger-container); display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px"
      >
        <div style="display: flex; align-items: center; gap: 10px; color: var(--ag-danger)">
          <mat-icon>gpp_maybe</mat-icon>
          <div>
            <strong>目录访问受限或加载失败</strong>
            <div style="font-size: 0.78rem">{{ loadError() }}</div>
          </div>
        </div>
        <button mat-flat-button color="primary" (click)="loadPath()">
          返回默认工作目录 ({{ defaultPath() }})
        </button>
      </div>

      <!-- File Table -->
      <div class="m3-card">
        <div class="m3-table-wrap font-mono">
          <table class="m3-data-table">
            <thead>
              <tr>
                <th>名称</th>
                <th>权限 (Mode)</th>
                <th>所有者</th>
                <th>大小</th>
                <th>修改时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngIf="loading()">
                <td colspan="6" class="m3-empty-state">正在读取目录内容...</td>
              </tr>
              <ng-container *ngIf="!loading() && !loadError()">
                <tr *ngFor="let item of files()">
                  <td>
                    <div
                      style="display: flex; align-items: center; gap: 8px; cursor: pointer"
                      (click)="onItemClick(item)"
                    >
                      <mat-icon [style.color]="item.is_dir ? 'var(--ag-primary)' : 'var(--ag-on-surface-variant)'">
                        {{ item.is_dir ? 'folder' : 'description' }}
                      </mat-icon>
                      <strong>{{ item.name }}</strong>
                    </div>
                  </td>
                  <td><span class="m3-badge neutral">{{ item.mode }}</span></td>
                  <td>{{ item.owner }}:{{ item.group }}</td>
                  <td>{{ item.is_dir ? '-' : formatBytes(item.size) }}</td>
                  <td>{{ item.mod_time }}</td>
                  <td>
                    <button *ngIf="!item.is_dir" mat-button color="primary" (click)="openEditor(item)">编辑</button>
                    <button *ngIf="!item.is_dir" mat-button (click)="downloadFile(item)">下载</button>
                    <button mat-button (click)="openCompressModal(item)">压缩</button>
                    <button *ngIf="isArchive(item)" mat-button color="primary" (click)="decompressItem(item)">解压</button>
                    <button mat-button (click)="openChmodModal(item)">权限</button>
                    <button mat-button (click)="openRenameModal(item)">重命名</button>
                    <button mat-button color="warn" (click)="openDeleteModal(item)">删除</button>
                  </td>
                </tr>
                <tr *ngIf="files().length === 0">
                  <td colspan="6" class="m3-empty-state">
                    当前目录 ({{ currentPath() }}) 为空，可通过上方按钮新建或上传文件。
                  </td>
                </tr>
              </ng-container>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Create File / Directory Modal (REV-006) -->
      <div *ngIf="createModalOpen()" class="m3-modal-backdrop" (click)="createModalOpen.set(false)">
        <div class="m3-modal-dialog" (click)="$event.stopPropagation()">
          <div class="m3-modal-header">
            <h3>
              <mat-icon style="color: var(--ag-primary)">{{ createIsDir() ? 'create_new_folder' : 'note_add' }}</mat-icon>
              <span>{{ createIsDir() ? '新建子目录' : '新建空文件' }}</span>
            </h3>
            <button mat-icon-button (click)="createModalOpen.set(false)" aria-label="关闭弹窗">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <div class="m3-modal-body font-mono">
            <div class="m3-field">
              <label>所在目录</label>
              <input type="text" [value]="currentPath()" readonly />
            </div>
            <div class="m3-field">
              <label>{{ createIsDir() ? '新目录名称' : '新文件名称' }}</label>
              <input
                type="text"
                [(ngModel)]="createName"
                (keyup.enter)="submitCreate(false)"
                placeholder="例如: config.json 或 assets"
              />
            </div>
            <div *ngIf="conflictPending()" class="m3-tonal-card" style="border-color: var(--ag-warning); color: var(--ag-warning)">
              ⚠️ 同名文件已存在！继续覆盖将清空原文件内容，是否确认强制覆盖？
            </div>
          </div>
          <div class="m3-modal-footer">
            <button mat-stroked-button (click)="createModalOpen.set(false)">取消</button>
            <button
              *ngIf="conflictPending()"
              mat-flat-button
              color="warn"
              (click)="submitCreate(true)"
            >
              确认覆盖原文件
            </button>
            <button
              *ngIf="!conflictPending()"
              mat-flat-button
              color="primary"
              (click)="submitCreate(false)"
            >
              确认创建
            </button>
          </div>
        </div>
      </div>

      <!-- Rename Modal (REV-006) -->
      <div *ngIf="renamingItem()" class="m3-modal-backdrop" (click)="renamingItem.set(null)">
        <div class="m3-modal-dialog" (click)="$event.stopPropagation()">
          <div class="m3-modal-header">
            <h3>
              <mat-icon style="color: var(--ag-primary)">drive_file_rename_outline</mat-icon>
              <span>重命名: {{ renamingItem()!.name }}</span>
            </h3>
            <button mat-icon-button (click)="renamingItem.set(null)" aria-label="关闭弹窗">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <div class="m3-modal-body font-mono">
            <div class="m3-field">
              <label>新名称</label>
              <input type="text" [(ngModel)]="renameInput" (keyup.enter)="submitRename(false)" />
            </div>
            <div *ngIf="conflictPending()" class="m3-tonal-card" style="border-color: var(--ag-warning); color: var(--ag-warning)">
              ⚠️ 目标名称已存在！强制覆盖会替换已有文件，是否确认覆盖？
            </div>
          </div>
          <div class="m3-modal-footer">
            <button mat-stroked-button (click)="renamingItem.set(null)">取消</button>
            <button *ngIf="conflictPending()" mat-flat-button color="warn" (click)="submitRename(true)">
              确认覆盖目标
            </button>
            <button *ngIf="!conflictPending()" mat-flat-button color="primary" (click)="submitRename(false)">
              确认重命名
            </button>
          </div>
        </div>
      </div>

      <!-- Chmod Modal -->
      <div *ngIf="chmodItem()" class="m3-modal-backdrop" (click)="chmodItem.set(null)">
        <div class="m3-modal-dialog" (click)="$event.stopPropagation()">
          <div class="m3-modal-header">
            <h3>
              <mat-icon style="color: var(--ag-primary)">lock_person</mat-icon>
              <span>修改权限: {{ chmodItem()!.name }}</span>
            </h3>
            <button mat-icon-button (click)="chmodItem.set(null)" aria-label="关闭弹窗">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <div class="m3-modal-body font-mono">
            <div class="m3-field">
              <label>八进制权限模式 (例如 0755 或 0644)</label>
              <input type="text" [(ngModel)]="chmodInput" (keyup.enter)="submitChmod()" />
            </div>
          </div>
          <div class="m3-modal-footer">
            <button mat-stroked-button (click)="chmodItem.set(null)">取消</button>
            <button mat-flat-button color="primary" (click)="submitChmod()">保存权限</button>
          </div>
        </div>
      </div>

      <!-- Compress Modal (REV-001 & REV-011) -->
      <div *ngIf="compressingItem()" class="m3-modal-backdrop" (click)="compressingItem.set(null)">
        <div class="m3-modal-dialog" (click)="$event.stopPropagation()">
          <div class="m3-modal-header">
            <h3>
              <mat-icon style="color: var(--ag-primary)">folder_zip</mat-icon>
              <span>创建归档压缩包: {{ compressingItem()!.name }}</span>
            </h3>
            <button mat-icon-button (click)="compressingItem.set(null)" aria-label="关闭弹窗">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <div class="m3-modal-body font-mono">
            <div class="m3-field">
              <label>归档格式</label>
              <select [(ngModel)]="compressFormat" (change)="onCompressFormatChange()">
                <option value="tar.gz">tar.gz (Linux Gzip 归档)</option>
                <option value="zip">zip (通用压缩格式)</option>
              </select>
            </div>
            <div class="m3-field">
              <label>输出归档文件名</label>
              <input type="text" [(ngModel)]="compressTargetName" />
            </div>
            <div class="m3-hint">
              安全策略：归档前将递归扫描子项，自动拦截包含敏感凭证（如 .env、SSH 私钥）或越界符号链接的目录。
            </div>
          </div>
          <div class="m3-modal-footer">
            <button mat-stroked-button (click)="compressingItem.set(null)">取消</button>
            <button mat-flat-button color="primary" (click)="submitCompress()">开始压缩</button>
          </div>
        </div>
      </div>

      <!-- Delete Confirm Modal -->
      <div *ngIf="deletingItem()" class="m3-modal-backdrop" (click)="deletingItem.set(null)">
        <div class="m3-modal-dialog" (click)="$event.stopPropagation()">
          <div class="m3-modal-header">
            <h3>
              <mat-icon style="color: var(--ag-danger)">delete_forever</mat-icon>
              <span>确认删除</span>
            </h3>
            <button mat-icon-button (click)="deletingItem.set(null)" aria-label="关闭弹窗">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <div class="m3-modal-body font-mono">
            确定要永久删除 <strong>{{ deletingItem()!.name }}</strong> ({{ deletingItem()!.path }}) 吗？该操作不可撤销。
          </div>
          <div class="m3-modal-footer">
            <button mat-stroked-button (click)="deletingItem.set(null)">取消</button>
            <button mat-flat-button color="warn" (click)="confirmDelete()">确认删除</button>
          </div>
        </div>
      </div>

      <!-- Editor Modal -->
      <div *ngIf="editingFile()" class="m3-modal-backdrop" (click)="editingFile.set(null)">
        <div class="m3-modal-dialog xl" (click)="$event.stopPropagation()">
          <div class="m3-modal-header">
            <h3>
              <mat-icon style="color: var(--ag-primary)">edit_note</mat-icon>
              <span>编辑文件: {{ editingFile()!.path }}</span>
            </h3>
            <button mat-icon-button (click)="editingFile.set(null)" aria-label="关闭编辑器">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <div class="m3-modal-body font-mono">
            <div class="m3-field">
              <textarea rows="18" [(ngModel)]="editorContent"></textarea>
            </div>
          </div>
          <div class="m3-modal-footer">
            <button mat-stroked-button (click)="editingFile.set(null)">取消</button>
            <button mat-flat-button color="primary" (click)="saveEditor()">保存文件</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .path-bar {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .path-input {
        flex: 1;
        padding: 8px 14px;
        border-radius: 999px;
        border: 1px solid var(--ag-outline);
        background: var(--ag-surface-lowest);
        color: var(--ag-on-surface);
        font-size: 0.84rem;
      }
      .upload-btn {
        cursor: pointer;
      }
    `,
  ],
})
export class FilesComponent implements OnInit {
  private toast = inject(ToastService)
  readonly currentPath = signal('/www/wwwroot')
  readonly parentPath = signal('/www')
  readonly defaultPath = signal('/www/wwwroot')
  readonly allowedRoots = signal<string[]>([])
  readonly files = signal<FileItem[]>([])
  readonly loading = signal(false)
  readonly loadError = signal<string | null>(null)
  readonly editingFile = signal<FileItem | null>(null)

  readonly uploading = signal(false)
  readonly uploadPercent = signal(0)

  // Modal states
  readonly createModalOpen = signal(false)
  readonly createIsDir = signal(false)
  readonly conflictPending = signal(false)
  readonly renamingItem = signal<FileItem | null>(null)
  readonly chmodItem = signal<FileItem | null>(null)
  readonly compressingItem = signal<FileItem | null>(null)
  readonly deletingItem = signal<FileItem | null>(null)

  pathInput = ''
  editorContent = ''
  createName = ''
  renameInput = ''
  chmodInput = '0644'
  compressFormat: 'tar.gz' | 'zip' = 'tar.gz'
  compressTargetName = ''

  ngOnInit() {
    // Request without path argument so backend resolves its safe default directory (REV-012)
    this.loadPath()
  }

  async loadPath(targetPath?: string) {
    this.loading.set(true)
    this.loadError.set(null)
    try {
      const res = await fileApi.getList(targetPath)
      const d = res.data?.data
      if (d) {
        this.currentPath.set(d.current_path)
        this.parentPath.set(d.parent_path)
        if (d.default_path) this.defaultPath.set(d.default_path)
        if (d.allowed_roots) this.allowedRoots.set(d.allowed_roots)
        this.pathInput = d.current_path
        this.files.set(d.files || [])
      }
    } catch (e: any) {
      const msg = e.message || '无法加载目录'
      this.loadError.set(msg)
      this.toast.error(msg)
    } finally {
      this.loading.set(false)
    }
  }

  navigateUp() {
    const parent = this.parentPath()
    if (!parent || parent === this.currentPath()) {
      this.toast.info('已处于受控沙箱顶层目录')
      return
    }
    this.loadPath(parent)
  }

  onItemClick(item: FileItem) {
    if (item.is_dir) {
      this.loadPath(item.path)
    } else {
      this.openEditor(item)
    }
  }

  isArchive(item: FileItem): boolean {
    if (item.is_dir) return false
    const lower = item.name.toLowerCase()
    return lower.endsWith('.tar.gz') || lower.endsWith('.tgz') || lower.endsWith('.zip')
  }

  async openEditor(item: FileItem) {
    try {
      const res = await fileApi.getContent(item.path)
      this.editorContent = res.data?.data?.content ?? ''
      this.editingFile.set(item)
    } catch (e: any) {
      this.toast.error(`无法打开文本编辑器: ${e.message}`)
    }
  }

  async saveEditor() {
    const f = this.editingFile()
    if (!f) return
    try {
      await fileApi.saveContent(f.path, this.editorContent)
      this.toast.success(`文件 ${f.name} 保存成功`)
      this.editingFile.set(null)
      this.loadPath(this.currentPath())
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  openCreateModal(isDir: boolean) {
    this.createIsDir.set(isDir)
    this.createName = ''
    this.conflictPending.set(false)
    this.createModalOpen.set(true)
  }

  async submitCreate(overwrite: boolean) {
    const name = this.createName.trim()
    if (!name) {
      this.toast.warning('请输入名称')
      return
    }
    const sep = this.currentPath().endsWith('/') ? '' : '/'
    const fullPath = `${this.currentPath()}${sep}${name}`
    try {
      await fileApi.createFile(fullPath, this.createIsDir(), overwrite)
      this.toast.success(this.createIsDir() ? '目录已创建' : '文件已创建')
      this.createModalOpen.set(false)
      this.conflictPending.set(false)
      this.loadPath(this.currentPath())
    } catch (e: any) {
      if (e.response?.status === 409 && !this.createIsDir()) {
        this.conflictPending.set(true)
      }
      this.toast.error(e.message)
    }
  }

  openRenameModal(item: FileItem) {
    this.renamingItem.set(item)
    this.renameInput = item.name
    this.conflictPending.set(false)
  }

  async submitRename(overwrite: boolean) {
    const item = this.renamingItem()
    const newName = this.renameInput.trim()
    if (!item || !newName || newName === item.name) {
      this.renamingItem.set(null)
      return
    }
    const dir = item.path.substring(0, item.path.lastIndexOf('/') + 1)
    try {
      await fileApi.renameFile(item.path, `${dir}${newName}`, overwrite)
      this.toast.success('重命名成功')
      this.renamingItem.set(null)
      this.conflictPending.set(false)
      this.loadPath(this.currentPath())
    } catch (e: any) {
      if (e.response?.status === 409) {
        this.conflictPending.set(true)
      }
      this.toast.error(e.message)
    }
  }

  openChmodModal(item: FileItem) {
    this.chmodItem.set(item)
    this.chmodInput = item.mode || '0644'
  }

  async submitChmod() {
    const item = this.chmodItem()
    if (!item || !this.chmodInput.trim()) return
    try {
      await fileApi.changePermission(item.path, this.chmodInput.trim())
      this.toast.success('权限已更新')
      this.chmodItem.set(null)
      this.loadPath(this.currentPath())
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  openCompressModal(item: FileItem) {
    this.compressingItem.set(item)
    this.compressFormat = 'tar.gz'
    this.compressTargetName = `${item.name}.tar.gz`
  }

  onCompressFormatChange() {
    const item = this.compressingItem()
    if (!item) return
    this.compressTargetName = `${item.name}.${this.compressFormat}`
  }

  async submitCompress() {
    const item = this.compressingItem()
    const targetName = this.compressTargetName.trim()
    if (!item || !targetName) return
    try {
      await fileApi.compress([item.path], targetName, this.compressFormat)
      this.toast.success(`归档完成: ${targetName}`)
      this.compressingItem.set(null)
      this.loadPath(this.currentPath())
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async decompressItem(item: FileItem) {
    try {
      await fileApi.decompress(item.path, this.currentPath(), false)
      this.toast.success(`已解压: ${item.name}`)
      this.loadPath(this.currentPath())
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    this.uploading.set(true)
    this.uploadPercent.set(0)
    try {
      await fileApi.uploadFile(
        this.currentPath(),
        file,
        (pct) => this.uploadPercent.set(pct),
        false
      )
      this.toast.success(`上传完成: ${file.name}`)
      this.loadPath(this.currentPath())
    } catch (e: any) {
      this.toast.error(e.message)
    } finally {
      this.uploading.set(false)
      this.uploadPercent.set(0)
      input.value = ''
    }
  }

  async downloadFile(item: FileItem) {
    try {
      await downloadWithTicket(fileApi.downloadFilePath(item.path), item.name)
      this.toast.success(`开始下载: ${item.name}`)
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  openDeleteModal(item: FileItem) {
    this.deletingItem.set(item)
  }

  async confirmDelete() {
    const item = this.deletingItem()
    if (!item) return
    try {
      await fileApi.deleteFiles([item.path])
      this.toast.success(`已删除: ${item.name}`)
      this.deletingItem.set(null)
      this.loadPath(this.currentPath())
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
