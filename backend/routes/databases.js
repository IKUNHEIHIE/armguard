import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import { spawnSync, execFile } from 'child_process'

export async function handleDatabases(pathname, req, res, url, ctx) {
  if (!pathname.startsWith('/api/v1/databases')) return false

  // 1. List / Create
  if (pathname === '/api/v1/databases') {
    if (req.method === 'GET') {
      res.json({ list: ctx.databases })
      return true
    }
    if (req.method === 'POST') {
      const body = await ctx.parseBody(req, res)
      const safeDbName = (body.db_name || '').replace(/[^a-zA-Z0-9_]/g, '')
      if (!safeDbName) {
        res.json(null, '数据库名称不合法', 400)
        return true
      }
      const dbType = (body.type || 'sqlite').toLowerCase()
      if (dbType === 'mysql' || dbType === 'mariadb') {
        try {
          const charset = body.character_set || 'utf8mb4'
          spawnSync('mariadb', ['-e', `CREATE DATABASE IF NOT EXISTS \`${safeDbName}\` CHARACTER SET ${charset};`], { encoding: 'utf-8' })
          if (body.username && body.password) {
            const safeUser = (body.username || '').replace(/[^a-zA-Z0-9_]/g, '')
            const safePass = String(body.password || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\0/g, '')
            if (safeUser) {
              const grantSql = `CREATE USER IF NOT EXISTS '${safeUser}'@'localhost' IDENTIFIED BY '${safePass}'; GRANT ALL PRIVILEGES ON \`${safeDbName}\`.* TO '${safeUser}'@'localhost'; FLUSH PRIVILEGES;`
              spawnSync('mariadb', ['-e', grantSql], { encoding: 'utf-8' })
            }
          }
        } catch (e) {
          console.error('MySQL database creation error:', e)
        }
      } else {
        const dbPath = path.join(ctx.DATA_DIR, `${safeDbName}.db`)
        try {
          spawnSync('sqlite3', [dbPath, 'CREATE TABLE IF NOT EXISTS sample (id INTEGER PRIMARY KEY, note TEXT); INSERT INTO sample (note) VALUES ("Initialized by ArmGuard");'])
        } catch {}
      }
      const newDb = {
        id: Date.now(),
        type: dbType,
        db_name: dbType === 'sqlite' ? `${safeDbName}.db` : safeDbName,
        username: body.username || 'root',
        character_set: body.character_set || 'utf8mb4',
        size_bytes: 16384,
        status: 'active',
        backup_count: 0,
        created_at: new Date().toLocaleString()
      }
      ctx.databases.unshift(newDb)
      ctx.saveJSON(ctx.DATABASES_FILE, ctx.databases)
      ctx.logOperation('admin', '新建数据库', newDb.db_name)
      res.json(newDb, '数据库创建成功')
      return true
    }
  }

  // 2. Delete Database
  const delMatch = pathname.match(/^\/api\/v1\/databases\/(\d+)$/)
  if (delMatch && req.method === 'DELETE') {
    const id = parseInt(delMatch[1], 10)
    const idx = ctx.databases.findIndex(d => d.id === id)
    if (idx === -1) {
      res.json(null, '数据库不存在', 404)
      return true
    }
    const target = ctx.databases[idx]
    const safeDbName = (target.db_name || '').replace(/[^a-zA-Z0-9_.]/g, '')
    if (target.type === 'mysql' || target.type === 'mariadb') {
      const cleanName = safeDbName.replace(/\.db$/, '')
      try {
        spawnSync('mariadb', ['-e', `DROP DATABASE IF EXISTS \`${cleanName}\`;`], { encoding: 'utf-8' })
      } catch {}
    } else {
      const dbFile = path.join(ctx.DATA_DIR, safeDbName.endsWith('.db') ? safeDbName : `${safeDbName}.db`)
      if (fs.existsSync(dbFile)) {
        try { fs.unlinkSync(dbFile) } catch {}
      }
    }
    ctx.databases.splice(idx, 1)
    ctx.saveJSON(ctx.DATABASES_FILE, ctx.databases)
    ctx.logOperation('admin', '删除数据库', target.db_name)
    res.json(null, `数据库 [${target.db_name}] 已成功删除`)
    return true
  }

  // 3. Query Database
  const queryMatch = pathname.match(/^\/api\/v1\/databases\/(\d+)\/query$/)
  if (queryMatch && req.method === 'POST') {
    const id = parseInt(queryMatch[1], 10)
    const body = await ctx.parseBody(req, res)
    const target = ctx.databases.find(d => d.id === id)
    const sql = (body.sql || '').trim()

    if (target && (target.type === 'mysql' || target.type === 'mariadb')) {
      const cleanName = target.db_name.replace(/[^a-zA-Z0-9_]/g, '')
      execFile('mariadb', ['-D', cleanName, '-e', sql], { timeout: 8000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err && (!stdout || stdout.trim() === '')) {
          res.json(null, stderr || err.message, 500)
          return
        }
        const lines = (stdout || '').trim().split('\n')
        const cols = lines.length > 0 ? lines[0].split('\t') : ['Result']
        const rows = lines.slice(1).map(l => l.split('\t'))
        res.json({ columns: cols, rows: rows, execution_time_ms: 2 })
      })
      return true
    }

    const dbPath = path.join(ctx.DATA_DIR, target?.db_name.endsWith('.db') ? target.db_name : `${target?.db_name}.db`)
    execFile('sqlite3', ['-json', dbPath, sql], { timeout: 8000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && (!stdout || stdout.trim() === '')) {
        res.json(null, stderr || err.message, 500)
        return
      }
      try {
        const raw = stdout ? stdout.trim() : ''
        let rows = []
        let cols = []
        if (raw.startsWith('[') && raw.endsWith(']')) {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed) && parsed.length > 0) {
            cols = Object.keys(parsed[0])
            rows = parsed.map(r => Object.values(r))
          } else {
            cols = ['Result']
            rows = []
          }
        } else {
          cols = ['Result']
          rows = raw ? [[raw]] : []
        }
        res.json({ columns: cols, rows: rows, execution_time_ms: 1 })
      } catch (e) {
        res.json({ columns: ['Result'], rows: [[stdout || 'Query OK']], execution_time_ms: 1 })
      }
    })
    return true
  }

  // 4. Create Backup
  const backupMatch = pathname.match(/^\/api\/v1\/databases\/(\d+)\/backup$/)
  if (backupMatch && req.method === 'POST') {
    const id = parseInt(backupMatch[1], 10)
    const target = ctx.databases.find(d => d.id === id)
    const safeDbName = (target?.db_name || 'armguard_core').replace(/[^a-zA-Z0-9_.]/g, '')
    const backupFile = path.join(ctx.BACKUP_DIR, `${safeDbName}_${Date.now()}.sql.gz`)
    
    if (target && (target.type === 'mysql' || target.type === 'mariadb')) {
      const cleanName = safeDbName.replace(/\.db$/, '')
      execFile('mariadb-dump', [cleanName], { timeout: 30000, maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          res.json(null, stderr || err.message, 500)
          return
        }
        try {
          const gzipped = zlib.gzipSync(Buffer.from(stdout, 'utf8'))
          fs.writeFileSync(backupFile, gzipped)
          if (target) target.backup_count++
          ctx.saveJSON(ctx.DATABASES_FILE, ctx.databases)
          ctx.logOperation('admin', '备份 MySQL 数据库', cleanName)
          res.json({ backup_id: Date.now(), file_name: path.basename(backupFile) }, '备份成功')
        } catch (e) {
          res.json(null, e.message, 500)
        }
      })
      return true
    }

    const dbPath = path.join(ctx.DATA_DIR, safeDbName.endsWith('.db') ? safeDbName : `${safeDbName}.db`)
    execFile('sqlite3', [dbPath, '.dump'], { timeout: 15000, maxBuffer: 50 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        res.json(null, stderr || err.message, 500)
        return
      }
      try {
        const gzipped = zlib.gzipSync(Buffer.from(stdout, 'utf8'))
        fs.writeFileSync(backupFile, gzipped)
        if (target) target.backup_count++
        ctx.saveJSON(ctx.DATABASES_FILE, ctx.databases)
        ctx.logOperation('admin', '备份 SQLite 数据库', safeDbName)
        res.json({ backup_id: Date.now(), file_name: path.basename(backupFile) }, '备份成功')
      } catch (e) {
        res.json(null, e.message, 500)
      }
    })
    return true
  }

  // 5. Backups List
  const backupsListMatch = pathname.match(/^\/api\/v1\/databases\/(\d+)\/backups$/)
  if (backupsListMatch && req.method === 'GET') {
    const id = parseInt(backupsListMatch[1], 10)
    const target = ctx.databases.find(d => d.id === id)
    const safeDbName = (target?.db_name || '').replace(/[^a-zA-Z0-9_.]/g, '')
    const list = []
    try {
      if (fs.existsSync(ctx.BACKUP_DIR)) {
        const allFiles = fs.readdirSync(ctx.BACKUP_DIR)
        const matched = allFiles.filter(f => f.startsWith(safeDbName) && (f.endsWith('.sql.gz') || f.endsWith('.sql')))
        matched.forEach(f => {
          const fullPath = path.join(ctx.BACKUP_DIR, f)
          const st = fs.statSync(fullPath)
          list.push({
            id: st.mtimeMs,
            database_id: id,
            db_name: safeDbName,
            file_name: f,
            file_size_bytes: st.size,
            storage_path: fullPath,
            created_at: st.mtime.toLocaleString()
          })
        })
      }
    } catch {}
    res.json({ list: list.reverse() })
    return true
  }

  // 6. Download Backup
  if (pathname === '/api/v1/databases/backup/download' && (req.method === 'GET' || req.method === 'HEAD')) {
    const fileName = (url.searchParams.get('file_name') || '').replace(/[^a-zA-Z0-9_.-]/g, '')
    if (!fileName) {
      res.json(null, '无效的文件名', 400)
      return true
    }
    const filePath = path.join(ctx.BACKUP_DIR, fileName)
    if (!fs.existsSync(filePath)) {
      res.json(null, '备份文件不存在', 404)
      return true
    }
    try {
      const stat = fs.statSync(filePath)
      res.writeHead(200, {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': stat.size
      })
      if (req.method === 'HEAD') {
        res.end()
        return true
      }
      fs.createReadStream(filePath).pipe(res)
      ctx.logOperation('admin', '下载数据库备份', fileName)
      return true
    } catch (e) {
      res.json(null, e.message, 500)
      return true
    }
  }

  // 7. Delete Backup
  if (pathname === '/api/v1/databases/backup' && req.method === 'DELETE') {
    const fileName = (url.searchParams.get('file_name') || '').replace(/[^a-zA-Z0-9_.-]/g, '')
    if (!fileName) {
      res.json(null, '无效的文件名', 400)
      return true
    }
    const filePath = path.join(ctx.BACKUP_DIR, fileName)
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath) } catch {}
    }
    ctx.logOperation('admin', '删除数据库备份', fileName)
    res.json(null, '备份文件已删除')
    return true
  }

  return false
}
