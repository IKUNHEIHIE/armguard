import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync, execFile } from 'child_process'

// =============================================================================
// Real host telemetry collectors.
//
// Rules (see AG-005): only report values that were actually read from the host.
// Anything unsupported / unreadable is reported as `null` (never a plausible
// fake value), with a collection timestamp so the UI can show staleness.
// =============================================================================

function readText(p) {
  try {
    return fs.readFileSync(p, 'utf8')
  } catch {
    return null
  }
}

function readTrim(p) {
  const t = readText(p)
  return t === null ? null : t.replace(/\0/g, '').trim()
}

function readInt(p) {
  const t = readTrim(p)
  if (t === null || t === '') return null
  const n = parseInt(t, 10)
  return Number.isFinite(n) ? n : null
}

function round(v, d = 1) {
  if (v === null || v === undefined || !Number.isFinite(v)) return null
  const f = Math.pow(10, d)
  return Math.round(v * f) / f
}

// -----------------------------------------------------------------------------
// Static host identity (read once)
// -----------------------------------------------------------------------------

export function getDistribution() {
  const text = readText('/etc/os-release') || readText('/usr/lib/os-release')
  if (!text) return null
  const fields = {}
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/)
    if (m) fields[m[1]] = m[2].replace(/^"|"$/g, '')
  }
  return fields.PRETTY_NAME || [fields.NAME, fields.VERSION].filter(Boolean).join(' ') || null
}

const BAD_DMI = /^(to be filled|default string|system product name|not specified|none|o\.e\.m|unknown)/i

export function getBoardModel() {
  const dt = readTrim('/proc/device-tree/model') || readTrim('/sys/firmware/devicetree/base/model')
  if (dt) return dt
  const vendor = readTrim('/sys/class/dmi/id/sys_vendor')
  const product = readTrim('/sys/class/dmi/id/product_name')
  const parts = [vendor, product].filter(v => v && !BAD_DMI.test(v))
  return parts.length ? parts.join(' ') : null
}

const ARM_PARTS = {
  '0x41': {
    '0xd03': 'Cortex-A53', '0xd04': 'Cortex-A35', '0xd05': 'Cortex-A55', '0xd07': 'Cortex-A57',
    '0xd08': 'Cortex-A72', '0xd09': 'Cortex-A73', '0xd0a': 'Cortex-A75', '0xd0b': 'Cortex-A76',
    '0xd0c': 'Neoverse-N1', '0xd0d': 'Cortex-A77', '0xd40': 'Neoverse-V1', '0xd41': 'Cortex-A78',
    '0xd44': 'Cortex-X1', '0xd46': 'Cortex-A510', '0xd47': 'Cortex-A710', '0xd48': 'Cortex-X2',
    '0xd49': 'Neoverse-N2', '0xd4d': 'Cortex-A715', '0xd4e': 'Cortex-X3', '0xd4f': 'Neoverse-V2',
    '0xd80': 'Cortex-A520', '0xd81': 'Cortex-A720', '0xd82': 'Cortex-X4'
  },
  '0x51': {
    '0x800': 'Kryo 2XX Gold', '0x801': 'Kryo 2XX Silver', '0x802': 'Kryo 3XX Gold',
    '0x803': 'Kryo 3XX Silver', '0x804': 'Kryo 4XX Gold', '0x805': 'Kryo 4XX Silver'
  }
}

export function getCpuModel() {
  const fromOs = (os.cpus()[0]?.model || '').trim()
  if (fromOs && !/^unknown$/i.test(fromOs)) return fromOs

  const text = readText('/proc/cpuinfo')
  if (!text) return null
  const modelName = text.match(/^model name\s*:\s*(.+)$/m)
  if (modelName && !/^ARMv/i.test(modelName[1])) return modelName[1].trim()

  // ARM: summarize CPU implementer/part pairs, e.g. "4x Cortex-A73 + 4x Cortex-A53"
  const counts = new Map()
  for (const block of text.split(/\n\s*\n/)) {
    const impl = block.match(/^CPU implementer\s*:\s*(0x[0-9a-f]+)/mi)
    const part = block.match(/^CPU part\s*:\s*(0x[0-9a-f]+)/mi)
    if (!impl || !part) continue
    const i = impl[1].toLowerCase()
    const p = part[1].toLowerCase()
    const name = ARM_PARTS[i]?.[p] || `implementer ${i} part ${p}`
    counts.set(name, (counts.get(name) || 0) + 1)
  }
  if (counts.size) {
    return [...counts.entries()].map(([n, c]) => `${c}x ${n}`).join(' + ')
  }
  const hw = text.match(/^Hardware\s*:\s*(.+)$/m)
  if (hw) return hw[1].trim()
  return modelName ? modelName[1].trim() : null
}

let hostIdentity = null
export function getHostIdentity() {
  if (!hostIdentity) {
    hostIdentity = {
      distribution: getDistribution(),
      board_model: getBoardModel(),
      cpu_model: getCpuModel()
    }
  }
  return hostIdentity
}

// -----------------------------------------------------------------------------
// CPU utilisation (per core, /proc/stat deltas)
// -----------------------------------------------------------------------------

function readCpuTimes() {
  const text = readText('/proc/stat')
  if (!text) return null
  const result = { total: null, cores: [] }
  for (const line of text.split('\n')) {
    const m = line.match(/^cpu(\d*)\s+(.+)$/)
    if (!m) continue
    const parts = m[2].trim().split(/\s+/).map(Number)
    // user nice system idle iowait irq softirq steal (guest fields are already in user/nice)
    const fields = parts.slice(0, 8)
    const idle = (fields[3] || 0) + (fields[4] || 0)
    const total = fields.reduce((a, b) => a + (b || 0), 0)
    const entry = { idle, total }
    if (m[1] === '') result.total = entry
    else result.cores[parseInt(m[1], 10)] = entry
  }
  return result.total ? result : null
}

function pct(prev, cur) {
  if (!prev || !cur) return null
  const dt = cur.total - prev.total
  const di = cur.idle - prev.idle
  if (dt <= 0) return null
  return round(Math.max(0, Math.min(100, (1 - di / dt) * 100)), 1)
}

let lastCpuTimes = readCpuTimes()

function sampleCpu() {
  const cur = readCpuTimes()
  if (!cur) return { percent: null, cores_percent: [] }
  const prev = lastCpuTimes
  lastCpuTimes = cur
  const coreCount = Math.max(cur.cores.length, os.cpus().length)
  const cores = []
  for (let i = 0; i < coreCount; i++) {
    // Offline cores disappear from /proc/stat → null
    cores.push(prev ? pct(prev.cores[i], cur.cores[i]) : null)
  }
  return { percent: prev ? pct(prev.total, cur.total) : null, cores_percent: cores }
}

// -----------------------------------------------------------------------------
// CPU frequency (cpufreq policies, big.LITTLE aware)
// -----------------------------------------------------------------------------

function parseCpuList(str) {
  if (!str) return []
  const out = []
  for (const part of str.trim().split(/[\s,]+/)) {
    if (!part) continue
    const m = part.match(/^(\d+)(?:-(\d+))?$/)
    if (!m) continue
    const a = parseInt(m[1], 10)
    const b = m[2] !== undefined ? parseInt(m[2], 10) : a
    for (let i = a; i <= b; i++) out.push(i)
  }
  return out
}

export function getCpuFreqPolicies() {
  const base = '/sys/devices/system/cpu/cpufreq'
  let entries = []
  try {
    entries = fs.readdirSync(base).filter(n => /^policy\d+$/.test(n))
  } catch {
    return []
  }
  entries.sort((a, b) => parseInt(a.slice(6), 10) - parseInt(b.slice(6), 10))
  return entries.map(name => {
    const dir = path.join(base, name)
    const toMhz = (khz) => (khz === null ? null : round(khz / 1000, 1))
    return {
      id: name,
      cpus: parseCpuList(readTrim(path.join(dir, 'related_cpus')) || readTrim(path.join(dir, 'affected_cpus'))),
      cur_mhz: toMhz(readInt(path.join(dir, 'scaling_cur_freq')) ?? readInt(path.join(dir, 'cpuinfo_cur_freq'))),
      min_mhz: toMhz(readInt(path.join(dir, 'scaling_min_freq'))),
      max_mhz: toMhz(readInt(path.join(dir, 'scaling_max_freq'))),
      hw_max_mhz: toMhz(readInt(path.join(dir, 'cpuinfo_max_freq'))),
      governor: readTrim(path.join(dir, 'scaling_governor'))
    }
  })
}

function summarizeFreq(policies) {
  const curs = policies.map(p => p.cur_mhz).filter(v => v !== null)
  const maxs = policies.map(p => p.max_mhz).filter(v => v !== null)
  const govs = [...new Set(policies.map(p => p.governor).filter(Boolean))]
  return {
    frequency_mhz: curs.length ? Math.max(...curs) : null,
    max_frequency_mhz: maxs.length ? Math.max(...maxs) : null,
    governor: govs.length ? govs.join(' / ') : null
  }
}

// -----------------------------------------------------------------------------
// Memory + swap
// -----------------------------------------------------------------------------

export function getRealMemStats() {
  const text = readText('/proc/meminfo')
  if (text) {
    const kv = {}
    for (const line of text.split('\n')) {
      const m = line.match(/^(\w+):\s+(\d+)/)
      if (m) kv[m[1]] = parseInt(m[2], 10) * 1024
    }
    const total = kv.MemTotal ?? null
    const avail = kv.MemAvailable ?? kv.MemFree ?? null
    const used = total !== null && avail !== null ? total - avail : null
    const swapTotal = kv.SwapTotal ?? null
    const swapFree = kv.SwapFree ?? null
    const swapUsed = swapTotal !== null && swapFree !== null ? swapTotal - swapFree : null
    return {
      total,
      used,
      free: avail,
      percent: total ? round((used / total) * 100, 1) : null,
      swap_total: swapTotal,
      swap_used: swapUsed,
      swap_percent: swapTotal ? round((swapUsed / swapTotal) * 100, 1) : (swapTotal === 0 ? 0 : null)
    }
  }
  // Non-Linux fallback: os module values are real, swap is unknown
  const total = os.totalmem()
  const free = os.freemem()
  return {
    total, used: total - free, free,
    percent: round(((total - free) / total) * 100, 1),
    swap_total: null, swap_used: null, swap_percent: null
  }
}

// -----------------------------------------------------------------------------
// Disk capacity (df, async, cached 30 s) + disk I/O (/proc/diskstats deltas)
// -----------------------------------------------------------------------------

function parseDf(stdout) {
  const lines = stdout.trim().split('\n')
  const parts = lines[lines.length - 1].trim().split(/\s+/)
  const total = parseInt(parts[1], 10)
  const used = parseInt(parts[2], 10)
  const free = parseInt(parts[3], 10)
  if (!(total > 0)) return null
  return { total, used, free, percent: round((used / total) * 100, 1) }
}

export function getRealDiskStats() {
  try {
    const child = spawnSync('df', ['-B1', '/'], { encoding: 'utf-8', timeout: 3000 })
    if (child.status === 0 && child.stdout) {
      const parsed = parseDf(child.stdout)
      if (parsed) return parsed
    }
  } catch {}
  return { total: null, used: null, free: null, percent: null }
}

let cachedDiskStats = { total: null, used: null, free: null, percent: null, status: 'pending', updated_at: null }
let lastDiskCheckTime = 0

function updateDiskStatsAsync() {
  const now = Date.now()
  if (now - lastDiskCheckTime < 30000) return
  lastDiskCheckTime = now
  execFile('df', ['-B1', '/'], { timeout: 3000 }, (err, stdout) => {
    const parsed = !err && stdout ? parseDf(stdout) : null
    if (parsed) {
      cachedDiskStats = { ...parsed, status: 'ok', updated_at: Date.now() }
    } else {
      cachedDiskStats = { total: null, used: null, free: null, percent: null, status: 'unavailable', updated_at: Date.now() }
    }
  })
}

function listPhysicalDisks() {
  try {
    return fs.readdirSync('/sys/block').filter(n => !/^(loop|ram|zram|dm-|md|sr|fd|nbd)/.test(n))
  } catch {
    return null
  }
}

let physicalDisks = listPhysicalDisks()
let lastDiskIo = null

function sampleDiskIo() {
  const text = readText('/proc/diskstats')
  if (!text || !physicalDisks) return { read_bytes_sec: null, write_bytes_sec: null }
  let readSectors = 0
  let writeSectors = 0
  for (const line of text.split('\n')) {
    const p = line.trim().split(/\s+/)
    if (p.length < 10) continue
    if (!physicalDisks.includes(p[2])) continue
    readSectors += parseInt(p[5], 10) || 0
    writeSectors += parseInt(p[9], 10) || 0
  }
  const now = Date.now()
  const prev = lastDiskIo
  lastDiskIo = { readSectors, writeSectors, time: now }
  if (!prev) return { read_bytes_sec: null, write_bytes_sec: null }
  const elapsed = (now - prev.time) / 1000
  if (elapsed <= 0) return { read_bytes_sec: null, write_bytes_sec: null }
  // /proc/diskstats sectors are always 512 bytes
  return {
    read_bytes_sec: Math.max(0, Math.round(((readSectors - prev.readSectors) * 512) / elapsed)),
    write_bytes_sec: Math.max(0, Math.round(((writeSectors - prev.writeSectors) * 512) / elapsed))
  }
}

// -----------------------------------------------------------------------------
// Network
// -----------------------------------------------------------------------------

let lastNetUsage = null

export function getRealNetworkStats() {
  const text = readText('/proc/net/dev')
  if (!text) return { rx_bytes_sec: null, tx_bytes_sec: null, total_rx_bytes: null, total_tx_bytes: null }
  let totalRx = 0
  let totalTx = 0
  for (const line of text.split('\n').slice(2)) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const iface = line.slice(0, idx).trim()
    if (iface === 'lo') continue
    const parts = line.slice(idx + 1).trim().split(/\s+/)
    totalRx += parseInt(parts[0], 10) || 0
    totalTx += parseInt(parts[8], 10) || 0
  }
  const now = Date.now()
  const prev = lastNetUsage
  lastNetUsage = { rx: totalRx, tx: totalTx, time: now }
  let rxSec = null
  let txSec = null
  if (prev) {
    const elapsed = (now - prev.time) / 1000
    if (elapsed > 0) {
      rxSec = Math.max(0, (totalRx - prev.rx) / elapsed)
      txSec = Math.max(0, (totalTx - prev.tx) / elapsed)
    }
  }
  return { rx_bytes_sec: rxSec, tx_bytes_sec: txSec, total_rx_bytes: totalRx, total_tx_bytes: totalTx }
}

// -----------------------------------------------------------------------------
// Thermal zones + Raspberry Pi vcgencmd (only where actually available)
// -----------------------------------------------------------------------------

const CPU_ZONE_RE = /cpu|soc|tsens|cluster|apc|x86_pkg|cpuss|core|bigcore|littlecore|aoss/i
const NON_CPU_ZONE_RE = /battery|bms|charger|chg|usb|skin|quiet|xo[-_]?therm|pa[-_]?therm|wlan|modem|camera|backlight|gpu|ddr|pmic|pm\d/i

export function readThermalZones() {
  const base = '/sys/class/thermal'
  let names = []
  try {
    names = fs.readdirSync(base).filter(n => /^thermal_zone\d+$/.test(n))
  } catch {
    return []
  }
  const zones = []
  for (const name of names) {
    const raw = readInt(path.join(base, name, 'temp'))
    if (raw === null) continue
    const tempC = Math.abs(raw) > 1000 ? raw / 1000 : raw
    // Ignore disabled/bogus sensors
    if (!(tempC > -40 && tempC < 150)) continue
    zones.push({ zone: name, type: readTrim(path.join(base, name, 'type')) || name, temp_c: round(tempC, 1) })
  }
  return zones
}

function pickCpuTemperature(zones) {
  const cpuZones = zones.filter(z => CPU_ZONE_RE.test(z.type) && !NON_CPU_ZONE_RE.test(z.type))
  const pool = cpuZones.length ? cpuZones : zones.filter(z => !NON_CPU_ZONE_RE.test(z.type))
  if (!pool.length) return { temp_c: null, source: null }
  const hottest = pool.reduce((a, b) => (b.temp_c > a.temp_c ? b : a))
  return { temp_c: hottest.temp_c, source: `${hottest.zone} (${hottest.type})${cpuZones.length ? '' : ' [non-CPU zone]'}` }
}

export function tempStatus(tempC) {
  if (tempC === null || tempC === undefined) return 'unknown'
  if (tempC >= 85) return 'critical'
  if (tempC >= 70) return 'hot'
  if (tempC >= 55) return 'warm'
  return 'normal'
}

const VCGENCMD = ['/usr/bin/vcgencmd', '/opt/vc/bin/vcgencmd', '/usr/local/bin/vcgencmd'].find(p => {
  try { return fs.existsSync(p) } catch { return false }
}) || null

let vcState = { available: Boolean(VCGENCMD), flags: null, voltage_v: null, updated_at: null, error: null }
let lastVcCheck = 0

function refreshVcgencmd() {
  if (!VCGENCMD) return
  const now = Date.now()
  if (now - lastVcCheck < 10000) return
  lastVcCheck = now
  execFile(VCGENCMD, ['get_throttled'], { timeout: 3000 }, (err, stdout) => {
    const m = !err && stdout ? stdout.match(/throttled=(0x[0-9a-f]+)/i) : null
    if (m) {
      vcState.flags = parseInt(m[1], 16)
      vcState.error = null
    } else {
      vcState.flags = null
      vcState.error = err ? err.message : 'unexpected output'
    }
    vcState.updated_at = Date.now()
  })
  execFile(VCGENCMD, ['measure_volts', 'core'], { timeout: 3000 }, (err, stdout) => {
    const m = !err && stdout ? stdout.match(/volt=([\d.]+)V/i) : null
    vcState.voltage_v = m ? parseFloat(m[1]) : null
  })
}

function buildThermal(freq) {
  const zones = readThermalZones()
  const { temp_c, source } = pickCpuTemperature(zones)
  refreshVcgencmd()
  const flags = vcState.flags
  const hasFlags = flags !== null
  return {
    temp_c,
    temp_status: tempStatus(temp_c),
    temp_source: source,
    zones: zones.slice(0, 32),
    // Raspberry Pi specific flags — null (unknown) on any other hardware
    throttle_source: hasFlags ? 'vcgencmd' : null,
    under_voltage: hasFlags ? Boolean(flags & 0x1) : null,
    freq_capped: hasFlags ? Boolean(flags & 0x2) : null,
    throttled: hasFlags ? Boolean(flags & 0x4) || Boolean(flags & 0x8) : null,
    throttling_flags_hex: hasFlags ? `0x${flags.toString(16)}` : null,
    voltage_v: vcState.voltage_v,
    freq_mhz: freq.frequency_mhz,
    max_freq_mhz: freq.max_frequency_mhz,
    governor: freq.governor,
    board_model: getHostIdentity().board_model,
    collected_at: Date.now()
  }
}

// -----------------------------------------------------------------------------
// Monitoring policy (Eco mode) — AG-014
// -----------------------------------------------------------------------------

export const NORMAL_INTERVAL_MS = 1000
export const ECO_INTERVAL_MS = 3000
const DEMAND_IDLE_MS = 30000

let settingsProvider = () => ({})
export function configureMonitoring(provider) {
  if (typeof provider === 'function') settingsProvider = provider
}

export function getMonitorPolicy() {
  const s = settingsProvider() || {}
  const enabled = s.eco_mode_enabled !== false
  let threshold = parseInt(s.eco_mode_threshold_mb, 10)
  if (!Number.isFinite(threshold)) threshold = 512
  threshold = Math.max(128, Math.min(65536, threshold))
  const cores = os.cpus().length || 1
  const memMb = Math.round(os.totalmem() / 1024 / 1024)
  const lowSpec = cores <= 1 || memMb <= threshold
  const active = enabled && lowSpec
  return {
    eco_mode_enabled: enabled,
    eco_mode_active: active,
    eco_mode_threshold_mb: threshold,
    eco_reason: !enabled ? 'disabled' : (lowSpec ? (cores <= 1 ? 'single_core' : 'low_memory') : 'host_not_low_spec'),
    interval_ms: active ? ECO_INTERVAL_MS : NORMAL_INTERVAL_MS,
    host_cores: cores,
    host_memory_mb: memMb
  }
}

// -----------------------------------------------------------------------------
// Snapshot sampler — only samples while someone is consuming telemetry
// -----------------------------------------------------------------------------

export let cachedTelemetry = {
  timestamp: null,
  cpu: { percent: null, cores_percent: [], frequency_mhz: null, max_frequency_mhz: null, governor: null, policies: [] },
  memory: getRealMemStats(),
  disk: { ...cachedDiskStats, read_bytes_sec: null, write_bytes_sec: null },
  network: { rx_bytes_sec: null, tx_bytes_sec: null, total_rx_bytes: null, total_tx_bytes: null },
  load_avg: [null, null, null]
}

export let cachedThermal = buildThermal({ frequency_mhz: null, max_frequency_mhz: null, governor: null })

export function updateTelemetrySnapshot() {
  const cpu = sampleCpu()
  const policies = getCpuFreqPolicies()
  const freq = summarizeFreq(policies)
  const mem = getRealMemStats()
  const net = getRealNetworkStats()
  const io = sampleDiskIo()
  const load = os.platform() === 'win32' ? [null, null, null] : os.loadavg().map(v => round(v, 2))
  updateDiskStatsAsync()

  cachedTelemetry = {
    timestamp: Date.now(),
    cpu: {
      percent: cpu.percent,
      cores_percent: cpu.cores_percent,
      frequency_mhz: freq.frequency_mhz,
      max_frequency_mhz: freq.max_frequency_mhz,
      governor: freq.governor,
      policies
    },
    memory: mem,
    disk: {
      total: cachedDiskStats.total,
      used: cachedDiskStats.used,
      free: cachedDiskStats.free,
      percent: cachedDiskStats.percent,
      status: cachedDiskStats.status,
      updated_at: cachedDiskStats.updated_at,
      read_bytes_sec: io.read_bytes_sec,
      write_bytes_sec: io.write_bytes_sec
    },
    network: net,
    load_avg: load
  }
  cachedThermal = buildThermal(freq)
}

let lastDemand = 0
let samplerTimer = null

function samplerLoop() {
  const policy = getMonitorPolicy()
  if (Date.now() - lastDemand < DEMAND_IDLE_MS) {
    try { updateTelemetrySnapshot() } catch (e) { console.error('[ArmGuard] telemetry sample failed:', e.message) }
  }
  samplerTimer = setTimeout(samplerLoop, policy.interval_ms)
  if (samplerTimer.unref) samplerTimer.unref()
}

/** Register that a client is consuming telemetry; samples immediately if stale. */
export function markTelemetryDemand() {
  const now = Date.now()
  lastDemand = now
  const policy = getMonitorPolicy()
  if (!cachedTelemetry.timestamp || now - cachedTelemetry.timestamp > policy.interval_ms * 2) {
    try { updateTelemetrySnapshot() } catch {}
  }
}

export function getTelemetry() {
  markTelemetryDemand()
  return cachedTelemetry
}

export function getThermal() {
  markTelemetryDemand()
  return cachedThermal
}

export function buildMonitorPayload() {
  markTelemetryDemand()
  const policy = getMonitorPolicy()
  return {
    realtime: cachedTelemetry,
    arm_thermal: cachedThermal,
    monitor: policy
  }
}

/** Latest overall CPU percent from the shared sampler (null if not yet known). */
export function getRealCPUPercent() {
  return getTelemetry().cpu.percent
}

samplerTimer = setTimeout(samplerLoop, NORMAL_INTERVAL_MS)
if (samplerTimer.unref) samplerTimer.unref()

// -----------------------------------------------------------------------------
// Processes
// -----------------------------------------------------------------------------

export function getRealProcesses(sort = 'cpu', limit = 15) {
  try {
    const sortFlag = sort === 'mem' ? '--sort=-%mem' : '--sort=-%cpu'
    const child = spawnSync('ps', ['-eo', 'pid,user,%cpu,%mem,stat,comm', sortFlag], { encoding: 'utf-8', timeout: 5000 })
    if (child.status === 0) {
      const lines = child.stdout.trim().split('\n').slice(1, limit + 1)
      return lines.map(line => {
        const parts = line.trim().split(/\s+/)
        const procName = parts.slice(5).join(' ') || 'process'
        return {
          pid: parseInt(parts[0], 10) || 0,
          name: procName,
          user: parts[1] || 'root',
          cpu_percent: parseFloat(parts[2]) || 0,
          mem_percent: parseFloat(parts[3]) || 0,
          mem_bytes: Math.round(((parseFloat(parts[3]) || 0) / 100) * os.totalmem()),
          status: parts[4] || 'S',
          command: procName
        }
      })
    }
  } catch {}
  return []
}

// -----------------------------------------------------------------------------
// Logs helpers — AG-012
// -----------------------------------------------------------------------------

function clampInt(value, min, max, def) {
  const n = parseInt(value, 10)
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, n))
}

const SERVICE_NAME_RE = /^[a-zA-Z0-9@._:-]{1,128}$/

/** Read the last `lines` lines of a file without loading huge files entirely. */
export function tailFile(filePath, lines = 200, maxBytes = 4 * 1024 * 1024) {
  const stat = fs.statSync(filePath)
  const size = stat.size
  const start = Math.max(0, size - maxBytes)
  const length = size - start
  const buf = Buffer.alloc(length)
  const fd = fs.openSync(filePath, 'r')
  try {
    fs.readSync(fd, buf, 0, length, start)
  } finally {
    fs.closeSync(fd)
  }
  let content = buf.toString('utf8')
  const all = content.split('\n')
  if (start > 0) all.shift() // drop partial first line
  return all.filter(l => l.length > 0).slice(-lines)
}

// -----------------------------------------------------------------------------
// HTTP routes
// -----------------------------------------------------------------------------

export async function handleSystem(pathname, req, res, url, ctx) {
  // System Info
  if (pathname === '/api/v1/system/info') {
    const id = getHostIdentity()
    const t = getTelemetry()
    res.json({
      hostname: os.hostname(),
      os: os.type(),
      distribution: id.distribution,
      kernel: os.release(),
      arch: os.arch(),
      uptime_seconds: Math.round(os.uptime()),
      cpu_model: id.cpu_model,
      cpu_cores: os.cpus().length,
      is_arm: os.arch().startsWith('arm'),
      arm_board_model: id.board_model,
      panel_version: ctx.PANEL_VERSION,
      build_commit: ctx.BUILD_COMMIT || ctx.runtime?.build_commit || '044b850',
      memory_total_bytes: t.memory.total,
      disk_total_bytes: t.disk.total
    })
    return true
  }

  // Realtime Monitor Snapshot
  if (pathname === '/api/v1/system/monitor/realtime') {
    const payload = buildMonitorPayload()
    res.json({ ...payload.realtime, monitor: payload.monitor })
    return true
  }

  // Real Processes List
  if (pathname === '/api/v1/system/processes') {
    const sort = url.searchParams.get('sort_by') || url.searchParams.get('sort') || 'cpu'
    const limit = clampInt(url.searchParams.get('limit'), 1, 200, 15)
    res.json({ list: getRealProcesses(sort, limit) })
    return true
  }

  // Kill Process (REV-008: default SIGTERM, optional explicit SIGKILL, protect panel/init PIDs)
  const killMatch = pathname.match(/^\/api\/v1\/system\/processes\/(\d+)\/kill$/)
  if (killMatch && req.method === 'POST') {
    const pid = parseInt(killMatch[1], 10)
    if (isNaN(pid) || pid <= 1) {
      res.json(null, '无效的进程 PID（禁止向 PID 1 发送终止信号）', 400)
      return true
    }
    if (pid === process.pid || (process.ppid && pid === process.ppid)) {
      res.json(null, `安全保护：禁止终止 ArmGuard 面板自身进程 (PID ${pid})`, 403)
      return true
    }
    let body = {}
    if (typeof ctx?.parseBody === 'function') {
      try { body = (await ctx.parseBody(req, res)) || {} } catch {}
    }
    const forceKill =
      body.force === true ||
      String(body.signal || '').toUpperCase() === 'SIGKILL' ||
      String(body.signal || '') === '9' ||
      url.searchParams.get('force') === 'true'
    const sigFlag = forceKill ? '-KILL' : '-TERM'
    const sigLabel = forceKill ? 'SIGKILL' : 'SIGTERM'
    try {
      const child = spawnSync('kill', [sigFlag, String(pid)], { encoding: 'utf-8', timeout: 5000 })
      if (!child.error && child.status === 0) {
        ctx.logOperation(ctx.currentUser(), `结束进程 (${sigLabel})`, `PID: ${pid}`)
        res.json({ pid, signal: sigLabel }, `已向进程 (PID: ${pid}) 发送 ${sigLabel} 信号`)
      } else {
        res.json(
          null,
          `结束进程失败 (${sigLabel}): ${(child.stderr || '').toString().trim() || child.error?.message || `exit ${child.status}`}`,
          500
        )
      }
    } catch (e) {
      res.json(null, e.message, 500)
    }
    return true
  }

  // Hardware Thermal
  if (pathname === '/api/v1/system/hardware/thermal') {
    res.json(getThermal())
    return true
  }

  // Operation Logs (paginated + filtered)
  if (pathname === '/api/v1/logs/operation') {
    const page = clampInt(url.searchParams.get('page'), 1, 100000, 1)
    const pageSize = clampInt(url.searchParams.get('page_size'), 1, 200, 20)
    const action = (url.searchParams.get('action') || '').trim().toLowerCase().slice(0, 100)
    const status = (url.searchParams.get('status') || '').trim()
    let logs = ctx.getOpsLogs()
    if (action) {
      logs = logs.filter(l => `${l.action || ''} ${l.target || ''} ${l.username || ''}`.toLowerCase().includes(action))
    }
    if (status) {
      logs = logs.filter(l => l.status === status)
    }
    const total = logs.length
    const list = logs.slice((page - 1) * pageSize, page * pageSize)
    res.json({ list, total, page, page_size: pageSize })
    return true
  }

  // System Journal Logs
  if (pathname === '/api/v1/logs/system') {
    const service = (url.searchParams.get('service') || 'all').trim()
    const lines = clampInt(url.searchParams.get('lines'), 1, 1000, 200)
    if (service !== 'all' && !SERVICE_NAME_RE.test(service)) {
      res.json(null, '无效的服务名称', 400)
      return true
    }
    const args = ['-n', String(lines), '--no-pager', '-o', 'short-iso']
    if (service !== 'all') args.push('-u', service)
    const child = spawnSync('journalctl', args, { encoding: 'utf-8', timeout: 10000, maxBuffer: 16 * 1024 * 1024 })
    if (child.error) {
      const reason = child.error.code === 'ENOENT' ? '系统未安装 journalctl (非 systemd 环境)' : child.error.message
      res.json(null, `读取系统日志失败: ${reason}`, 500)
      return true
    }
    if (child.status !== 0) {
      res.json(null, `读取系统日志失败: ${(child.stderr || '').trim() || `journalctl 退出码 ${child.status}`}`, 500)
      return true
    }
    const out = (child.stdout || '').split('\n').filter(Boolean)
    // journalctl prints "-- No entries --" when there is genuinely nothing to show
    const logs = out.filter(l => !/^-- No entries --$/.test(l.trim()))
    res.json({ logs, service, lines, empty: logs.length === 0 })
    return true
  }

  // Site (nginx) Logs
  const siteLogMatch = pathname.match(/^\/api\/v1\/logs\/site\/(\d+)$/)
  if (siteLogMatch && req.method === 'GET') {
    const siteId = parseInt(siteLogMatch[1], 10)
    const site = (ctx.sites || []).find(s => Number(s.id) === siteId)
    if (!site) {
      res.json(null, '站点不存在', 404)
      return true
    }
    const type = url.searchParams.get('type') === 'error' ? 'error' : 'access'
    const lines = clampInt(url.searchParams.get('lines'), 1, 1000, 200)
    const domain = String(site.domain || '')
    if (!ctx.isValidDomain(domain)) {
      res.json(null, '站点域名不合法，无法定位日志文件', 400)
      return true
    }
    const logFile = path.join('/var/log/nginx', `${domain}.${type}.log`)
    if (!fs.existsSync(logFile)) {
      res.json({ logs: [], file: logFile, exists: false, empty: true }, '日志文件尚未生成')
      return true
    }
    try {
      const logs = tailFile(logFile, lines)
      res.json({ logs, file: logFile, exists: true, empty: logs.length === 0 })
    } catch (e) {
      res.json(null, `读取站点日志失败: ${e.code === 'EACCES' ? '无权限读取日志文件' : e.message}`, 500)
    }
    return true
  }

  return false
}
