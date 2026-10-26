import { Component, OnInit, computed, inject, signal } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { AgMaterialModule } from '../../core/material.module'
import { ToastService } from '../../core/toast.service'
import { ConfirmService } from '../../core/confirm.service'
import { AgStateBannerComponent } from '../../components/ag-state-banner.component'
import { AgModalComponent } from '../../components/ag-modal.component'
import { crontabApi, CronJobItem } from '@/api/crontab'

@Component({
  selector: 'ag-crontab',
  standalone: true,
  imports: [AgMaterialModule, AgStateBannerComponent, AgModalComponent],
  template: `
    <div class="m3-page">
      <div class="m3-page-header">
        <div>
          <h2 class="m3-page-title">
            <mat-icon style="color: var(--ag-primary)">schedule</mat-icon>
            <span>系统计划任务编排 (Crontab Scheduler)</span>
          </h2>
          <p class="m3-page-subtitle font-mono">
            自动化 Shell 脚本、数据库定时备份、ACME 证书续签与执行日志追踪
          </p>
        </div>
        <div class="m3-page-actions">
          <button mat-stroked-button (click)="loadJobs()" [disabled]="loading()">
            <mat-icon>refresh</mat-icon>
            <span>刷新</span>
          </button>
          <button mat-flat-button color="primary" (click)="openCreate()">
            <mat-icon>add_alarm</mat-icon>
            <span>新建计划任务</span>
          </button>
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
            placeholder="搜索任务名称、Cron 表达式或执行命令..."
            aria-label="搜索计划任务"
          />
        </div>
      </div>

      <!-- State Banners (FE-001) -->
      <ag-state-banner
        *ngIf="loading() && jobs().length === 0"
        state="loading"
        title="正在加载计划任务列表..."
      />

      <ag-state-banner
        *ngIf="loadError()"
        state="error"
        title="计划任务加载失败"
        [description]="loadError()!"
        primaryActionLabel="重试刷新"
        (primaryAction)="loadJobs()"
      />

      <!-- Table Card -->
      <div class="m3-card" *ngIf="!loadError()">
        <div class="m3-table-wrap font-mono">
          <table class="m3-data-table" aria-label="系统计划任务列表">
            <thead>
              <tr>
                <th>任务名称 ({{ filteredJobs().length }}/{{ jobs().length }})</th>
                <th>Cron 表达式</th>
                <th>执行脚本 / 命令</th>
                <th>上次执行时间</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let job of filteredJobs()">
                <td><strong>{{ job.name }}</strong></td>
                <td><span class="m3-badge primary">{{ job.schedule }}</span></td>
                <td><code style="max-width: 280px; display: inline-block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">{{ job.command }}</code></td>
                <td>{{ job.last_run_at || '尚未执行' }}</td>
                <td>
                  <span class="m3-badge" [ngClass]="job.status === 'enabled' ? 'success' : 'neutral'">
                    {{ job.status === 'enabled' ? '启用中' : '已暂停' }}
                  </span>
                </td>
                <td>
                  <button mat-button color="primary" (click)="runNow(job)">立即执行</button>
                  <button mat-button (click)="openEdit(job)">编辑</button>
                  <button mat-button color="warn" (click)="confirmDeleteJob(job)">删除</button>
                </td>
              </tr>
              <tr *ngIf="filteredJobs().length === 0 && !loading()">
                <td colspan="6" class="m3-empty-state">
                  {{ searchQuery() ? '未检索到匹配的计划任务。' : '暂无计划任务，点击右上角「新建计划任务」创建。' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Create / Edit Modal (FE-002, FE-004) -->
      <ag-modal
        [open]="showModal()"
        [title]="editingId ? '编辑计划任务' : '新建计划任务'"
        icon="schedule"
        size="lg"
        [submitting]="submitting()"
        (closed)="showModal.set(false)"
      >
        <div class="font-mono" style="display: flex; flex-direction: column; gap: 14px">
          <div class="m3-field" [class.has-error]="!!nameError()">
            <label for="crontab-name">任务名称 <span class="m3-req">*</span></label>
            <input
              id="crontab-name"
              type="text"
              [(ngModel)]="form.name"
              (ngModelChange)="nameError.set('')"
              placeholder="每日凌晨清理日志"
            />
            <div *ngIf="nameError()" class="m3-field-error" role="alert">{{ nameError() }}</div>
          </div>
          <div class="m3-field" [class.has-error]="!!scheduleError()">
            <label for="crontab-schedule">Cron 表达式 (分 时 日 月 周) <span class="m3-req">*</span></label>
            <input
              id="crontab-schedule"
              type="text"
              [(ngModel)]="form.schedule"
              (ngModelChange)="scheduleError.set('')"
              placeholder="0 3 * * *"
            />
            <div *ngIf="scheduleError()" class="m3-field-error" role="alert">{{ scheduleError() }}</div>
          </div>
          <div class="m3-field" [class.has-error]="!!commandError()">
            <label for="crontab-command">Shell 命令 <span class="m3-req">*</span></label>
            <textarea
              id="crontab-command"
              rows="4"
              [(ngModel)]="form.command"
              (ngModelChange)="commandError.set('')"
              placeholder="/usr/bin/find /var/log -name '*.gz' -delete"
            ></textarea>
            <div *ngIf="commandError()" class="m3-field-error" role="alert">{{ commandError() }}</div>
          </div>
        </div>
        <div modal-footer>
          <button mat-stroked-button (click)="showModal.set(false)" [disabled]="submitting()">取消</button>
          <button mat-flat-button color="primary" [disabled]="submitting()" (click)="submit()">
            {{ submitting() ? '正在保存同步...' : '保存并同步 Crontab' }}
          </button>
        </div>
      </ag-modal>

      <!-- Run Output Modal (FE-002) -->
      <ag-modal
        [open]="!!runOutput()"
        title="任务即时执行输出"
        icon="terminal"
        size="lg"
        (closed)="runOutput.set('')"
      >
        <div class="font-mono">
          <pre class="m3-code-console" style="max-height: 400px; overflow: auto">{{ runOutput() }}</pre>
        </div>
        <div modal-footer>
          <button mat-stroked-button (click)="runOutput.set('')">关闭</button>
        </div>
      </ag-modal>
    </div>
  `,
})
export class CrontabComponent implements OnInit {
  private toast = inject(ToastService)
  private confirmSvc = inject(ConfirmService)
  private route = inject(ActivatedRoute)
  private router = inject(Router)

  readonly jobs = signal<CronJobItem[]>([])
  readonly loading = signal(false)
  readonly loadError = signal<string | null>(null)
  readonly submitting = signal(false)

  readonly searchQuery = signal('')
  readonly showModal = signal(false)
  readonly runOutput = signal('')
  editingId: number | null = null

  readonly nameError = signal('')
  readonly scheduleError = signal('')
  readonly commandError = signal('')

  form = {
    name: '',
    schedule: '0 3 * * *',
    command: '',
  }

  readonly filteredJobs = computed(() => {
    const q = this.searchQuery().trim().toLowerCase()
    return this.jobs().filter((j) => {
      if (!q) return true
      const text = `${j.name} ${j.schedule} ${j.command}`.toLowerCase()
      return text.includes(q)
    })
  })

  ngOnInit() {
    const qp = this.route.snapshot.queryParamMap
    if (qp.get('q')) this.searchQuery.set(qp.get('q')!)
    this.loadJobs()
  }

  onSearchChange(q: string) {
    this.searchQuery.set(q)
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: q.trim() || null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    })
  }

  async loadJobs() {
    this.loading.set(true)
    this.loadError.set(null)
    try {
      const res = await crontabApi.getList()
      this.jobs.set(res.data?.data?.list || [])
    } catch (e: any) {
      const msg = e.message || '加载计划任务失败'
      this.loadError.set(msg)
      this.toast.error(msg)
    } finally {
      this.loading.set(false)
    }
  }

  openCreate() {
    this.editingId = null
    this.form = { name: '', schedule: '0 3 * * *', command: '' }
    this.clearErrors()
    this.showModal.set(true)
  }

  openEdit(job: CronJobItem) {
    this.editingId = job.id
    this.form = { name: job.name, schedule: job.schedule, command: job.command }
    this.clearErrors()
    this.showModal.set(true)
  }

  private clearErrors() {
    this.nameError.set('')
    this.scheduleError.set('')
    this.commandError.set('')
  }

  async submit() {
    let valid = true
    if (!this.form.name.trim()) {
      this.nameError.set('请输入任务名称')
      valid = false
    }
    if (!this.form.schedule.trim()) {
      this.scheduleError.set('请输入 Cron 调度表达式')
      valid = false
    }
    if (!this.form.command.trim()) {
      this.commandError.set('请输入待执行的 Shell 命令或脚本路径')
      valid = false
    }
    if (!valid) return

    this.submitting.set(true)
    try {
      if (this.editingId) {
        await crontabApi.update(this.editingId, this.form)
        this.toast.success('计划任务已更新')
      } else {
        await crontabApi.create(this.form)
        this.toast.success('计划任务创建成功')
      }
      this.showModal.set(false)
      this.loadJobs()
    } catch (e: any) {
      this.toast.error(e.message)
    } finally {
      this.submitting.set(false)
    }
  }

  async runNow(job: CronJobItem) {
    try {
      const res = await crontabApi.runOnce(job.id)
      this.runOutput.set(res.data?.data?.output || '(命令执行完成，无标准输出)')
      this.toast.success(`任务 ${job.name} 执行完毕`)
      this.loadJobs()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async confirmDeleteJob(job: CronJobItem) {
    const res = await this.confirmSvc.ask({
      title: '删除计划任务确认',
      resourceName: `${job.name} (${job.schedule})`,
      message: `确定要删除计划任务 “${job.name}” 吗？`,
      impact: '该任务将从系统 Crontab 表中注销，不再周期性自动执行。',
      confirmText: '确认删除',
      severity: 'danger',
    })
    if (!res.confirmed) return

    try {
      await crontabApi.delete(job.id)
      this.toast.success('计划任务已删除')
      this.loadJobs()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }
}
