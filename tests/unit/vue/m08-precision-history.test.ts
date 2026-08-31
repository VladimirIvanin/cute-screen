import { fireEvent, render, screen, within } from '@testing-library/vue'
import { markRaw, nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  hitTestDocument,
  rulerVisualBoundsAreConservative,
} from '@cute-screen/editor-core'
import {
  createEditorShellPinia,
  DocumentSessionController,
  useEditorShellStore,
} from '@cute-screen/editor-vue'
import type { RulerLayer } from '@cute-screen/editor-renderer'
import EditorShell from '../../../packages/editor-vue/src/shell/components/EditorShell.vue'
import { selectLayerFromPanel } from './layer-selection'
import {
  transformedPoint,
  documentFixture,
  precisionLayerFixture,
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
  it('updates a selected censor through one command and preserves deterministic undo/redo', async () => {
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => '019c1f62-058e-7000-8000-000000000823'),
    })
    const session = new DocumentSessionController({
      document: documentFixture(),
      revision: 1,
      bridge: {
        saveDocument: async () => 2,
        exportRecoveryBundle: async () => ({ kind: 'saved' }),
      },
      correlationId: () => 'm08-censor-update',
      debounceMs: 60_000,
    })
    const view = render(EditorShell, {
      props: { documentSession: markRaw(session) },
      global: { plugins: [createEditorShellPinia()] },
    })

    const censorTool = screen.getByRole('button', { name: 'Hide data' })
    await fireEvent.click(censorTool)
    const scene = screen.getByLabelText('Scene canvas') as HTMLCanvasElement
    prepareScene(scene)
    await fireEvent.pointerDown(scene, {
      pointerId: 22,
      clientX: 12,
      clientY: 14,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 22,
      clientX: 72,
      clientY: 54,
    })
    await fireEvent.pointerUp(scene, {
      pointerId: 22,
      clientX: 72,
      clientY: 54,
    })

    expect(censorTool).toHaveAttribute('aria-pressed', 'true')
    expect(session.snapshot.core.document.layers[0]).toMatchObject({
      kind: 'censor',
      payload: { effect: { mode: 'pixelate' } },
    })
    await selectLayerFromPanel(view, { activateSelect: false })
    const layerButton = view.container.querySelector(
      '.cs-layer-select',
    ) as HTMLButtonElement
    expect(layerButton.closest('.cs-layer-row')).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await fireEvent.click(screen.getByRole('combobox', { name: 'Effect' }))
    await fireEvent.click(await screen.findByRole('option', { name: 'Blur' }))

    expect(session.snapshot.core.document.layers[0]).toMatchObject({
      kind: 'censor',
      payload: { effect: { mode: 'blur', strength: 12 } },
    })
    expect(censorTool).toHaveAttribute('aria-pressed', 'true')
    session.undo()
    expect(session.snapshot.core.document.layers[0]).toMatchObject({
      kind: 'censor',
      payload: { effect: { mode: 'pixelate' } },
    })
    session.undo()
    expect(session.snapshot.core.document.layers).toHaveLength(0)
    session.redo()
    session.redo()
    expect(session.snapshot.core.document.layers[0]).toMatchObject({
      kind: 'censor',
      payload: { effect: { mode: 'blur', strength: 12 } },
    })

    session.dispose()
    view.unmount()
  })

  it('updates a selected ruler thickness through one command and preserves its visual fields through undo/redo', async () => {
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => '019c1f62-058e-7000-8000-000000000824'),
    })
    const session = new DocumentSessionController({
      document: documentFixture(),
      revision: 1,
      bridge: {
        saveDocument: async () => 2,
        exportRecoveryBundle: async () => ({ kind: 'saved' }),
      },
      correlationId: () => 'm08-ruler-update',
      debounceMs: 60_000,
    })
    const view = render(EditorShell, {
      props: { documentSession: markRaw(session) },
      global: { plugins: [createEditorShellPinia()] },
    })

    await fireEvent.click(screen.getByRole('button', { name: 'Ruler' }))
    const scene = screen.getByLabelText('Scene canvas') as HTMLCanvasElement
    prepareScene(scene)
    await fireEvent.pointerDown(scene, {
      pointerId: 24,
      clientX: 16,
      clientY: 30,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 24,
      clientX: 80,
      clientY: 30,
    })
    await fireEvent.pointerUp(scene, {
      pointerId: 24,
      clientX: 80,
      clientY: 30,
    })
    await selectLayerFromPanel(view, { activateSelect: false })

    const thickness = await screen.findByRole('slider', { name: 'Thickness' })
    thickness.focus()
    await fireEvent.keyDown(thickness, { key: 'ArrowRight' })
    expect(session.snapshot.core.document.layers[0]).toMatchObject({
      kind: 'ruler',
      payload: {
        color: { red: 227 / 255, green: 72 / 255, blue: 143 / 255, alpha: 1 },
        thickness: 3,
        fontSize: 14,
      },
    })
    session.undo()
    expect(session.snapshot.core.document.layers[0]).toMatchObject({
      kind: 'ruler',
      payload: { thickness: 2 },
    })
    session.redo()
    expect(session.snapshot.core.document.layers[0]).toMatchObject({
      kind: 'ruler',
      payload: { thickness: 3 },
    })

    session.dispose()
    view.unmount()
    vi.unstubAllGlobals()
  })

  it('moves one ruler endpoint intrinsically with conservative bounds and exact undo/redo', async () => {
    const ruler = precisionLayerFixture('ruler') as RulerLayer
    const beforeDocument = { ...documentFixture(), layers: [ruler] }
    const session = new DocumentSessionController({
      document: beforeDocument,
      revision: 1,
      bridge: {
        saveDocument: async () => 2,
        exportRecoveryBundle: async () => ({ kind: 'saved' }),
      },
      correlationId: () => 'm08-ruler-intrinsic-resize',
      debounceMs: 60_000,
    })
    const pinia = createEditorShellPinia()
    const view = render(EditorShell, {
      props: { documentSession: markRaw(session) },
      global: { plugins: [pinia] },
    })
    const store = useEditorShellStore(pinia)
    store.selectTool('select')
    store.selectLayer(ruler.id)
    await nextTick()
    const scene = screen.getByLabelText('Scene canvas') as HTMLCanvasElement
    prepareScene(scene)
    const execute = vi.spyOn(session, 'execute')
    const fixedStart = transformedPoint(ruler.transform, ruler.payload.start)
    const resizeStart = transformedPoint(ruler.transform, ruler.payload.end)
    const resizeEnd = { x: resizeStart.x + 35, y: resizeStart.y + 24 }

    await fireEvent.pointerDown(scene, {
      pointerId: 26,
      clientX: resizeStart.x,
      clientY: resizeStart.y,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 26,
      clientX: resizeEnd.x,
      clientY: resizeEnd.y,
    })
    expect(execute).not.toHaveBeenCalled()
    await fireEvent.pointerUp(scene, {
      pointerId: 26,
      clientX: resizeEnd.x,
      clientY: resizeEnd.y,
    })

    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'updateLayer',
        before: ruler,
        after: expect.objectContaining({ kind: 'ruler' }),
      }),
    )
    const after = session.snapshot.core.document.layers[0]
    if (after?.kind !== 'ruler') throw new Error('expected resized ruler')
    expect(after.transform.scaleX).toBe(1)
    expect(after.transform.scaleY).toBe(1)
    expect(after.payload).toMatchObject({
      thickness: ruler.payload.thickness,
      fontSize: ruler.payload.fontSize,
      color: ruler.payload.color,
      unit: ruler.payload.unit,
    })
    expect(rulerVisualBoundsAreConservative(after, beforeDocument.canvas)).toBe(
      true,
    )
    const actualEndpoints = [
      transformedPoint(after.transform, after.payload.start),
      transformedPoint(after.transform, after.payload.end),
    ] as const
    expect(actualEndpoints[0].x).toBeCloseTo(fixedStart.x, 8)
    expect(actualEndpoints[0].y).toBeCloseTo(fixedStart.y, 8)
    expect(actualEndpoints[1].x).toBeCloseTo(resizeEnd.x, 8)
    expect(actualEndpoints[1].y).toBeCloseTo(resizeEnd.y, 8)
    const [start, end] = actualEndpoints
    const length = Math.hypot(end.x - start.x, end.y - start.y)
    const badgePoint = {
      x: (start.x + end.x) / 2 - ((end.y - start.y) / length) * 8,
      y: (start.y + end.y) / 2 + ((end.x - start.x) / length) * 8,
    }
    expect(
      hitTestDocument(session.snapshot.core.document, badgePoint),
    ).toMatchObject({ nodeId: ruler.id, part: 'fill' })

    session.undo()
    expect(session.snapshot.core.document.layers[0]).toEqual(ruler)
    session.redo()
    expect(session.snapshot.core.document.layers[0]).toEqual(after)

    session.dispose()
    view.unmount()
  })

  it('exposes text-labelled persisted settings in English and Russian', async () => {
    const session = new DocumentSessionController({
      document: documentFixture(),
      revision: 1,
      bridge: {
        saveDocument: async () => 2,
        exportRecoveryBundle: async () => ({ kind: 'saved' }),
      },
      correlationId: () => 'm08-settings',
      debounceMs: 60_000,
    })
    const pinia = createEditorShellPinia()
    const view = render(EditorShell, {
      props: { documentSession: markRaw(session) },
      global: { plugins: [pinia] },
    })
    const toolbar = view.container.querySelector(
      '.cs-context-toolbar',
    ) as HTMLElement
    const english = [
      ['Hide data', ['Region', 'Effect']],
      ['Spotlight', ['Shape', 'Dim color', 'Dim opacity', 'Feather']],
      [
        'Ruler',
        ['Colour', 'Thickness', 'Label size', 'Unit', 'Snapping', 'Angle step'],
      ],
      [
        'Loupe',
        ['Zoom', 'Size', 'Shape', 'Border color', 'Border width', 'Shadow'],
      ],
    ] as const
    for (const [tool, labels] of english) {
      await fireEvent.click(screen.getByRole('button', { name: tool }))
      for (const label of labels) {
        expect(within(toolbar).getByText(label)).toBeInTheDocument()
      }
    }

    useEditorShellStore(pinia).setLocale('ru')
    await fireEvent.click(
      await screen.findByRole('button', { name: 'Скрыть данные' }),
    )
    expect(within(toolbar).getByText('Область')).toBeInTheDocument()
    expect(within(toolbar).getByText('Эффект')).toBeInTheDocument()

    await fireEvent.click(
      await screen.findByRole('button', { name: 'Линейка' }),
    )
    for (const label of [
      'Цвет',
      'Толщина',
      'Размер подписи',
      'Единицы',
      'Привязка',
      'Шаг угла',
    ]) {
      expect(within(toolbar).getByText(label)).toBeInTheDocument()
    }
    await fireEvent.click(
      await screen.findByRole('button', { name: 'Показать слои' }),
    )
    expect(
      view.container.querySelector('.cs-layers-panel'),
    ).not.toHaveTextContent(/Размер подписи|Шаг угла|Привязка/u)

    session.dispose()
    view.unmount()
  })
})
