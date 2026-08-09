import { describe, expect, it } from 'vitest'

import {
  ActionCancelledError,
  createEditorShellPinia,
  useEditorShellStore,
} from '@cute-screen/editor-vue'

describe('M04 capture action feedback', () => {
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
