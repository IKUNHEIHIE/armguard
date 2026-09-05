import fs from 'fs'
import path from 'path'
import { spawnSync, execSync } from 'child_process'

export function renderStreamConf(rule) {
  const upstreamName = `stream_backend_${rule.id}`
  let listenDirectives = ''

  if (rule.protocol === 'udp') {
    listenDirectives = `    listen ${rule.listen_port} udp;\n    listen [::]:${rule.listen_port} udp;`
  } else if (rule.protocol === 'tcp+udp') {
    listenDirectives = `    listen ${rule.listen_port};\n    listen [::]:${rule.listen_port};\n    listen ${rule.listen_port} udp;\n    listen [::]:${rule.listen_port} udp;`
  } else {
    // Default TCP
    listenDirectives = `    listen ${rule.listen_port};\n    listen [::]:${rule.listen_port};`
  }

  const timeout = rule.proxy_timeout || '10m'
  const connectTimeout = rule.proxy_connect_timeout || '5s'

  return `# ArmGuard Layer 4 Stream Rule: ${rule.name || 'Stream'}_${rule.id}
upstream ${upstreamName} {
    server ${rule.target_host}:${rule.target_port} weight=1 max_fails=3 fail_timeout=10s;
}

server {
${listenDirectives}
    proxy_pass ${upstreamName};
    proxy_timeout ${timeout};
    proxy_connect_timeout ${connectTimeout};
}
`
}

export function syncNginxStreamEnvironment(ctx) {
  const confDir = ctx.STREAM_CONF_DIR || '/etc/nginx/stream.d'
  try {
    if (!fs.existsSync(confDir)) {
      fs.mkdirSync(confDir, { recursive: true })
    }
  } catch {}

  // Ensure /etc/nginx/nginx.conf has stream include block on Linux
  const mainConf = '/etc/nginx/nginx.conf'
  if (fs.existsSync(mainConf)) {
    try {
      const content = fs.readFileSync(mainConf, 'utf8')
      if (!content.includes('include /etc/nginx/stream.d/*.conf;')) {
        const streamBlock = `\n# ArmGuard Layer 4 Stream Proxy\nstream {\n    include /etc/nginx/stream.d/*.conf;\n}\n`
        fs.appendFileSync(mainConf, streamBlock, 'utf8')
      }
    } catch (e) {
      console.error('[ArmGuard] Failed to ensure stream block in nginx.conf:', e.message)
    }
  }
}

export async function handleStream(pathname, req, res, url, ctx) {
  if (!pathname.startsWith('/api/v1/stream')) return false

  syncNginxStreamEnvironment(ctx)
  const confDir = ctx.STREAM_CONF_DIR || '/etc/nginx/stream.d'
  const rules = ctx.streamRules || []

  // 1. List Rules
  if (pathname === '/api/v1/stream/list' || (pathname === '/api/v1/stream' && req.method === 'GET')) {
    res.json({
      list: rules,
      total: rules.length,
      page: 1,
      page_size: 100
    })
    return true
  }

  // Helper for reserved and conflict ports
  const isPortConflict = (port, protocol, excludeId = null) => {
    // Reserved system ports
    const reservedPorts = [8888, 22, 80, 443]
    if (reservedPorts.includes(port)) {
      return `端口 ${port} 为系统或面板保留端口，禁止占用`
    }
    // Check conflicts with existing enabled stream rules
    for (const r of rules) {
      if (excludeId && r.id === excludeId) continue
      if (r.status === 'running' && r.listen_port === port) {
        // Check protocol overlap
        if (
          r.protocol === 'tcp+udp' ||
          protocol === 'tcp+udp' ||
          r.protocol === protocol
        ) {
          return `端口 ${port} (${protocol.toUpperCase()}) 已被四层转发规则 [${r.name}] 占用`
        }
      }
    }
    return null
  }

  // 2. Create Stream Rule
  if (pathname === '/api/v1/stream/create' || (pathname === '/api/v1/stream' && req.method === 'POST')) {
    const body = await ctx.parseBody(req, res)
    const name = (body.name || '').trim()
    const protocol = (body.protocol || 'tcp').toLowerCase()
    const listenPort = parseInt(body.listen_port, 10)
    const targetHost = (body.target_host || '').trim()
    const targetPort = parseInt(body.target_port, 10)

    if (!name) {
      res.json(null, '规则名称不能为空', 400)
      return true
    }
    if (!['tcp', 'udp', 'tcp+udp'].includes(protocol)) {
      res.json(null, '协议类型仅支持 TCP、UDP 或 TCP+UDP', 400)
      return true
    }
    if (isNaN(listenPort) || listenPort < 1 || listenPort > 65535) {
      res.json(null, '监听端口必须介于 1 ~ 65535 之间', 400)
      return true
    }
    if (!targetHost) {
      res.json(null, '目标后端主机地址不能为空', 400)
      return true
    }
    if (isNaN(targetPort) || targetPort < 1 || targetPort > 65535) {
      res.json(null, '目标端口必须介于 1 ~ 65535 之间', 400)
      return true
    }

    const conflictErr = isPortConflict(listenPort, protocol)
    if (conflictErr) {
      res.json(null, conflictErr, 400)
      return true
    }

    const newRule = {
      id: Date.now(),
      name,
      protocol,
      listen_port: listenPort,
      target_host: targetHost,
      target_port: targetPort,
      proxy_timeout: body.proxy_timeout || '10m',
      proxy_connect_timeout: body.proxy_connect_timeout || '5s',
      description: body.description || '',
      status: 'running',
      created_at: new Date().toLocaleString()
    }

    const confFile = path.join(confDir, `stream_${newRule.id}.conf`)
    const confContent = renderStreamConf(newRule)

    try {
      fs.writeFileSync(confFile, confContent, 'utf8')
    } catch (err) {
      res.json(null, `无法写入规则文件: ${err.message}`, 500)
      return true
    }

    // Verify Nginx
    const testRes = spawnSync('nginx', ['-t'], { encoding: 'utf-8' })
    if (testRes.status !== 0) {
      try { fs.unlinkSync(confFile) } catch {}
      res.json(null, `Nginx 四层规则语法校验失败: ${testRes.stderr || testRes.stdout}`, 400)
      return true
    }

    try { execSync('systemctl reload nginx 2>/dev/null || true') } catch {}

    rules.unshift(newRule)
    ctx.saveJSON(ctx.STREAM_RULES_FILE, rules)
    ctx.logOperation('admin', '创建四层转发规则', `${newRule.name} (:${newRule.listen_port} -> ${newRule.target_host}:${newRule.target_port})`)
    res.json(newRule, '四层转发规则已创建并生效')
    return true
  }

  // 3. Update Rule
  const updateMatch = pathname.match(/^\/api\/v1\/stream\/(\d+)$/)
  if (updateMatch && req.method === 'PUT') {
    const id = parseInt(updateMatch[1], 10)
    const target = rules.find(r => r.id === id)
    if (!target) {
      res.json(null, '规则不存在', 404)
      return true
    }

    const body = await ctx.parseBody(req, res)
    const name = (body.name || target.name).trim()
    const protocol = (body.protocol || target.protocol).toLowerCase()
    const listenPort = body.listen_port ? parseInt(body.listen_port, 10) : target.listen_port
    const targetHost = (body.target_host || target.target_host).trim()
    const targetPort = body.target_port ? parseInt(body.target_port, 10) : target.target_port

    if (isNaN(listenPort) || listenPort < 1 || listenPort > 65535) {
      res.json(null, '监听端口必须介于 1 ~ 65535 之间', 400)
      return true
    }
    if (isNaN(targetPort) || targetPort < 1 || targetPort > 65535) {
      res.json(null, '目标端口必须介于 1 ~ 65535 之间', 400)
      return true
    }

    const conflictErr = isPortConflict(listenPort, protocol, id)
    if (conflictErr) {
      res.json(null, conflictErr, 400)
      return true
    }

    const confFile = path.join(confDir, `stream_${id}.conf`)
    const oldConf = fs.existsSync(confFile) ? fs.readFileSync(confFile, 'utf8') : null

    target.name = name
    target.protocol = protocol
    target.listen_port = listenPort
    target.target_host = targetHost
    target.target_port = targetPort
    if (body.proxy_timeout !== undefined) target.proxy_timeout = body.proxy_timeout
    if (body.proxy_connect_timeout !== undefined) target.proxy_connect_timeout = body.proxy_connect_timeout
    if (body.description !== undefined) target.description = body.description

    if (target.status === 'running') {
      fs.writeFileSync(confFile, renderStreamConf(target), 'utf8')
      const testRes = spawnSync('nginx', ['-t'], { encoding: 'utf-8' })
      if (testRes.status !== 0) {
        if (oldConf) fs.writeFileSync(confFile, oldConf, 'utf8')
        else try { fs.unlinkSync(confFile) } catch {}
        res.json(null, `Nginx 四层规则语法校验失败: ${testRes.stderr || testRes.stdout}`, 400)
        return true
      }
      try { execSync('systemctl reload nginx 2>/dev/null || true') } catch {}
    }

    ctx.saveJSON(ctx.STREAM_RULES_FILE, rules)
    ctx.logOperation('admin', '更新四层转发规则', `${target.name} (ID: ${id})`)
    res.json(target, '四层转发规则已更新')
    return true
  }

  // 4. Toggle Rule Status (Enable / Disable)
  const toggleMatch = pathname.match(/^\/api\/v1\/stream\/(\d+)\/toggle$/)
  if (toggleMatch && req.method === 'POST') {
    const id = parseInt(toggleMatch[1], 10)
    const target = rules.find(r => r.id === id)
    if (!target) {
      res.json(null, '规则不存在', 404)
      return true
    }

    const confFile = path.join(confDir, `stream_${id}.conf`)
    if (target.status === 'running') {
      // Disable: remove conf file
      try { if (fs.existsSync(confFile)) fs.unlinkSync(confFile) } catch {}
      target.status = 'stopped'
    } else {
      // Enable: check conflict and re-render
      const conflictErr = isPortConflict(target.listen_port, target.protocol, id)
      if (conflictErr) {
        res.json(null, conflictErr, 400)
        return true
      }
      fs.writeFileSync(confFile, renderStreamConf(target), 'utf8')
      const testRes = spawnSync('nginx', ['-t'], { encoding: 'utf-8' })
      if (testRes.status !== 0) {
        try { fs.unlinkSync(confFile) } catch {}
        res.json(null, `Nginx 校验失败，无法启用: ${testRes.stderr || testRes.stdout}`, 400)
        return true
      }
      target.status = 'running'
    }

    try { execSync('nginx -t && systemctl reload nginx 2>/dev/null || true') } catch {}
    ctx.saveJSON(ctx.STREAM_RULES_FILE, rules)
    ctx.logOperation('admin', `${target.status === 'running' ? '启用' : '暂停'}四层转发规则`, target.name)
    res.json(target, `规则已${target.status === 'running' ? '启用' : '暂停'}`)
    return true
  }

  // 5. Delete Rule
  const delMatch = pathname.match(/^\/api\/v1\/stream\/(\d+)$/)
  if (delMatch && req.method === 'DELETE') {
    const id = parseInt(delMatch[1], 10)
    const target = rules.find(r => r.id === id)
    if (target) {
      const confFile = path.join(confDir, `stream_${id}.conf`)
      try { if (fs.existsSync(confFile)) fs.unlinkSync(confFile) } catch {}
      try { execSync('nginx -t && systemctl reload nginx 2>/dev/null || true') } catch {}
      ctx.streamRules = rules.filter(r => r.id !== id)
      ctx.saveJSON(ctx.STREAM_RULES_FILE, ctx.streamRules)
      ctx.logOperation('admin', '删除四层转发规则', target.name)
    }
    res.json(null, '规则删除成功')
    return true
  }

  return false
}
