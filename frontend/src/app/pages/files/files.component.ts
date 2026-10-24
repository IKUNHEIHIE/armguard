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
            在线编辑代码配置、chmod 权限管控、tar.gz/zip 归档解压与单次票据安全流式下载
          </p>
        </div>
        <div class="m3-page-actions">
          <button mat-stroked-button (click)="promptCreate(true)">
            <mat-icon>create_new_folder</mat-icon>
            <span>新建目录</span>
          </button>
          <button mat-stroked-button (click)="promptCreate(false)">
            <mat-icon>note_add</mat-icon>
            <span>新建文件</span>
          </button>
          <label class="upload-btn">
            <input type="file" hidden (change)="onFileSelected($event)" />
            <span mat-flat-button color="primary" class="mat-mdc-unelevated-button mat-primary">
              <mat-icon>upload</mat-icon>
              <span>上传文件</span>
            </span>
          </label>
        </div>
      </div>

      <!-- Path Bar -->
      <div class="m3-card path-bar font-mono">
        <button mat-icon-button (click)="navigateUp()" matTooltip="返回上级目录">
          <mat-icon>arrow_upward</mat-icon>
        </button>
        <input
          type="text"
          [(ngModel)]="pathInput"
          (keyup.enter)="loadPath(pathInput)"
          class="path-input"
        />
        <button mat-flat-button color="primary" (click)="loadPath(pathInput)">跳转</button>
      </div>

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
                  <button mat-button (click)="promptChmod(item)">权限</button>
                  <button mat-button (click)="promptRename(item)">重命名</button>
                  <button mat-button color="warn" (click)="deleteItem(item)">删除</button>
                </td>
              </tr>
              <tr *ngIf="files().length === 0">
                <td colspan="6" class="m3-empty-state">当前目录为空。</td>
              </tr>
            </tbody>
          </table>
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
            <button mat-icon-button (click)="editingFile.set(null)">
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
        padding: 12px 16px !important;
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
  readonly currentPath = signal('/')
  readonly parentPath = signal('/')
  readonly files = signal<FileItem[]>([])
  readonly editingFile = signal<FileItem | null>(null)

  pathInput = '/'
  editorContent = ''

  ngOnInit() {
    this.loadPath('/')
  }

  async loadPath(targetPath: string) {
    try {
      const res = await fileApi.getList(targetPath)
      const d = res.data?.data
      if (d) {
        this.currentPath.set(d.current_path)
        this.parentPath.set(d.parent_path)
        this.pathInput = d.current_path
        this.files.set(d.files || [])
      }
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  navigateUp() {
    this.loadPath(this.parentPath() || '/')
  }

  onItemClick(item: FileItem) {
    if (item.is_dir) {
      this.loadPath(item.path)
    } else {
      this.openEditor(item)
    }
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

  async promptCreate(isDir: boolean) {
    const name = prompt(isDir ? '请输入新目录名称:' : '请输入新文件名称:')
    if (!name) return
    const sep = this.currentPath().endsWith('/') ? '' : '/'
    try {
      await fileApi.createFile(`${this.currentPath()}${sep}${name}`, isDir)
      this.toast.success(isDir ? '目录已创建' : '文件已创建')
      this.loadPath(this.currentPath())
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async promptRename(item: FileItem) {
    const newName = prompt('请输入新名称:', item.name)
    if (!newName || newName === item.name) return
    const dir = item.path.substring(0, item.path.lastIndexOf('/') + 1)
    try {
      await fileApi.renameFile(item.path, `${dir}${newName}`)
      this.toast.success('重命名成功')
      this.loadPath(this.currentPath())
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async promptChmod(item: FileItem) {
    const mode = prompt('请输入八进制权限 (例如 755 或 644):', '644')
    if (!mode) return
    try {
      await fileApi.changePermission(item.path, mode)
      this.toast.success('权限已更新')
      this.loadPath(this.currentPath())
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    try {
      await fileApi.uploadFile(this.currentPath(), file)
      this.toast.success(`上传完成: ${file.name}`)
      this.loadPath(this.currentPath())
    } catch (e: any) {
      this.toast.error(e.message)
    } finally {
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

  async deleteItem(item: FileItem) {
    if (!confirm(`确定要删除 ${item.name} 吗？`)) return
    try {
      await fileApi.deleteFiles([item.path])
      this.toast.success('已删除')
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
