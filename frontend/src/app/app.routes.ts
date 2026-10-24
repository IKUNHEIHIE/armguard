import { inject } from '@angular/core'
import { Routes, Router, CanActivateFn } from '@angular/router'
import { AuthService } from './core/auth.service'

import { LoginComponent } from './pages/login/login.component'
import { DashboardComponent } from './pages/dashboard/dashboard.component'
import { SitesComponent } from './pages/sites/sites.component'
import { StreamComponent } from './pages/stream/stream.component'
import { SslComponent } from './pages/ssl/ssl.component'
import { DockerComponent } from './pages/docker/docker.component'
import { DatabasesComponent } from './pages/databases/databases.component'
import { FilesComponent } from './pages/files/files.component'
import { TerminalComponent } from './pages/terminal/terminal.component'
import { AppstoreComponent } from './pages/appstore/appstore.component'
import { SecurityComponent } from './pages/security/security.component'
import { CrontabComponent } from './pages/crontab/crontab.component'
import { LogsComponent } from './pages/logs/logs.component'
import { SettingsComponent } from './pages/settings/settings.component'

const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService)
  const router = inject(Router)
  if (auth.isLoggedIn() || localStorage.getItem('armguard_token')) {
    return true
  }
  return router.parseUrl('/login')
}

export const routes: Routes = [
  { path: 'login', component: LoginComponent, title: '登录 - ArmGuard M3' },
  { path: '', component: DashboardComponent, canActivate: [authGuard], title: '系统概览与硅片监控 - ArmGuard' },
  { path: 'sites', component: SitesComponent, canActivate: [authGuard], title: '网站与反向代理 - ArmGuard' },
  { path: 'stream', component: StreamComponent, canActivate: [authGuard], title: '四层端口转发 - ArmGuard' },
  { path: 'ssl', component: SslComponent, canActivate: [authGuard], title: 'SSL 证书中心 - ArmGuard' },
  { path: 'docker', component: DockerComponent, canActivate: [authGuard], title: 'Docker 容器与镜像 - ArmGuard' },
  { path: 'databases', component: DatabasesComponent, canActivate: [authGuard], title: '数据库管理 - ArmGuard' },
  { path: 'files', component: FilesComponent, canActivate: [authGuard], title: 'Web 文件管理 - ArmGuard' },
  { path: 'terminal', component: TerminalComponent, canActivate: [authGuard], title: 'Web 终端 - ArmGuard' },
  { path: 'appstore', component: AppstoreComponent, canActivate: [authGuard], title: 'ARM 软件商店 - ArmGuard' },
  { path: 'security', component: SecurityComponent, canActivate: [authGuard], title: '安全防护 - ArmGuard' },
  { path: 'crontab', component: CrontabComponent, canActivate: [authGuard], title: '计划任务 - ArmGuard' },
  { path: 'logs', component: LogsComponent, canActivate: [authGuard], title: '日志与审计中心 - ArmGuard' },
  { path: 'settings', component: SettingsComponent, canActivate: [authGuard], title: '面板核心设置 - ArmGuard' },
  { path: '**', redirectTo: '' },
]
