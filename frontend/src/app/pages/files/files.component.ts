import { Component, OnInit, computed, inject, signal } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { AgMaterialModule } from '../../core/material.module'
import { ToastService } from '../../core/toast.service'
import { ConfirmService } from '../../core/confirm.service'
import { HasUnsavedChanges } from '../../core/unsaved-changes.guard'
import { AgStateBannerComponent } from '../../components/ag-state-banner.component'
import { AgModalComponent } from '../../components/ag-modal.component'
import { fileApi, FileItem } from '@/api/file'
import { downloadWithTicket } from '@/utils/download'
import { copyToClipboard } from '@/utils/clipboard'

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'tiff',
  'zip', 'gz', 'tgz', 'tar', 'bz2', 'xz', '7z', 'rar',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'mp3', 'mp4', 'mkv', 'avi', 'mov', 'wav', 'flac',
  'so', 'dll', 'exe', 'bin', 'iso', 'img', 'deb', 'rpm',
  'woff', 'woff2', 'ttf', 'eot', 'sqlite', 'db'
])
const MAX_SAFE_EDIT_BYTES = 1024 * 1024 // 1 MB

@Component({
  selector: 'ag-files',
  standalone: true,
  imports: [AgMaterialModule, AgStateBannerComponent, AgModalComponent],
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

      <!-- Path Breadcrumbs & Sandbox Root Shortcuts (FE-010) -->
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
          <label for="file-path-input" class="sr-only">当前目录路径</label>
          <input
            id="file-path-input"
            type="text"
            [(ngModel)]="pathInput"
            (keyup.enter)="loadPath(pathInput)"
            placeholder="/www/wwwroot"
            aria-label="当前目录路径"
            class="path-input"
          />
          <button mat-flat-button color="primary" (click)="loadPath(pathInput)">跳转</button>
          <button mat-stroked-button (click)="copyCurrentPath()" matTooltip="复制当前目录完整路径" aria-label="复制当前目录路径">
            <mat-icon>content_copy</mat-icon>
            <span>复制路径</span>
          </button>
          <button mat-stroked-button (click)="loadPath(currentPath())" aria-label="刷新当前目录">
            <mat-icon>refresh</mat-icon>
            <span>刷新</span>
          </button>
        </div>

        <!-- Clickable Breadcrumbs (FE-010) -->
        <nav aria-label="目录面包屑导航" class="breadcrumb-strip">
          <span style="color: var(--ag-on-surface-variant); font-size: 0.72rem">层级导航:</span>
          <button
            type="button"
            class="crumb-btn"
            (click)="loadPath('/')"
            [disabled]="!isPathWithinAllowed('/')"
            matTooltip="根目录"
          >/</button>
          <ng-container *ngFor="let seg of breadcrumbs(); let last = last">
            <span class="crumb-sep">/</span>
            <button
              type="button"
              class="crumb-btn"
              [class.active]="last"
              (click)="loadPath(seg.fullPath)"
            >
              {{ seg.label }}
            </button>
          </ng-container>
        </nav>

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

        <!-- Upload Retry Banner (FE-010) -->
        <div
          *ngIf="failedUploadFile()"
          class="m3-tonal-card"
          style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; border-color: var(--ag-warning)"
        >
          <span style="font-size: 0.78rem; color: var(--ag-warning)">
            文件 <strong>{{ failedUploadFile()!.name }}</strong> 上传未完成：{{ failedUploadReason() }}
          </span>
          <div style="display: flex; gap: 8px">
            <button mat-stroked-button (click)="retryFailedUpload(false)">重试上传</button>
            <button mat-flat-button color="warn" (click)="retryFailedUpload(true)">覆盖同名文件并上传</button>
            <button mat-button (click)="failedUploadFile.set(null)">忽略</button>
          </div>
        </div>
      </div>

      <!-- Filter, Sort & Batch Action Bar (FE-010, FE-011) -->
      <div class="m3-filter-bar font-mono">
        <div class="search-box">
          <mat-icon>search</mat-icon>
          <input
            type="search"
            [ngModel]="searchQuery()"
            (ngModelChange)="onSearchChange($event)"
            placeholder="在当前目录筛选文件名或扩展名..."
            aria-label="筛选当前目录文件"
          />
        </div>
        <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px">
          <label for="file-sort-select" style="font-size: 0.75rem; color: var(--ag-on-surface-variant)">排序:</label>
          <select
            id="file-sort-select"
            [ngModel]="sortField()"
            (ngModelChange)="setSortField($event)"
            aria-label="文件排序字段"
            style="padding: 6px 10px; border-radius: 999px; border: 1px solid var(--ag-outline-variant); background: var(--ag-surface-lowest); color: var(--ag-on-surface); font-size: 0.76rem"
          >
            <option value="name">按名称 (目录优先)</option>
            <option value="size">按文件大小</option>
            <option value="mod_time">按修改时间</option>
          </select>
          <button
            mat-stroked-button
            (click)="toggleSortAsc()"
            style="height: 32px; font-size: 0.75rem"
            [attr.aria-label]="sortAsc() ? '当前升序，点击切换降序' : '当前降序，点击切换升序'"
          >
            <mat-icon>{{ sortAsc() ? 'arrow_upward' : 'arrow_downward' }}</mat-icon>
            <span>{{ sortAsc() ? '升序' : '降序' }}</span>
          </button>

          <ng-container *ngIf="selectedPaths().length > 0">
            <span class="m3-badge info">已选 {{ selectedPaths().length }} 项</span>
            <button mat-stroked-button color="primary" (click)="openBatchCompressModal()" style="height: 32px; font-size: 0.75rem">
              <mat-icon>folder_zip</mat-icon>
              <span>批量压缩</span>
            </button>
            <button mat-stroked-button color="warn" (click)="confirmBatchDelete()" style="height: 32px; font-size: 0.75rem">
              <mat-icon>delete_sweep</mat-icon>
              <span>批量删除</span>
            </button>
            <button mat-button (click)="clearSelection()" style="height: 32px; font-size: 0.75rem">取消选择</button>
          </ng-container>
        </div>
      </div>

      <!-- Unified State Banner (FE-001) -->
      <ag-state-banner
        *ngIf="loading() && files().length === 0"
        state="loading"
        title="正在读取目录内容..."
        [description]="'目标路径: ' + currentPath()"
      />

      <ag-state-banner
        *ngIf="loadError()"
        [state]="isForbiddenError() ? 'forbidden' : 'error'"
        [title]="isForbiddenError() ? '受控沙箱目录访问受限' : '目录加载失败'"
        [description]="loadError()!"
        primaryActionLabel="返回默认工作目录"
        primaryActionIcon="home"
        secondaryActionLabel="重试当前路径"
        (primaryAction)="loadPath(defaultPath())"
        (secondaryAction)="loadPath(currentPath())"
      />

      <!-- File Table -->
      <div class="m3-card" *ngIf="!loadError()">
        <div class="m3-table-wrap font-mono">
          <table class="m3-data-table" aria-label="当前目录文件列表">
            <thead>
              <tr>
                <th style="width: 38px">
                  <input
                    type="checkbox"
                    [checked]="isAllSelected()"
                    (change)="toggleSelectAll($event)"
                    aria-label="全选当前目录列表项"
                  />
                </th>
                <th>名称 ({{ filteredFiles().length }}/{{ files().length }})</th>
                <th>权限 (Mode)</th>
                <th>所有者</th>
                <th>大小</th>
                <th>修改时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let item of filteredFiles()">
                <td>
                  <input
                    type="checkbox"
                    [checked]="isSelected(item.path)"
                    (change)="toggleSelect(item.path)"
                    [attr.aria-label]="'选择 ' + item.name"
                  />
                </td>
                <td>
                  <div
                    style="display: flex; align-items: center; gap: 8px; cursor: pointer"
                    (click)="onItemClick(item)"
                  >
                    <mat-icon [style.color]="item.is_dir ? 'var(--ag-primary)' : 'var(--ag-on-surface-variant)'">
                      {{ item.is_dir ? 'folder' : (isBinaryFile(item) ? 'insert_drive_file' : 'description') }}
                    </mat-icon>
                    <strong>{{ item.name }}</strong>
                    <span *ngIf="!item.is_dir && isBinaryFile(item)" class="m3-badge neutral" style="font-size: 0.65rem">BIN</span>
                  </div>
                </td>
                <td><span class="m3-badge neutral">{{ item.mode }}</span></td>
                <td>{{ item.owner }}:{{ item.group }}</td>
                <td>{{ item.is_dir ? '-' : formatBytes(item.size) }}</td>
                <td>{{ item.mod_time }}</td>
                <td>
                  <button
                    *ngIf="!item.is_dir"
                    mat-button
                    color="primary"
                    (click)="openEditor(item)"
                    [matTooltip]="isBinaryFile(item) ? '二进制文件不支持直接文本编辑' : '在线编辑文本文件'"
                  >
                    编辑
                  </button>
                  <button *ngIf="!item.is_dir" mat-button (click)="downloadFile(item)">下载</button>
                  <button mat-button (click)="openCompressModal(item)">压缩</button>
                  <button *ngIf="isArchive(item)" mat-button color="primary" (click)="decompressItem(item)">解压</button>
                  <button mat-button (click)="openChmodModal(item)">权限</button>
                  <button mat-button (click)="openRenameModal(item)">重命名</button>
                  <button mat-button color="warn" (click)="confirmDeleteSingle(item)">删除</button>
                </td>
              </tr>
              <tr *ngIf="!loading() && filteredFiles().length === 0">
                <td colspan="7" class="m3-empty-state">
                  <ng-container *ngIf="searchQuery().trim(); else emptyDirTpl">
                    没有匹配 “{{ searchQuery() }}” 的文件或目录。
                  </ng-container>
                  <ng-template #emptyDirTpl>
                    当前目录 ({{ currentPath() }}) 为空，可通过上方按钮新建或上传文件。
                  </ng-template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Create File / Directory Modal (FE-002, FE-004) -->
      <ag-modal
        [open]="createModalOpen()"
        [title]="createIsDir() ? '新建子目录' : '新建空文件'"
        [icon]="createIsDir() ? 'create_new_folder' : 'note_add'"
        [submitting]="submitting()"
        (closed)="createModalOpen.set(false)"
      >
        <div class="font-mono" style="display: flex; flex-direction: column; gap: 14px">
          <div class="m3-field">
            <label for="create-parent-path">所在目录</label>
            <input id="create-parent-path" type="text" [value]="currentPath()" readonly />
          </div>
          <div class="m3-field" [class.has-error]="!!createError()">
            <label for="create-item-name">
              {{ createIsDir() ? '新目录名称' : '新文件名称' }} <span class="m3-req">*</span>
            </label>
            <input
              id="create-item-name"
              type="text"
              [(ngModel)]="createName"
              (ngModelChange)="createError.set('')"
              (keyup.enter)="submitCreate(false)"
              placeholder="例如: config.json 或 assets"
            />
            <div *ngIf="createError()" class="m3-field-error" role="alert">{{ createError() }}</div>
          </div>
          <div *ngIf="conflictPending()" class="m3-tonal-card" style="border-color: var(--ag-warning); color: var(--ag-warning)">
            ⚠️ 同名文件已存在！继续覆盖将清空原文件内容，是否确认强制覆盖？
          </div>
        </div>
        <div modal-footer>
          <button mat-stroked-button (click)="createModalOpen.set(false)" [disabled]="submitting()">取消</button>
          <button
            *ngIf="conflictPending()"
            mat-flat-button
            color="warn"
            [disabled]="submitting()"
            (click)="submitCreate(true)"
          >
            确认覆盖原文件
          </button>
          <button
            *ngIf="!conflictPending()"
            mat-flat-button
            color="primary"
            [disabled]="submitting()"
            (click)="submitCreate(false)"
          >
            {{ submitting() ? '创建中...' : '确认创建' }}
          </button>
        </div>
      </ag-modal>

      <!-- Rename Modal (FE-002, FE-004) -->
      <ag-modal
        [open]="!!renamingItem()"
        [title]="'重命名: ' + (renamingItem()?.name || '')"
        icon="drive_file_rename_outline"
        [submitting]="submitting()"
        (closed)="renamingItem.set(null)"
      >
        <div class="font-mono" style="display: flex; flex-direction: column; gap: 14px">
          <div class="m3-field">
            <label for="rename-input">新名称 <span class="m3-req">*</span></label>
            <input id="rename-input" type="text" [(ngModel)]="renameInput" (keyup.enter)="submitRename(false)" />
          </div>
          <div *ngIf="conflictPending()" class="m3-tonal-card" style="border-color: var(--ag-warning); color: var(--ag-warning)">
            ⚠️ 目标名称已存在！强制覆盖会替换已有文件，是否确认覆盖？
          </div>
        </div>
        <div modal-footer>
          <button mat-stroked-button (click)="renamingItem.set(null)" [disabled]="submitting()">取消</button>
          <button *ngIf="conflictPending()" mat-flat-button color="warn" [disabled]="submitting()" (click)="submitRename(true)">
            确认覆盖目标
          </button>
          <button *ngIf="!conflictPending()" mat-flat-button color="primary" [disabled]="submitting()" (click)="submitRename(false)">
            确认重命名
          </button>
        </div>
      </ag-modal>

      <!-- Chmod Modal -->
      <ag-modal
        [open]="!!chmodItem()"
        [title]="'修改权限: ' + (chmodItem()?.name || '')"
        icon="lock_person"
        [submitting]="submitting()"
        (closed)="chmodItem.set(null)"
      >
        <div class="font-mono">
          <div class="m3-field" [class.has-error]="!!chmodError()">
            <label for="chmod-mode-input">八进制权限模式 (例如 0755 或 0644) <span class="m3-req">*</span></label>
            <input
              id="chmod-mode-input"
              type="text"
              [(ngModel)]="chmodInput"
              (ngModelChange)="chmodError.set('')"
              (keyup.enter)="submitChmod()"
            />
            <div *ngIf="chmodError()" class="m3-field-error" role="alert">{{ chmodError() }}</div>
          </div>
        </div>
        <div modal-footer>
          <button mat-stroked-button (click)="chmodItem.set(null)" [disabled]="submitting()">取消</button>
          <button mat-flat-button color="primary" [disabled]="submitting()" (click)="submitChmod()">保存权限</button>
        </div>
      </ag-modal>

      <!-- Compress Modal (Single or Batch) -->
      <ag-modal
        [open]="compressModalOpen()"
        [title]="'创建归档压缩包 (' + compressPaths().length + ' 项)'"
        icon="folder_zip"
        [submitting]="submitting()"
        (closed)="compressModalOpen.set(false)"
      >
        <div class="font-mono" style="display: flex; flex-direction: column; gap: 14px">
          <div class="m3-field">
            <label for="compress-format-select">归档格式</label>
            <select id="compress-format-select" [(ngModel)]="compressFormat" (change)="onCompressFormatChange()">
              <option value="tar.gz">tar.gz (Linux Gzip 归档)</option>
              <option value="zip">zip (通用压缩格式)</option>
            </select>
          </div>
          <div class="m3-field">
            <label for="compress-target-name">输出归档文件名 <span class="m3-req">*</span></label>
            <input id="compress-target-name" type="text" [(ngModel)]="compressTargetName" />
          </div>
          <div class="m3-hint">
            安全策略：归档前将递归扫描子项，自动拦截包含敏感凭证（如 .env、SSH 私钥）或越界符号链接的目录。
          </div>
        </div>
        <div modal-footer>
          <button mat-stroked-button (click)="compressModalOpen.set(false)" [disabled]="submitting()">取消</button>
          <button mat-flat-button color="primary" [disabled]="submitting()" (click)="submitCompress()">
            {{ submitting() ? '归档压缩中...' : '开始压缩' }}
          </button>
        </div>
      </ag-modal>

      <!-- File Text Editor Modal with Dirty Protection & Status Bar (FE-002, FE-003, FE-010) -->
      <ag-modal
        [open]="!!editingFile()"
        [title]="'编辑文件: ' + (editingFile()?.path || '')"
        icon="edit_note"
        size="xl"
        [dirty]="isEditorDirty()"
        [submitting]="submitting()"
        (closed)="closeEditor()"
      >
        <div class="font-mono" style="display: flex; flex-direction: column; gap: 10px">
          <div class="editor-meta-strip">
            <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px">
              <span class="m3-badge neutral">编码: UTF-8</span>
              <span class="m3-badge neutral">大小: {{ formatBytes(editingFile()?.size || 0) }}</span>
              <span class="m3-badge neutral">行数: {{ editorLineCount() }}</span>
              <span *ngIf="isEditorDirty()" class="m3-badge warning">● 未保存修改</span>
              <span *ngIf="!isEditorDirty()" class="m3-badge success">✓ 已同步</span>
            </div>
            <button mat-stroked-button (click)="copyEditorContent()" style="height: 28px; font-size: 0.72rem">
              <mat-icon>content_copy</mat-icon>
              <span>复制全文</span>
            </button>
          </div>
          <div class="m3-field">
            <label for="file-editor-textarea" class="sr-only">文件内容编辑器</label>
            <textarea
              id="file-editor-textarea"
              rows="18"
              [(ngModel)]="editorContent"
              style="line-height: 1.5; tab-size: 2"
            ></textarea>
          </div>
        </div>
        <div modal-footer>
          <button mat-stroked-button (click)="closeEditor()" [disabled]="submitting()">关闭</button>
          <button
            mat-flat-button
            color="primary"
            [disabled]="submitting() || !isEditorDirty()"
            (click)="saveEditor()"
          >
            {{ submitting() ? '保存中...' : '保存文件 (UTF-8)' }}
          </button>
        </div>
      </ag-modal>
    </div>
  `,
  styles: [
    `
      .path-bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
      }
      .path-input {
        flex: 1;
        min-width: 200px;
        padding: 8px 14px;
        border-radius: 999px;
        border: 1px solid var(--ag-outline);
        background: var(--ag-surface-lowest);
        color: var(--ag-on-surface);
        font-size: 0.84rem;
      }
      .breadcrumb-strip {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        border-radius: var(--ag-radius-sm);
        background: var(--ag-surface-low);
      }
      .crumb-btn {
        border: none;
        background: transparent;
        color: var(--ag-primary);
        font-family: 'JetBrains Mono', monospace;
        font-size: 0.76rem;
        padding: 2px 6px;
        border-radius: 6px;
        cursor: pointer;
      }
      .crumb-btn:hover:not(:disabled) {
        background: var(--ag-primary-container);
        color: var(--ag-on-primary-container);
      }
      .crumb-btn.active {
        font-weight: 700;
        color: var(--ag-on-surface);
      }
      .crumb-btn:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .crumb-sep {
        color: var(--ag-outline);
        font-size: 0.74rem;
      }
      .upload-btn {
        cursor: pointer;
      }
      .editor-meta-strip {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 8px 12px;
        border-radius: var(--ag-radius-sm);
        background: var(--ag-surface-low);
        border: 1px solid var(--ag-outline-variant);
      }
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        border: 0;
      }
    `,
  ],
})
export class FilesComponent implements OnInit, HasUnsavedChanges {
  private toast = inject(ToastService)
  private confirmSvc = inject(ConfirmService)
  private route = inject(ActivatedRoute)
  private router = inject(Router)

  readonly currentPath = signal('/www/wwwroot')
  readonly parentPath = signal('/www')
  readonly defaultPath = signal('/www/wwwroot')
  readonly allowedRoots = signal<string[]>([])
  readonly files = signal<FileItem[]>([])
  readonly loading = signal(false)
  readonly loadError = signal<string | null>(null)
  readonly submitting = signal(false)

  // Search, sort & selection (FE-010, FE-011)
  readonly searchQuery = signal('')
  readonly sortField = signal<'name' | 'size' | 'mod_time'>('name')
  readonly sortAsc = signal(true)
  readonly selectedPaths = signal<string[]>([])

  // Editor state (FE-003, FE-010)
  readonly editingFile = signal<FileItem | null>(null)
  readonly originalEditorContent = signal('')
  editorContent = ''

  // Upload state & retry (FE-010)
  readonly uploading = signal(false)
  readonly uploadPercent = signal(0)
  readonly failedUploadFile = signal<File | null>(null)
  readonly failedUploadReason = signal('')

  // Modal states
  readonly createModalOpen = signal(false)
  readonly createIsDir = signal(false)
  readonly createError = signal('')
  readonly conflictPending = signal(false)
  readonly renamingItem = signal<FileItem | null>(null)
  readonly chmodItem = signal<FileItem | null>(null)
  readonly chmodError = signal('')
  readonly compressModalOpen = signal(false)
  readonly compressPaths = signal<string[]>([])
  readonly compressBaseName = signal('archive')

  pathInput = ''
  createName = ''
  renameInput = ''
  chmodInput = '0644'
  compressFormat: 'tar.gz' | 'zip' = 'tar.gz'
  compressTargetName = ''

  readonly breadcrumbs = computed(() => {
    const p = this.currentPath() || '/'
    const parts = p.split('/').filter(Boolean)
    const segs: { label: string; fullPath: string }[] = []
    let acc = ''
    for (const part of parts) {
      acc += '/' + part
      segs.push({ label: part, fullPath: acc })
    }
    return segs
  })

  readonly filteredFiles = computed(() => {
    const q = this.searchQuery().trim().toLowerCase()
    const field = this.sortField()
    const asc = this.sortAsc()
    const list = this.files().filter((item) => !q || item.name.toLowerCase().includes(q))

    return [...list].sort((a, b) => {
      // Directories always come first
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
      let cmp = 0
      if (field === 'size') {
        cmp = (a.size || 0) - (b.size || 0)
      } else if (field === 'mod_time') {
        cmp = String(a.mod_time || '').localeCompare(String(b.mod_time || ''))
      } else {
        cmp = a.name.localeCompare(b.name, 'zh-CN', { numeric: true })
      }
      return asc ? cmp : -cmp
    })
  })

  ngOnInit() {
    const qp = this.route.snapshot.queryParamMap
    const initPath = qp.get('path') || undefined
    if (qp.get('q')) this.searchQuery.set(qp.get('q')!)
    this.loadPath(initPath)
  }

  hasUnsavedChanges(): boolean {
    return this.isEditorDirty()
  }

  isEditorDirty(): boolean {
    return !!this.editingFile() && this.editorContent !== this.originalEditorContent()
  }

  editorLineCount(): number {
    if (!this.editorContent) return 1
    return this.editorContent.split('\n').length
  }

  isForbiddenError(): boolean {
    const msg = (this.loadError() || '').toLowerCase()
    return msg.includes('受控') || msg.includes('越界') || msg.includes('权限') || msg.includes('forbidden')
  }

  isPathWithinAllowed(target: string): boolean {
    const roots = this.allowedRoots()
    if (!roots.length) return true
    return roots.some((r) => target === r || target.startsWith(r.endsWith('/') ? r : r + '/'))
  }

  async loadPath(targetPath?: string) {
    this.loading.set(true)
    this.loadError.set(null)
    this.selectedPaths.set([])
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
        this.syncUrlParams()
      }
    } catch (e: any) {
      const msg = e.message || '无法加载目录'
      this.loadError.set(msg)
      this.toast.error(msg)
    } finally {
      this.loading.set(false)
    }
  }

  onSearchChange(q: string) {
    this.searchQuery.set(q)
    this.syncUrlParams()
  }

  setSortField(field: 'name' | 'size' | 'mod_time') {
    this.sortField.set(field)
  }

  toggleSortAsc() {
    this.sortAsc.set(!this.sortAsc())
  }

  private syncUrlParams() {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        path: this.currentPath() || null,
        q: this.searchQuery().trim() || null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    })
  }

  async copyCurrentPath() {
    const ok = await copyToClipboard(this.currentPath())
    if (ok) this.toast.success(`已复制目录路径: ${this.currentPath()}`)
    else this.toast.error('复制失败，请手动复制路径输入框内容')
  }

  async copyEditorContent() {
    const ok = await copyToClipboard(this.editorContent)
    if (ok) this.toast.success('文件内容已复制到剪贴板')
    else this.toast.error('复制失败')
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

  isBinaryFile(item: FileItem): boolean {
    if (item.is_dir) return false
    const parts = item.name.toLowerCase().split('.')
    if (parts.length < 2) return false
    const ext = parts[parts.length - 1]
    return BINARY_EXTENSIONS.has(ext)
  }

  isArchive(item: FileItem): boolean {
    if (item.is_dir) return false
    const lower = item.name.toLowerCase()
    return lower.endsWith('.tar.gz') || lower.endsWith('.tgz') || lower.endsWith('.zip')
  }

  isSelected(path: string): boolean {
    return this.selectedPaths().includes(path)
  }

  isAllSelected(): boolean {
    const visible = this.filteredFiles()
    return visible.length > 0 && visible.every((f) => this.selectedPaths().includes(f.path))
  }

  toggleSelect(path: string) {
    const cur = new Set(this.selectedPaths())
    if (cur.has(path)) cur.delete(path)
    else cur.add(path)
    this.selectedPaths.set(Array.from(cur))
  }

  toggleSelectAll(ev: Event) {
    const checked = (ev.target as HTMLInputElement).checked
    if (checked) {
      this.selectedPaths.set(this.filteredFiles().map((f) => f.path))
    } else {
      this.selectedPaths.set([])
    }
  }

  clearSelection() {
    this.selectedPaths.set([])
  }

  async openEditor(item: FileItem) {
    if (this.isBinaryFile(item)) {
      this.toast.warning(`文件 ${item.name} 属于二进制或归档文件，不支持直接作为 UTF-8 文本编辑，请使用下载功能。`)
      return
    }
    if (item.size > MAX_SAFE_EDIT_BYTES) {
      const res = await this.confirmSvc.ask({
        title: '大文件在线编辑确认',
        resourceName: `${item.name} (${this.formatBytes(item.size)})`,
        message: '该文件体积超过 1 MB，在浏览器内直接加载可能引起页面卡顿。',
        impact: '建议下载到本地编辑后再上传；若继续将在浏览器中加载完整文本。',
        confirmText: '仍然打开编辑器',
        severity: 'warning',
      })
      if (!res.confirmed) return
    }
    try {
      const res = await fileApi.getContent(item.path)
      const content = res.data?.data?.content
      if (typeof content !== 'string') {
        this.toast.error('未获取到有效文本内容，已阻止打开空白编辑器以防误覆盖')
        return
      }
      this.editorContent = content
      this.originalEditorContent.set(content)
      this.editingFile.set(item)
    } catch (e: any) {
      this.toast.error(`无法打开文本编辑器: ${e.message}`)
    }
  }

  closeEditor() {
    this.editingFile.set(null)
    this.editorContent = ''
    this.originalEditorContent.set('')
  }

  async saveEditor() {
    const f = this.editingFile()
    if (!f) return
    this.submitting.set(true)
    try {
      await fileApi.saveContent(f.path, this.editorContent)
      this.originalEditorContent.set(this.editorContent)
      this.toast.success(`文件 ${f.name} 保存成功`)
      this.closeEditor()
      this.loadPath(this.currentPath())
    } catch (e: any) {
      this.toast.error(e.message)
    } finally {
      this.submitting.set(false)
    }
  }

  openCreateModal(isDir: boolean) {
    this.createIsDir.set(isDir)
    this.createName = ''
    this.createError.set('')
    this.conflictPending.set(false)
    this.createModalOpen.set(true)
  }

  async submitCreate(overwrite: boolean) {
    const name = this.createName.trim()
    if (!name || name.includes('/') || name.includes('\\')) {
      this.createError.set('请输入合法的文件或目录名称（不能包含路径分隔符 / 或 \\）')
      return
    }
    const sep = this.currentPath().endsWith('/') ? '' : '/'
    const fullPath = `${this.currentPath()}${sep}${name}`
    this.submitting.set(true)
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
    } finally {
      this.submitting.set(false)
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
    this.submitting.set(true)
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
    } finally {
      this.submitting.set(false)
    }
  }

  openChmodModal(item: FileItem) {
    this.chmodItem.set(item)
    this.chmodInput = item.mode || '0644'
    this.chmodError.set('')
  }

  async submitChmod() {
    const item = this.chmodItem()
    const mode = this.chmodInput.trim()
    if (!item) return
    if (!/^[0-7]{3,4}$/.test(mode)) {
      this.chmodError.set('请输入合法的八进制权限位（如 0644 或 0755）')
      return
    }
    this.submitting.set(true)
    try {
      await fileApi.changePermission(item.path, mode)
      this.toast.success('权限已更新')
      this.chmodItem.set(null)
      this.loadPath(this.currentPath())
    } catch (e: any) {
      this.toast.error(e.message)
    } finally {
      this.submitting.set(false)
    }
  }

  openCompressModal(item: FileItem) {
    this.compressPaths.set([item.path])
    this.compressBaseName.set(item.name)
    this.compressFormat = 'tar.gz'
    this.compressTargetName = `${item.name}.tar.gz`
    this.compressModalOpen.set(true)
  }

  openBatchCompressModal() {
    const paths = this.selectedPaths()
    if (!paths.length) return
    const base = `batch-${paths.length}items`
    this.compressPaths.set(paths)
    this.compressBaseName.set(base)
    this.compressFormat = 'tar.gz'
    this.compressTargetName = `${base}.tar.gz`
    this.compressModalOpen.set(true)
  }

  onCompressFormatChange() {
    this.compressTargetName = `${this.compressBaseName()}.${this.compressFormat}`
  }

  async submitCompress() {
    const paths = this.compressPaths()
    const targetName = this.compressTargetName.trim()
    if (!paths.length || !targetName) return
    this.submitting.set(true)
    try {
      await fileApi.compress(paths, targetName, this.compressFormat)
      this.toast.success(`归档完成: ${targetName}`)
      this.compressModalOpen.set(false)
      this.selectedPaths.set([])
      this.loadPath(this.currentPath())
    } catch (e: any) {
      this.toast.error(e.message)
    } finally {
      this.submitting.set(false)
    }
  }

  async decompressItem(item: FileItem, overwrite = false) {
    try {
      await fileApi.decompress(item.path, this.currentPath(), overwrite)
      this.toast.success(`已解压: ${item.name}`)
      this.loadPath(this.currentPath())
    } catch (e: any) {
      if (e.response?.status === 409 && !overwrite) {
        const res = await this.confirmSvc.ask({
          title: '解压目标文件冲突',
          resourceName: item.name,
          message: '当前目录下已存在归档包内的同名文件或子目录。',
          impact: '选择继续覆盖将替换当前目录中的同名文件。',
          confirmText: '确认覆盖解压',
          severity: 'warning',
        })
        if (res.confirmed) {
          await this.decompressItem(item, true)
        }
        return
      }
      this.toast.error(e.message)
    }
  }

  async onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    input.value = ''
    await this.performUpload(file, false)
  }

  async retryFailedUpload(overwrite: boolean) {
    const file = this.failedUploadFile()
    if (!file) return
    await this.performUpload(file, overwrite)
  }

  private async performUpload(file: File, overwrite: boolean) {
    this.uploading.set(true)
    this.uploadPercent.set(0)
    this.failedUploadFile.set(null)
    try {
      await fileApi.uploadFile(
        this.currentPath(),
        file,
        (pct) => this.uploadPercent.set(pct),
        overwrite
      )
      this.toast.success(`上传完成: ${file.name}`)
      this.loadPath(this.currentPath())
    } catch (e: any) {
      if (e.response?.status === 409 && !overwrite) {
        const res = await this.confirmSvc.ask({
          title: '上传同名文件冲突',
          resourceName: `${this.currentPath()}/${file.name}`,
          message: `当前目录已存在名为 ${file.name} 的文件。`,
          impact: '确认覆盖将直接替换服务器上的原文件且无法恢复。',
          confirmText: '覆盖上传',
          severity: 'warning',
        })
        if (res.confirmed) {
          await this.performUpload(file, true)
          return
        }
      }
      this.failedUploadFile.set(file)
      this.failedUploadReason.set(e.message || '网络中断或同名冲突')
      this.toast.error(e.message)
    } finally {
      this.uploading.set(false)
      this.uploadPercent.set(0)
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

  async confirmDeleteSingle(item: FileItem) {
    const res = await this.confirmSvc.ask({
      title: item.is_dir ? '删除目录确认' : '删除文件确认',
      resourceName: item.path,
      message: `确定要永久删除 ${item.is_dir ? '目录及其所有子文件' : '文件'} “${item.name}” 吗？`,
      impact: '该操作会直接从磁盘移除目标且不可撤销。',
      confirmText: '确认永久删除',
      severity: 'danger',
    })
    if (!res.confirmed) return
    try {
      await fileApi.deleteFiles([item.path])
      this.toast.success(`已删除: ${item.name}`)
      this.loadPath(this.currentPath())
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async confirmBatchDelete() {
    const paths = this.selectedPaths()
    if (!paths.length) return
    const res = await this.confirmSvc.ask({
      title: '批量删除文件确认',
      resourceName: `${paths.length} 个选中项 (${this.currentPath()})`,
      message: `确定要永久删除选中的 ${paths.length} 个文件或目录吗？`,
      impact: '批量删除操作不可恢复，包含的目录将被递归移除。',
      confirmText: `确认删除 (${paths.length} 项)`,
      severity: 'danger',
    })
    if (!res.confirmed) return
    try {
      await fileApi.deleteFiles(paths)
      this.toast.success(`已批量删除 ${paths.length} 项`)
      this.selectedPaths.set([])
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
