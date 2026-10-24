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

function toPosix(p) {
  return p.replace(/\\/g, '/').replace(/^[a-zA-Z]:/, '')
}

function lstatSafe(p) {
  try {
    return fs.lstatSync(p)
  } catch {
    return null
  }
}

function hasSensitiveSegment(posixPath) {
  const parts = posixPath.split('/').filter(Boolean)
  for (const seg of parts) {
    const lower = seg.toLowerCase()
    if (SENSITIVE_BASENAMES.has(lower)) return true
    if (lower === '.ssh' || lower.startsWith('.env.')) return true
  }
  return false
}

function isPosixOutsideOrForbidden(posixPath) {
  const baseName = path.basename(posixPath).toLowerCase()
  if (SENSITIVE_BASENAMES.has(baseName)) return true
  if (hasSensitiveSegment(posixPath)) return true

  for (const prefix of FORBIDDEN_PREFIXES) {
    if (posixPath === prefix || posixPath.startsWith(prefix + '/')) {
      return true
    }
  }

  if (process.platform !== 'win32') {
    const isInsideSandbox = ALLOWED_SANDBOX_ROOTS.some(
      root => posixPath === root || posixPath.startsWith(root + '/')
    )
    if (!isInsideSandbox) return true
  }

  return false
}

/**
 * Resolve the effective real path even when the leaf (or several trailing segments)
 * does not exist yet on disk, preventing parent-directory symlink sandbox escapes (REV-002).
 */
function resolveRealWithAncestors(resolvedPath) {
  let curr = resolvedPath
  const trailing = []

  while (curr && curr !== path.dirname(curr)) {
    const st = lstatSafe(curr)
    if (st) {
      try {
        const realExisting = fs.realpathSync(curr)
        return trailing.length > 0
          ? path.join(realExisting, ...trailing.reverse())
          : realExisting
      } catch {
        // Broken symlink: resolve link target manually and check it
        if (st.isSymbolicLink()) {
          try {
            const linkTarget = path.resolve(path.dirname(curr), fs.readlinkSync(curr))
            return trailing.length > 0
              ? path.join(linkTarget, ...trailing.reverse())
              : linkTarget
          } catch {
            return null
          }
        }
        return null
      }
    }
    trailing.push(path.basename(curr))
    curr = path.dirname(curr)
  }

  return resolvedPath
}

export function isProtectedPath(targetPath) {
  if (!targetPath || typeof targetPath !== 'string' || targetPath.includes('\0')) return true
  const resolved = path.resolve(targetPath)
  const posixPath = toPosix(resolved)

  if (process.platform === 'win32') {
    const winLower = resolved.toLowerCase()
    if (winLower.startsWith('c:\\windows') || winLower.startsWith('c:\\program files')) return true
    if (hasSensitiveSegment(posixPath)) return true
  }

  // 1. Check lexical path
  if (isPosixOutsideOrForbidden(posixPath)) {
    return true
  }

  // 2. Check resolved real path (including nearest existing ancestor for non-existent new targets)
  const realTarget = resolveRealWithAncestors(resolved)
  if (!realTarget) return true
  const realPosix = toPosix(realTarget)
  if (isPosixOutsideOrForbidden(realPosix)) {
    return true
  }

  return false
}

/**
 * Recursively verify that a file or directory tree contains no protected files
 * (e.g., .env, SSH keys) and no symlinks escaping the sandbox (REV-011).
 */
function inspectTreeForArchive(rootPath, checkProtected, visited = new Set()) {
  const st = lstatSafe(rootPath)
  if (!st) {
    return { ok: false, message: `待归档路径不存在: ${rootPath}`, code: 404 }
  }
  if (checkProtected(rootPath)) {
    return { ok: false, message: `安全拦截：禁止归档受保护的敏感文件或越界路径 [${rootPath}]！`, code: 403 }
  }

  if (st.isSymbolicLink()) {
    try {
      const real = fs.realpathSync(rootPath)
      if (checkProtected(real)) {
        return { ok: false, message: `安全拦截：符号链接指向受保护或沙箱外路径 [${rootPath} -> ${real}]！`, code: 403 }
      }
    } catch {
      return { ok: false, message: `安全拦截：禁止归档失效或不可信的符号链接 [${rootPath}]！`, code: 403 }
    }
    return { ok: true }
  }

  if (st.isDirectory()) {
    const realDir = fs.realpathSync(rootPath)
    if (visited.has(realDir)) return { ok: true }
    visited.add(realDir)

    let entries = []
    try {
      entries = fs.readdirSync(rootPath)
    } catch (e) {
      return { ok: false, message: `无法读取目录 [${rootPath}]: ${e.message}`, code: 500 }
    }
    for (const name of entries) {
      const childPath = path.join(rootPath, name)
      const res = inspectTreeForArchive(childPath, checkProtected, visited)
      if (!res.ok) return res
    }
  }

  return { ok: true }
}

function parseMultipartFallback(req, maxBytes = 100 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const contentType = req?.headers?.['content-type'] || ''
    const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)
    if (!match) return reject(new Error('缺少 multipart/form-data boundary'))
    const boundary = Buffer.from('--' + (match[1] || match[2]).trim())
    const chunks = []
    let totalLen = 0

    req.on('data', chunk => {
      totalLen += chunk.length
      if (totalLen > maxBytes) {
        req.destroy?.()
        return reject(new Error('上传文件大小超出限制 (100MB)'))
      }
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })

    req.on('end', () => {
      const buffer = Buffer.concat(chunks)
      let offset = 0
      const fields = {}
      const files = []

      while (offset < buffer.length) {
        const bIdx = buffer.indexOf(boundary, offset)
        if (bIdx === -1) break
        offset = bIdx + boundary.length
        if (buffer[offset] === 0x2d && buffer[offset + 1] === 0x2d) break
        if (buffer[offset] === 0x0d && buffer[offset + 1] === 0x0a) offset += 2

        const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), offset)
        if (headerEnd === -1) break
        const headerStr = buffer.slice(offset, headerEnd).toString('utf8')
        const bodyStart = headerEnd + 4
        const nextB = buffer.indexOf(boundary, bodyStart)
        if (nextB === -1) break

        let bodyEnd = nextB
        if (bodyEnd >= 2 && buffer[bodyEnd - 2] === 0x0d && buffer[bodyEnd - 1] === 0x0a) {
          bodyEnd -= 2
        }
        const partBody = buffer.slice(bodyStart, bodyEnd)
        offset = nextB

        const nameMatch = headerStr.match(/name="([^"]+)"/)
        const filenameMatch = headerStr.match(/filename="([^"]+)"/)
        if (nameMatch) {
          const fieldName = nameMatch[1]
          if (filenameMatch) {
            files.push({
              fieldName,
              filename: path.basename(filenameMatch[1]),
              data: partBody
            })
          } else {
            fields[fieldName] = partBody.toString('utf8')
          }
        }
      }
      resolve({ fields, files })
    })
    req.on('error', reject)
  })
}

export async function handleFiles(pathname, req, res, url, ctx) {
  if (!pathname.startsWith('/api/v1/files')) return false

  const checkProtected = (p) => isProtectedPath(p) || (ctx?.isProtectedPath ? ctx.isProtectedPath(p) : false)
  const getDefaultDir = () =>
    fs.existsSync('/www/wwwroot')
      ? '/www/wwwroot'
      : fs.existsSync('/www')
        ? '/www'
        : process.platform === 'win32'
          ? process.cwd()
          : '/tmp'

  // 1. File List
  if (pathname === '/api/v1/files/list') {
    const defaultDir = getDefaultDir()
    const requestedPath = url.searchParams.get('path')
    const targetDir = requestedPath && requestedPath.trim() !== '' ? requestedPath.trim() : defaultDir
    try {
      const safeDir = path.resolve(targetDir)
      if (checkProtected(safeDir)) {
        res.json(null, `安全拦截：禁止访问系统受保护目录 [${safeDir}]！`, 403)
        return true
      }
      if (!fs.existsSync(safeDir)) {
        res.json(null, `目录不存在: ${safeDir}`, 404)
        return true
      }
      const entries = fs.readdirSync(safeDir, { withFileTypes: true })
      const fileList = entries
        .filter(e => !SENSITIVE_BASENAMES.has(e.name.toLowerCase()))
        .map(e => {
          const fullPath = path.join(safeDir, e.name)
          let size = 0
          let mode = '0644'
          let mod_time = '刚刚'
          try {
            const st = fs.lstatSync(fullPath)
            size = st.size
            mode = '0' + (st.mode & parseInt('777', 8)).toString(8)
            mod_time = st.mtime.toISOString().replace('T', ' ').substring(0, 19)
          } catch {}
          return {
            name: e.name,
            path: fullPath,
            is_dir: e.isDirectory(),
            size,
            mode,
            mod_time,
            owner: 'root',
            group: 'root'
          }
        })
      const parentCandidate = path.dirname(safeDir)
      const safeParent = checkProtected(parentCandidate) ? safeDir : parentCandidate
      const allowedRoots = process.platform === 'win32'
        ? [defaultDir]
        : ALLOWED_SANDBOX_ROOTS.filter(r => fs.existsSync(r))
      res.json({
        current_path: safeDir,
        parent_path: safeParent,
        default_path: defaultDir,
        allowed_roots: allowedRoots,
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
        if (checkProtected(safePath)) {
          res.json(null, `安全拦截：禁止查看系统受保护文件 [${safePath}]！`, 403)
          return true
        }
        if (!fs.existsSync(safePath)) {
          res.json(null, `文件不存在: ${safePath}`, 404)
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
        if (!body?.path || typeof body.path !== 'string') {
          res.json(null, '缺少有效的文件路径参数', 400)
          return true
        }
        const safePath = path.resolve(body.path)
        if (checkProtected(safePath)) {
          res.json(null, `安全拦截：禁止直接修改系统受保护文件 [${safePath}]！`, 403)
          return true
        }
        const st = lstatSafe(safePath)
        if (st && st.isSymbolicLink()) {
          res.json(null, `安全拦截：禁止通过符号链接覆写文件 [${safePath}]！`, 403)
          return true
        }
        fs.writeFileSync(safePath, body.content ?? '', 'utf8')
        ctx.logOperation(ctx.currentUser(), '修改文件', safePath)
        res.json(null, '文件保存成功')
        return true
      } catch (e) {
        res.json(null, e.message, 500)
        return true
      }
    }
  }

  // 3. Create File/Directory (REV-002 & REV-006)
  if (pathname === '/api/v1/files/create' && req.method === 'POST') {
    const body = await ctx.parseBody(req, res)
    try {
      if (!body?.path || typeof body.path !== 'string') {
        res.json(null, '缺少有效的路径参数', 400)
        return true
      }
      const safePath = path.resolve(body.path)
      if (checkProtected(safePath)) {
        res.json(null, `安全拦截：禁止在系统受保护路径下创建文件 [${safePath}]！`, 403)
        return true
      }
      if (lstatSafe(safePath) !== null && body.overwrite !== true) {
        res.json(null, `同名文件或目录已存在 [${path.basename(safePath)}]，已拒绝静默覆盖`, 409)
        return true
      }
      if (body.is_dir) {
        fs.mkdirSync(safePath, { recursive: false })
      } else {
        const parentDir = path.dirname(safePath)
        if (!fs.existsSync(parentDir)) {
          res.json(null, `父目录不存在: ${parentDir}`, 404)
          return true
        }
        if (checkProtected(parentDir)) {
          res.json(null, `安全拦截：父目录属于受保护路径 [${parentDir}]！`, 403)
          return true
        }
        fs.writeFileSync(safePath, '', { encoding: 'utf8', flag: body.overwrite === true ? 'w' : 'wx' })
      }
      ctx.logOperation(ctx.currentUser(), body.is_dir ? '新建目录' : '新建文件', safePath)
      res.json(null, '创建成功')
      return true
    } catch (e) {
      if (e.code === 'EEXIST') {
        res.json(null, '同名文件或目录已存在，已拒绝覆盖', 409)
        return true
      }
      res.json(null, e.message, 500)
      return true
    }
  }

  // 4. Delete Files
  if (pathname === '/api/v1/files' && req.method === 'DELETE') {
    const body = await ctx.parseBody(req, res)
    try {
      const paths = Array.isArray(body?.paths) ? body.paths : []
      if (paths.length === 0) {
        res.json(null, '请指定要删除的文件或目录', 400)
        return true
      }
      for (const p of paths) {
        const safePath = path.resolve(String(p || ''))
        if (checkProtected(safePath) || ALLOWED_SANDBOX_ROOTS.includes(toPosix(safePath))) {
          res.json(null, `安全拦截：禁止删除系统核心目录或受保护文件 [${safePath}]！`, 403)
          return true
        }
        fs.rmSync(safePath, { recursive: true, force: true })
        ctx.logOperation(ctx.currentUser(), '删除文件/目录', safePath)
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
      const safePath = path.resolve(body?.path || '')
      if (checkProtected(safePath)) {
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

  // 6. Upload (REV-005 & REV-006)
  if (pathname === '/api/v1/files/upload' && req.method === 'POST') {
    try {
      const contentType = String(req?.headers?.['content-type'] || '')
      let fields = {}
      let files = []

      if (contentType.toLowerCase().includes('multipart/form-data')) {
        const parser = typeof ctx?.parseMultipart === 'function' ? ctx.parseMultipart : parseMultipartFallback
        const parsed = await parser(req)
        fields = parsed?.fields || {}
        files = parsed?.files || []
      } else if (typeof ctx?.parseBody === 'function') {
        const body = await ctx.parseBody(req, res)
        if (body && Array.isArray(body.files) && body.files.length > 0) {
          fields = { path: body.path, overwrite: body.overwrite ? 'true' : 'false' }
          files = body.files.map(item => ({
            filename: path.basename(String(item.filename || '')),
            data: Buffer.isBuffer(item.data) ? item.data : Buffer.from(String(item.content ?? item.data ?? ''), 'utf8')
          }))
        } else {
          res.json(null, '上传失败：请求必须为 multipart/form-data 格式并包含待上传文件', 400)
          return true
        }
      } else {
        res.json(null, '上传失败：缺少 multipart/form-data 上传载荷', 400)
        return true
      }

      if (!Array.isArray(files) || files.length === 0) {
        res.json(null, '上传失败：未接收到任何文件', 400)
        return true
      }

      const defaultDir = getDefaultDir()
      const targetDir = fields.path ? String(fields.path).trim() : defaultDir
      const safeDir = path.resolve(targetDir)
      if (checkProtected(safeDir)) {
        res.json(null, `安全拦截：禁止上传到系统受保护路径 [${safeDir}]`, 403)
        return true
      }
      if (!fs.existsSync(safeDir)) {
        fs.mkdirSync(safeDir, { recursive: true })
      }
      if (checkProtected(safeDir)) {
        res.json(null, `安全拦截：目标目录解析后位于受保护区域 [${safeDir}]`, 403)
        return true
      }

      const allowOverwrite = fields.overwrite === 'true' || fields.overwrite === true
      const validated = []
      for (const f of files) {
        const cleanName = path.basename(String(f.filename || '').trim())
        if (!cleanName || cleanName === '.' || cleanName === '..' || cleanName.includes('\0')) {
          res.json(null, '上传失败：文件名不合法', 400)
          return true
        }
        const dest = path.join(safeDir, cleanName)
        if (checkProtected(dest)) {
          res.json(null, `安全拦截：禁止上传或覆盖系统受保护文件 [${dest}]`, 403)
          return true
        }
        if (!allowOverwrite && lstatSafe(dest) !== null) {
          res.json(null, `同名文件 [${cleanName}] 已存在，为防止数据丢失已拒绝覆盖`, 409)
          return true
        }
        validated.push({ dest, cleanName, data: f.data })
      }

      let uploadedPath = ''
      for (const item of validated) {
        fs.writeFileSync(item.dest, item.data, { flag: allowOverwrite ? 'w' : 'wx' })
        uploadedPath = item.dest
        ctx.logOperation(ctx.currentUser(), '上传文件', item.dest)
      }
      res.json({ path: uploadedPath || safeDir, count: validated.length }, '文件上传成功')
      return true
    } catch (e) {
      if (e.code === 'EEXIST') {
        res.json(null, '同名文件已存在，已拒绝覆盖', 409)
        return true
      }
      res.json(null, `文件上传失败: ${e.message}`, 400)
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
    if (checkProtected(safePath)) {
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
        'Content-Length': stat.size,
        'Cache-Control': 'no-store'
      })
      if (req.method === 'HEAD') {
        res.end()
        return true
      }
      const stream = fs.createReadStream(safePath)
      stream.on('error', () => res.destroy())
      stream.pipe(res)
      ctx.logOperation(ctx.currentUser(), '下载文件', safePath)
      return true
    } catch (e) {
      res.json(null, e.message, 500)
      return true
    }
  }

  // 8. Rename (REV-002 & REV-006)
  if (pathname === '/api/v1/files/rename' && req.method === 'POST') {
    const body = await ctx.parseBody(req, res)
    if (!body?.old_path || !body?.new_path) {
      res.json(null, '缺少原路径或新路径参数', 400)
      return true
    }
    const oldPath = path.resolve(String(body.old_path))
    const newPath = path.resolve(String(body.new_path))
    if (checkProtected(oldPath) || checkProtected(newPath)) {
      res.json(null, '安全拦截：禁止重命名系统受保护路径', 403)
      return true
    }
    if (!lstatSafe(oldPath)) {
      res.json(null, '原文件或目录不存在', 404)
      return true
    }
    if (oldPath === newPath) {
      res.json(null, '新旧路径相同，无需重命名', 400)
      return true
    }
    if (lstatSafe(newPath) !== null && body.overwrite !== true) {
      res.json(null, `目标名称 [${path.basename(newPath)}] 已存在，为防止数据丢失已拒绝覆盖`, 409)
      return true
    }
    try {
      fs.renameSync(oldPath, newPath)
      ctx.logOperation(ctx.currentUser(), '重命名文件/目录', `${oldPath} -> ${newPath}`)
      res.json(null, '重命名成功')
      return true
    } catch (e) {
      res.json(null, e.message, 500)
      return true
    }
  }

  // 9. Compress (REV-001 & REV-011)
  if (pathname === '/api/v1/files/compress' && req.method === 'POST') {
    const body = await ctx.parseBody(req, res)
    const rawPaths = Array.isArray(body?.paths) ? body.paths : []
    const format = body?.format === 'zip' ? 'zip' : 'tar.gz'
    const defaultExt = format === 'zip' ? '.zip' : '.tar.gz'
    const rawTargetName = String(body?.target_name || `archive_${Date.now()}${defaultExt}`).trim()

    if (rawPaths.length === 0) {
      res.json(null, '请指定要压缩的文件或目录', 400)
      return true
    }
    if (
      !rawTargetName ||
      rawTargetName.startsWith('-') ||
      rawTargetName.includes('/') ||
      rawTargetName.includes('\\') ||
      rawTargetName.includes('..') ||
      rawTargetName.includes('\0')
    ) {
      res.json(null, '归档文件名不合法（禁止包含路径分隔符或以 - 开头）', 400)
      return true
    }

    const firstResolved = path.resolve(String(rawPaths[0]))
    const parentDir = path.dirname(firstResolved)
    const targetPath = path.join(parentDir, rawTargetName)
    if (checkProtected(parentDir) || checkProtected(targetPath)) {
      res.json(null, '安全拦截：压缩目标路径位于受保护区域！', 403)
      return true
    }

    const fileNames = []
    for (const p of rawPaths) {
      const fullP = path.resolve(parentDir, String(p))
      if (path.dirname(fullP) !== parentDir) {
        res.json(null, '待归档条目必须位于同一父目录下', 400)
        return true
      }
      const treeCheck = inspectTreeForArchive(fullP, checkProtected)
      if (!treeCheck.ok) {
        res.json(null, treeCheck.message, treeCheck.code || 403)
        return true
      }
      const base = path.basename(fullP)
      if (!base || base === '.' || base === '..') {
        res.json(null, '无效的待压缩文件名', 400)
        return true
      }
      fileNames.push(base)
    }

    try {
      // Prefix every operand with './' AND terminate options with '--' so filenames starting
      // with '-' (e.g. '--checkpoint=1') are never parsed as flags by tar or zip (REV-001).
      const safeOperands = fileNames.map(name => `./${name}`)
      const child = format === 'zip'
        ? spawnSync('zip', ['-r', targetPath, '--', ...safeOperands], { cwd: parentDir, encoding: 'utf-8', timeout: 120000 })
        : spawnSync('tar', ['-czf', targetPath, '--', ...safeOperands], { cwd: parentDir, encoding: 'utf-8', timeout: 120000 })
      if (child.error || child.status !== 0) {
        const reason = child.error ? child.error.message : ((child.stderr || '').trim() || `退出码 ${child.status}`)
        throw new Error(`压缩失败: ${reason}`)
      }
      ctx.logOperation(ctx.currentUser(), '压缩文件', targetPath)
      res.json({ target_path: targetPath }, '压缩完成')
      return true
    } catch (e) {
      try { if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath) } catch {}
      res.json(null, e.message, 500)
      return true
    }
  }

  // 10. Decompress (REV-011)
  if (pathname === '/api/v1/files/decompress' && req.method === 'POST') {
    const body = await ctx.parseBody(req, res)
    const archivePath = path.resolve(String(body?.path || ''))
    const destPath = path.resolve(String(body?.dest_path || path.dirname(archivePath)))
    if (checkProtected(archivePath) || checkProtected(destPath)) {
      res.json(null, '安全拦截：解压路径位于系统受保护区域！', 403)
      return true
    }
    if (!fs.existsSync(archivePath)) {
      res.json(null, '压缩包不存在', 404)
      return true
    }

    let stageDir = null
    try {
      fs.mkdirSync(destPath, { recursive: true })
      if (checkProtected(destPath)) {
        res.json(null, '安全拦截：解压目的目录不合法！', 403)
        return true
      }

      // Extract to an isolated staging directory first so we can inspect members (REV-011)
      stageDir = fs.mkdtempSync(path.join(destPath, '.ag_unpack_'))
      const child = archivePath.endsWith('.zip')
        ? spawnSync('unzip', ['-q', archivePath, '-d', stageDir], { encoding: 'utf-8', timeout: 120000 })
        : spawnSync('tar', ['--no-same-owner', '--no-same-permissions', '-xzf', archivePath, '-C', stageDir], { encoding: 'utf-8', timeout: 120000 })

      if (child.error || child.status !== 0) {
        const reason = child.error ? child.error.message : ((child.stderr || '').trim() || `退出码 ${child.status}`)
        throw new Error(`解压失败: ${reason}`)
      }

      const treeCheck = inspectTreeForArchive(stageDir, checkProtected)
      if (!treeCheck.ok) {
        res.json(null, `安全拦截：压缩包内包含受保护敏感文件或越界符号链接 (${treeCheck.message})，已中止解压！`, 403)
        return true
      }

      const extractedEntries = fs.readdirSync(stageDir)
      for (const name of extractedEntries) {
        const destEntry = path.join(destPath, name)
        if (checkProtected(destEntry)) {
          res.json(null, `安全拦截：禁止解压覆盖受保护文件 [${destEntry}]`, 403)
          return true
        }
        if (lstatSafe(destEntry) !== null && body?.overwrite !== true) {
          res.json(null, `解压冲突：目标文件或目录 [${name}] 已存在，已拒绝覆盖`, 409)
          return true
        }
      }

      for (const name of extractedEntries) {
        const srcEntry = path.join(stageDir, name)
        const destEntry = path.join(destPath, name)
        if (body?.overwrite === true && lstatSafe(destEntry) !== null) {
          fs.rmSync(destEntry, { recursive: true, force: true })
        }
        fs.renameSync(srcEntry, destEntry)
      }

      ctx.logOperation(ctx.currentUser(), '解压文件', `${archivePath} -> ${destPath}`)
      res.json(null, '解压完成')
      return true
    } catch (e) {
      res.json(null, e.message, 500)
      return true
    } finally {
      if (stageDir && fs.existsSync(stageDir)) {
        try { fs.rmSync(stageDir, { recursive: true, force: true }) } catch {}
      }
    }
  }

  return false
}
