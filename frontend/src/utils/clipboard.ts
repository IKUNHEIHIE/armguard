/**
 * Safe clipboard utility supporting both HTTPS Secure Contexts and LAN HTTP environments (FE-018).
 * Never falsely reports success when copying fails or input is empty.
 */
export async function copyToClipboard(
  text: string | null | undefined
): Promise<{ ok: boolean; method: 'clipboard' | 'execCommand' | 'failed'; reason?: string }> {
  const value = (text ?? '').toString()
  if (!value.trim()) {
    return { ok: false, method: 'failed', reason: '内容为空，无法复制' }
  }

  // 1. Try modern Async Clipboard API (requires HTTPS or localhost)
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(value)
      return { ok: true, method: 'clipboard' }
    } catch {
      // Fall through to execCommand fallback (common on LAN HTTP deployments)
    }
  }

  // 2. Fallback to hidden textarea + document.execCommand('copy') for LAN HTTP environments
  if (typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea')
      textarea.value = value
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'fixed'
      textarea.style.top = '-9999px'
      textarea.style.left = '-9999px'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)

      const prevFocus = document.activeElement as HTMLElement | null
      textarea.focus()
      textarea.select()
      textarea.setSelectionRange(0, value.length)

      const copied = document.execCommand('copy')
      document.body.removeChild(textarea)
      if (prevFocus && typeof prevFocus.focus === 'function') {
        prevFocus.focus()
      }

      if (copied) {
        return { ok: true, method: 'execCommand' }
      }
    } catch (err: any) {
      return { ok: false, method: 'failed', reason: err?.message || '浏览器拒绝剪贴板访问' }
    }
  }

  return { ok: false, method: 'failed', reason: '当前环境不支持自动写入剪贴板，请手动选中文本复制' }
}

/**
 * Sanitize sensitive tokens, keys, passwords, and Bearer credentials in log lines before sending to external AI APIs (FE-018).
 */
export function sanitizeSensitiveLogContent(raw: string): string {
  if (!raw) return ''
  return raw
    .replace(/ag_live_[a-zA-Z0-9]{12,}/g, 'ag_live_[REDACTED_TOKEN]')
    .replace(/sk-[a-zA-Z0-9_-]{12,}/g, 'sk-[REDACTED_API_KEY]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, '$1[REDACTED_BEARER]')
    .replace(/((?:password|passwd|pwd|secret|api_key|token)\s*[:=]\s*)([^\s,;'"&]+)/gi, '$1[REDACTED]')
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]')
}
