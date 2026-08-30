import { render } from '@testing-library/vue'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createEditorShellPinia } from '@cute-screen/editor-vue'

const mocks = vi.hoisted(() => ({
  getActive: vi.fn(),
  warmup: vi.fn(),
  present: vi.fn(),
  reveal: vi.fn(),
  dismiss: vi.fn(),
  listen: vi.fn(),
  loadImage: vi.fn(),
}))

vi.mock('@cute-screen/editor-vue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@cute-screen/editor-vue')>()),
  loadImageWithBinaryFallback: mocks.loadImage,
}))

vi.mock('../../../apps/desktop/src/desktop-bridge', () => ({
  tauriDesktopBridge: {
    quickCaptureGetActive: mocks.getActive,
    quickCaptureWarmup: mocks.warmup,
    quickCapturePresent: mocks.present,
    quickCaptureReveal: mocks.reveal,
    quickCaptureDismiss: mocks.dismiss,
  },
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: mocks.listen,
}))

import QuickCaptureApp from '../../../apps/desktop/src/QuickCaptureApp.vue'

const EditorShellStub = defineComponent({
  name: 'EditorShell',
  template: '<div data-testid="editor-shell-stub" />',
})

describe('GTK quick capture mapped warmup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getActive.mockResolvedValue({
      version: 1,
      draftId: 'draft-gtk',
      correlationId: 'capture-gtk',
      imageToken: 'image-gtk',
      width: 1280,
      height: 720,
      selection: { x: 100, y: 80, width: 640, height: 360 },
      canExpandSelection: true,
      selectionPending: true,
    })
    mocks.loadImage.mockResolvedValue({
      resource: document.createElement('img'),
      metadata: {
        token: 'image-gtk',
        assetUrl: 'asset://image-gtk',
        mimeType: 'image/png',
        width: 1280,
        height: 720,
        sha256: 'a'.repeat(64),
        correlationId: 'capture-gtk',
      },
      transport: 'asset',
    })
    mocks.warmup.mockResolvedValue(true)
    mocks.present.mockResolvedValue(true)
    mocks.reveal.mockResolvedValue(true)
    mocks.dismiss.mockResolvedValue(true)
    mocks.listen.mockResolvedValue(() => undefined)
  })

  it('overlaps mapped warmup with frozen-frame decode', async () => {
    render(QuickCaptureApp, {
      global: {
        plugins: [createEditorShellPinia()],
        stubs: { EditorShell: EditorShellStub },
      },
    })

    await vi.waitFor(() =>
      expect(mocks.warmup).toHaveBeenCalledWith('draft-gtk'),
    )
    expect(mocks.loadImage).toHaveBeenCalledOnce()
    expect(mocks.warmup.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.loadImage.mock.invocationCallOrder[0]!,
    )
    expect(mocks.present).not.toHaveBeenCalled()
    expect(mocks.reveal).not.toHaveBeenCalled()
  })
})
