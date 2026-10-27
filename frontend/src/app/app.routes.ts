import { inject } from '@angular/core'
import { Routes, Router, CanActivateFn } from '@angular/router'
import { AuthService } from './core/auth.service'
import { unsavedChangesGuard } from './core/unsaved-changes.guard'

const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService)
  const router = inject(Router)
  if (auth.isLoggedIn() || localStorage.getItem('armguard_token')) {
    return true
  }
  return router.parseUrl('/login')
}

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login.component').then((m) => m.LoginComponent),
    title: '登录 - ArmGuard M3',
  },
  {
    path: '',
    loadComponent: () =>
      import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent),
    canActivate: [authGuard],
    title: '首页 - ArmGuard',
  },
  {
    path: 'sites',
    loadComponent: () =>
      import('./pages/sites/sites.component').then((m) => m.SitesComponent),
    canActivate: [authGuard],
    canDeactivate: [unsavedChangesGuard],
    title: '网站与反向代理 - ArmGuard',
  },
  {
    path: 'stream',
    loadComponent: () =>
      import('./pages/stream/stream.component').then((m) => m.StreamComponent),
    canActivate: [authGuard],
    canDeactivate: [unsavedChangesGuard],
    title: '四层端口转发 - ArmGuard',
  },
  {
    path: 'ssl',
    loadComponent: () =>
      import('./pages/ssl/ssl.component').then((m) => m.SslComponent),
    canActivate: [authGuard],
    canDeactivate: [unsavedChangesGuard],
    title: 'SSL 证书中心 - ArmGuard',
  },
  {
    path: 'docker',
    loadComponent: () =>
      import('./pages/docker/docker.component').then((m) => m.DockerComponent),
    canActivate: [authGuard],
    canDeactivate: [unsavedChangesGuard],
    title: 'Docker 容器与镜像 - ArmGuard',
  },
  {
    path: 'databases',
    loadComponent: () =>
      import('./pages/databases/databases.component').then((m) => m.DatabasesComponent),
    canActivate: [authGuard],
    canDeactivate: [unsavedChangesGuard],
    title: '数据库管理 - ArmGuard',
  },
  {
    path: 'files',
    loadComponent: () =>
      import('./pages/files/files.component').then((m) => m.FilesComponent),
    canActivate: [authGuard],
    canDeactivate: [unsavedChangesGuard],
    title: 'Web 文件管理 - ArmGuard',
  },
  {
    path: 'terminal',
    loadComponent: () =>
      import('./pages/terminal/terminal.component').then((m) => m.TerminalComponent),
    canActivate: [authGuard],
    title: 'Web 终端 - ArmGuard',
  },
  {
    path: 'appstore',
    loadComponent: () =>
      import('./pages/appstore/appstore.component').then((m) => m.AppstoreComponent),
    canActivate: [authGuard],
    canDeactivate: [unsavedChangesGuard],
    title: '软件商店 - ArmGuard',
  },
  {
    path: 'security',
    loadComponent: () =>
      import('./pages/security/security.component').then((m) => m.SecurityComponent),
    canActivate: [authGuard],
    canDeactivate: [unsavedChangesGuard],
    title: '安全防护 - ArmGuard',
  },
  {
    path: 'crontab',
    loadComponent: () =>
      import('./pages/crontab/crontab.component').then((m) => m.CrontabComponent),
    canActivate: [authGuard],
    canDeactivate: [unsavedChangesGuard],
    title: '计划任务 - ArmGuard',
  },
  {
    path: 'logs',
    loadComponent: () =>
      import('./pages/logs/logs.component').then((m) => m.LogsComponent),
    canActivate: [authGuard],
    title: '日志与审计中心 - ArmGuard',
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./pages/settings/settings.component').then((m) => m.SettingsComponent),
    canActivate: [authGuard],
    canDeactivate: [unsavedChangesGuard],
    title: '面板核心设置 - ArmGuard',
  },
  { path: '**', redirectTo: '' },
]
