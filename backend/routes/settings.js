import fs from 'fs'
import net from 'net'
import path from 'path'
import crypto from 'crypto'
import { spawnSync } from 'child_process'
import { execFileAsync, tarExec } from '../lib/exec.js'

// Keys that may be written through PUT /settings/panel, with validation (AG-009/AG-010)
const ENTRANCE_RE = /^\/[A-Za-z0-9_-]{3,64}$/
const WEBHOOK_TYPES = ['feishu', 'dingtalk', 'wecom', 'telegram', 'custom']
const ALERT_EVENTS = ['high_load', 'disk_low', 'login_fail']

function toInt(v) {
  const n = typeof v === 'number' ? v : parseInt(v, 10)
  return Number.isFinite(n) ? n : NaN
}

function validatePanelSettings(body, ctx) {
  const out = {}
  const errors = []
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k)

  if (has('panel_title')) {
    const t = String(body.panel_title || '').trim()
    if (!t || t.length > 64) errors.push('面板标题长度必须为 1-64 个字符')
    else out.panel_title = t
  }
  if (has('port')) {
    const p = toInt(body.port)
    if (!ctx.isValidPort(p)) errors.push('面板端口必须是 1-65535 之间的整数')
    else out.port = p
  }
  if (has('security_entrance')) {
    const e = String(body.security_entrance || '').trim()
    if (e !== '' && e !== '/' && !ENTRANCE_RE.test(e)) errors.push('安全入口必须以 / 开头，仅含字母、数字、下划线或短横线，长度 3-64')
    else if (e.startsWith('/api') || e.startsWith('/assets')) errors.push('安全入口不能与 /api 或 /assets 路径冲突')
    else out.security_entrance = e
  }
  if (has('session_timeout_minutes')) {
    const v = toInt(body.session_timeout_minutes)
    if (!(v >= 5 && v <= 1440)) errors.push('会话空闲超时必须在 5-1440 分钟之间')
    else out.session_timeout_minutes = v
  }
  if (has('max_login_retry')) {
    const v = toInt(body.max_login_retry)
    if (!(v >= 3 && v <= 20)) errors.push('登录失败锁定阈值必须在 3-20 次之间')
    else out.max_login_retry = v
  }
  if (has('login_lock_minutes')) {
    const v = toInt(body.login_lock_minutes)
    if (!(v >= 1 && v <= 1440)) errors.push('登录锁定时长必须在 1-1440 分钟之间')
    else out.login_lock_minutes = v
  }
  if (has('ip_whitelist')) {
    const w = String(body.ip_whitelist || '')
    if (w.length > 4096) errors.push('IP 白名单过长')
    else out.ip_whitelist = w
  }
  if (has('trust_proxy')) out.trust_proxy = Boolean(body.trust_proxy)
  if (has('eco_mode_enabled')) out.eco_mode_enabled = Boolean(body.eco_mode_enabled)
  if (has('eco_mode_threshold_mb')) {
    const v = toInt(body.eco_mode_threshold_mb)
    if (!(v >= 128 && v <= 65536)) errors.push('节能模式内存阈值必须在 128-65536 MB 之间')
    else out.eco_mode_threshold_mb = v
  }
  if (has('log_retention_days')) {
    const v = toInt(body.log_retention_days)
    if (!(v >= 1 && v <= 365)) errors.push('面板日志保留天数必须在 1-365 天之间')
    else out.log_retention_days = v
  }
  if (has('panel_ssl_cert')) out.panel_ssl_cert = String(body.panel_ssl_cert || '').trim()
  if (has('panel_ssl_key')) out.panel_ssl_key = String(body.panel_ssl_key || '').trim()
  if (has('ssl_enabled')) out.ssl_enabled = Boolean(body.ssl_enabled)
  if (has('webhook_enabled')) out.webhook_enabled = Boolean(body.webhook_enabled)
  if (has('webhook_type')) {
    if (!WEBHOOK_TYPES.includes(body.webhook_type)) errors.push('不支持的 Webhook 通道类型')
    else out.webhook_type = body.webhook_type
  }
  if (has('webhook_url')) {
    const u = String(body.webhook_url || '').trim()
    if (u && !/^https?:\/\//i.test(u)) errors.push('Webhook URL 必须以 http:// 或 https:// 开头')
    else out.webhook_url = u
  }
  if (has('alert_events')) {
    out.alert_events = Array.isArray(body.alert_events) ? body.alert_events.filter(e => ALERT_EVENTS.includes(e)) : []
  }
  return { out, errors }
}

function canBindPort(port, host) {
  return new Promise((resolve) => {
    const srv = net.createServer()
    srv.once('error', (err) => resolve({ ok: false, error: err.code || err.message }))
    srv.once('listening', () => srv.close(() => resolve({ ok: true })))
    srv.listen(port, host)
  })
}

function buildRuntimeStatus(ctx) {
  const rt = ctx.runtime
  const s = ctx.settings
  const savedPort = parseInt(s.port, 10)
  const wantsHttps = Boolean(s.ssl_enabled)
  const portPending = rt.port_source !== 'env' && Number.isFinite(savedPort) && savedPort !== rt.port
  const protocolPending = (wantsHttps && rt.protocol !== 'https' && !rt.ssl_error) || (!wantsHttps && rt.protocol === 'https')
  return {
    effective_port: rt.port,
    saved_port: savedPort || rt.port,
    port_source: rt.port_source,
    port_error: rt.port_error || null,
    effective_protocol: rt.protocol,
    ssl_error: rt.ssl_error,
    restart_required: portPending || protocolPending,
    started_at: rt.started_at,
    version: ctx.PANEL_VERSION,
    build_commit: ctx.BUILD_COMMIT || rt.build_commit || 'unknown'
  }
}

// ---------------------------------------------------------------------------
// Webhook delivery (AG-013): really send, judge by HTTP + platform status
// ---------------------------------------------------------------------------
function maskUrl(u) {
  try {
    const p = new URL(u)
    return `${p.protocol}//${p.host}/…`
  } catch {
    return '(invalid url)'
  }
}

export async function sendWebhook(type, webhookUrl, text) {
  let parsed
  try {
    parsed = new URL(webhookUrl)
  } catch {
    return { ok: false, error: 'Webhook URL 格式无效' }
  }
  if (!/^https?:$/.test(parsed.protocol)) return { ok: false, error: 'Webhook URL 仅支持 http/https' }

  let body
  let target = webhookUrl
  switch (type) {
    case 'feishu':
      body = { msg_type: 'text', content: { text } }
      break
    case 'dingtalk':
    case 'wecom':
      body = { msgtype: 'text', text: { content: text } }
      break
    case 'telegram': {
      const chatId = parsed.searchParams.get('chat_id')
      if (!chatId) return { ok: false, error: 'Telegram 地址需形如 https://api.telegram.org/bot<TOKEN>/sendMessage?chat_id=<ID>' }
      parsed.searchParams.delete('chat_id')
      target = parsed.toString()
      body = { chat_id: chatId, text }
      break
    }
    default:
      body = { source: 'ArmGuard', event: 'test', text }
  }

  let resp
  try {
    resp = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
      redirect: 'error'
    })
  } catch (e) {
    const reason = e.name === 'TimeoutError' ? '请求超时 (10s)' : (e.cause?.code || e.message)
    return { ok: false, error: `无法连接到接收端: ${reason}` }
  }

  const raw = await resp.text().catch(() => '')
  let json = null
  try { json = raw ? JSON.parse(raw) : null } catch {}

  if (!resp.ok) {
    const detail = json?.msg || json?.errmsg || json?.description || raw.slice(0, 200)
    return { ok: false, status: resp.status, error: `接收端返回 HTTP ${resp.status}${detail ? `: ${detail}` : ''}` }
  }

  // Platform-level business status (HTTP 200 can still mean failure)
  if (type === 'feishu') {
    const code = json?.code ?? json?.StatusCode
    if (code !== 0) return { ok: false, status: resp.status, error: `飞书返回错误 ${code ?? '(无 code)'}: ${json?.msg || json?.StatusMessage || raw.slice(0, 200)}` }
  } else if (type === 'dingtalk' || type === 'wecom') {
    if (json?.errcode !== 0) return { ok: false, status: resp.status, error: `${type === 'dingtalk' ? '钉钉' : '企业微信'}返回错误 ${json?.errcode ?? '(无 errcode)'}: ${json?.errmsg || raw.slice(0, 200)}` }
  } else if (type === 'telegram') {
    if (json?.ok !== true) return { ok: false, status: resp.status, error: `Telegram 返回错误: ${json?.description || raw.slice(0, 200)}` }
  }
  return { ok: true, status: resp.status }
}

// ---------------------------------------------------------------------------

export async function handleSettings(pathname, req, res, url, ctx) {
  if (!pathname.startsWith('/api/v1/settings/')) return false

  if (pathname === '/api/v1/settings/panel') {
    if (req.method === 'GET') {
      const fullSettings = {
        panel_title: 'ArmGuard ARM64 Linux 运维面板',
        ip_whitelist: '',
        api_token: '',
        two_factor_enabled: false,
        webhook_enabled: false,
        webhook_type: 'feishu',
        webhook_url: '',
        alert_events: ['high_load', 'disk_low', 'login_fail'],
        ...ctx.settings,
        current_version: ctx.PANEL_VERSION,
        build_commit: ctx.BUILD_COMMIT || ctx.runtime?.build_commit || 'unknown',
        // Automatic alert pushing is not implemented yet; only the connectivity test is.
        alert_auto_push_supported: false,
        monitor: ctx.getMonitorPolicy(),
        runtime: buildRuntimeStatus(ctx)
      }
      delete fullSettings.last_good_port
      res.json(fullSettings)
      return true
    }
    if (req.method === 'PUT') {
      const body = await ctx.parseBody(req, res)
      const { out, errors } = validatePanelSettings(body || {}, ctx)
      if (errors.length) {
        res.json(null, `设置未保存：${errors.join('；')}`, 400)
        return true
      }

      // Port: must be free (or already ours) before we accept it
      if (out.port !== undefined && out.port !== ctx.runtime.port) {
        const check = await canBindPort(out.port, ctx.runtime.host)
        if (!check.ok) {
          res.json(null, `端口 ${out.port} 当前无法监听 (${check.error})，设置未保存`, 400)
          return true
        }
      }

      // HTTPS: only accept enabling when a valid certificate/key pair is configured
      const nextSsl = out.ssl_enabled ?? ctx.settings.ssl_enabled
      if (nextSsl) {
        const cert = out.panel_ssl_cert ?? ctx.settings.panel_ssl_cert
        const key = out.panel_ssl_key ?? ctx.settings.panel_ssl_key
        const tls = ctx.validatePanelTls(cert, key)
        if (!tls.ok) {
          res.json(null, `无法启用面板 HTTPS：${tls.error}`, 400)
          return true
        }
      }

      const previous = { ...ctx.settings }
      Object.assign(ctx.settings, out)
      if (!ctx.saveJSON(ctx.SETTINGS_FILE, ctx.settings)) {
        // Roll back in-memory state when persistence fails
        for (const k of Object.keys(ctx.settings)) delete ctx.settings[k]
        Object.assign(ctx.settings, previous)
        res.json(null, '设置写入磁盘失败，未生效', 500)
        return true
      }
      ctx.logOperation(ctx.currentUser(), '修改面板基础配置', Object.keys(out).join(',') || 'PanelSettings')
      const runtime = buildRuntimeStatus(ctx)
      res.json({ runtime }, runtime.restart_required
        ? '设置已保存；端口或 HTTPS 变更需重启面板后生效'
        : '面板设置保存成功')
      return true
    }
  }

  if (pathname === '/api/v1/settings/admin/password' && req.method === 'POST') {
    const body = await ctx.parseBody(req, res)
    const { old_password, new_username, new_password } = body
    const session = req.session

    const users = ctx.loadJSON(ctx.USERS_FILE, [])
    const adminUser = Array.isArray(users) ? users.find(u => u.username === session?.username) : null
    if (!adminUser) {
      res.json(null, '当前会话对应的管理员账户不存在', 400)
      return true
    }

    // Verify old password
    if (!ctx.verifyPassword(old_password, adminUser.password)) {
      res.json(null, '原密码验证失败，请输入正确的旧密码', 400)
      return true
    }

    const oldName = adminUser.username
    const nextName = (new_username || '').trim()
    const nextPassword = (new_password || '').trim()
    if (nextName && !/^[A-Za-z0-9_.@-]{3,32}$/.test(nextName)) {
      res.json(null, '用户名只能包含字母、数字及 _ . @ -，长度 3-32', 400)
      return true
    }
    if (nextName && nextName !== oldName && users.some(u => u.username === nextName)) {
      res.json(null, '该用户名已存在', 400)
      return true
    }
    if (nextPassword && nextPassword.length < 8) {
      res.json(null, '新密码长度至少 8 位', 400)
      return true
    }
    if (!nextName && !nextPassword) {
      res.json(null, '没有需要修改的内容', 400)
      return true
    }

    if (nextName) adminUser.username = nextName
    if (nextPassword) {
      delete adminUser.password_plain
      adminUser.password = ctx.hashPassword(nextPassword)
    }

    if (!ctx.saveJSON(ctx.USERS_FILE, users)) {
      res.json(null, '写入用户文件失败，凭证未修改', 500)
      return true
    }

    // Session policy: rename keeps sessions (identity follows); password change
    // revokes every other session of this user, keeping the current one.
    if (nextName && nextName !== oldName) ctx.renameSessions(oldName, nextName)
    let revoked = 0
    if (nextPassword) {
      revoked = ctx.revokeUserSessions(adminUser.username, session.type === 'session' ? session.token : null)
      try { fs.unlinkSync(ctx.INITIAL_PASSWORD_FILE) } catch {}
    }

    ctx.logOperation(adminUser.username, '修改管理员身份凭证', oldName === adminUser.username ? oldName : `${oldName} → ${adminUser.username}`)
    res.json({ username: adminUser.username, revoked_sessions: revoked }, '管理员身份凭证修改成功，请牢记新密码！')
    return true
  }

  if (pathname === '/api/v1/settings/admin/api-token/regenerate' && req.method === 'POST') {
    const newToken = `ag_live_${crypto.randomBytes(16).toString('hex')}`
    ctx.settings.api_token = newToken
    if (!ctx.saveJSON(ctx.SETTINGS_FILE, ctx.settings)) {
      res.json(null, '写入设置失败，API Token 未更新', 500)
      return true
    }
    ctx.logOperation(ctx.currentUser(), '重新生成 OpenAPI Token', 'Security')
    res.json({ api_token: newToken }, 'API Token 已重新生成')
    return true
  }

  if (pathname === '/api/v1/settings/webhook-test' && req.method === 'POST') {
    const body = await ctx.parseBody(req, res)
    const type = WEBHOOK_TYPES.includes(body.webhook_type) ? body.webhook_type : 'custom'
    const webhookUrl = String(body.webhook_url || ctx.settings.webhook_url || '').trim()
    if (!webhookUrl) {
      res.json(null, '请先填写 Webhook URL', 400)
      return true
    }
    const text = `[ArmGuard] 告警通道连通性测试 — 主机 ${ctx.settings.hostname || ''} — ${new Date().toLocaleString()}`
    const result = await sendWebhook(type, webhookUrl, text)
    ctx.logOperation(ctx.currentUser(), '触发告警 Webhook 连通性测试', `${type} ${maskUrl(webhookUrl)}`, null, result.ok ? 'success' : 'failed')
    if (!result.ok) {
      res.json(null, `测试消息投递失败：${result.error}`, 502)
      return true
    }
    res.json({ http_status: result.status }, `测试消息已被接收端确认 (HTTP ${result.status})`)
    return true
  }

  if (pathname === '/api/v1/settings/backup/create' && req.method === 'POST') {
    let backupPath = null
    try {
      fs.mkdirSync(ctx.BACKUP_DIR, { recursive: true })
      const backupName = `armguard_panel_backup_${Date.now()}.tar.gz`
      backupPath = path.join(ctx.BACKUP_DIR, backupName)

      // 异步执行：备份可能需要数分钟，不能阻塞事件循环（AG-PERF-01）
      const child = await tarExec(['-czf', backupPath, '-C', ctx.DATA_DIR, '.'], { timeout: 120000 })
      const stderr = (child.stderr || '').trim()
      // GNU tar exits 1 only for "file changed as we read it" (archive is still valid)
      const tolerated = child.status === 1 && /file changed as we read it/i.test(stderr)
      if (child.error || (child.status !== 0 && !tolerated)) {
        throw new Error(child.error ? (child.error.code === 'ENOENT' ? '系统未安装 tar' : child.error.message) : (stderr || `tar 退出码 ${child.status}`))
      }

      const verify = await tarExec(['-tzf', backupPath], { timeout: 60000, maxBuffer: 16 * 1024 * 1024 })
      const entries = (verify.stdout || '').split('\n').filter(Boolean)
      if (verify.status !== 0 || entries.length === 0) {
        throw new Error(`备份包校验失败: ${(verify.stderr || '').trim() || '归档为空'}`)
      }
      try { fs.chmodSync(backupPath, 0o600) } catch {}

      const size = fs.statSync(backupPath).size
      ctx.logOperation(ctx.currentUser(), '创建面板数据备份', backupName)
      res.json({
        file_name: backupName,
        size_kb: Math.round(size / 1024),
        entries: entries.length,
        source_dir: ctx.DATA_DIR,
        created_at: new Date().toLocaleString()
      }, '面板数据备份打包并校验成功')
      return true
    } catch (e) {
      if (backupPath) {
        try { fs.unlinkSync(backupPath) } catch {}
      }
      ctx.logOperation(ctx.currentUser(), '创建面板数据备份', e.message, null, 'failed')
      res.json(null, `备份失败: ${e.message}`, 500)
      return true
    }
  }

  if (pathname === '/api/v1/settings/backup/list' && req.method === 'GET') {
    try {
      fs.mkdirSync(ctx.BACKUP_DIR, { recursive: true })
      const files = fs.readdirSync(ctx.BACKUP_DIR).filter(f => f.startsWith('armguard_panel_backup_'))
      const list = files.map(f => {
        const st = fs.statSync(path.join(ctx.BACKUP_DIR, f))
        return {
          file_name: f,
          size_kb: Math.round(st.size / 1024),
          created_at: new Date(st.mtimeMs).toLocaleString(),
          mtime: st.mtimeMs
        }
      }).sort((a, b) => b.mtime - a.mtime)
      res.json({ list })
      return true
    } catch (e) {
      res.json(null, `读取备份列表失败: ${e.message}`, 500)
      return true
    }
  }

  if (pathname === '/api/v1/settings/backup/download' && (req.method === 'GET' || req.method === 'HEAD')) {
    const fileName = (url.searchParams.get('file_name') || '').replace(/[^a-zA-Z0-9_.-]/g, '')
    if (!fileName || !fileName.startsWith('armguard_panel_backup_')) {
      res.json(null, '无效的文件名', 400)
      return true
    }
    const filePath = path.join(ctx.BACKUP_DIR, fileName)
    if (!fs.existsSync(filePath)) {
      res.json(null, '备份包不存在', 404)
      return true
    }
    try {
      const stat = fs.statSync(filePath)
      res.writeHead(200, {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': stat.size,
        'Cache-Control': 'no-store'
      })
      if (req.method === 'HEAD') {
        res.end()
        return true
      }
      const stream = fs.createReadStream(filePath)
      stream.on('error', () => res.destroy())
      stream.pipe(res)
      ctx.logOperation(ctx.currentUser(), '下载面板数据备份', fileName)
      return true
    } catch (e) {
      res.json(null, e.message, 500)
      return true
    }
  }

  if (pathname === '/api/v1/settings/backup' && req.method === 'DELETE') {
    const fileName = (url.searchParams.get('file_name') || '').replace(/[^a-zA-Z0-9_.-]/g, '')
    if (!fileName || !fileName.startsWith('armguard_panel_backup_')) {
      res.json(null, '无效的文件名', 400)
      return true
    }
    const filePath = path.join(ctx.BACKUP_DIR, fileName)
    if (!fs.existsSync(filePath)) {
      res.json(null, '备份包不存在', 404)
      return true
    }
    try {
      fs.unlinkSync(filePath)
    } catch (e) {
      res.json(null, `删除失败: ${e.message}`, 500)
      return true
    }
    ctx.logOperation(ctx.currentUser(), '删除面板数据备份', fileName)
    res.json(null, '备份包已成功删除')
    return true
  }

  if (pathname === '/api/v1/settings/panel/generate-self-signed' && req.method === 'POST') {
    try {
      const panelSslDir = path.join(ctx.DATA_DIR, 'panel_ssl')
      fs.mkdirSync(panelSslDir, { recursive: true, mode: 0o700 })
      const certPath = path.join(panelSslDir, 'fullchain.pem')
      const keyPath = path.join(panelSslDir, 'privkey.pem')
      const host = (ctx.settings.hostname || 'armguard.local').replace(/[^a-zA-Z0-9.-]/g, '') || 'armguard.local'
      const ossl = spawnSync(
        'openssl',
        [
          'req', '-x509', '-nodes', '-newkey', 'rsa:2048', '-days', '3650',
          '-keyout', keyPath,
          '-out', certPath,
          '-subj', `/CN=${host}/O=ArmGuard Panel`
        ],
        { encoding: 'utf-8', timeout: 15000 }
      )
      if (ossl.error || ossl.status !== 0 || !fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
        const detail = ossl.error ? ossl.error.message : ((ossl.stderr || '').trim() || `退出码 ${ossl.status}`)
        res.json(null, `生成自签名证书失败: ${detail}`, 500)
        return true
      }
      try { fs.chmodSync(keyPath, 0o600) } catch {}
      ctx.settings.panel_ssl_cert = certPath
      ctx.settings.panel_ssl_key = keyPath
      ctx.settings.ssl_enabled = true
      ctx.saveJSON(ctx.SETTINGS_FILE, ctx.settings)
      ctx.logOperation(ctx.currentUser(), '生成面板自签名 HTTPS 证书', certPath)
      res.json(
        { cert_path: certPath, key_path: keyPath, runtime: buildRuntimeStatus(ctx) },
        '已生成面板自签名 HTTPS 证书并写入配置，重启面板服务后即可通过 HTTPS 访问'
      )
      return true
    } catch (e) {
      res.json(null, `生成自签名证书失败: ${e.message}`, 500)
      return true
    }
  }

  if (pathname === '/api/v1/settings/panel/clear-cache' && req.method === 'POST') {
    try {
      if (ctx.staticCache) ctx.staticCache.clear()
      if (global.gc) global.gc()
      ctx.logOperation(ctx.currentUser(), '清理面板运行内存与强缓存', 'Panel')
      res.json(null, '面板静态资源缓存已清空')
      return true
    } catch (e) {
      res.json(null, e.message, 500)
      return true
    }
  }

  if (pathname === '/api/v1/settings/panel/restart' && req.method === 'POST') {
    // Only possible when running as the armguard systemd unit
    const probe = spawnSync('systemctl', ['show', 'armguard', '--property=MainPID', '--value'], { encoding: 'utf-8', timeout: 5000 })
    const mainPid = parseInt((probe.stdout || '').trim(), 10)
    if (probe.error || probe.status !== 0 || mainPid !== process.pid) {
      res.json(null, '面板未以 armguard systemd 服务运行，无法自动重启，请手动重启进程', 409)
      return true
    }
    ctx.logOperation(ctx.currentUser(), '重启面板服务', 'PanelEngine')
    res.json(null, '面板正在重启，稍后将自动恢复连接...')
    setTimeout(async () => {
      // 必须异步：spawnSync 会锁住事件循环，导致进程无法响应 systemd 的 SIGTERM，
      // 重启要等到 30s 超时后被 SIGKILL（AG-PERF-01）。
      const r = await execFileAsync('systemctl', ['restart', 'armguard'], { timeout: 30000 })
      if (r.error || r.status !== 0) {
        console.error('[ArmGuard] systemctl restart armguard failed:', r.error?.message || r.stderr)
      }
    }, 500)
    return true
  }

  if (pathname === '/api/v1/settings/panel/update-check') {
    res.json({
      current_version: ctx.PANEL_VERSION,
      latest_version: null,
      changelog: '尚未配置在线更新源，无法自动检查新版本，请关注项目发布页。',
      has_update: false,
      update_source_configured: false
    })
    return true
  }

  if (pathname === '/api/v1/settings/system/timezone' && req.method === 'PUT') {
    const body = await ctx.parseBody(req, res)
    const safeTz = (body.timezone || '').replace(/[^a-zA-Z0-9/_+-]/g, '')
    if (!safeTz) {
      res.json(null, '无效的时区', 400)
      return true
    }
    const child = await execFileAsync('timedatectl', ['set-timezone', safeTz], { timeout: 10000 })
    if (child.error || child.status !== 0) {
      const reason = child.error
        ? (child.error.code === 'ENOENT' ? '系统未安装 timedatectl' : child.error.message)
        : ((child.stderr || '').trim() || `timedatectl 退出码 ${child.status}`)
      ctx.logOperation(ctx.currentUser(), '修改系统时区', `${safeTz}: ${reason}`, null, 'failed')
      res.json(null, `时区修改失败: ${reason}`, 500)
      return true
    }
    ctx.settings.timezone = safeTz
    ctx.saveJSON(ctx.SETTINGS_FILE, ctx.settings)
    ctx.logOperation(ctx.currentUser(), '修改系统时区', safeTz)
    res.json(null, '时区修改成功')
    return true
  }

  return false
}
