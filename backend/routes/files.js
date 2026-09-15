import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'

export const ALLOWED_SANDBOX_ROOTS = [
  '/www',
  '/var/www',
  '/var/backups',
  '/var/log/nginx',
  '/tmp'
]

export const FORBIDDEN_PREFIXES = [
  '/etc',
  '/opt/armguard',
  '/var/lib/armguard',
  '/root',
  '/boot',
  '/proc',
  '/sys',
  '/dev',
  '/run',
  '/bin',
  '/sbin',
  '/lib',
  '/lib64',
  '/usr',
  '/var/spool',
  '/var/run'
]

export const SENSITIVE_BASENAMES = new Set([
  '.env',
  'id_rsa',
  'id_ed25519',
  'authorized_keys',
  'known_hosts',
  'shadow',
  'passwd',
  'sudoers',
  'settings.json',
  'users.json',
  'ai_config.json',
  'dev_server.js',
  '.bash_history',
  '.bashrc',
  '.profile',
  'ld.so.preload'
])

export function isProtectedPath(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') return true
  const resolved = path.resolve(targetPath)
  const posixPath = resolved.replace(/\\/g, '/').replace(/^[a-zA-Z]:/, '')
  const baseName = path.basename(posixPath).toLowerCase()

  // 1. Block sensitive file basenames & SSH / hidden credentials
  if (SENSITIVE_BASENAMES.has(baseName)) return true
  if (posixPath.endsWith('/.env') || posixPath.includes('/.ssh/')) return true

  // 2. Check forbidden system prefixes on posixPath
  for (const prefix of FORBIDDEN_PREFIXES) {
    if (posixPath === prefix || posixPath.startsWith(prefix + '/')) {
      return true
    }
  }

  // 3. Resolve symlinks if path exists to prevent traversal
  try {
    if (fs.existsSync(resolved)) {
      const real = fs.realpathSync(resolved)
      const realPosix = real.replace(/\\/g, '/').replace(/^[a-zA-Z]:/, '')
      const realBase = path.basename(realPosix).toLowerCase()
      if (SENSITIVE_BASENAMES.has(realBase)) return true
      for (const prefix of FORBIDDEN_PREFIXES) {
        if (realPosix === prefix || realPosix.startsWith(prefix + '/')) {
          return true
        }
      }
      if (process.platform !== 'win32') {
        const isRealInsideSandbox = ALLOWED_SANDBOX_ROOTS.some(root =>
          realPosix === root || realPosix.startsWith(root + '/')
        )
        if (!isRealInsideSandbox) return true
      }
    }
  } catch {}

  // 4. Sandbox Root enforcement
  if (process.platform === 'win32') {
    const winLower = resolved.toLowerCase()
    if (winLower.startsWith('c:\\windows') || winLower.startsWith('c:\\program files')) return true
    return false
  }

  const isInsideSandbox = ALLOWED_SANDBOX_ROOTS.some(root =>
    posixPath === root || posixPath.startsWith(root + '/')
  )
  if (!isInsideSandbox) {
    return true
  }

  return false
}

export async function handleFiles(pathname, req, res, url, ctx) {
  if (!pathname.startsWith('/api/v1/files')) return false

  // 1. File List
  if (pathname === '/api/v1/files/list') {
    const defaultDir = fs.existsSync('/www/wwwroot') ? '/www/wwwroot' : (fs.existsSync('/www') ? '/www' : (process.platform === 'win32' ? process.cwd() : '/tmp'))
    const targetDir = url.searchParams.get('path') || defaultDir
    try {
      const safeDir = path.resolve(targetDir)
      if (isProtectedPath(safeDir)) {
        res.json(null, `安全拦截：禁止访问系统受保护目录 [${safeDir}]！`, 403)
        return true
      }
      const entries = fs.readdirSync(safeDir, { withFileTypes: true })
      const fileList = entries.map(e => {
        const fullPath = path.join(safeDir, e.name)
        let size = 0
        let mode = '0644'
        let mod_time = '刚刚'
        try {
          const st = fs.statSync(fullPath)
          size = st.size
          mode = '0' + (st.mode & parseInt('777', 8)).toString(8)
          mod_time = st.mtime.toISOString().replace('T', ' ').substring(0, 19)
        } catch {}
        return {
          name: e.name,
          path: fullPath,
          is_dir: e.isDirectory(),
          size: size,
          mode: mode,
          mod_time: mod_time,
          owner: 'root',
          group: 'root'
        }
      })
      res.json({
        current_path: safeDir,
        parent_path: path.dirname(safeDir),
        files: fileList,
        total_files: fileList.filter(f => !f.is_dir).length,
        total_dirs: fileList.filter(f => f.is_dir).length
      })
      return true
    } catch (err) {
      res.json(null, err.message, 500)
      return true
    }
  }

  // 2. File Content (GET / PUT)
  if (pathname === '/api/v1/files/content') {
    const filePath = url.searchParams.get('path')
    if (req.method === 'GET' && filePath) {
      try {
        const safePath = path.resolve(filePath)
        if (ctx.isProtectedPath(safePath)) {
          res.json(null, `安全拦截：禁止查看系统受保护文件 [${safePath}]！`, 403)
          return true
        }
        const content = fs.readFileSync(safePath, 'utf8')
        res.json({ content, encoding: 'utf-8', size: content.length, path: safePath })
        return true
      } catch (e) {
        res.json(null, e.message, 500)
        return true
      }
    }
    if (req.method === 'PUT') {
      const body = await ctx.parseBody(req, res)
      try {
        const safePath = path.resolve(body.path)
        if (ctx.isProtectedPath(safePath)) {
          res.json(null, `安全拦截：禁止直接修改系统受保护文件 [${safePath}]！`, 403)
          return true
        }
        fs.writeFileSync(safePath, body.content || '', 'utf8')
        ctx.logOperation('admin', '修改文件', safePath)
        res.json(null, '文件保存成功')
        return true
      } catch (e) {
        res.json(null, e.message, 500)
        return true
      }
    }
  }

  // 3. Create File/Directory
  if (pathname === '/api/v1/files/create' && req.method === 'POST') {
    const body = await ctx.parseBody(req, res)
    try {
      const safePath = path.resolve(body.path)
      if (ctx.isProtectedPath(safePath)) {
        res.json(null, `安全拦截：禁止在系统受保护路径下创建文件 [${safePath}]！`, 403)
        return true
      }
      if (body.is_dir) {
        fs.mkdirSync(safePath, { recursive: true })
      } else {
        fs.writeFileSync(safePath, '', 'utf8')
      }
      ctx.logOperation('admin', body.is_dir ? '新建目录' : '新建文件', safePath)
      res.json(null, '创建成功')
      return true
    } catch (e) {
      res.json(null, e.message, 500)
      return true
    }
  }

  // 4. Delete Files
  if (pathname === '/api/v1/files' && req.method === 'DELETE') {
    const body = await ctx.parseBody(req, res)
    try {
      for (const p of body.paths || []) {
        const safePath = path.resolve(p)
        if (ctx.isProtectedPath(safePath)) {
          res.json(null, `安全拦截：禁止删除系统核心目录或文件 [${safePath}]！`, 403)
          return true
        }
        fs.rmSync(safePath, { recursive: true, force: true })
        ctx.logOperation('admin', '删除文件/目录', safePath)
      }
      res.json(null, '删除成功')
      return true
    } catch (e) {
      res.json(null, e.message, 500)
      return true
    }
  }

  // 5. Change Permission
  if (pathname === '/api/v1/files/permission' && req.method === 'PUT') {
    const body = await ctx.parseBody(req, res)
    try {
      const safePath = path.resolve(body.path)
      if (ctx.isProtectedPath(safePath)) {
        res.json(null, `安全拦截：禁止直接修改系统受保护路径权限 [${safePath}]！`, 403)
        return true
      }
      const mode = parseInt(body.mode, 8)
      if (!isNaN(mode)) {
        fs.chmodSync(safePath, mode)
        res.json(null, '权限修改成功')
        return true
      }
      res.json(null, '无效的权限格式', 400)
      return true
    } catch (e) {
      res.json(null, e.message, 500)
      return true
    }
  }

  // 6. Upload
  if (pathname === '/api/v1/files/upload' && req.method === 'POST') {
    try {
      const defaultDir = fs.existsSync('/www/wwwroot') ? '/www/wwwroot' : (fs.existsSync('/www') ? '/www' : (process.platform === 'win32' ? process.cwd() : '/tmp'))
      const targetDir = fields.path || defaultDir
      const safeDir = path.resolve(targetDir)
      if (ctx.isProtectedPath(safeDir)) {
        res.json(null, `安全拦截：禁止上传到系统受保护路径 [${safeDir}]`, 403)
        return true
      }
      if (!fs.existsSync(safeDir)) {
        fs.mkdirSync(safeDir, { recursive: true })
      }
      let uploadedPath = ''
      for (const f of files) {
        const dest = path.join(safeDir, f.filename)
        if (ctx.isProtectedPath(dest)) {
          res.json(null, `安全拦截：禁止覆盖系统受保护文件 [${dest}]`, 403)
          return true
        }
        fs.writeFileSync(dest, f.data)
        uploadedPath = dest
        ctx.logOperation('admin', '上传文件', dest)
      }
      res.json({ path: uploadedPath || safeDir, count: files.length }, '文件上传成功')
      return true
    } catch (e) {
      res.json(null, e.message, 500)
      return true
    }
  }

  // 7. Download
  if (pathname === '/api/v1/files/download' && (req.method === 'GET' || req.method === 'HEAD')) {
    const filePath = url.searchParams.get('path')
    if (!filePath) {
      res.json(null, '缺少 path 参数', 400)
      return true
    }
    const safePath = path.resolve(filePath)
    if (ctx.isProtectedPath(safePath)) {
      res.json(null, '安全拦截：禁止下载系统核心敏感文件', 403)
      return true
    }
    if (!fs.existsSync(safePath)) {
      res.json(null, '文件不存在', 404)
      return true
    }
    try {
      const stat = fs.statSync(safePath)
      if (stat.isDirectory()) {
        res.json(null, '不能直接下载目录，请先压缩为 zip 或 tar.gz', 400)
        return true
      }
      const filename = path.basename(safePath)
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'Content-Length': stat.size
      })
      if (req.method === 'HEAD') {
        res.end()
        return true
      }
      fs.createReadStream(safePath).pipe(res)
      ctx.logOperation('admin', '下载文件', safePath)
      return true
    } catch (e) {
      res.json(null, e.message, 500)
      return true
    }
  }

  // 8. Rename
  if (pathname === '/api/v1/files/rename' && req.method === 'POST') {
    const body = await ctx.parseBody(req, res)
    const oldPath = path.resolve(body.old_path || '')
    const newPath = path.resolve(body.new_path || '')
    if (ctx.isProtectedPath(oldPath) || ctx.isProtectedPath(newPath)) {
      res.json(null, '安全拦截：禁止重命名系统受保护路径', 403)
      return true
    }
    if (!fs.existsSync(oldPath)) {
      res.json(null, '原文件或目录不存在', 404)
      return true
    }
    try {
      fs.renameSync(oldPath, newPath)
      ctx.logOperation('admin', '重命名文件/目录', `${oldPath} -> ${newPath}`)
      res.json(null, '重命名成功')
      return true
    } catch (e) {
      res.json(null, e.message, 500)
      return true
    }
  }

  // 9. Compress
  if (pathname === '/api/v1/files/compress' && req.method === 'POST') {
    const body = await ctx.parseBody(req, res)
    const paths = body.paths || []
    const targetName = body.target_name || `archive_${Date.now()}.tar.gz`
    const format = body.format || 'tar.gz'
    if (paths.length === 0) {
      res.json(null, '请指定要压缩的文件或目录', 400)
      return true
    }
    const parentDir = path.dirname(path.resolve(paths[0]))
    const targetPath = path.join(parentDir, targetName)
    if (isProtectedPath(parentDir) || isProtectedPath(targetPath)) {
      res.json(null, '安全拦截：压缩目标路径位于受保护区域！', 403)
      return true
    }
    for (const p of paths) {
      const fullP = path.resolve(parentDir, p)
      if (isProtectedPath(fullP)) {
        res.json(null, `安全拦截：禁止压缩系统受保护文件 [${fullP}]！`, 403)
        return true
      }
    }
    try {
      const fileNames = paths.map(p => path.basename(path.resolve(p)))
      if (format === 'zip') {
        spawnSync('zip', ['-r', targetPath, ...fileNames], { cwd: parentDir })
      } else {
        spawnSync('tar', ['-czf', targetPath, ...fileNames], { cwd: parentDir })
      }
      ctx.logOperation('admin', '压缩文件', targetPath)
      res.json({ target_path: targetPath }, '压缩完成')
      return true
    } catch (e) {
      res.json(null, e.message, 500)
      return true
    }
  }

  // 10. Decompress
  if (pathname === '/api/v1/files/decompress' && req.method === 'POST') {
    const body = await ctx.parseBody(req, res)
    const archivePath = path.resolve(body.path || '')
    const destPath = path.resolve(body.dest_path || path.dirname(archivePath))
    if (isProtectedPath(archivePath) || isProtectedPath(destPath)) {
      res.json(null, '安全拦截：解压路径位于系统受保护区域！', 403)
      return true
    }
    if (!fs.existsSync(archivePath)) {
      res.json(null, '压缩包不存在', 404)
      return true
    }
    try {
      fs.mkdirSync(destPath, { recursive: true })
      if (archivePath.endsWith('.zip')) {
        spawnSync('unzip', ['-o', archivePath, '-d', destPath])
      } else {
        spawnSync('tar', ['-xzf', archivePath, '-C', destPath])
      }
      ctx.logOperation('admin', '解压文件', `${archivePath} -> ${destPath}`)
      res.json(null, '解压完成')
      return true
    } catch (e) {
      res.json(null, e.message, 500)
      return true
    }
  }

  return false
}
