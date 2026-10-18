import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { finishAreaQuickCaptureInEditor } from '../quick-capture'

describe('M04 clean-profile capture', () => {
  it('creates and mounts the first persisted document through the production request flow', async () => {
    await browser.setWindowSize(1024, 700)
    await expect($('h1')).toHaveText('Capture your first screen')

    await $('button[aria-label="Capture"]').click()
    await finishAreaQuickCaptureInEditor()

    await expect($('button[aria-label="Copy"]')).toBeEnabled()
    await expect($('button[aria-label="Export"]')).toBeEnabled()
    await expect($('.cs-history-trigger')).toBeDisplayed()
    await expect($('nav[aria-label="Series frames"]')).not.toExist()
    const scene = $('[aria-label="Scene canvas"]')
    await expect(scene).toExist()
    // Canvas backing dimensions follow zoom/DPR; verify the persisted capture dimensions.
    const persistedCanvas = await browser.execute(async () => {
      const native = window as unknown as {
        __TAURI__: { core: { invoke<T>(command: string, args: unknown): Promise<T> } }
      }
      const stored = await native.__TAURI__.core.invoke<{ documentJson: string } | null>('repository_open_last', {
        correlationId: 'clean-profile-capture-smoke',
      })
      if (!stored) throw new Error('Capture was not persisted through the production request flow')
      return (JSON.parse(stored.documentJson) as { canvas: { width: number; height: number } }).canvas
    })
    expect(persistedCanvas).toEqual({ width: 400, height: 300 })

    const zoomBefore = await $('.cs-zoom-controls').getAttribute('data-zoom')
    await browser.setWindowSize(1600, 1000)
    await browser.waitUntil(async () => (await $('.cs-zoom-controls').getAttribute('data-zoom')) !== zoomBefore)
  })
})
