import { Component, inject, signal } from '@angular/core'
import { Router } from '@angular/router'
import { AgMaterialModule } from '../core/material.module'
import { TaskCenterService, AgTaskItem } from '../core/task-center.service'
import { AgModalComponent } from './ag-modal.component'

@Component({
  selector: 'ag-task-drawer',
  standalone: true,
  imports: [AgMaterialModule, AgModalComponent],
  template: `
    <ag-modal
      [open]="taskCenter.drawerOpen()"
      title="后台任务与安装进度中心"
      icon="assignment"
      [badge]="taskCenter.activeCount() > 0 ? taskCenter.activeCount() + ' 项进行中' : '空闲'"
      [badgeClass]="taskCenter.activeCount() > 0 ? 'primary' : 'neutral'"
      size="lg"
      (close)="taskCenter.drawerOpen.set(false)"
    >
      <div class="task-list">
        <div *ngIf="taskCenter.tasks().length === 0" class="m3-empty-state">
          当前没有正在运行或历史记录的耗时任务（软件安装、镜像拉取、数据归档备份会在此跨页面持续追踪）。
        </div>

        <div
          *ngFor="let t of taskCenter.tasks()"
          class="m3-tonal-card task-card"
          [class.active]="t.stage === 'installing' || t.stage === 'running'"
        >
          <div class="task-top">
            <div class="task-title-group">
              <mat-icon [style.color]="stageColor(t)">{{ stageIcon(t) }}</mat-icon>
              <div>
                <div class="task-title">{{ t.title }}</div>
                <div class="task-meta font-mono">
                  <span>ID: {{ t.id }}</span>
                  <span> · 耗时: {{ formatDuration(t) }}</span>
                </div>
              </div>
            </div>

            <div class="task-badges">
              <span class="m3-badge" [ngClass]="stageBadgeClass(t)">
                {{ stageLabel(t) }}
              </span>
              <button
                *ngIf="t.logs && t.logs.length > 0"
                type="button"
                mat-button
                (click)="toggleLogs(t.id)"
              >
                {{ expandedTaskId() === t.id ? '收起日志' : '查看日志 (' + t.logs.length + ')' }}
              </button>
              <button
                *ngIf="t.viewRoute && t.stage === 'done'"
                type="button"
                mat-stroked-button
                color="primary"
                (click)="navigateTo(t.viewRoute!)"
              >
                {{ t.viewLabel || '查看资源' }}
              </button>
              <button
                *ngIf="t.stage !== 'installing' && t.stage !== 'running'"
                type="button"
                mat-icon-button
                aria-label="移除此任务记录"
                (click)="taskCenter.removeTask(t.id)"
              >
                <mat-icon>close</mat-icon>
              </button>
            </div>
          </div>

          <mat-progress-bar
            [mode]="t.stage === 'running' ? 'indeterminate' : 'determinate'"
            [value]="t.progressPercent"
          ></mat-progress-bar>

          <div class="task-tail font-mono">
            {{ t.errorMessage || t.logTail || '等待任务输出...' }}
          </div>

          <pre
            *ngIf="expandedTaskId() === t.id && t.logs.length > 0"
            class="m3-code-console task-log-box"
          >{{ t.logs.join('\n') }}</pre>
        </div>
      </div>

      <ng-container modal-footer>
        <button
          *ngIf="taskCenter.tasks().length > taskCenter.activeCount()"
          type="button"
          mat-stroked-button
          (click)="taskCenter.clearFinished()"
        >
          清理已完成记录
        </button>
        <button
          type="button"
          mat-flat-button
          color="primary"
          (click)="taskCenter.drawerOpen.set(false)"
        >
          关闭窗口
        </button>
      </ng-container>
    </ag-modal>
  `,
  styles: [
    `
      .task-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .task-card {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .task-card.active {
        border-color: var(--ag-primary) !important;
      }
      .task-top {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .task-title-group {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .task-title {
        font-weight: 700;
        font-size: 0.9rem;
      }
      .task-meta {
        font-size: 0.72rem;
        color: var(--ag-on-surface-variant);
      }
      .task-badges {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
      }
      .task-tail {
        font-size: 0.75rem;
        color: var(--ag-on-surface-variant);
        word-break: break-all;
      }
      .task-log-box {
        max-height: 200px;
        margin: 0;
        font-size: 0.74rem;
      }
    `,
  ],
})
export class AgTaskDrawerComponent {
  readonly taskCenter = inject(TaskCenterService)
  private router = inject(Router)
  readonly expandedTaskId = signal<string | null>(null)

  toggleLogs(id: string) {
    this.expandedTaskId.set(this.expandedTaskId() === id ? null : id)
  }

  navigateTo(route: string) {
    this.taskCenter.drawerOpen.set(false)
    this.router.navigateByUrl(route)
  }

  stageIcon(t: AgTaskItem): string {
    if (t.stage === 'done') return 'check_circle'
    if (t.stage === 'failed' || t.stage === 'unknown') return 'error_outline'
    return 'downloading'
  }

  stageColor(t: AgTaskItem): string {
    if (t.stage === 'done') return 'var(--ag-success)'
    if (t.stage === 'failed' || t.stage === 'unknown') return 'var(--ag-danger)'
    return 'var(--ag-primary)'
  }

  stageBadgeClass(t: AgTaskItem): string {
    if (t.stage === 'done') return 'success'
    if (t.stage === 'failed' || t.stage === 'unknown') return 'danger'
    return 'primary'
  }

  stageLabel(t: AgTaskItem): string {
    if (t.stage === 'done') return '✓ 已完成'
    if (t.stage === 'failed') return '✕ 执行失败'
    if (t.stage === 'unknown') return '⚠ 状态未知/已中断'
    return `进行中 (${t.progressPercent}%)`
  }

  formatDuration(t: AgTaskItem): string {
    const end = t.finishedAt || Date.now()
    const sec = Math.max(1, Math.round((end - t.startedAt) / 1000))
    if (sec < 60) return `${sec}s`
    return `${Math.floor(sec / 60)}m ${sec % 60}s`
  }
}
