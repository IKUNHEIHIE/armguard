import apiClient, { ApiResponse } from './client'

export interface SSLCertificate {
  id: number
  domain: string
  sans: string[]
  issuer: string // e.g. "Let's Encrypt Authority X3", "ZeroSSL", "Custom"
  expires_at: string
  days_remaining: number
  auto_renew: boolean
  is_deployed: boolean
  deployed_sites: string[]
  created_at: string
}

export interface ApplyCertParams {
  domain: string
  sans?: string[]
  email: string
  provider: 'letsencrypt' | 'zerossl'
  challenge_type: 'http-01' | 'dns-01'
  dns_provider?: 'cloudflare' | 'aliyun' | 'tencent'
  dns_api_key?: string
  dns_api_secret?: string
  auto_deploy_site_id?: number
}

export interface UploadCertParams {
  domain: string
  certificate: string
  private_key: string
  auto_deploy_site_id?: number
}

export const sslApi = {
  getCerts: () => apiClient.get<ApiResponse<{ list: SSLCertificate[] }>>('/ssl/certs'),
  applyCert: (params: ApplyCertParams) => apiClient.post<ApiResponse<{ cert_id: number; task_id: string }>>('/ssl/certs/apply', params),
  uploadCert: (params: UploadCertParams) => apiClient.post<ApiResponse<{ cert_id: number }>>('/ssl/certs/upload', params),
  renewCert: (id: number) => apiClient.post<ApiResponse<{ success: boolean; new_expires_at: string }>>(`/ssl/certs/${id}/renew`),
  deleteCert: (id: number) => apiClient.delete<ApiResponse<void>>(`/ssl/certs/${id}`),
  deployCertToSite: (certId: number, siteId: number) => apiClient.post<ApiResponse<void>>(`/ssl/certs/${certId}/deploy`, { site_id: siteId }),
}
