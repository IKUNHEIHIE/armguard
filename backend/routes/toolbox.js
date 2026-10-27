import fs from 'fs'
import path from 'path'
import { execFileAsync } from '../lib/exec.js'

/**
 * 工具箱：DNS / SWAP / 时区 / hosts / 镜像源
 *
 * 这些操作会改写系统文件（/etc/hosts、/etc/resolv.conf、apt 源）并调用特权命令，
 * 因此每条写入路径都必须满足：
 *   1. 目标文件来自固定白名单（仅测试可通过 ctx 覆盖）；
 *   2. 写入前自动备份到 <file>.armguard-bak-<时间戳>；
 *   3. 输入严格校验（IP、时区、URL、内容长度）；
 *   4. 全部通过 ctx.logOperation 记审计日志；
 *   5. 外部命令一律走 execFileAsync，避免阻塞事件循环（AG-PERF-01）。
 */

const DEFAULT_PATHS = {
  RESOLV_CONF: '/etc/resolv.conf',
  RESOLVED_DROPIN_DIR: '/etc/systemd/resolved.conf.d',
  HOSTS_FILE: '/etc/hosts',
  SOURCES_LIST: '/etc/apt/sources.list',
  SOURCES_DIR: '/etc/apt/sources.list.d',
  SWAP_FILE: '/swapfile',
  FSTAB: '/etc/fstab',
  OS_RELEASE: '/etc/os-release',
  ZONEINFO_DIR: '/usr/share/zoneinfo',
  SWAPPINESS_FILE: '/proc/sys/vm/swappiness'
}

const MAX_HOSTS_BYTES = 64 * 1024
const SWAP_MIN_MB = 128
const SWAP_MAX_MB = 8192
const BACKUP_KEEP = 5

export const MIRROR_PRESETS = [
  {
    id: 'official',
    name: 'Debian 官方源',
    debian: 'https://deb.debian.org/debian',
    security: 'https://security.debian.org/debian-security',
    note: '全球 CDN，国内速度一般'
  },
  {
    id: 'huawei',
    name: '华为云源',
    debian: 'https://repo.huaweicloud.com/debian',
    security: 'https://repo.huaweicloud.com/debian-security',
    note: '国内访问稳定，支持 IPv6'
  },
  {
    id: 'aliyun',
    name: '阿里云源',
    debian: 'https://mirrors.aliyun.com/debian',
    security: 'https://mirrors.aliyun.com/debian-security',
    note: '国内速度最快之一'
  },
  {
    id: 'tsinghua',
    name: '清华大学源',
    debian: 'https://mirrors.tuna.tsinghua.edu.cn/debian',
    security: 'https://mirrors.tuna.tsinghua.edu.cn/debian-security',
    note: '教育网友好，同步及时'
  }
]

function paths(ctx = {}) {
  const out = {}
  for (const [k, v] of Object.entries(DEFAULT_PATHS)) {
    out[k] = ctx[k] || v
  }
  return out
}

function exists(p) {
  try {
    fs.lstatSync(p)
    return true
  } catch {
    return false
  }
}

function readText(p, fallback = '') {
  try {
    return fs.readFileSync(p, 'utf8')
  } catch {
    return fallback
  }
}

function backupAndWrite(file, content, mode = 0o644) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  let backupPath = null
  if (exists(file)) {
    backupPath = `${file}.armguard-bak-${ts}`
    try {
      fs.copyFileSync(file, backupPath)
      fs.chmodSync(backupPath, 0o600)
    } catch {
      backupPath = null
    }
  }
  const tmp = `${file}.armguard-tmp-${process.pid}`
  fs.writeFileSync(tmp, content, { encoding: 'utf8', mode })
  fs.renameSync(tmp, file)
  try {
    fs.chmodSync(file, mode)
  } catch {}
  pruneBackups(file)
  return backupPath
}

function pruneBackups(file) {
  try {
    const dir = path.dirname(file)
    const prefix = path.basename(file) + '.armguard-bak-'
    const items = fs
      .readdirSync(dir)
      .filter(n => n.startsWith(prefix))
      .map(n => path.join(dir, n))
      .sort()
    while (items.length > BACKUP_KEEP) {
      const old = items.shift()
      try {
        fs.unlinkSync(old)
      } catch {}
    }
  } catch {}
}

export function isValidIp(value) {
  if (typeof value !== 'string') return false
  const s = value.trim()
  if (!s || s.length > 45) return false
  // IPv4
  const v4 = s.split('.')
  if (v4.length === 4 && v4.every(p => /^\d{1,3}$/.test(p) && Number(p) <= 255)) return true
  // IPv6（允许 %iface 作用域后缀）
  const bare = s.split('%')[0]
  if (!/^[0-9a-fA-F:]+$/.test(bare)) return false
  if ((bare.match(/::/g) || []).length > 1) return false
  return bare.includes(':') && bare.length >= 3
}

export function isValidTimezone(tz, zoneinfoDir = DEFAULT_PATHS.ZONEINFO_DIR) {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false
  if (!/^[A-Za-z0-9_+\-]+(\/[A-Za-z0-9_+\-]+)*$/.test(tz)) return false
  if (tz.includes('..')) return false
  try {
    return fs.existsSync(path.join(zoneinfoDir, tz))
  } catch {
    return false
  }
}

export function isValidMirrorUrl(url) {
  if (typeof url !== 'string' || !url || url.length > 200) return false
  if (!/^https?:\/\/[A-Za-z0-9.\-]+(:\d{1,5})?(\/[A-Za-z0-9._\-\/]*)?$/.test(url)) return false
  if (url.includes('..') || url.includes(' ')) return false
  return true
}

/** 解析 resolv.conf 中的 nameserver 行 */
export function parseResolvConf(content) {
  const servers = []
  for (const line of String(content || '').split('\n')) {
    const m = line.match(/^\s*nameserver\s+(\S+)/i)
    if (m && isValidIp(m[1])) servers.push(m[1])
  }
  return servers
}

function parseOsRelease(content) {
  const out = {}
  for (const line of String(content || '').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?([^"]*)"?$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}

/** 校验 hosts 内容：只允许空行、注释、以及 "IP 主机名..." 形式 */
export function validateHostsContent(content) {
  if (typeof content !== 'string') return { ok: false, message: '内容必须是字符串' }
  if (content.includes('\0')) return { ok: false, message: '内容包含非法字符 NUL' }
  if (Buffer.byteLength(content, 'utf8') > MAX_HOSTS_BYTES) {
    return { ok: false, message: `内容过大（上限 ${MAX_HOSTS_BYTES / 1024}KB）` }
  }
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i]
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const parts = line.split(/\s+/)
    if (parts.length < 2) {
      return { ok: false, message: `第 ${i + 1} 行格式错误：需要 "IP 主机名"` }
    }
    if (!isValidIp(parts[0])) {
      return { ok: false, message: `第 ${i + 1} 行 IP 地址非法：${parts[0]}` }
    }
    for (const host of parts.slice(1)) {
      if (!/^[A-Za-z0-9._\-*]+$/.test(host)) {
        return { ok: false, message: `第 ${i + 1} 行主机名非法：${host}` }
      }
    }
  }
  return { ok: true }
}

async function detectDnsMode(p) {
  const nm = await execFileAsync('nmcli', ['-t', '-f', 'RUNNING', 'general'], { timeout: 4000 })
  if (!nm.error && nm.status === 0 && /running/i.test(nm.stdout)) return 'networkmanager'
  const resolved = await execFileAsync('systemctl', ['is-active', 'systemd-resolved'], { timeout: 4000 })
  if (!resolved.error && resolved.status === 0 && /^active/m.test(resolved.stdout)) return 'systemd-resolved'
  return 'resolv.conf'
}

async function readNmDns() {
  const cons = await execFileAsync('nmcli', ['-t', '-f', 'NAME,DEVICE,TYPE', 'con', 'show', '--active'], { timeout: 5000 })
  if (cons.error || cons.status !== 0) return { connection: null, servers: [], auto: null }
  const line = String(cons.stdout || '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .find(l => /:(wifi|ethernet|802-3-ethernet|gsm|802-11-wireless)$/i.test(l))
  if (!line) return { connection: null, servers: [], auto: null }
  const name = line.split(':')[0].replace(/\\:/g, ':')
  const dns = await execFileAsync('nmcli', ['-t', '-f', 'ipv4.dns,ipv4.ignore-auto-dns', 'con', 'show', name], { timeout: 5000 })
  const text = String(dns.stdout || '')
  const dnsLine = text.split('\n').find(l => l.startsWith('ipv4.dns:'))
  const ignoreLine = text.split('\n').find(l => l.startsWith('ipv4.ignore-auto-dns:'))
  const servers = dnsLine
    ? dnsLine
        .slice('ipv4.dns:'.length)
        .split(/[,\s]+/)
        .filter(s => s && isValidIp(s))
    : []
  return {
    connection: name,
    servers,
    auto: ignoreLine ? !/yes/i.test(ignoreLine.slice('ipv4.ignore-auto-dns:'.length)) : null
  }
}

async function readDns(ctx) {
  const p = paths(ctx)
  const mode = await detectDnsMode(p)
  if (mode === 'networkmanager') {
    const nm = await readNmDns()
    return {
      mode,
      connection: nm.connection,
      servers: nm.servers,
      auto_dns: nm.auto,
      file: p.RESOLV_CONF,
      effective: parseResolvConf(readText(p.RESOLV_CONF)),
      hint: '当前由 NetworkManager 托管，DNS 通过连接配置下发；直接改 /etc/resolv.conf 会在重连后失效。'
    }
  }
  if (mode === 'systemd-resolved') {
    const dropin = readText(path.join(p.RESOLVED_DROPIN_DIR, '90-armguard-dns.conf'))
    const fromDropin = parseResolvConf(dropin.replace(/DNS=/g, 'nameserver '))
    const effective = parseResolvConf(readText(p.RESOLV_CONF))
    return {
      mode,
      servers: fromDropin.length ? fromDropin : effective,
      auto_dns: false,
      file: path.join(p.RESOLVED_DROPIN_DIR, '90-armguard-dns.conf'),
      effective,
      hint: '当前由 systemd-resolved 托管，将通过 resolved.conf.d 下的 drop-in 配置生效。'
    }
  }
  return {
    mode,
    servers: parseResolvConf(readText(p.RESOLV_CONF)),
    auto_dns: null,
    file: p.RESOLV_CONF,
    effective: parseResolvConf(readText(p.RESOLV_CONF)),
    hint: '直接写入 /etc/resolv.conf；若系统由 DHCP 客户端托管，重启后可能被覆盖。'
  }
}

async function applyDns(ctx, servers, mode) {
  const p = paths(ctx)
  if (mode === 'networkmanager') {
    const nm = await readNmDns()
    if (!nm.connection) throw new Error('未找到活动的 NetworkManager 连接，无法下发 DNS')
    const list = servers.join(' ')
    const setDns = await execFileAsync('nmcli', ['con', 'mod', nm.connection, 'ipv4.dns', list, 'ipv4.ignore-auto-dns', 'yes'], { timeout: 15000 })
    if (setDns.error || setDns.status !== 0) {
      throw new Error(`nmcli 写入 DNS 失败: ${(setDns.stderr || '').trim() || setDns.error?.message || setDns.status}`)
    }
    const up = await execFileAsync('nmcli', ['con', 'up', nm.connection], { timeout: 30000 })
    if (up.error || up.status !== 0) {
      throw new Error(`nmcli 重载连接失败: ${(up.stderr || '').trim() || up.error?.message || up.status}`)
    }
    return { mode, connection: nm.connection, file: p.RESOLV_CONF, restart: 'nmcli con up' }
  }
  if (mode === 'systemd-resolved') {
    const dir = p.RESOLVED_DROPIN_DIR
    fs.mkdirSync(dir, { recursive: true })
    const file = path.join(dir, '90-armguard-dns.conf')
    const body = ['# Managed by ArmGuard toolbox', '[Resolve]', `DNS=${servers.join(' ')}`, 'Domains=~.', ''].join('\n')
    const backup = backupAndWrite(file, body, 0o644)
    const restart = await execFileAsync('systemctl', ['restart', 'systemd-resolved'], { timeout: 20000 })
    if (restart.error || restart.status !== 0) {
      throw new Error(`systemd-resolved 重启失败: ${(restart.stderr || '').trim() || restart.status}`)
    }
    return { mode, file, backup, restart: 'systemctl restart systemd-resolved' }
  }
  const body = ['# Generated by ArmGuard toolbox', ...servers.map(s => `nameserver ${s}`), ''].join('\n')
  const backup = backupAndWrite(p.RESOLV_CONF, body, 0o644)
  return { mode, file: p.RESOLV_CONF, backup }
}

async function readSwap(ctx) {
  const p = paths(ctx)
  const swaps = readText('/proc/swaps')
  const devices = []
  for (const line of swaps.split('\n').slice(1)) {
    const cols = line.trim().split(/\s+/)
    if (cols.length >= 5 && cols[0] !== 'Filename') {
      devices.push({
        filename: cols[0],
        type: cols[1],
        size_kb: Number(cols[2]) || 0,
        used_kb: Number(cols[3]) || 0,
        priority: Number(cols[4]) || 0
      })
    }
  }
  const free = await execFileAsync('free', ['-m'], { timeout: 5000 })
  let memTotal = null
  let swapTotal = 0
  let swapUsed = 0
  if (!free.error && free.status === 0) {
    for (const line of String(free.stdout || '').split('\n')) {
      const cols = line.trim().split(/\s+/)
      if (/^Mem:/i.test(line) || /^内存/.test(line)) memTotal = Number(cols[1]) || null
      if (/^Swap:/i.test(line) || /^交换/.test(line)) {
        swapTotal = Number(cols[1]) || 0
        swapUsed = Number(cols[2]) || 0
      }
    }
  }
  const swappiness = Number(readText(p.SWAPPINESS_FILE, '60').trim()) || 60
  const fstab = readText(p.FSTAB)
  return {
    devices,
    swap_total_mb: swapTotal,
    swap_used_mb: swapUsed,
    memory_total_mb: memTotal,
    swappiness,
    swap_file: p.SWAP_FILE,
    swap_file_exists: exists(p.SWAP_FILE),
    swap_file_size_mb: exists(p.SWAP_FILE) ? Math.round(fs.statSync(p.SWAP_FILE).size / 1024 / 1024) : 0,
    persisted: new RegExp(`^\\s*${p.SWAP_FILE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s`, 'm').test(fstab),
    fstab_path: p.FSTAB
  }
}

async function createSwap(ctx, sizeMb, swappiness) {
  const p = paths(ctx)
  if (!Number.isInteger(sizeMb) || sizeMb < SWAP_MIN_MB || sizeMb > SWAP_MAX_MB) {
    throw new Error(`虚拟内存大小必须是 ${SWAP_MIN_MB}~${SWAP_MAX_MB} MB 之间的整数`)
  }
  if (exists(p.SWAP_FILE)) {
    throw new Error(`交换文件 ${p.SWAP_FILE} 已存在，请先删除或改用手动管理`)
  }
  const alloc = await execFileAsync('fallocate', ['-l', `${sizeMb}M`, p.SWAP_FILE], { timeout: 60000 })
  if (alloc.error || alloc.status !== 0) {
    // 部分文件系统不支持 fallocate，退化为 dd
    const dd = await execFileAsync('dd', ['if=/dev/zero', `of=${p.SWAP_FILE}`, 'bs=1M', `count=${sizeMb}`, 'status=none'], {
      timeout: 120000
    })
    if (dd.error || dd.status !== 0) {
      try {
        fs.unlinkSync(p.SWAP_FILE)
      } catch {}
      throw new Error(`创建交换文件失败: ${(dd.stderr || alloc.stderr || '').trim() || 'fallocate/dd 均失败'}`)
    }
  }
  try {
    fs.chmodSync(p.SWAP_FILE, 0o600)
  } catch {}
  const mk = await execFileAsync('mkswap', [p.SWAP_FILE], { timeout: 60000 })
  if (mk.error || mk.status !== 0) {
    try {
      fs.unlinkSync(p.SWAP_FILE)
    } catch {}
    throw new Error(`mkswap 失败: ${(mk.stderr || '').trim() || mk.status}`)
  }
  const on = await execFileAsync('swapon', [p.SWAP_FILE], { timeout: 30000 })
  if (on.error || on.status !== 0) {
    try {
      fs.unlinkSync(p.SWAP_FILE)
    } catch {}
    throw new Error(`swapon 失败: ${(on.stderr || '').trim() || on.status}`)
  }
  // 持久化到 fstab
  const fstab = readText(p.FSTAB)
  if (!new RegExp(`^\\s*${p.SWAP_FILE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s`, 'm').test(fstab)) {
    backupAndWrite(p.FSTAB, `${fstab.replace(/\s*$/, '')}\n${p.SWAP_FILE} none swap sw 0 0\n`, 0o644)
  }
  if (Number.isInteger(swappiness) && swappiness >= 0 && swappiness <= 100) {
    await setSwappiness(ctx, swappiness)
  }
  return { size_mb: sizeMb, swap_file: p.SWAP_FILE }
}

async function removeSwap(ctx) {
  const p = paths(ctx)
  if (!exists(p.SWAP_FILE)) throw new Error(`未找到交换文件 ${p.SWAP_FILE}`)
  const off = await execFileAsync('swapoff', [p.SWAP_FILE], { timeout: 30000 })
  if (off.error || off.status !== 0) {
    throw new Error(`swapoff 失败: ${(off.stderr || '').trim() || off.status}`)
  }
  fs.unlinkSync(p.SWAP_FILE)
  const fstab = readText(p.FSTAB)
  const cleaned = fstab
    .split('\n')
    .filter(line => !new RegExp(`^\\s*${p.SWAP_FILE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s`).test(line))
    .join('\n')
  if (cleaned !== fstab) backupAndWrite(p.FSTAB, cleaned, 0o644)
  return { removed: p.SWAP_FILE }
}

async function setSwappiness(ctx, value) {
  const p = paths(ctx)
  const v = Number(value)
  if (!Number.isInteger(v) || v < 0 || v > 100) throw new Error('swappiness 必须是 0~100 的整数')
  const r = await execFileAsync('sysctl', ['-w', `vm.swappiness=${v}`], { timeout: 10000 })
  if (r.error || r.status !== 0) {
    try {
      fs.writeFileSync(p.SWAPPINESS_FILE, String(v))
    } catch (e) {
      throw new Error(`设置 swappiness 失败: ${(r.stderr || '').trim() || e.message}`)
    }
  }
  // 持久化
  try {
    const conf = '/etc/sysctl.d/99-armguard-swap.conf'
    backupAndWrite(conf, `# Managed by ArmGuard toolbox\nvm.swappiness=${v}\n`, 0o644)
  } catch {}
  return { swappiness: v }
}

async function readTimezone(ctx) {
  const p = paths(ctx)
  const r = await execFileAsync('timedatectl', ['show', '-p', 'Timezone', '--value'], { timeout: 5000 })
  const current = (!r.error && r.status === 0 ? String(r.stdout).trim() : '') || readText('/etc/timezone').trim() || 'UTC'
  const list = await execFileAsync('timedatectl', ['list-timezones'], { timeout: 10000, maxBuffer: 4 * 1024 * 1024 })
  const zones = !list.error && list.status === 0 ? String(list.stdout).split('\n').filter(Boolean) : []
  return { current, zones, zoneinfo_dir: p.ZONEINFO_DIR }
}

async function applyTimezone(ctx, tz) {
  const p = paths(ctx)
  if (!isValidTimezone(tz, p.ZONEINFO_DIR)) throw new Error(`无效的时区标识: ${tz}`)
  const r = await execFileAsync('timedatectl', ['set-timezone', tz], { timeout: 15000 })
  if (r.error || r.status !== 0) {
    throw new Error(`时区设置失败: ${(r.stderr || '').trim() || r.error?.message || r.status}`)
  }
  return { timezone: tz }
}

async function readHosts(ctx) {
  const p = paths(ctx)
  const content = readText(p.HOSTS_FILE)
  return { path: p.HOSTS_FILE, content, size_bytes: Buffer.byteLength(content, 'utf8') }
}

function detectSourcesFormat(p) {
  try {
    const entries = fs.readdirSync(p.SOURCES_DIR).filter(n => n.endsWith('.sources'))
    if (entries.length > 0) return { format: 'deb822', file: path.join(p.SOURCES_DIR, entries[0]) }
  } catch {}
  return { format: 'one-line', file: p.SOURCES_LIST }
}

function buildSourcesContent(format, codename, baseUrl, securityUrl, components) {
  if (format === 'deb822') {
    return [
      '# Managed by ArmGuard toolbox',
      'Types: deb',
      `URIs: ${baseUrl}`,
      `Suites: ${codename} ${codename}-updates`,
      `Components: ${components}`,
      'Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg',
      '',
      'Types: deb',
      `URIs: ${securityUrl}`,
      `Suites: ${codename}-security`,
      `Components: ${components}`,
      'Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg',
      ''
    ].join('\n')
  }
  return [
    '# Managed by ArmGuard toolbox',
    `deb ${baseUrl} ${codename} ${components}`,
    `deb ${baseUrl} ${codename}-updates ${components}`,
    `deb ${securityUrl} ${codename}-security ${components}`,
    ''
  ].join('\n')
}

function detectCurrentMirror(content, presets) {
  const text = String(content || '')
  for (const preset of presets) {
    if (text.includes(preset.debian)) return preset.id
  }
  const m = text.match(/^deb\s+(\S+)\s+\S+\s+/m) || text.match(/^URIs:\s*(\S+)/m)
  return m ? 'custom' : null
}

async function readMirrors(ctx) {
  const p = paths(ctx)
  const os = parseOsRelease(readText(p.OS_RELEASE))
  const { format, file } = detectSourcesFormat(p)
  const content = readText(file)
  const currentId = detectCurrentMirror(content, MIRROR_PRESETS)
  const m = content.match(/^deb\s+(\S+)/m) || content.match(/^URIs:\s*(\S+)/m)
  return {
    os: { id: os.ID || null, codename: os.VERSION_CODENAME || null, pretty: os.PRETTY_NAME || null },
    format,
    file,
    presets: MIRROR_PRESETS,
    current_id: currentId,
    current_url: m ? m[1] : null,
    content
  }
}

async function applyMirror(ctx, body) {
  const p = paths(ctx)
  const os = parseOsRelease(readText(p.OS_RELEASE))
  const codename = os.VERSION_CODENAME
  if (!codename) throw new Error('无法从 /etc/os-release 读取系统代号（VERSION_CODENAME），已中止')
  if (os.ID && os.ID !== 'debian') {
    throw new Error(`当前系统为 ${os.ID}，本功能仅支持 Debian 系`)
  }

  let baseUrl
  let securityUrl
  let presetId = String(body?.mirror_id || '').trim()
  if (presetId === 'custom') {
    baseUrl = String(body?.url || '').trim().replace(/\/+$/, '')
    securityUrl = String(body?.security_url || '').trim().replace(/\/+$/, '')
    if (!isValidMirrorUrl(baseUrl)) throw new Error('自定义源地址不合法，必须是 http(s):// 开头的仓库地址')
    if (!securityUrl) {
      securityUrl = baseUrl.replace(/\/debian$/, '/debian-security')
      if (securityUrl === baseUrl) {
        throw new Error('无法自动推导安全更新源地址，请单独填写 security_url')
      }
    }
    if (!isValidMirrorUrl(securityUrl)) throw new Error('自定义安全源地址不合法')
  } else {
    const preset = MIRROR_PRESETS.find(x => x.id === presetId)
    if (!preset) throw new Error('未知的镜像源标识')
    baseUrl = preset.debian
    securityUrl = preset.security
  }

  const components = 'main contrib non-free-firmware'
  const { format, file } = detectSourcesFormat(p)
  const content = buildSourcesContent(format, codename, baseUrl, securityUrl, components)
  const backup = backupAndWrite(file, content, 0o644)
  return { mirror_id: presetId, format, file, backup, base_url: baseUrl, security_url: securityUrl, codename }
}

async function runAptUpdate() {
  const r = await execFileAsync('apt-get', ['update'], { timeout: 180000, maxBuffer: 8 * 1024 * 1024 })
  const output = `${r.stdout || ''}${r.stderr || ''}`.trim()
  if (r.error || r.status !== 0) {
    throw new Error(`apt-get update 失败: ${output.split('\n').slice(-6).join(' ') || r.status}`)
  }
  return { output: output.split('\n').slice(-15).join('\n') }
}

export async function handleToolbox(pathname, req, res, url, ctx) {
  if (!pathname.startsWith('/api/v1/toolbox')) return false
  const p = paths(ctx)
  const method = req.method

  // ---------------- DNS ----------------
  if (pathname === '/api/v1/toolbox/dns' && method === 'GET') {
    try {
      res.json(await readDns(ctx))
    } catch (e) {
      res.json(null, `读取 DNS 配置失败: ${e.message}`, 500)
    }
    return true
  }

  if (pathname === '/api/v1/toolbox/dns' && method === 'PUT') {
    const body = await ctx.parseBody(req, res)
    const raw = Array.isArray(body?.servers) ? body.servers : String(body?.servers || '').split(/[,\s]+/)
    const servers = raw.map(s => String(s).trim()).filter(Boolean)
    if (servers.length === 0) {
      res.json(null, '请至少提供一个 DNS 服务器地址', 400)
      return true
    }
    if (servers.length > 3) {
      res.json(null, '最多支持配置 3 个 DNS 服务器', 400)
      return true
    }
    const bad = servers.find(s => !isValidIp(s))
    if (bad) {
      res.json(null, `DNS 地址不合法: ${bad}`, 400)
      return true
    }
    try {
      const mode = await detectDnsMode(p)
      const result = await applyDns(ctx, servers, mode)
      ctx.logOperation(ctx.currentUser(), '修改系统 DNS', `${servers.join(', ')} (${mode})`)
      res.json({ ...result, servers }, 'DNS 配置已更新')
    } catch (e) {
      ctx.logOperation(ctx.currentUser(), '修改系统 DNS', e.message, null, 'failed')
      res.json(null, `DNS 配置失败: ${e.message}`, 500)
    }
    return true
  }

  // ---------------- SWAP ----------------
  if (pathname === '/api/v1/toolbox/swap' && method === 'GET') {
    try {
      res.json(await readSwap(ctx))
    } catch (e) {
      res.json(null, `读取虚拟内存状态失败: ${e.message}`, 500)
    }
    return true
  }

  if (pathname === '/api/v1/toolbox/swap' && method === 'POST') {
    const body = await ctx.parseBody(req, res)
    const sizeMb = Number(body?.size_mb)
    try {
      const result = await createSwap(ctx, sizeMb, body?.swappiness == null ? null : Number(body.swappiness))
      ctx.logOperation(ctx.currentUser(), '创建虚拟内存', `${sizeMb} MB @ ${result.swap_file}`)
      res.json(result, `虚拟内存已创建并启用（${sizeMb} MB）`)
    } catch (e) {
      ctx.logOperation(ctx.currentUser(), '创建虚拟内存', e.message, null, 'failed')
      res.json(null, e.message, 400)
    }
    return true
  }

  if (pathname === '/api/v1/toolbox/swap' && method === 'DELETE') {
    try {
      const result = await removeSwap(ctx)
      ctx.logOperation(ctx.currentUser(), '删除虚拟内存', result.removed)
      res.json(result, '虚拟内存已关闭并删除')
    } catch (e) {
      ctx.logOperation(ctx.currentUser(), '删除虚拟内存', e.message, null, 'failed')
      res.json(null, e.message, 500)
    }
    return true
  }

  if (pathname === '/api/v1/toolbox/swap/swappiness' && method === 'PUT') {
    const body = await ctx.parseBody(req, res)
    try {
      const result = await setSwappiness(ctx, body?.swappiness)
      ctx.logOperation(ctx.currentUser(), '调整 swappiness', String(result.swappiness))
      res.json(result, 'swappiness 已更新')
    } catch (e) {
      res.json(null, e.message, 400)
    }
    return true
  }

  // ---------------- 时区 ----------------
  if (pathname === '/api/v1/toolbox/timezone' && method === 'GET') {
    try {
      res.json(await readTimezone(ctx))
    } catch (e) {
      res.json(null, `读取时区失败: ${e.message}`, 500)
    }
    return true
  }

  if (pathname === '/api/v1/toolbox/timezone' && method === 'PUT') {
    const body = await ctx.parseBody(req, res)
    const tz = String(body?.timezone || '').trim()
    try {
      const result = await applyTimezone(ctx, tz)
      ctx.logOperation(ctx.currentUser(), '修改系统时区', tz)
      res.json(result, `时区已设置为 ${tz}`)
    } catch (e) {
      ctx.logOperation(ctx.currentUser(), '修改系统时区', `${tz}: ${e.message}`, null, 'failed')
      res.json(null, e.message, 400)
    }
    return true
  }

  // ---------------- hosts ----------------
  if (pathname === '/api/v1/toolbox/hosts' && method === 'GET') {
    try {
      res.json(await readHosts(ctx))
    } catch (e) {
      res.json(null, `读取 hosts 失败: ${e.message}`, 500)
    }
    return true
  }

  if (pathname === '/api/v1/toolbox/hosts' && method === 'PUT') {
    const body = await ctx.parseBody(req, res)
    const content = String(body?.content ?? '')
    const check = validateHostsContent(content)
    if (!check.ok) {
      res.json(null, check.message, 400)
      return true
    }
    try {
      const backup = backupAndWrite(p.HOSTS_FILE, content, 0o644)
      ctx.logOperation(ctx.currentUser(), '修改 hosts 文件', `${content.split('\n').length} 行`)
      res.json({ path: p.HOSTS_FILE, backup }, 'hosts 文件已保存（立即生效）')
    } catch (e) {
      ctx.logOperation(ctx.currentUser(), '修改 hosts 文件', e.message, null, 'failed')
      res.json(null, `保存 hosts 失败: ${e.message}`, 500)
    }
    return true
  }

  // ---------------- 镜像源 ----------------
  if (pathname === '/api/v1/toolbox/mirrors' && method === 'GET') {
    try {
      res.json(await readMirrors(ctx))
    } catch (e) {
      res.json(null, `读取镜像源配置失败: ${e.message}`, 500)
    }
    return true
  }

  if (pathname === '/api/v1/toolbox/mirrors' && method === 'PUT') {
    const body = await ctx.parseBody(req, res)
    try {
      const result = await applyMirror(ctx, body)
      ctx.logOperation(ctx.currentUser(), '切换软件源', `${result.mirror_id} → ${result.base_url}`)
      res.json(result, '软件源已切换，建议立即执行 apt-get update')
    } catch (e) {
      ctx.logOperation(ctx.currentUser(), '切换软件源', e.message, null, 'failed')
      res.json(null, e.message, 400)
    }
    return true
  }

  if (pathname === '/api/v1/toolbox/mirrors/update' && method === 'POST') {
    try {
      const result = await runAptUpdate()
      ctx.logOperation(ctx.currentUser(), '刷新软件源索引', 'apt-get update')
      res.json(result, '软件源索引已刷新')
    } catch (e) {
      ctx.logOperation(ctx.currentUser(), '刷新软件源索引', e.message, null, 'failed')
      res.json(null, e.message, 500)
    }
    return true
  }

  return false
}
