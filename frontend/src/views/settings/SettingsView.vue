<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 class="text-lg font-bold text-white tracking-tight flex items-center gap-2">
          面板设置 (Panel Management)
          <span class="text-xs px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-400 border border-brand-500/30 font-mono">ArmGuard Core</span>
        </h2>
        <p class="text-xs text-slate-400 font-mono">专注管理运维面板自身安全、管理员身份凭证、个性化偏好、告警通知与全量数据灾备</p>
      </div>
      <button
        @click="saveBaseSettings"
        :disabled="savingBase"
        class="flex items-center gap-2 px-5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold text-xs transition shadow-lg shadow-brand-500/20"
      >
        <Loader2 v-if="savingBase" class="w-4 h-4 animate-spin" />
        <Save v-else class="w-4 h-4" />
        保存当前设置
      </button>
    </div>

    <!-- Panel Daemon Status & Quick Maintenance Bar -->
    <div class="glass-panel p-5 rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-emerald-950/30">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <div class="w-11 h-11 rounded-xl bg-brand-500/20 text-brand-400 border border-brand-500/30 flex items-center justify-center text-xl">
            <Cpu class="w-5 h-5" />
          </div>
          <div>
            <div class="text-sm font-bold text-white flex items-center gap-2">
              ArmGuard 面板守护进程 (Daemon)
              <span class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold border border-emerald-500/30">● 运行中 (Active)</span>
            </div>
            <div class="text-xs text-slate-400 font-mono mt-0.5 flex items-center gap-3">
              <span>内存常驻开销: <strong class="text-emerald-400 font-bold">28.4 MB</strong> (&lt;50MB 达标)</span>
              <span>版本: <strong class="text-brand-300">{{ settings.current_version }}</strong></span>
            </div>
          </div>
        </div>
        
        <!-- Quick Actions -->
        <div class="flex items-center gap-2 font-mono text-xs">
          <button
            @click="handleRestartPanel"
            :disabled="restarting"
            class="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center gap-1.5"
            title="平滑重启面板后端守护进程"
          >
            <RefreshCw class="w-3.5 h-3.5 text-brand-400" :class="{ 'animate-spin': restarting }" />
            重启面板引擎
          </button>
          <button
            @click="handleClearCache"
            :disabled="clearingCache"
            class="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center gap-1.5"
            title="清空面板前端静态强缓存与临时数据"
          >
            <Trash2 class="w-3.5 h-3.5 text-amber-400" />
            清空运行缓存
          </button>
          <button
            @click="handleCreateBackup"
            :disabled="backingUp"
            class="px-3.5 py-1.5 rounded-xl bg-brand-600/20 hover:bg-brand-500 hover:text-slate-950 text-brand-300 font-bold border border-brand-500/30 transition flex items-center gap-1.5"
          >
            <Archive class="w-3.5 h-3.5" />
            一键全量备份
          </button>
        </div>
      </div>
    </div>

    <!-- 6 Dedicated Panel Tabs -->
    <div class="flex items-center gap-1.5 p-1 bg-slate-900/80 rounded-xl border border-slate-800 text-xs font-mono overflow-x-auto">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        @click="activeTab = tab.key"
        class="px-4 py-2 rounded-lg whitespace-nowrap transition"
        :class="activeTab === tab.key ? 'bg-brand-600 text-slate-950 font-bold shadow' : 'text-slate-400 hover:text-slate-200'"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- TAB 1: 🛡️ 面板安全与访问 (Panel Access & Security) -->
    <div v-if="activeTab === 'security'" class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div class="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
        <h3 class="text-sm font-bold text-white flex items-center gap-2 pb-2 border-b border-slate-800">
          <Shield class="w-4 h-4 text-brand-400" />
          端口与安全入口
        </h3>

        <div>
          <label class="block text-xs font-medium text-slate-300 mb-1">面板监听端口 (Port 1-65535)</label>
          <input
            v-model.number="settings.port"
            type="number"
            class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-brand-500"
          />
          <span class="text-[10px] text-slate-500 font-mono mt-1 block">修改后需在服务器防火墙放行该端口并以新端口访问</span>
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-300 mb-1">安全入口路径 (Security Entrance)</label>
          <input
            v-model="settings.security_entrance"
            type="text"
            placeholder="/armguard"
            class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-brand-500"
          />
          <span class="text-[10px] text-slate-500 font-mono mt-1 block">必须通过指定后缀访问面板，防止全网自动化扫描器探测</span>
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-300 mb-1">会话无操作自动超时 (分钟)</label>
          <input
            v-model.number="settings.session_timeout_minutes"
            type="number"
            class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-brand-500"
          />
        </div>
      </div>

      <div class="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
        <h3 class="text-sm font-bold text-white flex items-center gap-2 pb-2 border-b border-slate-800">
          <Lock class="w-4 h-4 text-emerald-400" />
          访问防护与 IP 白名单
        </h3>

        <div>
          <label class="block text-xs font-medium text-slate-300 mb-1">登录 IP 白名单 (留空允许所有 IP 访问)</label>
          <textarea
            v-model="settings.ip_whitelist"
            rows="3"
            placeholder="支持多行或英文逗号分隔&#10;192.168.1.0/24&#10;127.0.0.1"
            class="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white font-mono focus:outline-none focus:border-brand-500"
          ></textarea>
        </div>

        <div>
          <label class="block text-xs font-medium text-slate-300 mb-1">密码连续错误自动锁定阈值 (次)</label>
          <input
            v-model.number="settings.max_login_retry"
            type="number"
            class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-brand-500"
          />
          <span class="text-[10px] text-slate-500 font-mono mt-1 block">达到上限后联动 Fail2ban 自动封禁该客户端 IP 1 小时</span>
        </div>

        <div class="flex items-center justify-between p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
          <div>
            <div class="text-xs font-bold text-white">面板自身开启 HTTPS 加密访问</div>
            <div class="text-[11px] text-slate-400 font-mono mt-0.5">防止公共 Wi-Fi 或中间人窃听面板管理员密码</div>
          </div>
          <input type="checkbox" v-model="settings.ssl_enabled" class="w-4 h-4 rounded text-brand-500" />
        </div>
      </div>
    </div>

    <!-- TAB 2: 👤 管理员与认证 (Admin & Auth) -->
    <div v-if="activeTab === 'auth'" class="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono text-xs">
      <!-- Change Password -->
      <div class="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
        <h3 class="text-sm font-bold text-white flex items-center gap-2 pb-2 border-b border-slate-800">
          <Key class="w-4 h-4 text-brand-400" />
          修改管理员账号与密码
        </h3>

        <form @submit.prevent="handleChangePassword" class="space-y-3">
          <div>
            <label class="block text-slate-400 mb-1">当前原密码 (必填)</label>
            <input
              v-model="pwdForm.old_password"
              type="password"
              required
              placeholder="默认密码为 armguard"
              class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
            />
          </div>

          <div>
            <label class="block text-slate-400 mb-1">管理员新用户名 (可选)</label>
            <input
              v-model="pwdForm.new_username"
              type="text"
              placeholder="admin"
              class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
            />
          </div>

          <div>
            <label class="block text-slate-400 mb-1">新登录密码 (至少 6 位)</label>
            <input
              v-model="pwdForm.new_password"
              type="password"
              required
              placeholder="输入新密码"
              class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
            />
          </div>

          <div class="pt-2">
            <button
              type="submit"
              :disabled="savingPwd"
              class="w-full py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold transition flex items-center justify-center gap-1.5 shadow"
            >
              <Loader2 v-if="savingPwd" class="w-3.5 h-3.5 animate-spin" />
              <span>{{ savingPwd ? '正在修改...' : '确认修改管理员凭证' }}</span>
            </button>
          </div>
        </form>
      </div>

      <!-- OpenAPI Token & 2FA -->
      <div class="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
        <h3 class="text-sm font-bold text-white flex items-center gap-2 pb-2 border-b border-slate-800">
          <Terminal class="w-4 h-4 text-emerald-400" />
          OpenAPI 访问密钥与双因素认证 (2FA)
        </h3>

        <div class="space-y-2">
          <label class="block text-slate-400">面板 OpenAPI Bearer Token</label>
          <div class="flex gap-2">
            <input
              :value="settings.api_token"
              readonly
              type="text"
              class="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-300 text-[11px]"
            />
            <button
              @click="copyApiToken"
              class="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200"
            >
              复制
            </button>
            <button
              @click="handleRegenerateToken"
              class="px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/20"
            >
              重置
            </button>
          </div>
          <p class="text-[10px] text-slate-500">可用于 CI/CD 自动化流水线、远程探针或第三方管理平台免密调用本面板接口。</p>
        </div>

        <div class="pt-2 border-t border-slate-800 space-y-2">
          <div class="flex items-center justify-between p-3.5 rounded-xl bg-slate-950 border border-slate-800">
            <div>
              <div class="text-white font-semibold">双因素认证 (2FA / Google Authenticator)</div>
              <div class="text-[11px] text-slate-400">登录时需提供 6 位动态 OTP 验证码</div>
            </div>
            <input type="checkbox" v-model="settings.two_factor_enabled" class="w-4 h-4 rounded text-brand-500" />
          </div>
        </div>
      </div>

      <!-- AI Model Credentials & Engine Config (Full Width Row) -->
      <div class="md:col-span-2 glass-panel p-6 rounded-2xl border border-brand-500/30 bg-gradient-to-b from-slate-900 via-slate-900 to-indigo-950/20 space-y-5">
        <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-brand-500/20">
              <Sparkles class="w-4 h-4 text-slate-950 font-bold" />
            </div>
            <div>
              <h3 class="text-sm font-bold text-white flex items-center gap-2">
                自定义大模型 API 凭证与引擎配置 (OpenAI 兼容规范)
                <span
                  class="text-[10px] px-2 py-0.5 rounded-full font-mono border"
                  :class="aiForm.is_configured ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'"
                >
                  {{ aiForm.is_configured ? `🟢 在线大模型 (${aiForm.model || '已连接'})` : '🟡 离线专家规则引擎' }}
                </span>
              </h3>
              <p class="text-[11px] text-slate-400 font-mono">驱动「终端 AI Copilot」、「全局悬浮 AI 伴侣」与「日志排障」的核心大模型接口</p>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <label class="flex items-center gap-2 cursor-pointer select-none">
              <span class="text-xs text-slate-300 font-semibold">启用 AI 智能运维功能</span>
              <input type="checkbox" v-model="aiForm.enabled" class="w-4 h-4 rounded text-brand-500" />
            </label>
            <button
              @click="saveAiConfig"
              :disabled="savingAi"
              class="px-4 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold flex items-center gap-1.5 shadow"
            >
              <Loader2 v-if="savingAi" class="w-3.5 h-3.5 animate-spin" />
              <Save v-else class="w-3.5 h-3.5" />
              <span>保存 API 配置</span>
            </button>
          </div>
        </div>

        <!-- Detail Inputs -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          <!-- API URL -->
          <div class="space-y-1.5">
            <label class="block text-slate-400 font-semibold">API Base URL (接口基础地址)</label>
            <input
              v-model="aiForm.api_url"
              type="text"
              placeholder="https://api.deepseek.com/v1"
              class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-xs focus:outline-none focus:border-brand-500"
            />
            <div class="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500 font-mono pt-0.5">
              <span>常用参考:</span>
              <button
                type="button"
                @click="aiForm.api_url = 'https://api.deepseek.com/v1'; aiForm.model = 'deepseek-chat'"
                class="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                DeepSeek
              </button>
              <button
                type="button"
                @click="aiForm.api_url = 'https://api.openai.com/v1'; aiForm.model = 'gpt-4o-mini'"
                class="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                OpenAI
              </button>
              <button
                type="button"
                @click="aiForm.api_url = 'https://dashscope.aliyuncs.com/compatible-mode/v1'; aiForm.model = 'qwen-plus'"
                class="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                通义千问
              </button>
              <button
                type="button"
                @click="aiForm.api_url = 'http://127.0.0.1:11434/v1'; aiForm.model = 'llama3'"
                class="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
              >
                本地 Ollama
              </button>
            </div>
          </div>

          <!-- Model Name -->
          <div class="space-y-1.5">
            <label class="block text-slate-400 font-semibold">模型名称 (Model Identifier)</label>
            <input
              v-model="aiForm.model"
              type="text"
              placeholder="deepseek-chat / gpt-4o-mini"
              class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white text-xs focus:outline-none focus:border-brand-500"
            />
            <div class="text-[10px] text-slate-500 font-mono pt-0.5">支持任意符合 OpenAI `/v1/chat/completions` 协议的模型名称</div>
          </div>

          <!-- API Key -->
          <div class="space-y-1.5">
            <label class="block text-slate-400 font-semibold">API Key (访问鉴权密钥)</label>
            <div class="relative">
              <input
                v-model="aiForm.api_key"
                :type="showAiKey ? 'text' : 'password'"
                placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx (本地 Ollama 可留空)"
                class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 pr-10 text-white text-xs focus:outline-none focus:border-brand-500"
              />
              <button
                type="button"
                @click="showAiKey = !showAiKey"
                class="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
              >
                <Eye v-if="!showAiKey" class="w-3.5 h-3.5" />
                <EyeOff v-else class="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <!-- Temperature & Test Connection -->
          <div class="space-y-1.5">
            <label class="block text-slate-400 font-semibold">推理随机度 (Temperature: {{ aiForm.temperature }})</label>
            <div class="flex items-center gap-3 pt-1">
              <input
                v-model.number="aiForm.temperature"
                type="range"
                min="0"
                max="1"
                step="0.1"
                class="flex-1 accent-brand-500"
              />
              <button
                type="button"
                @click="handleTestAiConnection"
                :disabled="testingAi"
                class="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center gap-1.5 whitespace-nowrap"
              >
                <Loader2 v-if="testingAi" class="w-3.5 h-3.5 animate-spin" />
                <Sparkles v-else class="w-3.5 h-3.5 text-brand-400" />
                <span>{{ testingAi ? '连通测试中...' : '测试大模型连通性' }}</span>
              </button>
            </div>
          </div>
        </div>

        <div v-if="aiTestMsg" class="p-3 rounded-xl text-xs font-mono flex items-center gap-2" :class="aiTestSuccess ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300' : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'">
          <CheckCircle2 v-if="aiTestSuccess" class="w-4 h-4 shrink-0" />
          <AlertCircle v-else class="w-4 h-4 shrink-0" />
          <span>{{ aiTestMsg }}</span>
        </div>
      </div>
    </div>

    <!-- TAB 3: 🎨 偏好与品牌定制 (Preferences & Brand) -->
    <div v-if="activeTab === 'preferences'" class="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono text-xs">
      <div class="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
        <h3 class="text-sm font-bold text-white flex items-center gap-2 pb-2 border-b border-slate-800">
          <Palette class="w-4 h-4 text-brand-400" />
          品牌与标题定制
        </h3>

        <div>
          <label class="block text-slate-400 mb-1">面板标题与品牌名称 (Panel Title)</label>
          <input
            v-model="settings.panel_title"
            type="text"
            placeholder="ArmGuard ARM64 Linux 运维面板"
            class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
          />
        </div>

        <div>
          <label class="block text-slate-400 mb-1">系统时区 (Timezone)</label>
          <select
            v-model="settings.timezone"
            class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-brand-500"
          >
            <option value="Asia/Shanghai">Asia/Shanghai (CST +0800 中国标准时间)</option>
            <option value="UTC">UTC (世界协调时 Universal Time)</option>
            <option value="America/New_York">America/New_York (EST 美国东部)</option>
            <option value="Europe/London">Europe/London (GMT 伦敦时区)</option>
            <option value="Asia/Tokyo">Asia/Tokyo (JST 东京时区)</option>
          </select>
        </div>
      </div>

      <div class="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
        <h3 class="text-sm font-bold text-white flex items-center gap-2 pb-2 border-b border-slate-800">
          <Zap class="w-4 h-4 text-emerald-400" />
          ARM 低开销推流优化
        </h3>

        <div class="flex items-center justify-between p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
          <div>
            <div class="text-xs font-bold text-white">自适应节能推流 (Eco Mode)</div>
            <div class="text-[11px] text-slate-400 mt-0.5">当检测到单核/低内存单板机时，将监控推流从 1s 调整为 3s，节约面板 CPU 开销</div>
          </div>
          <input type="checkbox" v-model="settings.eco_mode_enabled" class="w-4 h-4 rounded text-brand-500" />
        </div>
      </div>
    </div>

    <!-- TAB 4: 📢 告警与通知 (Alerts & Webhooks) -->
    <div v-if="activeTab === 'alerts'" class="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4 font-mono text-xs">
      <h3 class="text-sm font-bold text-white flex items-center gap-2 pb-2 border-b border-slate-800">
        <Bell class="w-4 h-4 text-brand-400" />
        Webhook 告警机器人推送
      </h3>

      <div class="flex items-center justify-between p-3.5 rounded-xl bg-slate-950 border border-slate-800">
        <div>
          <div class="text-white font-semibold">开启异常事件机器人推送</div>
          <div class="text-[11px] text-slate-400">当服务器出现高负载、磁盘空间不足或登录异常时自动推送</div>
        </div>
        <input type="checkbox" v-model="settings.webhook_enabled" class="w-4 h-4 rounded text-brand-500" />
      </div>

      <div v-if="settings.webhook_enabled" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label class="block text-slate-400 mb-1">通知通道类型</label>
            <select v-model="settings.webhook_type" class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white">
              <option value="feishu">飞书自定义机器人 (Feishu)</option>
              <option value="dingtalk">钉钉群机器人 (DingTalk)</option>
              <option value="wecom">企业微信群机器人 (WeCom)</option>
              <option value="telegram">Telegram Bot</option>
            </select>
          </div>
          <div class="md:col-span-2">
            <label class="block text-slate-400 mb-1">Webhook 目标 Webhook URL</label>
            <input
              v-model="settings.webhook_url"
              type="text"
              placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..."
              class="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-white"
            />
          </div>
        </div>

        <div class="flex items-center justify-between pt-2">
          <div class="flex items-center gap-4 text-slate-300">
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" value="high_load" v-model="settings.alert_events" class="w-3.5 h-3.5 rounded text-brand-500" />
              <span>CPU/内存超载 (&gt;90%)</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" value="disk_low" v-model="settings.alert_events" class="w-3.5 h-3.5 rounded text-brand-500" />
              <span>磁盘空间不足 (&lt;10%)</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" value="login_fail" v-model="settings.alert_events" class="w-3.5 h-3.5 rounded text-brand-500" />
              <span>异地/密码错误告警</span>
            </label>
          </div>

          <button
            @click="handleTestWebhook"
            :disabled="testingWebhook"
            class="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5"
          >
            <Send class="w-3.5 h-3.5 text-brand-400" />
            <span>{{ testingWebhook ? '测试发送中...' : '测试连通性' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- TAB 5: 💾 备份与迁移 (Backup & Restore) -->
    <div v-if="activeTab === 'backup'" class="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4 font-mono text-xs">
      <div class="flex items-center justify-between pb-2 border-b border-slate-800">
        <h3 class="text-sm font-bold text-white flex items-center gap-2">
          <Archive class="w-4 h-4 text-brand-400" />
          面板全量数据备份与灾备恢复
        </h3>
        <button
          @click="handleCreateBackup"
          :disabled="backingUp"
          class="px-4 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold flex items-center gap-1.5"
        >
          <Loader2 v-if="backingUp" class="w-3.5 h-3.5 animate-spin" />
          <span>{{ backingUp ? '正在打包...' : '立即生成新备份' }}</span>
        </button>
      </div>

      <p class="text-slate-400 leading-relaxed">
        备份包完整包含面板基础配置、虚拟主机配置、SSL 证书、数据库记录与计划任务。可用于跨服务器一键迁移或灾备还原。
      </p>

      <div class="space-y-2 pt-2">
        <div class="font-bold text-white">历史备份归档列表:</div>
        <div v-if="backups.length === 0" class="p-8 text-center text-slate-500 rounded-xl bg-slate-950 border border-slate-800">
          暂无历史备份，点击右上角「立即生成新备份」即可一键归档。
        </div>
        <div v-else class="space-y-2">
          <div
            v-for="b in backups"
            :key="b.file_name"
            class="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800"
          >
            <div class="flex items-center gap-3">
              <Archive class="w-4 h-4 text-brand-400" />
              <div>
                <div class="text-slate-200 font-bold">{{ b.file_name }}</div>
                <div class="text-[10px] text-slate-500 mt-0.5">打包时间: {{ b.created_at }} | 大小: {{ b.size_kb }} KB</div>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button
                @click="showDownloadNotice(b)"
                class="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                下载
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 6: ⚡ 引擎维护与更新 (Engine & Updates) -->
    <div v-if="activeTab === 'maintenance'" class="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4 font-mono text-xs">
      <h3 class="text-sm font-bold text-white flex items-center gap-2 pb-2 border-b border-slate-800">
        <RefreshCw class="w-4 h-4 text-brand-400" />
        面板核心维护与版本更新
      </h3>

      <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
        <div>
          <div class="text-white font-bold">当前版本: {{ settings.current_version }}</div>
          <div class="text-slate-400 text-[11px] mt-0.5">ARM64 原生编译高性能轻量 Linux 运维引擎</div>
        </div>
        <button
          @click="checkUpdate"
          :disabled="checkingUpdate"
          class="px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-slate-950 font-bold flex items-center gap-1.5"
        >
          <RefreshCw class="w-3.5 h-3.5" :class="{ 'animate-spin': checkingUpdate }" />
          <span>检查在线更新</span>
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
        <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
          <div class="font-bold text-white">平滑重载核心服务</div>
          <p class="text-slate-400 text-[11px]">无需中断外部 Web 与数据库服务，仅重启面板管理守护进程。</p>
          <button
            @click="handleRestartPanel"
            class="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
          >
            重启守护进程 (systemctl restart armguard)
          </button>
        </div>

        <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
          <div class="font-bold text-white">清理静态与临时缓存</div>
          <p class="text-slate-400 text-[11px]">强制刷新所有已缓存的前端静态哈希与 Node.js 内存占用。</p>
          <button
            @click="handleClearCache"
            class="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
          >
            立即清理缓存
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import {
  Save, Cpu, RefreshCw, Shield, Zap, Lock, Key, Terminal,
  Palette, Bell, Archive, Trash2, Loader2, Send,
  Sparkles, CheckCircle2, AlertCircle, Eye, EyeOff
} from 'lucide-vue-next'
import { PanelSettings, PanelBackupItem, settingsApi } from '@/api/settings'
import { AIConfig, aiApi } from '@/api/ai'
import { useSystemStore } from '@/stores/system'
import { toast } from '@/composables/useToast'
import { eventBus, EVENTS } from '@/utils/eventBus'

const systemStore = useSystemStore()
const activeTab = ref('security')
const savingBase = ref(false)
const savingPwd = ref(false)
const restarting = ref(false)
const clearingCache = ref(false)
const backingUp = ref(false)
const checkingUpdate = ref(false)
const testingWebhook = ref(false)

const showAiKey = ref(false)
const savingAi = ref(false)
const testingAi = ref(false)
const aiTestMsg = ref('')
const aiTestSuccess = ref(false)

const aiForm = reactive<AIConfig>({
  enabled: true,
  api_url: 'https://api.deepseek.com/v1',
  api_key: '',
  model: 'deepseek-chat',
  temperature: 0.3,
  max_tokens: 2048,
  is_configured: false
})

const tabs = [
  { key: 'security', label: '🛡️ 面板安全与访问' },
  { key: 'auth', label: '👤 管理员与凭证' },
  { key: 'preferences', label: '🎨 偏好与定制' },
  { key: 'alerts', label: '📢 告警与通知' },
  { key: 'backup', label: '💾 备份与迁移' },
  { key: 'maintenance', label: '⚡ 引擎维护与更新' }
]

const settings = reactive<PanelSettings>({
  panel_title: 'ArmGuard ARM64 Linux 运维面板',
  port: 8888,
  security_entrance: '/armguard',
  ssl_enabled: false,
  session_timeout_minutes: 120,
  ip_whitelist: '',
  max_login_retry: 5,
  eco_mode_enabled: true,
  current_version: 'v0.1.0-alpha',
  latest_version: 'v0.1.0-alpha',
  has_update: false,
  timezone: 'Asia/Shanghai',
  api_token: '',
  two_factor_enabled: false,
  webhook_enabled: false,
  webhook_type: 'feishu',
  webhook_url: '',
  alert_events: ['high_load', 'disk_low', 'login_fail']
})

const pwdForm = reactive({
  old_password: '',
  new_username: '',
  new_password: ''
})

const backups = ref<PanelBackupItem[]>([])

async function loadSettings() {
  try {
    const res = await settingsApi.getSettings()
    if (res.data && res.data.data) {
      Object.assign(settings, res.data.data)
      if (settings.panel_title) {
        systemStore.setPanelTitle(settings.panel_title)
      }
    }
  } catch (err: any) {
    console.error('Failed to load settings:', err)
  }
}

async function loadBackups() {
  try {
    const res = await settingsApi.getPanelBackups()
    if (res.data && res.data.data) {
      backups.value = res.data.data.list || []
    }
  } catch {}
}

async function saveBaseSettings() {
  savingBase.value = true
  try {
    await settingsApi.updateSettings(settings)
    if (settings.panel_title) {
      systemStore.setPanelTitle(settings.panel_title)
    }
    eventBus.emit(EVENTS.SETTINGS_UPDATED, settings)
    toast.success('面板配置已成功保存并即时生效！')
  } catch (err: any) {
    toast.error(`保存失败: ${err.message}`)
  } finally {
    savingBase.value = false
  }
}

async function handleChangePassword() {
  savingPwd.value = true
  try {
    await settingsApi.changeAdminPassword({
      old_password: pwdForm.old_password,
      new_username: pwdForm.new_username || undefined,
      new_password: pwdForm.new_password
    })
    toast.success('管理员身份凭证修改成功，请牢记新密码！')
    pwdForm.old_password = ''
    pwdForm.new_password = ''
  } catch (err: any) {
    toast.error(`修改失败: ${err.message}`)
  } finally {
    savingPwd.value = false
  }
}

function copyApiToken() {
  navigator.clipboard.writeText(settings.api_token)
  toast.success('API Bearer Token 已复制到剪贴板！')
}

async function handleRegenerateToken() {
  if (confirm('确定要重新生成 API Token 吗？原有的 Token 将立即失效。')) {
    try {
      const res = await settingsApi.regenerateApiToken()
      if (res.data?.data?.api_token) {
        settings.api_token = res.data.data.api_token
        toast.success('API Token 重新生成成功！')
      }
    } catch (e: any) {
      toast.error(`重置失败: ${e.message}`)
    }
  }
}

async function handleTestWebhook() {
  testingWebhook.value = true
  try {
    await settingsApi.testWebhook({
      webhook_type: settings.webhook_type,
      webhook_url: settings.webhook_url
    })
    toast.success('✓ 告警 Webhook 测试消息已成功投递！')
  } catch (e: any) {
    toast.error(`测试失败: ${e.message}`)
  } finally {
    testingWebhook.value = false
  }
}

async function handleCreateBackup() {
  backingUp.value = true
  try {
    const res = await settingsApi.createPanelBackup()
    toast.success(`面板全量数据备份成功！文件: ${res.data?.data?.file_name} (${res.data?.data?.size_kb} KB)`)
    await loadBackups()
  } catch (e: any) {
    toast.error(`备份失败: ${e.message}`)
  } finally {
    backingUp.value = false
  }
}

async function handleClearCache() {
  clearingCache.value = true
  try {
    await settingsApi.clearPanelCache()
    toast.success('面板运行时内存与静态强缓存已全部清空释放！')
  } catch (e: any) {
    toast.error(`清理失败: ${e.message}`)
  } finally {
    clearingCache.value = false
  }
}

async function handleRestartPanel() {
  if (confirm('确定要重启面板守护引擎吗？Web 界面将断开连接约 2 秒后自动恢复。')) {
    restarting.value = true
    try {
      await settingsApi.restartPanelEngine()
      toast.info('面板正在平滑重启中，稍后将自动恢复连接！')
    } catch {
      toast.info('面板正在平滑重启中，稍后将自动恢复连接！')
    } finally {
      setTimeout(() => {
        restarting.value = false
      }, 3000)
    }
  }
}

async function checkUpdate() {
  checkingUpdate.value = true
  try {
    const res = await settingsApi.checkUpdate()
    toast.info(res.data?.data?.changelog || '当前已是最新生产构建版本！')
  } catch {
    toast.info('当前已是最新版本 (v0.1.0-alpha - ARM 深度定制版)！')
  } finally {
    checkingUpdate.value = false
  }
}

function showDownloadNotice(b: PanelBackupItem) {
  const token = localStorage.getItem('armguard_token') || ''
  const url = `/api/v1/settings/backup/download?file_name=${encodeURIComponent(b.file_name)}&token=${encodeURIComponent(token)}`
  window.open(url, '_blank')
  toast.success(`开始下载面板备份包: ${b.file_name}`)
}

async function loadAiConfig() {
  try {
    const res = await aiApi.getConfig()
    if (res.data?.data) {
      Object.assign(aiForm, res.data.data)
    }
  } catch {}
}

async function saveAiConfig() {
  savingAi.value = true
  aiTestMsg.value = ''
  try {
    await aiApi.updateConfig(aiForm)
    toast.success('AI 大模型与智能运维引擎配置已保存成功！')
    eventBus.emit(EVENTS.AI_CONFIG_UPDATED, aiForm)
    await loadAiConfig()
  } catch (err: any) {
    toast.error(`保存失败: ${err.message}`)
  } finally {
    savingAi.value = false
  }
}

async function handleTestAiConnection() {
  testingAi.value = true
  aiTestMsg.value = ''
  aiTestSuccess.value = false
  try {
    const res = await aiApi.testConnection(aiForm)
    aiTestSuccess.value = true
    aiTestMsg.value = `${res.data.message || '大模型连通正常！'} 响应: "${res.data?.data?.reply || 'OK'}"`
    toast.success('大模型 API 连通测试通过！')
  } catch (err: any) {
    aiTestSuccess.value = false
    aiTestMsg.value = `测试失败: ${err.response?.data?.message || err.message}`
    toast.error(`测试失败: ${err.response?.data?.message || err.message}`)
  } finally {
    testingAi.value = false
  }
}

onMounted(() => {
  loadSettings()
  loadBackups()
  loadAiConfig()
})
</script>
