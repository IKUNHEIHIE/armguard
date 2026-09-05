import apiClient, { ApiResponse } from './client'

export interface FileItem {
  name: string
  path: string
  is_dir: boolean
  size: number
  mode: string
  mod_time: string
  owner: string
  group: string
  extension?: string
}

export interface FileListResult {
  current_path: string
  parent_path: string
  files: FileItem[]
  total_files: number
  total_dirs: number
}

export const fileApi = {
  getList: (path = '/') => apiClient.get<ApiResponse<FileListResult>>('/files/list', { params: { path } }),
  getContent: (path: string) => apiClient.get<ApiResponse<{ content: string; encoding: string; size: number }>>('/files/content', { params: { path } }),
  saveContent: (path: string, content: string) => apiClient.put<ApiResponse<void>>('/files/content', { path, content }),
  createFile: (path: string, isDir = false) => apiClient.post<ApiResponse<void>>('/files/create', { path, is_dir: isDir }),
  renameFile: (oldPath: string, newPath: string) => apiClient.post<ApiResponse<void>>('/files/rename', { old_path: oldPath, new_path: newPath }),
  deleteFiles: (paths: string[]) => apiClient.delete<ApiResponse<void>>('/files', { data: { paths } }),
  uploadFile: (path: string, file: File, onProgress?: (percent: number) => void) => {
    const formData = new FormData()
    formData.append('path', path)
    formData.append('file', file)
    return apiClient.post<ApiResponse<{ path: string }>>('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total && onProgress) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total)
          onProgress(percent)
        }
      }
    })
  },
  downloadFileUrl: (path: string) => `/api/v1/files/download?path=${encodeURIComponent(path)}&token=${localStorage.getItem('armguard_token') || ''}`,
  compress: (paths: string[], targetName: string, format: 'zip' | 'tar.gz' = 'zip') => apiClient.post<ApiResponse<{ target_path: string }>>('/files/compress', { paths, target_name: targetName, format }),
  decompress: (path: string, destPath?: string) => apiClient.post<ApiResponse<void>>('/files/decompress', { path, dest_path: destPath }),
  changePermission: (path: string, mode: string, owner?: string, group?: string, recursive = false) => apiClient.put<ApiResponse<void>>('/files/permission', { path, mode, owner, group, recursive }),
}
