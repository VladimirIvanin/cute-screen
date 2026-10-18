import { shallowRef } from 'vue'
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  QuickCaptureActionController,
  type QuickCaptureActionPorts,
} from '../../../apps/desktop/src/quick-capture-action-controller'

vi.mock('../../../apps/desktop/src/desktop-bridge', () => ({ tauriDesktopBridge: {} }))

function setup() {
  const materialized = shallowRef(false)
  const commit = vi.fn(async () => {
    materialized.value = true
  })
  const prepareDocumentChange = vi.fn().mockResolvedValue(undefined)
  const dismissWindow = vi.fn().mockResolvedValue(undefined)
  const ports = {
    hosts: shallowRef({}), draft: shallowRef({ draftId: 'draft' }),
    pending: shallowRef(false), error: shallowRef<string>(), materialized,
    selectionPending: shallowRef(false), coordinator: { cancel: vi.fn() },
    prepareDocumentChange, dismissWindow,
    commit: { commit, detectMaterializedAfterError: vi.fn() },
  } as unknown as QuickCaptureActionPorts
  return { controller: new QuickCaptureActionController(ports), ports, commit, prepareDocumentChange, dismissWindow }
}

describe('history terminal action', () => {
  it('finishes edits before committing and dismisses only after persistence', async () => {
    const { controller, ports, commit, prepareDocumentChange, dismissWindow } = setup()
    let finish: (() => void) | undefined
    commit.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finish = resolve
    }))
    const operation = controller.saveToHistory()
    await vi.waitFor(() => expect(commit).toHaveBeenCalledWith('history'))
    expect(prepareDocumentChange).toHaveBeenCalledOnce()
    expect(ports.pending.value).toBe(true)
    expect(dismissWindow).not.toHaveBeenCalled()
    await controller.saveToHistory()
    expect(commit).toHaveBeenCalledOnce()
    finish?.()
    await operation
    expect(dismissWindow).toHaveBeenCalledOnce()
    expect(ports.pending.value).toBe(false)
  })

  it('keeps the draft open on commit failure and allows retry', async () => {
    const { controller, ports, commit, dismissWindow } = setup()
    commit.mockRejectedValueOnce(new Error('disk full'))
    await controller.saveToHistory()
    expect(ports.error.value).toBe('disk full')
    expect(dismissWindow).not.toHaveBeenCalled()
    expect(ports.materialized.value).toBe(false)
    await controller.saveToHistory()
    expect(commit).toHaveBeenCalledTimes(2)
    expect(dismissWindow).toHaveBeenCalledOnce()
  })

  it('retries only dismissal after a successful commit', async () => {
    const { controller, ports, commit, prepareDocumentChange, dismissWindow } = setup()
    dismissWindow.mockRejectedValueOnce(new Error('window unavailable'))
    await controller.saveToHistory()
    expect(ports.error.value).toBe('window unavailable')
    await controller.saveToHistory()
    expect(commit).toHaveBeenCalledOnce()
    expect(prepareDocumentChange).toHaveBeenCalledOnce()
    expect(dismissWindow).toHaveBeenCalledTimes(2)
    expect(ports.error.value).toBeUndefined()
  })

  it('does not commit an unconfirmed selection', async () => {
    const { controller, ports, commit } = setup()
    ports.selectionPending.value = true
    await controller.saveToHistory()
    expect(commit).not.toHaveBeenCalled()
  })

  it('shows the native persistence error message', async () => {
    const { controller, ports, commit } = setup()
    commit.mockRejectedValueOnce({ code: 'io', message: 'Library disk is full' })
    await controller.saveToHistory()
    expect(ports.error.value).toBe('Library disk is full')
  })

  it('cancels initial selection even when a reused WebView reports Escape as repeated', async () => {
    const { controller, ports, dismissWindow } = setup()
    ports.selectionPending.value = true
    const event = new KeyboardEvent('keydown', { key: 'Escape', repeat: true, cancelable: true })
    controller.keydown(event)
    await vi.waitFor(() => expect(dismissWindow).toHaveBeenCalledOnce())
    expect(event.defaultPrevented).toBe(true)
    expect(ports.coordinator.cancel).toHaveBeenCalledWith('draft')
  })

  it('ignores repeated Escape in editing so a held key cannot close after cancelling a stroke', () => {
    const { controller, dismissWindow } = setup()
    controller.keydown(new KeyboardEvent('keydown', { key: 'Escape', repeat: true }))
    expect(dismissWindow).not.toHaveBeenCalled()
  })

  it('lets a focused action button handle Enter and keeps canvas Enter as Copy', () => {
    const { controller } = setup()
    const copy = vi.spyOn(controller, 'copy').mockResolvedValue(undefined)
    const nav = document.createElement('nav')
    nav.className = 'cs-quick-actions'
    const button = document.createElement('button')
    nav.append(button)
    button.addEventListener('keydown', (event) => controller.keydown(event))
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(copy).not.toHaveBeenCalled()
    controller.keydown(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(copy).toHaveBeenCalledOnce()
  })
})
