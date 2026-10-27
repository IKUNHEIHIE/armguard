import http from 'http'
import https from 'https'
import net from 'net'
import fs from 'fs'
import path from 'path'
import os from 'os'
import zlib from 'zlib'
import crypto from 'crypto'
import { AsyncLocalStorage } from 'async_hooks'
import { spawn, spawnSync, exec, execFile, execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { WebSocketServer } from 'ws'

import { hashPassword, verifyPassword, safeEqual, ensureInitialAdmin, writeFileAtomic, INITIAL_PASSWORD_FILENAME } from './lib/security.js'

// Route Handlers
import { handleAuth } from './routes/auth.js'
import { handleSystem, getTelemetry, getThermal, buildMonitorPayload, configureMonitoring, getMonitorPolicy, getRealProcesses, getRealMemStats, getRealDiskStats, getRealCPUPercent } from './routes/system.js'
import { handleFiles, isProtectedPath } from './routes/files.js'
import { handleSites } from './routes/sites.js'
import { handleDatabases } from './routes/databases.js'
import { handleDocker } from './routes/docker.js'
import { handleApps, invalidateMarketAppsCache } from './routes/apps.js'
import { handleSettings } from './routes/settings.js'
import { handleSecurity } from './routes/security.js'
import { handleCrontabs, syncCrontabToSystem } from './routes/crontabs.js'
import { handleSSL } from './routes/ssl.js'
import { handleAI, isAiConfigured, callUpstreamLLM, getSystemContextPrompt, DEFAULT_AI_CONFIG } from './routes/ai.js'
import { handleWarp, initWarpConfig, getRealWarpTrace, getWarpSystemHealth, warpConfig } from './routes/warp.js'
import { handleStream } from './routes/stream.js'
import { handleToolbox } from './routes/toolbox.js'

let pty = null
try {
  pty = await import('node-pty')
} catch (e) {
  console.log('[ArmGuard] node-pty fallback to standard spawn')
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let PANEL_VERSION = 'v0.2.0'
try {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'))
  if (pkg.version) PANEL_VERSION = `v${pkg.version}`
} catch {}

let BUILD_COMMIT = 'unknown'
try {
  const commitFile = path.resolve(__dirname, '../BUILD_COMMIT')
  if (fs.existsSync(commitFile)) {
    BUILD_COMMIT = fs.readFileSync(commitFile, 'utf8').trim() || 'unknown'
  } else {
    const gitRes = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf-8',
      timeout: 2000
    })
    if (gitRes.status === 0 && (gitRes.stdout || '').trim()) {
      BUILD_COMMIT = gitRes.stdout.trim()
    }
  }
} catch {}

const HOST = process.env.HOST || '::'
const DEFAULT_PORT = 8888
let DIST_DIR = path.resolve(__dirname, '../dist')
if (!fs.existsSync(DIST_DIR)) {
  DIST_DIR = path.resolve(__dirname, '../frontend/dist')
}

// In-Memory High-Speed Asset Cache with precomputed Gzip & ETag
const staticCache = new Map()

function getStaticFile(filePath) {
  try {
    const stat = fs.statSync(filePath)
    const mtime = stat.mtimeMs
    const cached = staticCache.get(filePath)
    if (cached && cached.mtime === mtime) {
      return cached
    }
    const raw = fs.readFileSync(filePath)
    const gzipped = zlib.gzipSync(raw, { level: 6 })
    const etag = `"${crypto.createHash('md5').update(raw).digest('hex')}"`
    const entry = { mtime, raw, gzipped, etag, size: raw.length, gzipSize: gzipped.length }
    staticCache.set(filePath, entry)
    return entry
  } catch {
    return null
  }
}

// Persistent Storage Directories
const DATA_DIR = process.env.ARMGUARD_DATA_DIR || '/var/lib/armguard'
const USERS_FILE = path.join(DATA_DIR, 'users.json')
const SITES_FILE = path.join(DATA_DIR, 'sites.json')
const DATABASES_FILE = path.join(DATA_DIR, 'databases.json')
const CERTS_FILE = path.join(DATA_DIR, 'certs.json')
const CRONTAB_FILE = path.join(DATA_DIR, 'crontab.json')
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json')
const AI_CONFIG_FILE = path.join(DATA_DIR, 'ai_config.json')
const OPS_LOG_FILE = path.join(DATA_DIR, 'operations.json')
const RUNTIME_FILE = path.join(DATA_DIR, 'runtime.json')
const BACKUP_DIR = process.env.ARMGUARD_BACKUP_DIR || '/var/backups/armguard'
const SSL_DIR = '/etc/ssl/armguard'
const NGINX_CONF_DIR = '/etc/nginx/conf.d'
const STREAM_CONF_DIR = '/etc/nginx/stream.d'
const STREAM_RULES_FILE = path.join(DATA_DIR, 'stream_rules.json')
const WWW_ROOT = '/www/wwwroot'

try {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 })
} catch (err) {
  console.error(`[ArmGuard] Cannot create data directory ${DATA_DIR}: ${err.message}`)
}
for (const dir of [BACKUP_DIR, SSL_DIR, WWW_ROOT, NGINX_CONF_DIR]) {
  try { fs.mkdirSync(dir, { recursive: true }) } catch {}
}

function loadJSON(filePath, defaultVal = []) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'))
    }
  } catch {}
  return defaultVal
}

const SENSITIVE_FILES = new Set([USERS_FILE, SETTINGS_FILE, AI_CONFIG_FILE])

function saveJSON(filePath, data) {
  try {
    writeFileAtomic(filePath, JSON.stringify(data, null, 2), SENSITIVE_FILES.has(filePath) ? 0o600 : 0o644)
    return true
  } catch (err) {
    console.error('Failed to save JSON:', filePath, err.message)
    return false
  }
}

// Per-request context (authenticated user + client IP) for audit logging
const requestContext = new AsyncLocalStorage()

function currentUser() {
  return requestContext.getStore()?.user || 'system'
}

let cachedOpsLogs = null
let opsLogSaveTimer = null

function getOpsLogs() {
  if (!cachedOpsLogs) {
    cachedOpsLogs = loadJSON(OPS_LOG_FILE, [])
  }
  return cachedOpsLogs
}

function logOperation(username, action, target, ip = null, status = 'success') {
  if (!cachedOpsLogs) {
    cachedOpsLogs = loadJSON(OPS_LOG_FILE, [])
  }
  const store = requestContext.getStore()
  cachedOpsLogs.unshift({
    id: Date.now(),
    username: username || store?.user || 'system',
    action,
    target,
    ip: ip || store?.ip || '127.0.0.1',
    user_agent: 'ArmGuard Web Client',
    status,
    created_at: new Date().toLocaleString()
  })
  if (cachedOpsLogs.length > 500) {
    cachedOpsLogs.length = 500
  }
  if (opsLogSaveTimer) clearTimeout(opsLogSaveTimer)
  opsLogSaveTimer = setTimeout(() => {
    saveJSON(OPS_LOG_FILE, cachedOpsLogs)
  }, 1000)
}

// -----------------------------------------------------------------------------
// Sessions (AG-009 idle timeout / AG-011 real identity)
// -----------------------------------------------------------------------------
const SESSION_ABSOLUTE_MS = 24 * 3600 * 1000
const activeSessions = new Map()

function clampInt(value, min, max, def) {
  const n = parseInt(value, 10)
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, n))
}

function getSessionPolicy() {
  const idleMinutes = clampInt(settings?.session_timeout_minutes, 5, 1440, 120)
  return { idleMinutes, idleMs: idleMinutes * 60000, absoluteMs: SESSION_ABSOLUTE_MS }
}

function primaryAdminName() {
  const users = loadJSON(USERS_FILE, [])
  return (Array.isArray(users) && users[0]?.username) || 'admin'
}

function generateSessionToken(username) {
  const randomBytes = crypto.randomBytes(24).toString('hex')
  const token = `ag_live_${randomBytes}`
  const now = Date.now()
  activeSessions.set(token, {
    username,
    createdAt: now,
    lastActivity: now,
    absoluteExpiresAt: now + SESSION_ABSOLUTE_MS
  })
  return token
}

function revokeSessionToken(token) {
  if (!token) return false
  return activeSessions.delete(token)
}

/** Rename the identity on all live sessions (admin username change). */
function renameSessions(oldName, newName) {
  for (const s of activeSessions.values()) {
    if (s.username === oldName) s.username = newName
  }
}

/** Revoke every session of a user except `keepToken` (password change). */
function revokeUserSessions(username, keepToken = null) {
  let n = 0
  for (const [tok, s] of activeSessions.entries()) {
    if (s.username === username && tok !== keepToken) {
      activeSessions.delete(tok)
      n++
    }
  }
  return n
}

/**
 * Resolve a token to a session. Returns null when unknown/expired.
 * `touch` updates the idle-timeout clock (only for genuine user activity).
 */
function getSession(token, { touch = true } = {}) {
  if (!token) return null
  const s = activeSessions.get(token)
  if (s) {
    const now = Date.now()
    const { idleMs } = getSessionPolicy()
    if (now > s.absoluteExpiresAt || now - s.lastActivity > idleMs) {
      activeSessions.delete(token)
      return null
    }
    if (touch) s.lastActivity = now
    return { token, type: 'session', username: s.username, expiresAt: Math.min(s.absoluteExpiresAt, s.lastActivity + idleMs) }
  }
  const apiToken = settings?.api_token
  if (apiToken && safeEqual(token, apiToken)) {
    return { token, type: 'api_token', username: primaryAdminName(), expiresAt: null }
  }
  return null
}

function isValidToken(token) {
  return Boolean(getSession(token, { touch: false }))
}

setInterval(() => {
  const now = Date.now()
  const { idleMs } = getSessionPolicy()
  for (const [tok, s] of activeSessions.entries()) {
    if (now > s.absoluteExpiresAt || now - s.lastActivity > idleMs) activeSessions.delete(tok)
  }
  for (const [t, rec] of downloadTickets.entries()) {
    if (rec.expiresAt < now) downloadTickets.delete(t)
  }
}, 60 * 1000).unref()

// -----------------------------------------------------------------------------
// Short-lived, single-use download tickets (AG-007)
// Long-lived session tokens never appear in download URLs.
// -----------------------------------------------------------------------------
const DOWNLOAD_TICKET_TTL_MS = 60 * 1000
const DOWNLOAD_PATHS = new Set([
  '/api/v1/files/download',
  '/api/v1/databases/backup/download',
  '/api/v1/settings/backup/download'
])
const downloadTickets = new Map()

function canonicalQuery(searchParams) {
  const copy = new URLSearchParams(searchParams)
  copy.delete('dl_ticket')
  copy.delete('token')
  copy.sort()
  return copy.toString()
}

function createDownloadTicket(target, username) {
  let parsed
  try {
    parsed = new URL(String(target || ''), 'http://armguard.local')
  } catch {
    return null
  }
  if (!DOWNLOAD_PATHS.has(parsed.pathname)) return null
  const query = canonicalQuery(parsed.searchParams)
  const ticket = crypto.randomBytes(24).toString('hex')
  const expiresAt = Date.now() + DOWNLOAD_TICKET_TTL_MS
  downloadTickets.set(ticket, { pathname: parsed.pathname, query, username, expiresAt })
  const sep = query ? '&' : ''
  return { url: `${parsed.pathname}?${query}${sep}dl_ticket=${ticket}`, expires_in: DOWNLOAD_TICKET_TTL_MS / 1000 }
}

function consumeDownloadTicket(req, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return null
  const ticket = url.searchParams.get('dl_ticket')
  if (!ticket) return null
  const rec = downloadTickets.get(ticket)
  if (!rec) return null
  if (rec.expiresAt < Date.now()) {
    downloadTickets.delete(ticket)
    return null
  }
  if (rec.pathname !== url.pathname || rec.query !== canonicalQuery(url.searchParams)) return null
  if (req.method === 'GET') downloadTickets.delete(ticket) // single use
  return { token: null, type: 'download_ticket', username: rec.username, expiresAt: rec.expiresAt }
}

function isValidDomain(domain) {
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(domain)
}

// Telemetry and background polling must not keep an idle session alive forever (REV-003)
const PASSIVE_ENDPOINTS = new Set([
  '/api/v1/system/monitor/realtime',
  '/api/v1/system/hardware/thermal',
  '/api/v1/system/processes',
  '/api/v1/apps/tasks'
])

function isPassiveRequest(req, url) {
  if (PASSIVE_ENDPOINTS.has(url.pathname)) return true
  if (/^\/api\/v1\/apps\/[^/]+\/install-progress$/.test(url.pathname)) return true
  if (req.headers['x-ag-passive'] === '1' || url.searchParams.get('passive') === '1') return true
  return false
}

function extractRequestToken(req) {
  const authHeader = req.headers['authorization'] || ''
  if (authHeader.startsWith('Bearer ')) return authHeader.substring(7).trim()
  if (req.headers['x-api-token']) return req.headers['x-api-token'].toString().trim()
  return ''
}

/** Returns the authenticated session or null (after writing a 401). */
function checkAuth(req, res, url) {
  const token = extractRequestToken(req)
  let session = token ? getSession(token, { touch: !isPassiveRequest(req, url) }) : null
  if (!session && !token) {
    session = consumeDownloadTicket(req, url)
  }
  if (!session) {
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ code: 401, message: '未授权：请先登录或提供有效的 Token（会话可能已超时）' }))
    return null
  }
  return session
}

// Request Body Parser
function parseBody(req, res, maxBytes = 20 * 1024 * 1024) {
  return new Promise((resolve) => {
    let body = ''
    let size = 0
    req.on('data', chunk => {
      size += chunk.length
      if (size > maxBytes) {
        req.destroy()
        if (res && !res.headersSent) {
          res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ code: 413, message: '请求体过大 (Payload Too Large)' }))
        }
        return
      }
      body += chunk
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'))
      } catch {
        resolve({})
      }
    })
  })
}

// Multipart Form Parser
function parseMultipart(req, maxBytes = 100 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || ''
    const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)
    if (!match) return reject(new Error('Invalid multipart request: missing boundary'))
    const boundaryStr = '--' + (match[1] || match[2]).trim()
    const boundary = Buffer.from(boundaryStr)
    const chunks = []
    let totalLen = 0

    req.on('data', chunk => {
      totalLen += chunk.length
      if (totalLen > maxBytes) {
        req.destroy()
        return reject(new Error('Upload size exceeded limit (100MB)'))
      }
      chunks.push(chunk)
    })

    req.on('end', () => {
      const buffer = Buffer.concat(chunks)
      let offset = 0
      const fields = {}
      const files = []

      while (offset < buffer.length) {
        const bIdx = buffer.indexOf(boundary, offset)
        if (bIdx === -1) break
        offset = bIdx + boundary.length

        if (buffer[offset] === 0x2D && buffer[offset + 1] === 0x2D) break
        if (buffer[offset] === 0x0D && buffer[offset + 1] === 0x0A) offset += 2

        const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), offset)
        if (headerEnd === -1) break

        const headerStr = buffer.slice(offset, headerEnd).toString('utf8')
        const bodyStart = headerEnd + 4

        const nextB = buffer.indexOf(boundary, bodyStart)
        if (nextB === -1) break

        let bodyEnd = nextB
        if (bodyEnd >= 2 && buffer[bodyEnd - 2] === 0x0D && buffer[bodyEnd - 1] === 0x0A) {
          bodyEnd -= 2
        }

        const partBody = buffer.slice(bodyStart, bodyEnd)
        offset = nextB

        const nameMatch = headerStr.match(/name="([^"]+)"/)
        const filenameMatch = headerStr.match(/filename="([^"]+)"/)

        if (nameMatch) {
          const fieldName = nameMatch[1]
          if (filenameMatch) {
            files.push({
              fieldName,
              filename: path.basename(filenameMatch[1]),
              data: partBody
            })
          } else {
            fields[fieldName] = partBody.toString('utf8')
          }
        }
      }
      resolve({ fields, files })
    })
    req.on('error', reject)
  })
}

// In-Memory Data Collections
let sites = loadJSON(SITES_FILE, [
  {
    id: 1,
    domain: 'default',
    domains: ['localhost', '127.0.0.1'],
    path: '/opt/armguard',
    php_version: '8.3',
    ssl_enabled: false,
    status: 'running',
    created_at: new Date().toLocaleDateString(),
    sub_dir: '',
    port: 80,
    rewrite_preset: 'spa',
    custom_rewrite: '',
    proxy_enabled: false,
    proxy_pass: '',
    proxy_path: '/',
    websocket_enabled: true,
    basic_auth_enabled: false,
    basic_auth_user: '',
    basic_auth_pass: '',
    ip_white_list: '',
    ip_black_list: '',
    anti_leech_enabled: false,
    anti_leech_exts: 'png|jpg|jpeg|gif|zip|tar|gz',
    flow_limit_enabled: false,
    flow_limit_rate_kb: 512,
    flow_limit_burst: 20
  }
])

let databases = loadJSON(DATABASES_FILE, [
  {
    id: 1,
    type: 'sqlite',
    db_name: 'armguard_core.db',
    username: 'root',
    character_set: 'UTF-8',
    size_bytes: 14 * 1024 * 1024,
    status: 'active',
    backup_count: 0,
    created_at: new Date().toLocaleString()
  }
])

let sslCerts = loadJSON(CERTS_FILE, [])
let crontabs = loadJSON(CRONTAB_FILE, [])
let streamRules = loadJSON(STREAM_RULES_FILE, [])

if (crontabs.length === 0) {
  try {
    const child = spawnSync('crontab', ['-l'], { encoding: 'utf-8' })
    const out = (child.stdout || '').trim()
    const rawLines = out.split('\n').filter(l => l && !l.startsWith('#'))
    rawLines.forEach((l, idx) => {
      const parts = l.split(/\s+/)
      const sched = parts.slice(0, 5).join(' ')
      const cmd = parts.slice(5).join(' ')
      crontabs.push({
        id: Date.now() + idx,
        name: `系统同步任务 #${idx + 1}`,
        schedule: sched,
        command: cmd,
        status: 'enabled',
        last_run_at: null,
        last_run_status: null,
        last_run_duration_ms: null,
        created_at: new Date().toLocaleString()
      })
    })
    if (crontabs.length > 0) saveJSON(CRONTAB_FILE, crontabs)
  } catch {}
}

const SETTINGS_DEFAULTS = {
  port: DEFAULT_PORT,
  security_entrance: '/armguard',
  ssl_enabled: false,
  panel_ssl_cert: '',
  panel_ssl_key: '',
  session_timeout_minutes: 120,
  max_login_retry: 5,
  login_lock_minutes: 15,
  eco_mode_enabled: true,
  eco_mode_threshold_mb: 512,
  timezone: 'Asia/Shanghai',
  hostname: os.hostname()
}

// Defaults are merged so that upgrades pick up new keys without losing saved values
let settings = { ...SETTINGS_DEFAULTS, ...loadJSON(SETTINGS_FILE, {}) }
configureMonitoring(() => settings)

let aiConfig = loadJSON(AI_CONFIG_FILE, DEFAULT_AI_CONFIG)

// IP Whitelist & Network Helpers
function matchCidr(ip, cidr) {
  try {
    const [range, bits = '32'] = cidr.split('/')
    const mask = ~(2 ** (32 - parseInt(bits, 10)) - 1)
    const ip2long = (ipStr) => ipStr.split('.').reduce((acc, oct) => (acc << 8) + parseInt(oct, 10), 0) >>> 0
    return (ip2long(ip) & mask) === (ip2long(range) & mask)
  } catch {
    return false
  }
}

function isIpAllowed(clientIp, whitelistStr) {
  if (!whitelistStr || !whitelistStr.trim()) return true
  const list = whitelistStr.split(/[\n,;]/).map(s => s.trim()).filter(Boolean)
  if (list.length === 0) return true
  const cleanIp = (clientIp || '').replace(/^::ffff:/, '').trim()
  if (cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp === 'localhost') return true
  for (const item of list) {
    const cleanItem = item.replace(/^::ffff:/, '').trim()
    if (cleanItem === cleanIp || item === clientIp) return true
    if (cleanItem.includes('/') && cleanIp.includes('.')) {
      if (matchCidr(cleanIp, cleanItem)) return true
    }
  }
  return false
}

function parseCookies(req) {
  const list = {}
  const rc = req.headers['cookie']
  if (!rc) return list
  rc.split(';').forEach(cookie => {
    const parts = cookie.split('=')
    list[parts.shift().trim()] = decodeURI(parts.join('=').trim())
  })
  return list
}

function getClientIp(req, currentSettings = null) {
  const socketIp = (req.socket?.remoteAddress || '127.0.0.1').replace(/^::ffff:/, '').trim()
  if (currentSettings && currentSettings.trust_proxy) {
    if (socketIp === '127.0.0.1' || socketIp === '::1' || socketIp === 'localhost') {
      const xff = req.headers['x-forwarded-for']
      if (xff) {
        const client = xff.split(',')[0].trim().replace(/^::ffff:/, '')
        if (client) return client
      }
    }
  }
  return socketIp
}

// -----------------------------------------------------------------------------
// Listen port / protocol resolution (AG-009 HTTPS, AG-010 port)
// Priority: PORT env > saved settings.port > 8888. Saved changes apply on restart.
// -----------------------------------------------------------------------------
function isValidPort(p) {
  return Number.isInteger(p) && p >= 1 && p <= 65535
}

function resolveListenPort() {
  if (process.env.PORT) {
    const p = parseInt(process.env.PORT, 10)
    if (isValidPort(p)) return { port: p, source: 'env' }
    console.error(`[ArmGuard] Ignoring invalid PORT env value: ${process.env.PORT}`)
  }
  const saved = parseInt(settings.port, 10)
  if (isValidPort(saved)) return { port: saved, source: 'settings' }
  return { port: DEFAULT_PORT, source: 'default' }
}

/** Validate a certificate/key pair for the panel's own HTTPS listener. */
function validatePanelTls(certPath, keyPath) {
  if (!certPath || !keyPath) return { ok: false, error: '必须同时提供证书 (PEM) 与私钥 (PEM) 的文件路径' }
  if (!path.isAbsolute(certPath) || !path.isAbsolute(keyPath)) return { ok: false, error: '证书与私钥必须使用绝对路径' }
  let certPem, keyPem
  try {
    certPem = fs.readFileSync(certPath)
    keyPem = fs.readFileSync(keyPath)
  } catch (e) {
    return { ok: false, error: `无法读取证书或私钥: ${e.message}` }
  }
  try {
    const x509 = new crypto.X509Certificate(certPem)
    const key = crypto.createPrivateKey(keyPem)
    if (!x509.checkPrivateKey(key)) return { ok: false, error: '私钥与证书不匹配' }
    const validTo = new Date(x509.validTo)
    const validFrom = new Date(x509.validFrom)
    const now = new Date()
    if (validTo < now) return { ok: false, error: `证书已于 ${validTo.toISOString()} 过期` }
    if (validFrom > now) return { ok: false, error: `证书尚未生效 (生效时间 ${validFrom.toISOString()})` }
    return {
      ok: true, cert: certPem, key: keyPem,
      subject: x509.subject, issuer: x509.issuer, valid_to: validTo.toISOString(),
      self_signed: x509.subject === x509.issuer
    }
  } catch (e) {
    return { ok: false, error: `证书或私钥格式无效: ${e.message}` }
  }
}

const listenPlan = resolveListenPort()
const runtime = {
  pid: process.pid,
  host: HOST,
  port: listenPlan.port,
  port_source: listenPlan.source,
  protocol: 'http',
  ssl_error: null,
  started_at: new Date().toISOString(),
  version: PANEL_VERSION,
  build_commit: BUILD_COMMIT
}

let tlsOptions = null
if (settings.ssl_enabled) {
  if (process.env.ARMGUARD_FORCE_HTTP === '1') {
    runtime.ssl_error = 'ARMGUARD_FORCE_HTTP=1：本机恢复模式，已强制使用 HTTP'
  } else {
    const tls = validatePanelTls(settings.panel_ssl_cert, settings.panel_ssl_key)
    if (tls.ok) {
      tlsOptions = { cert: tls.cert, key: tls.key }
      runtime.protocol = 'https'
    } else {
      runtime.ssl_error = tls.error
      console.error(`[ArmGuard] Panel HTTPS is enabled in settings but cannot be used: ${tls.error}. Falling back to HTTP.`)
    }
  }
}

// Shared Application Context Object
const ctx = {
  DATA_DIR, USERS_FILE, SITES_FILE, DATABASES_FILE, CERTS_FILE, CRONTAB_FILE,
  SETTINGS_FILE, AI_CONFIG_FILE, OPS_LOG_FILE, BACKUP_DIR, SSL_DIR, NGINX_CONF_DIR, WWW_ROOT,
  STREAM_RULES_FILE, STREAM_CONF_DIR, PANEL_VERSION, BUILD_COMMIT, INITIAL_PASSWORD_FILE: path.join(DATA_DIR, INITIAL_PASSWORD_FILENAME),
  sites, databases, sslCerts, crontabs, streamRules, settings, aiConfig, runtime,
  loadJSON, saveJSON, getOpsLogs, logOperation, hashPassword, verifyPassword, currentUser,
  generateSessionToken, revokeSessionToken, isValidToken, getSession, getSessionPolicy, renameSessions, revokeUserSessions,
  createDownloadTicket, extractRequestToken, validatePanelTls, isValidPort,
  isValidDomain, parseBody, parseMultipart,
  isProtectedPath, staticCache, getStaticFile, getClientIp, getMonitorPolicy,
  get cachedTelemetry() { return getTelemetry() },
  get cachedThermal() { return getThermal() },
  getRealProcesses, getRealMemStats, getRealDiskStats, getRealCPUPercent
}

initWarpConfig(ctx)

// HTTP(S) request handler
async function handleHttpRequest(req, res) {
  // Baseline Security Headers (REV-004)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'same-origin')
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https://img.shields.io; connect-src 'self' ws: wss:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  )
  if (runtime.protocol === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }

  const currentSettings = loadJSON(SETTINGS_FILE, settings)
  const clientIp = getClientIp(req, currentSettings)
  const reqStore = requestContext.getStore()
  if (reqStore) reqStore.ip = clientIp

  // 1. IP Whitelist Enforcement
  if (!isIpAllowed(clientIp, currentSettings.ip_whitelist)) {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ code: 403, message: '访问被拒绝：您的 IP 不在受信任白名单内' }))
    return
  }

  // 2. Strict CORS Handling
  const origin = req.headers['origin']
  if (origin) {
    const host = req.headers['host']
    try {
      const parsed = new URL(origin)
      if (parsed.host === host || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        res.setHeader('Access-Control-Allow-Origin', origin)
        res.setHeader('Access-Control-Allow-Credentials', 'true')
      }
    } catch {}
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Token, X-Security-Entrance')

  res.json = (data = null, message = 'ok', code = 0) => {
    if (res.headersSent) return
    res.writeHead(code === 0 ? 200 : (code >= 400 && code < 600 ? code : 200), { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ code, message, data }))
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`)
  const pathname = url.pathname
  const secEntrance = (currentSettings.security_entrance || '').trim()

  // 3. Security Entrance Handling (e.g. /armguard)
  if (secEntrance && secEntrance !== '/' && (pathname === secEntrance || pathname === `${secEntrance}/`)) {
    res.writeHead(302, {
      'Set-Cookie': `ag_entrance=1; Path=/; HttpOnly; SameSite=Lax${runtime.protocol === 'https' ? '; Secure' : ''}`,
      'Location': '/'
    })
    res.end()
    return
  }

  const cookies = parseCookies(req)
  const hasEntranceCookie = cookies['ag_entrance'] === '1'
  const authHeader = req.headers['authorization'] || ''
  const hasValidToken = authHeader.startsWith('Bearer ') && isValidToken(authHeader.substring(7).trim())

  // API Dispatch Router
  if (pathname.startsWith('/api/v1/')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')

    // 4. Require Security Entrance for Login API
    if (pathname === '/api/v1/auth/login' && req.method === 'POST') {
      const entrancePass = !secEntrance || secEntrance === '/' || hasEntranceCookie || req.headers['x-security-entrance'] === secEntrance
      if (!entrancePass) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ code: 404, message: 'Not Found' }))
        return
      }
    }

    // Public Auth routes
    if (pathname === '/api/v1/auth/captcha' || (pathname === '/api/v1/auth/login' && req.method === 'POST')) {
      if (await handleAuth(pathname, req, res, url, ctx)) return
    }

    // Authentication Enforcement Middleware
    const session = checkAuth(req, res, url)
    if (!session) {
      return
    }
    req.session = session
    if (reqStore) reqStore.user = session.username

    // 3. Modular Business Route Pipeline
    if (await handleAuth(pathname, req, res, url, ctx)) return
    if (await handleSystem(pathname, req, res, url, ctx)) return
    if (await handleFiles(pathname, req, res, url, ctx)) return
    if (await handleSites(pathname, req, res, url, ctx)) return
    if (await handleDatabases(pathname, req, res, url, ctx)) return
    if (await handleDocker(pathname, req, res, url, ctx)) return
    if (await handleApps(pathname, req, res, url, ctx)) return
    if (await handleSettings(pathname, req, res, url, ctx)) return
    if (await handleSecurity(pathname, req, res, url, ctx)) return
    if (await handleCrontabs(pathname, req, res, url, ctx)) return
    if (await handleSSL(pathname, req, res, url, ctx)) return
    if (await handleAI(pathname, req, res, url, ctx)) return
    if (await handleWarp(pathname, req, res, url, ctx)) return
    if (await handleStream(pathname, req, res, url, ctx)) return
    if (await handleToolbox(pathname, req, res, url, ctx)) return

    // Fallback for unmatched API endpoints - standard 404
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ code: 404, message: `API 接口不存在 (Endpoint Not Found): ${pathname}`, data: null }))
    return
  }

  // Disguise 404 page if security entrance is configured and not yet entered
  if (secEntrance && secEntrance !== '/' && !hasEntranceCookie && !hasValidToken) {
    if (pathname === '/' || pathname === '/index.html') {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end('<!DOCTYPE html><html><head><title>404 Not Found</title></head><body><center><h1>404 Not Found</h1></center><hr><center>nginx</center></body></html>')
      return
    }
  }

  // Static frontend dist with High-Performance Gzip Compression & Immutable Caching
  let filePath = path.join(DIST_DIR, pathname === '/' ? 'index.html' : pathname)
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html')
  }

  const ext = path.extname(filePath).toLowerCase()
  const mimeTypes = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
    '.ico': 'image/x-icon'
  }

  const contentType = mimeTypes[ext] || 'application/octet-stream'
  const fileData = getStaticFile(filePath)

  if (!fileData) {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
    return
  }

  // ETag 304 Not Modified validation
  const ifNoneMatch = req.headers['if-none-match']
  if (ifNoneMatch && ifNoneMatch === fileData.etag) {
    res.writeHead(304)
    res.end()
    return
  }

  const headers = {
    'Content-Type': contentType,
    'ETag': fileData.etag,
    'Vary': 'Accept-Encoding'
  }

  if (pathname.startsWith('/assets/')) {
    headers['Cache-Control'] = 'public, max-age=31536000, immutable'
  } else if (ext === '.html') {
    // SPA 入口必须每次向服务器校验：浏览器缓存住旧 index.html 会连带使用旧哈希的
    // JS/CSS，升级后用户看到的是上一个版本（图标、交互都没更新），极易误判成功能没修好。
    headers['Cache-Control'] = 'no-store, no-cache, must-revalidate'
    headers['Pragma'] = 'no-cache'
  } else {
    headers['Cache-Control'] = 'no-cache, must-revalidate'
  }

  const acceptEncoding = req.headers['accept-encoding'] || ''
  const compressible = ['.html', '.js', '.css', '.json', '.svg'].includes(ext)

  if (compressible && acceptEncoding.includes('gzip')) {
    headers['Content-Encoding'] = 'gzip'
    headers['Content-Length'] = fileData.gzipSize
    res.writeHead(200, headers)
    res.end(fileData.gzipped)
  } else {
    headers['Content-Length'] = fileData.size
    res.writeHead(200, headers)
    res.end(fileData.raw)
  }
}

// -----------------------------------------------------------------------------
// HTTP / HTTPS server
// -----------------------------------------------------------------------------
function requestListener(req, res) {
  requestContext.run({ user: null, ip: null }, () => {
    handleHttpRequest(req, res).catch(err => {
      console.error('[ArmGuard] Unhandled request error:', err)
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ code: 500, message: `服务器内部错误: ${err.message}`, data: null }))
      } else {
        try { res.end() } catch {}
      }
    })
  })
}

const server = tlsOptions ? https.createServer(tlsOptions, requestListener) : http.createServer(requestListener)

// -----------------------------------------------------------------------------
// WebSocket Server with strict handshake authentication (AG-006)
// Token is passed via the Sec-WebSocket-Protocol header: ['armguard.v1', <token>]
// -----------------------------------------------------------------------------
const WS_PROTOCOL = 'armguard.v1'
const WS_PATHS = new Set(['/terminal/ws', '/system/monitor/ws'])

const wss = new WebSocketServer({
  noServer: true,
  handleProtocols: (protocols) => {
    if (protocols.has(WS_PROTOCOL)) return WS_PROTOCOL
    return false
  }
})

function rejectUpgrade(socket, status, text) {
  try {
    socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
  } catch {}
  socket.destroy()
}

server.on('upgrade', (req, socket, head) => {
  try {
    const currentSettings = loadJSON(SETTINGS_FILE, settings)
    const clientIp = getClientIp(req, currentSettings)

    // 1. Enforce IP Whitelist on WebSocket handshake
    if (!isIpAllowed(clientIp, currentSettings.ip_whitelist)) {
      return rejectUpgrade(socket, 403, 'Forbidden')
    }

    // 2. Enforce Security Entrance on WebSocket handshake
    const secEntrance = (currentSettings.security_entrance || '').trim()
    const cookies = parseCookies(req)
    const hasEntranceCookie = cookies['ag_entrance'] === '1'
    if (secEntrance && secEntrance !== '/' && !hasEntranceCookie) {
      return rejectUpgrade(socket, 404, 'Not Found')
    }

    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`)
    if (!WS_PATHS.has(url.pathname)) {
      return rejectUpgrade(socket, 404, 'Not Found')
    }

    // 3. Enforce Token authentication on WebSocket handshake
    let session = null
    const authHeader = req.headers['authorization'] || ''
    if (authHeader.startsWith('Bearer ')) {
      session = getSession(authHeader.substring(7).trim(), { touch: false })
    }
    if (!session && req.headers['sec-websocket-protocol']) {
      const offered = req.headers['sec-websocket-protocol'].split(',').map(s => s.trim()).filter(Boolean)
      for (const candidate of offered) {
        if (candidate === WS_PROTOCOL) continue
        session = getSession(candidate, { touch: false })
        if (session) break
      }
    }
    if (!session) {
      const queryToken = (url.searchParams.get('token') || '').trim()
      if (queryToken) session = getSession(queryToken, { touch: false })
    }

    if (!session) {
      return rejectUpgrade(socket, 401, 'Unauthorized')
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, session)
    })
  } catch (err) {
    console.error('[ArmGuard] WebSocket upgrade error:', err.message)
    rejectUpgrade(socket, 500, 'Internal Server Error')
  }
})

wss.on('error', err => console.error('[ArmGuard] WebSocket server error:', err.message))

/** Close the socket when the backing session expires or is revoked (logout). */
function watchSession(ws, session, onExpire) {
  const timer = setInterval(() => {
    if (ws.readyState !== 1) return
    if (!getSession(session.token, { touch: false })) {
      try { ws.close(4001, 'Session expired') } catch {}
      onExpire?.()
    }
  }, 15000)
  timer.unref?.()
  return () => clearInterval(timer)
}

function handleTerminal(ws) {
  const cwd = fs.existsSync('/root') ? '/root' : os.homedir()
  if (pty) {
    let ptyProcess = pty.spawn('/bin/bash', [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      env: process.env
    })

    ptyProcess.onData(data => {
      if (ws.readyState === 1) ws.send(data)
    })

    ws.on('message', msg => {
      const str = msg.toString()
      try {
        if (str.startsWith('{') && str.endsWith('}')) {
          const parsed = JSON.parse(str)
          if (parsed.type === 'resize' && parsed.cols && parsed.rows) {
            ptyProcess?.resize(parsed.cols, parsed.rows)
            return
          }
        }
      } catch {}
      if (ptyProcess) ptyProcess.write(str)
    })

    return () => {
      if (ptyProcess) {
        try { ptyProcess.kill() } catch {}
        ptyProcess = null
      }
    }
  }

  const shell = spawn('/bin/bash', ['-i'], {
    cwd,
    env: { ...process.env, TERM: 'xterm-256color' }
  })
  const forward = data => { if (ws.readyState === 1) ws.send(data.toString()) }
  shell.stdout.on('data', forward)
  shell.stderr.on('data', forward)
  shell.on('error', err => forward(`\r\n[ArmGuard Terminal Error]: ${err.message}\r\n`))
  shell.on('exit', () => { try { ws.close(1000, 'Shell exited') } catch {} })
  ws.on('message', msg => {
    const str = msg.toString()
    if (!str.startsWith('{"type":"resize"') && shell.stdin.writable) {
      shell.stdin.write(str)
    }
  })
  return () => {
    try { shell.kill() } catch {}
  }
}

function handleMonitor(ws) {
  let timer = null
  let stopped = false

  const send = () => {
    if (stopped || ws.readyState !== 1) return
    try {
      ws.send(JSON.stringify(buildMonitorPayload()))
    } catch (err) {
      console.error('[ArmGuard] monitor push failed:', err.message)
    }
  }

  // Re-read the policy every tick so Eco mode changes apply without reconnecting
  const schedule = () => {
    if (stopped) return
    timer = setTimeout(() => {
      send()
      schedule()
    }, getMonitorPolicy().interval_ms)
  }

  send()
  schedule()

  return () => {
    stopped = true
    if (timer) clearTimeout(timer)
    timer = null
  }
}

wss.on('connection', (ws, req, session) => {
  let cleanupHandler = null
  let stopWatch = null
  const cleanup = () => {
    if (stopWatch) { stopWatch(); stopWatch = null }
    if (cleanupHandler) { try { cleanupHandler() } catch {} cleanupHandler = null }
  }
  ws.on('close', cleanup)
  ws.on('error', cleanup)

  try {
    const pathname = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`).pathname
    stopWatch = watchSession(ws, session, cleanup)
    if (pathname === '/terminal/ws') {
      cleanupHandler = handleTerminal(ws)
    } else if (pathname === '/system/monitor/ws') {
      cleanupHandler = handleMonitor(ws)
    } else {
      ws.close(1008, 'Unsupported path')
    }
  } catch (e) {
    try {
      if (ws.readyState === 1) ws.send(`\r\n[ArmGuard Error]: ${e.message}\r\n`)
      ws.close(1011, 'Internal error')
    } catch {}
    cleanup()
  }
})

// -----------------------------------------------------------------------------
// Graceful shutdown (AG-PERF-02)
//
// 面板作为 systemd 服务运行时，`systemctl restart/stop` 会发送 SIGTERM。
// 此前进程没有信号处理，WebSocket 终端会话、在途请求和设置写入会被直接掐断；
// 现在先停止接收新连接，通知前端「服务即将重启」，再在宽限期内退出。
// -----------------------------------------------------------------------------
let shuttingDown = false

function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`[ArmGuard] received ${signal}, shutting down gracefully...`)

  const forceExit = setTimeout(() => {
    console.error('[ArmGuard] graceful shutdown timed out, forcing exit')
    process.exit(1)
  }, 5000)
  forceExit.unref()

  try {
    for (const client of wss.clients) {
      try {
        client.close(1001, 'Server shutting down')
      } catch {}
    }
  } catch {}

  server.close(() => {
    clearTimeout(forceExit)
    console.log('[ArmGuard] server closed, bye')
    process.exit(0)
  })

  // server.close() 只等已有连接自然结束，这里主动断开空闲 keep-alive 连接
  if (typeof server.closeIdleConnections === 'function') {
    try { server.closeIdleConnections() } catch {}
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

// -----------------------------------------------------------------------------
// Startup: first-run admin (AG-004) + listen with port fallback (AG-010)
// -----------------------------------------------------------------------------
function listenOn(port) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.off('listening', onListening)
      reject(err)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(port, HOST)
  })
}

async function start() {
  try {
    const init = ensureInitialAdmin({ dataDir: DATA_DIR, usersFile: USERS_FILE })
    if (init.created) {
      if (init.passwordFile) {
        console.log(`[ArmGuard] First run: administrator "${init.username}" created. Initial password stored in ${init.passwordFile} (mode 0600).`)
      } else {
        console.log(`[ArmGuard] First run: administrator "${init.username}" created from ARMGUARD_ADMIN_PASSWORD.`)
      }
    }
  } catch (err) {
    console.error(`[ArmGuard] Administrator initialization failed: ${err.message}`)
    console.error('[ArmGuard] Fix or restore users.json, or run backend/scripts/reset_admin.js as root.')
    process.exit(1)
  }

  try {
    await listenOn(runtime.port)
  } catch (err) {
    const requested = runtime.port
    const candidates = []
    if (runtime.port_source === 'settings') {
      const lastGood = parseInt(settings.last_good_port, 10)
      if (isValidPort(lastGood) && lastGood !== requested) candidates.push(lastGood)
      if (DEFAULT_PORT !== requested && !candidates.includes(DEFAULT_PORT)) candidates.push(DEFAULT_PORT)
    }
    let recovered = false
    for (const p of candidates) {
      try {
        await listenOn(p)
        runtime.port_error = `配置端口 ${requested} 无法监听 (${err.code || err.message})，已回退到端口 ${p}`
        runtime.port = p
        runtime.port_source = 'fallback'
        recovered = true
        console.error(`[ArmGuard] ${runtime.port_error}`)
        break
      } catch {}
    }
    if (!recovered) {
      console.error(`[ArmGuard] Cannot listen on ${HOST}:${requested}: ${err.code || err.message}`)
      process.exit(1)
    }
  }

  if (runtime.port_source !== 'fallback' && runtime.port_source !== 'env' && settings.last_good_port !== runtime.port) {
    settings.last_good_port = runtime.port
    saveJSON(SETTINGS_FILE, settings)
  }
  saveJSON(RUNTIME_FILE, runtime)

  const entrance = (settings.security_entrance || '').trim()
  console.log(`[ArmGuard] ${PANEL_VERSION} listening on ${runtime.protocol}://${HOST.includes(':') ? `[${HOST}]` : HOST}:${runtime.port}${entrance && entrance !== '/' ? ` (security entrance: ${entrance})` : ''}`)
  if (runtime.ssl_error) console.error(`[ArmGuard] HTTPS not active: ${runtime.ssl_error}`)
}

start()
