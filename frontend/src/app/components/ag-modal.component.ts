import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  signal,
} from '@angular/core'
import { AgMaterialModule } from '../core/material.module'

let modalSeq = 0

@Component({
  selector: 'ag-modal',
  standalone: true,
  imports: [AgMaterialModule],
  template: `
    <div
      *ngIf="open"
      class="m3-modal-backdrop"
      (click)="onBackdropClick()"
    >
      <div
        class="m3-modal-dialog"
        [ngClass]="size"
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="titleId"
        cdkTrapFocus
        [cdkTrapFocusAutoCapture]="true"
        (click)="$event.stopPropagation()"
      >
        <div class="m3-modal-header">
          <h3 [id]="titleId">
            <mat-icon *ngIf="icon" [style.color]="iconColor">{{ icon }}</mat-icon>
            <span>{{ title }}</span>
            <span *ngIf="badge" class="m3-badge" [ngClass]="badgeClass">{{ badge }}</span>
            <span *ngIf="dirty" class="m3-badge warning">● 未保存修改</span>
          </h3>
          <button
            type="button"
            mat-icon-button
            [disabled]="submitting"
            aria-label="关闭对话框"
            matTooltip="关闭 (Esc)"
            (click)="requestClose()"
          >
            <mat-icon>close</mat-icon>
          </button>
        </div>

        <!-- Dirty Discard Confirmation Strip (FE-003) -->
        <div
          *ngIf="confirmingDiscard()"
          class="discard-guard-bar font-mono"
          role="alert"
          aria-live="assertive"
        >
          <div class="discard-text">
            <mat-icon>warning_amber</mat-icon>
            <span>检测到尚未保存的输入内容，关闭对话框将丢失当前修改。</span>
          </div>
          <div class="discard-actions">
            <button
              type="button"
              mat-stroked-button
              (click)="confirmingDiscard.set(false)"
            >
              继续编辑
            </button>
            <button
              type="button"
              mat-flat-button
              color="warn"
              (click)="forceClose()"
            >
              放弃修改并关闭
            </button>
          </div>
        </div>

        <div class="m3-modal-body">
          <ng-content></ng-content>
        </div>

        <div *ngIf="showFooter" class="m3-modal-footer">
          <ng-content select="[modal-footer]"></ng-content>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .discard-guard-bar {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 24px;
        background: var(--ag-warning-container);
        border-bottom: 1px solid var(--ag-warning);
        color: var(--ag-on-surface);
        font-size: 0.8rem;
      }
      .discard-text {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--ag-warning);
        font-weight: 600;
      }
      .discard-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }
    `,
  ],
})
export class AgModalComponent implements OnChanges, OnDestroy {
  @Input() open = false
  @Input() title = ''
  @Input() icon = ''
  @Input() iconColor = 'var(--ag-primary)'
  @Input() badge = ''
  @Input() badgeClass = 'neutral'
  @Input() size: 'md' | 'lg' | 'xl' = 'md'
  @Input() dirty = false
  @Input() submitting = false
  @Input() showFooter = true

  @Output() close = new EventEmitter<void>()

  readonly titleId = `ag-modal-title-${++modalSeq}`
  readonly confirmingDiscard = signal(false)
  private triggerElement: HTMLElement | null = null

  ngOnChanges(changes: SimpleChanges) {
    if (changes['open']) {
      if (this.open) {
        this.confirmingDiscard.set(false)
        if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
          this.triggerElement = document.activeElement
        }
      } else {
        this.confirmingDiscard.set(false)
        this.restoreFocus()
      }
    }
  }

  ngOnDestroy() {
    if (this.open) {
      this.restoreFocus()
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: Event) {
    if (!this.open) return
    event.preventDefault()
    event.stopPropagation()
    this.requestClose()
  }

  onBackdropClick() {
    this.requestClose()
  }

  requestClose() {
    if (this.submitting) return
    if (this.dirty && !this.confirmingDiscard()) {
      this.confirmingDiscard.set(true)
      return
    }
    this.forceClose()
  }

  forceClose() {
    this.confirmingDiscard.set(false)
    this.close.emit()
  }

  private restoreFocus() {
    const el = this.triggerElement
    this.triggerElement = null
    if (el && typeof el.focus === 'function') {
      setTimeout(() => {
        try {
          el.focus()
        } catch {}
      }, 0)
    }
  }
}
