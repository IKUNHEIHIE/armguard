import { Injectable, computed, inject, signal } from '@angular/core'
import { appStoreApi } from '@/api/appstore'
import { ToastService } from './toast.service'

export type AgTaskStage = 'installing' | 'running' | 'done' | 'failed' | 'unknown'

export interface AgTaskItem {
  id: string
  type: 'app_install' | 'docker_pull' | 'backup' | 'other'
  title: string
  targetKey: string
  stage: AgTaskStage
  progressPercent: number
  logTail: string
  logs: string[]
  errorMessage?: string
  startedAt: number
  finishedAt?: number
  viewRoute?: string
  viewLabel?: string
}

const STORAGE_KEY = 'armguard_tasks_v1'

@Injectable({ providedIn: 'root' })
export class TaskCenterService {
  private toast = inject(ToastService)

  readonly tasks = signal<AgTaskItem[]>(this.loadFromStorage())
  readonly drawerOpen = signal<boolean>(false)

  readonly activeTasks = computed(() =>
    this.tasks().filter((t) => t.stage === 'installing' || t.stage === 'running')
  )
  readonly activeCount = computed(() => this.activeTasks().length)
  readonly latestTask = computed(() => this.tasks()[0] || null)

  private pollTimers = new Map<string, ReturnType<typeof setInterval>>()
  private onCompleteListeners = new Set<(task: AgTaskItem) => void>()

  constructor() {
    // Resume polling for any active app_install tasks restored from sessionStorage
    for (const t of this.tasks()) {
      if (t.type === 'app_install' && (t.stage === 'installing' || t.stage === 'running')) {
        this.startAppTaskPolling(t.id, t.targetKey, t.title)
      }
    }
  }

  onTaskComplete(fn: (task: AgTaskItem) => void): () => void {
    this.onCompleteListeners.add(fn)
    return () => this.onCompleteListeners.delete(fn)
  }

  private notifyComplete(task: AgTaskItem) {
    for (const fn of this.onCompleteListeners) {
      try {
        fn(task)
      } catch {}
    }
  }

  private loadFromStorage(): AgTaskItem[] {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.slice(0, 25) : []
    } catch {
      return []
    }
  }

  private saveToStorage() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.tasks().slice(0, 25)))
    } catch {}
  }

  private upsertTask(updated: AgTaskItem) {
    this.tasks.update((list) => {
      const idx = list.findIndex((item) => item.id === updated.id)
      if (idx >= 0) {
        const next = [...list]
        next[idx] = updated
        return next
      }
      return [updated, ...list].slice(0, 25)
    })
    this.saveToStorage()
  }

  async syncServerAppTasks() {
    try {
      const res = await appStoreApi.getTasks()
      const serverList = res.data?.data?.list || []
      for (const st of serverList) {
        if (!st || !st.task_id) continue
        const existing = this.tasks().find((t) => t.id === st.task_id)
        const stage: AgTaskStage =
          st.stage === 'done'
            ? 'done'
            : st.stage === 'failed'
              ? 'failed'
              : st.stage === 'unknown'
                ? 'unknown'
                : 'installing'
        const item: AgTaskItem = {
          id: st.task_id,
          type: 'app_install',
          title: existing?.title || `安装软件 (${st.app_key})`,
          targetKey: st.app_key,
          stage,
          progressPercent: st.progress_percent ?? (stage === 'done' ? 100 : 20),
          logTail: st.log_tail || '',
          logs: st.logs || existing?.logs || [],
          errorMessage: st.error_message,
          startedAt: existing?.startedAt || Date.now(),
          finishedAt: stage === 'installing' ? undefined : existing?.finishedAt || Date.now(),
          viewRoute: '/appstore',
          viewLabel: '前往软件商店',
        }
        this.upsertTask(item)
        if (stage === 'installing' && !this.pollTimers.has(st.task_id)) {
          this.startAppTaskPolling(st.task_id, st.app_key, item.title)
        }
      }
    } catch {}
  }

  isAppInstalling(appKey: string): boolean {
    return this.tasks().some(
      (t) =>
        t.type === 'app_install' &&
        t.targetKey === appKey &&
        (t.stage === 'installing' || t.stage === 'running')
    )
  }

  hasActiveAptTask(): boolean {
    return this.tasks().some(
      (t) => t.type === 'app_install' && (t.stage === 'installing' || t.stage === 'running')
    )
  }

  trackAppInstall(taskId: string, appKey: string, appName: string) {
    const task: AgTaskItem = {
      id: taskId,
      type: 'app_install',
      title: `安装 ${appName}`,
      targetKey: appKey,
      stage: 'installing',
      progressPercent: 20,
      logTail: `正在调用 APT 安装 ${appName}...`,
      logs: [`[armguard-pkg] 已创建安装任务 ${taskId} (${appKey})...`],
      startedAt: Date.now(),
      viewRoute: '/appstore',
      viewLabel: '查看已装软件',
    }
    this.upsertTask(task)
    this.startAppTaskPolling(taskId, appKey, task.title)
  }

  /** 卸载任务：与安装共用同一套轮询与任务中心展示 */
  trackAppUninstall(taskId: string, appKey: string, appName: string) {
    const task: AgTaskItem = {
      id: taskId,
      type: 'app_install',
      title: `卸载 ${appName}`,
      targetKey: appKey,
      stage: 'installing',
      progressPercent: 10,
      logTail: `正在停止服务并卸载 ${appName}...`,
      logs: [`[armguard-pkg] 已创建卸载任务 ${taskId} (${appKey})...`],
      startedAt: Date.now(),
      viewRoute: '/appstore',
      viewLabel: '查看软件商店',
    }
    this.upsertTask(task)
    this.startAppTaskPolling(taskId, appKey, task.title)
  }

  private startAppTaskPolling(taskId: string, appKey: string, title: string) {
    this.stopTimer(taskId)
    const timer = setInterval(async () => {
      // Skip polling while browser tab is hidden to save resources (FE-016)
      if (typeof document !== 'undefined' && document.hidden) return
      try {
        const res = await appStoreApi.getTaskProgress(appKey, taskId)
        const d = res.data?.data
        if (!d) return
        const current = this.tasks().find((t) => t.id === taskId)
        const stage: AgTaskStage =
          d.stage === 'done'
            ? 'done'
            : d.stage === 'failed'
              ? 'failed'
              : d.stage === 'unknown'
                ? 'unknown'
                : 'installing'
        const updated: AgTaskItem = {
          id: taskId,
          type: 'app_install',
          title,
          targetKey: appKey,
          stage,
          progressPercent: d.progress_percent ?? current?.progressPercent ?? 50,
          logTail: d.log_tail || current?.logTail || '',
          logs: d.logs || current?.logs || [],
          errorMessage: d.error_message,
          startedAt: current?.startedAt || Date.now(),
          finishedAt: stage === 'installing' ? undefined : Date.now(),
          viewRoute: '/appstore',
          viewLabel: '查看软件商店',
        }
        this.upsertTask(updated)

        if (stage === 'done') {
          this.stopTimer(taskId)
          this.toast.success(`${title} 已完成`)
          this.notifyComplete(updated)
        } else if (stage === 'failed' || stage === 'unknown') {
          this.stopTimer(taskId)
          this.toast.error(d.error_message || d.log_tail || `${title} 未能完成`)
          this.notifyComplete(updated)
        }
      } catch (e: any) {
        this.stopTimer(taskId)
        const current = this.tasks().find((t) => t.id === taskId)
        if (current) {
          const updated: AgTaskItem = {
            ...current,
            stage: 'unknown',
            logTail: e.message || '安装任务状态未知或已中断',
            errorMessage: e.message || '无法获取任务状态，后台任务可能已中断',
            finishedAt: Date.now(),
          }
          this.upsertTask(updated)
          this.notifyComplete(updated)
        }
      }
    }, 1500)
    this.pollTimers.set(taskId, timer)
  }

  async runTrackedTask<T>(options: {
    type: 'docker_pull' | 'backup' | 'other'
    title: string
    targetKey: string
    initialLog: string
    viewRoute?: string
    viewLabel?: string
    executor: () => Promise<{ summary?: string; logs?: string[]; result: T }>
  }): Promise<T> {
    const id = `${options.type}_${Date.now()}`
    const task: AgTaskItem = {
      id,
      type: options.type,
      title: options.title,
      targetKey: options.targetKey,
      stage: 'running',
      progressPercent: 35,
      logTail: options.initialLog,
      logs: [options.initialLog],
      startedAt: Date.now(),
      viewRoute: options.viewRoute,
      viewLabel: options.viewLabel,
    }
    this.upsertTask(task)

    try {
      const out = await options.executor()
      const doneTask: AgTaskItem = {
        ...task,
        stage: 'done',
        progressPercent: 100,
        logTail: out.summary || `${options.title} 执行成功`,
        logs: out.logs?.length ? out.logs : [...task.logs, out.summary || '操作完成'],
        finishedAt: Date.now(),
      }
      this.upsertTask(doneTask)
      this.notifyComplete(doneTask)
      return out.result
    } catch (e: any) {
      const msg = e?.message || '操作执行失败'
      const failedTask: AgTaskItem = {
        ...task,
        stage: 'failed',
        progressPercent: 100,
        logTail: msg,
        logs: [...task.logs, `[ERROR] ${msg}`],
        errorMessage: msg,
        finishedAt: Date.now(),
      }
      this.upsertTask(failedTask)
      this.notifyComplete(failedTask)
      throw e
    }
  }

  removeTask(id: string) {
    this.stopTimer(id)
    this.tasks.update((list) => list.filter((t) => t.id !== id))
    this.saveToStorage()
  }

  clearFinished() {
    this.tasks.update((list) =>
      list.filter((t) => t.stage === 'installing' || t.stage === 'running')
    )
    this.saveToStorage()
  }

  private stopTimer(id: string) {
    const t = this.pollTimers.get(id)
    if (t) {
      clearInterval(t)
      this.pollTimers.delete(id)
    }
  }
}
