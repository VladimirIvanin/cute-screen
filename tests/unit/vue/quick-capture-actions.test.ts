import { render, screen } from '@testing-library/vue'
import { describe, expect, it, vi } from 'vitest'

import { createEditorShellPinia } from '@cute-screen/editor-vue'

const bridgeMocks = vi.hoisted(() => ({
  getActive: vi.fn().mockResolvedValue(null),
  presentWindow: vi.fn().mockResolvedValue(true),
  dismissWindow: vi.fn().mockResolvedValue(true),
  listenAvailable: vi.fn().mockResolvedValue(() => undefined),
}))

vi.mock('../../../apps/desktop/src/desktop-bridge', () => ({
  tauriDesktopBridge: {
    quickCaptureGetActive: bridgeMocks.getActive,
    quickCapturePresent: bridgeMocks.presentWindow,
    quickCaptureDismiss: bridgeMocks.dismissWindow,
  },
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: bridgeMocks.listenAvailable,
}))

import {
  cancelQuickCaptureAction,
  normalizeQuickCaptureSelection,
} from '../../../apps/desktop/src/quick-capture-actions'
import QuickCaptureApp from '../../../apps/desktop/src/QuickCaptureApp.vue'

describe('quick capture terminal actions', () => {
  it('keeps the prewarmed idle webview free of loading and action chrome', async () => {
    render(QuickCaptureApp, {
      global: { plugins: [createEditorShellPinia()] },
    })

    await vi.waitFor(() => expect(bridgeMocks.getActive).toHaveBeenCalled())
    expect(
      screen.queryByRole('navigation', {
        name: /Quick capture actions|Действия со снимком/u,
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Quick capture draft is no longer available.'),
    ).not.toBeInTheDocument()
  })

  it('normalizes fractional crop edges to bounded integer physical pixels', () => {
    expect(
      normalizeQuickCaptureSelection(
        {
          x: 45.0000000004,
          y: 36.4999999996,
          width: 1403.9999999997,
          height: 678.0000152587891,
        },
        { width: 1920, height: 1080 },
      ),
    ).toEqual({ x: 45, y: 36, width: 1404, height: 679 })

    expect(
      normalizeQuickCaptureSelection(
        { x: -12.4, y: 900.2, width: 100, height: 300 },
        { width: 1920, height: 1080 },
      ),
    ).toEqual({ x: 0, y: 900, width: 88, height: 180 })
  })

  it('attempts to close the quick window even when draft cancellation rejects', async () => {
    const closeWindow = vi.fn().mockResolvedValue(undefined)
    const cancellationError = new Error('cancel IPC failed')

    await expect(
      cancelQuickCaptureAction({
        draftId: 'draft-1',
        cancelDraft: vi.fn().mockRejectedValue(cancellationError),
        closeWindow,
      }),
    ).rejects.toBe(cancellationError)
    expect(closeWindow).toHaveBeenCalledOnce()
  })

  it('starts closing without waiting for draft cancellation to settle', async () => {
    let finishCancellation: (() => void) | undefined
    const cancelDraft = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishCancellation = resolve
        }),
    )
    const closeWindow = vi.fn().mockResolvedValue(undefined)

    const operation = cancelQuickCaptureAction({
      draftId: 'draft-1',
      cancelDraft,
      closeWindow,
    })

    expect(closeWindow).toHaveBeenCalledOnce()
    finishCancellation?.()
    await operation
  })

  it('closes immediately when no draft has mounted yet', async () => {
    const cancelDraft = vi.fn()
    const closeWindow = vi.fn().mockResolvedValue(undefined)

    await cancelQuickCaptureAction({ cancelDraft, closeWindow })

    expect(cancelDraft).not.toHaveBeenCalled()
    expect(closeWindow).toHaveBeenCalledOnce()
  })

  it('routes pre-mount cleanup through the reusable native dismiss boundary', async () => {
    bridgeMocks.dismissWindow.mockClear()

    await cancelQuickCaptureAction({
      cancelDraft: vi.fn(),
      closeWindow: async () => {
        const dismissed = await bridgeMocks.dismissWindow()
        if (!dismissed) throw new Error('Quick capture window is unavailable')
      },
    })

    expect(bridgeMocks.dismissWindow).toHaveBeenCalledOnce()
  })
})
