<template>
  <div class="space-y-4">
    <!-- Header & Action Bar -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-bold text-white tracking-tight">文件管理器</h2>
        <p class="text-xs text-slate-400 font-mono">浏览、编辑、上传、压缩解压与权限管理</p>
      </div>

      <div class="flex items-center gap-2">
        <button
          @click="showCreateFileModal = true"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono border border-slate-700 transition"
        >
          <FilePlus class="w-3.5 h-3.5 text-brand-400" />
          新建文件
        </button>
        <button
          @click="showCreateDirModal = true"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono border border-slate-700 transition"
        >
          <FolderPlus class="w-3.5 h-3.5 text-cyan-400" />
          新建目录
        </button>
        <label class="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold text-xs font-mono cursor-pointer transition shadow-lg shadow-brand-500/20">
          <Upload class="w-3.5 h-3.5" />
          上传文件
          <input type="file" class="hidden" @change="handleFileUpload" />
        </label>
      </div>
    </div>

    <!-- Path Breadcrumb and Search Bar -->
    <div class="glass-panel p-3 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
      <!-- Breadcrumbs & Editable Path (Dual Mode) -->
      <div
        class="flex-1 min-w-[320px] flex items-center bg-slate-950/70 border rounded-lg px-2.5 py-1.5 transition"
        :class="isEditingPath ? 'border-brand-500 ring-1 ring-brand-500/30' : 'border-slate-800 hover:border-slate-700'"
      >
        <!-- Mode A: Editable Absolute Path Input -->
        <form
          v-if="isEditingPath"
          @submit.prevent="submitPathInput"
          class="flex-1 flex items-center gap-2 w-full"
        >
          <Folder class="w-3.5 h-3.5 text-brand-400 shrink-0" />
          <input
            ref="pathInputRef"
            v-model="inputPathValue"
            type="text"
            placeholder="输入绝对路径 (如 /etc/ssl/armguard) 并按回车"
            @keydown.esc="cancelPathEdit"
            class="flex-1 bg-transparent text-white font-mono text-xs focus:outline-none placeholder-slate-500"
          />
          <button
            type="submit"
            class="px-2.5 py-0.5 rounded bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold text-[11px] shrink-0 transition"
          >
            前往
          </button>
          <button
            type="button"
            @click="cancelPathEdit"
            class="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 shrink-0 transition"
            title="取消 (Esc)"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        </form>

        <!-- Mode B: Clickable Breadcrumb Segments (Click blank or edit button to enter edit mode) -->
        <div
          v-else
          @click="enterPathEditMode"
          class="flex-1 flex items-center justify-between overflow-x-auto text-slate-300 cursor-text group"
          title="点击输入绝对路径快速导航"
        >
          <div class="flex items-center gap-1.5 flex-wrap">
            <button
              @click.stop="navigateTo('/')"
              class="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 flex items-center transition"
              title="根目录 /"
            >
              <Home class="w-3.5 h-3.5" />
            </button>
            <template v-for="(seg, idx) in pathSegments" :key="idx">
              <span class="text-slate-600 select-none">/</span>
              <button
                @click.stop="navigateToSegment(idx)"
                class="px-1.5 py-0.5 rounded hover:bg-slate-800 hover:text-brand-400 transition"
                :class="{ 'font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20': idx === pathSegments.length - 1 }"
              >
                {{ seg }}
              </button>
            </template>
          </div>

          <!-- Direct Edit Toggle Hint -->
          <div class="flex items-center gap-1 pl-2 text-slate-500 group-hover:text-brand-400 shrink-0 select-none transition">
            <Edit2 class="w-3 h-3" />
            <span class="text-[10px] hidden sm:inline opacity-70 group-hover:opacity-100">输入路径</span>
          </div>
        </div>
      </div>

      <!-- Quick Search -->
      <div class="relative w-48 shrink-0">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索当前目录..."
          class="w-full bg-slate-950/80 border border-slate-700 rounded-lg px-3 py-1.5 pl-8 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
        />
        <Search class="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
      </div>
    </div>

    <!-- File Table -->
    <div class="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs font-mono">
          <thead>
            <tr class="bg-slate-950/60 text-slate-400 border-b border-slate-800">
              <th class="py-3 px-4 w-8">
                <input type="checkbox" class="rounded bg-slate-900 border-slate-700" />
              </th>
              <th class="py-3 px-4 font-semibold">文件名</th>
              <th class="py-3 px-4 font-semibold">大小</th>
              <th class="py-3 px-4 font-semibold">权限</th>
              <th class="py-3 px-4 font-semibold">所有者</th>
              <th class="py-3 px-4 font-semibold">修改时间</th>
              <th class="py-3 px-4 font-semibold text-right">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/60">
            <!-- Parent Dir link -->
            <tr v-if="currentPath !== '/'" @click="navigateUp" class="hover:bg-slate-800/30 cursor-pointer transition">
              <td class="py-2.5 px-4"></td>
              <td colspan="6" class="py-2.5 px-4 text-brand-400 flex items-center gap-2 font-bold">
                <CornerLeftUp class="w-4 h-4" />
                .. 返回上级目录
              </td>
            </tr>

            <!-- File Rows -->
            <tr
              v-for="item in filteredFiles"
              :key="item.path"
              class="hover:bg-slate-800/30 transition group"
            >
              <td class="py-3 px-4">
                <input type="checkbox" class="rounded bg-slate-900 border-slate-700" />
              </td>

              <!-- Name & Icon -->
              <td class="py-3 px-4 font-medium text-slate-200">
                <div
                  @click="handleItemClick(item)"
                  class="flex items-center gap-2.5 cursor-pointer hover:text-brand-400 transition"
                >
                  <Folder v-if="item.is_dir" class="w-4 h-4 text-amber-400 shrink-0 fill-amber-400/20" />
                  <FileCode v-else-if="isCodeFile(item.name)" class="w-4 h-4 text-cyan-400 shrink-0" />
                  <FileArchive v-else-if="isArchiveFile(item.name)" class="w-4 h-4 text-rose-400 shrink-0" />
                  <FileText v-else class="w-4 h-4 text-slate-400 shrink-0" />
                  <span class="truncate">{{ item.name }}</span>
                </div>
              </td>

              <!-- Size -->
              <td class="py-3 px-4 text-slate-400">
                {{ item.is_dir ? '--' : formatBytes(item.size) }}
              </td>

              <!-- Permissions -->
              <td class="py-3 px-4 text-slate-400">
                <span class="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">
                  {{ item.mode }}
                </span>
              </td>

              <!-- Owner -->
              <td class="py-3 px-4 text-slate-400">{{ item.owner }}:{{ item.group }}</td>

              <!-- Mod time -->
              <td class="py-3 px-4 text-slate-500">{{ item.mod_time }}</td>

              <!-- Actions -->
              <td class="py-3 px-4 text-right">
                <div class="inline-flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition">
                  <button
                    v-if="!item.is_dir && isEditable(item.name)"
                    @click="openEditor(item)"
                    title="在线编辑"
                    class="p-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300"
                  >
                    <Edit3 class="w-3.5 h-3.5" />
                  </button>
                  <button
                    v-if="!item.is_dir"
                    @click="downloadFile(item)"
                    title="下载文件"
                    class="p-1 rounded bg-slate-800 hover:bg-slate-700 text-emerald-400"
                  >
                    <Download class="w-3.5 h-3.5" />
                  </button>
                  <button
                    @click="openRenameModal(item)"
                    title="重命名"
                    class="p-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300"
                  >
                    <Edit2 class="w-3.5 h-3.5" />
                  </button>
                  <button
                    @click="openPermissionModal(item)"
                    title="修改权限 (chmod)"
                    class="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                  >
                    <Shield class="w-3.5 h-3.5" />
                  </button>
                  <button
                    @click="deleteFile(item)"
                    title="删除"
                    class="p-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400"
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

    <!-- Code / Text Editor Modal -->
    <Modal v-model="showEditorModal" :title="`在线编辑: ${editingFile?.name}`" size="xl">
      <div class="space-y-3 font-mono text-xs">
        <div class="flex items-center justify-between text-slate-400 pb-1">
          <span>文件路径: {{ editingFile?.path }} ({{ formatBytes(editingContent.length) }})</span>
          <span>UTF-8 / LF</span>
        </div>
        <textarea
          v-model="editingContent"
          rows="18"
          class="w-full bg-slate-950 text-slate-100 font-mono text-xs p-4 rounded-xl border border-slate-700 focus:outline-none focus:border-brand-500 leading-relaxed tracking-wide"
        ></textarea>
        <div class="flex justify-end gap-3 pt-2">
          <button
            @click="showEditorModal = false"
            class="px-4 py-2 rounded-xl bg-slate-800 text-slate-300"
          >
            取消
          </button>
          <button
            @click="saveEditorContent"
            class="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold"
          >
            保存更改 (Ctrl+S)
          </button>
        </div>
      </div>
    </Modal>

    <!-- Create File Modal -->
    <Modal v-model="showCreateFileModal" title="新建空白文件" size="sm">
      <form @submit.prevent="handleCreateFile" class="space-y-4 font-mono text-xs">
        <div>
          <label class="block text-slate-300 font-semibold mb-1">文件名</label>
          <input
            v-model="newFileName"
            type="text"
            required
            placeholder="index.html"
            class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
          />
        </div>
        <div class="flex justify-end gap-3">
          <button type="button" @click="showCreateFileModal = false" class="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300">取消</button>
          <button type="submit" class="px-4 py-1.5 rounded-lg bg-brand-600 text-slate-950 font-bold">创建</button>
        </div>
      </form>
    </Modal>

    <!-- Create Dir Modal -->
    <Modal v-model="showCreateDirModal" title="新建目录" size="sm">
      <form @submit.prevent="handleCreateDir" class="space-y-4 font-mono text-xs">
        <div>
          <label class="block text-slate-300 font-semibold mb-1">目录名</label>
          <input
            v-model="newDirName"
            type="text"
            required
            placeholder="uploads"
            class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
          />
        </div>
        <div class="flex justify-end gap-3">
          <button type="button" @click="showCreateDirModal = false" class="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300">取消</button>
          <button type="submit" class="px-4 py-1.5 rounded-lg bg-cyan-600 text-white font-bold">创建</button>
        </div>
      </form>
    </Modal>

    <!-- Permission Modal -->
    <Modal v-model="showPermissionModal" :title="`权限设置: ${permissionTarget?.name}`" size="sm">
      <div class="space-y-4 font-mono text-xs">
        <div>
          <label class="block text-slate-300 font-semibold mb-1">权限代码 (chmod)</label>
          <input
            v-model="permissionMode"
            type="text"
            class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500 font-bold"
          />
        </div>
        <div class="flex justify-end gap-3">
          <button @click="showPermissionModal = false" class="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300">取消</button>
          <button @click="savePermission" class="px-4 py-1.5 rounded-lg bg-brand-600 text-slate-950 font-bold">应用</button>
        </div>
      </div>
    </Modal>

    <!-- Rename Modal -->
    <Modal v-model="showRenameModal" title="重命名" size="sm">
      <form @submit.prevent="handleRename" class="space-y-4 font-mono text-xs">
        <div>
          <label class="block text-slate-300 font-semibold mb-1">新名称</label>
          <input
            v-model="renameNewName"
            type="text"
            required
            class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500 font-bold"
          />
        </div>
        <div class="flex justify-end gap-3">
          <button type="button" @click="showRenameModal = false" class="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300">取消</button>
          <button type="submit" class="px-4 py-1.5 rounded-lg bg-brand-600 text-slate-950 font-bold">确定</button>
        </div>
      </form>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  FilePlus,
  FolderPlus,
  Upload,
  Home,
  Search,
  CornerLeftUp,
  Folder,
  FileCode,
  FileArchive,
  FileText,
  Edit3,
  Edit2,
  Download,
  Shield,
  Trash2,
  X
} from 'lucide-vue-next'
import Modal from '@/components/Modal.vue'
import { FileItem, fileApi } from '@/api/file'
import { toast } from '@/composables/useToast'

const route = useRoute()
const router = useRouter()
const currentPath = ref((route.query.path as string) || '/www/wwwroot')
const searchQuery = ref('')
const loading = ref(false)

const isEditingPath = ref(false)
const inputPathValue = ref('')
const pathInputRef = ref<HTMLInputElement | null>(null)

const showEditorModal = ref(false)
const showCreateFileModal = ref(false)
const showCreateDirModal = ref(false)
const showPermissionModal = ref(false)
const showRenameModal = ref(false)

const renameTarget = ref<FileItem | null>(null)
const renameNewName = ref('')

const editingFile = ref<FileItem | null>(null)
const editingContent = ref('')
const newFileName = ref('')
const newDirName = ref('')
const permissionTarget = ref<FileItem | null>(null)
const permissionMode = ref('0755')

const files = ref<FileItem[]>([])

const pathSegments = computed(() => currentPath.value.split('/').filter(Boolean))

const filteredFiles = computed(() => {
  if (!searchQuery.value) return files.value
  return files.value.filter(f => f.name.toLowerCase().includes(searchQuery.value.toLowerCase()))
})

function enterPathEditMode() {
  isEditingPath.value = true
  inputPathValue.value = currentPath.value
  nextTick(() => {
    if (pathInputRef.value) {
      pathInputRef.value.focus()
      pathInputRef.value.select()
    }
  })
}

function cancelPathEdit() {
  isEditingPath.value = false
}

function submitPathInput() {
  let target = inputPathValue.value.trim()
  if (!target) {
    cancelPathEdit()
    return
  }
  if (!target.startsWith('/')) {
    target = '/' + target
  }
  target = target.replace(/\/+/g, '/')
  if (target.length > 1 && target.endsWith('/')) {
    target = target.slice(0, -1)
  }

  isEditingPath.value = false
  loadDirectory(target)
}

async function loadDirectory(path = currentPath.value) {
  loading.value = true
  try {
    const res = await fileApi.getList(path)
    if (res.data && res.data.data) {
      files.value = res.data.data.files
      currentPath.value = res.data.data.current_path
      if (route.query.path !== res.data.data.current_path) {
        router.replace({ query: { ...route.query, path: res.data.data.current_path } })
      }
    }
  } catch (err: any) {
    console.error(`加载目录失败: ${err.message}`)
    toast.error(`加载目录失败 [${path}]: ${err.response?.data?.message || err.message}`)
    // Fallback to / if path doesn't exist
    if (path !== '/') loadDirectory('/')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  const targetPath = (route.query.path as string) || '/www/wwwroot'
  loadDirectory(targetPath)
})

watch(() => route.query.path, (newPath) => {
  if (newPath) {
    loadDirectory(newPath as string)
  }
})

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function isCodeFile(name: string) {
  return /\.(html|js|ts|vue|php|json|go|py|css|sh|yaml|yml|conf|md|txt)$/i.test(name)
}

function isArchiveFile(name: string) {
  return /\.(zip|tar\.gz|tgz|tar|gz|7z)$/i.test(name)
}

function isEditable(name: string) {
  return !isArchiveFile(name) && !/\.(png|jpg|jpeg|gif|ico|pdf|exe|bin|node|so)$/i.test(name)
}

function navigateTo(path: string) {
  loadDirectory(path)
}

function navigateToSegment(idx: number) {
  const parts = pathSegments.value.slice(0, idx + 1)
  loadDirectory('/' + parts.join('/'))
}

function navigateUp() {
  const parts = pathSegments.value.slice(0, -1)
  loadDirectory(parts.length ? '/' + parts.join('/') : '/')
}

function handleItemClick(item: FileItem) {
  if (item.is_dir) {
    loadDirectory(item.path)
  } else if (isEditable(item.name)) {
    openEditor(item)
  }
}

async function openEditor(item: FileItem) {
  editingFile.value = item
  try {
    const res = await fileApi.getContent(item.path)
    editingContent.value = res.data?.data?.content || ''
    showEditorModal.value = true
  } catch (e: any) {
    toast.error(`读取文件失败: ${e.message}`)
  }
}

async function saveEditorContent() {
  if (!editingFile.value) return
  try {
    await fileApi.saveContent(editingFile.value.path, editingContent.value)
    toast.success(`文件 [${editingFile.value?.name}] 保存成功！`)
    showEditorModal.value = false
    loadDirectory()
  } catch (e: any) {
    toast.error(`保存失败: ${e.message}`)
  }
}

async function handleCreateFile() {
  if (!newFileName.value) return
  const p = `${currentPath.value}/${newFileName.value}`
  try {
    await fileApi.createFile(p, false)
    toast.success(`文件 [${newFileName.value}] 创建成功！`)
    newFileName.value = ''
    showCreateFileModal.value = false
    loadDirectory()
  } catch (e: any) {
    toast.error(`创建失败: ${e.message}`)
  }
}

async function handleCreateDir() {
  if (!newDirName.value) return
  const p = `${currentPath.value}/${newDirName.value}`
  try {
    await fileApi.createFile(p, true)
    toast.success(`目录 [${newDirName.value}] 创建成功！`)
    newDirName.value = ''
    showCreateDirModal.value = false
    loadDirectory()
  } catch (e: any) {
    toast.error(`创建失败: ${e.message}`)
  }
}

function openPermissionModal(item: FileItem) {
  permissionTarget.value = item
  permissionMode.value = item.mode
  showPermissionModal.value = true
}

async function savePermission() {
  if (permissionTarget.value) {
    try {
      await fileApi.changePermission(permissionTarget.value.path, permissionMode.value)
      toast.success('文件权限修改成功！')
      showPermissionModal.value = false
      loadDirectory()
    } catch (e: any) {
      toast.error(`修改失败: ${e.message}`)
    }
  }
}

async function handleFileUpload(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files && input.files[0]) {
    const f = input.files[0]
    try {
      await fileApi.uploadFile(currentPath.value, f)
      toast.success(`文件 [${f.name}] 上传成功！`)
      loadDirectory()
    } catch (e: any) {
      toast.error(`上传失败: ${e.message}`)
    }
  }
}

async function deleteFile(item: FileItem) {
  if (confirm(`确定要删除 ${item.is_dir ? '目录' : '文件'} [${item.name}] 吗？`)) {
    try {
      await fileApi.deleteFiles([item.path])
      toast.success(`已删除 ${item.name}`)
      loadDirectory()
    } catch (e: any) {
      toast.error(`删除失败: ${e.message}`)
    }
  }
}

function openRenameModal(item: FileItem) {
  renameTarget.value = item
  renameNewName.value = item.name
  showRenameModal.value = true
}

async function handleRename() {
  if (!renameTarget.value || !renameNewName.value) return
  const oldPath = renameTarget.value.path
  const lastSlash = oldPath.lastIndexOf('/')
  const dir = lastSlash >= 0 ? oldPath.substring(0, lastSlash) : ''
  const newPath = dir ? `${dir}/${renameNewName.value}` : renameNewName.value
  try {
    await fileApi.renameFile(oldPath, newPath)
    showRenameModal.value = false
    toast.success(`已成功重命名为 ${renameNewName.value}`)
    loadDirectory()
  } catch (e: any) {
    toast.error(`重命名失败: ${e.message}`)
  }
}

function downloadFile(item: FileItem) {
  const url = fileApi.downloadFileUrl(item.path)
  window.open(url, '_blank')
}
</script>
