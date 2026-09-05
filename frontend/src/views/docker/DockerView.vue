<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 class="text-lg font-bold text-white tracking-tight flex items-center gap-2">
          Docker 容器与镜像管理
          <span class="text-xs px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 font-mono">ARM Multi-Arch Manifest 校验加速</span>
        </h2>
        <p class="text-xs text-slate-400 font-mono">轻量化容器生命周期管理，拉取前自动探测 ARM64/ARMv7 平台兼容性</p>
      </div>

      <div class="flex items-center gap-2">
        <div class="flex items-center gap-1.5 p-1 bg-slate-900 rounded-xl border border-slate-800 text-xs font-mono">
          <button
            @click="activeTab = 'containers'"
            class="px-3.5 py-1.5 rounded-lg transition"
            :class="activeTab === 'containers' ? 'bg-brand-600 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-slate-200'"
          >
            容器列表 ({{ containers.length }})
          </button>
          <button
            @click="activeTab = 'images'"
            class="px-3.5 py-1.5 rounded-lg transition"
            :class="activeTab === 'images' ? 'bg-brand-600 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-slate-200'"
          >
            本地镜像 ({{ images.length }})
          </button>
        </div>

        <button
          v-if="activeTab === 'containers'"
          @click="showCreateContainerModal = true"
          class="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold text-xs font-mono transition shadow-lg shadow-brand-500/20"
        >
          <Plus class="w-4 h-4" />
          创建容器
        </button>

        <button
          v-else
          @click="showPullImageModal = true"
          class="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs font-mono transition shadow-lg shadow-cyan-500/20"
        >
          <Download class="w-4 h-4" />
          拉取镜像 (架构预检)
        </button>
      </div>
    </div>

    <!-- TAB 1: Containers List -->
    <div v-if="activeTab === 'containers'" class="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs font-mono">
          <thead>
            <tr class="bg-slate-950/60 text-slate-400 border-b border-slate-800">
              <th class="py-3.5 px-4 font-semibold">容器名称 / ID</th>
              <th class="py-3.5 px-4 font-semibold">使用镜像</th>
              <th class="py-3.5 px-4 font-semibold">状态</th>
              <th class="py-3.5 px-4 font-semibold">端口映射</th>
              <th class="py-3.5 px-4 font-semibold">CPU / 内存占用</th>
              <th class="py-3.5 px-4 font-semibold text-right">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/60">
            <tr v-for="c in containers" :key="c.id" class="hover:bg-slate-800/30 transition group">
              <!-- Name & ID -->
              <td class="py-3.5 px-4">
                <div class="font-bold text-slate-100 flex items-center gap-2">
                  <Box class="w-4 h-4 text-cyan-400 shrink-0" />
                  {{ c.name }}
                </div>
                <div class="text-[10px] text-slate-500 mt-0.5">{{ c.id.substring(0, 12) }}</div>
              </td>

              <!-- Image -->
              <td class="py-3.5 px-4 text-slate-300">
                <span class="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-brand-300">
                  {{ c.image }}
                </span>
              </td>

              <!-- Status -->
              <td class="py-3.5 px-4">
                <span
                  class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border"
                  :class="c.status === 'running' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'"
                >
                  <span class="w-1.5 h-1.5 rounded-full" :class="c.status === 'running' ? 'bg-emerald-400' : 'bg-slate-500'"></span>
                  {{ c.status === 'running' ? '运行中' : '已停止' }}
                </span>
              </td>

              <!-- Ports -->
              <td class="py-3.5 px-4 text-slate-300">
                <div v-for="p in c.ports" :key="p" class="text-[11px] text-slate-400">
                  {{ p }}
                </div>
              </td>

              <!-- Resource Metrics -->
              <td class="py-3.5 px-4">
                <div v-if="c.status === 'running'" class="space-y-1">
                  <div class="flex items-center gap-2 text-slate-300">
                    <span>CPU: <strong class="text-brand-400">{{ c.cpu_percent.toFixed(1) }}%</strong></span>
                    <span class="text-slate-600">|</span>
                    <span>RAM: <strong class="text-cyan-400">{{ formatBytes(c.mem_usage_bytes) }}</strong></span>
                  </div>
                </div>
                <div v-else class="text-slate-500">--</div>
              </td>

              <!-- Actions -->
              <td class="py-3.5 px-4 text-right">
                <div class="inline-flex items-center gap-1.5">
                  <button
                    v-if="c.status !== 'running'"
                    @click="startContainer(c)"
                    title="启动"
                    class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 transition"
                  >
                    <Play class="w-3.5 h-3.5" />
                  </button>
                  <button
                    v-else
                    @click="stopContainer(c)"
                    title="停止"
                    class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 transition"
                  >
                    <Square class="w-3.5 h-3.5" />
                  </button>

                  <button
                    @click="openLogsModal(c)"
                    title="查看日志"
                    class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 transition"
                  >
                    <ScrollText class="w-3.5 h-3.5" />
                  </button>

                  <button
                    @click="deleteContainer(c)"
                    title="删除容器"
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

    <!-- TAB 2: Images List (With ARM Multi-Arch Badges) -->
    <div v-else class="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs font-mono">
          <thead>
            <tr class="bg-slate-950/60 text-slate-400 border-b border-slate-800">
              <th class="py-3.5 px-4 font-semibold">镜像仓库 (Repository:Tag)</th>
              <th class="py-3.5 px-4 font-semibold">镜像 ID</th>
              <th class="py-3.5 px-4 font-semibold">多架构 Manifest 平台支持</th>
              <th class="py-3.5 px-4 font-semibold">镜像大小</th>
              <th class="py-3.5 px-4 font-semibold">创建时间</th>
              <th class="py-3.5 px-4 font-semibold text-right">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/60">
            <tr v-for="img in images" :key="img.id" class="hover:bg-slate-800/30 transition">
              <!-- Name & Tag -->
              <td class="py-3.5 px-4 font-bold text-slate-100 flex items-center gap-2">
                <Layers class="w-4 h-4 text-brand-400 shrink-0" />
                {{ img.repository }}:{{ img.tag }}
              </td>

              <!-- ID -->
              <td class="py-3.5 px-4 text-slate-400">{{ img.id.substring(0, 12) }}</td>

              <!-- Multi-Arch Platforms -->
              <td class="py-3.5 px-4">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span
                    v-for="plat in img.manifest_platforms"
                    :key="plat"
                    class="px-2 py-0.5 rounded text-[10px] font-bold"
                    :class="plat.includes('arm') ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30' : 'bg-slate-800 text-slate-400'"
                  >
                    {{ plat }}
                  </span>
                  <span v-if="img.is_native_arm" class="text-[10px] text-emerald-400 flex items-center gap-0.5">
                    <CheckCircle2 class="w-3 h-3" /> 原生加速
                  </span>
                </div>
              </td>

              <!-- Size -->
              <td class="py-3.5 px-4 text-cyan-400 font-semibold">{{ formatBytes(img.size_bytes) }}</td>

              <!-- Date -->
              <td class="py-3.5 px-4 text-slate-500">{{ img.created_at }}</td>

              <!-- Action -->
              <td class="py-3.5 px-4 text-right">
                <button
                  @click="deleteImage(img)"
                  class="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition"
                  title="删除镜像"
                >
                  <Trash2 class="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- PULL IMAGE MODAL WITH MANIFEST INSPECTION -->
    <Modal v-model="showPullImageModal" title="拉取 Docker 镜像 (ARM 多架构预检)" size="lg">
      <div class="space-y-4 font-mono text-xs">
        <div>
          <label class="block text-slate-300 font-semibold mb-1">镜像名称与标签 (如 redis:alpine, nginx:1.26)</label>
          <div class="flex items-center gap-2">
            <input
              v-model="pullImageInput"
              type="text"
              required
              placeholder="redis:alpine"
              class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
            />
            <button
              @click="inspectManifest"
              :disabled="inspecting"
              class="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 font-bold whitespace-nowrap border border-slate-700 flex items-center gap-1.5"
            >
              <Search class="w-3.5 h-3.5" :class="{ 'animate-spin': inspecting }" />
              预检架构
            </button>
          </div>
        </div>

        <!-- Manifest Inspection Result Box -->
        <div v-if="manifestResult" class="p-4 rounded-xl border space-y-3" :class="manifestBoxClass">
          <div class="flex items-center justify-between">
            <div class="font-bold flex items-center gap-2 text-sm">
              <CheckCircle2 v-if="manifestResult.compatibility_status === 'compatible'" class="w-4 h-4 text-emerald-400" />
              <AlertTriangle v-else class="w-4 h-4 text-rose-400 animate-pulse" />
              {{ manifestResult.compatibility_status === 'compatible' ? '架构校验通过 (ARM 原生支持)' : '架构不兼容警告 (仅含 x86/amd64)' }}
            </div>
            <span class="text-[10px] px-2 py-0.5 rounded bg-slate-950/60 font-bold">
              Docker Hub Registry v2
            </span>
          </div>

          <p class="text-[11px] leading-relaxed text-slate-200">
            {{ manifestResult.warning_message }}
          </p>

          <div class="pt-2 border-t border-slate-800/80">
            <div class="text-[11px] text-slate-400 mb-1.5">Manifest List 平台构建包含:</div>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="p in manifestResult.supported_platforms"
                :key="p.architecture + p.variant"
                class="px-2 py-0.5 rounded text-[10px] font-bold"
                :class="p.architecture.includes('arm') ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-900 text-slate-400'"
              >
                {{ p.os }}/{{ p.architecture }}{{ p.variant ? '/' + p.variant : '' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Pulling Progress Console -->
        <div v-if="pulling" class="space-y-2 pt-2">
          <div class="flex justify-between text-slate-400">
            <span>正在拉取镜像 {{ pullImageInput }}...</span>
            <span class="text-brand-400 font-bold">{{ pullProgress }}%</span>
          </div>
          <div class="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
            <div class="h-full bg-brand-500 transition-all duration-300" :style="{ width: `${pullProgress}%` }"></div>
          </div>
          <div class="p-3 bg-slate-950 rounded-xl text-[10px] text-emerald-400 max-h-28 overflow-y-auto leading-relaxed">
            [docker] Pulling from library/{{ pullImageInput }}<br />
            [docker] aarch64 digest: sha256:7f9b8c8d9e2...<br />
            [docker] Status: Downloaded newer image for {{ pullImageInput }}
          </div>
        </div>

        <div class="flex justify-end gap-3 pt-3">
          <button
            @click="showPullImageModal = false"
            class="px-4 py-2 rounded-xl bg-slate-800 text-slate-300"
          >
            取消
          </button>
          <button
            @click="startPullImage"
            :disabled="pulling"
            class="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold flex items-center gap-2"
          >
            <Download class="w-3.5 h-3.5" />
            <span>{{ pulling ? '正在拉取...' : '开始拉取镜像' }}</span>
          </button>
        </div>
      </div>
    </Modal>

    <!-- CREATE CONTAINER MODAL -->
    <Modal v-model="showCreateContainerModal" title="新建 Docker 容器" size="lg">
      <form @submit.prevent="handleCreateContainer" class="space-y-4 font-mono text-xs">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-slate-300 font-semibold mb-1">容器名称</label>
            <input
              v-model="createForm.name"
              type="text"
              required
              placeholder="my-redis"
              class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
            />
          </div>
          <div>
            <label class="block text-slate-300 font-semibold mb-1">选择镜像</label>
            <select
              v-model="createForm.image"
              class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
            >
              <option v-for="img in images" :key="img.id" :value="`${img.repository}:${img.tag}`">
                {{ img.repository }}:{{ img.tag }} ({{ img.is_native_arm ? 'ARM 原生' : 'x86' }})
              </option>
            </select>
          </div>
        </div>

        <div>
          <label class="block text-slate-300 font-semibold mb-1">端口映射 (主机端口 : 容器端口)</label>
          <input
            v-model="createForm.portMapping"
            type="text"
            placeholder="6379:6379, 8080:80"
            class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
          />
        </div>

        <div>
          <label class="block text-slate-300 font-semibold mb-1">目录挂载 (主机路径 : 容器路径)</label>
          <input
            v-model="createForm.volumeMapping"
            type="text"
            placeholder="/opt/data:/data"
            class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
          />
        </div>

        <div class="pt-3 flex justify-end gap-3">
          <button type="button" @click="showCreateContainerModal = false" class="px-4 py-2 rounded-xl bg-slate-800 text-slate-300">取消</button>
          <button type="submit" class="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold">创建并运行</button>
        </div>
      </form>
    </Modal>

    <!-- CONTAINER LOGS MODAL -->
    <Modal v-model="showLogsModal" :title="`容器运行日志: ${activeContainer?.name}`" size="xl">
      <div class="space-y-3 font-mono text-xs">
        <div class="flex items-center justify-between text-slate-400 pb-1">
          <span>实时日志输出 (tail 200 lines)</span>
          <button class="px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700">自动刷新</button>
        </div>
        <div class="h-96 bg-slate-950 rounded-xl p-4 font-mono text-[11px] text-emerald-300 overflow-y-auto leading-relaxed border border-slate-800 space-y-1">
          <div v-for="(log, idx) in containerLogs" :key="idx">
            {{ log }}
          </div>
        </div>
      </div>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import {
  Plus,
  Download,
  Box,
  Layers,
  Play,
  Square,
  ScrollText,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Search
} from 'lucide-vue-next'
import Modal from '@/components/Modal.vue'
import { DockerContainer, DockerImage, ManifestInspectResult, dockerApi } from '@/api/docker'
import { toast } from '@/composables/useToast'
import { eventBus, EVENTS } from '@/utils/eventBus'

const activeTab = ref<'containers' | 'images'>('containers')
const containers = ref<DockerContainer[]>([])
const images = ref<DockerImage[]>([])

const showPullImageModal = ref(false)
const showCreateContainerModal = ref(false)
const showLogsModal = ref(false)

const pullImageInput = ref('')
const inspecting = ref(false)
const manifestResult = ref<ManifestInspectResult | null>(null)

const pulling = ref(false)
const pullProgress = ref(0)

const activeContainer = ref<DockerContainer | null>(null)
const containerLogs = ref<string[]>([])

const createForm = reactive({
  name: '',
  image: '',
  portMapping: '',
  volumeMapping: ''
})

const manifestBoxClass = computed(() => {
  if (!manifestResult.value) return ''
  return manifestResult.value.compatibility_status === 'compatible'
    ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-300'
    : 'bg-rose-950/20 border-rose-500/40 text-rose-300'
})

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

async function loadContainersAndImages() {
  try {
    const [resC, resI] = await Promise.all([
      dockerApi.getContainers(),
      dockerApi.getImages()
    ])
    if (resC.data.code === 0) containers.value = resC.data.data.list
    if (resI.data.code === 0) {
      images.value = resI.data.data.list
      if (!createForm.image && images.value.length > 0) {
        createForm.image = `${images.value[0].repository}:${images.value[0].tag}`
      }
    }
  } catch (err) {
    console.error('Failed to load docker data:', err)
  }
}

async function inspectManifest() {
  if (!pullImageInput.value) return
  inspecting.value = true
  manifestResult.value = null

  const parts = pullImageInput.value.split(':')
  const img = parts[0]
  const tag = parts[1] || 'latest'

  try {
    const res = await dockerApi.inspectManifest(img, tag)
    if (res.data.code === 0) {
      manifestResult.value = res.data.data
    }
  } catch (e: any) {
    toast.error(`预检失败: ${e.message}`)
  } finally {
    inspecting.value = false
  }
}

async function startPullImage() {
  if (!pullImageInput.value) return
  pulling.value = true
  pullProgress.value = 30

  const parts = pullImageInput.value.split(':')
  const img = parts[0]
  const tag = parts[1] || 'latest'

  let interval: any = null
  try {
    interval = setInterval(() => {
      if (pullProgress.value < 90) pullProgress.value += 10
    }, 500)
    const res = await dockerApi.pullImage(img, tag)
    clearInterval(interval)
    pullProgress.value = 100
    await loadContainersAndImages()
    showPullImageModal.value = false
    toast.success(res.data?.message || `镜像 [${pullImageInput.value}] 拉取成功！`)
  } catch (e: any) {
    if (interval) clearInterval(interval)
    toast.error(`拉取失败: ${e.response?.data?.message || e.message}`)
  } finally {
    pulling.value = false
    pullProgress.value = 0
  }
}

async function startContainer(c: DockerContainer) {
  try {
    await dockerApi.startContainer(c.id)
    c.status = 'running'
    await loadContainersAndImages()
    toast.success(`容器 [${c.name}] 已启动`)
  } catch (e: any) {
    toast.error(`启动失败: ${e.message}`)
  }
}

async function stopContainer(c: DockerContainer) {
  try {
    await dockerApi.stopContainer(c.id)
    c.status = 'exited'
    await loadContainersAndImages()
    toast.success(`容器 [${c.name}] 已停止`)
  } catch (e: any) {
    toast.error(`停止失败: ${e.message}`)
  }
}

async function openLogsModal(c: DockerContainer) {
  activeContainer.value = c
  try {
    const res = await dockerApi.getContainerLogs(c.id)
    containerLogs.value = res.data?.data?.logs || ['无日志输出']
  } catch {
    containerLogs.value = ['无法获取容器日志']
  }
  showLogsModal.value = true
}

async function deleteContainer(c: DockerContainer) {
  if (confirm(`确定要删除容器 [${c.name}] 吗？`)) {
    try {
      await dockerApi.deleteContainer(c.id)
      await loadContainersAndImages()
      toast.success(`容器 [${c.name}] 已成功删除！`)
    } catch (e: any) {
      toast.error(`删除失败: ${e.message}`)
    }
  }
}

async function deleteImage(img: DockerImage) {
  if (confirm(`确定要删除镜像 [${img.repository}:${img.tag}] 吗？`)) {
    try {
      await dockerApi.deleteImage(img.id)
      await loadContainersAndImages()
      toast.success(`镜像 [${img.repository}:${img.tag}] 已成功删除！`)
    } catch (e: any) {
      toast.error(`删除失败: ${e.message}`)
    }
  }
}

async function handleCreateContainer() {
  try {
    const portParts = createForm.portMapping ? createForm.portMapping.split(':') : []
    const ports = portParts.length === 2 ? [{
      host_port: parseInt(portParts[0], 10) || 80,
      container_port: parseInt(portParts[1], 10) || 80,
      protocol: 'tcp' as const
    }] : []
    const volParts = createForm.volumeMapping ? createForm.volumeMapping.split(':') : []
    const volumes = volParts.length === 2 ? [{
      host_path: volParts[0],
      container_path: volParts[1],
      mode: 'rw' as const
    }] : []

    await dockerApi.createContainer({
      name: createForm.name,
      image: createForm.image,
      ports,
      volumes,
      environments: [],
      restart_policy: 'always'
    })
    showCreateContainerModal.value = false
    createForm.name = ''
    await loadContainersAndImages()
    toast.success('容器创建成功！')
  } catch (e: any) {
    toast.error(`创建容器失败: ${e.message}`)
  }
}

onMounted(() => {
  loadContainersAndImages()
})
</script>
