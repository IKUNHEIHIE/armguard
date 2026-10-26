import { Component, OnInit, inject, signal } from '@angular/core'
import { Router } from '@angular/router'
import { AgMaterialModule } from '../../core/material.module'
import { ToastService } from '../../core/toast.service'
import { ConfirmService } from '../../core/confirm.service'
import { TaskCenterService } from '../../core/task-center.service'
import { HasUnsavedChanges } from '../../core/unsaved-changes.guard'
import { AgModalComponent } from '../../components/ag-modal.component'
import { AgStateBannerComponent } from '../../components/ag-state-banner.component'
import {
  dockerApi,
  DockerContainer,
  DockerImage,
  ManifestInspectResult,
  CreateContainerParams,
} from '@/api/docker'

@Component({
  selector: 'ag-docker',
  standalone: true,
  imports: [AgMaterialModule, AgModalComponent, AgStateBannerComponent],
  template: `
    <div class="m3-page">
      <div class="m3-page-header">
        <div>
          <h2 class="m3-page-title">
            <mat-icon style="color: var(--ag-primary)" aria-hidden="true">deployed_code</mat-icon>
            <span>Docker 容器与 ARM 多架构镜像管理</span>
            <span *ngIf="dockerVersion()" class="m3-badge primary font-mono">
              {{ dockerVersion() }}
            </span>
          </h2>
          <p class="m3-page-subtitle">
            拉取镜像前自动预检 OCI Manifest Index，拦截纯 x86 镜像以杜绝 ARM64 宿主机架构不兼容错误
          </p>
        </div>
        <div class="m3-page-actions">
          <button
            type="button"
            mat-stroked-button
            [disabled]="loading()"
            (click)="loadAll()"
          >
            <mat-icon>refresh</mat-icon>
            <span>{{ loading() ? '检测中...' : '刷新状态' }}</span>
          </button>
          <button
            type="button"
            mat-flat-button
            color="primary"
            [disabled]="!dockerReady()"
            [matTooltip]="dockerReady() ? '创建并启动新的 Docker 容器' : '需先安装并启动 Docker 引擎'"
            (click)="openCreateModal()"
          >
            <mat-icon>add</mat-icon>
            <span>创建容器</span>
          </button>
        </div>
      </div>

      <!-- 1. Loading State (FE-001) -->
      <ag-state-banner
        *ngIf="loading() && !initialChecked()"
        state="loading"
        title="正在检测宿主机 Docker 引擎与容器状态..."
        description="正在查询 docker.service 运行状态与本地容器列表"
      ></ag-state-banner>

      <!-- 2. Missing Dependency: Docker Not Installed (FE-008 & FE-001) -->
      <ag-state-banner
        *ngIf="initialChecked() && !dockerInstalled()"
        state="missing_dep"
        title="当前宿主机尚未安装 Docker 容器引擎"
        description="容器编排、镜像拉取与容器日志功能依赖 Docker Engine (docker.io / containerd)。请前往软件商店一键安装 Docker，安装完成后即可在此管理容器。"
        actionLabel="前往软件商店安装 Docker"
        actionIcon="apps"
        secondaryActionLabel="重新检测"
        (action)="router.navigateByUrl('/appstore')"
        (secondaryAction)="loadAll()"
      ></ag-state-banner>

      <!-- 3. Daemon Stopped Warning (FE-008) -->
      <ag-state-banner
        *ngIf="initialChecked() && dockerInstalled() && !daemonRunning()"
        state="missing_dep"
        title="Docker 已安装，但守护进程 (docker.service) 当前未运行"
        description="请前往软件商店启动 Docker 服务，或在 Web 终端执行 systemctl start docker 后点击重新检测。"
        actionLabel="前往软件商店启动服务"
        actionIcon="play_arrow"
        secondaryActionLabel="重新检测"
        (action)="router.navigateByUrl('/appstore')"
        (secondaryAction)="loadAll()"
      ></ag-state-banner>

      <!-- 4. Partial Error Banner (FE-001) -->
      <ag-state-banner
        *ngIf="loadError()"
        [state]="containers().length > 0 || images().length > 0 ? 'partial_error' : 'error'"
        title="读取 Docker 数据失败"
        [description]="loadError()!"
        [lastUpdated]="lastUpdated()"
        actionLabel="重试"
        (action)="loadAll()"
      ></ag-state-banner>

      <!-- OCI Multi-Arch Pre-flight Inspector -->
      <div class="m3-card">
        <div style="font-weight: 700; margin-bottom: 10px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px">
          <div style="display: flex; align-items: center; gap: 8px">
            <mat-icon style="color: var(--ag-primary)" aria-hidden="true">fact_check</mat-icon>
            <span>ARM64 / ARMv7 镜像架构兼容性预检与拉取</span>
          </div>
          <span *ngIf="!dockerReady()" class="m3-badge warning font-mono">
            预检可用 · 拉取镜像需先启用 Docker 引擎
          </span>
        </div>

        <div style="display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end" class="font-mono">
          <div class="m3-field" style="flex: 2; min-width: 220px">
            <label for="docker-pull-name">镜像名称 (Repository)</label>
            <input
              id="docker-pull-name"
              type="text"
              [(ngModel)]="pullImageName"
              placeholder="nginx / redis / postgres"
            />
          </div>
          <div class="m3-field" style="width: 140px">
            <label for="docker-pull-tag">标签 (Tag)</label>
            <input
              id="docker-pull-tag"
              type="text"
              [(ngModel)]="pullImageTag"
              placeholder="latest"
            />
          </div>
          <button
            type="button"
            mat-stroked-button
            [disabled]="inspecting() || !pullImageName.trim()"
            (click)="handleInspectManifest()"
          >
            <mat-icon>travel_explore</mat-icon>
            <span>{{ inspecting() ? '正在查询...' : '预检 ARM 架构' }}</span>
          </button>
          <button
            type="button"
            mat-flat-button
            color="primary"
            [disabled]="!dockerReady() || pulling() || !pullImageName.trim()"
            (click)="handlePullImage()"
          >
            <mat-icon>{{ pulling() ? 'downloading' : 'download' }}</mat-icon>
            <span>{{ pulling() ? '正在拉取镜像...' : '拉取镜像' }}</span>
          </button>
        </div>

        <div *ngIf="manifestResult()" class="m3-tonal-card font-mono" style="margin-top: 12px" role="status">
          <div style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px">
            <strong>{{ manifestResult()!.image }}:{{ manifestResult()!.tag }}</strong>
            <span
              class="m3-badge"
              [ngClass]="manifestResult()!.has_arm64 ? 'success' : 'danger'"
            >
              {{ manifestResult()!.has_arm64 ? '✓ 原生支持 linux/arm64' : '✕ 缺少 ARM64 架构 (风险)' }}
            </span>
          </div>
          <div style="font-size: 0.76rem; color: var(--ag-on-surface-variant); margin-top: 6px">
            {{ manifestResult()!.warning_message || '该镜像包含 ARM 原生构建层，可安全部署。' }}
          </div>
        </div>
      </div>

      <!-- Containers & Images Tabs (Only shown when Docker is installed & running, FE-008) -->
      <mat-tab-group *ngIf="dockerReady()" animationDuration="160ms">
        <!-- Tab 1: Containers -->
        <mat-tab [label]="'容器实例 (' + containers().length + ')'">
          <div class="m3-card" style="margin-top: 14px">
            <div class="m3-filter-bar">
              <div class="filter-left">
                <input
                  type="text"
                  [(ngModel)]="containerSearch"
                  aria-label="搜索容器名称或镜像"
                  placeholder="搜索容器名称、ID 或镜像..."
                  class="m3-search-input"
                />
                <select
                  [(ngModel)]="containerStatusFilter"
                  aria-label="按容器状态筛选"
                  class="m3-filter-select"
                >
                  <option value="all">全部状态</option>
                  <option value="running">运行中 (running)</option>
                  <option value="exited">已停止 (exited)</option>
                </select>
              </div>
              <div class="filter-right font-mono" style="font-size: 0.75rem; color: var(--ag-on-surface-variant)">
                显示 {{ filteredContainers().length }} / {{ containers().length }} 个容器
              </div>
            </div>

            <div class="m3-table-wrap font-mono">
              <table class="m3-data-table">
                <thead>
                  <tr>
                    <th>容器名 / ID</th>
                    <th>镜像</th>
                    <th>端口映射</th>
                    <th>CPU / 内存</th>
                    <th>状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let c of filteredContainers()">
                    <td>
                      <strong>{{ c.name }}</strong>
                      <div style="font-size: 0.7rem; color: var(--ag-on-surface-variant)">{{ c.id }}</div>
                    </td>
                    <td>{{ c.image }}</td>
                    <td>{{ c.ports.join(', ') || '-' }}</td>
                    <td>{{ c.cpu_percent }}% / {{ formatBytes(c.mem_usage_bytes) }}</td>
                    <td>
                      <span class="m3-badge" [ngClass]="c.status === 'running' ? 'success' : 'neutral'">
                        {{ c.status === 'running' ? '● 运行中' : '○ 已停止' }}
                      </span>
                    </td>
                    <td>
                      <button
                        *ngIf="c.status !== 'running'"
                        type="button"
                        mat-button
                        color="primary"
                        (click)="startContainer(c)"
                      >
                        启动
                      </button>
                      <button
                        *ngIf="c.status === 'running'"
                        type="button"
                        mat-button
                        (click)="stopContainer(c)"
                      >
                        停止
                      </button>
                      <button type="button" mat-button (click)="openLogs(c)">日志</button>
                      <button type="button" mat-button color="warn" (click)="deleteContainer(c)">删除</button>
                    </td>
                  </tr>
                  <tr *ngIf="filteredContainers().length === 0">
                    <td colspan="6" class="m3-empty-state">
                      <ng-container *ngIf="containers().length === 0; else noContainerMatch">
                        <div>当前尚无 Docker 容器实例。</div>
                        <div style="margin-top: 10px">
                          <button type="button" mat-flat-button color="primary" (click)="openCreateModal()">
                            <mat-icon>add</mat-icon>
                            <span>创建第一个容器</span>
                          </button>
                        </div>
                      </ng-container>
                      <ng-template #noContainerMatch>
                        没有匹配当前筛选条件的容器实例。
                      </ng-template>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </mat-tab>

        <!-- Tab 2: Images -->
        <mat-tab [label]="'本地镜像 (' + images().length + ')'">
          <div class="m3-card" style="margin-top: 14px">
            <div class="m3-filter-bar">
              <div class="filter-left">
                <input
                  type="text"
                  [(ngModel)]="imageSearch"
                  aria-label="搜索本地镜像仓库或标签"
                  placeholder="搜索镜像仓库或 Tag..."
                  class="m3-search-input"
                />
              </div>
              <div class="filter-right font-mono" style="font-size: 0.75rem; color: var(--ag-on-surface-variant)">
                共 {{ filteredImages().length }} 个镜像
              </div>
            </div>

            <div class="m3-table-wrap font-mono">
              <table class="m3-data-table">
                <thead>
                  <tr>
                    <th>仓库 (Repository)</th>
                    <th>Tag</th>
                    <th>架构 (Arch)</th>
                    <th>体积</th>
                    <th>创建时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr *ngFor="let img of filteredImages()">
                    <td><strong>{{ img.repository }}</strong></td>
                    <td>{{ img.tag }}</td>
                    <td>
                      <span class="m3-badge" [ngClass]="img.is_native_arm ? 'success' : 'warning'">
                        {{ img.arch }}
                      </span>
                    </td>
                    <td>{{ formatBytes(img.size_bytes) }}</td>
                    <td>{{ img.created_at }}</td>
                    <td>
                      <button type="button" mat-button color="primary" (click)="useImageForCreate(img)">
                        以此创建容器
                      </button>
                      <button type="button" mat-button color="warn" (click)="deleteImage(img)">删除</button>
                    </td>
                  </tr>
                  <tr *ngIf="filteredImages().length === 0">
                    <td colspan="6" class="m3-empty-state">
                      本地尚无匹配的 Docker 镜像，可通过上方工具栏预检并拉取镜像。
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </mat-tab>
      </mat-tab-group>

      <!-- Create Container Modal (FE-002, FE-003, FE-004, FE-014) -->
      <ag-modal
        [open]="showCreateModal()"
        title="创建并启动 Docker 容器"
        icon="add_box"
        size="md"
        [dirty]="createDirty()"
        [submitting]="creating()"
        (close)="showCreateModal.set(false); createDirty.set(false)"
      >
        <div class="font-mono" style="display: flex; flex-direction: column; gap: 14px">
          <div
            *ngIf="createError()"
            class="m3-tonal-card"
            role="alert"
            style="border-color: var(--ag-danger); background: var(--ag-danger-container); color: var(--ag-danger); font-size: 0.8rem"
          >
            <strong>创建失败：</strong>{{ createError() }}
          </div>

          <div class="m3-grid-2">
            <div class="m3-field">
              <label for="docker-create-name">
                <span>容器名称</span>
                <span class="m3-req">*</span>
              </label>
              <input
                id="docker-create-name"
                type="text"
                [(ngModel)]="createForm.name"
                (ngModelChange)="createDirty.set(true)"
                [attr.aria-invalid]="!!fieldErrors().name"
                placeholder="armguard-redis"
              />
              <div *ngIf="fieldErrors().name" class="m3-field-error" role="alert">
                {{ fieldErrors().name }}
              </div>
              <div class="m3-hint">仅限字母、数字、下划线、连字符与点号</div>
            </div>

            <div class="m3-field">
              <label for="docker-create-image">
                <span>镜像名称:Tag</span>
                <span class="m3-req">*</span>
              </label>
              <input
                id="docker-create-image"
                type="text"
                [(ngModel)]="createForm.image"
                (ngModelChange)="createDirty.set(true)"
                [attr.aria-invalid]="!!fieldErrors().image"
                placeholder="redis:alpine"
              />
              <div *ngIf="fieldErrors().image" class="m3-field-error" role="alert">
                {{ fieldErrors().image }}
              </div>
            </div>

            <div class="m3-field">
              <label for="docker-create-host-port">宿主机映射端口 (可选)</label>
              <input
                id="docker-create-host-port"
                type="number"
                min="1"
                max="65535"
                [(ngModel)]="hostPort"
                (ngModelChange)="createDirty.set(true)"
                [attr.aria-invalid]="!!fieldErrors().port"
                placeholder="8080"
              />
              <div *ngIf="fieldErrors().port" class="m3-field-error" role="alert">
                {{ fieldErrors().port }}
              </div>
            </div>

            <div class="m3-field">
              <label for="docker-create-container-port">容器内部端口 (可选)</label>
              <input
                id="docker-create-container-port"
                type="number"
                min="1"
                max="65535"
                [(ngModel)]="containerPort"
                (ngModelChange)="createDirty.set(true)"
                placeholder="80"
              />
            </div>
          </div>

          <div class="m3-field">
            <label for="docker-create-restart">重启策略 (Restart Policy)</label>
            <select
              id="docker-create-restart"
              [(ngModel)]="createForm.restart_policy"
              (ngModelChange)="createDirty.set(true)"
            >
              <option value="unless-stopped">unless-stopped (推荐，异常或重启后自动拉起)</option>
              <option value="always">always (始终保持运行)</option>
              <option value="on-failure">on-failure (仅非零退出码时重启)</option>
              <option value="no">no (不自动重启)</option>
            </select>
          </div>
        </div>

        <ng-container modal-footer>
          <button
            type="button"
            mat-stroked-button
            [disabled]="creating()"
            (click)="showCreateModal.set(false); createDirty.set(false)"
          >
            取消
          </button>
          <button
            type="button"
            mat-flat-button
            color="primary"
            [disabled]="creating()"
            (click)="handleCreateContainer()"
          >
            <mat-icon>{{ creating() ? 'hourglass_top' : 'play_arrow' }}</mat-icon>
            <span>{{ creating() ? '正在创建容器...' : '立即创建并启动' }}</span>
          </button>
        </ng-container>
      </ag-modal>

      <!-- Container Logs Modal -->
      <ag-modal
        [open]="logModalOpen()"
        [title]="'容器实时日志: ' + activeLogContainerName()"
        icon="terminal"
        size="lg"
        (close)="logModalOpen.set(false)"
      >
        <pre class="m3-code-console">{{ containerLogs().join('\n') || '暂无容器标准输出日志' }}</pre>
        <ng-container modal-footer>
          <button type="button" mat-flat-button color="primary" (click)="logModalOpen.set(false)">
            关闭
          </button>
        </ng-container>
      </ag-modal>
    </div>
  `,
})
export class DockerComponent implements OnInit, HasUnsavedChanges {
  readonly router = inject(Router)
  private toast = inject(ToastService)
  private confirm = inject(ConfirmService)
  private taskCenter = inject(TaskCenterService)

  readonly containers = signal<DockerContainer[]>([])
  readonly images = signal<DockerImage[]>([])
  readonly loading = signal<boolean>(false)
  readonly initialChecked = signal<boolean>(false)
  readonly dockerInstalled = signal<boolean>(true)
  readonly daemonRunning = signal<boolean>(true)
  readonly dockerVersion = signal<string | null>(null)
  readonly loadError = signal<string | null>(null)
  readonly lastUpdated = signal<string | null>(null)

  readonly inspecting = signal<boolean>(false)
  readonly pulling = signal<boolean>(false)
  readonly manifestResult = signal<ManifestInspectResult | null>(null)

  readonly showCreateModal = signal(false)
  readonly createDirty = signal(false)
  readonly creating = signal(false)
  readonly createError = signal<string | null>(null)
  readonly fieldErrors = signal<Record<string, string>>({})

  readonly logModalOpen = signal(false)
  readonly activeLogContainerName = signal('')
  readonly containerLogs = signal<string[]>([])

  pullImageName = 'nginx'
  pullImageTag = 'alpine'
  hostPort: number | null = 8080
  containerPort: number | null = 80

  containerSearch = ''
  containerStatusFilter = 'all'
  imageSearch = ''

  createForm: CreateContainerParams = {
    name: '',
    image: 'nginx:alpine',
    ports: [],
    volumes: [],
    environments: [],
    restart_policy: 'unless-stopped',
  }

  hasUnsavedChanges(): boolean {
    return this.showCreateModal() && this.createDirty()
  }

  dockerReady(): boolean {
    return this.dockerInstalled() && this.daemonRunning()
  }

  ngOnInit() {
    this.loadAll()
  }

  async loadAll() {
    this.loading.set(true)
    this.loadError.set(null)
    try {
      const [cRes, iRes] = await Promise.all([dockerApi.getContainers(), dockerApi.getImages()])
      const cData = cRes.data?.data
      if (cData) {
        this.dockerInstalled.set(cData.docker_installed !== false)
        this.daemonRunning.set(cData.daemon_running !== false)
        this.dockerVersion.set(cData.docker_version || null)
        this.containers.set(cData.list || [])
      }
      this.images.set(iRes.data?.data?.list || [])
      const now = new Date()
      this.lastUpdated.set(
        `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
      )
    } catch (e: any) {
      this.loadError.set(e?.message || '无法连接 Docker 管理接口')
      this.toast.error(e.message)
    } finally {
      this.loading.set(false)
      this.initialChecked.set(true)
    }
  }

  filteredContainers(): DockerContainer[] {
    const q = this.containerSearch.trim().toLowerCase()
    return this.containers().filter((c) => {
      if (this.containerStatusFilter !== 'all' && c.status !== this.containerStatusFilter) return false
      if (!q) return true
      return (
        c.name.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        c.image.toLowerCase().includes(q)
      )
    })
  }

  filteredImages(): DockerImage[] {
    const q = this.imageSearch.trim().toLowerCase()
    if (!q) return this.images()
    return this.images().filter(
      (img) =>
        img.repository.toLowerCase().includes(q) ||
        img.tag.toLowerCase().includes(q) ||
        img.id.toLowerCase().includes(q)
    )
  }

  async handleInspectManifest() {
    if (this.inspecting() || !this.pullImageName.trim()) return
    this.inspecting.set(true)
    try {
      const res = await dockerApi.inspectManifest(
        this.pullImageName.trim(),
        this.pullImageTag.trim() || 'latest'
      )
      this.manifestResult.set(res.data?.data || null)
    } catch (e: any) {
      this.toast.error(e.message)
    } finally {
      this.inspecting.set(false)
    }
  }

  async handlePullImage() {
    if (!this.dockerReady() || this.pulling() || !this.pullImageName.trim()) return
    const repo = this.pullImageName.trim()
    const tag = this.pullImageTag.trim() || 'latest'
    this.pulling.set(true)
    try {
      await this.taskCenter.runTrackedTask({
        type: 'docker_pull',
        title: `拉取镜像 ${repo}:${tag}`,
        targetKey: `${repo}:${tag}`,
        initialLog: `正在从镜像仓库拉取 ${repo}:${tag}...`,
        viewRoute: '/docker',
        viewLabel: '查看本地镜像',
        executor: async () => {
          const res = await dockerApi.pullImage(repo, tag)
          return {
            summary: `镜像 ${repo}:${tag} 拉取完成`,
            result: res,
          }
        },
      })
      this.toast.success(`镜像 ${repo}:${tag} 拉取成功`)
      this.loadAll()
    } catch (e: any) {
      this.toast.error(e.message)
    } finally {
      this.pulling.set(false)
    }
  }

  async startContainer(c: DockerContainer) {
    try {
      await dockerApi.startContainer(c.id)
      this.toast.success(`容器 ${c.name} 已启动`)
      this.loadAll()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async stopContainer(c: DockerContainer) {
    const res = await this.confirm.ask({
      title: '停止运行中的容器',
      resourceName: `${c.name} (${c.image})`,
      message: `确定要停止容器 ${c.name} 吗？`,
      impact: '停止容器将中断该容器对外提供的网络端口服务，容器内已挂载持久化卷的数据不会丢失，随时可重新启动。',
      confirmText: '确认停止容器',
      tone: 'warning',
    })
    if (!res.confirmed) return

    try {
      await dockerApi.stopContainer(c.id)
      this.toast.info(`容器 ${c.name} 已停止`)
      this.loadAll()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async openLogs(c: DockerContainer) {
    this.activeLogContainerName.set(c.name)
    try {
      const res = await dockerApi.getContainerLogs(c.id, 200)
      this.containerLogs.set(res.data?.data?.logs || [])
      this.logModalOpen.set(true)
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async deleteContainer(c: DockerContainer) {
    const res = await this.confirm.ask({
      title: '删除 Docker 容器实例',
      resourceName: `${c.name} (${c.id})`,
      message: `确定要销毁并删除容器 ${c.name} 吗？`,
      impact: '容器层内未挂载到宿主机卷 (Volume/Bind Mount) 的临时写入数据将被永久清除，该操作不可撤销。',
      confirmText: '确认销毁容器',
      tone: 'danger',
    })
    if (!res.confirmed) return

    try {
      await dockerApi.deleteContainer(c.id, true)
      this.toast.success(`容器 ${c.name} 已删除`)
      this.loadAll()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async deleteImage(img: DockerImage) {
    const res = await this.confirm.ask({
      title: '删除本地 Docker 镜像',
      resourceName: `${img.repository}:${img.tag} (${img.id})`,
      message: `确定要从本地存储移除镜像 ${img.repository}:${img.tag} 吗？`,
      impact: '正在使用该镜像运行的容器可能阻止删除；删除后若再次需要，可重新从仓库拉取。',
      confirmText: '确认删除镜像',
      tone: 'danger',
    })
    if (!res.confirmed) return

    try {
      await dockerApi.deleteImage(img.id, true)
      this.toast.success('镜像已删除')
      this.loadAll()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  openCreateModal() {
    this.createForm = {
      name: '',
      image: 'nginx:alpine',
      ports: [],
      volumes: [],
      environments: [],
      restart_policy: 'unless-stopped',
    }
    this.createDirty.set(false)
    this.createError.set(null)
    this.fieldErrors.set({})
    this.showCreateModal.set(true)
  }

  useImageForCreate(img: DockerImage) {
    this.openCreateModal()
    this.createForm.image = `${img.repository}:${img.tag}`
    this.createDirty.set(true)
  }

  validateCreate(): boolean {
    const errs: Record<string, string> = {}
    const name = (this.createForm.name || '').trim()
    if (!name) {
      errs['name'] = '请输入容器名称'
    } else if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(name)) {
      errs['name'] = '容器名称必须以字母或数字开头，仅限字母、数字、_、.、-'
    }
    if (!(this.createForm.image || '').trim()) {
      errs['image'] = '请输入有效的镜像名称（如 nginx:alpine）'
    }
    if (this.hostPort !== null && this.hostPort !== undefined && String(this.hostPort) !== '') {
      const hp = Number(this.hostPort)
      const cp = Number(this.containerPort)
      if (!Number.isInteger(hp) || hp < 1 || hp > 65535 || !Number.isInteger(cp) || cp < 1 || cp > 65535) {
        errs['port'] = '映射端口必须在 1 ~ 65535 之间'
      }
    }
    this.fieldErrors.set(errs)
    return Object.keys(errs).length === 0
  }

  async handleCreateContainer() {
    if (this.creating()) return
    if (!this.validateCreate()) return

    const payload: CreateContainerParams = {
      ...this.createForm,
      name: this.createForm.name.trim(),
      image: this.createForm.image.trim(),
      ports:
        this.hostPort && this.containerPort
          ? [{ host_port: Number(this.hostPort), container_port: Number(this.containerPort), protocol: 'tcp' }]
          : [],
    }
    this.creating.set(true)
    this.createError.set(null)
    try {
      await dockerApi.createContainer(payload)
      this.toast.success(`容器 ${payload.name} 创建成功`)
      this.createDirty.set(false)
      this.showCreateModal.set(false)
      this.loadAll()
    } catch (e: any) {
      this.createError.set(e?.message || '容器创建失败')
      this.toast.error(e.message)
    } finally {
      this.creating.set(false)
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
