import { Component, EventEmitter, Input, Output } from '@angular/core'
import { AgMaterialModule } from '../core/material.module'

export type AgPageStateType =
  | 'loading'
  | 'empty'
  | 'forbidden'
  | 'missing_dep'
  | 'error'
  | 'partial_error'

@Component({
  selector: 'ag-state-banner',
  standalone: true,
  imports: [AgMaterialModule],
  template: `
    <!-- 1. Compact Partial Failure / Stale Data Banner (shown above retained data) -->
    <div
      *ngIf="state === 'partial_error'"
      class="ag-state-strip"
      role="alert"
      aria-live="polite"
    >
      <div class="strip-left">
        <mat-icon class="strip-icon">sync_problem</mat-icon>
        <div>
          <strong>{{ title || '数据刷新失败，当前展示上次缓存内容' }}</strong>
          <div class="strip-desc font-mono">
            <span>{{ description }}</span>
            <span *ngIf="lastUpdated"> · 上次成功更新: {{ lastUpdated }}</span>
          </div>
        </div>
      </div>
      <div class="strip-actions">
        <button *ngIf="actionLabel" mat-stroked-button color="primary" (click)="action.emit()">
          <mat-icon>refresh</mat-icon>
          <span>{{ actionLabel }}</span>
        </button>
        <button
          *ngIf="secondaryActionLabel"
          mat-button
          (click)="secondaryAction.emit()"
        >
          {{ secondaryActionLabel }}
        </button>
      </div>
    </div>

    <!-- 2. Full State Card (loading / empty / forbidden / missing_dep / error) -->
    <div
      *ngIf="state !== 'partial_error'"
      class="ag-state-card"
      [ngClass]="'tone-' + state"
      [attr.role]="state === 'error' || state === 'forbidden' ? 'alert' : 'status'"
      aria-live="polite"
    >
      <div class="state-icon-ring">
        <mat-progress-spinner
          *ngIf="state === 'loading'"
          mode="indeterminate"
          diameter="28"
        ></mat-progress-spinner>
        <mat-icon *ngIf="state !== 'loading'">{{ resolvedIcon }}</mat-icon>
      </div>

      <div class="state-body">
        <div class="state-title-row">
          <h4 class="state-title">{{ resolvedTitle }}</h4>
          <span class="m3-badge" [ngClass]="badgeClass">{{ badgeLabel }}</span>
        </div>
        <p *ngIf="description" class="state-desc">{{ description }}</p>
        <div *ngIf="lastUpdated" class="state-meta font-mono">
          上次成功更新: {{ lastUpdated }}
        </div>
      </div>

      <div *ngIf="actionLabel || secondaryActionLabel" class="state-actions">
        <button
          *ngIf="secondaryActionLabel"
          mat-stroked-button
          (click)="secondaryAction.emit()"
        >
          {{ secondaryActionLabel }}
        </button>
        <button
          *ngIf="actionLabel"
          mat-flat-button
          color="primary"
          (click)="action.emit()"
        >
          <mat-icon *ngIf="actionIcon">{{ actionIcon }}</mat-icon>
          <span>{{ actionLabel }}</span>
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .ag-state-strip {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 16px;
        border-radius: 16px;
        background: var(--ag-warning-container);
        border: 1px solid var(--ag-warning);
        color: var(--ag-on-surface);
        font-size: 0.82rem;
        margin-bottom: 12px;
      }
      .strip-left {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .strip-icon {
        color: var(--ag-warning);
      }
      .strip-desc {
        font-size: 0.74rem;
        color: var(--ag-on-surface-variant);
        margin-top: 2px;
      }
      .strip-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .ag-state-card {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 24px;
        border-radius: 20px;
        background: var(--ag-surface-lowest);
        border: 1px dashed var(--ag-outline);
      }
      .ag-state-card.tone-error,
      .ag-state-card.tone-forbidden {
        border-style: solid;
        border-color: var(--ag-danger);
        background: var(--ag-danger-container);
      }
      .ag-state-card.tone-missing_dep {
        border-style: solid;
        border-color: var(--ag-warning);
        background: var(--ag-warning-container);
      }
      .state-icon-ring {
        width: 48px;
        height: 48px;
        border-radius: 16px;
        background: var(--ag-surface);
        border: 1px solid var(--ag-outline-variant);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        color: var(--ag-primary);
      }
      .tone-error .state-icon-ring,
      .tone-forbidden .state-icon-ring {
        color: var(--ag-danger);
      }
      .tone-missing_dep .state-icon-ring {
        color: var(--ag-warning);
      }
      .state-body {
        flex: 1;
        min-width: 220px;
      }
      .state-title-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
      }
      .state-title {
        margin: 0;
        font-size: 0.95rem;
        font-weight: 700;
        color: var(--ag-on-surface);
      }
      .state-desc {
        margin: 6px 0 0;
        font-size: 0.82rem;
        color: var(--ag-on-surface-variant);
        line-height: 1.5;
      }
      .state-meta {
        margin-top: 6px;
        font-size: 0.72rem;
        color: var(--ag-on-surface-variant);
      }
      .state-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
      }
    `,
  ],
})
export class AgStateBannerComponent {
  @Input() state: AgPageStateType = 'empty'
  @Input() title = ''
  @Input() description = ''
  @Input() icon = ''
  @Input() lastUpdated: string | null = null
  @Input() actionLabel = ''
  @Input() actionIcon = ''
  @Input() secondaryActionLabel = ''

  @Output() action = new EventEmitter<void>()
  @Output() secondaryAction = new EventEmitter<void>()

  get resolvedIcon(): string {
    if (this.icon) return this.icon
    switch (this.state) {
      case 'forbidden':
        return 'gpp_maybe'
      case 'missing_dep':
        return 'extension_off'
      case 'error':
        return 'error_outline'
      case 'empty':
      default:
        return 'inbox'
    }
  }

  get resolvedTitle(): string {
    if (this.title) return this.title
    switch (this.state) {
      case 'loading':
        return '正在加载数据...'
      case 'forbidden':
        return '访问受限或权限不足 (403)'
      case 'missing_dep':
        return '当前环境尚未安装所需运行组件'
      case 'error':
        return '请求加载失败'
      case 'empty':
      default:
        return '暂无数据记录'
    }
  }

  get badgeLabel(): string {
    switch (this.state) {
      case 'loading':
        return '加载中'
      case 'forbidden':
        return '无权限 (403)'
      case 'missing_dep':
        return '缺少依赖组件'
      case 'error':
        return '请求失败'
      case 'empty':
      default:
        return '空列表'
    }
  }

  get badgeClass(): string {
    switch (this.state) {
      case 'forbidden':
      case 'error':
        return 'danger'
      case 'missing_dep':
        return 'warning'
      case 'loading':
        return 'primary'
      default:
        return 'neutral'
    }
  }
}
