import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { HistoryBridge } from '../../history/contracts'
import type { HistoryResponse } from '../../generated/desktop-ipc'

export const nativeHistory: HistoryBridge = {
  request: (request) => invoke<HistoryResponse>('history_command', { request }),
  thumbnail: (captureId, revision) => invoke<string | null>('history_thumbnail', { captureId, revision }),
  writeThumbnail: (documentId, revision, bytes) => invoke<void>('history_write_thumbnail', bytes, {
    headers: { 'x-document-id': documentId, 'x-document-revision': String(revision) },
  }),
  release: (token) => invoke<void>('image_release', { token }),
  read: (token) => invoke<ArrayBuffer>('read_image_bytes', { token, correlationId: 'history' }),
  resolve: async (blobHash) => {
    const value = await invoke<{ kind: string; resourceToken: string }>('repository_resolve_texture', { blobHash, correlationId: 'history' })
    if (value.kind !== 'imported') throw new Error('Image resource unavailable')
    return value
  },
  settings: () => invoke<void>('settings_open_history'),
}

export const listenHistorySettings = (callback: () => void) => listen('settings:history', callback)
