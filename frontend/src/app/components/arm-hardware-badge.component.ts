import { Component, computed, inject } from '@angular/core'
import { AgMaterialModule } from '../core/material.module'
import { SystemService } from '../core/system.service'

@Component({
  selector: 'ag-arm-hardware-badge',
  standalone: true,
  imports: [AgMaterialModule],
  template: `
    <button
      type="button"
      mat-stroked-button
      [matMenuTriggerFor]="thermalMenu"
      class="arm-die-pill font-mono"
      [class.warn]="hasAnyWarning()"
      aria-label="查看 ARM 芯片温度、供电与降频诊断状态"
      matTooltip="查看 ARM 芯片传感器与供电状态"
    >
      <span class="status-dot" [ngClass]="dotClass()" aria-hidden="true"></span>
      <mat-icon class="chip-icon" aria-hidden="true">memory</mat-icon>
      <span class="temp-text">{{ tempDisplay() }}</span>
      <span *ngIf="hasAnyWarning()" class="warn-tag">告警</span>
    </button>

    <mat-menu #thermalMenu="matMenu" class="m3-thermal-menu" xPosition="before">
      <div class="thermal-popover font-mono" (click)="$event.stopPropagation()">
        <div class="popover-header">
          <div class="title-row">
            <mat-icon class="primary-icon" aria-hidden="true">developer_board</mat-icon>
            <div>
              <div class="title">ARM 硅片传感器诊断</div>
              <div class="subtitle">{{ boardLabel() }} · 更新: {{ system.lastUpdatedLabel() }}</div>
            </div>
          </div>
          <span class="m3-badge" [ngClass]="statusBadgeClass()">
            {{ statusLabel() }}
          </span>
        </div>

        <div class="metrics-grid">
          <div class="metric-tile">
            <span class="label">核心温度</span>
            <span class="value">{{ tempDisplay() }}</span>
            <span class="sub">{{ thermal().temp_source || '硬件不支持/无传感器' }}</span>
          </div>
          <div class="metric-tile">
            <span class="label">核心工作频率</span>
            <span class="value">{{ freqDisplay() }}</span>
            <span class="sub">调速器: {{ thermal().governor || '硬件不支持' }}</span>
          </div>
          <div class="metric-tile">
            <span class="label">核心电压</span>
            <span class="value">{{ voltageDisplay() }}</span>
            <span class="sub">{{ thermal().throttle_source ? 'vcgencmd 采样' : '非树莓派平台' }}</span>
          </div>
          <div class="metric-tile">
            <span class="label">节流寄存器</span>
            <span class="value">{{ thermal().throttling_flags_hex || '硬件不支持' }}</span>
            <span class="sub">Bitmask 掩码</span>
          </div>
        </div>

        <div class="flags-list">
          <div class="flag-row">
            <span>供电欠压检测 (0x1)</span>
            <span class="m3-badge" [ngClass]="flagClass(thermal().under_voltage)">
              {{ flagText(thermal().under_voltage, '欠压告警', '供电正常') }}
            </span>
          </div>
          <div class="flag-row">
            <span>ARM 频点受限 (0x2)</span>
            <span class="m3-badge" [ngClass]="flagClass(thermal().freq_capped)">
              {{ flagText(thermal().freq_capped, '频点受限', '满血频点') }}
            </span>
          </div>
          <div class="flag-row">
            <span>温控降频保护 (0x4)</span>
            <span class="m3-badge" [ngClass]="flagClass(thermal().throttled)">
              {{ flagText(thermal().throttled, '发生降频', '未降频') }}
            </span>
          </div>
        </div>
      </div>
    </mat-menu>
  `,
  styles: [
    `
      .arm-die-pill {
        border-radius: 999px !important;
        height: 36px;
        padding: 0 14px !important;
        border-color: var(--ag-outline-variant) !important;
        background: var(--ag-surface) !important;
        font-size: 0.78rem;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      .arm-die-pill.warn {
        border-color: var(--ag-danger) !important;
        background: var(--ag-danger-container) !important;
      }
      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        display: inline-block;
      }
      .status-dot.ok {
        background: var(--ag-success);
        box-shadow: 0 0 8px var(--ag-success);
      }
      .status-dot.warm {
        background: var(--ag-warning);
      }
      .status-dot.hot {
        background: var(--ag-danger);
      }
      .status-dot.unknown {
        background: var(--ag-on-surface-variant);
      }
      .chip-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        color: var(--ag-primary);
      }
      .warn-tag {
        background: var(--ag-danger);
        color: #290001;
        padding: 1px 6px;
        border-radius: 999px;
        font-size: 0.65rem;
        font-weight: 700;
      }
      .thermal-popover {
        width: 330px;
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        color: var(--ag-on-surface);
      }
      .popover-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-bottom: 10px;
        border-bottom: 1px solid var(--ag-outline-variant);
      }
      .title-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .primary-icon {
        color: var(--ag-primary);
      }
      .title {
        font-weight: 700;
        font-size: 0.85rem;
      }
      .subtitle {
        font-size: 0.68rem;
        color: var(--ag-on-surface-variant);
      }
      .metrics-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .metric-tile {
        background: var(--ag-surface-low);
        border: 1px solid var(--ag-outline-variant);
        border-radius: 12px;
        padding: 8px 10px;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .metric-tile .label {
        font-size: 0.68rem;
        color: var(--ag-on-surface-variant);
      }
      .metric-tile .value {
        font-size: 0.88rem;
        font-weight: 700;
        color: var(--ag-primary);
      }
      .metric-tile .sub {
        font-size: 0.65rem;
        color: var(--ag-on-surface-variant);
      }
      .flags-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding-top: 6px;
        border-top: 1px solid var(--ag-outline-variant);
      }
      .flag-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 0.73rem;
      }
    `,
  ],
})
export class ArmHardwareBadgeComponent {
  readonly system = inject(SystemService)
  readonly thermal = this.system.thermal

  readonly hasAnyWarning = computed(() => {
    const th = this.thermal()
    return (
      th.throttled === true ||
      th.under_voltage === true ||
      th.freq_capped === true ||
      (th.temp_c !== null && th.temp_c >= 75)
    )
  })

  readonly tempDisplay = computed(() => {
    const t = this.thermal().temp_c
    return t === null || t === undefined ? '温度未知' : `${t.toFixed(1)}°C`
  })

  readonly freqDisplay = computed(() => {
    const f = this.thermal().freq_mhz ?? this.system.realtime().cpu.frequency_mhz
    return f === null || f === undefined ? '硬件不支持' : `${Math.round(f)} MHz`
  })

  readonly voltageDisplay = computed(() => {
    const v = this.thermal().voltage_v
    return v === null || v === undefined ? '硬件不支持' : `${v.toFixed(3)} V`
  })

  readonly boardLabel = computed(() => {
    return (
      this.thermal().board_model ||
      this.system.info()?.arm_board_model ||
      this.system.info()?.arch ||
      'Linux Host'
    )
  })

  dotClass() {
    if (this.system.isStale()) return 'warm'
    const t = this.thermal().temp_c
    if (this.hasAnyWarning()) return 'hot'
    if (t === null || t === undefined) return 'unknown'
    if (t >= 65) return 'warm'
    return 'ok'
  }

  statusBadgeClass() {
    if (this.system.isStale()) return 'warning'
    if (this.hasAnyWarning()) return 'danger'
    if (this.thermal().temp_c === null) return 'neutral'
    return 'success'
  }

  statusLabel() {
    if (this.system.isStale()) return '数据已过期'
    if (this.hasAnyWarning()) return '过热/节流告警'
    if (this.thermal().temp_c === null) return '无温度传感器'
    return '运行正常'
  }

  flagClass(val: boolean | null | undefined) {
    if (val === true) return 'danger'
    if (val === false) return 'success'
    return 'neutral'
  }

  flagText(val: boolean | null | undefined, badText: string, okText: string) {
    if (val === true) return badText
    if (val === false) return okText
    return '硬件不支持'
  }
}
