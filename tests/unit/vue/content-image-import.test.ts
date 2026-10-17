import {
  fireEvent,
  render,
} from '@testing-library/vue'
import {
  markRaw,
  ref,
  shallowRef,
} from 'vue'
import {
  describe,
  afterEach,
  expect,
  it,
  vi,
} from 'vitest'

vi.mock('../../../packages/editor-vue/src/image-transport', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as object),
    loadImageWithBinaryFallback: vi.fn(async () => ({
      resource: document.createElement('img'),
      metadata: { width: 1, height: 1 },
      transport: 'binary',
    })),
  }
})

import {
  createEditorShellPinia,
  type ContentImageBridge,
} from '@cute-screen/editor-vue'
import EditorShell from '../../../packages/editor-vue/src/shell/components/EditorShell.vue'
import {
  createContentController,
  type ContentControllerContext,
} from '../../../packages/editor-vue/src/shell/workspace/content-controller'
import { createLayerController } from '../../../packages/editor-vue/src/shell/workspace/layer-controller'
import { loadImageWithBinaryFallback } from '../../../packages/editor-vue/src/image-transport'
import { canvasContext } from './m08-precision-test-kit'
import {
  arrowDocument,
  arrowSession,
} from './app-test-kit'

function contentImageBridge(): ContentImageBridge {
  return {
    releaseImage: vi.fn(async () => undefined),
    importContentImage: vi.fn(async () => ({
      kind: 'imported' as const,
      blobHash: 'b'.repeat(64),
      format: 'png' as const,
      mimeType: 'image/png' as const,
      width: 1,
      height: 1,
      resourceToken: 'content-image-token',
    })),
    stageImage: vi.fn(async (token, correlationId) => ({
      token,
      assetUrl: '',
      mimeType: 'image/png',
      width: 1,
      height: 1,
      sha256: 'b'.repeat(64),
      correlationId,
    })),
    readImageBytes: vi.fn(async () => new ArrayBuffer(0)),
  }
}

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

function operationFixture() {
  const document = arrowDocument()
  const session = arrowSession(document)
  const bridge = contentImageBridge()
  const props = { contentImageBridge: bridge, clipboardBridge: {
    ...bridge,
    readClipboardSnapshot: vi.fn(async () => ({ bitmap: { kind: 'imported', blobHash: 'b'.repeat(64),
      format: 'png', mimeType: 'image/png', width: 3840, height: 2160, resourceToken: 'clipboard-token' } })),
  }, documentSession: markRaw(session), readOnlyDocument: false }
  const store = { selectedLayerIds: [] as string[], selectTool: vi.fn(), selectLayer: vi.fn() }
  const context = {
    props, error: ref<string>(), feedback: ref<string>(), locale: () => 'en' as const,
    activeDocument: shallowRef(document), contentImageImporting: ref(false), textureImages: shallowRef(new Map()),
    textDefaults: shallowRef({}), selectedLayerId: ref<string>(), rememberTextDefaults: vi.fn(),
    focus: vi.fn(), target: () => ({ bounds: { x: 20, y: 10, width: 80, height: 60 } }),
    addLayer: vi.fn(),
  } as unknown as ContentControllerContext
  const layers = createLayerController({ props: context.props, activeDocument: context.activeDocument, store,
    finishTextEditing: (next) => next() })
  Object.assign(context, { addLayer: vi.fn(layers.addLayer) })
  const controller = createContentController(context)
  cleanups.push(() => {
    controller.dispose()
    session.dispose()
  })
  return { controller, context, bridge, props, store, session }
}

describe('shared image insertion lifecycle', () => {
  it('pastes a bitmap through one command, selects it and restores it with undo/redo', async () => {
    const { controller, session, store, bridge } = operationFixture()
    await controller.pasteNativeClipboard()
    const image = session.snapshot.core.document.layers.at(-1)!
    expect(image.kind).toBe('image')
    expect(image.transform.scaleX).toBeCloseTo(64 / 3840)
    expect(store.selectTool).toHaveBeenCalledWith('select')
    expect(store.selectLayer).toHaveBeenCalledWith(image.id)
    expect(bridge.releaseImage).toHaveBeenCalledWith('clipboard-token')
    session.undo()
    expect(session.snapshot.core.document.layers).toHaveLength(1)
    session.redo()
    expect(session.snapshot.core.document.layers.at(-1)).toEqual(image)
  })
  it('ignores a late picker result after the session changes and releases its token', async () => {
    const { controller, bridge, context, props, store } = operationFixture()
    const result = await bridge.importContentImage('fixture')
    let finish!: (value: typeof result) => void
    vi.mocked(bridge.importContentImage).mockImplementation(() => new Promise((resolve) => {
      finish = resolve
    }))
    const pending = controller.importContentImage()
    props.documentSession = markRaw(arrowSession())
    cleanups.push(() => props.documentSession.dispose())
    finish(result)
    await pending
    expect(context.addLayer).not.toHaveBeenCalled()
    expect(store.selectTool).not.toHaveBeenCalled()
    expect(bridge.releaseImage).toHaveBeenCalledWith('content-image-token')
  })
  it('suppresses duplicate requests and discards a cancelled decode', async () => {
    const { controller, bridge, context } = operationFixture()
    let finish!: (value: Awaited<ReturnType<typeof loadImageWithBinaryFallback>>) => void
    vi.mocked(loadImageWithBinaryFallback).mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve
    }))
    const pending = controller.importContentImage()
    await Promise.resolve()
    await controller.importContentImage()
    controller.cancelImageImport()
    const image = document.createElement('img')
    finish({ resource: image, metadata: {} as never, transport: 'binary' })
    await pending
    expect(bridge.importContentImage).toHaveBeenCalledTimes(1)
    expect(context.addLayer).not.toHaveBeenCalled()
    expect(context.textureImages.value.size).toBe(0)
    expect(bridge.releaseImage).toHaveBeenCalled()
  })
  it('shows a recoverable localized error without changing history', async () => {
    const { controller, bridge, context, session } = operationFixture()
    vi.mocked(bridge.importContentImage).mockRejectedValueOnce({ code: 'imageTooLarge' })
    await controller.importContentImage()
    expect(context.error.value).toBe('The image is too large.')
    expect(session.snapshot.core.canUndo).toBe(false)
    expect(context.contentImageImporting.value).toBe(false)
  })
  it('decodes a dropped image through the same command path', async () => {
    const { controller, bridge, context } = operationFixture()
    bridge.importDroppedImage = vi.fn(() => bridge.importContentImage('drop'))
    await controller.importDroppedImage('drop-grant', { bounds: { x: 20, y: 10, width: 80, height: 60 }, center: { x: 100, y: 70 } })
    expect(bridge.importDroppedImage).toHaveBeenCalledWith('drop-grant', expect.any(String))
    expect(context.addLayer).toHaveBeenCalledTimes(1)
  })
  it('does not add a layer when WebView decoding fails', async () => {
    const { controller, bridge, context } = operationFixture()
    vi.mocked(loadImageWithBinaryFallback).mockRejectedValueOnce(new Error('corrupt source'))
    await controller.importContentImage()
    expect(context.addLayer).not.toHaveBeenCalled()
    expect(context.error.value).toBeTruthy()
    expect(bridge.releaseImage).toHaveBeenCalled()
  })
})

describe('content image import', () => {
  it('adds a content image layer through EditorCommand after a successful native import', async () => {
    const session = arrowSession(arrowDocument())
    const bridge = contentImageBridge()
    const addLayer = vi.fn()
    const error = ref<string | undefined>()
    const controller = createContentController({
      error,
      props: {
        contentImageBridge: bridge,
        documentSession: markRaw(session),
        readOnlyDocument: false,
      },
      activeDocument: shallowRef(arrowDocument()),
      contentImageImporting: ref(false),
      textureImages: shallowRef(new Map()),
      textDefaults: shallowRef({
        fontFamily: 'Inter',
        fontSize: 24,
        weight: 400,
        italic: false,
        strikethrough: false,
        alignment: 'start',
        listKind: 'none',
        color: { red: 0, green: 0, blue: 0, alpha: 1 },
        background: null,
      }),
      selectedLayerId: ref(undefined),
      rememberTextDefaults: vi.fn(),
      addLayer,
    } as unknown as ContentControllerContext)

    await controller.importContentImage({ x: 50, y: 40 })

    expect(error.value).toBeUndefined()
    expect(bridge.importContentImage).toHaveBeenCalledTimes(1)
    expect(addLayer).toHaveBeenCalledTimes(1)
    const layer = addLayer.mock.calls[0]?.[0]
    expect(layer?.kind).toBe('image')
    expect(layer?.payload?.role).toBe('content')
    expect(layer?.transform).toMatchObject({
      translateX: 49.5,
      translateY: 39.5,
    })
    session.dispose()
  })

  it('opens the native image dialog when Image is chosen by button or G', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext() as never)
    const session = arrowSession(arrowDocument())
    const bridge: ContentImageBridge = {
      importContentImage: vi.fn(async () => ({ kind: 'cancelled' as const })),
      stageImage: vi.fn(async (token, correlationId) => ({
        token,
        assetUrl: '',
        mimeType: 'image/png',
        width: 1,
        height: 1,
        sha256: 'b'.repeat(64),
        correlationId,
      })),
      readImageBytes: vi.fn(async () => new ArrayBuffer(0)),
    }
    const view = render(EditorShell, {
      props: { documentSession: markRaw(session) },
      global: { plugins: [createEditorShellPinia()] },
    })
    const button = () => view.container.querySelector('button[data-tool-id="image"]') as HTMLButtonElement
    expect(button().disabled).toBe(true)

    await view.rerender({ contentImageBridge: bridge })
    expect(button().disabled).toBe(false)

    await fireEvent.click(button())
    expect(bridge.importContentImage).toHaveBeenCalledTimes(1)

    await fireEvent.keyDown(window, { key: 'п', code: 'KeyG' })
    expect(bridge.importContentImage).toHaveBeenCalledTimes(2)

    view.unmount()
    session.dispose()
  })
})
