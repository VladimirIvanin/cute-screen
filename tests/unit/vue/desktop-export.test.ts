import { shallowRef } from 'vue'
import {
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import type { CanvasViewportHosts } from '@cute-screen/editor-vue'
import { createDesktopShellActions } from '../../../apps/desktop/src/desktop-shell-actions'

const bridge = vi.hoisted(() => ({
  chooseResultPng: vi.fn(),
  writeResultPng: vi.fn(),
  cancelResultPng: vi.fn(),
}))
vi.mock('../../../apps/desktop/src/desktop-bridge', () => ({ tauriDesktopBridge: bridge }))

function setup() {
  const exportPng = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]))
  const prepareDocumentChange = vi.fn().mockResolvedValue(undefined)
  const actions = createDesktopShellActions({
    canvasHosts: shallowRef({ exportPng } as unknown as CanvasViewportHosts),
    documentSession: shallowRef(),
    platformCapabilities: shallowRef(),
    correlationId: () => 'export-test',
    mountCapturedDocument: async () => true,
    prepareDocumentChange,
  })!
  return { actions, exportPng, prepareDocumentChange }
}

beforeEach(() => {
  vi.stubGlobal('__TAURI_INTERNALS__', {})
  vi.resetAllMocks()
  bridge.chooseResultPng.mockResolvedValue('ticket')
  bridge.writeResultPng.mockResolvedValue(undefined)
  bridge.cancelResultPng.mockResolvedValue(undefined)
})

afterEach(() => vi.unstubAllGlobals())

describe('desktop PNG export', () => {
  it('commits edits and exports renderer bytes through the native save boundary', async () => {
    const { actions, exportPng, prepareDocumentChange } = setup()
    expect(await actions.run('export', new AbortController().signal)).toBe('PNG exported')
    expect(prepareDocumentChange).toHaveBeenCalledOnce()
    expect(exportPng).toHaveBeenCalledOnce()
    expect(bridge.writeResultPng).toHaveBeenCalledWith('ticket', new Uint8Array([1, 2, 3]))
    expect(bridge.cancelResultPng).toHaveBeenCalledWith('ticket')
  })

  it('treats Save As dismissal as cancellation without encoding or writing', async () => {
    bridge.chooseResultPng.mockResolvedValue(null)
    const { actions, exportPng } = setup()
    await expect(actions.run('export', new AbortController().signal)).rejects.toThrow('Export cancelled')
    expect(exportPng).not.toHaveBeenCalled()
    expect(bridge.writeResultPng).not.toHaveBeenCalled()
  })

  it('cancels during encoding and releases the selected destination', async () => {
    const controller = new AbortController()
    const { actions, exportPng } = setup()
    exportPng.mockImplementation(async () => {
      controller.abort()
      return new Uint8Array([1])
    })
    await expect(actions.run('export', controller.signal)).rejects.toThrow('Export cancelled')
    expect(bridge.writeResultPng).not.toHaveBeenCalled()
    expect(bridge.cancelResultPng).toHaveBeenCalledWith('ticket')
  })

  it('releases failed exports and allows a fresh retry', async () => {
    const { actions } = setup()
    bridge.writeResultPng.mockRejectedValueOnce(new Error('disk full'))
    await expect(actions.run('export', new AbortController().signal)).rejects.toThrow('disk full')
    expect(bridge.cancelResultPng).toHaveBeenCalledWith('ticket')
    await expect(actions.run('export', new AbortController().signal)).resolves.toBe('PNG exported')
  })

  it('shows the message from a structured native write error', async () => {
    const { actions } = setup()
    bridge.writeResultPng.mockRejectedValue({ code: 'permissionDenied', message: 'Access denied', recoverable: true })
    await expect(actions.run('export', new AbortController().signal)).rejects.toThrow('Access denied')
  })
})
