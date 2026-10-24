import { Component, OnInit, inject, signal } from '@angular/core'
import { AgMaterialModule } from '../../core/material.module'
import { ToastService } from '../../core/toast.service'
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
  imports: [AgMaterialModule],
  template: `
    <div class="m3-page">
      <div class="m3-page-header">
        <div>
          <h2 class="m3-page-title">
            <mat-icon style="color: var(--ag-primary)">deployed_code</mat-icon>
            <span>Docker 容器与 ARM 多架构 OCI 预检</span>
          </h2>
          <p class="m3-page-subtitle font-mono">
            拉取镜像前自动预检 OCI Manifest Index，拦截纯 x86 镜像以杜绝 ARM64 宿主机 exec format error
          </p>
        </div>
        <div class="m3-page-actions">
          <button mat-stroked-button (click)="loadAll()">
            <mat-icon>refresh</mat-icon>
            <span>刷新</span>
          </button>
          <button mat-flat-button color="primary" (click)="showCreateModal.set(true)">
            <mat-icon>add</mat-icon>
            <span>创建容器</span>
          </button>
        </div>
      </div>

      <!-- OCI Multi-Arch Pre-flight Inspector -->
      <div class="m3-card">
        <div style="font-weight: 700; margin-bottom: 10px; display: flex; align-items: center; gap: 8px">
          <mat-icon style="color: var(--ag-primary)">fact_check</mat-icon>
          <span>ARM64 / ARMv7 镜像架构兼容性预检与拉取</span>
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end" class="font-mono">
          <div class="m3-field" style="flex: 2; min-width: 220px">
            <label>镜像名称 (Repository)</label>
            <input type="text" [(ngModel)]="pullImageName" placeholder="nginx / redis / postgres" />
          </div>
          <div class="m3-field" style="width: 140px">
            <label>标签 (Tag)</label>
            <input type="text" [(ngModel)]="pullImageTag" placeholder="latest" />
          </div>
          <button mat-stroked-button (click)="handleInspectManifest()">
            <mat-icon>travel_explore</mat-icon>
            <span>预检 ARM 架构</span>
          </button>
          <button mat-flat-button color="primary" (click)="handlePullImage()">
            <mat-icon>download</mat-icon>
            <span>拉取镜像</span>
          </button>
        </div>

        <div *ngIf="manifestResult()" class="m3-tonal-card font-mono" style="margin-top: 12px">
          <div style="display: flex; align-items: center; justify-content: space-between">
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

      <mat-tab-group animationDuration="160ms">
        <!-- Tab 1: Containers -->
        <mat-tab [label]="'容器实例 (' + containers().length + ')'">
          <div class="m3-card" style="margin-top: 14px">
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
                  <tr *ngFor="let c of containers()">
                    <td>
                      <strong>{{ c.name }}</strong>
                      <div style="font-size: 0.7rem; color: var(--ag-on-surface-variant)">{{ c.id }}</div>
                    </td>
                    <td>{{ c.image }}</td>
                    <td>{{ c.ports.join(', ') || '-' }}</td>
                    <td>{{ c.cpu_percent }}% / {{ formatBytes(c.mem_usage_bytes) }}</td>
                    <td>
                      <span class="m3-badge" [ngClass]="c.status === 'running' ? 'success' : 'neutral'">
                        {{ c.status }}
                      </span>
                    </td>
                    <td>
                      <button *ngIf="c.status !== 'running'" mat-button color="primary" (click)="startContainer(c)">启动</button>
                      <button *ngIf="c.status === 'running'" mat-button (click)="stopContainer(c)">停止</button>
                      <button mat-button (click)="openLogs(c)">日志</button>
                      <button mat-button color="warn" (click)="deleteContainer(c)">删除</button>
                    </td>
                  </tr>
                  <tr *ngIf="containers().length === 0">
                    <td colspan="6" class="m3-empty-state">暂无 Docker 容器实例。</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </mat-tab>

        <!-- Tab 2: Images -->
        <mat-tab [label]="'本地镜像 (' + images().length + ')'">
          <div class="m3-card" style="margin-top: 14px">
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
                  <tr *ngFor="let img of images()">
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
                      <button mat-button color="warn" (click)="deleteImage(img)">删除</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </mat-tab>
      </mat-tab-group>

      <!-- Create Container Modal -->
      <div *ngIf="showCreateModal()" class="m3-modal-backdrop" (click)="showCreateModal.set(false)">
        <div class="m3-modal-dialog" (click)="$event.stopPropagation()">
          <div class="m3-modal-header">
            <h3>创建 Docker 容器</h3>
            <button mat-icon-button (click)="showCreateModal.set(false)">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <div class="m3-modal-body font-mono">
            <div class="m3-grid-2">
              <div class="m3-field">
                <label>容器名称</label>
                <input type="text" [(ngModel)]="createForm.name" placeholder="armguard-redis" />
              </div>
              <div class="m3-field">
                <label>镜像名称:Tag</label>
                <input type="text" [(ngModel)]="createForm.image" placeholder="redis:alpine" />
              </div>
              <div class="m3-field">
                <label>宿主机端口</label>
                <input type="number" [(ngModel)]="hostPort" placeholder="6379" />
              </div>
              <div class="m3-field">
                <label>容器内部端口</label>
                <input type="number" [(ngModel)]="containerPort" placeholder="6379" />
              </div>
            </div>
          </div>
          <div class="m3-modal-footer">
            <button mat-stroked-button (click)="showCreateModal.set(false)">取消</button>
            <button mat-flat-button color="primary" (click)="handleCreateContainer()">立即创建</button>
          </div>
        </div>
      </div>

      <!-- Container Logs Modal -->
      <div *ngIf="logModalOpen()" class="m3-modal-backdrop" (click)="logModalOpen.set(false)">
        <div class="m3-modal-dialog lg" (click)="$event.stopPropagation()">
          <div class="m3-modal-header">
            <h3>容器实时日志</h3>
            <button mat-icon-button (click)="logModalOpen.set(false)">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <div class="m3-modal-body">
            <pre class="m3-code-console">{{ containerLogs().join('\n') || '暂无日志' }}</pre>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class DockerComponent implements OnInit {
  private toast = inject(ToastService)
  readonly containers = signal<DockerContainer[]>([])
  readonly images = signal<DockerImage[]>([])
  readonly manifestResult = signal<ManifestInspectResult | null>(null)
  readonly showCreateModal = signal(false)
  readonly logModalOpen = signal(false)
  readonly containerLogs = signal<string[]>([])

  pullImageName = 'nginx'
  pullImageTag = 'alpine'
  hostPort = 8080
  containerPort = 80

  createForm: CreateContainerParams = {
    name: '',
    image: 'nginx:alpine',
    ports: [],
    volumes: [],
    environments: [],
    restart_policy: 'unless-stopped',
  }

  ngOnInit() {
    this.loadAll()
  }

  async loadAll() {
    try {
      const [cRes, iRes] = await Promise.all([dockerApi.getContainers(), dockerApi.getImages()])
      this.containers.set(cRes.data?.data?.list || [])
      this.images.set(iRes.data?.data?.list || [])
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async handleInspectManifest() {
    try {
      const res = await dockerApi.inspectManifest(this.pullImageName, this.pullImageTag)
      this.manifestResult.set(res.data?.data || null)
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async handlePullImage() {
    try {
      await dockerApi.pullImage(this.pullImageName, this.pullImageTag)
      this.toast.success(`镜像 ${this.pullImageName}:${this.pullImageTag} 已提交拉取`)
      this.loadAll()
    } catch (e: any) {
      this.toast.error(e.message)
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
    try {
      await dockerApi.stopContainer(c.id)
      this.toast.info(`容器 ${c.name} 已停止`)
      this.loadAll()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async openLogs(c: DockerContainer) {
    try {
      const res = await dockerApi.getContainerLogs(c.id, 200)
      this.containerLogs.set(res.data?.data?.logs || [])
      this.logModalOpen.set(true)
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async deleteContainer(c: DockerContainer) {
    if (!confirm(`确定删除容器 ${c.name} 吗？`)) return
    try {
      await dockerApi.deleteContainer(c.id, true)
      this.toast.success('容器已删除')
      this.loadAll()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async deleteImage(img: DockerImage) {
    if (!confirm(`确定删除镜像 ${img.repository}:${img.tag} 吗？`)) return
    try {
      await dockerApi.deleteImage(img.id, true)
      this.toast.success('镜像已删除')
      this.loadAll()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async handleCreateContainer() {
    const payload: CreateContainerParams = {
      ...this.createForm,
      ports: this.hostPort
        ? [{ host_port: this.hostPort, container_port: this.containerPort, protocol: 'tcp' }]
        : [],
    }
    try {
      await dockerApi.createContainer(payload)
      this.toast.success('容器创建成功')
      this.showCreateModal.set(false)
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
