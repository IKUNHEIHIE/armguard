<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-bold text-white tracking-tight">计划任务 (Crontab)</h2>
        <p class="text-xs text-slate-400 font-mono">定时执行 Shell 脚本、数据库自动备份与日志切割任务</p>
      </div>
      <button
        @click="showCreateModal = true"
        class="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold text-xs transition shadow-lg shadow-brand-500/20"
      >
        <Plus class="w-4 h-4" />
        添加任务
      </button>
    </div>

    <!-- Task List -->
    <div class="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs font-mono">
          <thead>
            <tr class="bg-slate-950/60 text-slate-400 border-b border-slate-800">
              <th class="py-3.5 px-4 font-semibold">任务名称</th>
              <th class="py-3.5 px-4 font-semibold">Cron 执行周期</th>
              <th class="py-3.5 px-4 font-semibold">执行命令 / 脚本</th>
              <th class="py-3.5 px-4 font-semibold">上次运行状态</th>
              <th class="py-3.5 px-4 font-semibold text-right">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/60">
            <tr v-for="job in jobs" :key="job.id" class="hover:bg-slate-800/30 transition">
              <td class="py-3.5 px-4 font-bold text-slate-100 flex items-center gap-2">
                <Clock class="w-3.5 h-3.5 text-brand-400" />
                {{ job.name }}
              </td>
              <td class="py-3.5 px-4">
                <span class="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-cyan-400 font-bold">
                  {{ job.schedule }}
                </span>
              </td>
              <td class="py-3.5 px-4 text-slate-300 truncate max-w-xs" :title="job.command">
                {{ job.command }}
              </td>
              <td class="py-3.5 px-4">
                <span v-if="job.last_run_status === 'success'" class="inline-flex items-center gap-1.5 text-emerald-400">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  成功 (耗时 {{ job.last_run_duration_ms || 0 }}ms)
                </span>
                <span v-else-if="job.last_run_status === 'failed'" class="inline-flex items-center gap-1.5 text-rose-400">
                  <span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
                  失败 (耗时 {{ job.last_run_duration_ms || 0 }}ms)
                </span>
                <span v-else class="inline-flex items-center gap-1.5 text-slate-500">
                  <span class="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                  未运行
                </span>
                <div v-if="job.last_run_at" class="text-[10px] text-slate-500 mt-0.5">{{ job.last_run_at }}</div>
              </td>
              <td class="py-3.5 px-4 text-right">
                <div class="inline-flex items-center gap-2">
                  <button
                    @click="runJobNow(job)"
                    title="立即执行一次"
                    class="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-emerald-300"
                  >
                    <Play class="w-3.5 h-3.5" />
                  </button>
                  <button
                    @click="openEditModal(job)"
                    title="编辑任务"
                    class="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300"
                  >
                    <Edit2 class="w-3.5 h-3.5" />
                  </button>
                  <button
                    @click="deleteJob(job)"
                    title="删除任务"
                    class="p-1.5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Create Modal -->
    <Modal v-model="showCreateModal" title="添加计划任务" size="md">
      <form @submit.prevent="handleCreateJob" class="space-y-4 font-mono text-xs">
        <div>
          <label class="block text-slate-300 font-semibold mb-1">任务名称</label>
          <input
            v-model="jobForm.name"
            type="text"
            required
            placeholder="每日数据库备份"
            class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
          />
        </div>

        <div>
          <label class="block text-slate-300 font-semibold mb-1">Cron 表达式 (分 时 日 月 周)</label>
          <input
            v-model="jobForm.schedule"
            type="text"
            required
            placeholder="0 3 * * *"
            class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-cyan-300 font-bold focus:outline-none focus:border-brand-500"
          />
          <span class="text-[11px] text-slate-500 mt-1 block">示例: 0 3 * * * 表示每天凌晨 3:00 执行</span>
        </div>

        <div>
          <label class="block text-slate-300 font-semibold mb-1">Shell 执行命令</label>
          <textarea
            v-model="jobForm.command"
            rows="3"
            required
            placeholder="/opt/armguard/scripts/backup_all.sh"
            class="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white focus:outline-none focus:border-brand-500"
          ></textarea>
        </div>

        <div class="pt-3 flex justify-end gap-3">
          <button type="button" @click="showCreateModal = false" class="px-4 py-2 rounded-xl bg-slate-800 text-slate-300">取消</button>
          <button type="submit" class="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold">创建任务</button>
        </div>
      </form>
    </Modal>

    <!-- Edit Modal -->
    <Modal v-model="showEditModal" title="编辑计划任务" size="md">
      <form @submit.prevent="handleUpdateJob" class="space-y-4 font-mono text-xs">
        <div>
          <label class="block text-slate-300 font-semibold mb-1">任务名称</label>
          <input
            v-model="editForm.name"
            type="text"
            required
            placeholder="每日数据库备份"
            class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
          />
        </div>

        <div>
          <label class="block text-slate-300 font-semibold mb-1">Cron 表达式 (分 时 日 月 周)</label>
          <input
            v-model="editForm.schedule"
            type="text"
            required
            placeholder="0 3 * * *"
            class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-cyan-300 font-bold focus:outline-none focus:border-brand-500"
          />
          <span class="text-[11px] text-slate-500 mt-1 block">示例: 0 3 * * * 表示每天凌晨 3:00 执行</span>
        </div>

        <div>
          <label class="block text-slate-300 font-semibold mb-1">Shell 执行命令</label>
          <textarea
            v-model="editForm.command"
            rows="3"
            required
            placeholder="/opt/armguard/scripts/backup_all.sh"
            class="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white focus:outline-none focus:border-brand-500"
          ></textarea>
        </div>

        <div class="pt-3 flex justify-end gap-3">
          <button type="button" @click="showEditModal = false" class="px-4 py-2 rounded-xl bg-slate-800 text-slate-300">取消</button>
          <button type="submit" class="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold">保存修改</button>
        </div>
      </form>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { Plus, Clock, Play, Trash2, Edit2 } from 'lucide-vue-next'
import Modal from '@/components/Modal.vue'
import { CronJobItem, crontabApi } from '@/api/crontab'
import { toast } from '@/composables/useToast'

const showCreateModal = ref(false)
const showEditModal = ref(false)
const editingJobId = ref<number | null>(null)

const jobs = ref<CronJobItem[]>([])

const jobForm = reactive({
  name: '',
  schedule: '0 3 * * *',
  command: ''
})

const editForm = reactive({
  name: '',
  schedule: '',
  command: ''
})

async function loadJobs() {
  try {
    const res = await crontabApi.getList()
    if (res.data && res.data.data) {
      jobs.value = res.data.data.list
    }
  } catch (err: any) {
    console.error('Failed to load crontab:', err)
  }
}

async function handleCreateJob() {
  try {
    await crontabApi.create({
      name: jobForm.name,
      schedule: jobForm.schedule,
      command: jobForm.command
    })
    showCreateModal.value = false
    jobForm.name = ''
    jobForm.command = ''
    await loadJobs()
    toast.success('计划任务已添加并同步至 Linux 系统 Crontab！')
  } catch (e: any) {
    toast.error(`创建失败: ${e.message}`)
  }
}

function openEditModal(job: CronJobItem) {
  editingJobId.value = job.id
  editForm.name = job.name
  editForm.schedule = job.schedule
  editForm.command = job.command
  showEditModal.value = true
}

async function handleUpdateJob() {
  if (!editingJobId.value) return
  try {
    await crontabApi.update(editingJobId.value, {
      name: editForm.name,
      schedule: editForm.schedule,
      command: editForm.command
    })
    showEditModal.value = false
    await loadJobs()
    toast.success('计划任务更新成功并已同步至系统 Crontab！')
  } catch (e: any) {
    toast.error(`修改失败: ${e.message}`)
  }
}

async function runJobNow(job: CronJobItem) {
  try {
    const res = await crontabApi.runOnce(job.id)
    await loadJobs()
    toast.success(`任务 [${job.name}] 执行完成！${res.data?.data?.output ? '输出: ' + res.data.data.output : ''}`)
  } catch (e: any) {
    await loadJobs()
    toast.error(`执行失败: ${e.message}`)
  }
}

async function deleteJob(job: CronJobItem) {
  if (confirm(`确定要从系统 Crontab 中删除计划任务 [${job.name}] 吗？`)) {
    try {
      await crontabApi.delete(job.id)
      await loadJobs()
      toast.success(`计划任务 [${job.name}] 已删除！`)
    } catch (e: any) {
      toast.error(`删除失败: ${e.message}`)
    }
  }
}

onMounted(() => {
  loadJobs()
})
</script>
