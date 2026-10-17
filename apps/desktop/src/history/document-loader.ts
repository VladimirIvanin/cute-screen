import {
  nextTick,
  type ShallowRef,
} from 'vue'
import {
  describeError,
  parsePersistedDocument,
  type CanvasViewportHosts,
  type DocumentSessionController,
  type DocumentSessionCoordinator,
  type EditorShell,
  type ShellDocumentState,
  type ImageResourceLease,
} from '@cute-screen/editor-vue'
import { historyImages } from './images'
import {
  nativeHistory,
  historyRequest,
} from './bridge'
import type {
  HistoryViewport,
  OpenDocument,
} from '../generated/desktop-ipc'
import type { DesktopBridge } from '../desktop-bridge'

interface LoaderPorts {
  session: ShallowRef<DocumentSessionController | undefined>
  coordinator: ShallowRef<DocumentSessionCoordinator | undefined>
  state: ShallowRef<ShellDocumentState>
  readOnly: ShallowRef<boolean>
  source: ShallowRef<HTMLImageElement | undefined>
  activeId: ShallowRef<string | undefined>
  error: ShallowRef<string | undefined>
  shell: ShallowRef<InstanceType<typeof EditorShell> | undefined>
  hosts: ShallowRef<CanvasViewportHosts | undefined>
  createCoordinator(bridge: DesktopBridge): DocumentSessionCoordinator
  close(): Promise<void>
  mounted(): void
}

export function createHistoryDocumentLoader(ports: LoaderPorts) {
  let images: ReturnType<typeof historyImages> | undefined
  let activeLease: ImageResourceLease<HTMLImageElement> | undefined
  let disposed = false

  async function install(
    record: OpenDocument,
    image: HTMLImageElement | undefined,
    lease: ImageResourceLease<HTMLImageElement> | undefined,
    viewport: HistoryViewport | null,
    bridge: DesktopBridge,
    isCurrent: () => boolean,
  ): Promise<boolean> {
    const parsed = parsePersistedDocument(record)
    if (parsed.kind !== 'editable') throw new Error('This document cannot be edited by this version')
    const current = ports.coordinator.value
    const previousId = ports.activeId.value
    const flush = await current?.active?.flush()
    if (flush?.kind === 'failed') throw new Error(flush.error)
    if (disposed || !isCurrent()) return false
    await nativeHistory.request({ kind: 'activate', captureId: record.captureId })
    const previousRequest = previousId
      ? { kind: 'activate' as const, captureId: previousId }
      : { kind: 'deactivate' as const }
    const restoreActive = () => nativeHistory.request(previousRequest)
    if (disposed || !isCurrent()) {
      await restoreActive()
      return false
    }
    if (current) {
      const incoming = { documentId: record.documentId, document: parsed.document, revision: record.revision }
      const result = await current.handoff(incoming)
      if (result.kind === 'failed') {
        await restoreActive()
        throw new Error(result.flush.error)
      }
    } else {
      const created = ports.createCoordinator(bridge)
      created.openInitial({ documentId: record.documentId, document: parsed.document, revision: record.revision })
      ports.coordinator.value = created
    }
    activeLease?.release()
    activeLease = lease
    ports.readOnly.value = false
    ports.source.value = image
    ports.activeId.value = record.captureId
    ports.error.value = undefined
    ports.mounted()
    await nextTick()
    if (viewport) {
      ports.shell.value?.restoreZoom(viewport)
      await nextTick()
      await ports.hosts.value?.waitForRender?.()
      const scroll = ports.hosts.value?.scrollContainer
      if (scroll) {
        scroll.scrollLeft = viewport.scrollLeft
        scroll.scrollTop = viewport.scrollTop
      }
    }
    return true
  }

  async function load(
    captureId?: string,
    isCurrent = () => true,
  ): Promise<boolean> {
    if (!ports.session.value) ports.state.value = { kind: 'loading' }
    let lease: ImageResourceLease<HTMLImageElement> | undefined
    let token: string | undefined
    let openedCapture: string | undefined
    try {
      const { tauriDesktopBridge: bridge } = await import('../desktop-bridge')
      const initial = captureId ? undefined : await bridge.repositoryOpenLast(crypto.randomUUID())
      if (!captureId && !initial) {
        await clear()
        return false
      }
      const opened = await historyRequest(nativeHistory, { kind: 'open', captureId: captureId ?? initial!.captureId }, 'opened')
      const record = opened.document
      openedCapture = record.captureId
      token = record.imageToken
      if (initial?.imageToken) await nativeHistory.release(initial.imageToken)
      // Validate before decoding, preserving the old session for unsupported documents.
      if (parsePersistedDocument(record).kind !== 'editable') throw new Error('This document uses an unsupported schema. Capture or open an image to continue.')
      if (token) {
        images ??= historyImages(bridge)
        lease = await images.acquire(record.sourceHash, token)
      }
      if (disposed || !isCurrent()) return false
      const installed = await install(record, lease?.value, lease, opened.viewport, bridge, isCurrent)
      if (installed) lease = undefined
      return installed
    } catch (error) {
      ports.error.value = describeError(error, 'Unable to open the saved document.')
      if (!ports.session.value) ports.state.value = { kind: 'error', message: ports.error.value }
      return false
    } finally {
      lease?.release()
      if (token) await nativeHistory.release(token).catch((error) => console.warn('History token release failed', error))
      if (openedCapture && openedCapture !== ports.activeId.value) await nativeHistory.request({ kind: 'release', captureId: openedCapture }).catch((error) => console.warn('History capture release failed', error))
    }
  }
  async function clear(): Promise<void> {
    await ports.close()
    await nativeHistory.request({ kind: 'deactivate' })
    activeLease?.release()
    activeLease = undefined
    images?.dispose()
    images = undefined
    ports.source.value = undefined
    ports.activeId.value = undefined
    ports.state.value = { kind: 'empty' }
  }
  return { load, clear, dispose: () => {
    disposed = true
    activeLease?.release()
    images?.dispose()
  } }
}
