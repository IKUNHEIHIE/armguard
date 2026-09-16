import apiClient, { ApiResponse } from './client'

export interface DatabaseItem {
  id: number
  type: 'mysql' | 'mariadb' | 'postgresql' | 'sqlite' | 'redis'
  db_name: string
  username: string
  character_set: string
  size_bytes: number
  status: 'active' | 'error'
  backup_count: number
  created_at: string
}

export interface CreateDatabaseParams {
  type: 'mysql' | 'mariadb' | 'postgresql' | 'sqlite' | 'redis'
  db_name: string
  username?: string
  password?: string
  character_set?: string
}

export interface BackupRecord {
  id: number
  database_id: number
  db_name: string
  file_name: string
  file_size_bytes: number
  storage_path: string
  created_at: string
}

export interface DatabaseEngineItem {
  key: string
  name: string
  type: string
  service_name: string | null
  status: 'running' | 'stopped' | 'unavailable'
  is_available: boolean
  description: string
}

export const databaseApi = {
  getDatabases: (type?: string) => apiClient.get<ApiResponse<{ list: DatabaseItem[] }>>('/databases', { params: { type } }),
  getAvailableEngines: () => apiClient.get<ApiResponse<{ list: DatabaseEngineItem[] }>>('/databases/engines'),
  createDatabase: (data: CreateDatabaseParams) => apiClient.post<ApiResponse<DatabaseItem>>('/databases', data),
  deleteDatabase: (id: number) => apiClient.delete<ApiResponse<void>>(`/databases/${id}`),
  backupDatabase: (id: number) => apiClient.post<ApiResponse<{ backup_id: number; file_name: string }>>(`/databases/${id}/backup`),
  getBackups: (id: number) => apiClient.get<ApiResponse<{ list: BackupRecord[] }>>(`/databases/${id}/backups`),
  restoreBackup: (id: number, backupId: number) => apiClient.post<ApiResponse<void>>(`/databases/${id}/restore`, { backup_id: backupId }),
  executeQuery: (id: number, sql: string) => apiClient.post<ApiResponse<{ columns: string[]; rows: any[][]; rows_affected: number; execution_time_ms: number }>>(`/databases/${id}/query`, { sql }),
  downloadBackupUrl: (fileName: string) => `/api/v1/databases/backup/download?file_name=${encodeURIComponent(fileName)}&token=${localStorage.getItem('armguard_token') || ''}`,
  deleteBackup: (fileName: string) => apiClient.delete<ApiResponse<void>>('/databases/backup', { params: { file_name: fileName } }),
}

