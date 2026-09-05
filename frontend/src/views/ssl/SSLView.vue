<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 class="text-lg font-bold text-white tracking-tight flex items-center gap-2">
          SSL 证书管理
          <span class="text-xs px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 font-mono">Let's Encrypt 自动续期</span>
        </h2>
        <p class="text-xs text-slate-400 font-mono">免费申请 SSL 证书、自定义证书导入与 Nginx HTTPS 一键部署</p>
      </div>

      <div class="flex items-center gap-2">
        <button
          @click="showUploadModal = true"
          class="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono border border-slate-700 transition"
        >
          <UploadCloud class="w-3.5 h-3.5 text-cyan-400" />
          导入自有证书
        </button>
        <button
          @click="showApplyModal = true"
          class="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold text-xs font-mono transition shadow-lg shadow-brand-500/20"
        >
          <ShieldCheck class="w-4 h-4" />
          申请 Let's Encrypt 证书
        </button>
      </div>
    </div>

    <!-- Certificate List -->
    <div class="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs font-mono">
          <thead>
            <tr class="bg-slate-950/60 text-slate-400 border-b border-slate-800">
              <th class="py-3.5 px-4 font-semibold">主域名 / SANs 多域名</th>
              <th class="py-3.5 px-4 font-semibold">签发机构</th>
              <th class="py-3.5 px-4 font-semibold">到期时间 / 剩余天数</th>
              <th class="py-3.5 px-4 font-semibold">自动续期</th>
              <th class="py-3.5 px-4 font-semibold">已部署站点</th>
              <th class="py-3.5 px-4 font-semibold text-right">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/60">
            <tr v-for="cert in certs" :key="cert.id" class="hover:bg-slate-800/30 transition">
              <!-- Domain -->
              <td class="py-3.5 px-4">
                <div class="font-bold text-slate-100 flex items-center gap-1.5">
                  <Lock class="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  {{ cert.domain }}
                </div>
                <div v-if="cert.sans?.length" class="text-[10px] text-slate-500 mt-0.5">
                  SAN: {{ cert.sans.join(', ') }}
                </div>
              </td>

              <!-- Issuer -->
              <td class="py-3.5 px-4 text-slate-300">
                <span
                  class="px-2 py-0.5 rounded text-[11px] font-bold border"
                  :class="cert.issuer.includes('Self-Signed') || cert.issuer.includes('自签名') ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'"
                >
                  {{ cert.issuer }}
                </span>
              </td>

              <!-- Expiry -->
              <td class="py-3.5 px-4">
                <div class="text-slate-200">{{ cert.expires_at }}</div>
                <div
                  class="text-[11px] font-bold mt-0.5"
                  :class="cert.days_remaining < 15 ? 'text-rose-400' : 'text-emerald-400'"
                >
                  剩余 {{ cert.days_remaining }} 天
                </div>
              </td>

              <!-- Auto Renew -->
              <td class="py-3.5 px-4">
                <span
                  class="inline-flex items-center gap-1 text-[11px] font-semibold"
                  :class="cert.auto_renew ? 'text-emerald-400' : 'text-slate-500'"
                >
                  <RefreshCw v-if="cert.auto_renew" class="w-3 h-3" />
                  {{ cert.auto_renew ? '已开启' : '关闭' }}
                </span>
              </td>

              <!-- Deployed Sites -->
              <td class="py-3.5 px-4">
                <div v-if="cert.deployed_sites.length" class="flex flex-wrap gap-1">
                  <span
                    v-for="s in cert.deployed_sites"
                    :key="s"
                    class="px-2 py-0.5 rounded bg-brand-500/10 text-brand-300 border border-brand-500/20 text-[10px]"
                  >
                    {{ s }}
                  </span>
                </div>
                <span v-else class="text-slate-500 text-[10px]">未部署</span>
              </td>

              <!-- Actions -->
              <td class="py-3.5 px-4 text-right">
                <div class="inline-flex items-center gap-1.5">
                  <button
                    @click="openDeployModal(cert)"
                    title="部署至站点"
                    class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-brand-400 transition"
                  >
                    <Send class="w-3.5 h-3.5" />
                  </button>
                  <button
                    @click="renewCert(cert)"
                    title="手动续签"
                    class="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 transition"
                  >
                    <RefreshCw class="w-3.5 h-3.5" />
                  </button>
                  <button
                    @click="deleteCert(cert)"
                    title="删除证书"
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

    <!-- Apply Let's Encrypt Modal -->
    <Modal v-model="showApplyModal" title="申请 Let's Encrypt 免费证书" size="md">
      <form @submit.prevent="handleApplyCert" class="space-y-4 font-mono text-xs">
        <div>
          <label class="block text-slate-300 font-semibold mb-1">主域名 (必填)</label>
          <input
            v-model="applyForm.domain"
            type="text"
            required
            placeholder="example.com"
            class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
          />
        </div>

        <div>
          <label class="block text-slate-300 font-semibold mb-1">联系邮箱 (用于接收到期告警通知)</label>
          <input
            v-model="applyForm.email"
            type="email"
            required
            placeholder="admin@example.com"
            class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
          />
        </div>

        <div>
          <label class="block text-slate-300 font-semibold mb-1">验证方式</label>
          <select
            v-model="applyForm.challenge_type"
            class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
          >
            <option value="http-01">文件验证 (HTTP-01 Webroot - 需域名已解析到本机)</option>
            <option value="dns-01">DNS API 验证 (支持通配符泛域名 *.example.com)</option>
          </select>
        </div>

        <!-- Notice box for HTTP-01 -->
        <div v-if="applyForm.challenge_type === 'http-01'" class="p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-[11px] text-slate-400 space-y-1">
          <div class="text-slate-300 font-semibold flex items-center gap-1.5">
            <Globe class="w-3.5 h-3.5 text-brand-400" />
            <span>HTTP-01 验证前置条件:</span>
          </div>
          <p>• 请确认所申请域名的 DNS A 或 AAAA (IPv6) 解析已生效并指向本服务器公网 IP。</p>
          <p>• 服务器 80 端口需对外开放，Let's Encrypt 官方 CA 将直接通过 HTTP 请求验证域名归属权。</p>
        </div>

        <div v-if="applyForm.challenge_type === 'dns-01'" class="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
          <label class="block text-slate-400 text-[11px]">DNS 服务商 API Key</label>
          <input
            v-model="applyForm.dns_api_key"
            type="password"
            placeholder="Cloudflare / 阿里云 API Token"
            class="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-white"
          />
        </div>

        <div v-if="applying" class="p-3 rounded-xl bg-brand-500/10 border border-brand-500/20 space-y-2 pt-2">
          <div class="flex items-center justify-between text-brand-300 font-semibold">
            <span class="flex items-center gap-1.5">
              <Loader2 class="w-3.5 h-3.5 animate-spin text-brand-400" />
              正在向 Let's Encrypt 申请权威证书...
            </span>
            <span class="animate-pulse text-xs">ACME 验证中</span>
          </div>
          <div class="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
            <div class="h-full bg-brand-500 animate-pulse w-3/4"></div>
          </div>
          <p class="text-[10px] text-slate-400">正在与 Let's Encrypt CA 服务器通信验证 HTTP-01 挑战令牌，通常耗时 5~15 秒...</p>
        </div>

        <div class="pt-3 flex justify-end gap-3">
          <button type="button" @click="showApplyModal = false" class="px-4 py-2 rounded-xl bg-slate-800 text-slate-300">取消</button>
          <button type="submit" :disabled="applying" class="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold">
            {{ applying ? '签发中...' : '提交申请' }}
          </button>
        </div>
      </form>
    </Modal>

    <!-- Upload Custom Modal -->
    <Modal v-model="showUploadModal" title="导入自有 SSL 证书" size="lg">
      <form @submit.prevent="handleUploadCert" class="space-y-4 font-mono text-xs">
        <div>
          <label class="block text-slate-300 font-semibold mb-1">域名名称</label>
          <input
            v-model="uploadForm.domain"
            type="text"
            required
            placeholder="example.com"
            class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
          />
        </div>

        <div>
          <label class="block text-slate-300 font-semibold mb-1">证书内容 (PEM 格式, 包含 -----BEGIN CERTIFICATE-----)</label>
          <textarea
            v-model="uploadForm.certificate"
            rows="6"
            required
            placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
            class="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-emerald-300 font-mono text-[11px] focus:outline-none focus:border-brand-500"
          ></textarea>
        </div>

        <div>
          <label class="block text-slate-300 font-semibold mb-1">私钥内容 (KEY 格式, 包含 -----BEGIN PRIVATE KEY-----)</label>
          <textarea
            v-model="uploadForm.private_key"
            rows="6"
            required
            placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"
            class="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-cyan-300 font-mono text-[11px] focus:outline-none focus:border-brand-500"
          ></textarea>
        </div>

        <div class="pt-3 flex justify-end gap-3">
          <button type="button" @click="showUploadModal = false" class="px-4 py-2 rounded-xl bg-slate-800 text-slate-300">取消</button>
          <button type="submit" class="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold">导入并保存</button>
        </div>
      </form>
    </Modal>

    <!-- Deploy Modal -->
    <Modal v-model="showDeployModal" :title="`部署证书至站点: ${deployingCert?.domain}`" size="sm">
      <form @submit.prevent="handleDeployCert" class="space-y-4 font-mono text-xs">
        <div>
          <label class="block text-slate-300 font-semibold mb-1">选择目标站点</label>
          <select
            v-model="selectedSiteId"
            required
            class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
          >
            <option v-for="site in availableSites" :key="site.id" :value="site.id">
              {{ site.domain }} ({{ site.port || 80 }})
            </option>
          </select>
        </div>
        <p class="text-[11px] text-slate-500">
          部署后将自动把证书部署至该站点虚拟主机并平滑重载 Nginx 引擎。
        </p>
        <div class="flex justify-end gap-3 pt-2">
          <button type="button" @click="showDeployModal = false" class="px-4 py-2 rounded-xl bg-slate-800 text-slate-300">取消</button>
          <button type="submit" :disabled="deploying" class="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold">
            {{ deploying ? '部署中...' : '确认部署' }}
          </button>
        </div>
      </form>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ShieldCheck, UploadCloud, Lock, RefreshCw, Trash2, Send, Globe, Loader2 } from 'lucide-vue-next'
import Modal from '@/components/Modal.vue'
import { SSLCertificate, sslApi } from '@/api/ssl'
import { SiteItem, siteApi } from '@/api/site'
import { toast } from '@/composables/useToast'

const showApplyModal = ref(false)
const showUploadModal = ref(false)
const showDeployModal = ref(false)
const deployingCert = ref<SSLCertificate | null>(null)
const selectedSiteId = ref<number | null>(null)
const availableSites = ref<SiteItem[]>([])
const deploying = ref(false)
const applying = ref(false)

const certs = ref<SSLCertificate[]>([])

const applyForm = reactive<{
  domain: string
  email: string
  challenge_type: 'http-01' | 'dns-01'
  dns_api_key: string
}>({
  domain: '',
  email: 'admin@armguard.io',
  challenge_type: 'http-01',
  dns_api_key: ''
})

const uploadForm = reactive({
  domain: '',
  certificate: '',
  private_key: ''
})

async function loadCerts() {
  try {
    const res = await sslApi.getCerts()
    if (res.data && res.data.data) {
      certs.value = res.data.data.list
    }
  } catch (err: any) {
    console.error('Failed to load certs:', err)
  }
}

async function handleApplyCert() {
  applying.value = true
  try {
    await sslApi.applyCert({
      domain: applyForm.domain,
      email: applyForm.email,
      provider: 'letsencrypt',
      challenge_type: applyForm.challenge_type
    })
    showApplyModal.value = false
    await loadCerts()
    toast.success(`域名 [${applyForm.domain}] 的 Let's Encrypt 证书签发成功并已加入自动续签任务！`)
  } catch (e: any) {
    toast.error(`申请失败: ${e.message}`)
  } finally {
    applying.value = false
  }
}

async function handleUploadCert() {
  try {
    await sslApi.uploadCert({
      domain: uploadForm.domain,
      certificate: uploadForm.certificate,
      private_key: uploadForm.private_key
    })
    showUploadModal.value = false
    const dom = uploadForm.domain
    uploadForm.domain = ''
    uploadForm.certificate = ''
    uploadForm.private_key = ''
    await loadCerts()
    toast.success(`域名 [${dom}] 证书导入并配置成功！`)
  } catch (e: any) {
    toast.error(`导入失败: ${e.message}`)
  }
}

async function renewCert(cert: SSLCertificate) {
  try {
    await sslApi.renewCert(cert.id)
    await loadCerts()
    toast.success(`域名 [${cert.domain}] 证书续签成功！`)
  } catch (e: any) {
    toast.error(`续签失败: ${e.message}`)
  }
}

async function deleteCert(cert: SSLCertificate) {
  if (confirm(`确定要删除证书 [${cert.domain}] 吗？`)) {
    try {
      await sslApi.deleteCert(cert.id)
      await loadCerts()
      toast.success(`证书 [${cert.domain}] 已成功删除！`)
    } catch (e: any) {
      toast.error(`删除失败: ${e.message}`)
    }
  }
}

async function openDeployModal(cert: SSLCertificate) {
  deployingCert.value = cert
  try {
    const res = await siteApi.getSites()
    if (res.data?.data?.list) {
      availableSites.value = res.data.data.list
      if (availableSites.value.length > 0) {
        selectedSiteId.value = availableSites.value[0].id
      }
    }
  } catch {}
  showDeployModal.value = true
}

async function handleDeployCert() {
  if (!deployingCert.value || !selectedSiteId.value) return
  deploying.value = true
  try {
    await sslApi.deployCertToSite(deployingCert.value.id, selectedSiteId.value)
    showDeployModal.value = false
    await loadCerts()
    toast.success(`证书已成功部署至站点并即时生效！`)
  } catch (e: any) {
    toast.error(`部署失败: ${e.message}`)
  } finally {
    deploying.value = false
  }
}

onMounted(() => {
  loadCerts()
})
</script>
