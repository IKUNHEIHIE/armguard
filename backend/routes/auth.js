const loginAttempts = new Map()
const MAX_LOGIN_ATTEMPTS = 5
const LOCKOUT_TIME_MS = 15 * 60 * 1000 // 15 minutes
const ATTEMPT_WINDOW_MS = 5 * 60 * 1000 // 5 minutes

// Periodically clean up expired rate-limit records
setInterval(() => {
  const now = Date.now()
  for (const [ip, record] of loginAttempts.entries()) {
    if (record.lockUntil && record.lockUntil < now) {
      loginAttempts.delete(ip)
    } else if (!record.lockUntil && (now - record.firstAttempt > ATTEMPT_WINDOW_MS)) {
      loginAttempts.delete(ip)
    }
  }
}, 10 * 60 * 1000).unref()

function getClientIp(req, ctx = null) {
  if (ctx && ctx.getClientIp) {
    return ctx.getClientIp(req, ctx.settings)
  }
  return (req.socket?.remoteAddress || '127.0.0.1').replace(/^::ffff:/, '').trim()
}

function extractToken(req) {
  const authHeader = req.headers['authorization'] || ''
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim()
  }
  if (req.headers['x-api-token']) {
    return req.headers['x-api-token'].toString().trim()
  }
  return ''
}

export async function handleAuth(pathname, req, res, url, ctx) {
  if (!pathname.startsWith('/api/v1/auth/')) return false

  if (pathname === '/api/v1/auth/captcha') {
    res.json({ captcha_id: '1', image_base64: '' })
    return true
  }

  if (pathname === '/api/v1/auth/login' && req.method === 'POST') {
    const clientIp = getClientIp(req, ctx)
    const now = Date.now()

    // 1. Check if client IP is currently locked out
    const attemptRecord = loginAttempts.get(clientIp)
    if (attemptRecord && attemptRecord.lockUntil && attemptRecord.lockUntil > now) {
      const remainingMinutes = Math.ceil((attemptRecord.lockUntil - now) / 60000)
      res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({
        code: 429,
        message: `登录尝试次数过多，该 IP 已被锁定，请 ${remainingMinutes} 分钟后再试`
      }))
      return true
    }

    const body = await ctx.parseBody(req, res)
    const username = (body.username || '').trim()
    const password = (body.password || '').trim()

    const users = ctx.loadJSON(ctx.USERS_FILE, [])
    const user = users.find(u => u.username === username)

    const isValid = user && ctx.verifyPassword(password, user.password)
    if (!isValid) {
      // Record failed attempt
      let cur = loginAttempts.get(clientIp)
      if (!cur || (now - cur.firstAttempt > ATTEMPT_WINDOW_MS)) {
        cur = { attempts: 1, lockUntil: 0, firstAttempt: now }
      } else {
        cur.attempts += 1
      }

      if (cur.attempts >= MAX_LOGIN_ATTEMPTS) {
        cur.lockUntil = now + LOCKOUT_TIME_MS
        loginAttempts.set(clientIp, cur)
        ctx.logOperation(username || 'unknown', `登录防爆破拦截 (连续错误 ${cur.attempts} 次，锁定 15 分钟)`, 'Web Dashboard', clientIp, 'blocked')
        res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({
          code: 429,
          message: '连续登录失败次数过多，该 IP 已被锁定 15 分钟，请稍后再试'
        }))
        return true
      }

      loginAttempts.set(clientIp, cur)
      const remaining = MAX_LOGIN_ATTEMPTS - cur.attempts
      ctx.logOperation(username || 'unknown', `登录失败 (密码错误，剩余尝试 ${remaining} 次)`, 'Web Dashboard', clientIp, 'failed')
      res.json(null, `用户名或密码错误，请核对后重试 (剩余尝试次数: ${remaining})`, 401)
      return true
    }

    // Login successful: reset rate limit for this IP
    loginAttempts.delete(clientIp)

    // Smooth hash upgrade: if user password is an older hash format, upgrade to 100,000 iterations
    if (user.password && !user.password.endsWith(':100000')) {
      user.password = ctx.hashPassword(password)
      ctx.saveJSON(ctx.USERS_FILE, users)
    }

    const sessionToken = ctx.generateSessionToken(user.username)
    ctx.logOperation(user.username, '登录面板成功', 'Web Dashboard', clientIp)
    res.json({
      token: sessionToken,
      refresh_token: sessionToken,
      expires_in: 86400,
      user: { id: 1, username: user.username, role: 'admin', totp_enabled: false }
    }, '登录成功')
    return true
  }

  if (pathname === '/api/v1/auth/logout' && req.method === 'POST') {
    const token = extractToken(req)
    if (token && ctx.revokeSessionToken) {
      ctx.revokeSessionToken(token)
    }
    const clientIp = getClientIp(req, ctx)
    ctx.logOperation('admin', '退出面板登录 (会话已销毁)', 'Web Dashboard', clientIp)
    res.json(null, '已成功登出并销毁会话')
    return true
  }

  if (pathname === '/api/v1/auth/user-info') {
    res.json({ id: 1, username: 'admin', role: 'admin', totp_enabled: false, last_login_ip: getClientIp(req, ctx) })
    return true
  }

  if (pathname === '/api/v1/auth/refresh-token' && req.method === 'POST') {
    const oldToken = extractToken(req)
    if (oldToken && ctx.revokeSessionToken) {
      ctx.revokeSessionToken(oldToken)
    }
    const newToken = ctx.generateSessionToken('admin')
    res.json({ token: newToken, refresh_token: newToken, expires_in: 86400 })
    return true
  }

  return false
}
