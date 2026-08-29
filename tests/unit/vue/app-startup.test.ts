import { describe, expect, it } from 'vitest'

import { runEditorStartup } from '../../../apps/desktop/src/editor-startup'

describe('desktop startup mount order', () => {
  it('opens the last document before optional font and capability probes', async () => {
    const order: string[] = []
    let resolveFonts: (() => void) | undefined
    const fontsPending = new Promise<void>((resolve) => {
      resolveFonts = resolve
    })

    await runEditorStartup({
      loadPersistedDocument: async () => {
        order.push('repositoryOpenLast')
      },
      loadSystemFonts: () => {
        order.push('listSystemFonts')
        return fontsPending
      },
      refreshPlatformCapabilities: async () => {
        order.push('platformCapabilities')
      },
      installLifecycleGuards: async () => {
        order.push('lifecycleGuards')
      },
    })

    expect(order[0]).toBe('repositoryOpenLast')
    expect(order).toEqual([
      'repositoryOpenLast',
      'listSystemFonts',
      'platformCapabilities',
      'lifecycleGuards',
    ])
    resolveFonts?.()
    await fontsPending
  })

  it('leaves loading even when the font catalog never settles', async () => {
    let documentState: 'loading' | 'empty' = 'loading'
    const fonts = new Promise<void>(() => undefined)

    await runEditorStartup({
      loadPersistedDocument: async () => {
        documentState = 'empty'
      },
      loadSystemFonts: () => fonts,
      refreshPlatformCapabilities: async () => undefined,
      installLifecycleGuards: async () => undefined,
    })

    expect(documentState).toBe('empty')
  })
})
