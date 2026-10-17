import {
  fireEvent,
  render,
  screen,
  waitFor,
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
import { createCensorLayer } from '@cute-screen/editor-renderer'
import { resolveCensorEffect } from '../../../packages/editor-vue/src/shell/tools/effects/precision-censor'
import {
  createEditorShellPinia,
  DocumentSessionController,
  useEditorShellStore,
} from '@cute-screen/editor-vue'
import EditorShell from '../../../packages/editor-vue/src/shell/components/EditorShell.vue'
import ContextToolbar from '../../../packages/editor-vue/src/shell/components/ContextToolbar.vue'
import type { ContextToolbarSchema } from '../../../packages/editor-vue/src/shell/types'
import { selectLayerFromPanel } from './layer-selection'
import { TOOL_SETTINGS_STORAGE_KEY } from '../../../packages/editor-vue/src/shell/workspace/tool-settings-memory'
import {
  canvasContext,
  documentFixture,
  precisionLayerFixture,
  precisionDefaults,
} from './m08-precision-test-kit'

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext())
})
afterEach(() => vi.restoreAllMocks())

function schema(mixed = false): ContextToolbarSchema {
  return {
    icon: 'privacy', title: 'Hide data', hint: '', controls: [
      { kind: 'select', id: 'censorRegion', label: 'Region shape', value: 'rectangle', options: [], mixed },
      { kind: 'select', id: 'censorMode', label: 'Effect', value: 'pixelate', options: [], mixed },
      { kind: 'range', id: 'censorBlockSize', label: 'Pixel size', value: 17, min: 2, max: 128, step: 1, mixed },
    ],
  }
}
function mountSelection(
  layers = [precisionLayerFixture('censor')],
  readOnlyDocument = false,
) {
  const session = new DocumentSessionController({
    document: { ...documentFixture(), layers }, revision: 1,
    bridge: { saveDocument: async () => 2, exportRecoveryBundle: async () => ({ kind: 'saved' }) },
    correlationId: () => 'censor-toolbar', debounceMs: 60_000,
  })
  const pinia = createEditorShellPinia()
  const view = render(EditorShell, {
    props: { documentSession: markRaw(session), readOnlyDocument }, global: { plugins: [pinia] },
  })
  return { view, session, store: useEditorShellStore(pinia) }
}

describe('censor formatting toolbar', () => {
  it('closes the shape menu when its control disappears without restoring detached focus', async () => {
    const view = render(ContextToolbar, { props: { schema: schema(), label: 'Hide data' } })
    const trigger = screen.getByRole('button', { name: 'Region shape' })
    const focus = vi.spyOn(trigger, 'focus')
    await fireEvent.click(trigger)
    expect(await screen.findByRole('dialog', { name: 'Region shape' })).toBeInTheDocument()
    await view.rerender({ schema: { ...schema(), controls: schema().controls.filter((item) => item.id !== 'censorRegion') } })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Region shape' })).toBeNull())
    expect(screen.queryByRole('button', { name: 'Region shape' })).toBeNull()
    expect(focus).not.toHaveBeenCalled()
  })

  it.each(['rectangle', 'freeform'] as const)('keeps %s geometry while editing effects without a shape selector', async (kind) => {
    const layer = createCensorLayer({
      id: '019c1f62-058e-7000-8000-000000000831',
      region: kind === 'rectangle'
        ? { kind, bounds: { x: 10, y: 10, width: 50, height: 30 } }
        : { kind, points: [{ x: 10, y: 10 }, { x: 60, y: 15 }, { x: 30, y: 40 }] },
    })
    const { view, session } = mountSelection([layer])
    await selectLayerFromPanel(view)
    expect(screen.queryByRole('button', { name: 'Region shape' })).toBeNull()
    expect(view.container.querySelector('.cs-censor-region')).toBeNull()
    const preferences = localStorage.getItem(TOOL_SETTINGS_STORAGE_KEY)
    await fireEvent.click(screen.getByRole('button', { name: 'Blur' }))
    expect(session.snapshot.core.document.layers[0]).toMatchObject({ payload: { region: layer.payload.region, effect: { mode: 'blur' } } })
    expect(screen.getByRole('button', { name: 'Blur strength' })).toBeEnabled()
    session.undo()
    expect(session.snapshot.core.document.layers).toEqual([layer])
    session.redo()
    expect(session.snapshot.core.document.layers[0]).toMatchObject({ payload: { region: layer.payload.region, effect: { mode: 'blur' } } })
    expect(JSON.parse(localStorage.getItem(TOOL_SETTINGS_STORAGE_KEY)!).settings.precision.censor.region)
      .toBe(JSON.parse(preferences!).settings.precision.censor.region)
    view.unmount()
    session.dispose()
  })

  it.each(['rectangle', 'freeform'] as const)('ignores direct %s shape changes for an existing censor', (next) => {
    const selected = createCensorLayer({
      id: '019c1f62-058e-7000-8000-000000000831',
      region: { kind: 'freeform', points: [{ x: 10, y: 10 }, { x: 60, y: 15 }, { x: 30, y: 40 }] },
    })
    const state = {
      selected,
      defaults: structuredClone(precisionDefaults),
      document: { ...documentFixture(), layers: [selected] },
    }
    const before = structuredClone(state)
    expect(resolveCensorEffect('censorRegion', next, state)).toEqual({ kind: 'handled' })
    expect(state).toEqual(before)
    expect(resolveCensorEffect('censorRegion', next, { ...state, selected: undefined })).toEqual({
      kind: 'defaults', value: { ...state.defaults, censor: { ...state.defaults.censor, region: next } },
    })
  })

  it.each(['locked', 'read-only'] as const)('keeps %s selection disabled without a shape selector or changes', async (state) => {
    const { view, session } = mountSelection(
      [precisionLayerFixture('censor', state === 'locked')],
      state === 'read-only',
    )
    await selectLayerFromPanel(view)
    const before = structuredClone(session.snapshot.core.document)
    const execute = vi.spyOn(session, 'execute')
    const preferences = localStorage.getItem(TOOL_SETTINGS_STORAGE_KEY)
    expect(screen.queryByRole('button', { name: 'Region shape' })).toBeNull()
    const effects = within(screen.getByRole('group', { name: 'Effect' }))
    for (const button of effects.getAllByRole('button')) expect(button).toBeDisabled()
    await fireEvent.click(effects.getByRole('button', { name: 'Blur' }))
    const parameter = screen.getByRole('button', { name: 'Pixel size' })
    expect(parameter).toBeDisabled()
    await fireEvent.click(parameter)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(execute).not.toHaveBeenCalled()
    expect(session.snapshot.core.document).toEqual(before)
    expect(localStorage.getItem(TOOL_SETTINGS_STORAGE_KEY)).toBe(preferences)
    view.unmount()
    session.dispose()
  })

  it('shows three effect buttons without selects or an expanded slider', async () => {
    const view = render(ContextToolbar, { props: { schema: schema(), label: 'Hide data' } })
    expect(screen.getByRole('button', { name: 'Pixelate' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Blur' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Solid fill' })).toBeInTheDocument()
    expect(screen.queryByRole('slider')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(view.container.querySelector('.cs-context-icon')).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: 'Blur' }))
    expect(view.emitted('change')).toEqual([['censorMode', 'blur']])
  })

  it('opens labelled shape choices and restores focus after selecting or cancelling', async () => {
    const view = render(ContextToolbar, { props: { schema: schema(), label: 'Hide data' } })
    const trigger = screen.getByRole('button', { name: 'Region shape' })
    await fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Region shape' })
    expect(within(dialog).getByRole('button', { name: 'Rectangle' })).toHaveFocus()
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Freeform outline' }))
    expect(view.emitted('change')).toEqual([['censorRegion', 'freeform']])
    await waitFor(() => expect(trigger).toHaveFocus())
    await fireEvent.click(trigger)
    await fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })

  it('keeps presets open, distinguishes custom values and opens only one menu', async () => {
    const view = render(ContextToolbar, { props: { schema: schema(), label: 'Hide data' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Pixel size' }))
    const presets = within(await screen.findByRole('group', { name: 'Pixel size presets' }))
    expect(screen.getByRole('spinbutton', { name: 'Pixel size' })).toHaveFocus()
    expect(presets.getAllByRole('button').map((item) => item.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'false'])
    const preset = presets.getByRole('button', { name: '24 px' })
    preset.focus()
    await fireEvent.keyDown(preset, { key: 'Enter' })
    expect(view.emitted('change')).toEqual([['censorBlockSize', '24']])
    expect(screen.getByRole('button', { name: 'Pixel size' })).toHaveAttribute('aria-expanded', 'true')
    await fireEvent.click(screen.getByRole('button', { name: 'Region shape' }))
    expect(screen.getByRole('button', { name: 'Pixel size' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: 'Region shape' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('shows no parameter or selected effect for a mixed effect selection', () => {
    render(ContextToolbar, { props: { schema: schema(true), label: 'Hide data' } })
    expect(within(screen.getByRole('group', { name: 'Effect' })).getAllByRole('button').every((item) => item.getAttribute('aria-pressed') === 'false')).toBe(true)
    expect(screen.queryByRole('button', { name: 'Pixel size' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Region shape' })).toHaveTextContent('—')
  })

  it('blocks teleported settings when read-only becomes active', async () => {
    const view = render(ContextToolbar, { props: { schema: schema(), label: 'Hide data' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Pixel size' }))
    await view.rerender({ schema: { ...schema(), disabled: true } })
    expect(screen.getByRole('button', { name: 'Pixel size' })).toHaveAttribute('aria-expanded', 'false')
    for (const button of within(view.container as HTMLElement).getAllByRole('button')) expect(button).toBeDisabled()
    await fireEvent.click(screen.getByRole('button', { name: 'Blur' }))
    expect(view.emitted('change')).toBeUndefined()
  })

  it('previews and cancels exact values, then commits one undoable update', async () => {
    const { view, session, store } = mountSelection()
    await selectLayerFromPanel(view)
    const execute = vi.spyOn(session, 'execute')
    const before = structuredClone(session.snapshot.core.document)
    const preferences = localStorage.getItem(TOOL_SETTINGS_STORAGE_KEY)
    const trigger = screen.getByRole('button', { name: 'Pixel size' })
    await fireEvent.click(trigger)
    const input = await screen.findByRole('spinbutton', { name: 'Pixel size' })
    input.focus()
    await fireEvent.update(input, '17')
    expect(session.snapshot.core.document).toEqual(before)
    expect(execute).not.toHaveBeenCalled()
    expect(localStorage.getItem(TOOL_SETTINGS_STORAGE_KEY)).toBe(preferences)
    await fireEvent.keyDown(input, { key: 'Escape' })
    expect(trigger).toHaveFocus()
    expect(store.selectedLayerIds).toEqual([before.layers[0]!.id])
    expect(session.snapshot.core.document).toEqual(before)
    await fireEvent.click(trigger)
    const exact = await screen.findByRole('spinbutton', { name: 'Pixel size' })
    exact.focus()
    await fireEvent.update(exact, '17')
    await fireEvent.keyDown(exact, { key: 'Enter' })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(session.snapshot.core.document.layers[0]).toMatchObject({ payload: { effect: { mode: 'pixelate', blockSize: 17 } } })
    session.undo()
    expect(session.snapshot.core.document).toEqual(before)
    session.redo()
    expect(session.snapshot.core.document.layers[0]).toMatchObject({ payload: { effect: { blockSize: 17 } } })
    view.unmount()
    session.dispose()
  })

  it('unifies mixed censor effects in one command and preserves geometry through undo', async () => {
    const first = precisionLayerFixture('censor')
    if (first.kind !== 'censor') throw new Error('Expected censor fixture')
    const second = {
      ...first, id: '019c1f62-058e-7000-8000-000000000899',
      payload: { ...first.payload, region: { kind: 'freeform' as const, points: [{ x: 0, y: 0 }, { x: 50, y: 5 }, { x: 20, y: 30 }] }, effect: { mode: 'blur' as const, strength: 24 } },
    }
    const { view, session } = mountSelection([first, second])
    await selectLayerFromPanel(view)
    const rows = view.container.querySelectorAll<HTMLElement>('.cs-layer-select')
    rows[1]!.focus()
    await fireEvent.keyDown(rows[1]!, { key: 'Enter', ctrlKey: true })
    expect(screen.queryByRole('button', { name: 'Region shape' })).toBeNull()
    const effects = within(screen.getByRole('group', { name: 'Effect' }))
    expect(effects.getAllByRole('button').every((item) => item.getAttribute('aria-pressed') === 'false')).toBe(true)
    expect(screen.queryByRole('button', { name: 'Pixel size' })).toBeNull()
    const execute = vi.spyOn(session, 'execute')
    await fireEvent.click(effects.getByRole('button', { name: 'Pixelate' }))
    expect(execute).toHaveBeenCalledTimes(1)
    for (const layer of session.snapshot.core.document.layers) {
      expect(layer).toMatchObject({ localBounds: first.localBounds, payload: { effect: { mode: 'pixelate' } } })
    }
    expect(screen.getByRole('button', { name: 'Pixel size' })).toBeInTheDocument()
    session.undo()
    expect(session.snapshot.core.document.layers).toEqual([first, second])
    view.unmount()
    session.dispose()
  })

  it('switches effects and edits solid colour through the shared picker', async () => {
    const { view, session } = mountSelection()
    await selectLayerFromPanel(view)
    await fireEvent.click(screen.getByRole('button', { name: 'Blur' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Blur strength' }))
    await fireEvent.click(within(await screen.findByRole('group', { name: 'Blur strength presets' })).getByRole('button', { name: '24' }))
    expect(session.snapshot.core.document.layers[0]).toMatchObject({ payload: { effect: { mode: 'blur', strength: 24 } } })
    await fireEvent.click(screen.getByRole('button', { name: 'Solid fill' }))
    expect(screen.queryByRole('button', { name: 'Blur strength' })).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: 'Colour' }))
    await fireEvent.click(await screen.findByRole('button', { name: /^Red$/ }))
    expect(session.snapshot.core.document.layers[0]).toMatchObject({ payload: { effect: { mode: 'solid', color: { alpha: 1 } } } })
    view.unmount()
    session.dispose()
  })
})
