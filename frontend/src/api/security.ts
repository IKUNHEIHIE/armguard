import apiClient, { ApiResponse } from './client'

export interface FirewallRule {
  id: number
  protocol: 'TCP' | 'UDP' | 'ICMP' | 'ALL' | 'tcp' | 'udp' | 'tcp/udp'
  port: string // e.g. "80", "443", "3000-4000", "全部端口"
  source_ip: string // e.g. "0.0.0.0/0"
  action: 'accept' | 'drop' | 'reject'
  description?: string
  raw_spec?: string
  created_at: string
}

export interface SSHConfig {
  port: number
  status: 'running' | 'stopped'
  allow_password_auth: boolean
  allow_root_login: boolean
  allow_pubkey_auth: boolean
}

export interface Fail2banStatus {
  installed: boolean
  running: boolean
  banned_ips: {
    jail: string
    ip: string
    banned_at: string
    failures: number
  }[]
}

export interface UfwStatus {
  installed: boolean
  status: 'active' | 'inactive'
  default_incoming: string
  default_outgoing: string
  ipv6_enabled: boolean
  raw_output?: string
}

export interface ScannedPortItem {
  port: number
  protocol: string
  name: string
  critical: boolean
  selected: boolean
}

export interface ScanPortsResponse {
  ssh_port: number
  panel_port: number
  ports: ScannedPortItem[]
}

export const securityApi = {
  getFirewallRules: () => apiClient.get<ApiResponse<{ rules: FirewallRule[]; firewall_type: string; status: 'active' | 'inactive'; default_policy?: string; ping_banned?: boolean }>>('/firewall/rules'),
  addFirewallRule: (rule: { type?: 'port' | 'ip_block'; protocol?: string; port?: string; source_ip?: string; action?: string; description?: string }) => apiClient.post<ApiResponse<void>>('/firewall/rules', rule),
  updateFirewallRule: (data: { old_raw_spec?: string; type?: 'port' | 'ip_block'; protocol?: string; port?: string; source_ip?: string; action?: string; description?: string }) => apiClient.put<ApiResponse<void>>('/firewall/rules', data),
  deleteFirewallRule: (id: number, rawSpec?: string) => apiClient.delete<ApiResponse<void>>(`/firewall/rules/${id}`, { data: { raw_spec: rawSpec } }),
  getSSHConfig: () => apiClient.get<ApiResponse<SSHConfig>>('/firewall/ssh'),
  updateSSHConfig: (config: Partial<SSHConfig>) => apiClient.put<ApiResponse<void>>('/firewall/ssh', config),
  getIcmpStatus: () => apiClient.get<ApiResponse<{ ping_banned: boolean }>>('/firewall/icmp'),
  setIcmpBan: (ban: boolean) => apiClient.post<ApiResponse<void>>('/firewall/icmp', { ban }),
  getFail2banStatus: () => apiClient.get<ApiResponse<Fail2banStatus>>('/firewall/fail2ban/status'),
  banIP: (ip: string, jail = 'sshd') => apiClient.post<ApiResponse<void>>('/firewall/fail2ban/ban', { ip, jail }),
  unbanIP: (ip: string, jail = 'sshd') => apiClient.post<ApiResponse<void>>('/firewall/fail2ban/unban', { ip, jail }),
  getUfwStatus: () => apiClient.get<ApiResponse<UfwStatus>>('/firewall/ufw/status'),
  scanListeningPorts: () => apiClient.get<ApiResponse<ScanPortsResponse>>('/firewall/scan-ports'),
  enableUfw: (ports: string[]) => apiClient.post<ApiResponse<{ status: string; allowed_ports: string[] }>>('/firewall/ufw/enable', { ports }),
  disableUfw: () => apiClient.post<ApiResponse<{ status: string }>>('/firewall/ufw/disable'),
}
