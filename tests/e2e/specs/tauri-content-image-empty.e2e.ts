import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import {
  imageDocument,
  nativeImageIngress,
} from '../image-ingress'
import { waitForStableCanvas } from '../canvas-ready'

describe('native image drop in an empty editor', () => {
  it('creates a document with a locked base through the production open flow', async () => {
    await expect($('h1')).toHaveText('Capture your first screen')
    await expect($('button[data-tool-id="image"]')).toBeDisabled()
    await nativeImageIngress('drop')
    await $('button[data-tool-id="image"]').waitForEnabled()
    await waitForStableCanvas()
    const document = await imageDocument()
    expect(document.layers).toHaveLength(1)
    expect(document.layers[0]!.payload.role).toBe('base')
    expect(document.layers[0]!.payload.intrinsicWidth).toBe(3840)
    const locked = await browser.execute(() => {
      type State = { __cuteScreenE2eM08: { snapshot(): { document: { layers: { locked: boolean }[] } } } }
      const state = window as unknown as State
      return state.__cuteScreenE2eM08.snapshot().document.layers[0]!.locked
    })
    expect(locked).toBe(true)
    await browser.saveScreenshot('artifacts/tauri-e2e/image-import-empty.png')
  })
})
