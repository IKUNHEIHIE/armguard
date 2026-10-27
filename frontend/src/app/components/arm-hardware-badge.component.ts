import { Component, computed, inject } from '@angular/core'
import { AgMaterialModule } from '../core/material.module'
import { SystemService } from '../core/system.service'

/**
 * 顶部栏的「芯片 + 温度」芯片（设计稿第三枚状态芯片），
 * 点击展开 ARM 硅片传感器诊断浮层。
 */
@Component({
  selector: 'ag-arm-hardware-badge',
  standalone: true,
  imports: [AgMaterialModule],
  template: `
    <button
      type="button"
      class="die-chip font-mono"
      [class.warn]="hasAnyWarning()"
      [matMenuTriggerFor]="thermalMenu"
      aria-label="查看 ARM 芯片温度与供电诊断"
      matTooltip="ARM 硅片传感器诊断"
    >
      <mat-icon class="chip-icon" aria-hidden="true">memory</mat-icon>
      <span class="chip-text">{{ chipLabel() }}</span>
    </button>

    <mat-menu #thermalMenu="matMenu" class="ag-thermal-menu" xPosition="before">
      <div class="thermal-popover" (click)="$event.stopPropagation()">
        <header class="pop-head">
          <div class="pop-title-row">
            <span class="pop-icon" aria-hidden="true"><mat-icon>developer_board</mat-icon></span>
            <div>
              <div class="pop-title">ARM 硅片传感器诊断</div>
              <div class="pop-sub font-mono">{{ boardLabel() }} · 更新 {{ system.lastUpdatedLabel() }}</div>
            </div>
          </div>
          <span class="m3-badge" [ngClass]="statusBadgeClass()">{{ statusLabel() }}</span>
        </header>

        <div class="pop-grid">
          <div class="pop-tile">
            <span class="tile-label">核心温度</span>
            <span class="tile-value font-mono">{{ tempDisplay() }}</span>
            <span class="tile-sub">{{ thermal().temp_source || '无温度传感器' }}</span>
          </div>
          <div class="pop-tile">
            <span class="tile-label">核心频率</span>
            <span class="tile-value font-mono">{{ freqDisplay() }}</span>
            <span class="tile-sub">{{ thermal().governor || '未识别调速器' }}</span>
          </div>
          <div class="pop-tile">
            <span class="tile-label">核心电压</span>
            <span class="tile-value font-mono">{{ voltageDisplay() }}</span>
            <span class="tile-sub">{{ thermal().throttle_source ? 'vcgencmd 采样' : '非树莓派平台' }}</span>
          </div>
          <div class="pop-tile">
            <span class="tile-label">节流寄存器</span>
            <span class="tile-value font-mono">{{ thermal().throttling_flags_hex || '—' }}</span>
            <span class="tile-sub">Bitmask 掩码</span>
          </div>
        </div>

        <div class="pop-flags">
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
      :host {
        display: inline-flex;
      }
      .die-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 30px;
        max-width: 320px;
        padding: 0 10px;
        border: none;
        border-radius: var(--ag-radius-sm);
        background: var(--ag-surface-low);
        color: var(--ag-on-surface-variant);
        font-size: 0.8125rem;
        cursor: pointer;
      }
      .die-chip:hover {
        background: var(--ag-surface);
      }
      .die-chip.warn {
        background: var(--ag-danger-container);
        color: var(--ag-danger);
      }
      .chip-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        color: var(--ag-primary);
        flex-shrink: 0;
      }
      .die-chip.warn .chip-icon {
        color: var(--ag-danger);
      }
      .chip-text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .thermal-popover {
        width: 340px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        color: var(--ag-on-surface);
      }
      .pop-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
        padding-bottom: 10px;
        border-bottom: 1px solid var(--ag-outline-variant);
      }
      .pop-title-row {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }
      .pop-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        flex-shrink: 0;
        border-radius: var(--ag-radius-sm);
        background: var(--ag-surface-low);
        color: var(--ag-primary);
      }
      .pop-icon mat-icon {
        font-size: 17px;
        width: 17px;
        height: 17px;
      }
      .pop-title {
        font-size: 0.8125rem;
        font-weight: 600;
      }
      .pop-sub {
        font-size: 0.625rem;
        color: var(--ag-on-surface-variant);
        margin-top: 1px;
      }
      .pop-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .pop-tile {
        display: flex;
        flex-direction: column;
        gap: 1px;
        padding: 8px 10px;
        border-radius: var(--ag-radius-sm);
        background: var(--ag-surface-low);
      }
      .tile-label {
        font-size: 0.625rem;
        color: var(--ag-on-surface-variant);
      }
      .tile-value {
        font-size: 0.8125rem;
        font-weight: 600;
        color: var(--ag-on-surface);
      }
      .tile-sub {
        font-size: 0.5625rem;
        color: var(--ag-on-surface-variant);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .pop-flags {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding-top: 8px;
        border-top: 1px solid var(--ag-outline-variant);
      }
      .flag-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        font-size: 0.6875rem;
        color: var(--ag-on-surface-variant);
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

  readonly chipLabel = computed(() => {
    const info = this.system.info()
    const th = this.thermal()
    const model = info?.cpu_model || info?.arm_board_model || 'ARM SoC'
    const short = model.length > 38 ? `${model.slice(0, 36)}…` : model
    const freq = th.freq_mhz ?? this.system.realtime().cpu.frequency_mhz
    const freqText = freq ? ` @ ${(freq / 1000).toFixed(1)}GHz` : ''
    const temp = th.temp_c !== null && th.temp_c !== undefined ? ` · ${th.temp_c.toFixed(0)}°C` : ''
    return `${short}${freqText}${temp}`
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

  statusBadgeClass() {
    if (this.system.isStale()) return 'warning'
    if (this.hasAnyWarning()) return 'danger'
    if (this.thermal().temp_c === null) return 'neutral'
    return 'success'
  }

  statusLabel() {
    if (this.system.isStale()) return '数据已过期'
    if (this.hasAnyWarning()) return '过热 / 节流告警'
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
