import { describe, expect, it } from 'vitest'

import {
  ActionCancelledError,
  createEditorShellPinia,
  useEditorShellStore,
} from '@cute-screen/editor-vue'

describe('M04 capture action feedback', () => {
  it('keeps ordered multi-selection transient and clears it without document state', () => {
    const store = useEditorShellStore(createEditorShellPinia())
    store.selectLayer('bottom')
    store.selectLayer('top', true)
    expect(store.selectedLayerIds).toEqual(['bottom', 'top'])
    expect(store.selectedLayerId).toBe('bottom')
    store.selectLayer('bottom', true)
    expect(store.selectedLayerIds).toEqual(['top'])
    expect(store.selectedLayerId).toBe('top')
    store.clearLayerSelection()
    expect(store.selectedLayerIds).toEqual([])
  })

  it('selects an inclusive Layers-panel range from the primary selection', () => {
    const store = useEditorShellStore(createEditorShellPinia())
    store.setLayers(
      ['top', 'middle', 'bottom'].map((id) => ({
        id,
        icon: 'shape' as const,
        name: id,
        visible: true,
        locked: false,
        opacity: 1,
        rotation: 0,
        opacityEditable: true,
      })),
    )
    store.selectLayer('top')
    store.selectLayer('bottom', false, true)

    expect(store.selectedLayerIds).toEqual(['top', 'middle', 'bottom'])
    expect(store.selectedLayerId).toBe('top')
  })

  it('switches between fit and custom viewport zoom explicitly', () => {
    const store = useEditorShellStore(createEditorShellPinia())
    expect(store.zoomMode).toBe('fit')
    store.setFitZoom(625)
    expect(store.zoom).toBe(625)
    expect(store.zoomMode).toBe('fit')
    store.setZoom(125)
    expect(store.zoomMode).toBe('custom')
    store.enableFit()
    expect(store.zoomMode).toBe('fit')
  })

  it('preserves viewport zoom and mode independently for each frame', () => {
    const store = useEditorShellStore(createEditorShellPinia())
    store.setFrames([
      { id: 'one', label: '1', selected: true },
      { id: 'two', label: '2', selected: false },
    ])
    store.setZoom(175)
    store.selectFrame('two')
    store.setFitZoom(80)
    store.selectFrame('one')

    expect(store.zoom).toBe(175)
    expect(store.zoomMode).toBe('custom')
    store.selectFrame('two')
    expect(store.zoom).toBe(80)
    expect(store.zoomMode).toBe('fit')
  })

  it('shows native capture progress without turning it into a terminal result', async () => {
    const store = useEditorShellStore(createEditorShellPinia())
    let reportProgress: ((state: 'selecting') => void) | undefined
    let complete: ((message: string) => void) | undefined
    store.initialize({
      preferences: { load: () => undefined, save: () => undefined },
      languages: ['en'],
      systemDark: () => false,
      actions: {
        run: async (_action, _signal, report) =>
          new Promise<string>((resolve) => {
            reportProgress = report as
              ((state: 'selecting') => void) | undefined
            complete = resolve
          }),
      },
    })

    const running = store.runAction('capture')
    await Promise.resolve()
    reportProgress?.('selecting')

    expect(store.actionState).toEqual({
      status: 'pending',
      action: 'capture',
      captureProgress: 'selecting',
    })

    complete?.('Capture opened')
    await running
  })

  it('keeps native selector cancellation distinct from an error', async () => {
    const store = useEditorShellStore(createEditorShellPinia())
    store.initialize({
      preferences: { load: () => undefined, save: () => undefined },
      languages: ['en'],
      systemDark: () => false,
      actions: {
        run: async () => {
          throw new ActionCancelledError('Capture cancelled')
        },
      },
    })

    await store.runAction('capture')

    expect(store.actionState).toEqual({
      status: 'cancelled',
      action: 'capture',
      message: 'Capture cancelled',
    })
  })

  it('maps Screen Recording denial to retryable capture copy', async () => {
    const store = useEditorShellStore(createEditorShellPinia())
    store.initialize({
      preferences: { load: () => undefined, save: () => undefined },
      languages: ['en'],
      systemDark: () => false,
      actions: {
        run: async () => {
          throw new Error('permissionDenied')
        },
      },
    })

    await store.runAction('capture')

    expect(store.actionState).toEqual({
      status: 'error',
      action: 'capture',
      message: 'Allow Screen Recording in System Settings, then retry Capture.',
    })
  })

  it('keeps Open image cancellation distinct from an error', async () => {
    const store = useEditorShellStore(createEditorShellPinia())
    store.initialize({
      preferences: { load: () => undefined, save: () => undefined },
      languages: ['en'],
      systemDark: () => false,
      actions: {
        run: async () => {
          throw new ActionCancelledError('Open image cancelled')
        },
      },
    })

    await store.runAction('openImage')

    expect(store.actionState).toEqual({
      status: 'cancelled',
      action: 'openImage',
      message: 'Open image cancelled',
    })
  })

  it('keeps the editor interaction state intact when capture storage fails and retries', async () => {
    const store = useEditorShellStore(createEditorShellPinia())
    let attempts = 0
    store.initialize({
      preferences: { load: () => undefined, save: () => undefined },
      languages: ['en'],
      systemDark: () => false,
      actions: {
        run: async () => {
          attempts += 1
          if (attempts === 1) throw new Error('storage failure')
          return 'Capture opened'
        },
      },
    })
    store.setDocumentState({
      kind: 'ready',
      title: 'Existing document',
      dimensions: '640 × 360',
    })
    store.selectTool('pencil')
    store.setZoom(175)
    store.setDocumentHistory({
      canUndo: true,
      canRedo: false,
      saveState: 'dirty',
    })

    await store.runAction('capture')

    expect(store.actionState).toEqual({
      status: 'error',
      action: 'capture',
      message: 'storage failure',
    })
    expect(store.documentState).toMatchObject({ title: 'Existing document' })
    expect(store.activeToolId).toBe('pencil')
    expect(store.zoom).toBe(175)
    expect(store.documentHistory.saveState).toBe('dirty')

    await store.runAction('capture')
    expect(store.actionState).toEqual({
      status: 'success',
      action: 'capture',
      message: 'Capture opened',
    })
    expect(store.activeToolId).toBe('pencil')
    expect(store.zoom).toBe(175)
    expect(store.documentHistory.saveState).toBe('dirty')
  })
})
