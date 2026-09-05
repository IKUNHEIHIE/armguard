<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-bold text-white tracking-tight">数据库管理</h2>
        <p class="text-xs text-slate-400 font-mono">管理 MySQL / MariaDB / PostgreSQL / SQLite / Redis，支持一键备份与在线 SQL 执行</p>
      </div>
      <button
        @click="showCreateModal = true"
        class="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold text-xs transition shadow-lg shadow-brand-500/20"
      >
        <Plus class="w-4 h-4" />
        新建数据库
      </button>
    </div>

    <!-- Database List -->
    <div class="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs font-mono">
          <thead>
            <tr class="bg-slate-950/60 text-slate-400 border-b border-slate-800">
              <th class="py-3.5 px-4 font-semibold">类型</th>
              <th class="py-3.5 px-4 font-semibold">数据库名</th>
              <th class="py-3.5 px-4 font-semibold">用户名 / 权限</th>
              <th class="py-3.5 px-4 font-semibold">字符集</th>
              <th class="py-3.5 px-4 font-semibold">数据大小</th>
              <th class="py-3.5 px-4 font-semibold">备份记录</th>
              <th class="py-3.5 px-4 font-semibold text-right">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/60">
            <tr v-for="db in databases" :key="db.id" class="hover:bg-slate-800/30 transition group">
              <!-- Type -->
              <td class="py-3.5 px-4">
                <span class="px-2.5 py-1 rounded-lg text-[11px] font-bold border" :class="getTypeBadge(db.type)">
                  {{ db.type.toUpperCase() }}
                </span>
              </td>

              <!-- Name -->
              <td class="py-3.5 px-4 font-bold text-slate-100 flex items-center gap-1.5">
                <Database class="w-3.5 h-3.5 text-cyan-400" />
                {{ db.db_name }}
              </td>

              <!-- User -->
              <td class="py-3.5 px-4 text-slate-300">
                <span class="px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                  {{ db.username }}
                </span>
              </td>

              <!-- Charset -->
              <td class="py-3.5 px-4 text-slate-400">{{ db.character_set }}</td>

              <!-- Size -->
              <td class="py-3.5 px-4 text-emerald-400 font-semibold">{{ formatBytes(db.size_bytes) }}</td>

              <!-- Backup -->
              <td class="py-3.5 px-4">
                <button
                  @click="openBackupModal(db)"
                  class="text-xs text-brand-400 hover:underline flex items-center gap-1"
                >
                  <Archive class="w-3.5 h-3.5" />
                  {{ db.backup_count }} 份备份
                </button>
              </td>

              <!-- Actions -->
              <td class="py-3.5 px-4 text-right">
                <div class="inline-flex items-center gap-2">
                  <button
                    @click="openQueryModal(db)"
                    title="在线 SQL / 管理"
                    class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 transition"
                  >
                    <Terminal class="w-3.5 h-3.5" />
                  </button>
                  <button
                    @click="instantBackup(db)"
                    title="立即备份"
                    class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 transition"
                  >
                    <Download class="w-3.5 h-3.5" />
                  </button>
                  <button
                    @click="deleteDatabase(db)"
                    title="删除数据库"
                    class="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition"
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
    <Modal v-model="showCreateModal" title="新建数据库实例" size="md">
      <form @submit.prevent="handleCreateDatabase" class="space-y-4 font-mono text-xs">
        <div>
          <label class="block text-slate-300 font-semibold mb-1">数据库类型</label>
          <select
            v-model="createForm.type"
            class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
          >
            <option value="mysql">MySQL 8.0 / 8.4</option>
            <option value="mariadb">MariaDB (ARM 推荐低开销)</option>
            <option value="sqlite">SQLite 3 (单文件轻量)</option>
            <option value="postgresql">PostgreSQL 16</option>
            <option value="redis">Redis 7 (内存数据库)</option>
          </select>
        </div>

        <div>
          <label class="block text-slate-300 font-semibold mb-1">数据库名</label>
          <input
            v-model="createForm.db_name"
            type="text"
            required
            placeholder="app_db"
            class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
          />
        </div>

        <div v-if="createForm.type !== 'sqlite'">
          <label class="block text-slate-300 font-semibold mb-1">数据库用户名</label>
          <input
            v-model="createForm.username"
            type="text"
            placeholder="app_user"
            class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
          />
        </div>

        <div v-if="createForm.type !== 'sqlite'">
          <label class="block text-slate-300 font-semibold mb-1">访问密码</label>
          <input
            v-model="createForm.password"
            type="password"
            placeholder="自动生成或手动设置密码"
            class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
          />
        </div>

        <div class="pt-4 flex justify-end gap-3">
          <button
            type="button"
            @click="showCreateModal = false"
            class="px-4 py-2 rounded-xl bg-slate-800 text-slate-300"
          >
            取消
          </button>
          <button
            type="submit"
            class="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold"
          >
            立即创建
          </button>
        </div>
      </form>
    </Modal>

    <!-- Online SQL Query Modal -->
    <Modal v-model="showQueryModal" :title="`在线 SQL 执行器: ${activeDb?.db_name}`" size="xl">
      <div class="space-y-4 font-mono text-xs">
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-slate-400">输入 SQL 命令 (谨慎执行写操作)</span>
            <span v-if="queryExecutionTime" class="text-emerald-400">执行耗时: {{ queryExecutionTime }}ms</span>
          </div>
          <textarea
            v-model="sqlQuery"
            rows="5"
            placeholder="SELECT * FROM users LIMIT 10;"
            class="w-full bg-slate-950 text-cyan-300 p-3 rounded-xl border border-slate-700 focus:outline-none focus:border-cyan-500"
          ></textarea>
        </div>

        <div class="flex justify-between items-center">
          <span class="text-slate-500 text-[11px]">快捷执行: Ctrl+Enter</span>
          <button
            @click="runQuery"
            :disabled="runningQuery"
            class="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition flex items-center gap-2"
          >
            <Play class="w-3.5 h-3.5" />
            执行查询
          </button>
        </div>

        <!-- Query Result Table -->
        <div v-if="queryResults" class="p-3 bg-slate-950 rounded-xl border border-slate-800 max-h-60 overflow-auto">
          <table class="w-full text-left">
            <thead>
              <tr class="text-slate-400 border-b border-slate-800">
                <th v-for="col in queryResults.columns" :key="col" class="p-2">{{ col }}</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/40 text-slate-200">
              <tr v-for="(row, idx) in queryResults.rows" :key="idx" class="hover:bg-slate-900/50">
                <td v-for="(cell, cidx) in row" :key="cidx" class="p-2">{{ cell }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </Modal>

    <!-- Backup Management Modal -->
    <Modal v-model="showBackupModal" :title="`备份管理: ${activeDb?.db_name}`" size="lg">
      <div class="space-y-4 font-mono text-xs">
        <div class="flex items-center justify-between pb-2 border-b border-slate-800">
          <div>
            <span class="text-slate-400">所属实例: </span>
            <span class="text-white font-bold">{{ activeDb?.db_name }}</span>
            <span class="text-slate-500 ml-2">({{ activeDb?.type?.toUpperCase() }})</span>
          </div>
          <button
            @click="createBackupForActiveDb"
            :disabled="creatingBackup"
            class="px-3.5 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold transition flex items-center gap-1.5"
          >
            <Download class="w-3.5 h-3.5" />
            <span>{{ creatingBackup ? '正在备份...' : '立即生成新备份' }}</span>
          </button>
        </div>

        <div v-if="loadingBackups" class="p-6 text-center text-slate-500">
          加载备份列表中...
        </div>
        <div v-else-if="backupList.length === 0" class="p-8 text-center text-slate-500 bg-slate-950 rounded-xl border border-slate-800">
          暂无历史备份，点击右上角「立即生成新备份」即可快速创建归档。
        </div>
        <div v-else class="max-h-72 overflow-y-auto space-y-2">
          <div
            v-for="b in backupList"
            :key="b.file_name"
            class="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800"
          >
            <div class="flex items-center gap-2.5">
              <Archive class="w-4 h-4 text-brand-400 shrink-0" />
              <div>
                <div class="text-slate-200 font-bold">{{ b.file_name }}</div>
                <div class="text-[10px] text-slate-500 mt-0.5">
                  生成时间: {{ b.created_at }} | 大小: {{ formatBytes(b.file_size_bytes) }}
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button
                @click="downloadBackup(b.file_name)"
                title="下载备份"
                class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 transition"
              >
                下载
              </button>
              <button
                @click="deleteBackupRecord(b.file_name)"
                title="删除备份"
                class="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { Plus, Database, Archive, Terminal, Download, Trash2, Play } from 'lucide-vue-next'
import Modal from '@/components/Modal.vue'
import { DatabaseItem, BackupRecord, databaseApi } from '@/api/database'
import { toast } from '@/composables/useToast'

const showCreateModal = ref(false)
const showBackupModal = ref(false)
const backupList = ref<BackupRecord[]>([])
const loadingBackups = ref(false)
const creatingBackup = ref(false)
const showQueryModal = ref(false)
const activeDb = ref<DatabaseItem | null>(null)
const sqlQuery = ref('SELECT name FROM sqlite_master WHERE type="table";')
const runningQuery = ref(false)
const queryExecutionTime = ref<number | null>(null)
const queryResults = ref<{ columns: string[]; rows: any[][] } | null>(null)

const databases = ref<DatabaseItem[]>([])

const createForm = reactive<{
  type: 'mysql' | 'mariadb' | 'postgresql' | 'sqlite' | 'redis'
  db_name: string
  username: string
  password: string
}>({
  type: 'mysql',
  db_name: '',
  username: '',
  password: ''
})

function getTypeBadge(type: string) {
  switch (type) {
    case 'mysql': return 'bg-amber-500/15 text-amber-300 border-amber-500/30'
    case 'mariadb': return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
    case 'sqlite': return 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
    case 'redis': return 'bg-rose-500/15 text-rose-300 border-rose-500/30'
    default: return 'bg-slate-800 text-slate-300 border-slate-700'
  }
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

async function loadDatabases() {
  try {
    const res = await databaseApi.getDatabases()
    if (res.data && res.data.data) {
      databases.value = res.data.data.list
    }
  } catch (err: any) {
    console.error('Failed to load databases:', err)
  }
}

async function handleCreateDatabase() {
  try {
    await databaseApi.createDatabase({
      type: createForm.type,
      db_name: createForm.db_name,
      username: createForm.username || 'root',
      password: createForm.password || 'armguard'
    })
    showCreateModal.value = false
    const name = createForm.db_name
    createForm.db_name = ''
    createForm.username = ''
    createForm.password = ''
    await loadDatabases()
    toast.success(`数据库 [${name}] 创建成功！`)
  } catch (err: any) {
    toast.error(`创建数据库失败: ${err.message}`)
  }
}

async function openQueryModal(db: DatabaseItem) {
  activeDb.value = db
  sqlQuery.value = 'SELECT name FROM sqlite_master WHERE type="table";'
  await runQuery()
  showQueryModal.value = true
}

async function runQuery() {
  if (!activeDb.value) return
  runningQuery.value = true
  try {
    const res = await databaseApi.executeQuery(activeDb.value.id, sqlQuery.value)
    if (res.data && res.data.data) {
      queryResults.value = {
        columns: res.data.data.columns,
        rows: res.data.data.rows
      }
      queryExecutionTime.value = res.data.data.execution_time_ms
    }
  } catch (e: any) {
    toast.error(`SQL 执行失败: ${e.message}`)
  } finally {
    runningQuery.value = false
  }
}

async function instantBackup(db: DatabaseItem) {
  if (confirm(`确定要立即备份数据库 [${db.db_name}] 吗？`)) {
    try {
      const res = await databaseApi.backupDatabase(db.id)
      toast.success(`数据库 [${db.db_name}] 备份成功！文件: ${res.data.data.file_name}`)
      await loadDatabases()
    } catch (e: any) {
      toast.error(`备份失败: ${e.message}`)
    }
  }
}

async function openBackupModal(db: DatabaseItem) {
  activeDb.value = db
  showBackupModal.value = true
  await loadBackupsForActiveDb()
}

async function loadBackupsForActiveDb() {
  if (!activeDb.value) return
  loadingBackups.value = true
  try {
    const res = await databaseApi.getBackups(activeDb.value.id)
    if (res.data?.data) {
      backupList.value = res.data.data.list
    }
  } catch (e: any) {
    toast.error(`获取备份列表失败: ${e.message}`)
  } finally {
    loadingBackups.value = false
  }
}

async function createBackupForActiveDb() {
  if (!activeDb.value) return
  creatingBackup.value = true
  try {
    const res = await databaseApi.backupDatabase(activeDb.value.id)
    toast.success(`新备份已生成: ${res.data?.data?.file_name}`)
    await loadBackupsForActiveDb()
    await loadDatabases()
  } catch (e: any) {
    toast.error(`生成备份失败: ${e.message}`)
  } finally {
    creatingBackup.value = false
  }
}

function downloadBackup(fileName: string) {
  const url = databaseApi.downloadBackupUrl(fileName)
  window.open(url, '_blank')
}

async function deleteBackupRecord(fileName: string) {
  if (confirm(`确定要永久删除备份包 [${fileName}] 吗？`)) {
    try {
      await databaseApi.deleteBackup(fileName)
      toast.success(`备份包 [${fileName}] 已删除`)
      await loadBackupsForActiveDb()
    } catch (e: any) {
      toast.error(`删除备份失败: ${e.message}`)
    }
  }
}

async function deleteDatabase(db: DatabaseItem) {
  if (confirm(`警告：确定要删除数据库 [${db.db_name}] 吗？数据将无法恢复！`)) {
    try {
      await databaseApi.deleteDatabase(db.id)
      await loadDatabases()
      toast.success(`数据库 [${db.db_name}] 已成功删除！`)
    } catch (e: any) {
      toast.error(`删除失败: ${e.message}`)
    }
  }
}

onMounted(() => {
  loadDatabases()
})
</script>
