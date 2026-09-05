import apiClient, { ApiResponse } from './client'

export interface DockerContainer {
  id: string
  name: string
  image: string
  status: 'running' | 'exited' | 'paused' | 'restarting'
  created_at: string
  ports: string[]
  cpu_percent: number
  mem_usage_bytes: number
  mem_limit_bytes: number
  net_rx_bytes: number
  net_tx_bytes: number
}

export interface DockerImage {
  id: string
  repository: string
  tag: string
  size_bytes: number
  created_at: string
  arch: string // 'arm64', 'armv7', 'amd64'
  manifest_platforms: string[] // e.g. ['linux/arm64', 'linux/amd64', 'linux/arm/v7']
  is_native_arm: boolean
}

export interface ManifestInspectResult {
  image: string
  tag: string
  supported_platforms: {
    os: string
    architecture: string
    variant?: string
  }[]
  has_arm64: boolean
  has_armv7: boolean
  has_amd64: boolean
  compatibility_status: 'compatible' | 'warning' | 'incompatible'
  warning_message?: string
}

export interface CreateContainerParams {
  name: string
  image: string
  ports: { host_port: number; container_port: number; protocol: 'tcp' | 'udp' }[]
  volumes: { host_path: string; container_path: string; mode: 'rw' | 'ro' }[]
  environments: { key: string; value: string }[]
  restart_policy: 'no' | 'always' | 'unless-stopped' | 'on-failure'
  memory_limit_mb?: number
  cpu_limit?: number
}

export const dockerApi = {
  getContainers: () => apiClient.get<ApiResponse<{ list: DockerContainer[]; docker_installed: boolean; docker_version: string }>>('/docker/containers'),
  startContainer: (id: string) => apiClient.post<ApiResponse<void>>(`/docker/containers/${id}/start`),
  stopContainer: (id: string) => apiClient.post<ApiResponse<void>>(`/docker/containers/${id}/stop`),
  restartContainer: (id: string) => apiClient.post<ApiResponse<void>>(`/docker/containers/${id}/restart`),
  deleteContainer: (id: string, force = false) => apiClient.delete<ApiResponse<void>>(`/docker/containers/${id}`, { params: { force } }),
  getContainerLogs: (id: string, lines = 200) => apiClient.get<ApiResponse<{ logs: string[] }>>(`/docker/containers/${id}/logs`, { params: { lines } }),
  createContainer: (params: CreateContainerParams) => apiClient.post<ApiResponse<{ container_id: string }>>('/docker/containers', params),

  getImages: () => apiClient.get<ApiResponse<{ list: DockerImage[] }>>('/docker/images'),
  inspectManifest: (image: string, tag = 'latest') => apiClient.get<ApiResponse<ManifestInspectResult>>('/docker/images/inspect-manifest', { params: { image, tag } }),
  pullImage: (image: string, tag = 'latest') => apiClient.post<ApiResponse<{ task_id: string }>>('/docker/images/pull', { image, tag }),
  deleteImage: (id: string, force = false) => apiClient.delete<ApiResponse<void>>(`/docker/images/${id}`, { params: { force } }),
}
