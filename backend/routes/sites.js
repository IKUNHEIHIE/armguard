import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { spawnSync, execSync } from 'child_process'

export function renderNginxSiteConf(site, ctx) {
  const domains = [site.domain, ...(site.domains || [])].filter(Boolean)
  const serverNames = [...new Set(domains)].join(' ')
  const rootPath = path.join(site.path, site.sub_dir || '')
  const logDir = '/var/log/nginx'
  const accessLog = path.join(logDir, `${site.domain}.access.log`)
  const errorLog = path.join(logDir, `${site.domain}.error.log`)

  try { fs.mkdirSync(logDir, { recursive: true }) } catch {}

  // Basic Auth
  let authDirectives = ''
  if (site.basic_auth_enabled && site.basic_auth_user && site.basic_auth_pass) {
    const htpasswdPath = path.join(ctx.DATA_DIR, `htpasswd_${site.domain}`)
    try {
      const shaPass = crypto.createHash('sha1').update(String(site.basic_auth_pass)).digest('base64')
      fs.writeFileSync(htpasswdPath, `${site.basic_auth_user}:{SHA}${shaPass}\n`, 'utf8')
      authDirectives = `\n    auth_basic "Protected Area";\n    auth_basic_user_file ${htpasswdPath};`
    } catch {}
  }

  // Rewrite Rules
  let rewriteRules = ''
  if (site.rewrite_preset === 'spa') {
    rewriteRules = `\n    location / {\n        try_files $uri $uri/ /index.html;\n    }`
  } else if (site.rewrite_preset === 'wordpress') {
    rewriteRules = `\n    location / {\n        try_files $uri $uri/ /index.php?$args;\n    }`
  } else if (site.rewrite_preset === 'laravel') {
    rewriteRules = `\n    location / {\n        try_files $uri $uri/ /index.php?$query_string;\n    }`
  } else if (site.rewrite_preset === 'typecho') {
    rewriteRules = `\n    if (!-e $request_filename) {\n        rewrite ^(.*)$ /index.php$1 last;\n    }`
  } else if (site.custom_rewrite) {
    const raw = site.custom_rewrite.trim()
    const forbiddenPatterns = [
      /ssl_certificate/i,
      /access_log/i,
      /error_log/i,
      /include\s+/i,
      /\broot\s+\/\s*;/i,
      /\balias\s+\/\s*;/i,
      /fastcgi_pass/i,
      /proxy_pass/i,
      /client_body_temp_path/i
    ]
    const openBraces = (raw.match(/\{/g) || []).length
    const closeBraces = (raw.match(/\}/g) || []).length
    const hasForbidden = forbiddenPatterns.some(p => p.test(raw))
    if (!hasForbidden && openBraces === closeBraces) {
      rewriteRules = `\n    ${raw}`
    }
  }

  // PHP-FPM
  let phpDirectives = ''
  if (site.php_version && site.php_version !== 'static' && site.php_version !== 'proxy') {
    const vClean = String(site.php_version).replace(/^php/, '').replace(/(\d)(\d)/, '$1.$2')
    const candidates = [
      `/run/php/php${vClean}-fpm.sock`,
      `/run/php/php${site.php_version}-fpm.sock`,
      '/run/php/php8.3-fpm.sock',
      '/run/php/php8.2-fpm.sock',
      '/run/php/php8.4-fpm.sock',
      '/run/php/php-fpm.sock'
    ]
    const fpmSock = candidates.find(c => fs.existsSync(c))
    const passTarget = fpmSock ? `unix:${fpmSock}` : '127.0.0.1:9000'
    phpDirectives = `\n    location ~ \\.php$ {\n        include snippets/fastcgi-php.conf;\n        fastcgi_pass ${passTarget};\n        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;\n        include fastcgi_params;\n    }`
  }

  // Reverse Proxy
  let proxyDirectives = ''
  if (site.proxy_enabled && site.proxy_pass) {
    const safePass = String(site.proxy_pass).trim()
    const safePath = String(site.proxy_path || '/').trim()
    const isValidPass = /^(https?|grpc|grpcs):\/\/[a-zA-Z0-9_.:-]+(\/[a-zA-Z0-9_.~%-]*)?$|^unix:[a-zA-Z0-9_.\/-]+$/.test(safePass)
    const isValidPath = /^\/[a-zA-Z0-9_.\/-]*$/.test(safePath)
    if (isValidPass && isValidPath) {
      if (site.grpc_enabled) {
        proxyDirectives = `\n    location ${safePath} {\n        grpc_pass ${safePass};\n        grpc_set_header Host $host;\n        grpc_set_header X-Real-IP $remote_addr;\n        grpc_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        grpc_read_timeout 300s;\n        grpc_send_timeout 300s;\n        client_max_body_size 100m;\n    }`
      } else {
        const wsHeaders = site.websocket_enabled !== false ? `\n        proxy_http_version 1.1;\n        proxy_set_header Upgrade $http_upgrade;\n        proxy_set_header Connection "upgrade";` : ''
        proxyDirectives = `\n    location ${safePath} {\n        proxy_pass ${safePass};\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto $scheme;${wsHeaders}\n        client_max_body_size 100m;\n    }`
      }
    }
  }

  // Hotlink protection
  let staticDirectives = ''
  if (site.hotlink_protection) {
    staticDirectives = `\n    location ~* \\.(gif|jpg|jpeg|png|bmp|swf|webp)$ {\n        valid_referers none blocked ${site.domain} *.${site.domain};\n        if ($invalid_referer) {\n            return 403;\n        }\n    }`
  }

  const listenPort = site.port || 80
  const sslPort = site.ssl_port || 443
  const h2Flag = site.grpc_enabled ? ' http2' : ''

  // Stopped status (503 Maintenance)
  if (site.status === 'stopped') {
    return `server {\n    listen ${listenPort};\n    listen [::]:${listenPort};\n    server_name ${serverNames};\n    access_log ${accessLog};\n    error_log ${errorLog};\n    return 503 "Site [${site.domain}] is currently stopped for maintenance.";\n}`
  }

  // SSL Paths
  const certDir = path.join(ctx.SSL_DIR, site.domain)
  const sslCert = path.join(certDir, 'fullchain.pem')
  const sslKey = path.join(certDir, 'privkey.pem')
  const hasSSL = site.ssl_enabled && fs.existsSync(sslCert) && fs.existsSync(sslKey)

  // ACME HTTP-01 Challenge Pass-through
  const acmeChallengeLocation = `\n    location ^~ /.well-known/acme-challenge/ {\n        default_type "text/plain";\n        root /var/www/html;\n    }`

  if (hasSSL && site.ssl_force_https) {
    return `server {\n    listen ${listenPort};\n    listen [::]:${listenPort};\n    server_name ${serverNames};${acmeChallengeLocation}\n    return 301 https://$host$request_uri;\n}\n\nserver {\n    listen ${sslPort} ssl http2;\n    listen [::]:${sslPort} ssl http2;\n    server_name ${serverNames};\n    root ${rootPath};\n    index ${site.default_index || 'index.html index.htm index.php'};\n\n    ssl_certificate ${sslCert};\n    ssl_certificate_key ${sslKey};\n    ssl_protocols TLSv1.2 TLSv1.3;\n    ssl_ciphers HIGH:!aNULL:!MD5;\n    ssl_prefer_server_ciphers on;\n\n    access_log ${accessLog};\n    error_log ${errorLog};\n    client_max_body_size 50m;${acmeChallengeLocation}${authDirectives}${proxyDirectives || (rewriteRules + phpDirectives + staticDirectives)}\n}`
  } else if (hasSSL) {
    return `server {\n    listen ${listenPort}${h2Flag};\n    listen [::]:${listenPort}${h2Flag};\n    listen ${sslPort} ssl http2;\n    listen [::]:${sslPort} ssl http2;\n    server_name ${serverNames};\n    root ${rootPath};\n    index ${site.default_index || 'index.html index.htm index.php'};\n\n    ssl_certificate ${sslCert};\n    ssl_certificate_key ${sslKey};\n    ssl_protocols TLSv1.2 TLSv1.3;\n\n    access_log ${accessLog};\n    error_log ${errorLog};\n    client_max_body_size 50m;${acmeChallengeLocation}${authDirectives}${proxyDirectives || (rewriteRules + phpDirectives + staticDirectives)}\n}`
  } else {
    return `server {\n    listen ${listenPort}${h2Flag};\n    listen [::]:${listenPort}${h2Flag};\n    server_name ${serverNames};\n    root ${rootPath};\n    index ${site.default_index || 'index.html index.htm index.php'};\n\n    access_log ${accessLog};\n    error_log ${errorLog};\n    client_max_body_size 50m;${acmeChallengeLocation}${authDirectives}${proxyDirectives || (rewriteRules + phpDirectives + staticDirectives)}\n}`
  }
}

export async function handleSites(pathname, req, res, url, ctx) {
  if (!pathname.startsWith('/api/v1/sites')) return false

  // 1. List / Create
  if (pathname === '/api/v1/sites') {
    if (req.method === 'GET') {
      res.json({ list: ctx.sites, total: ctx.sites.length, page: 1, page_size: 20 })
      return true
    }
    if (req.method === 'POST') {
      const body = await ctx.parseBody(req, res)
      if (!body.domain || !ctx.isValidDomain(body.domain)) {
        res.json(null, '域名格式不合法，仅支持字母、数字与横线', 400)
        return true
      }
      const sitePath = body.path || path.join(ctx.WWW_ROOT, body.domain)
      fs.mkdirSync(sitePath, { recursive: true })
      const sampleIndex = path.join(sitePath, 'index.html')
      if (!fs.existsSync(sampleIndex)) {
        fs.writeFileSync(sampleIndex, `<!doctype html><html><head><meta charset="utf-8"><title>${body.domain}</title></head><body style="font-family:sans-serif;padding:40px;background:#0b0f19;color:#fff;"><h1>Welcome to ${body.domain}</h1><p>Powered by ArmGuard on ARM64 Linux</p></body></html>`, 'utf8')
      }

      const validDomains = [body.domain, ...(body.domains || [])].filter(ctx.isValidDomain)
      const newSite = {
        id: Date.now(),
        domain: body.domain,
        domains: validDomains,
        path: sitePath,
        sub_dir: body.sub_dir || '',
        port: body.port ? parseInt(body.port, 10) : 80,
        php_version: body.php_version || 'static',
        proxy_enabled: body.php_version === 'proxy' || !!body.proxy_enabled,
        proxy_pass: body.proxy_pass || '',
        proxy_path: '/',
        grpc_enabled: !!body.grpc_enabled,
        websocket_enabled: true,
        rewrite_preset: body.rewrite_preset || 'spa',
        default_index: 'index.html index.htm index.php',
        basic_auth_enabled: false,
        basic_auth_user: '',
        basic_auth_pass: '',
        hotlink_protection: false,
        status: 'running',
        ssl_enabled: false,
        ssl_force_https: false,
        created_at: new Date().toLocaleString()
      }

      const confContent = renderNginxSiteConf(newSite, ctx)
      fs.writeFileSync(path.join(ctx.NGINX_CONF_DIR, `${body.domain}.conf`), confContent, 'utf8')
      try {
        const t = spawnSync('nginx', ['-t'])
        if (t.status === 0) spawnSync('systemctl', ['reload', 'nginx'])
      } catch {}

      ctx.sites.unshift(newSite)
      ctx.saveJSON(ctx.SITES_FILE, ctx.sites)
      ctx.logOperation('admin', '创建虚拟主机', body.domain)
      res.json(newSite, '站点创建成功')
      return true
    }
  }

  // 2. Delete Site
  const delMatch = pathname.match(/^\/api\/v1\/sites\/(\d+)$/)
  if (delMatch && req.method === 'DELETE') {
    const id = parseInt(delMatch[1], 10)
    const target = ctx.sites.find(s => s.id === id)
    const deleteFiles = url.searchParams.get('delete_files') === 'true'
    if (target) {
      try { fs.unlinkSync(path.join(ctx.NGINX_CONF_DIR, `${target.domain}.conf`)) } catch {}
      if (deleteFiles && target.path && target.path.startsWith('/www/wwwroot/') && fs.existsSync(target.path)) {
        try { fs.rmSync(target.path, { recursive: true, force: true }) } catch {}
      }
      try { execSync('nginx -t && systemctl reload nginx 2>/dev/null || true') } catch {}
      ctx.sites = ctx.sites.filter(s => s.id !== id)
      ctx.saveJSON(ctx.SITES_FILE, ctx.sites)
      ctx.logOperation('admin', '删除虚拟主机', `${target.domain}${deleteFiles ? ' (同时删除网站文件)' : ''}`)
    }
    res.json(null, '站点删除成功')
    return true
  }

  // 3. Details
  const detailsMatch = pathname.match(/^\/api\/v1\/sites\/(\d+)\/details$/)
  if (detailsMatch) {
    const id = parseInt(detailsMatch[1], 10)
    const target = ctx.sites.find(s => s.id === id)
    if (!target) {
      res.json(null, '站点不存在', 404)
      return true
    }
    res.json(target)
    return true
  }

  // 4. Update Settings
  const settingsMatch = pathname.match(/^\/api\/v1\/sites\/(\d+)\/settings$/)
  if (settingsMatch && req.method === 'PUT') {
    const id = parseInt(settingsMatch[1], 10)
    const target = ctx.sites.find(s => s.id === id)
    if (!target) {
      res.json(null, '站点不存在', 404)
      return true
    }
    const body = await ctx.parseBody(req, res)
    Object.assign(target, body)

    const confContent = renderNginxSiteConf(target, ctx)
    const confPath = path.join(ctx.NGINX_CONF_DIR, `${target.domain}.conf`)
    fs.writeFileSync(confPath, confContent, 'utf8')

    const testRes = spawnSync('nginx', ['-t'], { encoding: 'utf-8' })
    if (testRes.status !== 0) {
      res.json(null, `Nginx 语法错误: ${testRes.stderr}`, 500)
      return true
    }
    execSync('systemctl reload nginx 2>/dev/null || true')

    ctx.saveJSON(ctx.SITES_FILE, ctx.sites)
    ctx.logOperation('admin', '更新站点高级设置', target.domain)
    res.json(target, '站点设置已保存并重载生效')
    return true
  }

  // 5. Toggle Run/Stop
  const toggleMatch = pathname.match(/^\/api\/v1\/sites\/(\d+)\/toggle$/)
  if (toggleMatch && req.method === 'PUT') {
    const id = parseInt(toggleMatch[1], 10)
    const target = ctx.sites.find(s => s.id === id)
    if (target) {
      target.status = target.status === 'running' ? 'stopped' : 'running'
      const confContent = renderNginxSiteConf(target, ctx)
      fs.writeFileSync(path.join(ctx.NGINX_CONF_DIR, `${target.domain}.conf`), confContent, 'utf8')
      try { execSync('nginx -t && systemctl reload nginx 2>/dev/null || true') } catch {}
      ctx.saveJSON(ctx.SITES_FILE, ctx.sites)
      ctx.logOperation('admin', `${target.status === 'running' ? '启用' : '暂停'}站点`, target.domain)
      res.json({ status: target.status }, `站点已${target.status === 'running' ? '启用' : '暂停'}`)
      return true
    }
    res.json(null, '站点不存在', 404)
    return true
  }

  // 6. Logs
  const logsMatch = pathname.match(/^\/api\/v1\/sites\/(\d+)\/logs$/)
  if (logsMatch) {
    const id = parseInt(logsMatch[1], 10)
    const target = ctx.sites.find(s => s.id === id)
    const logType = url.searchParams.get('type') || 'access'
    const logFile = path.join('/var/log/nginx', `${target?.domain}.${logType}.log`)

    if (req.method === 'DELETE') {
      try { fs.writeFileSync(logFile, '', 'utf8') } catch {}
      ctx.logOperation('admin', `清空站点日志 [${logType}]`, target?.domain)
      res.json(null, '日志已成功清空')
      return true
    }

    let logs = []
    try {
      if (fs.existsSync(logFile)) {
        const content = fs.readFileSync(logFile, 'utf8')
        logs = content.split('\n').filter(Boolean).slice(-60)
      }
    } catch {}

    res.json({ logs })
    return true
  }

  // 7. Raw VHost Config
  const configMatch = pathname.match(/^\/api\/v1\/sites\/(\d+)\/config$/)
  if (configMatch) {
    const id = parseInt(configMatch[1], 10)
    const target = ctx.sites.find(s => s.id === id)
    const confPath = path.join(ctx.NGINX_CONF_DIR, `${target?.domain}.conf`)
    if (req.method === 'GET') {
      let conf = ''
      try { conf = fs.readFileSync(confPath, 'utf8') } catch {}
      res.json({ nginx_conf: conf })
      return true
    }
    if (req.method === 'PUT') {
      const body = await ctx.parseBody(req, res)
      fs.writeFileSync(confPath, body.nginx_conf, 'utf8')
      const testRes = spawnSync('nginx', ['-t'], { encoding: 'utf-8' })
      if (testRes.status !== 0) {
        res.json(null, `Nginx 配置测试未通过: ${testRes.stderr}`, 500)
        return true
      }
      try { spawnSync('systemctl', ['reload', 'nginx']) } catch {}
      ctx.logOperation('admin', '更新 Nginx 配置文件', target?.domain)
      res.json(null, '配置保存并重载成功')
      return true
    }
  }

  // 8. SSL Management for Site
  const sslMatch = pathname.match(/^\/api\/v1\/sites\/(\d+)\/ssl$/)
  if (sslMatch) {
    const id = parseInt(sslMatch[1], 10)
    const target = ctx.sites.find(s => s.id === id)
    if (!target) {
      res.json(null, '站点不存在', 404)
      return true
    }

    const certDir = path.join(ctx.SSL_DIR, target.domain)
    const sslCertPath = path.join(certDir, 'fullchain.pem')
    const sslKeyPath = path.join(certDir, 'privkey.pem')

    if (req.method === 'GET') {
      let cert = ''
      let key = ''
      try {
        if (fs.existsSync(sslCertPath)) cert = fs.readFileSync(sslCertPath, 'utf8')
        if (fs.existsSync(sslKeyPath)) key = fs.readFileSync(sslKeyPath, 'utf8')
      } catch {}

      res.json({
        ssl_enabled: target.ssl_enabled,
        ssl_force_https: target.ssl_force_https,
        cert,
        key,
        has_cert_files: !!(cert && key)
      })
      return true
    }

    if (req.method === 'PUT') {
      const body = await ctx.parseBody(req, res)
      let prevCert = fs.existsSync(sslCertPath) ? fs.readFileSync(sslCertPath, 'utf8') : null
      let prevKey = fs.existsSync(sslKeyPath) ? fs.readFileSync(sslKeyPath, 'utf8') : null

      if (body.cert && body.key) {
        try {
          fs.mkdirSync(certDir, { recursive: true })
          fs.writeFileSync(sslCertPath, body.cert.trim() + '\n', 'utf8')
          fs.writeFileSync(sslKeyPath, body.key.trim() + '\n', 'utf8')
        } catch (e) {
          res.json(null, `写入证书文件失败: ${e.message}`, 500)
          return true
        }
      }

      target.ssl_enabled = body.ssl_enabled !== false
      target.ssl_force_https = Boolean(body.ssl_force_https)

      const confContent = renderNginxSiteConf(target, ctx)
      const confPath = path.join(ctx.NGINX_CONF_DIR, `${target.domain}.conf`)
      const prevConf = fs.existsSync(confPath) ? fs.readFileSync(confPath, 'utf8') : null

      try {
        fs.writeFileSync(confPath, confContent, 'utf8')
        const testRes = spawnSync('nginx', ['-t'], { encoding: 'utf-8' })
        if (testRes.status !== 0) {
          if (prevConf !== null) fs.writeFileSync(confPath, prevConf, 'utf8')
          if (prevCert !== null) fs.writeFileSync(sslCertPath, prevCert, 'utf8')
          else if (fs.existsSync(sslCertPath)) fs.unlinkSync(sslCertPath)
          if (prevKey !== null) fs.writeFileSync(sslKeyPath, prevKey, 'utf8')
          else if (fs.existsSync(sslKeyPath)) fs.unlinkSync(sslKeyPath)

          res.json(null, `SSL 证书或配置校验未通过: ${testRes.stderr}`, 400)
          return true
        }
        execSync('systemctl reload nginx 2>/dev/null || true')
        ctx.saveJSON(ctx.SITES_FILE, ctx.sites)
        ctx.logOperation('admin', '配置站点 SSL 证书', target.domain)
        res.json(null, 'SSL 证书已成功部署并生效！')
        return true
      } catch (err) {
        res.json(null, `部署 SSL 失败: ${err.message}`, 500)
        return true
      }
    }
  }

  return false
}
