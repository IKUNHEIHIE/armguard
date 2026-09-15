import fs from 'fs'
import path from 'path'
import { spawn, spawnSync, execSync } from 'child_process'
import {
  warpConfig,
  getWarpSystemHealth,
  getRealWarpTrace,
  connectWarpReal,
  disconnectWarpReal
} from './warp.js'

// Async App Installation Task Storage
export const appInstallTasks = new Map()

// Software Market Catalog with live detection
export const marketApps = [
  {
    key: 'nginx',
    name: 'Nginx / OpenResty',
    category: 'webserver',
    description: '高性能 HTTP 和反向代理 Web 服务器，针对 aarch64 内联汇编指令优化',
    icon: '🌐',
    pkg: 'nginx',
    bin: 'nginx',
    versions: ['1.26.1 (Stable)', '1.24.0'],
    arch_support: ['arm64', 'armv7', 'x86_64'],
    has_prebuilt: true
  },
  {
    key: 'php',
    name: 'PHP 多版本运行池',
    category: 'runtime',
    description: '支持 PHP 7.4 / 8.1 / 8.2 / 8.3 共存，自带常用扩展与 OPCache 优化',
    icon: '🐘',
    pkg: 'php-fpm',
    bin: 'php',
    versions: ['PHP 8.3', 'PHP 8.2 (推荐)', 'PHP 8.1'],
    arch_support: ['arm64', 'armv7', 'x86_64'],
    has_prebuilt: true
  },
  {
    key: 'mysql',
    name: 'MySQL / MariaDB',
    category: 'database',
    description: '关系型数据库。在低内存树莓派建议使用 MariaDB，云服务器建议 MySQL 8.0',
    icon: '🐬',
    pkg: 'mariadb-server',
    bin: 'mariadb',
    versions: ['MariaDB 10.11 (LTS)', 'MySQL 8.0'],
    arch_support: ['arm64', 'armv7', 'x86_64'],
    has_prebuilt: true
  },
  {
    key: 'redis',
    name: 'Redis 内存数据库',
    category: 'cache',
    description: '极速键值对缓存与消息队列服务，单二进制低开销',
    icon: '⚡',
    pkg: 'redis-server',
    bin: 'redis-server',
    versions: ['7.2.5', '7.0.15'],
    arch_support: ['arm64', 'armv7', 'x86_64'],
    has_prebuilt: true
  },
  {
    key: 'docker',
    name: 'Docker 容器引擎',
    category: 'tools',
    description: '容器虚拟化平台。ArmGuard 专属提供多架构镜像 manifest 校验，避免拉取到 x86 镜像',
    icon: '🐳',
    pkg: 'docker.io',
    bin: 'docker',
    versions: ['26.1.4', '24.0.9'],
    arch_support: ['arm64', 'armv7', 'x86_64'],
    has_prebuilt: true
  },
  {
    key: 'nodejs',
    name: 'Node.js 运行时',
    category: 'runtime',
    description: 'JavaScript 运行时环境，支持 npm / pnpm / yarn',
    icon: '🟢',
    pkg: 'nodejs',
    bin: 'node',
    versions: ['v22.x (LTS)', 'v20.x (LTS)', 'v18.x'],
    arch_support: ['arm64', 'armv7', 'x86_64'],
    has_prebuilt: true
  },
  {
    key: 'fail2ban',
    name: 'Fail2ban 防爆破审计',
    category: 'tools',
    description: '自动分析 SSH / Nginx 失败日志并自动通过 iptables 封禁恶意暴力破解 IP',
    icon: '🛡️',
    pkg: 'fail2ban',
    bin: 'fail2ban-client',
    versions: ['1.0.2'],
    arch_support: ['arm64', 'armv7', 'x86_64'],
    has_prebuilt: true
  },
  {
    key: 'sqlite3',
    name: 'SQLite 3 嵌入式数据库',
    category: 'database',
    description: '无需独立进程的轻量级零配置嵌入式 SQL 数据库',
    icon: '🗄️',
    pkg: 'sqlite3',
    bin: 'sqlite3',
    versions: ['3.45.1'],
    arch_support: ['arm64', 'armv7', 'x86_64'],
    has_prebuilt: true
  },
  {
    key: 'git',
    name: 'Git 版本控制',
    category: 'tools',
    description: '分布式版本控制系统，支持自动拉取与部署',
    icon: '🐙',
    pkg: 'git',
    bin: 'git',
    versions: ['2.43.0'],
    arch_support: ['arm64', 'armv7', 'x86_64'],
    has_prebuilt: true
  },
  {
    key: 'htop',
    name: 'htop 交互式进程查看器',
    category: 'tools',
    description: '高颜值跨平台终端多核心性能与内存监视器',
    icon: '📈',
    pkg: 'htop',
    bin: 'htop',
    versions: ['3.3.0'],
    arch_support: ['arm64', 'armv7', 'x86_64'],
    has_prebuilt: true
  },
  {
    key: 'warp',
    name: 'Cloudflare WARP 智能网络加速',
    category: 'tools',
    description: 'Cloudflare Anycast 智能双栈加速、纯 IPv6 出站接管与 WireGuard 内核/用户态引擎',
    icon: '⚡',
    pkg: 'wireguard-tools',
    bin: 'wg',
    versions: ['v2024.8 (LTS)'],
    arch_support: ['arm64', 'armv7', 'x86_64'],
    has_prebuilt: true
  }
]

let cachedMarketApps = null
let cachedMarketAppsTime = 0

export function invalidateMarketAppsCache() {
  cachedMarketApps = null
  cachedMarketAppsTime = 0
}

export function getMarketAppsWithStatus(force = false) {
  const now = Date.now()
  if (!force && cachedMarketApps && (now - cachedMarketAppsTime < 30000)) {
    return cachedMarketApps
  }
  const result = marketApps.map(app => {
    let isInstalled = false
    let currentVer = app.versions[0]
    let service_status = undefined

    try {
      if (app.key === 'php') {
        const knownPhpVers = ['8.4', '8.3', '8.2', '8.1', '7.4']
        const installedVers = []
        let hasActiveFpm = false
        
        for (const v of knownPhpVers) {
          if (fs.existsSync(`/usr/bin/php${v}`) || fs.existsSync(`/etc/php/${v}`)) {
            installedVers.push(v)
            try {
              const act = execSync(`systemctl is-active php${v}-fpm 2>/dev/null || true`).toString().trim()
              if (act === 'active') hasActiveFpm = true
            } catch {}
          }
        }

        if (installedVers.length > 0 || fs.existsSync('/usr/bin/php')) {
          isInstalled = true
          service_status = hasActiveFpm ? 'running' : 'stopped'
          
          let defaultVer = ''
          try {
            const altOut = execSync('update-alternatives --query php 2>/dev/null || true').toString()
            const m = altOut.match(/Value:\s*\/usr\/bin\/php([0-9.]+)/)
            if (m) defaultVer = m[1]
          } catch {}
          if (!defaultVer && installedVers.length > 0) defaultVer = installedVers[0]
          
          currentVer = defaultVer ? `PHP ${defaultVer} (CLI) · ${installedVers.length}个版本已装` : 'PHP 8.3'
        }
      } else if (app.key === 'nginx') {
        const binExists = fs.existsSync('/usr/sbin/nginx') || fs.existsSync('/usr/bin/nginx')
        if (binExists) {
          isInstalled = true
          try {
            const act = execSync('systemctl is-active nginx 2>/dev/null || true').toString().trim()
            service_status = act === 'active' ? 'running' : 'stopped'
          } catch {
            service_status = 'stopped'
          }
        }
      } else if (app.key === 'mysql') {
        const binExists = fs.existsSync('/usr/bin/mariadb') || fs.existsSync('/usr/bin/mysql') || fs.existsSync('/usr/sbin/mariadbd') || fs.existsSync('/usr/sbin/mysqld')
        if (binExists) {
          isInstalled = true
          try {
            let act = execSync('systemctl is-active mariadb 2>/dev/null || true').toString().trim()
            if (act !== 'active') {
              act = execSync('systemctl is-active mysql 2>/dev/null || true').toString().trim()
            }
            service_status = act === 'active' ? 'running' : 'stopped'
          } catch {
            service_status = 'stopped'
          }

          try {
            let vOut = ''
            if (fs.existsSync('/usr/bin/mariadb')) {
              vOut = execSync('mariadb --version 2>/dev/null || true').toString()
              const m = vOut.match(/Distrib\s*([0-9.]+)-MariaDB/)
              if (m) currentVer = `MariaDB ${m[1]}`
            } else if (fs.existsSync('/usr/bin/mysql')) {
              vOut = execSync('mysql --version 2>/dev/null || true').toString()
              const m = vOut.match(/Distrib\s*([0-9.]+)/)
              if (m) currentVer = `MySQL ${m[1]}`
            }
          } catch {}
        }
      } else if (app.key === 'redis') {
        const binExists = fs.existsSync('/usr/bin/redis-server')
        if (binExists) {
          isInstalled = true
          try {
            const act = execSync('systemctl is-active redis-server 2>/dev/null || true').toString().trim()
            service_status = act === 'active' ? 'running' : 'stopped'
          } catch {
            service_status = 'stopped'
          }
        }
      } else if (app.key === 'docker') {
        const binExists = fs.existsSync('/usr/bin/docker')
        if (binExists) {
          isInstalled = true
          try {
            const act = execSync('systemctl is-active docker 2>/dev/null || true').toString().trim()
            service_status = act === 'active' ? 'running' : 'stopped'
          } catch {
            service_status = 'stopped'
          }
        }
      } else if (app.key === 'fail2ban') {
        const binExists = fs.existsSync('/usr/bin/fail2ban-client')
        if (binExists) {
          isInstalled = true
          try {
            const act = execSync('systemctl is-active fail2ban 2>/dev/null || true').toString().trim()
            service_status = act === 'active' ? 'running' : 'stopped'
          } catch {
            service_status = 'stopped'
          }
        }
      } else if (app.key === 'warp') {
        const binExists = fs.existsSync('/usr/bin/wg')
        if (binExists) {
          isInstalled = true
          service_status = warpConfig.status === 'connected' ? 'running' : 'stopped'
        }
      } else {
        const child = spawnSync('which', [app.bin], { encoding: 'utf-8' })
        if (child.status === 0 && child.stdout.trim()) {
          isInstalled = true
        }
      }
    } catch {
      isInstalled = false
    }

    return {
      ...app,
      status: isInstalled ? 'installed' : 'not_installed',
      service_status,
      current_version: isInstalled ? currentVer : undefined
    }
  })
  cachedMarketApps = result
  cachedMarketAppsTime = now
  return result
}

export async function handleApps(pathname, req, res, url, ctx) {
  if (!pathname.startsWith('/api/v1/apps/')) return false

  if (pathname === '/api/v1/apps/market') {
    res.json({ list: getMarketAppsWithStatus() })
    return true
  }

  const installMatch = pathname.match(/^\/api\/v1\/apps\/([a-zA-Z0-9_-]+)\/install$/)
  if (installMatch && req.method === 'POST') {
    const appKey = installMatch[1]
    const target = marketApps.find(a => a.key === appKey)
    const pkgName = target?.pkg || appKey
    const taskId = `task_${Date.now()}`
    const task = {
      task_id: taskId,
      app_key: appKey,
      stage: 'installing',
      progress_percent: 20,
      logs: [`[armguard-pkg] 正在调用 apt-get 安装 ${target?.name || appKey}...`],
      log_tail: `正在安装 ${target?.name || appKey}...`
    }
    appInstallTasks.set(taskId, task)

    const child = spawn('apt-get', ['install', '-y', pkgName], {
      env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' },
      stdio: ['ignore', 'pipe', 'pipe']
    })

    child.stdout.on('data', (d) => {
      const text = d.toString()
      const lines = text.split('\n').filter(Boolean)
      for (const line of lines) {
        task.logs.push(line)
        task.log_tail = line
      }
      if (task.progress_percent < 90) task.progress_percent += 10
    })

    child.stderr.on('data', (d) => {
      const text = d.toString()
      const lines = text.split('\n').filter(Boolean)
      for (const line of lines) {
        task.logs.push(line)
        task.log_tail = line
      }
    })

    child.on('close', (code) => {
      if (code === 0) {
        invalidateMarketAppsCache()
        task.stage = 'done'
        task.progress_percent = 100
        task.logs.push(`✓ ${target?.name || appKey} 安装成功！`)
        task.log_tail = `✓ ${target?.name || appKey} 安装成功！`
        ctx.logOperation('admin', '安装应用软件', target?.name || appKey)
      } else {
        task.stage = 'failed'
        task.progress_percent = 100
        task.logs.push(`安装失败，退出码: ${code}`)
        task.log_tail = `安装失败，退出码: ${code}`
      }
    })

    child.on('error', (err) => {
      task.stage = 'failed'
      task.progress_percent = 100
      task.logs.push(`错误: ${err.message}`)
      task.log_tail = `错误: ${err.message}`
    })

    res.json({ task_id: taskId }, '安装任务已创建')
    return true
  }

  const uninstallMatch = pathname.match(/^\/api\/v1\/apps\/([a-zA-Z0-9_-]+)\/uninstall$/)
  if (uninstallMatch && req.method === 'POST') {
    const appKey = uninstallMatch[1]
    const target = marketApps.find(a => a.key === appKey)
    const pkgName = target?.pkg || appKey
    try {
      spawnSync('apt-get', ['remove', '-y', pkgName])
      invalidateMarketAppsCache()
      ctx.logOperation('admin', '卸载应用软件', target?.name || appKey)
      res.json(null, '应用已成功卸载')
    } catch (e) {
      res.json(null, e.message, 500)
    }
    return true
  }

  const progressMatch = pathname.match(/^\/api\/v1\/apps\/([a-zA-Z0-9_-]+)\/install-progress$/)
  if (progressMatch) {
    const taskId = url.searchParams.get('task_id')
    const task = appInstallTasks.get(taskId) || { task_id: taskId, stage: 'done', progress_percent: 100, log_tail: '已完成', logs: [] }
    res.json(task)
    return true
  }

  // Management details
  const mgmtMatch = pathname.match(/^\/api\/v1\/apps\/([a-zA-Z0-9_-]+)\/management$/)
  if (mgmtMatch) {
    const appKey = mgmtMatch[1]
    const target = marketApps.find(a => a.key === appKey)

    let serviceName = ''
    let configFilePath = ''
    let visualConfig = {}

    if (appKey === 'nginx') {
      serviceName = 'nginx'
      configFilePath = '/etc/nginx/nginx.conf'
      let conf = ''
      try { conf = fs.readFileSync(configFilePath, 'utf8') } catch {}

      let ports = []
      try {
        const ssOut = execSync('ss -tlnp 2>/dev/null || true').toString()
        if (ssOut.includes(':80 ') || ssOut.includes(':80\t')) ports.push(80)
        if (ssOut.includes(':443 ') || ssOut.includes(':443\t')) ports.push(443)
      } catch {}

      let sitesCount = 0
      try {
        if (fs.existsSync('/etc/nginx/sites-enabled')) {
          sitesCount = fs.readdirSync('/etc/nginx/sites-enabled').filter(f => !f.startsWith('.')).length
        }
      } catch {}

      visualConfig = {
        worker_processes: conf.match(/^[ \t]*worker_processes\s+([^;]+);/m)?.[1]?.trim() || 'auto',
        worker_connections: conf.match(/^[ \t]*worker_connections\s+([^;]+);/m)?.[1]?.trim() || '1024',
        client_max_body_size: conf.match(/^[ \t]*client_max_body_size\s+([^;]+);/m)?.[1]?.trim() || '50m',
        keepalive_timeout: conf.match(/^[ \t]*keepalive_timeout\s+([^;]+);/m)?.[1]?.trim() || '65',
        gzip_enabled: /^[ \t]*gzip\s+on;/m.test(conf),
        server_tokens: !/^[ \t]*server_tokens\s+off;/m.test(conf),
        ports: ports.length > 0 ? ports : [80],
        sites_count: sitesCount
      }
    } else if (appKey === 'php') {
      const knownPhpVers = ['8.4', '8.3', '8.2', '8.1', '7.4']
      
      let defaultCliVer = '8.3'
      try {
        const altOut = execSync('update-alternatives --query php 2>/dev/null || true').toString()
        const m = altOut.match(/Value:\s*\/usr\/bin\/php([0-9.]+)/)
        if (m) defaultCliVer = m[1]
      } catch {}

      let targetVer = url.searchParams.get('version') || defaultCliVer

      const phpVersionsList = []

      for (const v of knownPhpVers) {
        const binPath = `/usr/bin/php${v}`
        const isInstalled = fs.existsSync(binPath) || fs.existsSync(`/etc/php/${v}`)
        const sName = `php${v}-fpm`
        let vStatus = 'stopped'
        let vPid = 0
        let vMem = 0

        if (isInstalled) {
          try {
            const act = execSync(`systemctl is-active ${sName} 2>/dev/null || true`).toString().trim()
            if (act === 'active') {
              vStatus = 'running'
              const showOut = execSync(`systemctl show ${sName} -p MainPID,MemoryCurrent 2>/dev/null || true`).toString()
              const pidM = showOut.match(/MainPID=(\d+)/)
              const memM = showOut.match(/MemoryCurrent=(\d+)/)
              if (pidM) vPid = parseInt(pidM[1], 10)
              if (memM && memM[1] !== '[not set]') {
                vMem = Math.round(parseInt(memM[1], 10) / (1024 * 1024))
              }
            }
          } catch {}
        }

        phpVersionsList.push({
          version: v,
          name: `PHP ${v}`,
          installed: isInstalled,
          is_default: v === defaultCliVer,
          service_name: sName,
          status: vStatus,
          pid: vPid,
          memory_mb: vMem,
          socket: `/run/php/php${v}-fpm.sock`,
          config_path: `/etc/php/${v}/fpm/php.ini`
        })
      }

      const targetObj = phpVersionsList.find(item => item.version === targetVer && item.installed) 
        || phpVersionsList.find(item => item.installed) 
        || phpVersionsList[0]

      targetVer = targetObj.version
      serviceName = targetObj.service_name
      configFilePath = targetObj.config_path

      let conf = ''
      try { conf = fs.readFileSync(configFilePath, 'utf8') } catch {}
      let mods = []
      try { 
        mods = execSync(`/usr/bin/php${targetVer} -m 2>/dev/null || php -m 2>/dev/null`).toString().split('\n').filter(Boolean) 
      } catch {}

      visualConfig = {
        selected_version: targetVer,
        default_cli_version: defaultCliVer,
        php_versions: phpVersionsList,
        max_execution_time: conf.match(/max_execution_time\s*=\s*(\d+)/)?.[1] || '300',
        memory_limit: conf.match(/memory_limit\s*=\s*([0-9a-zA-Z]+)/)?.[1] || '256M',
        upload_max_filesize: conf.match(/upload_max_filesize\s*=\s*([0-9a-zA-Z]+)/)?.[1] || '50M',
        post_max_size: conf.match(/post_max_size\s*=\s*([0-9a-zA-Z]+)/)?.[1] || '50M',
        opcache_enable: conf.includes('opcache.enable=1') || conf.includes('opcache.enable = 1') || true,
        timezone: conf.match(/date\.timezone\s*=\s*([^\s\r\n;]+)/)?.[1] || 'Asia/Shanghai',
        loaded_extensions: mods.filter(m => !m.startsWith('[') && m.trim().length > 0).slice(0, 30)
      }
    } else if (appKey === 'mysql') {
      let dbType = 'mariadb'
      if (fs.existsSync('/usr/bin/mariadb') || fs.existsSync('/usr/sbin/mariadbd')) dbType = 'mariadb'
      else if (fs.existsSync('/usr/bin/mysql') || fs.existsSync('/usr/sbin/mysqld')) dbType = 'mysql'
      
      serviceName = 'mariadb'
      try {
        const actM = execSync('systemctl is-active mariadb 2>/dev/null || true').toString().trim()
        if (actM === 'active') serviceName = 'mariadb'
        else {
          const actMy = execSync('systemctl is-active mysql 2>/dev/null || true').toString().trim()
          if (actMy === 'active') serviceName = 'mysql'
          else if (fs.existsSync('/lib/systemd/system/mariadb.service')) serviceName = 'mariadb'
          else if (fs.existsSync('/lib/systemd/system/mysql.service')) serviceName = 'mysql'
        }
      } catch {}

      configFilePath = fs.existsSync('/etc/mysql/mariadb.conf.d/50-server.cnf') 
        ? '/etc/mysql/mariadb.conf.d/50-server.cnf' 
        : (fs.existsSync('/etc/mysql/mysql.conf.d/mysqld.cnf') ? '/etc/mysql/mysql.conf.d/mysqld.cnf' : '/etc/mysql/my.cnf')

      let conf = ''
      try { conf = fs.readFileSync(configFilePath, 'utf8') } catch {}

      const matchUncommented = (regex, fallback) => {
        const m = conf.match(regex)
        return m ? m[1].trim() : fallback
      }

      visualConfig = {
        engine: dbType === 'mariadb' ? 'MariaDB' : 'MySQL',
        port: matchUncommented(/^[ \t]*port\s*=\s*(\d+)/m, '3306'),
        max_connections: matchUncommented(/^[ \t]*max_connections\s*=\s*(\d+)/m, '100'),
        innodb_buffer_pool_size: matchUncommented(/^[ \t]*innodb_buffer_pool_size\s*=\s*([0-9a-zA-Z]+)/m, '128M'),
        key_buffer_size: matchUncommented(/^[ \t]*key_buffer_size\s*=\s*([0-9a-zA-Z]+)/m, '16M'),
        character_set_server: matchUncommented(/^[ \t]*character-set-server\s*=\s*([0-9a-zA-Z_]+)/m, 'utf8mb4'),
        slow_query_log: /^[ \t]*slow_query_log\s*=\s*1/m.test(conf),
        datadir: matchUncommented(/^[ \t]*datadir\s*=\s*([^\s\r\n;]+)/m, '/var/lib/mysql')
      }
    } else if (appKey === 'redis') {
      serviceName = 'redis-server'
      configFilePath = '/etc/redis/redis.conf'
      let conf = ''
      try { conf = fs.readFileSync(configFilePath, 'utf8') } catch {}
      visualConfig = {
        port: conf.match(/^port\s+(\d+)/m)?.[1] || '6379',
        requirepass: conf.match(/^requirepass\s+([^\s\r\n]+)/m)?.[1] || '',
        maxmemory: conf.match(/^maxmemory\s+([0-9a-zA-Z]+)/m)?.[1] || '128mb',
        maxmemory_policy: conf.match(/^maxmemory-policy\s+([^\s\r\n]+)/m)?.[1] || 'allkeys-lru',
        appendonly: conf.match(/^appendonly\s+(yes|no)/m)?.[1] || 'yes',
        bind: conf.match(/^bind\s+([^\r\n]+)/m)?.[1] || '127.0.0.1 ::1'
      }
    } else if (appKey === 'docker') {
      serviceName = 'docker'
      configFilePath = '/etc/docker/daemon.json'
      let confObj = {}
      try { confObj = JSON.parse(fs.readFileSync(configFilePath, 'utf8')) } catch {}
      visualConfig = {
        registry_mirrors: confObj['registry-mirrors'] || ['https://docker.m.daocloud.io', 'https://mirror.ccs.tencentyun.com'],
        data_root: confObj['data-root'] || '/var/lib/docker',
        log_max_size: confObj['log-opts']?.['max-size'] || '50m',
        log_max_file: confObj['log-opts']?.['max-file'] || '3'
      }
    } else if (appKey === 'fail2ban') {
      serviceName = 'fail2ban'
      configFilePath = fs.existsSync('/etc/fail2ban/jail.local') ? '/etc/fail2ban/jail.local' : '/etc/fail2ban/jail.conf'
      let conf = ''
      try { conf = fs.readFileSync(configFilePath, 'utf8') } catch {}
      visualConfig = {
        bantime: conf.match(/bantime\s*=\s*(\d+[a-z]?)/)?.[1] || '1h',
        findtime: conf.match(/findtime\s*=\s*(\d+[a-z]?)/)?.[1] || '10m',
        maxretry: conf.match(/maxretry\s*=\s*(\d+)/)?.[1] || '5'
      }
    } else if (appKey === 'nodejs') {
      configFilePath = path.join(process.env.HOME || '/root', '.npmrc')
      let registry = 'https://registry.npmjs.org/'
      try { registry = execSync('npm config get registry 2>/dev/null').toString().trim() } catch {}
      let nodeVer = ''
      let npmVer = ''
      try { nodeVer = execSync('node -v 2>/dev/null').toString().trim() } catch {}
      try { npmVer = execSync('npm -v 2>/dev/null').toString().trim() } catch {}
      visualConfig = {
        registry: registry,
        node_version: nodeVer,
        npm_version: npmVer,
        global_packages: ['npm', 'corepack', 'pm2 (推荐)', 'pnpm (推荐)', 'yarn', 'typescript']
      }
    } else if (appKey === 'git') {
      configFilePath = path.join(process.env.HOME || '/root', '.gitconfig')
      let userName = ''
      let userEmail = ''
      let defaultBranch = 'main'
      try { userName = execSync('git config --global user.name 2>/dev/null').toString().trim() } catch {}
      try { userEmail = execSync('git config --global user.email 2>/dev/null').toString().trim() } catch {}
      try { defaultBranch = execSync('git config --global init.defaultBranch 2>/dev/null').toString().trim() || 'main' } catch {}
      
      let sshKey = ''
      try {
        const keyPath = path.join(process.env.HOME || '/root', '.ssh/id_rsa.pub')
        const edPath = path.join(process.env.HOME || '/root', '.ssh/id_ed25519.pub')
        if (fs.existsSync(edPath)) sshKey = fs.readFileSync(edPath, 'utf8')
        else if (fs.existsSync(keyPath)) sshKey = fs.readFileSync(keyPath, 'utf8')
      } catch {}

      visualConfig = {
        user_name: userName,
        user_email: userEmail,
        default_branch: defaultBranch,
        ssh_public_key: sshKey || '暂未生成 SSH 公钥 (可一键生成)'
      }
    } else if (appKey === 'sqlite3') {
      configFilePath = '/var/lib/armguard/sqlite.conf'
      visualConfig = {
        journal_mode: 'WAL',
        synchronous: 'NORMAL',
        cache_size: '-2000 (约 2MB)',
        foreign_keys: 'ON'
      }
    } else if (appKey === 'htop') {
      configFilePath = path.join(process.env.HOME || '/root', '.config/htop/htoprc')
      visualConfig = {
        delay: '15 (1.5秒刷新)',
        show_cpu_frequency: true,
        show_cpu_temperature: true,
        detailed_cpu_time: true
      }
    } else if (appKey === 'warp') {
      serviceName = 'warp-svc'
      configFilePath = '/var/lib/armguard/warp_config.json'
      const health = getWarpSystemHealth()
      const realTrace = getRealWarpTrace()
      visualConfig = {
        ...warpConfig,
        trace: realTrace,
        system_health: health
      }
    }

    // Check service running state
    let status = 'stopped'
    let pid = 0
    let memory_mb = 0

    if (appKey === 'warp') {
      const h = getWarpSystemHealth()
      status = h.tunnel.active || warpConfig.status === 'connected' ? 'running' : 'stopped'
      pid = status === 'running' ? 2408 : 0
      memory_mb = status === 'running' ? 12 : 0
    } else if (serviceName) {
      try {
        const act = execSync(`systemctl is-active ${serviceName} 2>/dev/null || true`).toString().trim()
        status = act === 'active' ? 'running' : 'stopped'
        if (status === 'running') {
          const showOut = execSync(`systemctl show ${serviceName} -p MainPID,MemoryCurrent 2>/dev/null || true`).toString()
          const pidMatch = showOut.match(/MainPID=(\d+)/)
          const memMatch = showOut.match(/MemoryCurrent=(\d+)/)
          if (pidMatch) pid = parseInt(pidMatch[1], 10)
          if (memMatch && memMatch[1] !== '[not set]') {
            memory_mb = Math.round(parseInt(memMatch[1], 10) / (1024 * 1024))
          }
        }
      } catch {
        status = 'stopped'
      }
    } else {
      try {
        execSync(`which ${target?.bin || appKey} 2>/dev/null`)
        status = 'installed'
      } catch {
        status = 'not_installed'
      }
    }

    let rawContent = ''
    try {
      if (configFilePath && fs.existsSync(configFilePath)) {
        rawContent = fs.readFileSync(configFilePath, 'utf8')
      }
    } catch {}

    res.json({
      app_key: appKey,
      app_name: target?.name || appKey,
      service_name: serviceName,
      status,
      pid,
      memory_mb,
      config_file_path: configFilePath,
      raw_config: rawContent,
      visual_config: visualConfig
    })
    return true
  }

  // Service control (start, stop, restart, reload)
  const svcCtrlMatch = pathname.match(/^\/api\/v1\/apps\/([a-zA-Z0-9_-]+)\/service-control$/)
  if (svcCtrlMatch && req.method === 'POST') {
    const appKey = svcCtrlMatch[1]
    const body = await ctx.parseBody(req, res)
    const action = body.action || 'restart'

    if (appKey === 'warp') {
      try {
        if (action === 'start' || action === 'restart' || action === 'reload') {
          connectWarpReal(warpConfig, ctx)
        } else if (action === 'stop') {
          disconnectWarpReal(ctx)
        }
        ctx.logOperation('admin', `WARP 隧道服务控制 [${action}]`, 'Cloudflare WARP')
        invalidateMarketAppsCache()
        res.json(null, `WARP 隧道已成功${action === 'start' ? '启动连接' : action === 'stop' ? '断开' : '重启'}`)
      } catch (err) {
        res.json(null, err.message, 500)
      }
      return true
    }

    let serviceName = ''
    if (appKey === 'nginx') serviceName = 'nginx'
    else if (appKey === 'php') {
      const v = body.version || '8.3'
      serviceName = `php${v}-fpm`
    }
    else if (appKey === 'mysql') {
      const actM = execSync('systemctl is-active mariadb 2>/dev/null || true').toString().trim()
      serviceName = actM === 'active' ? 'mariadb' : (fs.existsSync('/lib/systemd/system/mysql.service') ? 'mysql' : 'mariadb')
    }
    else if (appKey === 'redis') serviceName = 'redis-server'
    else if (appKey === 'docker') serviceName = 'docker'
    else if (appKey === 'fail2ban') serviceName = 'fail2ban'

    if (!serviceName) {
      res.json(null, '该应用为独立 CLI 工具，无 systemd 常驻服务进程', 400)
      return true
    }

    if (!/^(start|stop|restart|reload)$/.test(action)) {
      res.json(null, '无效的服务操作', 400)
      return true
    }

    try {
      const child = spawnSync('systemctl', [action, serviceName], { encoding: 'utf-8' })
      if (child.status === 0) {
        invalidateMarketAppsCache()
        ctx.logOperation('admin', `服务控制 [${action}]`, serviceName)
        res.json(null, `服务 [${serviceName}] 已成功${action === 'start' ? '启动' : action === 'stop' ? '停止' : action === 'restart' ? '重启' : '重载'}`)
      } else {
        res.json(null, child.stderr || `操作服务失败`, 500)
      }
    } catch (e) {
      res.json(null, e.message, 500)
    }
    return true
  }

  // Visual config save
  const visualCfgMatch = pathname.match(/^\/api\/v1\/apps\/([a-zA-Z0-9_-]+)\/visual-config$/)
  if (visualCfgMatch && req.method === 'PUT') {
    const appKey = visualCfgMatch[1]
    const body = await ctx.parseBody(req, res)
    const cfg = body.config || {}

    try {
      if (appKey === 'nginx') {
        const confPath = '/etc/nginx/nginx.conf'
        if (fs.existsSync(confPath)) {
          const backupPath = confPath + '.bak'
          fs.copyFileSync(confPath, backupPath)
          let conf = fs.readFileSync(confPath, 'utf8')

          if (cfg.worker_processes) {
            if (/^[ \t]*worker_processes\s+[^;]+;/m.test(conf)) {
              conf = conf.replace(/^[ \t]*worker_processes\s+[^;]+;/m, `worker_processes ${cfg.worker_processes};`)
            }
          }
          if (cfg.worker_connections) {
            if (/^[ \t]*worker_connections\s+[^;]+;/m.test(conf)) {
              conf = conf.replace(/^[ \t]*worker_connections\s+[^;]+;/m, `\tworker_connections ${cfg.worker_connections};`)
            }
          }
          if (cfg.client_max_body_size) {
            if (/^[ \t]*client_max_body_size\s+[^;]+;/m.test(conf)) {
              conf = conf.replace(/^[ \t]*client_max_body_size\s+[^;]+;/m, `\tclient_max_body_size ${cfg.client_max_body_size};`)
            } else {
              conf = conf.replace(/http\s*\{/, `http {\n\tclient_max_body_size ${cfg.client_max_body_size};`)
            }
          }
          if (cfg.keepalive_timeout) {
            if (/^[ \t]*keepalive_timeout\s+[^;]+;/m.test(conf)) {
              conf = conf.replace(/^[ \t]*keepalive_timeout\s+[^;]+;/m, `\tkeepalive_timeout ${cfg.keepalive_timeout};`)
            }
          }
          if (cfg.gzip_enabled !== undefined) {
            const gzipVal = cfg.gzip_enabled ? 'on' : 'off'
            if (/^[ \t]*gzip\s+(on|off);/m.test(conf)) {
              conf = conf.replace(/^[ \t]*gzip\s+(on|off);/m, `\tgzip ${gzipVal};`)
            } else {
              conf = conf.replace(/http\s*\{/, `http {\n\tgzip ${gzipVal};`)
            }
          }
          if (cfg.server_tokens !== undefined) {
            const tokVal = cfg.server_tokens ? 'on' : 'off'
            if (/^[ \t]*server_tokens\s+(on|off);/m.test(conf)) {
              conf = conf.replace(/^[ \t]*server_tokens\s+(on|off);/m, `\tserver_tokens ${tokVal};`)
            } else {
              conf = conf.replace(/http\s*\{/, `http {\n\tserver_tokens ${tokVal};`)
            }
          }

          fs.writeFileSync(confPath, conf, 'utf8')

          const testRes = spawnSync('nginx', ['-t'], { encoding: 'utf-8' })
          if (testRes.status !== 0) {
            fs.copyFileSync(backupPath, confPath)
            res.json(null, `Nginx 语法测试未通过，已自动还原配置: ${testRes.stderr}`, 400)
            return true
          }
          execSync('systemctl reload nginx 2>/dev/null || systemctl restart nginx 2>/dev/null || true')
        }
      } else if (appKey === 'mysql') {
        let confPath = ''
        if (fs.existsSync('/etc/mysql/mariadb.conf.d/50-server.cnf')) confPath = '/etc/mysql/mariadb.conf.d/50-server.cnf'
        else if (fs.existsSync('/etc/mysql/mysql.conf.d/mysqld.cnf')) confPath = '/etc/mysql/mysql.conf.d/mysqld.cnf'
        else if (fs.existsSync('/etc/mysql/my.cnf')) confPath = '/etc/mysql/my.cnf'

        if (confPath && fs.existsSync(confPath)) {
          let conf = fs.readFileSync(confPath, 'utf8')
          const setOrAppendInMysqld = (key, val) => {
            const reg = new RegExp(`^[ \\t]*${key}\\s*=.*$`, 'm')
            if (reg.test(conf)) {
              conf = conf.replace(reg, `${key} = ${val}`)
            } else if (conf.includes('[mysqld]')) {
              conf = conf.replace('[mysqld]', `[mysqld]\n${key} = ${val}`)
            } else if (conf.includes('[server]')) {
              conf = conf.replace('[server]', `[server]\n${key} = ${val}`)
            } else {
              conf += `\n[mysqld]\n${key} = ${val}\n`
            }
          }

          if (cfg.port) setOrAppendInMysqld('port', cfg.port)
          if (cfg.max_connections) setOrAppendInMysqld('max_connections', cfg.max_connections)
          if (cfg.innodb_buffer_pool_size) setOrAppendInMysqld('innodb_buffer_pool_size', cfg.innodb_buffer_pool_size)
          if (cfg.key_buffer_size) setOrAppendInMysqld('key_buffer_size', cfg.key_buffer_size)
          if (cfg.character_set_server) setOrAppendInMysqld('character-set-server', cfg.character_set_server)
          if (cfg.slow_query_log !== undefined) {
            setOrAppendInMysqld('slow_query_log', cfg.slow_query_log ? '1' : '0')
            if (cfg.slow_query_log) {
              setOrAppendInMysqld('long_query_time', '2')
              setOrAppendInMysqld('slow_query_log_file', '/var/log/mysql/mariadb-slow.log')
            }
          }

          fs.writeFileSync(confPath, conf, 'utf8')

          let svc = 'mariadb'
          try {
            const actM = execSync('systemctl is-active mariadb 2>/dev/null || true').toString().trim()
            svc = actM === 'active' ? 'mariadb' : 'mysql'
          } catch {}
          execSync(`systemctl restart ${svc} 2>/dev/null || true`)
        }
      } else if (appKey === 'php') {
        const targetVersion = cfg.selected_version || '8.3'
        const confPath = `/etc/php/${targetVersion}/fpm/php.ini`
        if (fs.existsSync(confPath)) {
          let conf = fs.readFileSync(confPath, 'utf8')
          if (cfg.max_execution_time) conf = conf.replace(/max_execution_time\s*=\s*\d+/, `max_execution_time = ${cfg.max_execution_time}`)
          if (cfg.memory_limit) conf = conf.replace(/memory_limit\s*=\s*[0-9a-zA-Z]+/, `memory_limit = ${cfg.memory_limit}`)
          if (cfg.upload_max_filesize) conf = conf.replace(/upload_max_filesize\s*=\s*[0-9a-zA-Z]+/, `upload_max_filesize = ${cfg.upload_max_filesize}`)
          if (cfg.post_max_size) conf = conf.replace(/post_max_size\s*=\s*[0-9a-zA-Z]+/, `post_max_size = ${cfg.post_max_size}`)
          if (cfg.timezone) conf = conf.replace(/date\.timezone\s*=\s*[^\s\r\n;]+/, `date.timezone = ${cfg.timezone}`)
          fs.writeFileSync(confPath, conf, 'utf8')
          execSync(`systemctl reload php${targetVersion}-fpm 2>/dev/null || systemctl restart php${targetVersion}-fpm 2>/dev/null || true`)
        }
      } else if (appKey === 'redis') {
        const confPath = '/etc/redis/redis.conf'
        if (fs.existsSync(confPath)) {
          let conf = fs.readFileSync(confPath, 'utf8')
          if (cfg.port) conf = conf.replace(/^port\s+\d+/m, `port ${cfg.port}`)
          if (cfg.maxmemory) {
            if (conf.match(/^maxmemory\s+/m)) {
              conf = conf.replace(/^maxmemory\s+[^\r\n]+/m, `maxmemory ${cfg.maxmemory}`)
            } else {
              conf += `\nmaxmemory ${cfg.maxmemory}\n`
            }
          }
          if (cfg.requirepass) {
            if (conf.match(/^requirepass\s+/m)) {
              conf = conf.replace(/^requirepass\s+[^\r\n]+/m, `requirepass ${cfg.requirepass}`)
            } else {
              conf += `\nrequirepass ${cfg.requirepass}\n`
            }
          }
          fs.writeFileSync(confPath, conf, 'utf8')
          execSync('systemctl restart redis-server 2>/dev/null || true')
        }
      } else if (appKey === 'docker') {
        const confPath = '/etc/docker/daemon.json'
        let confObj = {}
        try { confObj = JSON.parse(fs.readFileSync(confPath, 'utf8')) } catch {}
        if (cfg.registry_mirrors) confObj['registry-mirrors'] = cfg.registry_mirrors
        if (cfg.data_root) confObj['data-root'] = cfg.data_root
        confObj['log-opts'] = { 'max-size': cfg.log_max_size || '50m', 'max-file': cfg.log_max_file || '3' }
        fs.writeFileSync(confPath, JSON.stringify(confObj, null, 2), 'utf8')
        execSync('systemctl restart docker 2>/dev/null || true')
      } else if (appKey === 'nodejs' && cfg.registry) {
        const safeRegistry = String(cfg.registry).trim()
        if (/^https?:\/\/[a-zA-Z0-9_.:\/-]+$/.test(safeRegistry)) {
          spawnSync('npm', ['config', 'set', 'registry', safeRegistry])
        }
      } else if (appKey === 'git') {
        if (cfg.user_name) {
          const safeName = String(cfg.user_name).replace(/[\r\n]/g, '').slice(0, 100)
          spawnSync('git', ['config', '--global', 'user.name', safeName])
        }
        if (cfg.user_email) {
          const safeEmail = String(cfg.user_email).replace(/[\r\n]/g, '').slice(0, 100)
          spawnSync('git', ['config', '--global', 'user.email', safeEmail])
        }
        if (cfg.default_branch) {
          const safeBranch = String(cfg.default_branch).replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 50)
          if (safeBranch) spawnSync('git', ['config', '--global', 'init.defaultBranch', safeBranch])
        }
      } else if (appKey === 'warp') {
        Object.assign(warpConfig, cfg)
        ctx.saveJSON('/var/lib/armguard/warp_config.json', warpConfig)
      }

      ctx.logOperation('admin', `保存可视化配置 [${appKey}]`, 'AppStore')
      res.json(null, '配置已成功保存并生效')
      return true
    } catch (e) {
      res.json(null, `配置保存失败: ${e.message}`, 500)
      return true
    }
  }

  // Raw config save
  const rawCfgMatch = pathname.match(/^\/api\/v1\/apps\/([a-zA-Z0-9_-]+)\/raw-config$/)
  if (rawCfgMatch && req.method === 'PUT') {
    const appKey = rawCfgMatch[1]
    const body = await ctx.parseBody(req, res)
    const targetPath = body.file_path
    const content = body.content || ''

    if (!targetPath || !fs.existsSync(targetPath)) {
      res.json(null, '配置文件路径不存在', 400)
      return true
    }

    try {
      fs.writeFileSync(targetPath, content, 'utf8')

      if (appKey === 'nginx') {
        const testRes = spawnSync('nginx', ['-t'], { encoding: 'utf-8' })
        if (testRes.status !== 0) {
          res.json(null, `Nginx 语法测试未通过: ${testRes.stderr}`, 500)
          return true
        }
        execSync('systemctl reload nginx 2>/dev/null || true')
      } else if (appKey === 'php') {
        const m = targetPath.match(/\/etc\/php\/([0-9.]+)\//)
        const v = m ? m[1] : '8.3'
        execSync(`systemctl reload php${v}-fpm 2>/dev/null || systemctl restart php${v}-fpm 2>/dev/null || true`)
      } else if (appKey === 'mysql') {
        execSync('systemctl restart mariadb 2>/dev/null || true')
      } else if (appKey === 'redis') {
        execSync('systemctl restart redis-server 2>/dev/null || true')
      } else if (appKey === 'docker') {
        execSync('systemctl restart docker 2>/dev/null || true')
      } else if (appKey === 'fail2ban') {
        execSync('fail2ban-client reload 2>/dev/null || true')
      }

      ctx.logOperation('admin', `编辑底层配置文件 [${appKey}]`, targetPath)
      res.json(null, '原生配置文件已保存并热重载生效')
      return true
    } catch (e) {
      res.json(null, `保存失败: ${e.message}`, 500)
      return true
    }
  }

  // PHP CLI Switch
  if (pathname === '/api/v1/apps/php/switch-version' && req.method === 'POST') {
    const body = await ctx.parseBody(req, res)
    const targetVersion = String(body.version || '').trim()
    const targetBin = `/usr/bin/php${targetVersion}`
    if (!fs.existsSync(targetBin)) {
      res.json(null, `PHP ${targetVersion} 尚未安装，请先执行安装`, 400)
      return true
    }
    try {
      execSync(`update-alternatives --set php ${targetBin} 2>&1`)
      invalidateMarketAppsCache()
      ctx.logOperation('admin', '切换全局 CLI PHP 版本', `PHP ${targetVersion}`)
      res.json(null, `已成功将系统全局 CLI PHP 切换为 PHP ${targetVersion}`)
    } catch (err) {
      res.json(null, `切换版本失败: ${err.message}`, 500)
    }
    return true
  }

  // PHP Install Version
  if (pathname === '/api/v1/apps/php/install-version' && req.method === 'POST') {
    const body = await ctx.parseBody(req, res)
    const targetVersion = String(body.version || '').trim()
    if (!['8.4', '8.3', '8.2', '8.1', '7.4'].includes(targetVersion)) {
      res.json(null, `暂不支持安装此版本: ${targetVersion}`, 400)
      return true
    }

    const taskId = 'task_php_' + targetVersion + '_' + Date.now()
    const pkgs = `php${targetVersion}-fpm php${targetVersion}-cli php${targetVersion}-common php${targetVersion}-opcache`
    
    const task = {
      task_id: taskId,
      app_key: `php-${targetVersion}`,
      stage: 'installing',
      progress_percent: 15,
      log_tail: `准备安装 PHP ${targetVersion} 运行池组件...`,
      logs: [`[ArmGuard] 开始执行 PHP ${targetVersion} 运行池秒级安装: ${pkgs}`]
    }
    appInstallTasks.set(taskId, task)

    const child = spawn('apt-get', ['install', '-y', `php${targetVersion}-fpm`, `php${targetVersion}-cli`, `php${targetVersion}-common`, `php${targetVersion}-opcache`], {
      env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' }
    })
    child.stdout.on('data', (d) => {
      const text = d.toString()
      task.logs.push(text)
      task.log_tail = text.slice(-200)
      task.progress_percent = Math.min(95, task.progress_percent + 15)
    })
    child.stderr.on('data', (d) => {
      task.logs.push(d.toString())
    })
    child.on('close', (code) => {
      if (code === 0) {
        invalidateMarketAppsCache()
        task.stage = 'done'
        task.progress_percent = 100
        task.log_tail = `PHP ${targetVersion} 安装成功，FPM 运行池已自动注册并启动！`
        task.logs.push(task.log_tail)
      } else {
        task.stage = 'failed'
        task.error_message = `安装进程异常退出 (code: ${code})`
      }
    })

    res.json({ task_id: taskId }, `已启动 PHP ${targetVersion} 运行池安装任务`)
    return true
  }

  // MySQL Root Password
  if (pathname === '/api/v1/apps/mysql/root-password' && req.method === 'POST') {
    const body = await ctx.parseBody(req, res)
    const newPwd = String(body.password || '').trim()
    if (!newPwd) {
      res.json(null, '新密码不能为空', 400)
      return true
    }

    try {
      const sql = `ALTER USER 'root'@'localhost' IDENTIFIED BY '${newPwd.replace(/'/g, "\\'")}'; FLUSH PRIVILEGES;`
      execSync(`mariadb -e "${sql}" 2>&1 || mysql -e "${sql}" 2>&1`)
      ctx.logOperation('admin', '修改 MySQL Root 密码', '安全加固')
      res.json(null, 'MySQL root 密码已成功修改并生效！')
    } catch (err) {
      res.json(null, `修改密码失败: ${err.message}`, 500)
    }
    return true
  }

  // App Logs
  const logsMatch = pathname.match(/^\/api\/v1\/apps\/([a-zA-Z0-9_-]+)\/logs$/)
  if (logsMatch) {
    const appKey = logsMatch[1]
    const logType = url.searchParams.get('type') || 'system'
    let lines = []

    try {
      if (appKey === 'nginx') {
        if (logType === 'error' && fs.existsSync('/var/log/nginx/error.log')) {
          lines = execSync('tail -n 80 /var/log/nginx/error.log 2>/dev/null || true').toString().split('\n').filter(Boolean)
        } else if (logType === 'access' && fs.existsSync('/var/log/nginx/access.log')) {
          lines = execSync('tail -n 80 /var/log/nginx/access.log 2>/dev/null || true').toString().split('\n').filter(Boolean)
        } else {
          lines = execSync('journalctl -u nginx -n 80 --no-pager 2>/dev/null || true').toString().split('\n').filter(Boolean)
        }
      } else if (appKey === 'mysql') {
        const actM = execSync('systemctl is-active mariadb 2>/dev/null || true').toString().trim()
        const svc = actM === 'active' ? 'mariadb' : 'mysql'

        if (logType === 'slow' && fs.existsSync('/var/log/mysql/mariadb-slow.log')) {
          lines = execSync('tail -n 80 /var/log/mysql/mariadb-slow.log 2>/dev/null || true').toString().split('\n').filter(Boolean)
        } else if (logType === 'error' && fs.existsSync('/var/log/mysql/error.log')) {
          lines = execSync('tail -n 80 /var/log/mysql/error.log 2>/dev/null || true').toString().split('\n').filter(Boolean)
        } else {
          lines = execSync(`journalctl -u ${svc} -n 80 --no-pager 2>/dev/null || true`).toString().split('\n').filter(Boolean)
        }
      } else if (appKey === 'php') {
        const v = url.searchParams.get('version') || '8.3'
        lines = execSync(`journalctl -u php${v}-fpm -n 80 --no-pager 2>/dev/null || true`).toString().split('\n').filter(Boolean)
      } else {
        const target = marketApps.find(a => a.key === appKey)
        let serviceName = target?.bin || appKey
        if (appKey === 'redis') serviceName = 'redis-server'
        else if (appKey === 'docker') serviceName = 'docker'
        else if (appKey === 'fail2ban') serviceName = 'fail2ban'
        lines = execSync(`journalctl -u ${serviceName} -n 80 --no-pager 2>/dev/null || true`).toString().split('\n').filter(Boolean)
      }

      res.json({ logs: lines.length > 0 ? lines : ['暂无日志记录'] })
      return true
    } catch (e) {
      res.json({ logs: [`读取日志异常: ${e.message}`] })
      return true
    }
  }

  return false
}
