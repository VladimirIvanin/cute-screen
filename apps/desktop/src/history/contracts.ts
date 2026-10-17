import type {
  HistoryRequest,
  HistoryResponse,
} from '../generated/desktop-ipc'

export interface HistoryBridge {
  request(request: HistoryRequest): Promise<HistoryResponse>
  thumbnail(captureId: string, revision: number): Promise<string | null>
  writeThumbnail(documentId: string, revision: number, bytes: Uint8Array): Promise<void>
  release(token: string): Promise<void>
  read(token: string): Promise<ArrayBuffer>
  resolve(blobHash: string): Promise<{ resourceToken: string }>
  settings(): Promise<void>
}
