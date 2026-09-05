import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router'

// Core views eagerly loaded for fast first-paint
import LoginView from '@/views/login/LoginView.vue'
import DashboardView from '@/views/dashboard/DashboardView.vue'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: LoginView,
    meta: { requiresAuth: false, title: '登录' }
  },
  {
    path: '/',
    name: 'Dashboard',
    component: DashboardView,
    meta: { requiresAuth: true, title: '系统概览与监控' }
  },
  {
    path: '/sites',
    name: 'Sites',
    component: () => import('@/views/sites/SitesView.vue'),
    meta: { requiresAuth: true, title: '网站管理' }
  },
  {
    path: '/stream',
    name: 'Stream',
    component: () => import('@/views/stream/StreamView.vue'),
    meta: { requiresAuth: true, title: '四层端口转发 (TCP/UDP)' }
  },
  {
    path: '/ssl',
    name: 'SSL',
    component: () => import('@/views/ssl/SSLView.vue'),
    meta: { requiresAuth: true, title: 'SSL 证书管理' }
  },
  {
    path: '/docker',
    name: 'Docker',
    component: () => import('@/views/docker/DockerView.vue'),
    meta: { requiresAuth: true, title: 'Docker 容器与镜像' }
  },
  {
    path: '/databases',
    name: 'Databases',
    component: () => import('@/views/databases/DatabasesView.vue'),
    meta: { requiresAuth: true, title: '数据库管理' }
  },
  {
    path: '/files',
    name: 'Files',
    component: () => import('@/views/files/FilesView.vue'),
    meta: { requiresAuth: true, title: '文件管理' }
  },
  {
    path: '/terminal',
    name: 'Terminal',
    component: () => import('@/views/terminal/TerminalView.vue'),
    meta: { requiresAuth: true, title: 'Web 终端' }
  },
  {
    path: '/appstore',
    name: 'AppStore',
    component: () => import('@/views/appstore/AppStoreView.vue'),
    meta: { requiresAuth: true, title: 'ARM 软件商店' }
  },
  {
    path: '/security',
    name: 'Security',
    component: () => import('@/views/security/SecurityView.vue'),
    meta: { requiresAuth: true, title: '安全防护' }
  },
  {
    path: '/crontab',
    name: 'Crontab',
    component: () => import('@/views/crontab/CrontabView.vue'),
    meta: { requiresAuth: true, title: '计划任务' }
  },
  {
    path: '/logs',
    name: 'Logs',
    component: () => import('@/views/logs/LogsView.vue'),
    meta: { requiresAuth: true, title: '日志中心' }
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/views/settings/SettingsView.vue'),
    meta: { requiresAuth: true, title: '系统设置' }
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('armguard_token')
  if (to.meta.requiresAuth && !token) {
    next('/login')
  } else if (to.path === '/login' && token) {
    next('/')
  } else {
    document.title = `${to.meta.title ? to.meta.title + ' - ' : ''}ArmGuard 面板`
    next()
  }
})

export default router
