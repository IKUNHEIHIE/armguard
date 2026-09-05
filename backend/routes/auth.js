export async function handleAuth(pathname, req, res, url, ctx) {
  if (!pathname.startsWith('/api/v1/auth/')) return false

  if (pathname === '/api/v1/auth/captcha') {
    res.json({ captcha_id: '1', image_base64: '' })
    return true
  }

  if (pathname === '/api/v1/auth/login' && req.method === 'POST') {
    const body = await ctx.parseBody(req, res)
    const username = (body.username || '').trim()
    const password = (body.password || '').trim()

    const users = ctx.loadJSON(ctx.USERS_FILE, [])
    let user = users.find(u => u.username === username)
    
    // If users.json has no user yet, initialize default admin user
    if (!user && (username === 'admin' || users.length === 0)) {
      user = { username: 'admin', password: ctx.hashPassword('password') }
      if (users.length === 0) {
        ctx.saveJSON(ctx.USERS_FILE, [user])
      }
    }

    const isValid = user && ctx.verifyPassword(password, user.password)
    if (!isValid) {
      ctx.logOperation(username || 'unknown', '登录失败 (密码错误)', 'Web Dashboard', req.socket.remoteAddress, 'failed')
      res.json(null, '用户名或密码错误，请核对后重试', 401)
      return true
    }

    const sessionToken = ctx.generateSessionToken(user.username)
    ctx.logOperation(user.username, '登录面板', 'Web Dashboard', req.socket.remoteAddress)
    res.json({
      token: sessionToken,
      refresh_token: sessionToken,
      expires_in: 86400,
      user: { id: 1, username: user.username, role: 'admin', totp_enabled: false }
    }, '登录成功')
    return true
  }

  if (pathname === '/api/v1/auth/logout' && req.method === 'POST') {
    ctx.logOperation('admin', '退出面板登录', 'Web Dashboard')
    res.json(null, '已成功登出')
    return true
  }

  if (pathname === '/api/v1/auth/user-info') {
    res.json({ id: 1, username: 'admin', role: 'admin', totp_enabled: false, last_login_ip: '127.0.0.1' })
    return true
  }

  if (pathname === '/api/v1/auth/refresh-token' && req.method === 'POST') {
    const newToken = ctx.generateSessionToken('admin')
    res.json({ token: newToken, refresh_token: newToken, expires_in: 86400 })
    return true
  }

  return false
}
