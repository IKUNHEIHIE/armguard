import { Component, OnInit, inject, signal } from '@angular/core'
import { AgMaterialModule } from '../../core/material.module'
import { ToastService } from '../../core/toast.service'
import { crontabApi, CronJobItem } from '@/api/crontab'

@Component({
  selector: 'ag-crontab',
  standalone: true,
  imports: [AgMaterialModule],
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
          <button mat-stroked-button (click)="loadJobs()">
            <mat-icon>refresh</mat-icon>
            <span>刷新</span>
          </button>
          <button mat-flat-button color="primary" (click)="openCreate()">
            <mat-icon>add_alarm</mat-icon>
            <span>新建计划任务</span>
          </button>
        </div>
      </div>

      <div class="m3-card">
        <div class="m3-table-wrap font-mono">
          <table class="m3-data-table">
            <thead>
              <tr>
                <th>任务名称</th>
                <th>Cron 表达式</th>
                <th>执行脚本 / 命令</th>
                <th>上次执行时间</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let job of jobs()">
                <td><strong>{{ job.name }}</strong></td>
                <td><span class="m3-badge primary">{{ job.schedule }}</span></td>
                <td><code>{{ job.command }}</code></td>
                <td>{{ job.last_run_at || '尚未执行' }}</td>
                <td>
                  <span class="m3-badge" [ngClass]="job.status === 'enabled' ? 'success' : 'neutral'">
                    {{ job.status === 'enabled' ? '启用中' : '已暂停' }}
                  </span>
                </td>
                <td>
                  <button mat-button color="primary" (click)="runNow(job)">立即执行</button>
                  <button mat-button (click)="openEdit(job)">编辑</button>
                  <button mat-button color="warn" (click)="deleteJob(job)">删除</button>
                </td>
              </tr>
              <tr *ngIf="jobs().length === 0">
                <td colspan="6" class="m3-empty-state">暂无计划任务，点击右上角「新建计划任务」创建。</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Create / Edit Modal -->
      <div *ngIf="showModal()" class="m3-modal-backdrop" (click)="showModal.set(false)">
        <div class="m3-modal-dialog" (click)="$event.stopPropagation()">
          <div class="m3-modal-header">
            <h3>{{ editingId ? '编辑计划任务' : '新建计划任务' }}</h3>
            <button mat-icon-button (click)="showModal.set(false)">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <div class="m3-modal-body font-mono">
            <div class="m3-field">
              <label>任务名称</label>
              <input type="text" [(ngModel)]="form.name" placeholder="每日凌晨清理日志" />
            </div>
            <div class="m3-field">
              <label>Cron 表达式 (分 时 日 月 周)</label>
              <input type="text" [(ngModel)]="form.schedule" placeholder="0 3 * * *" />
            </div>
            <div class="m3-field">
              <label>Shell 命令</label>
              <textarea rows="4" [(ngModel)]="form.command" placeholder="/usr/bin/find /var/log -name '*.gz' -delete"></textarea>
            </div>
          </div>
          <div class="m3-modal-footer">
            <button mat-stroked-button (click)="showModal.set(false)">取消</button>
            <button mat-flat-button color="primary" (click)="submit()">保存并同步 Crontab</button>
          </div>
        </div>
      </div>

      <!-- Output Modal -->
      <div *ngIf="runOutput()" class="m3-modal-backdrop" (click)="runOutput.set('')">
        <div class="m3-modal-dialog" (click)="$event.stopPropagation()">
          <div class="m3-modal-header">
            <h3>任务即时执行输出</h3>
            <button mat-icon-button (click)="runOutput.set('')">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <div class="m3-modal-body">
            <pre class="m3-code-console">{{ runOutput() }}</pre>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class CrontabComponent implements OnInit {
  private toast = inject(ToastService)
  readonly jobs = signal<CronJobItem[]>([])
  readonly showModal = signal(false)
  readonly runOutput = signal('')
  editingId: number | null = null

  form = {
    name: '',
    schedule: '0 3 * * *',
    command: '',
  }

  ngOnInit() {
    this.loadJobs()
  }

  async loadJobs() {
    try {
      const res = await crontabApi.getList()
      this.jobs.set(res.data?.data?.list || [])
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  openCreate() {
    this.editingId = null
    this.form = { name: '', schedule: '0 3 * * *', command: '' }
    this.showModal.set(true)
  }

  openEdit(job: CronJobItem) {
    this.editingId = job.id
    this.form = { name: job.name, schedule: job.schedule, command: job.command }
    this.showModal.set(true)
  }

  async submit() {
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
    }
  }

  async runNow(job: CronJobItem) {
    try {
      const res = await crontabApi.runOnce(job.id)
      this.runOutput.set(res.data?.data?.output || '(无标准输出)')
      this.toast.success(`任务 ${job.name} 执行完毕`)
      this.loadJobs()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }

  async deleteJob(job: CronJobItem) {
    if (!confirm(`确定删除计划任务 ${job.name} 吗？`)) return
    try {
      await crontabApi.delete(job.id)
      this.toast.success('计划任务已删除')
      this.loadJobs()
    } catch (e: any) {
      this.toast.error(e.message)
    }
  }
}
