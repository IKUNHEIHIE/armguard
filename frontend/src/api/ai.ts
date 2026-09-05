import apiClient, { ApiResponse } from './client'

export interface AIConfig {
  enabled: boolean
  api_url: string
  api_key: string
  model: string
  temperature: number
  max_tokens: number
  is_configured?: boolean
  active_engine?: 'online_llm' | 'offline_expert'
}

export interface CommandGenResult {
  command: string
  risk: 'safe' | 'warning' | 'danger'
  explanation: string
  notes?: string
}

export interface LogDiagnosisResult {
  root_cause: string
  severity: 'info' | 'warning' | 'critical'
  affected_component: string
  fix_steps: string[]
  fix_commands: string[]
  recommendation: string
}

export interface HealthAuditCheckItem {
  item: string
  status: 'pass' | 'warning' | 'fail'
  detail: string
}

export interface HealthAuditResult {
  score: number
  level: 'healthy' | 'warning' | 'critical'
  summary: string
  checks: HealthAuditCheckItem[]
  optimizations: string[]
}

export const aiApi = {
  getConfig: () => apiClient.get<ApiResponse<AIConfig>>('/ai/config'),
  updateConfig: (data: Partial<AIConfig>) => apiClient.put<ApiResponse<AIConfig>>('/ai/config', data),
  testConnection: (data: Partial<AIConfig>) => apiClient.post<ApiResponse<{ reply: string }>>('/ai/test-connection', data),
  chat: (message: string, history: Array<{ role: 'user' | 'assistant'; content: string }> = []) =>
    apiClient.post<ApiResponse<{ reply: string }>>('/ai/chat', { message, history }),
  generateCommand: (prompt: string) =>
    apiClient.post<ApiResponse<CommandGenResult>>('/ai/generate-command', { prompt }),
  diagnoseLog: (log_type: string, log_content: string) =>
    apiClient.post<ApiResponse<LogDiagnosisResult>>('/ai/diagnose-log', { log_type, log_content }),
  healthAudit: () =>
    apiClient.post<ApiResponse<HealthAuditResult>>('/ai/health-audit', {})
}
