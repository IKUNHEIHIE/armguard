import fs from 'fs'
import path from 'path'
import { spawnSync, execSync } from 'child_process'
import { renderNginxSiteConf } from './sites.js'

export function parseCertMetadata(certPath) {
  try {
    if (!fs.existsSync(certPath)) return null
    const res = spawnSync('openssl', ['x509', '-in', certPath, '-noout', '-issuer', '-dates', '-subject'], { encoding: 'utf-8' })
    if (res.status !== 0) return null
    const out = res.stdout || ''

    // Parse subject
    let subjectCN = ''
    const subjMatch = out.match(/subject=\s*(.*)/i)
    if (subjMatch) {
      const cnMatch = subjMatch[1].match(/CN\s*=\s*([^,]+)/)
      if (cnMatch) subjectCN = cnMatch[1].trim()
    }

    // Parse issuer
    let issuer = 'Unknown CA'
    let isSelfSigned = false
    const issuerMatch = out.match(/issuer=\s*(.*)/i)
    if (issuerMatch) {
      const rawIssuer = issuerMatch[1].trim()
      if (rawIssuer.includes("Let's Encrypt")) {
        const cnMatch = rawIssuer.match(/CN\s*=\s*([^,]+)/)
        issuer = cnMatch ? `Let's Encrypt (${cnMatch[1].trim()})` : "Let's Encrypt Authority"
      } else if (rawIssuer.includes('ZeroSSL')) {
        issuer = 'ZeroSSL ECC CA'
      } else if (rawIssuer.includes('Cloudflare')) {
        issuer = 'Cloudflare Origin CA'
      } else {
        const cnMatch = rawIssuer.match(/CN\s*=\s*([^,]+)/)
        const oMatch = rawIssuer.match(/O\s*=\s*([^,]+)/)
        issuer = cnMatch ? cnMatch[1].trim() : (oMatch ? oMatch[1].trim() : rawIssuer)
      }
      if (rawIssuer.includes(subjectCN) || rawIssuer === subjectCN || issuer === subjectCN) {
        isSelfSigned = true
      }
    }

    // Parse notAfter
    let expiresAt = ''
    let daysRemaining = 90
    const notAfterMatch = out.match(/notAfter=\s*(.*)/i)
    if (notAfterMatch) {
      const expDate = new Date(notAfterMatch[1].trim())
      if (!isNaN(expDate.getTime())) {
        expiresAt = expDate.toISOString().substring(0, 10)
        daysRemaining = Math.max(0, Math.ceil((expDate.getTime() - Date.now()) / (1000 * 86400)))
      }
    }

    return {
      issuer: isSelfSigned ? 'Self-Signed (本地自签名)' : issuer,
      expires_at: expiresAt,
      days_remaining: daysRemaining,
      is_self_signed: isSelfSigned
    }
  } catch (e) {
    return null
  }
}

export async function handleSSL(pathname, req, res, url, ctx) {
  if (!pathname.startsWith('/api/v1/ssl/')) return false

  // 1. List / Create Certs
  if (pathname === '/api/v1/ssl/certs') {
    if (req.method === 'GET') {
      // Dynamically recalculate days_remaining and re-parse metadata if files exist
      ctx.sslCerts.forEach(cert => {
        const certFile = path.join(ctx.SSL_DIR, cert.domain, 'fullchain.pem')
        const meta = parseCertMetadata(certFile)
        if (meta) {
          cert.issuer = meta.issuer
          cert.expires_at = meta.expires_at || cert.expires_at
          cert.days_remaining = meta.days_remaining
        }
      })
      res.json({ list: ctx.sslCerts })
      return true
    }
    if (req.method === 'POST') {
      const body = await ctx.parseBody(req, res)
      if (!body.domain || !ctx.isValidDomain(body.domain)) {
        res.json(null, '域名格式不合法', 400)
        return true
      }
      const certDir = path.join(ctx.SSL_DIR, body.domain)
      fs.mkdirSync(certDir, { recursive: true })
      const certPath = path.join(certDir, 'fullchain.pem')
      const keyPath = path.join(certDir, 'privkey.pem')

      if (body.certificate) {
        fs.writeFileSync(certPath, body.certificate, 'utf8')
      }
      if (body.private_key) {
        fs.writeFileSync(keyPath, body.private_key, 'utf8')
      }

      const meta = parseCertMetadata(certPath)
      const newCert = {
        id: Date.now(),
        domain: body.domain,
        sans: body.sans || [body.domain],
        issuer: meta?.issuer || (body.certificate ? 'Custom Uploaded CA' : "Let's Encrypt Authority X3"),
        expires_at: meta?.expires_at || new Date(Date.now() + 90 * 86400000).toISOString().substring(0, 10),
        days_remaining: meta?.days_remaining ?? 90,
        auto_renew: true,
        is_deployed: false,
        deployed_sites: [],
        created_at: new Date().toLocaleDateString()
      }
      ctx.sslCerts.unshift(newCert)
      ctx.saveJSON(ctx.CERTS_FILE, ctx.sslCerts)
      ctx.logOperation('admin', '申请/导入 SSL 证书', body.domain)
      res.json(newCert, '证书配置成功')
      return true
    }
  }

  // 2. Upload Custom Certificate
  if (pathname === '/api/v1/ssl/certs/upload' && req.method === 'POST') {
    const body = await ctx.parseBody(req, res)
    if (!body.domain || !ctx.isValidDomain(body.domain)) {
      res.json(null, '域名格式不合法', 400)
      return true
    }
    if (!body.certificate || !body.private_key) {
      res.json(null, '证书公钥 (CRT) 与私钥 (KEY) 均不能为空', 400)
      return true
    }
    const certDir = path.join(ctx.SSL_DIR, body.domain)
    fs.mkdirSync(certDir, { recursive: true })
    const certPath = path.join(certDir, 'fullchain.pem')
    const keyPath = path.join(certDir, 'privkey.pem')
    fs.writeFileSync(certPath, body.certificate.trim() + '\n', 'utf8')
    fs.writeFileSync(keyPath, body.private_key.trim() + '\n', 'utf8')

    const meta = parseCertMetadata(certPath)
    const newCert = {
      id: Date.now(),
      domain: body.domain,
      sans: [body.domain],
      issuer: meta?.issuer || 'Custom Uploaded CA',
      expires_at: meta?.expires_at || new Date(Date.now() + 365 * 86400000).toISOString().substring(0, 10),
      days_remaining: meta?.days_remaining ?? 365,
      auto_renew: false,
      is_deployed: false,
      deployed_sites: [],
      created_at: new Date().toLocaleDateString()
    }
    ctx.sslCerts.unshift(newCert)
    ctx.saveJSON(ctx.CERTS_FILE, ctx.sslCerts)

    if (body.auto_deploy_site_id) {
      const site = ctx.sites.find(s => s.id === parseInt(body.auto_deploy_site_id, 10))
      if (site) {
        site.ssl_enabled = true
        site.ssl_cert_path = certPath
        site.ssl_key_path = keyPath
        const confContent = renderNginxSiteConf(site, ctx)
        fs.writeFileSync(path.join(ctx.NGINX_CONF_DIR, `${site.domain}.conf`), confContent, 'utf8')
        try { execSync('systemctl reload nginx 2>/dev/null || true') } catch {}
        newCert.is_deployed = true
        newCert.deployed_sites.push(site.domain)
        ctx.saveJSON(ctx.SITES_FILE, ctx.sites)
        ctx.saveJSON(ctx.CERTS_FILE, ctx.sslCerts)
      }
    }
    ctx.logOperation('admin', '上传 SSL 证书', body.domain)
    res.json({ cert_id: newCert.id }, '证书上传成功并已持久化保存')
    return true
  }

  // 3. Real ACME / Certbot Certificate Application
  if (pathname === '/api/v1/ssl/certs/apply' && req.method === 'POST') {
    const body = await ctx.parseBody(req, res)
    if (!body.domain || !ctx.isValidDomain(body.domain)) {
      res.json(null, '域名格式不合法', 400)
      return true
    }

    const domain = body.domain.trim()
    const sans = Array.isArray(body.sans) ? body.sans.filter(ctx.isValidDomain) : []
    const allDomains = [...new Set([domain, ...sans])]
    const certDir = path.join(ctx.SSL_DIR, domain)
    fs.mkdirSync(certDir, { recursive: true })
    const keyPath = path.join(certDir, 'privkey.pem')
    const certPath = path.join(certDir, 'fullchain.pem')

    const webrootDir = '/var/www/html'
    try {
      fs.mkdirSync(path.join(webrootDir, '.well-known/acme-challenge'), { recursive: true })
    } catch {}

    const provider = body.provider || 'letsencrypt'

    if (provider === 'self_signed') {
      // Local self-signed test cert
      try {
        spawnSync('openssl', [
          'req', '-x509', '-nodes', '-days', '90', '-newkey', 'rsa:2048',
          '-keyout', keyPath, '-out', certPath,
          '-subj', `/CN=${domain}`
        ], { encoding: 'utf-8' })
      } catch (e) {
        res.json(null, `生成自签名证书失败: ${e.message}`, 500)
        return true
      }
    } else {
      // REAL ACME Certbot Engine
      const certbotArgs = [
        'certonly',
        '--webroot',
        '-w', webrootDir,
        '--agree-tos',
        '--register-unsafely-without-email',
        '--non-interactive'
      ]
      for (const d of allDomains) {
        certbotArgs.push('-d', d)
      }

      console.log(`[ArmGuard ACME] Executing certbot: certbot ${certbotArgs.join(' ')}`)
      const certbotRes = spawnSync('certbot', certbotArgs, { encoding: 'utf-8', timeout: 60000 })

      if (certbotRes.status !== 0) {
        const errMsg = certbotRes.stderr || certbotRes.stdout || 'Certbot 进程执行异常'
        console.error('[ArmGuard ACME] Certbot failed:', errMsg)
        let userErr = errMsg
        if (errMsg.includes('Invalid response from')) {
          userErr = '域名所有权验证失败 (HTTP-01 404 或超时)。请确保域名的 DNS A/AAAA 解析已生效指向本服务器，且 80 端口可公网访问。'
        } else if (errMsg.includes('Connection refused')) {
          userErr = '连接服务器 80 端口被拒绝，请确认 Nginx 80 端口处于运行状态。'
        } else if (errMsg.includes('too many requests') || errMsg.includes('rate limited')) {
          userErr = "Let's Encrypt 触发申请速率限制，请稍后再试。"
        }
        res.json({ output: errMsg }, `申请 Let's Encrypt 证书失败: ${userErr}`, 400)
        return true
      }

      // Certbot places certs in /etc/letsencrypt/live/<domain>/
      const leLiveDir = path.join('/etc/letsencrypt/live', domain)
      const leFullchain = path.join(leLiveDir, 'fullchain.pem')
      const lePrivkey = path.join(leLiveDir, 'privkey.pem')

      if (fs.existsSync(leFullchain) && fs.existsSync(lePrivkey)) {
        try {
          fs.copyFileSync(leFullchain, certPath)
          fs.copyFileSync(lePrivkey, keyPath)
        } catch (e) {
          res.json(null, `同步 Let's Encrypt 证书文件失败: ${e.message}`, 500)
          return true
        }
      } else {
        res.json(null, 'Certbot 执行完毕但未在 /etc/letsencrypt/live/ 检索到证书文件', 500)
        return true
      }
    }

    // Dynamic metadata extraction from real X.509 certificate
    const parsed = parseCertMetadata(certPath)
    const certId = Date.now()
    const newCert = {
      id: certId,
      cert_id: certId,
      domain: domain,
      sans: allDomains,
      issuer: parsed?.issuer || (provider === 'self_signed' ? 'Self-Signed (本地自签名)' : "Let's Encrypt Authority"),
      expires_at: parsed?.expires_at || new Date(Date.now() + 90 * 86400000).toISOString().substring(0, 10),
      days_remaining: parsed?.days_remaining ?? 90,
      auto_renew: true,
      is_deployed: false,
      deployed_sites: [],
      created_at: new Date().toLocaleDateString()
    }

    // Replace existing cert for same domain if exists
    const existingIdx = ctx.sslCerts.findIndex(c => c.domain === domain)
    if (existingIdx !== -1) {
      newCert.is_deployed = ctx.sslCerts[existingIdx].is_deployed
      newCert.deployed_sites = ctx.sslCerts[existingIdx].deployed_sites || []
      ctx.sslCerts[existingIdx] = newCert
    } else {
      ctx.sslCerts.unshift(newCert)
    }
    ctx.saveJSON(ctx.CERTS_FILE, ctx.sslCerts)

    // Auto deploy if requested
    if (body.auto_deploy_site_id) {
      const site = ctx.sites.find(s => s.id === parseInt(body.auto_deploy_site_id, 10))
      if (site) {
        site.ssl_enabled = true
        site.ssl_cert_path = certPath
        site.ssl_key_path = keyPath
        const confContent = renderNginxSiteConf(site, ctx)
        fs.writeFileSync(path.join(ctx.NGINX_CONF_DIR, `${site.domain}.conf`), confContent, 'utf8')
        try { execSync('systemctl reload nginx 2>/dev/null || true') } catch {}
        newCert.is_deployed = true
        if (!newCert.deployed_sites.includes(site.domain)) {
          newCert.deployed_sites.push(site.domain)
        }
        ctx.saveJSON(ctx.SITES_FILE, ctx.sites)
        ctx.saveJSON(ctx.CERTS_FILE, ctx.sslCerts)
      }
    }

    ctx.logOperation('admin', '在线申请/换发 SSL 证书', domain)
    res.json(newCert, `Let's Encrypt 证书申请成功！颁发者: ${newCert.issuer}，有效期至: ${newCert.expires_at}`)
    return true
  }

  // 4. Get Certificate Detail & Contents (fullchain.pem, privkey.pem, metadata)
  const detailMatch = pathname.match(/^\/api\/v1\/ssl\/certs\/(\d+)\/detail$/)
  if (detailMatch && req.method === 'GET') {
    const id = parseInt(detailMatch[1], 10)
    const cert = ctx.sslCerts.find(c => c.id === id)
    if (!cert) {
      res.json(null, '证书不存在', 404)
      return true
    }

    const certDir = path.join(ctx.SSL_DIR, cert.domain)
    const certPath = path.join(certDir, 'fullchain.pem')
    const keyPath = path.join(certDir, 'privkey.pem')

    let fullchain = ''
    let privkey = ''
    let opensslText = ''
    let serialNumber = ''
    let sigAlgorithm = ''
    let notBefore = ''
    let notAfter = ''

    if (fs.existsSync(certPath)) {
      try {
        fullchain = fs.readFileSync(certPath, 'utf8')
      } catch (e) {
        fullchain = `读取证书文件失败: ${e.message}`
      }

      try {
        const textRes = spawnSync('openssl', ['x509', '-in', certPath, '-text', '-noout'], { encoding: 'utf-8' })
        if (textRes.status === 0) {
          opensslText = textRes.stdout || ''
          const serialMatch = opensslText.match(/Serial Number:\s*([^\n]+)/i)
          if (serialMatch) serialNumber = serialMatch[1].trim()
          const sigMatch = opensslText.match(/Signature Algorithm:\s*([^\n]+)/i)
          if (sigMatch) sigAlgorithm = sigMatch[1].trim()
          const nbMatch = opensslText.match(/Not Before:\s*([^\n]+)/i)
          if (nbMatch) notBefore = nbMatch[1].trim()
          const naMatch = opensslText.match(/Not After\s*:\s*([^\n]+)/i)
          if (naMatch) notAfter = naMatch[1].trim()
        }
      } catch {}
    }

    if (fs.existsSync(keyPath)) {
      try {
        privkey = fs.readFileSync(keyPath, 'utf8')
      } catch (e) {
        privkey = `读取私钥文件失败: ${e.message}`
      }
    }

    res.json({
      ...cert,
      cert_dir: certDir,
      cert_path: certPath,
      key_path: keyPath,
      fullchain,
      privkey,
      serial_number: serialNumber,
      sig_algorithm: sigAlgorithm,
      not_before: notBefore,
      not_after: notAfter,
      openssl_text: opensslText
    })
    return true
  }

  // 4. Renew Certificate
  const renewMatch = pathname.match(/^\/api\/v1\/ssl\/certs\/(\d+)\/renew$/)
  if (renewMatch && req.method === 'POST') {
    const id = parseInt(renewMatch[1], 10)
    const cert = ctx.sslCerts.find(c => c.id === id)
    if (!cert) {
      res.json(null, '证书不存在', 404)
      return true
    }
    const certDir = path.join(ctx.SSL_DIR, cert.domain)
    const keyPath = path.join(certDir, 'privkey.pem')
    const certPath = path.join(certDir, 'fullchain.pem')

    if (cert.issuer.includes('Self-Signed') || cert.issuer.includes('自签名')) {
      // Re-sign self-signed
      try {
        spawnSync('openssl', [
          'req', '-x509', '-nodes', '-days', '90', '-newkey', 'rsa:2048',
          '-keyout', keyPath, '-out', certPath,
          '-subj', `/CN=${cert.domain}`
        ], { encoding: 'utf-8' })
      } catch (e) {
        res.json(null, `自签名证书续期失败: ${e.message}`, 500)
        return true
      }
    } else {
      // Real Certbot renewal
      const renewRes = spawnSync('certbot', [
        'renew',
        '--cert-name', cert.domain,
        '--webroot',
        '-w', '/var/www/html',
        '--force-renewal',
        '--non-interactive'
      ], { encoding: 'utf-8', timeout: 60000 })

      if (renewRes.status !== 0) {
        res.json(null, `Certbot 续签失败: ${renewRes.stderr || renewRes.stdout}`, 400)
        return true
      }

      const leLiveDir = path.join('/etc/letsencrypt/live', cert.domain)
      if (fs.existsSync(path.join(leLiveDir, 'fullchain.pem'))) {
        fs.copyFileSync(path.join(leLiveDir, 'fullchain.pem'), certPath)
        fs.copyFileSync(path.join(leLiveDir, 'privkey.pem'), keyPath)
      }
    }

    const parsed = parseCertMetadata(certPath)
    if (parsed) {
      cert.issuer = parsed.issuer
      cert.expires_at = parsed.expires_at
      cert.days_remaining = parsed.days_remaining
    }
    ctx.saveJSON(ctx.CERTS_FILE, ctx.sslCerts)
    try { execSync('systemctl reload nginx 2>/dev/null || true') } catch {}
    ctx.logOperation('admin', '续期 SSL 证书', cert.domain)
    res.json({ success: true, new_expires_at: cert.expires_at, days_remaining: cert.days_remaining }, '证书续签成功')
    return true
  }

  // 5. Deploy Certificate to Site
  const deployMatch = pathname.match(/^\/api\/v1\/ssl\/certs\/(\d+)\/deploy$/)
  if (deployMatch && req.method === 'POST') {
    const id = parseInt(deployMatch[1], 10)
    const body = await ctx.parseBody(req, res)
    const cert = ctx.sslCerts.find(c => c.id === id)
    if (!cert) {
      res.json(null, '证书不存在', 404)
      return true
    }
    const siteId = parseInt(body.site_id, 10)
    const site = ctx.sites.find(s => s.id === siteId)
    if (!site) {
      res.json(null, '目标部署站点不存在', 404)
      return true
    }

    const certDir = path.join(ctx.SSL_DIR, cert.domain)
    const siteCertDir = path.join(ctx.SSL_DIR, site.domain)
    fs.mkdirSync(siteCertDir, { recursive: true })
    if (fs.existsSync(path.join(certDir, 'fullchain.pem'))) {
      fs.copyFileSync(path.join(certDir, 'fullchain.pem'), path.join(siteCertDir, 'fullchain.pem'))
    }
    if (fs.existsSync(path.join(certDir, 'privkey.pem'))) {
      fs.copyFileSync(path.join(certDir, 'privkey.pem'), path.join(siteCertDir, 'privkey.pem'))
    }

    site.ssl_enabled = true
    site.ssl_cert_path = path.join(siteCertDir, 'fullchain.pem')
    site.ssl_key_path = path.join(siteCertDir, 'privkey.pem')
    const confContent = renderNginxSiteConf(site, ctx)
    fs.writeFileSync(path.join(ctx.NGINX_CONF_DIR, `${site.domain}.conf`), confContent, 'utf8')
    try { execSync('systemctl reload nginx 2>/dev/null || true') } catch {}

    cert.is_deployed = true
    if (!cert.deployed_sites.includes(site.domain)) {
      cert.deployed_sites.push(site.domain)
    }
    ctx.saveJSON(ctx.SITES_FILE, ctx.sites)
    ctx.saveJSON(ctx.CERTS_FILE, ctx.sslCerts)
    ctx.logOperation('admin', '部署 SSL 证书到站点', `${cert.domain} -> ${site.domain}`)
    res.json(null, `证书已成功部署至站点 [${site.domain}] 并生效！`)
    return true
  }

  // 6. Delete Certificate
  const deleteCertMatch = pathname.match(/^\/api\/v1\/ssl\/certs\/(\d+)$/)
  if (deleteCertMatch && req.method === 'DELETE') {
    const id = parseInt(deleteCertMatch[1], 10)
    const idx = ctx.sslCerts.findIndex(c => c.id === id)
    if (idx === -1) {
      res.json(null, '证书不存在', 404)
      return true
    }
    const cert = ctx.sslCerts[idx]
    const certDir = path.join(ctx.SSL_DIR, cert.domain)
    if (fs.existsSync(certDir)) {
      try { fs.rmSync(certDir, { recursive: true, force: true }) } catch {}
    }
    ctx.sslCerts.splice(idx, 1)
    ctx.saveJSON(ctx.CERTS_FILE, ctx.sslCerts)
    ctx.logOperation('admin', '删除 SSL 证书', cert.domain)
    res.json(null, `证书 [${cert.domain}] 已成功删除`)
    return true
  }

  return false
}
