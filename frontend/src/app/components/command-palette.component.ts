import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  computed,
  effect,
  signal,
  ElementRef,
  ViewChild,
} from '@angular/core'
import { AgMaterialModule } from '../core/material.module'

export interface AgPaletteEntry {
  label: string
  path: string
  icon: string
  group: string
  keywords?: string
}

type PaletteAction = { kind: 'nav'; entry: AgPaletteEntry } | { kind: 'action'; id: string; label: string; icon: string; hint?: string }

/**
 * 命令面板（Ctrl / Cmd + K）。
 * 纯键盘可操作：↑ ↓ 移动，Enter 执行，Esc 关闭。
 * 不依赖任何外部库，也不做异步搜索——导航项是本地静态数据，过滤是同步的。
 */
@Component({
  selector: 'ag-command-palette',
  standalone: true,
  imports: [AgMaterialModule],
  template: `
    <div *ngIf="open" class="palette-backdrop" (click)="requestClose()">
      <div
        class="palette-panel"
        role="dialog"
        aria-modal="true"
        aria-label="命令面板"
        (click)="$event.stopPropagation()"
      >
        <div class="palette-input-row">
          <mat-icon class="search-icon" aria-hidden="true">search</mat-icon>
          <input
            #searchInput
            type="text"
            class="palette-input"
            [ngModel]="query()"
            (ngModelChange)="onQueryChange($event)"
            (keydown)="onKeydown($event)"
            placeholder="搜索页面、功能或执行命令…"
            aria-label="搜索页面或命令"
            autocomplete="off"
            spellcheck="false"
          />
          <kbd class="palette-esc">ESC</kbd>
        </div>

        <div class="palette-list" role="listbox">
          <div *ngIf="items().length === 0" class="palette-empty">
            没有匹配「{{ query() }}」的页面或命令
          </div>

          <ng-container *ngFor="let item of items(); let i = index">
            <div *ngIf="item.kind === 'nav' && showGroupHeader(i)" class="palette-group-label">
              {{ asNav(item).entry.group }}
            </div>
            <button
              type="button"
              class="palette-item"
              role="option"
              [attr.aria-selected]="i === activeIndex()"
              [class.active]="i === activeIndex()"
              (mouseenter)="activeIndex.set(i)"
              (click)="run(item)"
            >
              <mat-icon class="item-icon" aria-hidden="true">{{ itemIcon(item) }}</mat-icon>
              <span class="item-label">{{ itemLabel(item) }}</span>
              <span *ngIf="item.kind === 'nav'" class="item-path font-mono">{{ asNav(item).entry.path }}</span>
              <span *ngIf="item.kind === 'action'" class="item-hint font-mono">{{ item.hint }}</span>
            </button>
          </ng-container>
        </div>

        <div class="palette-footer font-mono">
          <span><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
          <span><kbd>↵</kbd> 打开</span>
          <span><kbd>ESC</kbd> 关闭</span>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .palette-backdrop {
        position: fixed;
        inset: 0;
        z-index: 1200;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding: 12vh 16px 16px;
        background: rgba(4, 5, 8, 0.62);
        backdrop-filter: blur(6px);
        animation: paletteFade 120ms ease;
      }
      @keyframes paletteFade {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
      .palette-panel {
        width: 100%;
        max-width: 580px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        background: var(--ag-surface-low);
        border: 1px solid var(--ag-outline-strong);
        border-radius: 14px;
        box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6);
        animation: paletteIn 160ms cubic-bezier(0.22, 0.61, 0.36, 1);
      }
      @keyframes paletteIn {
        from {
          opacity: 0;
          transform: translateY(-8px) scale(0.99);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      .palette-input-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 14px 16px;
        border-bottom: 1px solid var(--ag-outline-variant);
      }
      .search-icon {
        font-size: 19px;
        width: 19px;
        height: 19px;
        color: var(--ag-on-surface-variant);
      }
      .palette-input {
        flex: 1;
        min-width: 0;
        border: none;
        background: transparent;
        color: var(--ag-on-surface);
        font-family: inherit;
        font-size: 0.9375rem;
        outline: none;
      }
      .palette-input::placeholder {
        color: var(--ag-on-surface-variant);
      }
      .palette-esc,
      .palette-footer kbd {
        padding: 1px 5px;
        border-radius: 4px;
        border: 1px solid var(--ag-outline);
        background: var(--ag-surface);
        color: var(--ag-on-surface-variant);
        font-family: var(--ag-font-mono);
        font-size: 0.64rem;
        line-height: 1.5;
      }
      .palette-list {
        max-height: 52vh;
        overflow-y: auto;
        padding: 8px;
      }
      .palette-group-label {
        padding: 8px 10px 4px;
        font-size: 0.66rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--ag-on-surface-variant);
      }
      .palette-item {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 8px 10px;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: var(--ag-on-surface);
        font-family: inherit;
        font-size: 0.84rem;
        text-align: left;
        cursor: pointer;
      }
      .palette-item.active {
        background: var(--ag-primary-container);
        color: var(--ag-on-primary-container);
      }
      .item-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        color: var(--ag-on-surface-variant);
      }
      .palette-item.active .item-icon {
        color: var(--ag-primary);
      }
      .item-label {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-weight: 500;
      }
      .item-path,
      .item-hint {
        font-size: 0.68rem;
        color: var(--ag-on-surface-variant);
      }
      .palette-empty {
        padding: 28px 12px;
        text-align: center;
        font-size: 0.82rem;
        color: var(--ag-on-surface-variant);
      }
      .palette-footer {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 8px 14px;
        border-top: 1px solid var(--ag-outline-variant);
        background: var(--ag-surface);
        font-size: 0.66rem;
        color: var(--ag-on-surface-variant);
      }
      .palette-footer kbd {
        margin-right: 3px;
      }
    `,
  ],
})
export class AgCommandPaletteComponent implements OnChanges {
  @Input() open = false
  @Input() entries: AgPaletteEntry[] = []
  @Input() extraActions: Array<{ id: string; label: string; icon: string; hint?: string }> = []

  @Output() closed = new EventEmitter<void>()
  @Output() navigate = new EventEmitter<string>()
  @Output() action = new EventEmitter<string>()

  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>

  readonly query = signal('')
  readonly activeIndex = signal(0)

  readonly items = computed<PaletteAction[]>(() => {
    const q = this.query().trim().toLowerCase()
    const nav: PaletteAction[] = this.entries
      .filter((e) => {
        if (!q) return true
        return (
          e.label.toLowerCase().includes(q) ||
          e.path.toLowerCase().includes(q) ||
          e.group.toLowerCase().includes(q) ||
          (e.keywords || '').toLowerCase().includes(q)
        )
      })
      .map((entry) => ({ kind: 'nav' as const, entry }))

    const actions: PaletteAction[] = this.extraActions
      .filter((a) => !q || a.label.toLowerCase().includes(q))
      .map((a) => ({ kind: 'action' as const, id: a.id, label: a.label, icon: a.icon, hint: a.hint }))

    return [...nav, ...actions]
  })

  constructor() {
    effect(() => {
      // 打开时清空搜索、聚焦输入框
      if (this.open) {
        this.query.set('')
        this.activeIndex.set(0)
        setTimeout(() => this.searchInput?.nativeElement?.focus(), 30)
      }
    })
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['open'] && !this.open) {
      this.query.set('')
    }
  }

  asNav(item: PaletteAction): Extract<PaletteAction, { kind: 'nav' }> {
    return item as Extract<PaletteAction, { kind: 'nav' }>
  }

  itemIcon(item: PaletteAction): string {
    return item.kind === 'nav' ? item.entry.icon : item.icon
  }

  itemLabel(item: PaletteAction): string {
    return item.kind === 'nav' ? item.entry.label : item.label
  }

  showGroupHeader(index: number): boolean {
    const list = this.items()
    const current = list[index]
    if (!current || current.kind !== 'nav') return false
    for (let i = index - 1; i >= 0; i--) {
      const prev = list[i]
      if (prev.kind === 'nav') return prev.entry.group !== current.entry.group
    }
    return true
  }

  onQueryChange(value: string) {
    this.query.set(value)
    this.activeIndex.set(0)
  }

  onKeydown(event: KeyboardEvent) {
    const list = this.items()
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!list.length) return
      this.activeIndex.set((this.activeIndex() + 1) % list.length)
      this.scrollActiveIntoView()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!list.length) return
      this.activeIndex.set((this.activeIndex() - 1 + list.length) % list.length)
      this.scrollActiveIntoView()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const item = list[this.activeIndex()]
      if (item) this.run(item)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      this.requestClose()
    }
  }

  run(item: PaletteAction) {
    if (item.kind === 'nav') {
      this.navigate.emit(item.entry.path)
    } else {
      this.action.emit(item.id)
    }
    this.requestClose()
  }

  requestClose() {
    this.closed.emit()
  }

  private scrollActiveIntoView() {
    setTimeout(() => {
      const el = document.querySelector('.palette-item.active') as HTMLElement | null
      el?.scrollIntoView({ block: 'nearest' })
    }, 0)
  }
}
