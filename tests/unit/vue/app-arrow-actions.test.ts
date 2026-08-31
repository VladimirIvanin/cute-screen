import { fireEvent, render, screen } from '@testing-library/vue'
import { describe, expect, it, vi } from 'vitest'
import { markRaw } from 'vue'
import CanvasViewport from '../../../packages/editor-vue/src/shell/components/CanvasViewport.vue'
import EditorShell from '../../../packages/editor-vue/src/shell/components/EditorShell.vue'
import TopBar from '../../../packages/editor-vue/src/shell/components/TopBar.vue'
import ZoomControls from '../../../packages/editor-vue/src/shell/components/ZoomControls.vue'
import { createEditorShellPinia, t } from '@cute-screen/editor-vue'
import {
  hitTestDocument,
  parseEditorDocument,
  serializeEditorDocument,
} from '@cute-screen/editor-renderer'
import {
  arrowDocument,
  arrowSession,
  divergentArrowDocument,
  selectArrowLayer,
} from './app-test-kit'

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
})
