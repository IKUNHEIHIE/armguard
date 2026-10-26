import { Component, effect, inject, signal } from '@angular/core'
import { AgMaterialModule } from '../core/material.module'
import { ConfirmService } from '../core/confirm.service'
import { AgModalComponent } from './ag-modal.component'

@Component({
  selector: 'ag-confirm-dialog',
  standalone: true,
  imports: [AgMaterialModule, AgModalComponent],
  template: `
    <ag-modal
      [open]="!!confirm.activeOptions()"
      [title]="confirm.activeOptions()?.title || '确认操作'"
      [icon]="iconName()"
      [iconColor]="iconColor()"
      [badge]="badgeText()"
      [badgeClass]="badgeClass()"
      size="md"
      (close)="onCancel()"
    >
      <div *ngIf="confirm.activeOptions() as opts" class="confirm-content">
        <div *ngIf="opts.resourceName" class="resource-chip font-mono">
          <span class="chip-label">操作目标:</span>
          <strong>{{ opts.resourceName }}</strong>
        </div>

        <p class="confirm-msg">{{ opts.message }}</p>

        <div *ngIf="opts.impact" class="impact-card" [ngClass]="'tone-' + (opts.tone || 'danger')">
          <mat-icon class="impact-icon">info_outline</mat-icon>
          <div>
            <strong>影响范围与恢复说明</strong>
            <div class="impact-text">{{ opts.impact }}</div>
          </div>
        </div>

        <div *ngIf="opts.checkboxLabel" class="checkbox-row">
          <mat-checkbox [(ngModel)]="checkboxValue" color="warn">
            {{ opts.checkboxLabel }}
          </mat-checkbox>
        </div>

        <div *ngIf="opts.requireMatchText" class="m3-field font-mono">
          <label for="ag-confirm-match-input">
            高风险操作确认：请输入 <strong>{{ opts.requireMatchText }}</strong> 以继续
          </label>
          <input
            id="ag-confirm-match-input"
            type="text"
            [(ngModel)]="matchInput"
            [placeholder]="opts.requireMatchText"
            autocomplete="off"
          />
        </div>
      </div>

      <ng-container modal-footer>
        <button type="button" mat-stroked-button (click)="onCancel()">
          {{ confirm.activeOptions()?.cancelText || '取消' }}
        </button>
        <button
          type="button"
          mat-flat-button
          [color]="confirm.activeOptions()?.tone === 'primary' ? 'primary' : 'warn'"
          [disabled]="!canConfirm()"
          (click)="onConfirm()"
        >
          {{ confirm.activeOptions()?.confirmText || '确认执行' }}
        </button>
      </ng-container>
    </ag-modal>
  `,
  styles: [
    `
      .confirm-content {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .resource-chip {
        display: inline-flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        padding: 8px 14px;
        border-radius: 12px;
        background: var(--ag-surface);
        border: 1px solid var(--ag-outline-variant);
        font-size: 0.82rem;
      }
      .chip-label {
        color: var(--ag-on-surface-variant);
      }
      .confirm-msg {
        margin: 0;
        font-size: 0.9rem;
        line-height: 1.55;
        color: var(--ag-on-surface);
      }
      .impact-card {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 12px 14px;
        border-radius: 14px;
        font-size: 0.8rem;
        line-height: 1.5;
        background: var(--ag-danger-container);
        border: 1px solid var(--ag-danger);
        color: var(--ag-on-surface);
      }
      .impact-card.tone-warning {
        background: var(--ag-warning-container);
        border-color: var(--ag-warning);
      }
      .impact-card.tone-primary {
        background: var(--ag-surface);
        border-color: var(--ag-outline-variant);
      }
      .impact-icon {
        color: var(--ag-danger);
        flex-shrink: 0;
        margin-top: 2px;
      }
      .impact-card.tone-warning .impact-icon {
        color: var(--ag-warning);
      }
      .impact-card.tone-primary .impact-icon {
        color: var(--ag-primary);
      }
      .impact-text {
        margin-top: 2px;
        color: var(--ag-on-surface-variant);
      }
      .checkbox-row {
        padding: 4px 0;
        font-size: 0.84rem;
      }
    `,
  ],
})
export class AgConfirmDialogComponent {
  readonly confirm = inject(ConfirmService)
  checkboxValue = false
  matchInput = ''

  readonly iconName = signal('warning_amber')

  constructor() {
    effect(() => {
      const opts = this.confirm.activeOptions()
      if (opts) {
        this.checkboxValue = Boolean(opts.checkboxDefault)
        this.matchInput = ''
        this.iconName.set(
          opts.tone === 'primary'
            ? 'help_outline'
            : opts.tone === 'warning'
              ? 'warning_amber'
              : 'gpp_maybe'
        )
      }
    })
  }

  iconColor(): string {
    const tone = this.confirm.activeOptions()?.tone
    if (tone === 'primary') return 'var(--ag-primary)'
    if (tone === 'warning') return 'var(--ag-warning)'
    return 'var(--ag-danger)'
  }

  badgeText(): string {
    const tone = this.confirm.activeOptions()?.tone
    if (tone === 'primary') return '操作确认'
    if (tone === 'warning') return '谨慎操作'
    return '高风险操作'
  }

  badgeClass(): string {
    const tone = this.confirm.activeOptions()?.tone
    if (tone === 'primary') return 'primary'
    if (tone === 'warning') return 'warning'
    return 'danger'
  }

  canConfirm(): boolean {
    const opts = this.confirm.activeOptions()
    if (!opts) return false
    if (opts.requireMatchText && this.matchInput.trim() !== opts.requireMatchText) {
      return false
    }
    return true
  }

  onCancel() {
    this.confirm.resolve(false, false)
  }

  onConfirm() {
    if (!this.canConfirm()) return
    this.confirm.resolve(true, this.checkboxValue)
  }
}
