import { fireEvent, render, screen, within } from '@testing-library/vue'
import { describe, expect, it, vi } from 'vitest'
import { markRaw } from 'vue'

import App from '../../../apps/desktop/src/App.vue'
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
  type TextureFillBridge,
} from '@cute-screen/editor-vue'
import {
  createContentImageLayer,
  createTextLayer,
  type EditorDocumentV1,
} from '@cute-screen/editor-renderer'

function renderApp() {
  return render(App, { global: { plugins: [createEditorShellPinia()] } })
}

async function chooseNaiveOption(
  name: string,
  optionName: string,
): Promise<HTMLElement> {
  const control = await screen.findByRole('combobox', { name })
  await fireEvent.click(control)
  await fireEvent.click(await screen.findByRole('option', { name: optionName }))
  return control
}

describe('M02 editor shell', () => {
  it('shows a non-preset Fit percentage in the zoom preset control', async () => {
    render(ZoomControls, {
      props: {
        zoom: 22,
        t: (key) => key,
      },
    })

    const zoom = await screen.findByRole('combobox', { name: 'zoom' })
    expect(zoom).toHaveTextContent('22%')
    await fireEvent.click(zoom)
    expect(
      await screen.findByRole('option', { name: '22%' }),
    ).toBeInTheDocument()
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

  it('cuts a selected Text layer only after the native plain-text write succeeds', async () => {
    const text = createTextLayer({
      id: '019c1f62-058e-7000-8000-000000000001',
      text: 'Copy me',
      origin: { x: 10, y: 10 },
      font: {
        source: 'bundled',
        family: 'Roboto',
        weight: 400,
        style: 'normal',
      },
    })
    if (!text) throw new Error('test Text layer should exist')
    const document: EditorDocumentV1 = {
      schemaVersion: 5,
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

    await fireEvent.click(screen.getByRole('button', { name: 'Show layers' }))
    const selectText = view.container.querySelector(
      '.cs-layer-select',
    ) as HTMLButtonElement
    await fireEvent.click(selectText)
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
      schemaVersion: 5,
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

    await fireEvent.click(screen.getByRole('button', { name: 'Show layers' }))
    await fireEvent.click(
      view.container.querySelector('.cs-layer-select') as HTMLButtonElement,
    )
    await fireEvent.click(screen.getByRole('button', { name: 'Select' }))
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
})
