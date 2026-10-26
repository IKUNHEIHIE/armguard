import { inject } from '@angular/core'
import { CanDeactivateFn } from '@angular/router'
import { ConfirmService } from './confirm.service'

export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean
  unsavedChangesMessage?: string
}

export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = async (component) => {
  if (!component || typeof component.hasUnsavedChanges !== 'function') {
    return true
  }
  if (!component.hasUnsavedChanges()) {
    return true
  }

  const confirm = inject(ConfirmService)
  const res = await confirm.ask({
    title: '离开页面确认',
    message:
      component.unsavedChangesMessage ||
      '当前页面存在尚未保存的编辑内容或配置更改，直接离开将丢失这些修改。',
    impact: '若选择「放弃修改并离开」，未提交的更改将不会写入服务器；选择「继续留在当前页」可保存后再离开。',
    confirmText: '放弃修改并离开',
    cancelText: '继续留在当前页',
    tone: 'warning',
  })
  return res.confirmed
}
