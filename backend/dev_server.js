import http from 'http'
import https from 'https'
import fs from 'fs'
import path from 'path'
import os from 'os'
import zlib from 'zlib'
import crypto from 'crypto'
import { spawn, spawnSync, exec, execFile, execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { WebSocketServer } from 'ws'

// Route Handlers
import { handleAuth } from './routes/auth.js'
import { handleSystem, cachedTelemetry, cachedThermal, getRealProcesses, getRealMemStats, getRealDiskStats, getRealCPUPercent } from './routes/system.js'
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

let pty = null
try {
  pty = await import('node-pty')
} catch (e) {
  console.log('[ArmGuard] node-pty fallback to standard spawn')
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PORT = process.env.PORT || 8888
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
const DATA_DIR = '/var/lib/armguard'
const USERS_FILE = path.join(DATA_DIR, 'users.json')
const SITES_FILE = path.join(DATA_DIR, 'sites.json')
const DATABASES_FILE = path.join(DATA_DIR, 'databases.json')
const CERTS_FILE = path.join(DATA_DIR, 'certs.json')
const CRONTAB_FILE = path.join(DATA_DIR, 'crontab.json')
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json')
const AI_CONFIG_FILE = path.join(DATA_DIR, 'ai_config.json')
const OPS_LOG_FILE = path.join(DATA_DIR, 'operations.json')
const BACKUP_DIR = '/var/backups/armguard'
const SSL_DIR = '/etc/ssl/armguard'
const NGINX_CONF_DIR = '/etc/nginx/conf.d'
const STREAM_CONF_DIR = '/etc/nginx/stream.d'
const STREAM_RULES_FILE = path.join(DATA_DIR, 'stream_rules.json')
const WWW_ROOT = '/www/wwwroot'

try {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.mkdirSync(BACKUP_DIR, { recursive: true })
  fs.mkdirSync(SSL_DIR, { recursive: true })
  fs.mkdirSync(WWW_ROOT, { recursive: true })
  fs.mkdirSync(NGINX_CONF_DIR, { recursive: true })
  fs.mkdirSync(STREAM_CONF_DIR, { recursive: true })
} catch {}

function loadJSON(filePath, defaultVal = []) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'))
    }
  } catch {}
  return defaultVal
}

function saveJSON(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
  } catch (err) {
    console.error('Failed to save JSON:', filePath, err)
  }
}

let cachedOpsLogs = null
let opsLogSaveTimer = null

function getOpsLogs() {
  if (!cachedOpsLogs) {
    cachedOpsLogs = loadJSON(OPS_LOG_FILE, [])
  }
  return cachedOpsLogs
}

function logOperation(username, action, target, ip = '127.0.0.1', status = 'success') {
  if (!cachedOpsLogs) {
    cachedOpsLogs = loadJSON(OPS_LOG_FILE, [])
  }
  cachedOpsLogs.unshift({
    id: Date.now(),
    username,
    action,
    target,
    ip,
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

// Secure Password Hashing & Verification
const PBKDF2_ITERATIONS = 100000

function hashPassword(password, salt = null, iterations = PBKDF2_ITERATIONS) {
  if (!salt) {
    salt = crypto.randomBytes(16).toString('hex')
  }
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex')
  return `${salt}:${hash}:${iterations}`
}

function verifyPassword(password, storedHash) {
  if (!password || !storedHash) return false
  if (!storedHash.includes(':')) {
    const sha = crypto.createHash('sha256').update(password).digest('hex')
    return sha === storedHash || password === storedHash
  }
  try {
    const parts = storedHash.split(':')
    const salt = parts[0]
    const hash = parts[1]
    const iterations = parts.length >= 3 ? parseInt(parts[2], 10) : 10000
    if (!salt || !hash || isNaN(iterations)) return false
    const calculated = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString('hex')
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(calculated, 'hex'))
  } catch {
    return false
  }
}

const activeSessions = new Map()

function generateSessionToken(username = 'admin') {
  const randomBytes = crypto.randomBytes(24).toString('hex')
  const token = `ag_live_${randomBytes}`
  activeSessions.set(token, {
    username,
    createdAt: Date.now(),
    expiresAt: Date.now() + 86400 * 1000
  })
  return token
}

function revokeSessionToken(token) {
  if (!token) return false
  return activeSessions.delete(token)
}

function isValidToken(token) {
  if (!token) return false
  const session = activeSessions.get(token)
  if (session && session.expiresAt > Date.now()) return true
  const currentSettings = loadJSON(SETTINGS_FILE, null)
  if (currentSettings && currentSettings.api_token && token === currentSettings.api_token) {
    return true
  }
  return false
}

function isValidDomain(domain) {
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(domain)
}

function checkAuth(req, res, url = null) {
  const authHeader = req.headers['authorization'] || ''
  let token = ''
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim()
  } else if (req.headers['x-api-token']) {
    token = req.headers['x-api-token'].toString().trim()
  }

  if (!token || !isValidToken(token)) {
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ code: 401, message: '未授权：请先登录或提供有效的 Token' }))
    return false
  }
  return true
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

let settings = loadJSON(SETTINGS_FILE, {
  port: 8888,
  security_entrance: '/armguard',
  ssl_enabled: false,
  session_timeout_minutes: 120,
  eco_mode_enabled: true,
  eco_mode_threshold_mb: 512,
  current_version: 'v0.1.0-alpha',
  latest_version: 'v0.1.0-alpha',
  has_update: false,
  timezone: 'Asia/Shanghai',
  hostname: os.hostname()
})

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

// Shared Application Context Object
const ctx = {
  DATA_DIR, USERS_FILE, SITES_FILE, DATABASES_FILE, CERTS_FILE, CRONTAB_FILE,
  SETTINGS_FILE, AI_CONFIG_FILE, OPS_LOG_FILE, BACKUP_DIR, SSL_DIR, NGINX_CONF_DIR, WWW_ROOT,
  STREAM_RULES_FILE, STREAM_CONF_DIR,
  sites, databases, sslCerts, crontabs, streamRules, settings, aiConfig,
  loadJSON, saveJSON, getOpsLogs, logOperation, hashPassword, verifyPassword,
  generateSessionToken, revokeSessionToken, isValidToken, isValidDomain, parseBody, parseMultipart,
  isProtectedPath, staticCache, getStaticFile, getClientIp,
  cachedTelemetry, cachedThermal, getRealProcesses, getRealMemStats, getRealDiskStats, getRealCPUPercent
}

initWarpConfig(ctx)

// HTTP Server
const server = http.createServer(async (req, res) => {
  const currentSettings = loadJSON(SETTINGS_FILE, settings)
  const clientIp = getClientIp(req, currentSettings)

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
      'Set-Cookie': 'ag_entrance=1; Path=/; HttpOnly; SameSite=Lax',
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
    if (!checkAuth(req, res, url)) {
      return
    }

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
})

// WebSocket Server with strict handshake authentication
const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', (req, socket, head) => {
  const currentSettings = loadJSON(SETTINGS_FILE, settings)
  const clientIp = getClientIp(req, currentSettings)

  // 1. Enforce IP Whitelist on WebSocket handshake
  if (!isIpAllowed(clientIp, currentSettings.ip_whitelist)) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n')
    socket.destroy()
    return
  }

  // 2. Enforce Security Entrance on WebSocket handshake
  const secEntrance = (currentSettings.security_entrance || '').trim()
  const cookies = parseCookies(req)
  const hasEntranceCookie = cookies['ag_entrance'] === '1'
  if (secEntrance && secEntrance !== '/' && !hasEntranceCookie) {
    socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
    socket.destroy()
    return
  }

  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`)
  if (url.pathname !== '/terminal/ws') {
    socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
    socket.destroy()
    return
  }

  // 3. Enforce Token authentication on WebSocket handshake
  let token = url.searchParams.get('token') || ''
  const authHeader = req.headers['authorization'] || ''
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim()
  } else if (req.headers['sec-websocket-protocol']) {
    const protoToken = req.headers['sec-websocket-protocol'].split(',')[0].trim()
    if (isValidToken(protoToken)) {
      token = protoToken
    }
  }

  if (!token || !isValidToken(token)) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
    socket.destroy()
    return
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req)
  })
})

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`)
  const pathname = url.pathname

  if (pathname === '/terminal/ws') {

    try {
      if (pty) {
        let ptyProcess = pty.spawn('/bin/bash', [], {
          name: 'xterm-256color',
          cols: 80,
          rows: 24,
          cwd: '/root',
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
                ptyProcess.resize(parsed.cols, parsed.rows)
                return
              }
            }
          } catch {}
          if (ptyProcess) ptyProcess.write(str)
        })

        const cleanupPty = () => {
          if (ptyProcess) {
            try { ptyProcess.kill() } catch {}
            ptyProcess = null
          }
        }
        ws.on('close', cleanupPty)
        ws.on('error', cleanupPty)
      } else {
        const shell = spawn('/bin/bash', ['-i'], {
          cwd: '/root',
          env: { ...process.env, TERM: 'xterm-256color' }
        })
        shell.stdout.on('data', data => ws.send(data.toString()))
        shell.stderr.on('data', data => ws.send(data.toString()))
        ws.on('message', msg => {
          const str = msg.toString()
          if (!str.startsWith('{"type":"resize"')) {
            shell.stdin.write(str)
          }
        })
        const cleanupShell = () => {
          try { shell.kill() } catch {}
        }
        ws.on('close', cleanupShell)
        ws.on('error', cleanupShell)
      }
    } catch (e) {
      ws.send(`\r\n[ArmGuard Terminal Error]: ${e.message}\r\n`)
    }
  } else if (pathname === '/system/monitor/ws') {
    if (!isValidToken(token)) {
      ws.close(4001, 'Unauthorized')
      return
    }

    if (ws.readyState === 1) {
      ws.send(JSON.stringify({
        realtime: cachedTelemetry,
        arm_thermal: cachedThermal
      }))
    }

    const getInterval = () => (settings.eco_mode_enabled ? 4000 : 1500)
    let timer = setInterval(() => {
      if (ws.readyState !== 1) {
        clearInterval(timer)
        return
      }
      ws.send(JSON.stringify({
        realtime: cachedTelemetry,
        arm_thermal: cachedThermal,
        eco_mode: Boolean(settings.eco_mode_enabled)
      }))
    }, getInterval())

    const cleanupTimer = () => clearInterval(timer)
    ws.on('close', cleanupTimer)
    ws.on('error', cleanupTimer)
  }
})

server.listen(PORT, '::', () => {
  console.log(`[ArmGuard] ✓ 100% Real Linux Engine Panel is running on [::]:${PORT}`)
  console.log(`[ArmGuard] Default login credentials: admin / armguard`)
})
