import { fireEvent, render, screen, within } from '@testing-library/vue'
import { describe, expect, it, vi } from 'vitest'
import { markRaw } from 'vue'

import App from '../../../apps/desktop/src/App.vue'
import { selectLayerFromPanel } from './layer-selection'
import ActionFeedback from '../../../packages/editor-vue/src/shell/components/ActionFeedback.vue'
import CanvasViewport from '../../../packages/editor-vue/src/shell/components/CanvasViewport.vue'
import EditorShell from '../../../packages/editor-vue/src/shell/components/EditorShell.vue'
import TopBar from '../../../packages/editor-vue/src/shell/components/TopBar.vue'
import ZoomControls from '../../../packages/editor-vue/src/shell/components/ZoomControls.vue'
import {
  assertLocaleCompleteness,
  createEditorShellPinia,
  DocumentSessionController,
  parsePreferences,
  resolveSystemLocale,
  t,
} from '@cute-screen/editor-vue'
import {
  createContentImageLayer,
  createTextLayer,
  hitTestDocument,
  parseEditorDocument,
  serializeEditorDocument,
  type EditorDocumentV1,
} from '@cute-screen/editor-renderer'

function renderApp() {
  return render(App, { global: { plugins: [createEditorShellPinia()] } })
}

function arrowDocument(locked = false): EditorDocumentV1 {
  return {
    schemaVersion: 7,
    id: '019c1f62-058e-7000-8000-0000000000aa',
    source: {
      blobHash: 'a'.repeat(64),
      format: 'png',
      mimeType: 'image/png',
      width: 100,
      height: 100,
      orientationApplied: true,
      color: { colorSpace: 'srgb', hasIccProfile: false },
    },
    canvas: { width: 100, height: 100 },
    crop: null,
    layers: [
      {
        id: '019c1f62-058e-7000-8000-0000000000ab',
        kind: 'arrow',
        localBounds: { x: 0, y: 0, width: 60, height: 20 },
        transform: {
          translateX: 10,
          translateY: 10,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        },
        opacity: 0.4,
        blendMode: 'screen',
        shadows: [],
        visible: true,
        locked,
        payload: {
          path: 'straight',
          start: { x: 0, y: 0 },
          end: { x: 60, y: 20 },
          startCap: 'none',
          endCap: 'solidArrow',
          stroke: {
            color: { red: 0.9, green: 0.2, blue: 0.3, alpha: 1 },
            width: 3,
            style: 'dotted',
            cap: 'round',
            join: 'round',
          },
        },
      },
    ],
    presentation: {
      beautify: { enabled: false },
      watermark: { enabled: false },
    },
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
  }
}

function arrowSession(document = arrowDocument()): DocumentSessionController {
  return new DocumentSessionController({
    document,
    revision: 1,
    bridge: {
      saveDocument: async () => 2,
      exportRecoveryBundle: async () => ({ kind: 'saved' }),
    },
    correlationId: () => 'arrow-toolbar-test',
    debounceMs: 60_000,
  })
}

function divergentArrowDocument(): EditorDocumentV1 {
  const document = arrowDocument()
  const arrow = document.layers[0]
  if (!arrow || arrow.kind !== 'arrow') throw new Error('expected arrow')
  return {
    ...document,
    layers: [
      {
        ...arrow,
        payload: {
          ...arrow.payload,
          path: 'quadratic',
          bend: { x: 30, y: -15 },
          startCap: 'lineArrow',
          endCap: 'diamond',
          stroke: {
            ...arrow.payload.stroke,
            color: { red: 0.1, green: 0.2, blue: 0.3, alpha: 1 },
            width: 3,
            style: 'dotted',
          },
        },
      },
    ],
  }
}

async function selectArrowLayer(view: ReturnType<typeof render>) {
  return selectLayerFromPanel(view)
}

describe('M02 editor shell', () => {
  it('keeps an unselected Arrow change in persistent defaults without a document command', async () => {
    window.localStorage.clear()
    const session = arrowSession()
    const first = render(EditorShell, {
      props: { documentSession: markRaw(session) },
      global: { plugins: [createEditorShellPinia()] },
    })

    await fireEvent.click(screen.getByRole('button', { name: 'Arrow' }))
    expect(
      screen.queryByRole('button', { name: 'Stroke: 3 px' }),
    ).not.toBeInTheDocument()
    await fireEvent.contextMenu(screen.getByRole('button', { name: 'Arrow' }))
    await fireEvent.click(
      await screen.findByRole('button', { name: 'Stroke: 3 px' }),
    )
    await fireEvent.click(await screen.findByRole('button', { name: '2 px' }))

    expect(screen.getByRole('button', { name: 'Arrow' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(session.snapshot.core.canUndo).toBe(false)
    expect(session.snapshot.core.document.layers[0]).toMatchObject({
      payload: { stroke: { width: 3, style: 'dotted' } },
    })
    first.unmount()
    session.dispose()

    render(EditorShell, {
      props: { fixture: 'ready' },
      global: { plugins: [createEditorShellPinia()] },
    })
    await fireEvent.contextMenu(screen.getByRole('button', { name: 'Arrow' }))
    expect(
      await screen.findByRole('button', { name: 'Stroke: 2 px' }),
    ).toBeInTheDocument()
  })

  it('shows a selected unlocked Arrow payload instead of active-tool defaults and commits one change', async () => {
    window.localStorage.clear()
    const session = arrowSession(divergentArrowDocument())
    const view = render(EditorShell, {
      props: { documentSession: markRaw(session) },
      global: { plugins: [createEditorShellPinia()] },
    })

    await selectArrowLayer(view)

    await vi.waitFor(() => {
      expect(
        view.container.querySelector('.cs-arrow-floating-toolbar-host'),
      ).toBeTruthy()
    })
    await fireEvent.click(screen.getByRole('button', { name: 'Stroke: 3 px' }))
    expect(
      await screen.findByRole('button', { name: 'Dotted' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getByRole('button', { name: 'Tail: Line arrow' }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: 'Geometry: Curved' }),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'Head: Diamond' })).toBeVisible()

    const execute = vi.spyOn(session, 'execute')
    await fireEvent.click(screen.getByRole('button', { name: 'Head: Diamond' }))
    await fireEvent.click(await screen.findByRole('button', { name: 'Circle' }))

    expect(execute).toHaveBeenCalledTimes(1)
    expect(session.snapshot.core.document.layers[0]).toMatchObject({
      payload: {
        path: 'quadratic',
        startCap: 'lineArrow',
        endCap: 'circle',
        stroke: {
          color: { red: 0.1, green: 0.2, blue: 0.3, alpha: 1 },
          width: 3,
          style: 'dotted',
        },
      },
    })
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    session.dispose()
    view.unmount()
  })

  it('rebases a selected Arrow 10 px toolbar update for hit testing, undo and reopen', async () => {
    window.localStorage.clear()
    const session = arrowSession()
    const before = structuredClone(session.snapshot.core.document.layers[0])
    const view = render(EditorShell, {
      props: { documentSession: markRaw(session) },
      global: { plugins: [createEditorShellPinia()] },
    })

    await selectArrowLayer(view)
    const execute = vi.spyOn(session, 'execute')
    await fireEvent.click(screen.getByRole('button', { name: 'Stroke: 3 px' }))
    await fireEvent.click(await screen.findByRole('button', { name: '10 px' }))

    expect(execute).toHaveBeenCalledTimes(1)
    const updated = session.snapshot.core.document
    expect(updated.layers[0]?.localBounds?.width).toBeGreaterThan(
      before?.localBounds?.width ?? 0,
    )
    expect(updated.layers[0]?.localBounds?.height).toBeGreaterThan(
      before?.localBounds?.height ?? 0,
    )
    expect(hitTestDocument(updated, { x: 95, y: 30 })).toMatchObject({
      nodeId: '019c1f62-058e-7000-8000-0000000000ab',
      part: 'stroke',
    })
    expect(parseEditorDocument(serializeEditorDocument(updated))).toMatchObject(
      { kind: 'editable' },
    )

    session.undo()
    expect(session.snapshot.core.document.layers[0]).toEqual(before)
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    session.dispose()
    view.unmount()
  })

  it('updates a selected Arrow with one undoable command while preserving opacity, blend and legacy style', async () => {
    window.localStorage.clear()
    const session = arrowSession()
    const view = render(EditorShell, {
      props: { documentSession: markRaw(session) },
      global: { plugins: [createEditorShellPinia()] },
    })

    await selectArrowLayer(view)
    await fireEvent.click(screen.getByRole('button', { name: 'Stroke: 3 px' }))
    await fireEvent.click(await screen.findByRole('button', { name: '4 px' }))

    expect(session.snapshot.core.document.layers[0]).toMatchObject({
      opacity: 0.4,
      blendMode: 'screen',
      payload: { stroke: { width: 4, style: 'dotted' } },
    })
    session.undo()
    expect(session.snapshot.core.document.layers[0]).toMatchObject({
      payload: { stroke: { width: 3, style: 'dotted' } },
    })

    await fireEvent.click(
      screen.getByRole('button', { name: 'Geometry: Straight' }),
    )
    await fireEvent.click(await screen.findByRole('button', { name: 'Elbow' }))
    expect(session.snapshot.core.document.layers[0]).toMatchObject({
      opacity: 0.4,
      blendMode: 'screen',
      payload: {
        path: 'elbow',
        stroke: { width: 3, style: 'dotted' },
      },
    })
    session.undo()
    expect(session.snapshot.core.document.layers[0]).toMatchObject({
      payload: { path: 'straight', stroke: { width: 3, style: 'dotted' } },
    })

    session.dispose()
    view.unmount()
  })

  it('disables all Arrow controls for a selected locked layer and for a read-only document', async () => {
    window.localStorage.clear()
    const session = arrowSession(arrowDocument(true))
    const view = render(EditorShell, {
      props: { documentSession: markRaw(session) },
      global: { plugins: [createEditorShellPinia()] },
    })
    await selectArrowLayer(view)

    expect(screen.getByRole('button', { name: 'Stroke: 3 px' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Tail: None' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Geometry: Straight' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Head: Solid arrow' }),
    ).toBeDisabled()

    session.dispose()
    view.unmount()
    render(EditorShell, {
      props: { fixture: 'ready', readOnlyDocument: true },
      global: { plugins: [createEditorShellPinia()] },
    })
    await fireEvent.contextMenu(screen.getByRole('button', { name: 'Arrow' }))
    expect(
      await screen.findByRole('button', { name: 'Stroke: 3 px' }),
    ).toBeDisabled()
  })

  it('localizes Arrow toolbar labels in Russian', async () => {
    expect(t('ru', 'arrowStroke')).toBe('Линия')
    expect(t('ru', 'arrowTail')).toBe('Хвост')
    expect(t('ru', 'arrowGeometry')).toBe('Геометрия')
    expect(t('ru', 'arrowHead')).toBe('Наконечник')
  })
  it('keeps compact zoom actions without free-form input or preset select', async () => {
    const view = render(ZoomControls, {
      props: {
        zoom: 22,
        t: (key) => key,
      },
    })

    const hud = screen.getByRole('group', { name: 'zoom' })
    expect(hud).toHaveAttribute('data-zoom', '22')
    expect(screen.getByRole('button', { name: 'zoomOut' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'fitZoom' })).toHaveTextContent(
      'Fit',
    )
    expect(screen.getByRole('button', { name: 'zoomValue' })).toHaveTextContent(
      '1:1',
    )
    expect(screen.getByRole('button', { name: 'zoomIn' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: 'zoomValue' }))
    expect(view.emitted('zoom')).toEqual([[100]])
    await fireEvent.click(screen.getByRole('button', { name: 'fitZoom' }))
    expect(view.emitted('fit')).toEqual([[]])
  })

  it('disables capture when the native capability probe says it is unavailable', () => {
    render(TopBar, {
      props: {
        locale: 'en',
        theme: 'system',
        canCopyOrExport: false,
        captureAvailable: false,
        captureUnavailableReason: 'Portal backend is unavailable',
        t: (key) => key,
      },
    })

    expect(screen.getByRole('button', { name: 'capture' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'capture' })).toHaveAttribute(
      'title',
      'Portal backend is unavailable',
    )
  })

  it('exposes window capture only when the native backend advertises it', async () => {
    const hidden = render(TopBar, {
      props: {
        locale: 'en',
        theme: 'system',
        canCopyOrExport: false,
        captureWindowAvailable: false,
        t: (key) => key,
      },
    })
    expect(
      screen.queryByRole('button', { name: 'captureWindow' }),
    ).not.toBeInTheDocument()
    hidden.unmount()

    const available = render(TopBar, {
      props: {
        locale: 'en',
        theme: 'system',
        canCopyOrExport: false,
        captureWindowAvailable: true,
        t: (key) => key,
      },
    })
    await fireEvent.click(screen.getByRole('button', { name: 'captureWindow' }))
    expect(available.emitted('action')).toEqual([['captureWindow']])
  })

  it('routes Open image to the native action only when the desktop bridge is available', async () => {
    const view = render(TopBar, {
      props: {
        locale: 'en',
        theme: 'system',
        canCopyOrExport: false,
        openImageAvailable: true,
        t: (key) => key,
      },
    })

    const openImage = screen.getByRole('button', { name: 'openImage' })
    expect(openImage).toBeEnabled()
    await fireEvent.click(openImage)
    expect(view.emitted('action')).toEqual([['openImage']])
  })

  it('offers Open image from the empty canvas when the native bridge is available', async () => {
    const view = render(CanvasViewport, {
      props: {
        documentState: { kind: 'empty' },
        openImageAvailable: true,
        t: (key) => key,
      },
    })

    await fireEvent.click(screen.getByRole('button', { name: 'openImage' }))
    expect(view.emitted('openImage')).toEqual([[]])
  })

  it('activates Hand with H outside text editing without intercepting text input', async () => {
    render(EditorShell, {
      props: { fixture: 'ready' },
      global: { plugins: [createEditorShellPinia()] },
    })

    const hand = screen.getByRole('button', { name: 'Hand' })
    expect(hand).toHaveAttribute('aria-pressed', 'false')

    await fireEvent.keyDown(window, { key: 'h' })
    expect(hand).toHaveAttribute('aria-pressed', 'true')

    const textInput = document.createElement('textarea')
    document.body.append(textInput)
    textInput.focus()
    await fireEvent.keyDown(textInput, { key: 'v' })

    expect(hand).toHaveAttribute('aria-pressed', 'true')
    textInput.remove()
  })

  /* Removed v0–v6 text preset/font inspector expectations; v7 coverage lives
   * in text-context-toolbar.test.ts.
  it('exposes compact text background presets only in the contextual toolbar', async () => {
    render(EditorShell, {
      props: {
        fixture: 'ready',
        initialDocumentState: {
          kind: 'ready',
          title: 'Test',
          dimensions: '100 × 100',
        },
      },
      global: { plugins: [createEditorShellPinia()] },
    })

    await fireEvent.click(screen.getByRole('button', { name: 'Text' }))
    const preset = await screen.findByRole('combobox', { name: 'Preset' })
    expect(preset).toHaveTextContent('Plain')
    await chooseNaiveOption('Preset', 'Neon')
    expect(preset).toHaveTextContent('Neon')

    const background = await screen.findByRole('combobox', {
      name: 'Background',
    })
    expect(background).toHaveTextContent('None')
    await chooseNaiveOption('Background', 'Blue')
    expect(background).toHaveTextContent('Blue')

    expect(preset).toHaveTextContent('Custom')

    const lineHeight = await screen.findByRole('combobox', {
      name: 'Line height',
    })
    expect(lineHeight).toHaveTextContent('1.25×')
    await chooseNaiveOption('Line height', '1.5×')
    expect(lineHeight).toHaveTextContent('1.5×')

    const shadow = await screen.findByRole('combobox', { name: 'Shadow' })
    expect(shadow).toHaveTextContent('Neon')
    await chooseNaiveOption('Shadow', 'Soft')
    expect(shadow).toHaveTextContent('Soft')

    await fireEvent.click(
      screen.getByRole('button', { name: 'Save personal preset' }),
    )
    await chooseNaiveOption('Preset', 'Plain')
    expect(background).toHaveTextContent('None')
    await chooseNaiveOption('Preset', 'My preset')
    expect(background).toHaveTextContent('Blue')
    expect(shadow).toHaveTextContent('Soft')
  })

  it('offers discovered system font families without sending font bytes through the shell', async () => {
    render(EditorShell, {
      props: {
        fixture: 'ready',
        initialDocumentState: {
          kind: 'ready',
          title: 'Test',
          dimensions: '100 × 100',
        },
        systemFonts: [{ family: 'Noto Sans', weight: 400, style: 'normal' }],
      },
      global: { plugins: [createEditorShellPinia()] },
    })

    await fireEvent.click(screen.getByRole('button', { name: 'Text' }))
    const font = await screen.findByRole('combobox', { name: 'Font' })
    expect(font).toHaveTextContent('Roboto · bundled')
    await chooseNaiveOption('Font', 'Noto Sans · system')
    expect(font).toHaveTextContent('Noto Sans · system')
    await chooseNaiveOption('Style', 'Italic')
    expect(
      screen.getByText('Missing Noto Sans face; preview may use a substitute.'),
    ).toBeInTheDocument()
  })

  */
  it('cuts a selected Text layer only after the native plain-text write succeeds', async () => {
    const text = createTextLayer({
      id: '019c1f62-058e-7000-8000-000000000001',
      text: 'Copy me',
      origin: { x: 10, y: 10 },
      fontFamily: 'Roboto',
    })
    if (!text) throw new Error('test Text layer should exist')
    const document: EditorDocumentV1 = {
      schemaVersion: 7,
      id: '019c1f62-058e-7000-8000-000000000000',
      source: {
        blobHash: 'a'.repeat(64),
        format: 'png',
        mimeType: 'image/png',
        width: 100,
        height: 100,
        orientationApplied: true,
        color: { colorSpace: 'srgb', hasIccProfile: false },
      },
      canvas: { width: 100, height: 100 },
      crop: null,
      layers: [text],
      presentation: {
        beautify: { enabled: false },
        watermark: { enabled: false },
      },
      createdAt: '2026-08-11T00:00:00.000Z',
      updatedAt: '2026-08-11T00:00:00.000Z',
    }
    const session = new DocumentSessionController({
      document,
      revision: 1,
      bridge: {
        saveDocument: async () => 2,
        exportRecoveryBundle: async () => ({ kind: 'saved' }),
      },
      correlationId: () => 'clipboard-test',
      debounceMs: 60_000,
    })
    const writeClipboardText = vi.fn().mockResolvedValue(undefined)
    const view = render(EditorShell, {
      props: {
        documentSession: markRaw(session),
        clipboardBridge: {
          readClipboardSnapshot: async () => ({}),
          writeClipboardText,
          stageImage: async () => {
            throw new Error('not used')
          },
          readImageBytes: async () => new ArrayBuffer(0),
        },
      },
      global: { plugins: [createEditorShellPinia()] },
    })

    await selectLayerFromPanel(view, { activateSelect: false })
    await fireEvent.keyDown(window, { key: 'x', ctrlKey: true })
    await vi.waitFor(() =>
      expect(writeClipboardText).toHaveBeenCalledWith(
        'Copy me',
        expect.any(String),
      ),
    )
    expect(session.snapshot.core.document.layers).toEqual([])

    session.dispose()
    view.unmount()
  })

  it('keeps content-image radius, border and opacity in the contextual toolbar', async () => {
    const image = createContentImageLayer({
      id: '019c1f62-058e-7000-8000-0000000000ac',
      blobHash: 'b'.repeat(64),
      format: 'png',
      intrinsicWidth: 80,
      intrinsicHeight: 60,
      origin: { x: 10, y: 12 },
    })
    const document: EditorDocumentV1 = {
      schemaVersion: 7,
      id: '019c1f62-058e-7000-8000-000000000000',
      source: {
        blobHash: 'a'.repeat(64),
        format: 'png',
        mimeType: 'image/png',
        width: 100,
        height: 100,
        orientationApplied: true,
        color: { colorSpace: 'srgb', hasIccProfile: false },
      },
      canvas: { width: 100, height: 100 },
      crop: null,
      layers: [image],
      presentation: {
        beautify: { enabled: false },
        watermark: { enabled: false },
      },
      createdAt: '2026-08-11T00:00:00.000Z',
      updatedAt: '2026-08-11T00:00:00.000Z',
    }
    const session = new DocumentSessionController({
      document,
      revision: 1,
      bridge: {
        saveDocument: async () => 2,
        exportRecoveryBundle: async () => ({ kind: 'saved' }),
      },
      correlationId: () => 'content-image-style',
      debounceMs: 60_000,
    })
    const view = render(EditorShell, {
      props: { documentSession: markRaw(session) },
      global: { plugins: [createEditorShellPinia()] },
    })

    await selectLayerFromPanel(view)
    const radius = await screen.findByRole('slider', { name: 'Radius' })
    const borderWidth = await screen.findByRole('slider', {
      name: 'Border width',
    })
    const toolbar = view.container.querySelector<HTMLElement>(
      '.cs-context-toolbar',
    )
    if (!toolbar) throw new Error('context toolbar should be rendered')
    const opacity = await within(toolbar).findByRole('slider', {
      name: 'Opacity',
    })
    radius.focus()
    for (let index = 0; index < 12; index += 1) {
      await fireEvent.keyDown(radius, { key: 'ArrowRight' })
    }
    borderWidth.focus()
    for (let index = 0; index < 3; index += 1) {
      await fireEvent.keyDown(borderWidth, { key: 'ArrowRight' })
    }
    opacity.focus()
    for (let index = 0; index < 8; index += 1) {
      await fireEvent.keyDown(opacity, { key: 'ArrowLeft' })
    }

    expect(session.snapshot.core.document.layers[0]).toMatchObject({
      kind: 'image',
      opacity: 0.6,
      payload: {
        radius: 12,
        border: {
          width: 3,
          color: { red: 0, green: 0, blue: 0, alpha: 1 },
        },
      },
    })

    session.dispose()
    view.unmount()
  })

  /* Text texture import is not part of the v7 rich-text contract.
  it('offers text texture import only when the native raw-binary bridge is available', async () => {
    const importTexture = vi.fn().mockResolvedValue({ kind: 'cancelled' })
    const textureBridge: TextureFillBridge = {
      importTexture,
      resolveTexture: async () => ({ kind: 'cancelled' }),
      stageImage: async () => {
        throw new Error('not called for a cancelled import')
      },
      readImageBytes: async () => {
        throw new Error('not called for a cancelled import')
      },
    }
    render(EditorShell, {
      props: {
        fixture: 'ready',
        initialDocumentState: {
          kind: 'ready',
          title: 'Test',
          dimensions: '100 × 100',
        },
        textureBridge,
      },
      global: { plugins: [createEditorShellPinia()] },
    })

    await fireEvent.click(screen.getByRole('button', { name: 'Text' }))
    await fireEvent.click(
      screen.getByRole('button', { name: 'Import texture' }),
    )
    expect(importTexture).toHaveBeenCalledOnce()
  })

  */
  it('renders a native selector cancellation as terminal feedback, not an error', () => {
    render(ActionFeedback, {
      props: {
        state: {
          status: 'cancelled',
          action: 'capture',
          message: 'Capture cancelled',
        },
        t: (key) => key,
      },
    })

    expect(screen.getByRole('status')).toHaveTextContent('Capture cancelled')
    expect(
      screen.queryByRole('button', { name: 'retry' }),
    ).not.toBeInTheDocument()
  })

  it('shows, copies, and lets the user dismiss the CLI fallback snackbar', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const descriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    render(EditorShell, {
      props: {
        captureFallbackCommand:
          "'/opt/Cute Screen/cute-screen' capture --mode area",
      },
      global: { plugins: [createEditorShellPinia()] },
    })

    expect(
      screen.getByText("'/opt/Cute Screen/cute-screen' capture --mode area"),
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveAttribute(
      'data-placement',
      'overlay',
    )
    expect(
      screen.getByRole('button', { name: 'Copy capture command' }),
    ).toBeInTheDocument()
    await fireEvent.click(
      screen.getByRole('button', { name: 'Copy capture command' }),
    )
    expect(writeText).toHaveBeenCalledWith(
      "'/opt/Cute Screen/cute-screen' capture --mode area",
    )
    expect(screen.getByText('Capture command copied')).toBeInTheDocument()
    await fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss capture fallback notice' }),
    )
    expect(
      screen.queryByText("'/opt/Cute Screen/cute-screen' capture --mode area"),
    ).not.toBeInTheDocument()
    if (descriptor) Object.defineProperty(navigator, 'clipboard', descriptor)
    else Reflect.deleteProperty(navigator, 'clipboard')
  })

  it('mounts from a clean state with a useful empty canvas', () => {
    renderApp()

    expect(
      screen.getByRole('heading', { name: 'Capture your first screen' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled()
    expect(
      screen.queryByRole('navigation', { name: 'Series frames' }),
    ).not.toBeInTheDocument()
  })

  it('keeps familiar compact actions accessible and labels every icon control', async () => {
    renderApp()
    expect(screen.getByRole('button', { name: 'Capture' })).toBeEnabled()
    expect(
      screen.getByRole('button', { name: 'More actions' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Zoom out' })).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    expect(
      screen.getByRole('menuitemradio', { name: 'Dark' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('menuitemradio', { name: 'RU' }),
    ).toBeInTheDocument()
  })

  it('uses the product locale fallback for corrupt preferences', () => {
    expect(resolveSystemLocale(['ru-RU', 'en-US'])).toBe('ru')
    expect(resolveSystemLocale(['de-DE'])).toBe('en')
    expect(parsePreferences('{broken', ['ru-RU'])).toMatchObject({
      locale: 'ru',
      theme: 'system',
    })
    expect(
      parsePreferences('{"schemaVersion":1,"locale":"fr","theme":"night"}', [
        'en-US',
      ]),
    ).toMatchObject({ locale: 'en', theme: 'system' })
  })

  it('keeps the RU and EN dictionaries complete', () => {
    expect(assertLocaleCompleteness()).toBe(true)
  })

  it('localizes visible shell labels and action feedback without a restart', async () => {
    renderApp()

    await fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
    await fireEvent.click(screen.getByRole('menuitemradio', { name: 'RU' }))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(
      screen.getByRole('complementary', { name: 'Инструменты' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('main', { name: 'Область холста' }),
    ).toBeInTheDocument()

    await fireEvent.click(screen.getByRole('button', { name: 'Снимок' }))
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Захват станет доступен после подключения native backend.',
    )
  })

  it('docks filmstrip, tool rail and zoom in one bottom chrome row', async () => {
    window.localStorage.clear()
    const view = render(EditorShell, {
      props: { fixture: 'ready' },
      global: { plugins: [createEditorShellPinia()] },
    })

    const chrome = view.container.querySelector('.cs-bottom-chrome')
    expect(chrome).toBeTruthy()
    expect(
      chrome?.querySelector('.cs-bottom-chrome-center .cs-toolrail'),
    ).toBeTruthy()
    expect(chrome?.querySelector('.cs-zoom-controls')).toBeTruthy()
    expect(
      view.container.querySelector('.cs-workbench > .cs-toolrail'),
    ).toBeNull()
    await vi.waitFor(() => {
      expect(chrome?.querySelector('.cs-filmstrip')).toBeTruthy()
    })
  })

  it('uses the quick-mode tool contract and hides full editor chrome', () => {
    const view = render(EditorShell, {
      props: { quickMode: true, fixture: 'ready' },
      global: { plugins: [createEditorShellPinia()] },
    })

    expect(view.container.querySelector('.cs-editor-shell')).toHaveClass(
      'is-quick-mode',
    )

    const rail = screen.getByRole('complementary', { name: 'Tools' })
    const labels = within(rail)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'))
    expect(labels).toEqual([
      'Select',
      'Arrow',
      'Shape',
      'Pencil',
      'Marker',
      'Text',
      'Numbered marker',
      'Callout',
      'Image',
      'Eyedropper',
      'Hide data',
      'Spotlight',
      'Ruler',
      'Loupe',
    ])
    expect(
      screen.queryByRole('button', { name: 'Crop' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Layers' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Redo' })).toBeInTheDocument()
  })

  it('keeps all editor chrome hidden while quick mode is selecting', () => {
    const view = render(EditorShell, {
      props: {
        quickMode: true,
        quickSelectionMode: true,
        fixture: 'ready',
      },
      global: { plugins: [createEditorShellPinia()] },
    })

    expect(view.container.querySelector('.cs-bottom-chrome')).toBeNull()
    expect(view.container.querySelector('.cs-quick-toolrail-group')).toBeNull()
    expect(view.container.querySelector('.cs-context-toolbar')).toBeNull()
    expect(view.container.querySelector('.cs-zoom-controls')).toBeNull()
  })
})
