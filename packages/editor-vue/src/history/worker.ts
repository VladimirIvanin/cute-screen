export type { ThumbnailJob } from './thumbnail.worker'
export function createHistoryPreviewWorker(): Worker {
  return new Worker(new URL('./thumbnail.worker.ts', import.meta.url), { type: 'module' })
}
