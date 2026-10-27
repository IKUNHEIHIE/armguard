import { Component, OnInit, computed, inject, signal } from '@angular/core'
import { AgMaterialModule } from '../../core/material.module'
import { ToastService } from '../../core/toast.service'
import { ConfirmService } from '../../core/confirm.service'
import { AgStateBannerComponent } from '../../components/ag-state-banner.component'
import { HasUnsavedChanges } from '../../core/unsaved-changes.guard'
import {
  toolboxApi,
  DnsState,
  SwapState,
  TimezoneState,
  HostsState,
  MirrorState,
} from '@/api/toolbox'

@Component({
  selector: 'ag-toolbox',
  standalone: true,
  imports: [AgMaterialModule, AgStateBannerComponent],
  template: `
    <div class="m3-page">
      <div class="m3-page-header">
        <div>
          <h2 class="m3-page-title">
            <mat-icon style="color: var(--ag-primary)">handyman</mat-icon>
            <span>系统工具箱</span>
          </h2>
          <p class="m3-page-subtitle font-mono">
            DNS 解析 · 虚拟内存 · 系统时区 · hosts 映射 · 软件镜像源，全部改动自动备份
          </p>
        </div>
        <div class="m3-page-actions">
          <button mat-stroked-button (click)="reloadAll()" [disabled]="anyLoading()">
            <mat-icon>refresh</mat-icon>
            <span>全部刷新</span>
          </button>
        </div>
      </div>

      <ag-state-banner
        *ngIf="bootError()"
        state="error"
        title="工具箱数据加载失败"
        [description]="bootError()!"
        primaryActionLabel="重试"
        (primaryAction)="reloadAll()"
      />

      <mat-tab-group animationDuration="180ms" [preserveContent]="true">
        <!-- ================= DNS ================= -->
        <mat-tab label="DNS 设置">
          <div class="toolbox-pane">
            <ag-state-banner *ngIf="dnsLoading()" state="loading" title="正在读取 DNS 配置..." />

            <div class="m3-card" *ngIf="!dnsLoading()">
              <div class="toolbox-head">
                <h3>DNS 解析服务器</h3>
                <span class="m3-badge">{{ dnsModeLabel() }}</span>
              </div>

              <!-- 当前实际生效的 DNS（与可编辑的「配置值」区分开） -->
              <div class="toolbox-now">
                <div class="toolbox-now-head">
                  <span class="toolbox-stat-label">当前正在使用</span>
                  <span
                    class="m3-badge"
                    [class.toolbox-badge-on]="dns()?.effective_source === 'manual'"
                  >
                    {{ dnsSourceLabel() }}
                  </span>
                  <span class="m3-hint" *ngIf="dns()?.connection">
                    连接：<span class="font-mono">{{ dns()?.connection }}</span>
                  </span>
                </div>
                <div class="toolbox-now-chips" *ngIf="(dns()?.effective || []).length; else noDns">
                  <span class="toolbox-dns-chip font-mono" *ngFor="let s of dns()?.effective">{{ s }}</span>
                </div>
                <ng-template #noDns>
                  <span class="m3-hint">未读取到生效中的 DNS</span>
                </ng-template>
              </div>

              <p class="m3-hint">{{ dns()?.hint }}</p>

              <div class="m3-grid-3">
                <div class="m3-field">
                  <label for="toolbox-dns-1">首选 DNS <span class="m3-req">*</span></label>
                  <input id="toolbox-dns-1" [(ngModel)]="dnsInputs[0]" placeholder="223.5.5.5" class="font-mono" />
                </div>
                <div class="m3-field">
                  <label for="toolbox-dns-2">备用 DNS</label>
                  <input id="toolbox-dns-2" [(ngModel)]="dnsInputs[1]" placeholder="119.29.29.29" class="font-mono" />
                </div>
                <div class="m3-field">
                  <label for="toolbox-dns-3">第三 DNS</label>
                  <input id="toolbox-dns-3" [(ngModel)]="dnsInputs[2]" placeholder="8.8.8.8" class="font-mono" />
                </div>
              </div>

              <div class="toolbox-quick">
                <span class="m3-hint">快捷填入：</span>
                <button mat-stroked-button type="button" (click)="fillDns(['223.5.5.5', '119.29.29.29'])">阿里 DNS</button>
                <button mat-stroked-button type="button" (click)="fillDns(['119.29.29.29', '223.5.5.5'])">腾讯 DNS</button>
                <button mat-stroked-button type="button" (click)="fillDns(['1.1.1.1', '8.8.8.8'])">Cloudflare</button>
                <button mat-stroked-button type="button" (click)="fillDns(dns()?.effective || [])">填入当前生效值</button>
              </div>

              <div class="m3-field-error" *ngIf="dnsError()">{{ dnsError() }}</div>

              <div class="toolbox-actions">
                <button mat-flat-button color="primary" (click)="saveDns()" [disabled]="dnsSaving()">
                  <mat-icon>save</mat-icon>
                  <span>{{ dnsSaving() ? '正在应用...' : '保存 DNS 配置' }}</span>
                </button>
                <span class="m3-hint" *ngIf="dnsDirty()">有未保存的修改</span>
              </div>
            </div>
          </div>
        </mat-tab>

        <!-- ================= SWAP ================= -->
        <mat-tab label="虚拟内存 (SWAP)">
          <div class="toolbox-pane">
            <ag-state-banner *ngIf="swapLoading()" state="loading" title="正在读取虚拟内存状态..." />

            <div class="m3-card" *ngIf="!swapLoading() && swap() as s">
              <div class="toolbox-head">
                <h3>虚拟内存状态</h3>
                <span class="m3-badge" [class.toolbox-badge-on]="s.swap_total_mb > 0">
                  {{ s.swap_total_mb > 0 ? '已启用 ' + s.swap_total_mb + ' MB' : '未启用' }}
                </span>
              </div>

              <div class="m3-grid-4">
                <div class="toolbox-stat">
                  <span class="toolbox-stat-label">物理内存</span>
                  <span class="toolbox-stat-value font-mono">{{ s.memory_total_mb ?? '—' }} MB</span>
                </div>
                <div class="toolbox-stat">
                  <span class="toolbox-stat-label">交换空间</span>
                  <span class="toolbox-stat-value font-mono">{{ s.swap_total_mb }} MB</span>
                </div>
                <div class="toolbox-stat">
                  <span class="toolbox-stat-label">已使用</span>
                  <span class="toolbox-stat-value font-mono">{{ s.swap_used_mb }} MB</span>
                </div>
                <div class="toolbox-stat">
                  <span class="toolbox-stat-label">swappiness</span>
                  <span class="toolbox-stat-value font-mono">{{ s.swappiness }}</span>
                </div>
              </div>

              <p class="m3-hint" *ngIf="s.devices.length">
                活动交换设备：
                <span class="font-mono" *ngFor="let d of s.devices">{{ d.filename }} ({{ d.size_kb }} KB)　</span>
              </p>
              <p class="m3-hint" *ngIf="s.swap_file_exists">
                交换文件 <span class="font-mono">{{ s.swap_file }}</span> 已存在（{{ s.swap_file_size_mb }} MB），
                {{ s.persisted ? '已写入 /etc/fstab 开机自动挂载' : '尚未写入 /etc/fstab，重启后失效' }}。
              </p>
            </div>

            <div class="m3-card" *ngIf="!swapLoading() && swap() as s">
              <h3>新建交换文件</h3>
              <p class="m3-hint">
                在根分区创建 <span class="font-mono">{{ s.swap_file }}</span>，执行 fallocate → mkswap → swapon，
                并写入 /etc/fstab 保证开机自动启用。内存不足时建议设置 1024~2048 MB。
              </p>

              <div class="m3-grid-2">
                <div class="m3-field">
                  <label for="toolbox-swap-size">虚拟内存大小 (MB，{{ 128 }}~{{ 8192 }}) <span class="m3-req">*</span></label>
                  <input id="toolbox-swap-size" type="number" min="128" max="8192" step="128" [(ngModel)]="swapSizeMb" />
                </div>
                <div class="m3-field">
                  <label for="toolbox-swap-swappiness">swappiness (0~100，默认 60)</label>
                  <input id="toolbox-swap-swappiness" type="number" min="0" max="100" [(ngModel)]="swapSwappiness" />
                </div>
              </div>

              <div class="toolbox-quick">
                <span class="m3-hint">常用大小：</span>
                <button mat-stroked-button type="button" (click)="swapSizeMb = 512">512 MB</button>
                <button mat-stroked-button type="button" (click)="swapSizeMb = 1024">1 GB</button>
                <button mat-stroked-button type="button" (click)="swapSizeMb = 2048">2 GB</button>
                <button mat-stroked-button type="button" (click)="swapSizeMb = 4096">4 GB</button>
              </div>

              <div class="m3-field-error" *ngIf="swapError()">{{ swapError() }}</div>

              <div class="toolbox-actions">
                <button
                  mat-flat-button
                  color="primary"
                  (click)="createSwap()"
                  [disabled]="swapBusy() || s.swap_file_exists"
                >
                  <mat-icon>add_circle</mat-icon>
                  <span>{{ swapBusy() ? '正在创建...' : '创建并启用虚拟内存' }}</span>
                </button>
                <button
                  mat-stroked-button
                  color="warn"
                  (click)="removeSwap()"
                  [disabled]="swapBusy() || !s.swap_file_exists"
                >
                  <mat-icon>delete_forever</mat-icon>
                  <span>关闭并删除交换文件</span>
                </button>
              </div>
            </div>
          </div>
        </mat-tab>

        <!-- ================= 时区 ================= -->
        <mat-tab label="时区设置">
          <div class="toolbox-pane">
            <ag-state-banner *ngIf="tzLoading()" state="loading" title="正在读取时区信息..." />

            <div class="m3-card" *ngIf="!tzLoading() && tz() as t">
              <div class="toolbox-head">
                <h3>系统时区</h3>
                <span class="m3-badge toolbox-badge-on">{{ t.current }}</span>
              </div>
              <p class="m3-hint">
                通过 <span class="font-mono">timedatectl set-timezone</span> 写入，
                同时更新 /etc/localtime 与 /etc/timezone，计划任务与日志时间戳随之调整。
              </p>

              <div class="m3-grid-2">
                <div class="m3-field">
                  <label for="toolbox-tz-search">搜索时区</label>
                  <input
                    id="toolbox-tz-search"
                    [(ngModel)]="tzSearch"
                    placeholder="例如 Asia/Shang 或 Shanghai"
                    class="font-mono"
                  />
                </div>
                <div class="m3-field">
                  <label for="toolbox-tz-select">选择时区 <span class="m3-req">*</span></label>
                  <select id="toolbox-tz-select" [(ngModel)]="selectedTz" class="font-mono">
                    <option *ngFor="let z of filteredZones()" [value]="z">{{ z }}</option>
                  </select>
                </div>
              </div>

              <div class="toolbox-quick">
                <span class="m3-hint">常用：</span>
                <button mat-stroked-button type="button" (click)="selectedTz = 'Asia/Shanghai'">中国标准时间</button>
                <button mat-stroked-button type="button" (click)="selectedTz = 'UTC'">UTC</button>
                <button mat-stroked-button type="button" (click)="selectedTz = 'Asia/Tokyo'">东京</button>
                <button mat-stroked-button type="button" (click)="selectedTz = 'America/New_York'">纽约</button>
              </div>

              <div class="m3-field-error" *ngIf="tzError()">{{ tzError() }}</div>

              <div class="toolbox-actions">
                <button
                  mat-flat-button
                  color="primary"
                  (click)="saveTimezone()"
                  [disabled]="tzBusy() || !selectedTz || selectedTz === t.current"
                >
                  <mat-icon>public</mat-icon>
                  <span>{{ tzBusy() ? '正在应用...' : '应用时区' }}</span>
                </button>
                <span class="m3-hint">共 {{ t.zones.length }} 个可选时区</span>
              </div>
            </div>
          </div>
        </mat-tab>

        <!-- ================= hosts ================= -->
        <mat-tab label="hosts 设置">
          <div class="toolbox-pane">
            <ag-state-banner *ngIf="hostsLoading()" state="loading" title="正在读取 hosts 文件..." />

            <div class="m3-card" *ngIf="!hostsLoading() && hosts() as h">
              <div class="toolbox-head">
                <h3>本地域名映射 (hosts)</h3>
                <span class="m3-badge font-mono">{{ h.path }}</span>
              </div>
              <p class="m3-hint">
                每行格式为 <span class="font-mono">IP 主机名 [别名...]</span>，以 # 开头为注释。
                保存后立即生效（无需重启服务）。修改前会自动备份为 <span class="font-mono">.armguard-bak-*</span>。
              </p>

              <div class="m3-field">
                <label for="toolbox-hosts">hosts 内容 <span class="m3-req">*</span></label>
                <textarea
                  id="toolbox-hosts"
                  rows="16"
                  [(ngModel)]="hostsDraft"
                  (ngModelChange)="onHostsChange()"
                  class="font-mono"
                  spellcheck="false"
                ></textarea>
                <div class="m3-hint">
                  {{ hostsDraft.split('\n').length }} 行 · {{ hostsDraft.length }} 字符
                  <span *ngIf="hostsDirty()" style="color: var(--ag-warning)"> · 有未保存的修改</span>
                </div>
              </div>

              <div class="m3-field-error" *ngIf="hostsError()">{{ hostsError() }}</div>

              <div class="toolbox-actions">
                <button
                  mat-flat-button
                  color="primary"
                  (click)="saveHosts()"
                  [disabled]="hostsBusy() || !hostsDirty()"
                >
                  <mat-icon>save</mat-icon>
                  <span>{{ hostsBusy() ? '正在保存...' : '保存 hosts' }}</span>
                </button>
                <button mat-stroked-button (click)="resetHostsDraft()" [disabled]="!hostsDirty()">
                  <mat-icon>undo</mat-icon>
                  <span>撤销修改</span>
                </button>
              </div>
            </div>
          </div>
        </mat-tab>

        <!-- ================= 镜像源 ================= -->
        <mat-tab label="镜像源设置">
          <div class="toolbox-pane">
            <ag-state-banner *ngIf="mirrorLoading()" state="loading" title="正在读取软件源配置..." />

            <div class="m3-card" *ngIf="!mirrorLoading() && mirror() as m">
              <div class="toolbox-head">
                <h3>APT 软件源</h3>
                <span class="m3-badge font-mono">
                  {{ m.os.pretty || m.os.id }} / {{ m.os.codename }}
                </span>
              </div>
              <p class="m3-hint">
                当前源：<span class="font-mono">{{ m.current_url || '未识别' }}</span>
                （配置文件 <span class="font-mono">{{ m.file }}</span>，{{ m.format === 'deb822' ? 'deb822' : '单行' }} 格式）。
                切换后建议立即刷新索引。
              </p>

              <div class="toolbox-preset-grid">
                <button
                  type="button"
                  class="toolbox-preset"
                  *ngFor="let p of m.presets"
                  [class.toolbox-preset-active]="mirrorChoice === p.id"
                  (click)="mirrorChoice = p.id"
                >
                  <span class="toolbox-preset-name">{{ p.name }}</span>
                  <span class="toolbox-preset-url font-mono">{{ p.debian }}</span>
                  <span class="toolbox-preset-note">{{ p.note }}</span>
                </button>
                <button
                  type="button"
                  class="toolbox-preset"
                  [class.toolbox-preset-active]="mirrorChoice === 'custom'"
                  (click)="mirrorChoice = 'custom'"
                >
                  <span class="toolbox-preset-name">自定义源</span>
                  <span class="toolbox-preset-url font-mono">http(s)://…</span>
                  <span class="toolbox-preset-note">内网镜像或自建仓库</span>
                </button>
              </div>

              <div class="m3-grid-2" *ngIf="mirrorChoice === 'custom'">
                <div class="m3-field">
                  <label for="toolbox-mirror-url">主仓库地址 <span class="m3-req">*</span></label>
                  <input
                    id="toolbox-mirror-url"
                    [(ngModel)]="customMirrorUrl"
                    placeholder="https://mirrors.example.com/debian"
                    class="font-mono"
                  />
                </div>
                <div class="m3-field">
                  <label for="toolbox-mirror-sec">安全更新源地址（留空则自动推导）</label>
                  <input
                    id="toolbox-mirror-sec"
                    [(ngModel)]="customSecurityUrl"
                    placeholder="https://mirrors.example.com/debian-security"
                    class="font-mono"
                  />
                </div>
              </div>

              <div class="m3-field-error" *ngIf="mirrorError()">{{ mirrorError() }}</div>

              <div class="toolbox-actions">
                <button mat-flat-button color="primary" (click)="applyMirror()" [disabled]="mirrorBusy() || !mirrorChoice">
                  <mat-icon>swap_horiz</mat-icon>
                  <span>{{ mirrorBusy() ? '正在切换...' : '切换软件源' }}</span>
                </button>
                <button mat-stroked-button (click)="runAptUpdate()" [disabled]="aptBusy()">
                  <mat-icon>sync</mat-icon>
                  <span>{{ aptBusy() ? '正在刷新索引...' : '刷新索引 (apt-get update)' }}</span>
                </button>
              </div>

              <pre class="m3-code-console font-mono" *ngIf="aptOutput()">{{ aptOutput() }}</pre>
            </div>
          </div>
        </mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: [
    `
      .toolbox-pane {
        padding: 16px 0;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .toolbox-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 8px;
      }
      .toolbox-head h3 {
        margin: 0;
        font-size: 15px;
        font-weight: 600;
      }
      .toolbox-badge-on {
        background: color-mix(in srgb, var(--ag-success, #10b981) 18%, transparent);
        color: var(--ag-success, #10b981);
      }
      .toolbox-quick {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        margin: 4px 0 12px;
      }
      .toolbox-actions {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 12px;
      }
      .toolbox-stat {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 12px 14px;
        border-radius: 12px;
        background: color-mix(in srgb, var(--ag-primary) 6%, transparent);
      }
      .toolbox-now {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 14px;
        margin: 4px 0 12px;
        border-radius: 14px;
        border: 1px solid var(--ag-border, rgba(0, 0, 0, 0.12));
        background: color-mix(in srgb, var(--ag-primary) 5%, transparent);
      }
      .toolbox-now-head {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 10px;
      }
      .toolbox-now-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .toolbox-dns-chip {
        display: inline-flex;
        align-items: center;
        padding: 4px 12px;
        border-radius: 999px;
        font-size: 13px;
        background: color-mix(in srgb, var(--ag-primary) 14%, transparent);
        color: var(--ag-primary);
      }
      .toolbox-stat-label {
        font-size: 12px;
        opacity: 0.7;
      }
      .toolbox-stat-value {
        font-size: 16px;
        font-weight: 600;
      }
      .toolbox-preset-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
        margin: 12px 0;
      }
      .toolbox-preset {
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 14px;
        border-radius: 14px;
        border: 1px solid var(--ag-border, rgba(0, 0, 0, 0.12));
        background: transparent;
        text-align: left;
        cursor: pointer;
        transition: border-color 0.15s ease, background 0.15s ease;
      }
      .toolbox-preset:hover {
        border-color: var(--ag-primary);
      }
      .toolbox-preset-active {
        border-color: var(--ag-primary);
        border-width: 2px;
        background: color-mix(in srgb, var(--ag-primary) 8%, transparent);
      }
      .toolbox-preset-name {
        font-size: 14px;
        font-weight: 600;
      }
      .toolbox-preset-url {
        font-size: 11px;
        opacity: 0.75;
        word-break: break-all;
      }
      .toolbox-preset-note {
        font-size: 11px;
        opacity: 0.6;
      }
    `,
  ],
})
export class ToolboxComponent implements OnInit, HasUnsavedChanges {
  private toast = inject(ToastService)
  private confirm = inject(ConfirmService)

  // ---- DNS ----
  readonly dns = signal<DnsState | null>(null)
  readonly dnsLoading = signal(false)
  readonly dnsSaving = signal(false)
  readonly dnsError = signal<string | null>(null)
  dnsInputs: string[] = ['', '', '']
  private dnsBaseline = ''

  // ---- SWAP ----
  readonly swap = signal<SwapState | null>(null)
  readonly swapLoading = signal(false)
  readonly swapBusy = signal(false)
  readonly swapError = signal<string | null>(null)
  swapSizeMb = 2048
  swapSwappiness = 60

  // ---- 时区 ----
  readonly tz = signal<TimezoneState | null>(null)
  readonly tzLoading = signal(false)
  readonly tzBusy = signal(false)
  readonly tzError = signal<string | null>(null)
  tzSearch = ''
  selectedTz = ''

  // ---- hosts ----
  readonly hosts = signal<HostsState | null>(null)
  readonly hostsLoading = signal(false)
  readonly hostsBusy = signal(false)
  readonly hostsError = signal<string | null>(null)
  hostsDraft = ''
  private hostsOriginal = ''

  // ---- 镜像源 ----
  readonly mirror = signal<MirrorState | null>(null)
  readonly mirrorLoading = signal(false)
  readonly mirrorBusy = signal(false)
  readonly mirrorError = signal<string | null>(null)
  readonly aptBusy = signal(false)
  readonly aptOutput = signal<string | null>(null)
  mirrorChoice = ''
  customMirrorUrl = ''
  customSecurityUrl = ''

  readonly bootError = signal<string | null>(null)
  readonly anyLoading = computed(
    () => this.dnsLoading() || this.swapLoading() || this.tzLoading() || this.hostsLoading() || this.mirrorLoading()
  )

  readonly filteredZones = computed(() => {
    const zones = this.tz()?.zones || []
    const q = this.tzSearch.trim().toLowerCase()
    if (!q) return zones
    return zones.filter(z => z.toLowerCase().includes(q))
  })

  ngOnInit() {
    this.reloadAll()
  }

  hasUnsavedChanges(): boolean {
    return this.hostsDirty()
  }

  unsavedChangesMessage = 'hosts 文件存在尚未保存的修改，离开页面将丢失这些编辑内容。'

  hostsDirty(): boolean {
    return this.hostsDraft !== this.hostsOriginal
  }

  onHostsChange() {
    if (this.hostsError()) this.hostsError.set(null)
  }

  resetHostsDraft() {
    this.hostsDraft = this.hostsOriginal
    this.hostsError.set(null)
  }

  dnsModeLabel(): string {
    const mode = this.dns()?.mode
    if (mode === 'networkmanager') return 'NetworkManager 托管'
    if (mode === 'systemd-resolved') return 'systemd-resolved 托管'
    if (mode === 'resolv.conf') return '直接写入 resolv.conf'
    return '未知'
  }

  dnsSourceLabel(): string {
    const src = this.dns()?.effective_source
    if (src === 'manual') return '手动配置'
    if (src === 'dhcp') return 'DHCP 自动下发'
    if (src === 'file') return '来自配置文件'
    return '来源未知'
  }

  dnsDirty(): boolean {
    return this.dnsInputs.map(s => (s || '').trim()).filter(Boolean).join(',') !== this.dnsBaseline
  }

  reloadAll() {
    this.bootError.set(null)
    this.loadDns()
    this.loadSwap()
    this.loadTimezone()
    this.loadHosts()
    this.loadMirrors()
  }

  private fail(label: string, e: any) {
    const msg = e?.response?.data?.message || e?.message || '未知错误'
    this.bootError.set(`${label}：${msg}`)
    return msg
  }

  // ================= DNS =================
  async loadDns() {
    this.dnsLoading.set(true)
    this.dnsError.set(null)
    try {
      const res = await toolboxApi.getDns()
      this.dns.set(res.data.data)
      const configured = res.data?.data?.servers || []
      const effective = res.data?.data?.effective || []
      // DHCP 下发时「配置值」为空，若直接留空，界面看起来像「没有任何 DNS」。
      // 这里用实际生效值回填，用户能看到当前真实状态，保存时再固化为手动配置。
      const shown = configured.length ? configured : effective
      this.dnsInputs = [shown[0] || '', shown[1] || '', shown[2] || '']
      this.dnsBaseline = this.dnsInputs.map(s => (s || '').trim()).filter(Boolean).join(',')
    } catch (e: any) {
      this.dnsError.set(this.fail('读取 DNS', e))
    } finally {
      this.dnsLoading.set(false)
    }
  }

  fillDns(list: string[]) {
    this.dnsInputs = [list[0] || '', list[1] || '', list[2] || '']
    this.dnsError.set(null)
  }

  async saveDns() {
    const servers = this.dnsInputs.map(s => (s || '').trim()).filter(Boolean)
    if (servers.length === 0) {
      this.dnsError.set('请至少填写一个 DNS 服务器地址')
      return
    }
    if (servers.length > 3) {
      this.dnsError.set('最多配置 3 个 DNS 服务器')
      return
    }
    this.dnsSaving.set(true)
    this.dnsError.set(null)
    try {
      const res = await toolboxApi.setDns(servers)
      this.toast.success(res.data.message || 'DNS 配置已更新')
      await this.loadDns()
    } catch (e: any) {
      this.dnsError.set(e?.message || '保存失败')
    } finally {
      this.dnsSaving.set(false)
    }
  }

  // ================= SWAP =================
  async loadSwap() {
    this.swapLoading.set(true)
    this.swapError.set(null)
    try {
      const res = await toolboxApi.getSwap()
      this.swap.set(res.data.data)
      const swapData = res.data.data
      if (swapData?.swappiness != null) this.swapSwappiness = swapData.swappiness
    } catch (e: any) {
      this.swapError.set(this.fail('读取虚拟内存', e))
    } finally {
      this.swapLoading.set(false)
    }
  }

  async createSwap() {
    const size = Number(this.swapSizeMb)
    if (!Number.isInteger(size) || size < 128 || size > 8192) {
      this.swapError.set('虚拟内存大小必须是 128~8192 MB 之间的整数')
      return
    }
    this.swapBusy.set(true)
    this.swapError.set(null)
    try {
      const res = await toolboxApi.createSwap(size, Number(this.swapSwappiness))
      this.toast.success(res.data.message || '虚拟内存已创建')
      await this.loadSwap()
    } catch (e: any) {
      this.swapError.set(e?.message || '创建失败')
    } finally {
      this.swapBusy.set(false)
    }
  }

  async removeSwap() {
    const s = this.swap()
    const answer = await this.confirm.ask({
      title: '关闭并删除交换文件',
      message: `将执行 swapoff 并删除 ${s?.swap_file || '/swapfile'}，同时移除 /etc/fstab 中的对应条目。`,
      resourceName: s?.swap_file,
      impact: '删除后系统失去交换空间；若物理内存已接近用满，可能导致 OOM 终止进程。此操作不可恢复。',
      confirmText: '确认删除交换文件',
      tone: 'danger',
    })
    if (!answer.confirmed) return

    this.swapBusy.set(true)
    this.swapError.set(null)
    try {
      const res = await toolboxApi.removeSwap()
      this.toast.success(res.data.message || '虚拟内存已删除')
      await this.loadSwap()
    } catch (e: any) {
      this.swapError.set(e?.message || '删除失败')
    } finally {
      this.swapBusy.set(false)
    }
  }

  // ================= 时区 =================
  async loadTimezone() {
    this.tzLoading.set(true)
    this.tzError.set(null)
    try {
      const res = await toolboxApi.getTimezone()
      this.tz.set(res.data.data)
      this.selectedTz = res.data.data?.current || ''
    } catch (e: any) {
      this.tzError.set(this.fail('读取时区', e))
    } finally {
      this.tzLoading.set(false)
    }
  }

  async saveTimezone() {
    if (!this.selectedTz) {
      this.tzError.set('请选择目标时区')
      return
    }
    this.tzBusy.set(true)
    this.tzError.set(null)
    try {
      const res = await toolboxApi.setTimezone(this.selectedTz)
      this.toast.success(res.data.message || '时区已更新')
      await this.loadTimezone()
    } catch (e: any) {
      this.tzError.set(e?.message || '设置失败')
    } finally {
      this.tzBusy.set(false)
    }
  }

  // ================= hosts =================
  async loadHosts() {
    this.hostsLoading.set(true)
    this.hostsError.set(null)
    try {
      const res = await toolboxApi.getHosts()
      this.hosts.set(res.data.data)
      this.hostsDraft = res.data.data?.content || ''
      this.hostsOriginal = this.hostsDraft
    } catch (e: any) {
      this.hostsError.set(this.fail('读取 hosts', e))
    } finally {
      this.hostsLoading.set(false)
    }
  }

  async saveHosts() {
    this.hostsBusy.set(true)
    this.hostsError.set(null)
    try {
      const res = await toolboxApi.setHosts(this.hostsDraft)
      this.hostsOriginal = this.hostsDraft
      this.toast.success(res.data.message || 'hosts 已保存')
      await this.loadHosts()
    } catch (e: any) {
      this.hostsError.set(e?.message || '保存失败')
    } finally {
      this.hostsBusy.set(false)
    }
  }

  // ================= 镜像源 =================
  async loadMirrors() {
    this.mirrorLoading.set(true)
    this.mirrorError.set(null)
    try {
      const res = await toolboxApi.getMirrors()
      this.mirror.set(res.data.data)
      const mirrorData = res.data.data
      if (!this.mirrorChoice && mirrorData?.current_id) {
        this.mirrorChoice = mirrorData.current_id
      }
    } catch (e: any) {
      this.mirrorError.set(this.fail('读取软件源', e))
    } finally {
      this.mirrorLoading.set(false)
    }
  }

  async applyMirror() {
    if (!this.mirrorChoice) {
      this.mirrorError.set('请选择目标软件源')
      return
    }
    const m = this.mirror()
    const preset = m?.presets.find(p => p.id === this.mirrorChoice)
    const answer = await this.confirm.ask({
      title: '切换 APT 软件源',
      message: `将改写 ${m?.file || '/etc/apt/sources.list'}，把软件源切换到「${
        this.mirrorChoice === 'custom' ? '自定义源' : preset?.name || this.mirrorChoice
      }」。`,
      resourceName: m?.file,
      impact: '原文件会先备份为 .armguard-bak-*。切换后若新源不可用，apt 安装与更新会失败，可随时切回官方源。',
      confirmText: '确认切换',
      tone: 'warning',
    })
    if (!answer.confirmed) return

    this.mirrorBusy.set(true)
    this.mirrorError.set(null)
    try {
      const res = await toolboxApi.setMirror({
        mirror_id: this.mirrorChoice,
        url: this.customMirrorUrl.trim(),
        security_url: this.customSecurityUrl.trim(),
      })
      this.toast.success(res.data.message || '软件源已切换')
      await this.loadMirrors()
    } catch (e: any) {
      this.mirrorError.set(e?.message || '切换失败')
    } finally {
      this.mirrorBusy.set(false)
    }
  }

  async runAptUpdate() {
    this.aptBusy.set(true)
    this.aptOutput.set(null)
    this.mirrorError.set(null)
    try {
      const res = await toolboxApi.updateIndex()
      this.aptOutput.set(res.data?.data?.output || '已完成')
      this.toast.success('软件源索引已刷新')
    } catch (e: any) {
      const msg = e?.message || '刷新失败'
      this.mirrorError.set(msg)
      this.aptOutput.set(msg)
    } finally {
      this.aptBusy.set(false)
    }
  }
}
