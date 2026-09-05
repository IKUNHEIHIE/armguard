import { spawnSync, exec } from 'child_process'

export function syncCrontabToSystem(crontabs) {
  try {
    const lines = []
    for (const job of crontabs) {
      if (job.status === 'enabled') {
        const cleanSched = (job.schedule || '* * * * *').trim()
        const cleanCmd = (job.command || '').replace(/\r|\n/g, '')
        lines.push(`# AG_CRON_${job.id}: ${job.name}`)
        lines.push(`${cleanSched} ${cleanCmd}`)
      }
    }
    const crontabContent = lines.join('\n') + (lines.length > 0 ? '\n' : '')
    spawnSync('crontab', ['-'], { input: crontabContent, encoding: 'utf-8' })
    return true
  } catch (err) {
    console.error('Failed to sync crontab:', err)
    return false
  }
}

export async function handleCrontabs(pathname, req, res, url, ctx) {
  if (!pathname.startsWith('/api/v1/crontabs')) return false

  if (pathname === '/api/v1/crontabs') {
    if (req.method === 'GET') {
      res.json({ list: ctx.crontabs })
      return true
    }
    if (req.method === 'POST') {
      const body = await ctx.parseBody(req, res)
      try {
        const cleanSched = (body.schedule || '0 3 * * *').trim()
        const cleanCmd = (body.command || '').replace(/\r|\n/g, '')
        const newJob = {
          id: Date.now(),
          name: body.name || '未命名任务',
          schedule: cleanSched,
          command: cleanCmd,
          status: body.status || 'enabled',
          last_run_at: null,
          last_run_status: null,
          last_run_duration_ms: null,
          created_at: new Date().toLocaleString()
        }
        ctx.crontabs.unshift(newJob)
        syncCrontabToSystem(ctx.crontabs)
        ctx.saveJSON(ctx.CRONTAB_FILE, ctx.crontabs)
        ctx.logOperation('admin', '创建计划任务', newJob.name)
        res.json(newJob, '计划任务已成功添加并同步至系统')
        return true
      } catch (e) {
        res.json(null, e.message, 500)
        return true
      }
    }
  }

  const idMatch = pathname.match(/^\/api\/v1\/crontabs\/(\d+)$/)
  if (idMatch) {
    const id = parseInt(idMatch[1], 10)
    if (req.method === 'PUT') {
      const body = await ctx.parseBody(req, res)
      const job = ctx.crontabs.find(j => j.id === id)
      if (!job) {
        res.json(null, '未找到对应计划任务', 404)
        return true
      }
      if (body.name !== undefined) job.name = body.name
      if (body.schedule !== undefined) job.schedule = body.schedule.trim()
      if (body.command !== undefined) job.command = body.command.replace(/\r|\n/g, '')
      if (body.status !== undefined) job.status = body.status
      syncCrontabToSystem(ctx.crontabs)
      ctx.saveJSON(ctx.CRONTAB_FILE, ctx.crontabs)
      ctx.logOperation('admin', '更新计划任务', job.name)
      res.json(job, '计划任务已更新')
      return true
    }
    if (req.method === 'DELETE') {
      const idx = ctx.crontabs.findIndex(j => j.id === id)
      if (idx === -1) {
        res.json(null, '未找到对应计划任务', 404)
        return true
      }
      const removed = ctx.crontabs.splice(idx, 1)[0]
      syncCrontabToSystem(ctx.crontabs)
      ctx.saveJSON(ctx.CRONTAB_FILE, ctx.crontabs)
      ctx.logOperation('admin', '删除计划任务', removed.name)
      res.json(null, `计划任务 [${removed.name}] 已删除`)
      return true
    }
  }

  const runOnceMatch = pathname.match(/^\/api\/v1\/crontabs\/(\d+)\/run-once$/)
  if (runOnceMatch && req.method === 'POST') {
    const id = parseInt(runOnceMatch[1], 10)
    const job = ctx.crontabs.find(j => j.id === id)
    let cmd = job?.command
    if (!cmd) {
      try {
        const child = spawnSync('crontab', ['-l'], { encoding: 'utf-8' })
        const lines = (child.stdout || '').trim().split('\n').filter(l => l && !l.startsWith('#'))
        const target = lines[id - 1]
        if (target) {
          cmd = target.split(/\s+/).slice(5).join(' ')
        }
      } catch {}
    }
    if (!cmd) {
      res.json(null, '未找到对应计划任务或命令为空', 404)
      return true
    }

    const startTime = Date.now()
    exec(cmd, { timeout: 30000, maxBuffer: 5 * 1024 * 1024 }, (err, stdout, stderr) => {
      const duration = Date.now() - startTime
      const output = stdout || stderr || (err ? err.message : '执行完成（无标准输出）')
      const isSuccess = !err
      if (job) {
        job.last_run_at = new Date().toLocaleString()
        job.last_run_status = isSuccess ? 'success' : 'failed'
        job.last_run_duration_ms = duration
        ctx.saveJSON(ctx.CRONTAB_FILE, ctx.crontabs)
      }
      ctx.logOperation('admin', '手动执行计划任务', job?.name || cmd, '127.0.0.1', isSuccess ? 'success' : 'failed')
      if (isSuccess) {
        res.json({ output, duration_ms: duration, status: 'success' }, '执行成功')
      } else {
        res.json({ output, duration_ms: duration, status: 'failed' }, '执行失败', 500)
      }
    })
    return true
  }

  const historyMatch = pathname.match(/^\/api\/v1\/crontabs\/(\d+)\/history$/)
  if (historyMatch && req.method === 'GET') {
    const id = parseInt(historyMatch[1], 10)
    const job = ctx.crontabs.find(j => j.id === id)
    const list = job && job.last_run_at ? [{
      id: Date.now(),
      cron_id: id,
      status: job.last_run_status || 'success',
      output: '最近一次执行记录',
      duration_ms: job.last_run_duration_ms || 10,
      run_at: job.last_run_at
    }] : []
    res.json({ list })
    return true
  }

  return false
}
