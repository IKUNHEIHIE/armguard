<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-bold text-white tracking-tight flex items-center gap-2">
          <Shield class="w-5 h-5 text-brand-400" />
          安全防护中枢
        </h2>
        <p class="text-xs text-slate-400 font-mono">Linux 底层 iptables / ip6tables 双栈防火墙规则、SSH 服务安全加固与 Fail2ban 防爆破机制</p>
      </div>
      <div class="flex items-center gap-2">
        <button
          @click="loadAllSecurityData"
          :disabled="loading"
          class="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 font-bold text-xs transition border border-slate-800"
        >
          <RefreshCw class="w-3.5 h-3.5" :class="loading ? 'animate-spin text-brand-400' : ''" />
          刷新状态
        </button>
        <button
          @click="openAddRuleModal"
          class="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold text-xs transition shadow-lg shadow-brand-500/20"
        >
          <Plus class="w-4 h-4" />
          放行端口 / 规则
        </button>
      </div>
    </div>

    <!-- Quick SSH, Firewall & Fail2ban Status Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
      <!-- 1. SSH Remote Service Card -->
      <div class="glass-panel p-5 rounded-2xl border border-slate-800 space-y-3 relative overflow-hidden">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-slate-400 flex items-center gap-1.5">
            <Terminal class="w-3.5 h-3.5 text-brand-400" />
            SSH 远程服务
          </span>
          <span
            class="text-[10px] px-2 py-0.5 rounded-full font-mono border"
            :class="sshConfig.status === 'running' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-rose-500/15 text-rose-400 border-rose-500/30'"
          >
            ● {{ sshConfig.status === 'running' ? '运行中' : '已停止' }}
          </span>
        </div>
        <div class="flex items-baseline justify-between">
          <div class="text-2xl font-bold font-mono text-white">
            端口: <span class="text-brand-300 font-black">{{ sshConfig.port }}</span>
          </div>
          <button
            @click="openSshConfigModal"
            class="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-brand-400 text-xs font-semibold border border-slate-800 transition flex items-center gap-1"
          >
            <Sliders class="w-3 h-3" />
            配置与加固
          </button>
        </div>
        <div class="text-[11px] text-slate-400 font-mono flex items-center justify-between pt-2 border-t border-slate-800/80">
          <span>Root 登录: <strong :class="sshConfig.allow_root_login ? 'text-amber-400' : 'text-emerald-400'">{{ sshConfig.allow_root_login ? '允许' : '已禁用' }}</strong></span>
          <span>密码验证: <strong :class="sshConfig.allow_password_auth ? 'text-slate-200' : 'text-emerald-400'">{{ sshConfig.allow_password_auth ? '允许' : '仅限密钥' }}</strong></span>
        </div>
      </div>

      <!-- 2. System Firewall & Ping Protection Card -->
      <div class="glass-panel p-5 rounded-2xl border border-slate-800 space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-slate-400 flex items-center gap-1.5">
            <Globe class="w-3.5 h-3.5 text-cyan-400" />
            系统底层防火墙
          </span>
          <div class="flex items-center gap-1.5">
            <span
              class="text-[10px] px-2 py-0.5 rounded-full font-mono border font-bold"
              :class="ufwStatus.status === 'active' ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'"
            >
              ● UFW {{ ufwStatus.status === 'active' ? '运行中' : '未开启' }}
            </span>
            <span class="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-mono">
              {{ firewallType }}
            </span>
          </div>
        </div>
        <div class="flex items-baseline justify-between">
          <div class="text-2xl font-bold font-mono text-white">
            活动规则: <span class="text-cyan-300">{{ rules.length }}</span> 条
          </div>
          <span class="text-[11px] text-slate-400 font-mono">
            默认入站: <strong class="text-slate-200 uppercase">{{ ufwStatus.status === 'active' ? ufwStatus.default_incoming : defaultPolicy }}</strong>
          </span>
        </div>

        <!-- UFW Protection Switch with Anti-Lockout -->
        <div class="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
          <div>
            <div class="text-slate-300 font-semibold flex items-center gap-1.5">
              <span>UFW 防火墙防护</span>
              <span class="text-[10px] font-mono px-1.5 py-0.2 rounded bg-brand-500/20 text-brand-300 border border-brand-500/30 font-bold">防失联保护</span>
            </div>
            <div class="text-[10px] text-slate-400 mt-0.5 font-mono">
              {{ ufwStatus.status === 'active' ? '已启用防护（自动放行 SSH 及已监听端口）' : '未启用（入站策略开放，点击开启防失联预检）' }}
            </div>
          </div>
          <label class="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              :checked="ufwStatus.status === 'active'"
              :disabled="togglingUfw"
              @change="handleToggleUfw"
              class="sr-only peer"
            />
            <div class="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
          </label>
        </div>

        <!-- Ping Ban Switch -->
        <div class="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
          <div>
            <div class="text-slate-300 font-semibold flex items-center gap-1">
              <span>禁 Ping 隐身保护</span>
              <span class="text-[10px] font-mono text-slate-500">(ICMP Echo)</span>
            </div>
            <div class="text-[10px] text-slate-400 mt-0.5 font-mono">
              {{ pingBanned ? '已开启 (对全网 Ping 隐身)' : '已关闭 (响应 ICMP 探测)' }}
            </div>
          </div>
          <label class="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              :checked="pingBanned"
              :disabled="togglingPing"
              @change="handleTogglePing"
              class="sr-only peer"
            />
            <div class="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-600"></div>
          </label>
        </div>
      </div>

      <!-- 3. Fail2ban Protection Card -->
      <div class="glass-panel p-5 rounded-2xl border border-slate-800 space-y-3">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-slate-400 flex items-center gap-1.5">
            <Radio class="w-3.5 h-3.5 text-rose-400" />
            Fail2ban 防爆破
          </span>
          <span
            class="text-[10px] px-2 py-0.5 rounded-full font-mono border"
            :class="fail2banRunning ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-slate-800 text-slate-400 border-slate-700'"
          >
            ● {{ fail2banRunning ? '已启用防护' : '已停止' }}
          </span>
        </div>
        <div class="flex items-baseline justify-between">
          <div class="text-2xl font-bold font-mono text-rose-400">
            已封禁: {{ bannedIps.length }} 个 IP
          </div>
          <button
            @click="showManualBanModal = true"
            class="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-rose-300 text-xs font-semibold border border-slate-800 transition flex items-center gap-1"
          >
            <Ban class="w-3 h-3" />
            手动拉黑
          </button>
        </div>
        <div class="text-[11px] text-slate-400 font-mono pt-2 border-t border-slate-800/80 flex items-center justify-between">
          <span>防护监狱: <strong class="text-white">sshd</strong></span>
          <span>策略: 5次失败自动拦截</span>
        </div>
      </div>
    </div>

    <!-- Firewall Rules Table -->
    <div class="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
      <div class="px-5 py-3.5 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between text-xs">
        <div class="flex items-center gap-2">
          <span class="font-bold text-white">防火墙核心规则表</span>
          <span class="text-slate-400 font-mono">(iptables / ip6tables 双栈规则)</span>
        </div>
        <span class="text-[11px] text-slate-400 font-mono">共 {{ rules.length }} 条生效规则</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs font-mono">
          <thead>
            <tr class="text-slate-400 border-b border-slate-800/80 bg-slate-950/20">
              <th class="py-3 px-4">协议</th>
              <th class="py-3 px-4">端口 / 范围</th>
              <th class="py-3 px-4">源 IP 策略</th>
              <th class="py-3 px-4">动作策略</th>
              <th class="py-3 px-4">说明备注</th>
              <th class="py-3 px-4 text-right">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-800/60">
            <tr v-for="rule in rules" :key="rule.id" class="hover:bg-slate-800/30 transition">
              <td class="py-3 px-4">
                <span
                  class="px-2 py-0.5 rounded text-[10px] font-bold border"
                  :class="getProtoBadgeClass(rule.protocol)"
                >
                  {{ rule.protocol }}
                </span>
              </td>
              <td class="py-3 px-4 font-bold text-slate-100">
                <span :class="rule.port === '全部端口' ? 'text-slate-400 font-normal' : 'text-brand-300 font-mono'">
                  {{ rule.port }}
                </span>
              </td>
              <td class="py-3 px-4 font-mono text-slate-300">
                <span v-if="rule.source_ip === '0.0.0.0/0'" class="text-slate-400">全部来源 (0.0.0.0/0)</span>
                <span v-else class="text-cyan-300 font-bold">{{ rule.source_ip }}</span>
              </td>
              <td class="py-3 px-4">
                <span
                  v-if="rule.action === 'accept'"
                  class="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                >
                  ACCEPT 放行
                </span>
                <span
                  v-else
                  class="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30"
                >
                  DROP 拦截 (黑名单)
                </span>
              </td>
              <td class="py-3 px-4 text-slate-300 font-sans text-xs">
                {{ rule.description }}
              </td>
              <td class="py-3 px-4 text-right">
                <div class="flex items-center justify-end gap-1.5">
                  <button
                    @click="openEditRuleModal(rule)"
                    class="p-1.5 rounded-lg bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 transition"
                    title="编辑此条防火墙规则"
                  >
                    <Edit2 class="w-3.5 h-3.5" />
                  </button>
                  <button
                    @click="handleDeleteRule(rule)"
                    class="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition"
                    title="在 Linux 内核中删除此条规则"
                  >
                    <Trash2 class="w-3.5 h-3.5" />
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="rules.length === 0">
              <td colspan="6" class="text-center py-8 text-slate-500 text-xs">
                当前暂无自定义防火墙规则
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Banned IP List by Fail2ban -->
    <div class="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
      <div class="px-5 py-3.5 bg-slate-950/60 border-b border-slate-800 flex items-center justify-between text-xs">
        <div class="flex items-center gap-2">
          <span class="font-bold text-white">Fail2ban 恶意封禁 IP 列表</span>
          <span class="text-slate-400 font-mono">(触发密码爆破超限被系统实时拦截)</span>
        </div>
        <button
          @click="showManualBanModal = true"
          class="text-xs text-brand-400 hover:text-brand-300 font-semibold flex items-center gap-1"
        >
          <Plus class="w-3.5 h-3.5" />
          添加黑名单 IP
        </button>
      </div>
      <div class="p-4">
        <div v-if="bannedIps.length === 0" class="text-center py-6 text-slate-500 text-xs font-mono">
          暂无被封禁的恶意 IP，系统防护运行正常
        </div>
        <div v-else class="divide-y divide-slate-800/60 font-mono text-xs">
          <div v-for="(b, idx) in bannedIps" :key="idx" class="py-2.5 flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
              <span class="text-rose-300 font-bold font-mono">{{ b.ip }}</span>
              <span class="text-slate-500">[{{ b.jail }}]</span>
              <span class="text-slate-400 text-[11px] font-sans">{{ b.banned_at }}</span>
            </div>
            <button
              @click="handleUnbanIP(b.ip, b.jail)"
              class="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition border border-slate-700"
            >
              解除封禁
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL 1: SSH CONFIG & SECURITY HARDENING -->
    <Modal v-model="showSshModal" title="SSH 远程服务配置与安全加固" size="md">
      <form @submit.prevent="handleSaveSshConfig" class="space-y-4 text-xs font-sans">
        <!-- Safety Alert -->
        <div class="p-3.5 rounded-xl bg-brand-500/10 border border-brand-500/30 text-slate-300 space-y-1">
          <div class="font-bold text-brand-300 flex items-center gap-1.5">
            <Shield class="w-4 h-4" />
            防失联安全保障机制
          </div>
          <p class="text-[11px] text-slate-400 leading-relaxed">
            修改 SSH 端口会自动在底层 iptables / ip6tables 中同步放行新端口；写入前自动执行 <code class="text-brand-300">sshd -t</code> 进行语法测试，测试未通过自动秒级回滚，避免连接丢失。
          </p>
        </div>

        <div>
          <label class="block text-slate-300 font-semibold mb-1">SSH 服务监听端口 (Port)</label>
          <input
            v-model.number="sshEditForm.port"
            type="number"
            min="1"
            max="65535"
            required
            placeholder="22"
            class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white font-mono text-xs focus:outline-none focus:border-brand-500"
          />
        </div>

        <!-- Toggles -->
        <div class="space-y-2.5 pt-1">
          <div class="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div>
              <div class="text-white font-semibold text-xs">允许 Root 用户远程直接登录 (PermitRootLogin)</div>
              <div class="text-[11px] text-slate-400 mt-0.5">关闭后仅能使用普通用户登录再 sudo 提权，大幅提高安全性</div>
            </div>
            <input type="checkbox" v-model="sshEditForm.allow_root_login" class="w-4 h-4 rounded text-brand-500" />
          </div>

          <div class="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div>
              <div class="text-white font-semibold text-xs">允许使用密码身份认证登录 (PasswordAuthentication)</div>
              <div class="text-[11px] text-slate-400 mt-0.5">如果已配置好 SSH 密钥，强烈建议关闭密码登录以杜绝暴力破解</div>
            </div>
            <input type="checkbox" v-model="sshEditForm.allow_password_auth" class="w-4 h-4 rounded text-brand-500" />
          </div>

          <div class="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div>
              <div class="text-white font-semibold text-xs">允许公钥密钥认证登录 (PubkeyAuthentication)</div>
              <div class="text-[11px] text-slate-400 mt-0.5">建议始终保持开启状态</div>
            </div>
            <input type="checkbox" v-model="sshEditForm.allow_pubkey_auth" class="w-4 h-4 rounded text-brand-500" />
          </div>
        </div>

        <div class="pt-3 flex justify-end gap-3 border-t border-slate-800">
          <button type="button" @click="showSshModal = false" class="px-4 py-2 rounded-xl bg-slate-800 text-slate-300">取消</button>
          <button
            type="submit"
            :disabled="savingSsh"
            class="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold flex items-center gap-1.5 shadow"
          >
            <Loader2 v-if="savingSsh" class="w-3.5 h-3.5 animate-spin" />
            <span>{{ savingSsh ? '正在测试并重载...' : '保存配置并生效' }}</span>
          </button>
        </div>
      </form>
    </Modal>

    <!-- MODAL 2: ADD / EDIT FIREWALL RULE -->
    <Modal v-model="showAddRuleModal" :title="isEditingRule ? '编辑防火墙规则' : '添加防火墙规则'" size="md">
      <form @submit.prevent="handleSaveRule" class="space-y-4 text-xs font-sans">
        <!-- Rule Type Selection -->
        <div class="flex rounded-xl bg-slate-950 p-1 border border-slate-800 font-mono">
          <button
            type="button"
            @click="ruleForm.type = 'port'"
            class="flex-1 py-1.5 rounded-lg font-bold transition"
            :class="ruleForm.type === 'port' ? 'bg-brand-600 text-slate-950' : 'text-slate-400 hover:text-white'"
          >
            🌐 放行端口 (PORT)
          </button>
          <button
            type="button"
            @click="ruleForm.type = 'ip_block'"
            class="flex-1 py-1.5 rounded-lg font-bold transition"
            :class="ruleForm.type === 'ip_block' ? 'bg-rose-600 text-white' : 'text-slate-400 hover:text-white'"
          >
            🚫 拦截恶意 IP (黑名单 DROP)
          </button>
        </div>

        <!-- Port Fields -->
        <template v-if="ruleForm.type === 'port'">
          <div>
            <label class="block text-slate-300 font-semibold mb-1">传输层协议</label>
            <select
              v-model="ruleForm.protocol"
              class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white font-mono text-xs focus:outline-none focus:border-brand-500"
            >
              <option value="tcp">TCP (常见 Web、SSH 端口)</option>
              <option value="udp">UDP (DNS、WireGuard 等)</option>
              <option value="tcp/udp">TCP + UDP (双协议同时放行)</option>
            </select>
          </div>

          <div>
            <label class="block text-slate-300 font-semibold mb-1">端口或端口范围 (如 8080 或 3000:4000)</label>
            <input
              v-model="ruleForm.port"
              type="text"
              required
              placeholder="8080"
              class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white font-mono text-xs focus:outline-none focus:border-brand-500"
            />
          </div>

          <div>
            <label class="block text-slate-300 font-semibold mb-1">来源 IP (默认 0.0.0.0/0 全部放行)</label>
            <input
              v-model="ruleForm.source_ip"
              type="text"
              placeholder="0.0.0.0/0"
              class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white font-mono text-xs focus:outline-none focus:border-brand-500"
            />
          </div>
        </template>

        <!-- IP Block Fields -->
        <template v-else>
          <div>
            <label class="block text-slate-300 font-semibold mb-1">要封禁拦截的来源 IP 地址 (IPv4 或 IPv6)</label>
            <input
              v-model="ruleForm.source_ip"
              type="text"
              required
              placeholder="如 198.51.100.23 或 2001:db8::1"
              class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white font-mono text-xs focus:outline-none focus:border-brand-500"
            />
          </div>
        </template>

        <div>
          <label class="block text-slate-300 font-semibold mb-1">说明备注 (将永久写入 Linux 内核 comment)</label>
          <input
            v-model="ruleForm.description"
            type="text"
            placeholder="如 Node.js 生产环境业务服务"
            class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white text-xs focus:outline-none focus:border-brand-500"
          />
        </div>

        <div class="pt-3 flex justify-end gap-3 border-t border-slate-800">
          <button type="button" @click="showAddRuleModal = false" class="px-4 py-2 rounded-xl bg-slate-800 text-slate-300">取消</button>
          <button
            type="submit"
            :disabled="addingRule"
            class="px-5 py-2 rounded-xl font-bold flex items-center gap-1.5 shadow"
            :class="ruleForm.type === 'ip_block' ? 'bg-rose-600 hover:bg-rose-500 text-white' : 'bg-brand-600 hover:bg-brand-500 text-slate-950'"
          >
            <Loader2 v-if="addingRule" class="w-3.5 h-3.5 animate-spin" />
            <span>{{ addingRule ? (isEditingRule ? '正在保存修改...' : '正在注入内核...') : (isEditingRule ? '保存修改并生效' : (ruleForm.type === 'ip_block' ? '立即加入黑名单' : '添加放行规则')) }}</span>
          </button>
        </div>
      </form>
    </Modal>

    <!-- MODAL 3: FAIL2BAN MANUAL BAN -->
    <Modal v-model="showManualBanModal" title="手动添加 IP 至 Fail2ban 封禁黑名单" size="sm">
      <form @submit.prevent="handleManualBan" class="space-y-4 text-xs font-sans">
        <div>
          <label class="block text-slate-300 font-semibold mb-1">目标恶意 IP 地址</label>
          <input
            v-model="manualBanIp"
            type="text"
            required
            placeholder="如 123.45.67.89"
            class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white font-mono text-xs focus:outline-none focus:border-brand-500"
          />
        </div>
        <div>
          <label class="block text-slate-300 font-semibold mb-1">防护 Jail 规则链</label>
          <select
            v-model="manualBanJail"
            class="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-white font-mono text-xs focus:outline-none focus:border-brand-500"
          >
            <option value="sshd">sshd (SSH 远程防暴力破解)</option>
          </select>
        </div>
        <div class="pt-2 flex justify-end gap-3">
          <button type="button" @click="showManualBanModal = false" class="px-4 py-2 rounded-xl bg-slate-800 text-slate-300">取消</button>
          <button
            type="submit"
            :disabled="banningManual"
            class="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center gap-1.5"
          >
            <Loader2 v-if="banningManual" class="w-3.5 h-3.5 animate-spin" />
            <span>{{ banningManual ? '封禁中...' : '立即封禁' }}</span>
          </button>
        </div>
      </form>
    </Modal>

    <!-- 4. UFW Anti-Lockout Enable Confirmation Modal -->
    <Modal v-model="showUfwEnableModal" title="⚠️ 开启 UFW 防火墙与防失联安全确认" size="lg">
      <div class="space-y-4 font-mono text-xs">
        <div class="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
          <div class="flex items-center gap-2 text-amber-300 font-bold text-xs">
            <AlertTriangle class="w-4 h-4 text-amber-400 shrink-0" />
            <span>高风险操作警示：默认策略变更与防失联预检保障</span>
          </div>
          <p class="text-[11px] text-slate-300 leading-relaxed font-sans">
            启动 UFW 后，Linux 系统底层默认入站策略将转为 <strong class="text-rose-400 font-mono">DROP</strong>（拒绝未显式放行的入站包）。
            为防止 <strong class="text-amber-300">SSH 远程终端失联（当前 GMSSH/代理会话）</strong> 及面板服务中断，系统已通过端口探针自动扫描出以下所有正在监听对外服务的端口，将在开启瞬间<strong>原子预注入白名单</strong>。
          </p>
        </div>

        <div class="space-y-2">
          <div class="flex items-center justify-between text-xs text-slate-300 font-semibold font-sans">
            <span>待自动预先放行端口清单 (建议保持勾选)</span>
            <span v-if="scanningPorts" class="text-brand-400 text-[11px] flex items-center gap-1">
              <Loader2 class="w-3 h-3 animate-spin" />
              正在探针扫描端口...
            </span>
            <span v-else class="text-[11px] text-slate-500 font-mono">已扫描 {{ scannedPorts.length }} 个对外服务端口</span>
          </div>

          <div class="max-h-56 overflow-y-auto space-y-2 p-2 bg-slate-950 rounded-xl border border-slate-800">
            <div
              v-for="item in scannedPorts"
              :key="`${item.port}/${item.protocol}`"
              class="flex items-center justify-between p-2.5 rounded-lg border text-xs"
              :class="item.critical ? 'bg-brand-500/10 border-brand-500/30' : 'bg-slate-900 border-slate-800'"
            >
              <div class="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  v-model="item.selected"
                  :disabled="item.critical"
                  class="rounded border-slate-700 bg-slate-800 text-brand-600 focus:ring-0"
                />
                <div>
                  <div class="font-mono font-bold flex items-center gap-1.5" :class="item.critical ? 'text-brand-300' : 'text-white'">
                    <span>{{ item.port }}/{{ item.protocol.toUpperCase() }}</span>
                    <span v-if="item.critical" class="px-1.5 py-0.2 rounded text-[9px] bg-rose-500/20 text-rose-300 border border-rose-500/30 font-sans">
                      防失联核心 (强制放行)
                    </span>
                  </div>
                  <div class="text-[10px] text-slate-400 font-sans mt-0.5">{{ item.name }}</div>
                </div>
              </div>
              <span class="text-[10px] font-mono" :class="item.selected || item.critical ? 'text-emerald-400 font-bold' : 'text-slate-500'">
                {{ item.selected || item.critical ? '✓ 预注入白名单' : '✕ 忽略' }}
              </span>
            </div>
          </div>
        </div>

        <div class="pt-2">
          <label class="flex items-center gap-2 cursor-pointer text-xs text-slate-300 font-sans bg-slate-900/60 p-3 rounded-xl border border-slate-800">
            <input
              type="checkbox"
              v-model="ufwRiskConfirmed"
              class="rounded border-slate-700 bg-slate-800 text-brand-600 w-4 h-4"
            />
            <span class="leading-relaxed">
              我已知晓 UFW 机制，并确认以上白名单端口已覆盖当前 SSH 远程连接与面板访问需求，同意开启。
            </span>
          </label>
        </div>

        <div class="flex justify-end gap-3 pt-2 border-t border-slate-800">
          <button
            type="button"
            @click="showUfwEnableModal = false"
            :disabled="enablingUfw"
            class="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700 transition"
          >
            取消
          </button>
          <button
            @click="confirmEnableUfw"
            :disabled="!ufwRiskConfirmed || enablingUfw"
            class="px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-bold text-xs transition flex items-center gap-1.5 shadow"
          >
            <Loader2 v-if="enablingUfw" class="w-3.5 h-3.5 animate-spin" />
            <span>{{ enablingUfw ? '正在执行防失联安全开启...' : '确认开启 UFW 防火墙' }}</span>
          </button>
        </div>
      </div>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import {
  Shield, Plus, Trash2, Edit2, Terminal, RefreshCw,
  Globe, Radio, Sliders, Loader2, Ban, AlertTriangle
} from 'lucide-vue-next'
import Modal from '@/components/Modal.vue'
import { FirewallRule, SSHConfig, UfwStatus, ScannedPortItem, securityApi } from '@/api/security'
import { toast } from '@/composables/useToast'

const loading = ref(false)
const showSshModal = ref(false)
const showAddRuleModal = ref(false)
const showManualBanModal = ref(false)

const isEditingRule = ref(false)
const editingRuleOldRawSpec = ref('')

const firewallType = ref('iptables/ip6tables 双栈')
const defaultPolicy = ref('ACCEPT')
const pingBanned = ref(false)
const togglingPing = ref(false)

const ufwStatus = ref<UfwStatus>({
  installed: false,
  status: 'inactive',
  default_incoming: 'deny',
  default_outgoing: 'allow',
  ipv6_enabled: false
})
const loadingUfw = ref(false)
const togglingUfw = ref(false)
const showUfwEnableModal = ref(false)
const scanningPorts = ref(false)
const scannedPorts = ref<ScannedPortItem[]>([])
const ufwRiskConfirmed = ref(false)
const enablingUfw = ref(false)

const rules = ref<FirewallRule[]>([])
const bannedIps = ref<{ ip: string; jail: string; banned_at: string; failures: number }[]>([])
const fail2banRunning = ref(true)

const sshConfig = ref<SSHConfig>({
  port: 22,
  status: 'running',
  allow_password_auth: true,
  allow_root_login: true,
  allow_pubkey_auth: true
})

const sshEditForm = reactive<SSHConfig>({
  port: 22,
  status: 'running',
  allow_password_auth: true,
  allow_root_login: true,
  allow_pubkey_auth: true
})

const savingSsh = ref(false)
const addingRule = ref(false)
const banningManual = ref(false)
const manualBanIp = ref('')
const manualBanJail = ref('sshd')

const ruleForm = reactive({
  type: 'port' as 'port' | 'ip_block',
  protocol: 'tcp',
  port: '',
  source_ip: '0.0.0.0/0',
  description: ''
})

function getProtoBadgeClass(proto: string) {
  const p = proto.toUpperCase()
  if (p === 'TCP') return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
  if (p === 'UDP') return 'bg-purple-500/15 text-purple-300 border-purple-500/30'
  if (p === 'ICMP') return 'bg-amber-500/15 text-amber-300 border-amber-500/30'
  return 'bg-slate-800 text-slate-300 border-slate-700'
}

async function loadUfwStatus() {
  loadingUfw.value = true
  try {
    const res = await securityApi.getUfwStatus()
    if (res.data?.data) {
      ufwStatus.value = res.data.data
    }
  } catch (e: any) {
    console.error('Failed to load UFW status:', e)
  } finally {
    loadingUfw.value = false
  }
}

async function handleToggleUfw() {
  if (ufwStatus.value.status === 'active') {
    if (confirm('确定要停用 UFW 防火墙吗？\n停用后系统底层网络将转为开放直通模式。')) {
      togglingUfw.value = true
      try {
        const res = await securityApi.disableUfw()
        toast.success(res.data.message || 'UFW 防火墙已成功停用')
        await loadAllSecurityData()
      } catch (e: any) {
        toast.error(`停用失败: ${e.message}`)
      } finally {
        togglingUfw.value = false
      }
    }
  } else {
    openUfwEnableModal()
  }
}

async function openUfwEnableModal() {
  showUfwEnableModal.value = true
  ufwRiskConfirmed.value = false
  scanningPorts.value = true
  try {
    const res = await securityApi.scanListeningPorts()
    if (res.data?.data?.ports) {
      scannedPorts.value = res.data.data.ports
    }
  } catch (e: any) {
    toast.error(`扫描在听服务端口失败: ${e.message}`)
  } finally {
    scanningPorts.value = false
  }
}

async function confirmEnableUfw() {
  if (!ufwRiskConfirmed.value) {
    toast.error('请先勾选已知晓 UFW 策略机制并确认白名单端口')
    return
  }
  enablingUfw.value = true
  try {
    const portsToAllow = scannedPorts.value
      .filter(p => p.selected || p.critical)
      .map(p => `${p.port}/${p.protocol}`)
    const res = await securityApi.enableUfw(portsToAllow)
    toast.success(res.data.message || 'UFW 防火墙已成功开启！')
    showUfwEnableModal.value = false
    await loadAllSecurityData()
  } catch (e: any) {
    toast.error(`开启防火墙失败: ${e.message}`)
  } finally {
    enablingUfw.value = false
  }
}

async function loadAllSecurityData() {
  loading.value = true
  try {
    const [rulesRes, sshRes, fRes, ufwRes] = await Promise.all([
      securityApi.getFirewallRules().catch(() => null),
      securityApi.getSSHConfig().catch(() => null),
      securityApi.getFail2banStatus().catch(() => null),
      securityApi.getUfwStatus().catch(() => null)
    ])

    if (rulesRes?.data?.data) {
      rules.value = rulesRes.data.data.rules || []
      firewallType.value = rulesRes.data.data.firewall_type || 'iptables/ip6tables 双栈'
      defaultPolicy.value = rulesRes.data.data.default_policy || 'ACCEPT'
      pingBanned.value = Boolean(rulesRes.data.data.ping_banned)
    }

    if (sshRes?.data?.data) {
      sshConfig.value = sshRes.data.data
    }

    if (fRes?.data?.data) {
      bannedIps.value = fRes.data.data.banned_ips || []
      fail2banRunning.value = fRes.data.data.running
    }

    if (ufwRes?.data?.data) {
      ufwStatus.value = ufwRes.data.data
    }
  } finally {
    loading.value = false
  }
}

async function handleTogglePing(e: Event) {
  const target = e.target as HTMLInputElement
  const shouldBan = target.checked
  togglingPing.value = true
  try {
    const res = await securityApi.setIcmpBan(shouldBan)
    pingBanned.value = shouldBan
    toast.success(res.data.message || (shouldBan ? '已开启禁 Ping 保护' : '已恢复 Ping 响应'))
  } catch (err: any) {
    target.checked = !shouldBan
    toast.error(`操作失败: ${err.message}`)
  } finally {
    togglingPing.value = false
  }
}

function openSshConfigModal() {
  sshEditForm.port = sshConfig.value.port
  sshEditForm.allow_root_login = sshConfig.value.allow_root_login
  sshEditForm.allow_password_auth = sshConfig.value.allow_password_auth
  sshEditForm.allow_pubkey_auth = sshConfig.value.allow_pubkey_auth
  showSshModal.value = true
}

async function handleSaveSshConfig() {
  savingSsh.value = true
  try {
    const res = await securityApi.updateSSHConfig(sshEditForm)
    toast.success(res.data.message || 'SSH 配置已成功保存生效！')
    showSshModal.value = false
    await loadAllSecurityData()
  } catch (err: any) {
    toast.error(`保存失败: ${err.message}`)
  } finally {
    savingSsh.value = false
  }
}

function openAddRuleModal() {
  isEditingRule.value = false
  editingRuleOldRawSpec.value = ''
  ruleForm.type = 'port'
  ruleForm.protocol = 'tcp'
  ruleForm.port = ''
  ruleForm.source_ip = '0.0.0.0/0'
  ruleForm.description = ''
  showAddRuleModal.value = true
}

function openEditRuleModal(rule: FirewallRule) {
  isEditingRule.value = true
  editingRuleOldRawSpec.value = rule.raw_spec || ''
  if (rule.action === 'drop' || rule.port === '全部端口') {
    ruleForm.type = 'ip_block'
    ruleForm.source_ip = rule.source_ip === '0.0.0.0/0' ? '' : rule.source_ip
    ruleForm.port = ''
    ruleForm.protocol = 'tcp'
  } else {
    ruleForm.type = 'port'
    ruleForm.protocol = rule.protocol.toLowerCase() === 'all' ? 'tcp' : rule.protocol.toLowerCase()
    ruleForm.port = rule.port
    ruleForm.source_ip = rule.source_ip
  }
  ruleForm.description = rule.description || ''
  showAddRuleModal.value = true
}

async function handleSaveRule() {
  addingRule.value = true
  try {
    if (isEditingRule.value) {
      const res = await securityApi.updateFirewallRule({
        old_raw_spec: editingRuleOldRawSpec.value,
        type: ruleForm.type,
        protocol: ruleForm.protocol,
        port: ruleForm.port,
        source_ip: ruleForm.source_ip,
        description: ruleForm.description
      })
      toast.success(res.data.message || '防火墙规则修改已在 Linux 内核生效！')
    } else {
      const res = await securityApi.addFirewallRule({
        type: ruleForm.type,
        protocol: ruleForm.protocol,
        port: ruleForm.port,
        source_ip: ruleForm.source_ip,
        description: ruleForm.description
      })
      toast.success(res.data.message || '防火墙规则已添加并在 Linux 内核生效！')
    }
    showAddRuleModal.value = false
    await loadAllSecurityData()
  } catch (e: any) {
    toast.error(`操作失败: ${e.message}`)
  } finally {
    addingRule.value = false
  }
}

async function handleDeleteRule(rule: FirewallRule) {
  if (confirm(`确定要从 Linux 内核中删除此防火墙规则吗？\n[${rule.protocol}] ${rule.port} (${rule.description})`)) {
    try {
      const res = await securityApi.deleteFirewallRule(rule.id, rule.raw_spec)
      toast.success(res.data.message || '防火墙规则已成功删除！')
      await loadAllSecurityData()
    } catch (e: any) {
      toast.error(`删除失败: ${e.message}`)
    }
  }
}

async function handleManualBan() {
  if (!manualBanIp.value.trim()) return
  banningManual.value = true
  try {
    const res = await securityApi.banIP(manualBanIp.value.trim(), manualBanJail.value)
    toast.success(res.data.message || '恶意 IP 已加入封禁黑名单！')
    showManualBanModal.value = false
    manualBanIp.value = ''
    await loadAllSecurityData()
  } catch (err: any) {
    toast.error(`封禁失败: ${err.message}`)
  } finally {
    banningManual.value = false
  }
}

async function handleUnbanIP(ip: string, jail: string) {
  try {
    const res = await securityApi.unbanIP(ip, jail)
    toast.success(res.data.message || `IP [${ip}] 已成功解封！`)
    await loadAllSecurityData()
  } catch (e: any) {
    toast.error(`解封失败: ${e.message}`)
  }
}

onMounted(() => {
  loadAllSecurityData()
})
</script>
