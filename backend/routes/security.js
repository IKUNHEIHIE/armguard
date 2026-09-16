import fs from 'fs'
import net from 'net'
import { spawnSync, execSync } from 'child_process'

function isValidIpOrCidr(ipStr) {
  if (!ipStr || typeof ipStr !== 'string') return false
  const trimmed = ipStr.trim()
  if (net.isIP(trimmed)) return true
  if (trimmed.includes('/')) {
    const [ip, mask] = trimmed.split('/')
    const maskNum = Number(mask)
    if (net.isIPv4(ip) && Number.isInteger(maskNum) && maskNum >= 0 && maskNum <= 32) return true
    if (net.isIPv6(ip) && Number.isInteger(maskNum) && maskNum >= 0 && maskNum <= 128) return true
  }
  return false
}

export async function handleSecurity(pathname, req, res, url, ctx) {
  if (!pathname.startsWith('/api/v1/firewall/')) return false

  // Firewall Rules GET / POST / PUT
  if (pathname === '/api/v1/firewall/rules') {
    if (req.method === 'GET') {
      try {
        const sOut = execSync('iptables -S INPUT 2>/dev/null || true').toString()
        const lines = sOut.split('\n').filter(Boolean)
        let defaultPolicy = 'ACCEPT'
        const rules = []

        lines.forEach((line, idx) => {
          if (line.startsWith('-P INPUT')) {
            defaultPolicy = line.split(/\s+/)[2] || 'ACCEPT'
            return
          }
          if (!line.startsWith('-A INPUT')) return

          // Protocol
          let proto = 'ALL'
          const protoMatch = line.match(/-p\s+([a-zA-Z0-9]+)/)
          if (protoMatch) {
            const p = protoMatch[1].toLowerCase()
            proto = p === '6' ? 'TCP' : p === '17' ? 'UDP' : p === '1' ? 'ICMP' : p.toUpperCase()
          }

          // Port
          let port = '全部端口'
          const portMatch = line.match(/--dport\s+([0-9:]+)/)
          if (portMatch) {
            port = portMatch[1].replace(':', '-')
          }

          // Source IP
          let sourceIp = '0.0.0.0/0'
          const srcMatch = line.match(/-s\s+([^\s]+)/)
          if (srcMatch) sourceIp = srcMatch[1]

          // Action
          let action = 'accept'
          const actMatch = line.match(/-j\s+([a-zA-Z]+)/)
          if (actMatch) action = actMatch[1].toLowerCase()

          // Comment / Description
          let description = '系统防火墙策略'
          const commentMatch = line.match(/--comment\s+"([^"]+)"/) || line.match(/--comment\s+([^\s]+)/)
          if (commentMatch) {
            description = commentMatch[1]
          } else if (port === '8888') {
            description = 'ArmGuard 控制面板端口'
          } else if (port === '22') {
            description = 'SSH 远程登录'
          } else if (port === '80' || port === '443') {
            description = 'Web 基础通信'
          }

          const rawSpec = line.replace(/^-A INPUT\s+/, '')

          rules.push({
            id: idx + 1,
            protocol: proto,
            port: port,
            source_ip: sourceIp,
            action: action,
            description: description,
            raw_spec: rawSpec,
            created_at: '生效中'
          })
        })

        let pingBanned = false
        try {
          const v = fs.readFileSync('/proc/sys/net/ipv4/icmp_echo_ignore_all', 'utf8').trim()
          pingBanned = v === '1'
        } catch {}

        res.json({
          rules,
          firewall_type: 'iptables/ip6tables 双栈',
          status: 'active',
          default_policy: defaultPolicy,
          ping_banned: pingBanned
        })
        return true
      } catch (err) {
        res.json({ rules: [], firewall_type: 'iptables', status: 'active', default_policy: 'ACCEPT', ping_banned: false })
        return true
      }
    }

    if (req.method === 'POST') {
      const body = await ctx.parseBody(req, res)
      const type = body.type || 'port' // 'port' or 'ip_block'
      const action = (body.action || (type === 'ip_block' ? 'drop' : 'accept')).toUpperCase()
      const desc = String(body.description || (type === 'ip_block' ? '恶意 IP 拦截' : '自定义放行')).replace(/["'\r\n]/g, '')

      if (type === 'ip_block') {
        const srcIp = String(body.source_ip || '').trim()
        if (!srcIp || !isValidIpOrCidr(srcIp)) {
          res.json(null, '请提供有效的来源 IP 或 CIDR 地址', 400)
          return true
        }
        try {
          if (srcIp.includes(':')) {
            spawnSync('ip6tables', ['-I', 'INPUT', '1', '-s', srcIp, '-m', 'comment', '--comment', desc, '-j', 'DROP'])
          } else {
            spawnSync('iptables', ['-I', 'INPUT', '1', '-s', srcIp, '-m', 'comment', '--comment', desc, '-j', 'DROP'])
          }
          ctx.logOperation('admin', '添加防火墙 IP 拦截黑名单', srcIp)
          res.json(null, `IP [${srcIp}] 已成功加入黑名单拦截！`)
          return true
        } catch (e) {
          res.json(null, `添加黑名单失败: ${e.message}`, 500)
          return true
        }
      }

      // Port Rule
      let proto = String(body.protocol || 'tcp').toLowerCase()
      if (!['tcp', 'udp', 'tcp/udp'].includes(proto)) proto = 'tcp'
      const rawPort = String(body.port || '').trim().replace('-', ':')
      const srcIp = String(body.source_ip || '0.0.0.0/0').trim()

      if (!/^\d+(:?\d+)?$/.test(rawPort)) {
        res.json(null, '端口格式不正确，支持单个端口(如 8080)或范围(如 3000:4000)', 400)
        return true
      }
      if (srcIp && srcIp !== '0.0.0.0/0' && !isValidIpOrCidr(srcIp)) {
        res.json(null, '来源 IP 格式不正确', 400)
        return true
      }

      try {
        const protocols = proto === 'tcp/udp' ? ['tcp', 'udp'] : [proto]
        for (const p of protocols) {
          if (!srcIp.includes(':')) {
            const iptArgs = ['-I', 'INPUT', '1', '-p', p]
            if (srcIp && srcIp !== '0.0.0.0/0') iptArgs.push('-s', srcIp)
            iptArgs.push('--dport', rawPort, '-m', 'comment', '--comment', desc, '-j', action)
            spawnSync('iptables', iptArgs)
          }

          if (srcIp === '0.0.0.0/0' || srcIp.includes(':')) {
            const ip6Args = ['-I', 'INPUT', '1', '-p', p]
            if (srcIp && srcIp !== '0.0.0.0/0') ip6Args.push('-s', srcIp)
            ip6Args.push('--dport', rawPort, '-m', 'comment', '--comment', desc, '-j', action)
            spawnSync('ip6tables', ip6Args)
          }
        }

        ctx.logOperation('admin', '添加防火墙放行规则', `${proto.toUpperCase()}:${rawPort}`)
        res.json(null, '防火墙规则已成功注入内核并生效！')
        return true
      } catch (e) {
        res.json(null, `规则写入失败: ${e.message}`, 500)
        return true
      }
    }

    if (req.method === 'PUT') {
      const body = await ctx.parseBody(req, res)
      const oldRawSpec = body.old_raw_spec
      const type = body.type || 'port'
      const action = (body.action || (type === 'ip_block' ? 'drop' : 'accept')).toUpperCase()
      const desc = String(body.description || (type === 'ip_block' ? '恶意 IP 拦截' : '自定义放行')).replace(/["'\r\n]/g, '')

      // 1. Delete old rule if raw_spec is provided
      if (oldRawSpec) {
        try {
          const safeTokens = String(oldRawSpec).trim().split(/\s+/).filter(t => /^[a-zA-Z0-9_.:\/-]+$/.test(t))
          if (safeTokens.length > 0) {
            spawnSync('iptables', ['-D', 'INPUT', ...safeTokens])
            spawnSync('ip6tables', ['-D', 'INPUT', ...safeTokens])
          }
        } catch {}
      }

      // 2. Insert new rule
      if (type === 'ip_block') {
        const srcIp = String(body.source_ip || '').trim()
        if (!srcIp || !isValidIpOrCidr(srcIp)) {
          res.json(null, '请提供有效的来源 IP 或 CIDR 地址', 400)
          return true
        }
        try {
          if (srcIp.includes(':')) {
            spawnSync('ip6tables', ['-I', 'INPUT', '1', '-s', srcIp, '-m', 'comment', '--comment', desc, '-j', 'DROP'])
          } else {
            spawnSync('iptables', ['-I', 'INPUT', '1', '-s', srcIp, '-m', 'comment', '--comment', desc, '-j', 'DROP'])
          }
          ctx.logOperation('admin', '修改防火墙规则(黑名单)', srcIp)
          res.json(null, `规则修改成功！IP [${srcIp}] 拦截已生效`)
          return true
        } catch (e) {
          res.json(null, `修改失败: ${e.message}`, 500)
          return true
        }
      }

      // Port Rule
      let proto = String(body.protocol || 'tcp').toLowerCase()
      if (!['tcp', 'udp', 'tcp/udp'].includes(proto)) proto = 'tcp'
      const rawPort = String(body.port || '').trim().replace('-', ':')
      const srcIp = String(body.source_ip || '0.0.0.0/0').trim()

      if (!/^\d+(:?\d+)?$/.test(rawPort)) {
        res.json(null, '端口格式不正确，支持单个端口(如 8080)或范围(如 3000:4000)', 400)
        return true
      }
      if (srcIp && srcIp !== '0.0.0.0/0' && !isValidIpOrCidr(srcIp)) {
        res.json(null, '来源 IP 格式不正确', 400)
        return true
      }

      try {
        const protocols = proto === 'tcp/udp' ? ['tcp', 'udp'] : [proto]
        for (const p of protocols) {
          if (!srcIp.includes(':')) {
            const iptArgs = ['-I', 'INPUT', '1', '-p', p]
            if (srcIp && srcIp !== '0.0.0.0/0') iptArgs.push('-s', srcIp)
            iptArgs.push('--dport', rawPort, '-m', 'comment', '--comment', desc, '-j', action)
            spawnSync('iptables', iptArgs)
          }

          if (srcIp === '0.0.0.0/0' || srcIp.includes(':')) {
            const ip6Args = ['-I', 'INPUT', '1', '-p', p]
            if (srcIp && srcIp !== '0.0.0.0/0') ip6Args.push('-s', srcIp)
            ip6Args.push('--dport', rawPort, '-m', 'comment', '--comment', desc, '-j', action)
            spawnSync('ip6tables', ip6Args)
          }
        }

        ctx.logOperation('admin', '修改防火墙规则', `${proto.toUpperCase()}:${rawPort}`)
        res.json(null, '防火墙规则修改已成功注入内核生效！')
        return true
      } catch (e) {
        res.json(null, `修改失败: ${e.message}`, 500)
        return true
      }
    }
  }

  // Delete Rule
  const delRuleMatch = pathname.match(/^\/api\/v1\/firewall\/rules\/([^\/]+)$/)
  if (delRuleMatch && req.method === 'DELETE') {
    const id = delRuleMatch[1]
    const body = await ctx.parseBody(req, res).catch(() => ({}))
    try {
      if (body && body.raw_spec) {
        const safeTokens = String(body.raw_spec).trim().split(/\s+/).filter(t => /^[a-zA-Z0-9_.:\/-]+$/.test(t))
        if (safeTokens.length > 0) {
          spawnSync('iptables', ['-D', 'INPUT', ...safeTokens])
          spawnSync('ip6tables', ['-D', 'INPUT', ...safeTokens])
        }
      } else if (/^\d+$/.test(id)) {
        spawnSync('iptables', ['-D', 'INPUT', id])
        spawnSync('ip6tables', ['-D', 'INPUT', id])
      }
      ctx.logOperation('admin', '删除防火墙规则', `Rule #${id}`)
      res.json(null, '防火墙规则已成功删除')
      return true
    } catch (e) {
      res.json(null, e.message, 500)
      return true
    }
  }

  // ICMP / Ping
  if (pathname === '/api/v1/firewall/icmp') {
    if (req.method === 'GET') {
      let pingBanned = false
      try {
        const v = fs.readFileSync('/proc/sys/net/ipv4/icmp_echo_ignore_all', 'utf8').trim()
        pingBanned = v === '1'
      } catch {}
      res.json({ ping_banned: pingBanned })
      return true
    }

    if (req.method === 'POST') {
      const body = await ctx.parseBody(req, res)
      const ban = Boolean(body.ban)
      const val = ban ? '1' : '0'
      try {
        execSync(`sysctl -w net.ipv4.icmp_echo_ignore_all=${val}`)
        const sysctlConf = '/etc/sysctl.d/99-armguard-security.conf'
        fs.writeFileSync(sysctlConf, `# ArmGuard Security Policy\nnet.ipv4.icmp_echo_ignore_all = ${val}\n`, 'utf8')
        ctx.logOperation('admin', ban ? '开启禁 Ping 隐身保护' : '允许 ICMP Ping 探测', '系统安全')
        res.json(null, ban ? '已开启禁 Ping，服务器对全网 ICMP 探测隐身' : '已恢复 ICMP Ping 响应')
      } catch (e) {
        res.json(null, `操作失败: ${e.message}`, 500)
      }
      return true
    }
  }

  // SSH Management & Hardening
  if (pathname === '/api/v1/firewall/ssh') {
    if (req.method === 'GET') {
      let port = 22
      let allowPassword = true
      let allowRoot = true
      let allowPubkey = true
      let isRunning = false

      try {
        const act = execSync('systemctl is-active ssh.socket 2>/dev/null || systemctl is-active ssh 2>/dev/null || systemctl is-active sshd 2>/dev/null || true').toString().trim()
        isRunning = act === 'active'
      } catch {}

      try {
        const sshdOut = execSync('sshd -T 2>/dev/null || true').toString()
        const pM = sshdOut.match(/^port\s+(\d+)/m)
        if (pM) port = parseInt(pM[1], 10)
        const passM = sshdOut.match(/^passwordauthentication\s+(yes|no)/m)
        if (passM) allowPassword = passM[1] === 'yes'
        const rootM = sshdOut.match(/^permitrootlogin\s+(yes|no|prohibit-password|without-password)/m)
        if (rootM) allowRoot = rootM[1] === 'yes' || rootM[1] === 'prohibit-password'
        const pubM = sshdOut.match(/^pubkeyauthentication\s+(yes|no)/m)
        if (pubM) allowPubkey = pubM[1] === 'yes'
      } catch {}

      res.json({
        port,
        status: isRunning ? 'running' : 'stopped',
        allow_password_auth: allowPassword,
        allow_root_login: allowRoot,
        allow_pubkey_auth: allowPubkey
      })
      return true
    }

    if (req.method === 'PUT') {
      const body = await ctx.parseBody(req, res)
      const newPort = parseInt(body.port, 10)
      if (!newPort || newPort < 1 || newPort > 65535) {
        res.json(null, 'SSH 端口号必须在 1-65535 之间', 400)
        return true
      }

      const allowPassword = body.allow_password_auth !== false
      const allowRoot = body.allow_root_login !== false
      const allowPubkey = body.allow_pubkey_auth !== false

      // Prevent lockout: Ensure new port is allowed in firewall first!
      try {
        execSync(`iptables -I INPUT 1 -p tcp --dport ${newPort} -m comment --comment "SSH Service" -j ACCEPT 2>/dev/null || true`)
        execSync(`ip6tables -I INPUT 1 -p tcp --dport ${newPort} -m comment --comment "SSH Service" -j ACCEPT 2>/dev/null || true`)
      } catch {}

      const sshConfPath = '/etc/ssh/sshd_config.d/00-armguard-ssh.conf'
      const backupConf = fs.existsSync(sshConfPath) ? fs.readFileSync(sshConfPath, 'utf8') : null

      const newConfContent = `# ArmGuard Managed SSH Settings\nPort ${newPort}\nPermitRootLogin ${allowRoot ? 'yes' : 'no'}\nPasswordAuthentication ${allowPassword ? 'yes' : 'no'}\nPubkeyAuthentication ${allowPubkey ? 'yes' : 'no'}\n`

      try {
        fs.writeFileSync(sshConfPath, newConfContent, 'utf8')

        // Verify sshd syntax
        const testChild = spawnSync('sshd', ['-t'], { encoding: 'utf-8' })
        if (testChild.status !== 0) {
          if (backupConf !== null) fs.writeFileSync(sshConfPath, backupConf, 'utf8')
          else fs.unlinkSync(sshConfPath)
          res.json(null, `sshd 配置语法校验失败，已自动还原: ${testChild.stderr}`, 400)
          return true
        }

        // Reload systemd and restart ssh service smoothly
        execSync('systemctl daemon-reload 2>/dev/null || true')
        execSync('systemctl restart ssh.socket 2>/dev/null || systemctl restart ssh 2>/dev/null || systemctl restart sshd 2>/dev/null || true')

        ctx.logOperation('admin', '修改 SSH 服务配置与安全加固', `端口:${newPort}, Root登录:${allowRoot}, 密码认证:${allowPassword}`)
        res.json(null, `SSH 配置已成功保存并重载生效！当前监听端口: ${newPort}`)
        return true
      } catch (err) {
        if (backupConf !== null) fs.writeFileSync(sshConfPath, backupConf, 'utf8')
        res.json(null, `修改 SSH 配置失败: ${err.message}`, 500)
        return true
      }
    }
  }

  // Fail2ban Status
  if (pathname === '/api/v1/firewall/fail2ban/status') {
    let isRunning = false
    let bannedList = []
    try {
      const child = spawnSync('fail2ban-client', ['status', 'sshd'], { encoding: 'utf-8' })
      if (child.status === 0) {
        isRunning = true
        const match = (child.stdout || '').match(/Banned IP list:\s*(.*)/)
        if (match && match[1]) {
          bannedList = match[1].trim().split(/\s+/).filter(Boolean).map(ip => ({
            jail: 'sshd',
            ip: ip,
            banned_at: '暴力破解拦截',
            failures: 5
          }))
        }
      }
    } catch {
      isRunning = false
    }
    res.json({ installed: true, running: isRunning, banned_ips: bannedList })
    return true
  }

  // Fail2ban Ban
  if (pathname === '/api/v1/firewall/fail2ban/ban' && req.method === 'POST') {
    const body = await ctx.parseBody(req, res)
    const safeIp = (body.ip || '').replace(/[^0-9a-fA-F:.]/g, '')
    const jail = (body.jail || 'sshd').replace(/[^a-zA-Z0-9_-]/g, '')
    if (!safeIp) {
      res.json(null, '请输入有效的 IP 地址', 400)
      return true
    }
    try {
      execSync(`fail2ban-client set ${jail} banip ${safeIp} 2>&1`)
      ctx.logOperation('admin', 'Fail2ban 手动封禁 IP', `${safeIp} [${jail}]`)
      res.json(null, `IP [${safeIp}] 已成功加入 Fail2ban 封禁黑名单！`)
      return true
    } catch (e) {
      res.json(null, `封禁失败: ${e.message}`, 500)
      return true
    }
  }

  // Fail2ban Unban
  if (pathname === '/api/v1/firewall/fail2ban/unban' && req.method === 'POST') {
    const body = await ctx.parseBody(req, res)
    const safeIp = (body.ip || '').replace(/[^0-9a-fA-F:.]/g, '')
    const jail = (body.jail || 'sshd').replace(/[^a-zA-Z0-9_-]/g, '')
    if (safeIp) {
      spawnSync('fail2ban-client', ['set', jail, 'unbanip', safeIp])
      ctx.logOperation('admin', 'Fail2ban 解封 IP', safeIp)
      res.json(null, 'IP 已成功解封')
      return true
    }
    res.json(null, '无效的 IP', 400)
    return true
  }

  // UFW Status
  if (pathname === '/api/v1/firewall/ufw/status' && req.method === 'GET') {
    const installed = fs.existsSync('/usr/sbin/ufw')
    let status = 'inactive'
    let defaultIncoming = 'deny'
    let defaultOutgoing = 'allow'
    let ipv6Enabled = false
    let rawOutput = ''

    if (installed) {
      try {
        const uOut = spawnSync('ufw', ['status', 'verbose'], { encoding: 'utf-8' }).stdout || ''
        rawOutput = uOut
        if (uOut.includes('Status: active')) status = 'active'
        const inMatch = uOut.match(/Default:\s*([^\s,]+)\s*\(incoming\)/i)
        if (inMatch) defaultIncoming = inMatch[1]
        const outMatch = uOut.match(/,\s*([^\s,]+)\s*\(outgoing\)/i)
        if (outMatch) defaultOutgoing = outMatch[1]
      } catch {}

      try {
        const dConf = fs.readFileSync('/etc/default/ufw', 'utf8')
        ipv6Enabled = /IPV6\s*=\s*yes/i.test(dConf)
      } catch {}
    }

    res.json({
      installed,
      status, // 'active' or 'inactive'
      default_incoming: defaultIncoming,
      default_outgoing: defaultOutgoing,
      ipv6_enabled: ipv6Enabled,
      raw_output: rawOutput
    })
    return true
  }

  // Scan Listening Ports for Anti-Lockout Preview
  if (pathname === '/api/v1/firewall/scan-ports' && req.method === 'GET') {
    let sshPort = 22
    try {
      const sshdOut = execSync('sshd -T 2>/dev/null || true').toString()
      const pM = sshdOut.match(/^port\s+(\d+)/m)
      if (pM) sshPort = parseInt(pM[1], 10)
    } catch {}

    const panelPort = parseInt(process.env.PORT || '8888', 10)
    const portsMap = new Map()

    // Mandatory SSH & Panel ports
    portsMap.set(`${sshPort}/tcp`, {
      port: sshPort,
      protocol: 'tcp',
      name: `SSH 远程登录 (当前会话通道)`,
      critical: true,
      selected: true
    })
    portsMap.set(`${panelPort}/tcp`, {
      port: panelPort,
      protocol: 'tcp',
      name: `ArmGuard 控制面板`,
      critical: true,
      selected: true
    })

    try {
      const ssOut = execSync('ss -tulpn 2>/dev/null || true').toString()
      const lines = ssOut.split('\n').filter(l => l.includes('LISTEN'))
      for (const line of lines) {
        const parts = line.trim().split(/\s+/)
        if (parts.length < 5) continue
        const proto = parts[0].toLowerCase().includes('udp') ? 'udp' : 'tcp'
        const localAddr = parts[4]

        // Skip loopback only
        if (localAddr.startsWith('127.0.0.') || localAddr.startsWith('[::1]')) continue

        const lastColon = localAddr.lastIndexOf(':')
        if (lastColon === -1) continue
        const pNum = parseInt(localAddr.slice(lastColon + 1), 10)
        if (!pNum || pNum < 1 || pNum > 65535) continue

        const key = `${pNum}/${proto}`
        if (!portsMap.has(key)) {
          let desc = '活跃业务监听端口'
          let critical = false
          if (pNum === 80) desc = 'HTTP 基础 Web 通信 (Nginx)'
          else if (pNum === 443) desc = 'HTTPS 加密 Web 通信 (Nginx)'
          else if (pNum === 2096 || pNum === 61000 || pNum === 48269) desc = 'X-UI / 代理服务端口'

          portsMap.set(key, {
            port: pNum,
            protocol: proto,
            name: desc,
            critical,
            selected: true
          })
        }
      }
    } catch {}

    const scannedList = Array.from(portsMap.values()).sort((a, b) => {
      if (a.critical && !b.critical) return -1
      if (!a.critical && b.critical) return 1
      return a.port - b.port
    })

    res.json({
      ssh_port: sshPort,
      panel_port: panelPort,
      ports: scannedList
    })
    return true
  }

  // Enable UFW with Anti-Lockout Pipeline
  if (pathname === '/api/v1/firewall/ufw/enable' && req.method === 'POST') {
    if (!fs.existsSync('/usr/sbin/ufw')) {
      res.json(null, '系统未安装 UFW 防火墙软件包', 400)
      return true
    }

    const body = await ctx.parseBody(req, res).catch(() => ({}))
    const extraPorts = Array.isArray(body.ports) ? body.ports : []

    // 1. Mandatory ports that MUST NEVER BE OMITTED
    let sshPort = 22
    try {
      const sshdOut = execSync('sshd -T 2>/dev/null || true').toString()
      const pM = sshdOut.match(/^port\s+(\d+)/m)
      if (pM) sshPort = parseInt(pM[1], 10)
    } catch {}
    const panelPort = parseInt(process.env.PORT || '8888', 10)

    const portsToAllow = new Set()
    portsToAllow.add(`${sshPort}/tcp`)
    portsToAllow.add(`${panelPort}/tcp`)

    for (const p of extraPorts) {
      if (typeof p === 'number' || (typeof p === 'string' && /^\d+$/.test(p))) {
        portsToAllow.add(`${p}/tcp`)
      } else if (typeof p === 'string' && /^\d+\/(tcp|udp)$/i.test(p)) {
        portsToAllow.add(p.toLowerCase())
      }
    }

    try {
      // Step A: Ensure IPV6 is enabled in /etc/default/ufw
      try {
        const ufwConfPath = '/etc/default/ufw'
        if (fs.existsSync(ufwConfPath)) {
          let conf = fs.readFileSync(ufwConfPath, 'utf8')
          if (/IPV6\s*=\s*no/i.test(conf)) {
            conf = conf.replace(/IPV6\s*=\s*no/gi, 'IPV6=yes')
            fs.writeFileSync(ufwConfPath, conf, 'utf8')
          }
        }
      } catch (e) {
        console.warn('Failed to verify IPV6 in /etc/default/ufw:', e.message)
      }

      // Step B: Inject allow rules BEFORE ufw enable
      for (const item of portsToAllow) {
        const [portStr, protoStr] = item.split('/')
        spawnSync('ufw', ['allow', `${portStr}/${protoStr || 'tcp'}`], { encoding: 'utf-8' })
      }

      // Step C: Guarantee connection tracking in iptables/ip6tables so current SSH session stays alive
      try {
        spawnSync('iptables', ['-I', 'INPUT', '1', '-m', 'conntrack', '--ctstate', 'RELATED,ESTABLISHED', '-j', 'ACCEPT'])
        spawnSync('ip6tables', ['-I', 'INPUT', '1', '-m', 'conntrack', '--ctstate', 'RELATED,ESTABLISHED', '-j', 'ACCEPT'])
      } catch {}

      // Step D: Enable UFW in non-interactive force mode
      const enRes = spawnSync('ufw', ['--force', 'enable'], { encoding: 'utf-8' })
      if (enRes.status !== 0) {
        res.json(null, `UFW 启动失败: ${enRes.stderr || enRes.stdout}`, 500)
        return true
      }

      ctx.logOperation('admin', '开启 UFW 防火墙 (防失联保护模式)', `已预先放行端口: ${Array.from(portsToAllow).join(', ')}`)
      res.json({
        status: 'active',
        allowed_ports: Array.from(portsToAllow)
      }, `UFW 防火墙已成功开启！系统已强制预先放行所有关键端口 (${Array.from(portsToAllow).join(', ')})，SSH 与面板通信安全正常。`)
      return true
    } catch (err) {
      res.json(null, `操作失败: ${err.message}`, 500)
      return true
    }
  }

  // Disable UFW
  if (pathname === '/api/v1/firewall/ufw/disable' && req.method === 'POST') {
    if (!fs.existsSync('/usr/sbin/ufw')) {
      res.json(null, '系统未安装 UFW 防火墙', 400)
      return true
    }
    try {
      const disRes = spawnSync('ufw', ['disable'], { encoding: 'utf-8' })
      ctx.logOperation('admin', '关闭 UFW 防火墙', '恢复默认开放模式')
      res.json({ status: 'inactive' }, 'UFW 防火墙已安全停用，底层网络连接已转为开放直通模式。')
      return true
    } catch (e) {
      res.json(null, `停用 UFW 失败: ${e.message}`, 500)
      return true
    }
  }

  return false
}
