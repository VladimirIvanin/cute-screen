import {
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/vue'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { markRaw } from 'vue'
import {
  createEditorShellPinia,
  DocumentSessionController,
} from '@cute-screen/editor-vue'
import ContextToolbar from '../../../packages/editor-vue/src/shell/components/ContextToolbar.vue'
import EditorShell from '../../../packages/editor-vue/src/shell/components/EditorShell.vue'
import type { ContextToolbarSchema } from '../../../packages/editor-vue/src/shell/types'
import {
  canvasContext,
  documentFixture,
  precisionLayerFixture,
  prepareScene,
} from './m08-precision-test-kit'
import { selectLayerFromPanel } from './layer-selection'
beforeEach(() => {
  window.localStorage.clear()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext())
})
afterEach(() => {
  vi.restoreAllMocks()
})
describe('compact tool settings', () => {
  it('copies a read-only ruler measurement and reports clipboard failure without commands', async () => {
    const layer = precisionLayerFixture('ruler')
    const writeClipboardText = vi.fn().mockResolvedValue(undefined)
    const session = new DocumentSessionController({
      document: { ...documentFixture(), layers: [layer] }, revision: 1,
      bridge: { saveDocument: async () => 2, exportRecoveryBundle: async () => ({ kind: 'saved' }) },
      correlationId: () => 'ruler-copy', debounceMs: 60000,
    })
    const view = render(EditorShell, {
      props: { documentSession: markRaw(session), readOnlyDocument: true, clipboardBridge: {
        writeClipboardText, readClipboardSnapshot: async () => ({}),
        stageImage: vi.fn(), readImageBytes: vi.fn(),
      } }, global: { plugins: [createEditorShellPinia()] },
    })
    await selectLayerFromPanel(view)
    const before = session.snapshot.core.document
    const execute = vi.spyOn(session, 'execute')
    await fireEvent.click(await screen.findByRole('button', { name: 'Measurement and snapping' }))
    await fireEvent.click(await screen.findByRole('button', { name: 'Copy length' }))
    expect(writeClipboardText).toHaveBeenCalledWith('70 px', expect.any(String))
    expect(await screen.findByText('Copied: 70 px')).toBeInTheDocument()
    writeClipboardText.mockRejectedValueOnce(new Error('clipboard denied'))
    await fireEvent.click(screen.getByRole('button', { name: 'Copy angle' }))
    expect(await screen.findByText(/Could not copy measurement: clipboard denied/)).toBeInTheDocument()
    expect(execute).not.toHaveBeenCalled()
    expect(session.snapshot.core.document).toBe(before)
    session.dispose()
    view.unmount()
  })
  const pencil: ContextToolbarSchema = {
    icon: 'pencil', title: 'Pencil', hint: '', toolSettings: {
      kind: 'pencil',
    }, controls: [
      {
        kind: 'color', id: 'color', label: 'Colour', value: '#E5484D',
      },
      {
        kind: 'range', id: 'width', label: 'Width', value: 3, min: 1, max: 48, step: 1,
      },
      {
        kind: 'range', id: 'layerOpacity', label: 'Opacity', value: 100, min: 0, max: 100, step: 1,
      },
      {
        kind: 'range', id: 'smoothing', label: 'Smoothing', value: 50, min: 0, max: 100, step: 1,
      },
      {
        kind: 'select', id: 'brush', label: 'Brush', value: 'pen', options: [],
      },
      {
        kind: 'select', id: 'blendMode', label: 'Blend', value: 'normal', options: [],
      },
    ],
  }
  it('has four entries, keeps brush settings open and cancels invalid numeric input with focus return', async () => {
    const view = render(ContextToolbar, {
      props: {
        schema: pencil, label: 'Pencil', pickerLocale: 'ru',
      },
    })
    expect(view.container.querySelectorAll('.cs-tool-settings-trigger, .cs-tool-formatting-toolbar .cs-simple-color-trigger')).toHaveLength(4)
    await fireEvent.click(screen.getByRole('button', {
      name: 'Кисть и толщина',
    }))
    const panel = await screen.findByRole('dialog', {
      name: 'Кисть и толщина',
    })
    await fireEvent.click(within(panel).getByRole('button', {
      name: 'Кисть',
    }))
    expect(view.emitted('change')).toEqual([['brush', 'brush']])
    await view.rerender({
      schema: {
        ...pencil, controls: pencil.controls.map((item) => item.id === 'brush' ? {
          ...item, value: 'brush',
        } : item),
      },
    })
    expect(screen.getByRole('dialog', {
      name: 'Кисть и толщина',
    })).toBeInTheDocument()
    const input = within(panel).getByRole('spinbutton', {
      name: 'Толщина',
    })
    await fireEvent.input(input, {
      target: {
        value: '99',
      },
    })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    await fireEvent.keyDown(input, {
      key: 'Escape',
    })
    expect(view.emitted('change')).toHaveLength(1)
    expect(screen.getByRole('button', {
      name: 'Кисть и толщина',
    })).toHaveFocus()
  })
  it('shows mixed smoothing and commits one numeric value', async () => {
    const view = render(ContextToolbar, {
      props: {
        schema: {
          ...pencil, controls: pencil.controls.map((item) => ({
            ...item, mixed: true,
          })),
        }, label: 'Selection',
      },
    })
    await fireEvent.click(screen.getByRole('button', {
      name: 'Smoothing',
    }))
    const input = await screen.findByRole('spinbutton', {
      name: 'Smoothing',
    })
    expect(input).toHaveAttribute('placeholder', '—')
    await fireEvent.input(input, {
      target: {
        value: '75',
      },
    })
    expect(view.emitted('change')).toBeUndefined()
    await fireEvent.keyDown(input, {
      key: 'Enter',
    })
    expect(view.emitted('change')).toEqual([['smoothing', '75']])
  })
  it.each(['spotlight', 'ruler'] as const)('blocks locked %s settings, then commits exactly once after unlock', async (kind) => {
    const layer = precisionLayerFixture(kind, true)
    const session = new DocumentSessionController({
      document: {
        ...documentFixture(), layers: [layer],
      }, revision: 1, bridge: {
        saveDocument: async () => 2, exportRecoveryBundle: async () => ({
          kind: 'saved',
        }),
      }, correlationId: () => 'compact-locked', debounceMs: 60000,
    })
    const view = render(EditorShell, {
      props: {
        documentSession: markRaw(session),
      }, global: {
        plugins: [createEditorShellPinia()],
      },
    })
    await selectLayerFromPanel(view)
    const toolbar = view.container.querySelector('.cs-selection-floating-toolbar') as HTMLElement
    const label = kind === 'spotlight' ? 'Aperture shape' : 'Thickness'
    expect(within(toolbar).getByRole('button', {
      name: label,
    })).toBeDisabled()
    const execute = vi.spyOn(session, 'execute')
    await fireEvent.click(within(toolbar).getByRole('button', {
      name: label,
    }))
    expect(execute).not.toHaveBeenCalled()
    await fireEvent.click(screen.getByRole('button', {
      name: 'Unlock layer',
    }))
    execute.mockClear()
    await fireEvent.click(within(toolbar).getByRole('button', {
      name: label,
    }))
    if (kind === 'spotlight')
      await fireEvent.click(await screen.findByRole('button', {
        name: 'Diamond',
      }))
    else {
      const input = await screen.findByRole('spinbutton', {
        name: 'Thickness',
      })
      await fireEvent.input(input, {
        target: {
          value: '4',
        },
      })
      await fireEvent.keyDown(input, {
        key: 'Enter',
      })
    }
    expect(execute).toHaveBeenCalledTimes(1)
    session.undo()
    expect(session.snapshot.core.document.layers[0]).toMatchObject({
      ...layer, locked: false,
    })
    session.dispose()
    view.unmount()
  })
  it('adds, independently edits and removes apertures through the mounted shell', async () => {
    const session = new DocumentSessionController({
      document: documentFixture(), revision: 1, bridge: {
        saveDocument: async () => 2, exportRecoveryBundle: async () => ({
          kind: 'saved',
        }),
      }, correlationId: () => 'aperture-flow', debounceMs: 60000,
    })
    const view = render(EditorShell, {
      props: {
        documentSession: markRaw(session),
      }, global: {
        plugins: [createEditorShellPinia()],
      },
    })
    const scene = screen.getByLabelText('Scene canvas') as HTMLCanvasElement
    prepareScene(scene)
    await fireEvent.click(screen.getByRole('button', {
      name: 'Spotlight',
    }))
    await fireEvent.pointerDown(scene, {
      pointerId: 1, clientX: 10, clientY: 10,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 1, clientX: 40, clientY: 35,
    })
    await fireEvent.pointerUp(scene, {
      pointerId: 1, clientX: 40, clientY: 35,
    })
    await fireEvent.click(await screen.findByRole('button', {
      name: 'Apertures',
    }))
    await fireEvent.click(await screen.findByRole('button', {
      name: 'Add aperture',
    }))
    await fireEvent.pointerDown(scene, {
      pointerId: 2, clientX: 65, clientY: 10,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 2, clientX: 95, clientY: 35,
    })
    await fireEvent.pointerUp(scene, {
      pointerId: 2, clientX: 95, clientY: 35,
    })
    const layer = session.snapshot.core.document.layers[0]
    if (layer?.kind !== 'spotlight')
      throw new Error('spotlight expected')
    expect(layer.payload.apertures).toHaveLength(2)
    await fireEvent.click(screen.getByRole('button', {
      name: 'Aperture shape',
    }))
    await fireEvent.click(await screen.findByRole('button', {
      name: 'Ellipse',
    }))
    const after = session.snapshot.core.document.layers[0]
    expect(after?.kind === 'spotlight' && after.payload.apertures.map((item) => item.shape)).toEqual(['rectangle', 'ellipse'])
    await fireEvent.keyDown(scene, {
      key: 'Delete',
    })
    expect(session.snapshot.core.document.layers[0]?.kind === 'spotlight' && session.snapshot.core.document.layers[0].payload.apertures).toHaveLength(1)
    session.undo()
    expect(session.snapshot.core.document.layers[0]?.kind === 'spotlight' && session.snapshot.core.document.layers[0].payload.apertures).toHaveLength(2)
    session.dispose()
    view.unmount()
  })
})
