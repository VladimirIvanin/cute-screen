import {
  fireEvent,
  render,
} from '@testing-library/vue'
import { defineComponent } from 'vue'
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import {
  createEditorShellPinia,
  useEditorShellStore,
} from '@cute-screen/editor-vue'

const mocks = vi.hoisted(() => ({
  getActive: vi.fn(),
  warmup: vi.fn(),
  present: vi.fn(),
  reveal: vi.fn(),
  dismiss: vi.fn(),
  cancel: vi.fn(),
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
    quickCaptureCancel: mocks.cancel,
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
    mocks.cancel.mockResolvedValue(true)
    mocks.listen.mockResolvedValue(() => undefined)
  })

  it('cancels initial selection before the nested canvas consumes Escape', async () => {
    const view = render(QuickCaptureApp, {
      global: {
        plugins: [createEditorShellPinia()],
        stubs: {
          EditorShell: defineComponent({
            template: '<div data-testid="consuming-canvas" tabindex="0" @keydown.prevent />',
          }),
        },
      },
    })
    await vi.waitFor(() => expect(mocks.warmup).toHaveBeenCalledWith('draft-gtk'))
    await fireEvent.keyDown(view.getByTestId('consuming-canvas'), { key: 'Escape' })
    await vi.waitFor(() => expect(mocks.dismiss).toHaveBeenCalledOnce())
  })

  it.each(['body', 'canvas', 'drag'])('cancels initial selection from %s with the real shell', async (target) => {
    const view = render(QuickCaptureApp, {
      global: { plugins: [createEditorShellPinia()] },
    })
    await vi.waitFor(() => expect(mocks.loadImage).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(view.container.querySelector('.cs-loading')).toBeNull())
    const scene = view.getByLabelText('Scene canvas') as HTMLCanvasElement
    if (target === 'body') {
      // Native reveal can leave focus outside the shell even after the hidden
      // canvas attempted to focus during mount.
      scene.blur()
      expect(document.activeElement).toBe(document.body)
    } else if (target === 'drag') {
      scene.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280, height: 720 }) as DOMRect
      scene.setPointerCapture = vi.fn()
      await fireEvent.pointerDown(scene, { pointerId: 7, button: 0, clientX: 100, clientY: 100 })
      await fireEvent.pointerMove(scene, { pointerId: 7, clientX: 600, clientY: 400 })
      expect(view.container.querySelector('.cs-quick-capture')).toHaveClass('is-changing-frame')
    }
    await fireEvent.keyDown(target === 'body' ? document.body : scene, { key: 'Escape' })
    await vi.waitFor(() => expect(mocks.cancel).toHaveBeenCalledWith('draft-gtk'))
    expect(mocks.dismiss).toHaveBeenCalledOnce()
  })

  it('overlaps mapped warmup with frozen-frame decode', async () => {
    render(QuickCaptureApp, {
      global: {
        plugins: [createEditorShellPinia()],
        stubs: { EditorShell: EditorShellStub },
      },
    })

    await vi.waitFor(() => expect(mocks.warmup).toHaveBeenCalledWith('draft-gtk'))
    expect(mocks.loadImage).toHaveBeenCalledOnce()
    expect(mocks.warmup.mock.invocationCallOrder[0]).toBeLessThan(mocks.loadImage.mock.invocationCallOrder[0]!)
    expect(mocks.present).not.toHaveBeenCalled()
    expect(mocks.reveal).not.toHaveBeenCalled()
  })

  it('replaces the loading overlay after the pending full-frame session mounts', async () => {
    const pinia = createEditorShellPinia()
    const view = render(QuickCaptureApp, {
      global: { plugins: [pinia] },
    })

    await vi.waitFor(() => expect(mocks.loadImage).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(view.container.querySelector('.cs-loading')).toBeNull())
    expect(useEditorShellStore(pinia).documentState).toMatchObject({
      kind: 'ready',
    })
  })
  it('flushes the previous selection out of the reused shell before native warmup', async () => {
    const first = await mocks.getActive()
    mocks.getActive.mockResolvedValue({ ...first, selectionPending: false })
    const view = render(QuickCaptureApp, {
      global: {
        plugins: [createEditorShellPinia()],
        stubs: { EditorShell: defineComponent({
          props: ['initialDocumentState', 'documentSession'],
          template: '<div data-testid="painted-shell" :data-kind="initialDocumentState.kind" :data-document="documentSession?.snapshot.core.document.id" />',
        }) },
      },
    })
    await vi.waitFor(() => expect(view.getByTestId('painted-shell')).toHaveAttribute('data-kind', 'ready'))
    const previousDocument = view.getByTestId('painted-shell').getAttribute('data-document')
    expect(previousDocument).toBeTruthy()
    const paintedAtWarmup: Array<{ kind: string | null; document: string | null }> = []
    mocks.warmup.mockImplementation(async () => {
      const element = view.getByTestId('painted-shell')
      paintedAtWarmup.push({ kind: element.getAttribute('data-kind'), document: element.getAttribute('data-document') })
      return true
    })
    mocks.getActive.mockResolvedValue({ ...first, draftId: 'second-draft', selectionPending: true })
    const available = mocks.listen.mock.calls.find(([event]) => event === 'cute-screen:quick-capture-available')?.[1] as (() => void)
    expect(available).toBeTypeOf('function')
    available()
    await vi.waitFor(() => expect(paintedAtWarmup).toHaveLength(1))
    expect(paintedAtWarmup[0]).toEqual({ kind: 'loading', document: null })
  })

})
