import {
  loadImageWithBinaryFallback,
  parsePersistedDocument,
  type DocumentSessionController,
  type DocumentSessionCoordinator,
  type FrameSummary,
  type LibraryAdapter,
} from '@cute-screen/editor-vue'
import type { ShallowRef } from 'vue'

export function createLibraryAdapter(ports: {
  documentSession: ShallowRef<DocumentSessionController | undefined>
  coordinator: ShallowRef<DocumentSessionCoordinator | undefined>
  sourceImage: ShallowRef<HTMLImageElement | undefined>
  frames: ShallowRef<readonly FrameSummary[]>
  correlationId(): string
}): LibraryAdapter | undefined {
  if (!('__TAURI_INTERNALS__' in window)) return undefined
  let sequence = 0
  let queue: Promise<void> = Promise.resolve()
  const bridge = () =>
    import('./desktop-bridge').then((module) => module.tauriDesktopBridge)
  const refresh = async (active: string) => {
    const native = await bridge()
    const frames = await native.repositoryListActiveSeriesFrames(
      ports.correlationId(),
    )
    ports.frames.value = frames.map((frame, index) => ({
      id: frame.captureId,
      label: String(index + 1),
      selected: frame.captureId === active,
    }))
  }
  const openCapture = (captureId: string) => {
    const request = ++sequence
    const operation = queue
      .catch(() => undefined)
      .then(async () => {
        const flush = await ports.documentSession.value?.flush()
        if (flush?.kind === 'failed') throw new Error(flush.error)
        if (request !== sequence) return
        const native = await bridge()
        const record = await native.repositoryPrepareCapture(
          captureId,
          ports.correlationId(),
        )
        if (!record) throw new Error('Capture no longer exists.')
        const parsed = parsePersistedDocument(record)
        if (parsed.kind !== 'editable')
          throw new Error(
            'The selected document is not editable by this version.',
          )
        let image: HTMLImageElement | undefined
        if (record.imageToken)
          await loadImageWithBinaryFallback({
            token: record.imageToken,
            correlationId: ports.correlationId(),
            bridge: native,
            createResource: async (value) => {
              image = value
              return value
            },
          })
        if (request !== sequence) return
        const coordinator = ports.coordinator.value
        if (!coordinator) throw new Error('Document session is unavailable.')
        const handoff = await coordinator.handoff({
          documentId: record.documentId,
          document: parsed.document,
          revision: record.revision,
        })
        if (handoff.kind === 'failed') throw new Error(handoff.flush.error)
        ports.sourceImage.value = image
        await native.repositoryActivateCapture(captureId, ports.correlationId())
        await refresh(captureId)
      })
    queue = operation
    return operation
  }
  return {
    listSeries: async (query) =>
      (await bridge()).repositoryListSeries(query, ports.correlationId()),
    listCaptures: async (id, query) =>
      (await bridge()).repositoryListCaptures(id, query, ports.correlationId()),
    openCapture,
    renameSeries: async (id, title) =>
      (await bridge()).repositoryRenameSeries(id, title, ports.correlationId()),
    renameCapture: async (id, title) =>
      (await bridge()).repositoryRenameCapture(
        id,
        title,
        ports.correlationId(),
      ),
    storageReport: async () =>
      (await bridge()).repositoryStorageReport(ports.correlationId()),
    cleanupPlan: async (selection) =>
      (await bridge()).repositoryCleanupPlan(
        {
          seriesIds: [...selection.seriesIds],
          captureIds: [...selection.captureIds],
          clearCache: selection.clearCache,
        },
        ports.correlationId(),
      ),
    cleanupExecute: async (token) =>
      (await bridge()).repositoryCleanupExecute(token, ports.correlationId()),
  }
}
