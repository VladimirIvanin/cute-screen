import {
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/vue'
import { markRaw } from 'vue'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  createEditorShellPinia,
  DocumentSessionController,
  useEditorShellStore,
} from '@cute-screen/editor-vue'
import EditorShell from '../../../packages/editor-vue/src/shell/components/EditorShell.vue'
import { selectLayerFromPanel } from './layer-selection'
import {
  documentFixture,
  precisionLayerFixture,
  canvasContext,
  contextFixture,
  prepareScene,
} from './m08-precision-test-kit'

beforeEach(() => {
  window.localStorage.clear()
  contextFixture.current = canvasContext()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(contextFixture.current)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('M08 shell lifecycle and contextual settings', () => {
  it('opens creation defaults on configure and selects completed precision objects', async () => {
    const session = new DocumentSessionController({
      document: documentFixture(),
      revision: 1,
      bridge: {
        saveDocument: async () => 2,
        exportRecoveryBundle: async () => ({ kind: 'saved' }),
      },
      correlationId: () => 'm08-vue',
      debounceMs: 60_000,
    })
    const view = render(EditorShell, {
      props: { documentSession: markRaw(session) },
      global: { plugins: [createEditorShellPinia()] },
    })

    await fireEvent.contextMenu(screen.getByRole('button', { name: 'Hide data' }))
    const toolbar = view.container.querySelector('.cs-context-toolbar') as HTMLElement
    expect(within(toolbar).getByRole('group', { name: 'Effect' })).toBeInTheDocument()
    expect(within(toolbar).getByRole('button', { name: 'Region shape' })).toBeInTheDocument()
    for (const option of ['Pixelate', 'Blur', 'Solid fill']) {
      expect(within(toolbar).getByRole('button', { name: option })).toBeInTheDocument()
    }
    await fireEvent.pointerDown(document.body)
    await fireEvent.click(screen.getByRole('button', { name: 'Show layers' }))
    expect(view.container.querySelector('.cs-layers-panel')).not.toHaveTextContent('Effect')

    await fireEvent.click(screen.getByRole('button', { name: 'Loupe' }))
    const scene = screen.getByLabelText('Scene canvas') as HTMLCanvasElement
    prepareScene(scene)
    await fireEvent.pointerDown(scene, {
      pointerId: 5,
      clientX: 20,
      clientY: 20,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 5,
      clientX: 80,
      clientY: 50,
    })
    await fireEvent.pointerUp(scene, { pointerId: 5, clientX: 80, clientY: 50 })

    expect(session.snapshot.core.document.layers).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true')
    expect(view.container.querySelector('.cs-layer-row')).toHaveAttribute('aria-selected', 'true')

    session.dispose()
    view.unmount()
  })

  it.each(([
    ['censor', 'Hide data', 'Blur', 'Blur'],
    ['spotlight', 'Spotlight', 'Shape', 'Diamond'],
    ['ruler', 'Ruler', 'Thickness', ''],
    ['loupe', 'Loupe', 'Shape', 'Rectangle'],
  ] as const).filter(([kind]) => kind !== 'spotlight' && kind !== 'ruler'))(
    'disables every %s setting for a locked selection without history or default leakage, then updates after unlock',
    async (kind, toolLabel, controlLabel, optionLabel) => {
      const layer = precisionLayerFixture(kind)
      const session = new DocumentSessionController({
        document: { ...documentFixture(), layers: [layer] },
        revision: 1,
        bridge: {
          saveDocument: async () => 2,
          exportRecoveryBundle: async () => ({ kind: 'saved' }),
        },
        correlationId: () => `m08-locked-${kind}`,
        debounceMs: 60_000,
      })
      const pinia = createEditorShellPinia()
      const execute = vi.spyOn(session, 'execute')
      const view = render(EditorShell, {
        props: { documentSession: markRaw(session) },
        global: { plugins: [pinia] },
      })
      await fireEvent.click(screen.getByRole('button', { name: toolLabel }))
      await selectLayerFromPanel(view, { activateSelect: false })
      const layerButton = view.container.querySelector('.cs-layer-select') as HTMLButtonElement
      expect(layerButton.closest('.cs-layer-row')).toHaveAttribute('aria-selected', 'true')
      await fireEvent.click(screen.getByRole('button', { name: 'Lock layer' }))
      await vi.waitFor(() => expect(session.snapshot.core.document.layers[0]?.locked).toBe(true))
      expect(useEditorShellStore(pinia).selectedLayerIds).toEqual([layer.id])
      execute.mockClear()

      const role = kind === 'loupe' || kind === 'censor' ? 'button' : kind === 'ruler' ? 'slider' : 'combobox'
      await within(view.container.querySelector('.cs-selection-floating-toolbar') as HTMLElement).findByRole(role, {
        name: controlLabel,
      })
      let toolbar = view.container.querySelector('.cs-selection-floating-toolbar .cs-context-toolbar') as HTMLElement
      const toolbarButtons = within(toolbar).queryAllByRole('button')
      const toolbarComboboxes = within(toolbar).queryAllByRole('combobox')
      const toolbarSliders = within(toolbar).queryAllByRole('slider')
      expect(toolbarButtons.length + toolbarComboboxes.length + toolbarSliders.length).toBeGreaterThan(0)
      for (const button of toolbarButtons) {
        if (
          !(button as HTMLButtonElement).matches(':disabled') &&
          !['More', 'Ещё'].includes(button.textContent?.trim() ?? '')
        ) {
          throw new Error(
            `enabled precision toolbar button: ${button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '<unlabelled>'}`,
          )
        }
      }
      for (const combobox of toolbarComboboxes) {
        expect(combobox).toHaveAttribute('aria-disabled', 'true')
      }
      for (const slider of toolbarSliders) {
        expect(slider).toHaveAttribute('aria-disabled', 'true')
      }

      const probe = within(toolbar).getByRole(role, {
        name: controlLabel,
      }) as HTMLElement
      const before = structuredClone(session.snapshot.core.document)
      probe.focus()
      await fireEvent.keyDown(probe, { key: 'ArrowRight' })
      await fireEvent.keyDown(probe, { key: 'Enter' })
      await fireEvent.click(probe)
      if (kind === 'loupe' || kind === 'censor') expect(probe).toBeDisabled()
      else expect(probe).toHaveAttribute('tabindex', '-1')
      expect(execute).not.toHaveBeenCalled()
      expect(session.snapshot.core.document).toEqual(before)
      expect(window.localStorage.getItem('cute-screen.drawing-tool-preferences.v1')).toBeNull()

      useEditorShellStore(pinia).clearLayerSelection()
      await fireEvent.contextMenu(screen.getByRole('button', { name: toolLabel }))
      toolbar = view.container.querySelector('.cs-tool-configure-popover-host .cs-context-toolbar') as HTMLElement
      const defaultControl = await within(toolbar).findByRole(role, {
        name: controlLabel,
      })
      if (kind === 'ruler') {
        expect(defaultControl).toHaveAttribute('aria-valuenow', '2')
      } else if (kind === 'loupe') {
        expect(defaultControl).toHaveAttribute('title', 'Shape: Circle')
      } else if (kind === 'censor') {
        expect(defaultControl).toHaveAttribute('aria-pressed', 'false')
        expect(within(toolbar).getByRole('button', { name: 'Pixelate' })).toHaveAttribute('aria-pressed', 'true')
      } else {
        expect(defaultControl).toHaveTextContent(
          kind === 'spotlight' ? 'Rectangle' : 'Circle',
        )
      }

      layerButton.focus()
      await fireEvent.keyDown(layerButton, { key: 'Enter' })
      await fireEvent.click(screen.getByRole('button', { name: 'Unlock layer' }))
      execute.mockClear()
      toolbar = view.container.querySelector('.cs-selection-floating-toolbar .cs-context-toolbar') as HTMLElement
      const enabledControl = await within(toolbar).findByRole(role, {
        name: controlLabel,
      })
      if (kind === 'ruler') {
        enabledControl.focus()
        await fireEvent.keyDown(enabledControl, { key: 'ArrowRight' })
        await fireEvent.keyUp(enabledControl, { key: 'ArrowRight' })
      } else {
        await fireEvent.click(enabledControl)
        if (kind !== 'censor') await fireEvent.click(await screen.findByRole(kind === 'loupe' ? 'button' : 'option', { name: optionLabel }))
      }
      expect(execute).toHaveBeenCalledTimes(1)
      expect(session.snapshot.core.document.layers[0]).toMatchObject(
        kind === 'censor'
          ? { locked: false, payload: { effect: { mode: 'blur' } } }
          : kind === 'spotlight'
            ? { locked: false, payload: { shape: 'diamond' } }
            : kind === 'ruler'
              ? { locked: false, payload: { thickness: 3 } }
              : { locked: false, payload: { lens: { shape: 'rectangle' } } },
      )

      session.dispose()
      view.unmount()
    },
  )

  it('changes precision defaults without selection and commits only the created layer', async () => {
    const session = new DocumentSessionController({
      document: documentFixture(),
      revision: 1,
      bridge: {
        saveDocument: async () => 2,
        exportRecoveryBundle: async () => ({ kind: 'saved' }),
      },
      correlationId: () => 'm08-censor-default',
      debounceMs: 60_000,
    })
    const view = render(EditorShell, {
      props: { documentSession: markRaw(session) },
      global: { plugins: [createEditorShellPinia()] },
    })
    const execute = vi.spyOn(session, 'execute')
    await fireEvent.contextMenu(screen.getByRole('button', { name: 'Hide data' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Blur' }))
    expect(execute).not.toHaveBeenCalled()

    const scene = screen.getByLabelText('Scene canvas') as HTMLCanvasElement
    prepareScene(scene)
    await fireEvent.pointerDown(scene, {
      pointerId: 41,
      clientX: 12,
      clientY: 14,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 41,
      clientX: 72,
      clientY: 54,
    })
    await fireEvent.pointerUp(scene, {
      pointerId: 41,
      clientX: 72,
      clientY: 54,
    })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(session.snapshot.core.document.layers[0]).toMatchObject({
      kind: 'censor',
      payload: { effect: { mode: 'blur', strength: 12 } },
    })

    session.dispose()
    view.unmount()
  })

  it('keeps a selected precision layer read-only when the document is read-only', async () => {
    const layer = precisionLayerFixture('ruler')
    const session = new DocumentSessionController({
      document: { ...documentFixture(), layers: [layer] },
      revision: 1,
      bridge: {
        saveDocument: async () => 2,
        exportRecoveryBundle: async () => ({ kind: 'saved' }),
      },
      correlationId: () => 'm08-read-only-ruler',
      debounceMs: 60_000,
    })
    const pinia = createEditorShellPinia()
    const view = render(EditorShell, {
      props: { documentSession: markRaw(session), readOnlyDocument: true },
      global: { plugins: [pinia] },
    })
    const store = useEditorShellStore(pinia)
    store.selectTool('select')
    store.selectLayer(layer.id)
    await vi.waitFor(() => expect(view.container.querySelector('.cs-selection-floating-toolbar')).not.toBeNull())
    const execute = vi.spyOn(session, 'execute')
    const toolbar = view.container.querySelector('.cs-context-toolbar') as HTMLElement
    const thickness = await within(toolbar).findByRole('button', { name: 'Thickness' })
    expect(thickness).toBeDisabled()
    thickness.focus()
    await fireEvent.keyDown(thickness, { key: 'ArrowRight' })
    await fireEvent.click(thickness)
    expect(execute).not.toHaveBeenCalled()
    expect(session.snapshot.core.document.layers[0]).toEqual(layer)

    session.dispose()
    view.unmount()
  })
})
