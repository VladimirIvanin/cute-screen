import { fireEvent, render, screen } from '@testing-library/vue'
import { markRaw } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createEditorShellPinia,
  DocumentSessionController,
} from '@cute-screen/editor-vue'
import EditorShell from '../../../packages/editor-vue/src/shell/components/EditorShell.vue'
import {
  documentFixture,
  canvasContext,
  contextFixture,
  prepareScene,
} from './m08-precision-test-kit'

beforeEach(() => {
  window.localStorage.clear()
  contextFixture.current = canvasContext()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    contextFixture.current,
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('M08 shell lifecycle and contextual settings', () => {
  it('keeps crop and precision tools disabled until a document canvas is ready', () => {
    render(EditorShell, {
      props: { fixture: 'loading' },
      global: { plugins: [createEditorShellPinia()] },
    })

    for (const tool of ['Crop', 'Hide data', 'Spotlight', 'Ruler', 'Loupe']) {
      expect(screen.getByRole('button', { name: tool })).toBeDisabled()
      expect(screen.getByRole('button', { name: tool })).toHaveAttribute(
        'title',
        'Open an image and wait until the canvas is ready.',
      )
    }
  })

  it('resets/reopens a canvas crop without a base layer and keeps undo/redo deterministic', async () => {
    const session = new DocumentSessionController({
      document: documentFixture({ x: 10, y: 8, width: 80, height: 50 }),
      revision: 1,
      bridge: {
        saveDocument: async () => 2,
        exportRecoveryBundle: async () => ({ kind: 'saved' }),
      },
      correlationId: () => 'm08-crop',
      debounceMs: 60_000,
    })
    const view = render(EditorShell, {
      props: { documentSession: markRaw(session) },
      global: { plugins: [createEditorShellPinia()] },
    })

    const crop = screen.getByRole('button', { name: 'Crop' })
    expect(crop).toBeEnabled()
    await fireEvent.click(crop)
    const preset = screen.getByRole('combobox', { name: 'Preset' })
    expect(preset).toBeInTheDocument()
    await fireEvent.click(preset)
    for (const option of ['Free', '1:1', '4:3', '16:9', 'Original']) {
      expect(
        await screen.findByRole('option', { name: option }),
      ).toBeInTheDocument()
    }
    await fireEvent.pointerDown(document.body)
    await fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(session.snapshot.core.document.crop).toBeNull()
    expect(crop).toHaveAttribute('aria-pressed', 'true')

    session.undo()
    expect(session.snapshot.core.document.crop).toEqual({
      x: 10,
      y: 8,
      width: 80,
      height: 50,
    })
    session.redo()
    expect(session.snapshot.core.document.crop).toBeNull()

    session.dispose()
    view.unmount()
  })

  it('rejects a semi-transparent scene pixel before clipboard, swatch or recent-colour mutation', async () => {
    const session = new DocumentSessionController({
      document: documentFixture(),
      revision: 1,
      bridge: {
        saveDocument: async () => 2,
        exportRecoveryBundle: async () => ({ kind: 'saved' }),
      },
      correlationId: () => 'm08-eyedropper-alpha',
      debounceMs: 60_000,
    })
    const writeClipboardText = vi.fn()
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
    await fireEvent.click(screen.getByRole('button', { name: 'Eyedropper' }))
    const scene = screen.getByLabelText('Scene canvas') as HTMLCanvasElement
    prepareScene(scene)
    vi.spyOn(scene, 'getContext').mockReturnValue({
      getImageData: () => ({
        data: new Uint8ClampedArray([171, 205, 239, 128]),
      }),
    } as unknown as CanvasRenderingContext2D)
    await fireEvent.pointerDown(scene, {
      pointerId: 42,
      clientX: 30,
      clientY: 20,
    })

    await vi.waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'There is no opaque colour at this point',
      ),
    )
    expect(writeClipboardText).not.toHaveBeenCalled()
    expect(
      view.container.querySelector('.cs-eyedropper-swatch'),
    ).not.toBeInTheDocument()
    expect(
      window.localStorage.getItem('cute-screen.drawing-tool-preferences.v1'),
    ).toBeNull()
    expect(session.snapshot.core.canUndo).toBe(false)

    session.dispose()
    view.unmount()
  })

  it('keeps an uppercase sampled colour and accessible swatch when clipboard copy fails', async () => {
    const session = new DocumentSessionController({
      document: documentFixture(),
      revision: 1,
      bridge: {
        saveDocument: async () => 2,
        exportRecoveryBundle: async () => ({ kind: 'saved' }),
      },
      correlationId: () => 'm08-eyedropper',
      debounceMs: 60_000,
    })
    const writeClipboardText = vi
      .fn()
      .mockRejectedValue(new Error('clipboard busy'))
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
    await fireEvent.click(screen.getByRole('button', { name: 'Eyedropper' }))
    const scene = screen.getByLabelText('Scene canvas') as HTMLCanvasElement
    prepareScene(scene)
    vi.spyOn(scene, 'getContext').mockReturnValue({
      getImageData: () => ({
        data: new Uint8ClampedArray([171, 205, 239, 255]),
      }),
    } as unknown as CanvasRenderingContext2D)
    await fireEvent.pointerDown(scene, {
      pointerId: 12,
      clientX: 30,
      clientY: 20,
    })

    await vi.waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Colour selected: #ABCDEF. HEX could not be copied.',
      ),
    )
    expect(screen.getByLabelText('Colour swatch #ABCDEF')).toHaveStyle({
      backgroundColor: '#ABCDEF',
    })
    expect(writeClipboardText).toHaveBeenCalledWith(
      '#ABCDEF',
      expect.any(String),
    )
    expect(
      window.localStorage.getItem('cute-screen.drawing-tool-preferences.v1'),
    ).toContain('0.670588')
    expect(session.snapshot.core.canUndo).toBe(false)

    session.dispose()
    view.unmount()
  })
})
