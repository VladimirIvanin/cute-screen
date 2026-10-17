import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { shallowRef } from 'vue'
import {
  DocumentSessionCoordinator,
  createEditorDocumentFromImage,
  type ShellDocumentState,
} from '@cute-screen/editor-vue'
import { serializeEditorDocument } from '@cute-screen/editor-renderer'
import { documentFixture as originalFixture } from '../../../packages/editor-core/src/document/scene/test-kit'
import { createHistoryDocumentLoader } from '../../../apps/desktop/src/history/document-loader'

const documentFixture = createEditorDocumentFromImage({
  id: originalFixture.id,
  baseLayerId: originalFixture.layers[0]!.id,
  source: originalFixture.source,
  timestamp: originalFixture.createdAt,
})

const native = vi.hoisted(() => ({ request: vi.fn(), release: vi.fn(async () => undefined) }))
vi.mock('../../../apps/desktop/src/platform/tauri/history-adapter', () => ({ nativeHistory: native }))
vi.mock('../../../apps/desktop/src/desktop-bridge', () => ({ tauriDesktopBridge: {} }))

describe('production history document handoff', () => {
  beforeEach(() => {
    native.request.mockReset()
    native.release.mockClear()
  })
  function setup() {
    const session = shallowRef<import('@cute-screen/editor-vue').DocumentSessionController>()
    const saveDocument = vi.fn(async () => 2)
    const coordinator = shallowRef(new DocumentSessionCoordinator({
      bridge: { saveDocument, exportRecoveryBundle: async () => ({ kind: 'cancelled' }) },
      correlationId: () => 'history-test', onActiveSession: (value) => {
        session.value = value
      },
    }))
    coordinator.value.openInitial({ document: documentFixture, documentId: documentFixture.id, revision: 1 })
    const activeId = shallowRef<string | undefined>('capture-a')
    const source = shallowRef<HTMLImageElement | undefined>(new Image())
    const state = shallowRef<ShellDocumentState>({ kind: 'ready', title: 'Current', dimensions: '800 × 600' })
    const nextDocument = { ...documentFixture, id: '019c1f62-058e-7000-8000-000000000099', crop: { x: 5, y: 5, width: 100, height: 100 } }
    native.request.mockImplementation(async (request: { kind: string; captureId?: string }) => request.kind === 'open' ? {
      kind: 'opened', document: { documentId: nextDocument.id, captureId: request.captureId, revision: 1, documentJson: serializeEditorDocument(nextDocument), sourceHash: nextDocument.source.blobHash }, viewport: null,
    } : { kind: 'done' })
    const loader = createHistoryDocumentLoader({ session, coordinator, state, source, activeId,
      readOnly: shallowRef(false), error: shallowRef<string>(), shell: shallowRef(), hosts: shallowRef(),
      createCoordinator: () => coordinator.value, close: async () => {
        coordinator.value.dispose()
      }, mounted: () => undefined,
    })
    return { loader, session, source, activeId, state, saveDocument, coordinator }
  }
  it('retains the current image, document and active ID when its save fails', async () => {
    const state = setup()
    const oldImage = state.source.value
    state.saveDocument.mockRejectedValue(new Error('disk full'))
    state.session.value!.execute({ type: 'setCrop', before: null, after: { x: 0, y: 0, width: 120, height: 80 } })
    expect(await state.loader.load('capture-b')).toBe(false)
    expect(state.session.value!.snapshot.core.document.id).toBe(documentFixture.id)
    expect(state.source.value).toBe(oldImage)
    expect(state.activeId.value).toBe('capture-a')
    expect(state.state.value.kind).toBe('ready')
    expect(native.request).not.toHaveBeenCalledWith({ kind: 'activate', captureId: 'capture-b' })
    state.coordinator.value.dispose()
    state.loader.dispose()
  })
  it('loads saved edits with a fresh Undo stack and releases the previous session', async () => {
    const state = setup()
    const oldSession = state.session.value
    expect(await state.loader.load('capture-b')).toBe(true)
    expect(state.session.value).not.toBe(oldSession)
    expect(state.session.value!.snapshot.core.document.crop).toEqual({ x: 5, y: 5, width: 100, height: 100 })
    expect(state.session.value!.snapshot.core.canUndo).toBe(false)
    expect(state.activeId.value).toBe('capture-b')
    state.coordinator.value.dispose()
    state.loader.dispose()
  })
  it('does not mount a stale selection even after the repository has replied', async () => {
    const state = setup()
    expect(await state.loader.load('capture-b', () => false)).toBe(false)
    expect(state.activeId.value).toBe('capture-a')
    state.coordinator.value.dispose()
    state.loader.dispose()
  })
})
