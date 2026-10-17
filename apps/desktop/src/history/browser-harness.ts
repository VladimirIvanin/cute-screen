import { createEditorDocumentFromImage } from '@cute-screen/editor-vue'
import type {
  CleanupPlan,
  HistoryPolicy,
  RecentCapture,
  StorageReport,
} from '../generated/desktop-ipc'
import type { HistoryBridge } from './contracts'

/** UI/worker fixture only. Native acceptance creates captures through the production UI. */
export function createHistoryHarnessBridge(): HistoryBridge {
  const now = Date.now()
  let policy: HistoryPolicy = { days: 7, maxMib: 512, maxCaptures: 200 }
  let items: RecentCapture[] = Array.from({ length: 1000 }, (_, index) => ({
    captureId: `capture-${index}`, documentId: `019c1f62-058e-7000-8000-${String(index).padStart(12, '0')}`,
    capturedAt: now - index * 60_000, revision: 1, width: 3840, height: 2160,
    protected: index === 1, legacyPending: index > 900, hasThumbnail: false,
  }))
  const binary = new Map<string, Uint8Array>()
  let original: Promise<ArrayBuffer> | undefined
  const report = (): StorageReport => ({ originalsBytes: 512 * 1024, documentsBytes: 1000, cacheBytes: 0,
    databaseBytes: 8192, databaseReusableBytes: 0, totalBytes: 532480, captureCount: items.length,
    protectedCount: items.filter((item) => item.protected).length,
    legacyPendingCount: items.filter((item) => item.legacyPending).length,
    overLimit: items.length > policy.maxCaptures,
  })
  let plan: CleanupPlan | undefined
  return {
    request: async (request) => {
      if (request.kind === 'list') {
        const offset = request.cursor ? items.findIndex((item) => item.captureId === request.cursor!.captureId) + 1 : 0
        const page = items.slice(offset, offset + 50)
        const last = page.at(-1)
        const nextCursor = offset + 50 < items.length && last
          ? { captureId: last.captureId, capturedAt: last.capturedAt } : null
        return { kind: 'page', page: { items: page, nextCursor } }
      }
      if (request.kind === 'report') return { kind: 'report', report: report() }
      if (request.kind === 'policy') return { kind: 'policy', policy }
      if (request.kind === 'setPolicy') {
        policy = request.policy
        return { kind: 'policy', policy }
      }
      if (request.kind === 'protect') {
        items = items.map((item) => item.captureId === request.captureId
          ? { ...item, protected: request.protected } : item)
        return { kind: 'done' }
      }
      if (request.kind === 'open') {
        const item = items.find((item) => item.captureId === request.captureId)
        if (!item) throw new Error('Capture no longer available')
        const document = createEditorDocumentFromImage({
          id: item.documentId,
          baseLayerId: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          source: {
            blobHash: 'a'.repeat(64), format: 'png', mimeType: 'image/png', width: 3840, height: 2160,
            orientationApplied: true, provenance: 'capture', color: { colorSpace: 'srgb', hasIccProfile: false },
          } })
        return { kind: 'opened', document: { documentId: item.documentId, captureId: item.captureId, revision: item.revision, documentJson: JSON.stringify(document), sourceHash: 'a'.repeat(64), imageToken: 'original' }, viewport: null }
      }
      if (request.kind === 'preview') {
        plan = { token: 'reviewed', captureIds: request.captureIds ?? [], clearCache: request.clearCache, includeLegacy: request.includeLegacy, reclaimableBytes: 0, legacyCount: 99 }
        return { kind: 'plan', plan }
      }
      if (request.kind === 'commit') {
        if (!plan) throw new Error('Preview expired')
        items = items.filter((item) => !plan!.captureIds.includes(item.captureId))
        if (plan.includeLegacy) items = items.map((item) => ({ ...item, legacyPending: false }))
        return { kind: 'cleaned', removedCount: plan.captureIds.length, freedBytes: 0, report: report() }
      }
      if (request.kind === 'maintain') return { kind: 'cleaned', removedCount: 0, freedBytes: 0, report: report() }
      return { kind: 'done' }
    },
    thumbnail: async (id, revision) => binary.has(`${id}:${revision}`) ? `${id}:${revision}` : null,
    writeThumbnail: async (id, revision, bytes) => {
      const item = items.find((item) => item.documentId === id)
      if (item) binary.set(`${item.captureId}:${revision}`, bytes)
    },
    release: async () => undefined,
    read: async (token) => {
      if (token !== 'original') {
        const bytes = binary.get(token)
        if (!bytes) throw new Error('Preview unavailable')
        return new Uint8Array(bytes).buffer
      }
      original ??= (async () => {
        const canvas = document.createElement('canvas')
        canvas.width = 3840
        canvas.height = 2160
        const context = canvas.getContext('2d')!
        context.fillStyle = '#e7ebf4'
        context.fillRect(0, 0, 3840, 2160)
        context.fillStyle = '#293953'
        context.fillRect(120, 100, 3600, 160)
        context.fillStyle = '#ee8ca8'
        context.fillRect(120, 340, 2200, 1200)
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Fixture encoding failed')), 'image/png'))
        return blob.arrayBuffer()
      })()
      return original
    },
    resolve: async () => ({ resourceToken: 'original' }),
    settings: async () => undefined,
  }
}
