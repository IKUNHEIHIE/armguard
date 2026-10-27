import { execFile } from 'child_process'

/**
 * 非阻塞子进程执行器（AG-PERF-01）。
 *
 * 背景：后端大量使用 `spawnSync` 调用 apt / tar / docker / certbot 等外部命令，
 * 单次最长超时 180 秒。`spawnSync` 会把整个 Node 事件循环阻塞住，意味着
 * 期间面板的 HTTP 接口全部无响应、WebSocket 遥测停推、心跳超时断开。
 * 长时间操作（拉镜像、装软件、打包备份）必须走异步执行，让事件循环继续服务其他请求。
 *
 * 返回结构与 spawnSync 对齐（status / stdout / stderr / error），
 * 便于调用点最小改动迁移。
 */
export function execFileAsync(command, args = [], options = {}) {
  return new Promise(resolve => {
    const opts = {
      encoding: 'utf-8',
      timeout: options.timeout ?? 30000,
      maxBuffer: options.maxBuffer ?? 16 * 1024 * 1024,
      windowsHide: true,
      ...options
    }
    execFile(command, args, opts, (error, stdout, stderr) => {
      let status = 0
      let spawnError = null
      if (error) {
        if (typeof error.code === 'number') {
          // 命令执行完成但退出码非零
          status = error.code
        } else {
          // 启动失败（ENOENT）、超时（ETIMEDOUT）、被信号杀死等
          spawnError = error
          status = null
        }
      }
      resolve({
        status,
        stdout: stdout ?? '',
        stderr: stderr ?? '',
        error: spawnError,
        timedOut: Boolean(error && error.killed && error.signal === 'SIGTERM')
      })
    })
  })
}

/**
 * tar 专用包装。
 *
 * Windows 上 GNU tar 会把 `C:\path` 里的盘符当成远程主机（"Cannot connect to C:"），
 * 需要 `--force-local`；而 bsdtar 不认识该选项。这里按平台试探并回退，
 * 保证 Windows 开发机与 ARM Linux 生产机行为一致。
 */
export async function tarExec(args, options = {}) {
  const prefix = process.platform === 'win32' ? ['--force-local'] : []
  if (prefix.length) {
    const withFlag = await execFileAsync('tar', [...prefix, ...args], options)
    if (!(withFlag.error && withFlag.error.code === 'ENOENT') && !/unrecognized option|illegal option/i.test(withFlag.stderr || '')) {
      return withFlag
    }
  }
  return execFileAsync('tar', args, options)
}

/**
 * 需要成功结果的场景：非零退出或启动失败时抛出带可读信息的 Error。
 * `tolerate` 允许把特定 (status, stderr) 视为成功，例如 GNU tar 的
 * "file changed as we read it"（退出码 1，归档依然有效）。
 */
export async function runOrThrow(command, args = [], options = {}) {
  const tolerate = options.tolerate
  const result = await execFileAsync(command, args, options)
  if (result.error) {
    const code = result.error.code
    if (code === 'ENOENT') {
      throw new Error(`系统未安装 ${command}`)
    }
    if (code === 'ETIMEDOUT' || result.timedOut) {
      throw new Error(`${command} 执行超时（${options.timeout ?? 30000}ms）`)
    }
    throw new Error(result.error.message)
  }
  if (result.status !== 0) {
    if (typeof tolerate === 'function' && tolerate(result)) {
      return result
    }
    const detail = (result.stderr || '').trim() || `退出码 ${result.status}`
    throw new Error(`${command} 执行失败: ${detail}`)
  }
  return result
}
