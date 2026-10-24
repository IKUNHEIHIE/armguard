import apiClient, { ApiResponse } from '@/api/client'

export interface DownloadTicketResult {
  url: string
  expires_in: number
}

/**
 * Request a single-use short-lived download ticket, pre-check availability via HEAD,
 * and trigger native browser streaming download without exposing the session token in URLs.
 */
export async function downloadWithTicket(targetApiPath: string, filename?: string): Promise<void> {
  const res = await apiClient.post<ApiResponse<DownloadTicketResult>>('/auth/download-ticket', {
    path: targetApiPath
  })
  const ticketUrl = res.data?.data?.url
  if (!ticketUrl) {
    throw new Error(res.data?.message || '无法获取下载票据')
  }

  // Pre-verify file existence & permissions via HEAD (does not consume single-use GET ticket)
  const headResp = await fetch(ticketUrl, { method: 'HEAD', credentials: 'same-origin' })
  if (!headResp.ok) {
    if (headResp.status === 404) throw new Error('目标文件或备份包不存在')
    if (headResp.status === 403) throw new Error('安全拦截：禁止下载受保护文件')
    if (headResp.status === 401) throw new Error('下载授权已失效，请重新登录')
    throw new Error(`下载预检失败 (HTTP ${headResp.status})`)
  }

  const link = document.createElement('a')
  link.href = ticketUrl
  if (filename) {
    link.download = filename
  }
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
