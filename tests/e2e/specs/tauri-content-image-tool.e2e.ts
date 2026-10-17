import {
  $,
  browser,
  expect,
} from '@wdio/globals'

import { waitForStableCanvas } from '../canvas-ready'
import { verifyImageEditing } from '../image-editing'
import {
  imageDocument,
  nativeImageIngress,
} from '../image-ingress'

describe('Image tool in a real Tauri webview', () => {
  it('imports in Quick and Editor through native commands, paste and drop', async () => {
    await browser.execute(() => {
      const state = window as unknown as { imageTrustedPaste?: boolean }
      window.addEventListener('keydown', (event) => {
        if (event.code === 'KeyV') state.imageTrustedPaste = event.isTrusted
      })
    })
    await browser.setWindowSize(1280, 900)
    await expect($('h1')).toHaveText('Capture your first screen')
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await waitForStableCanvas()
    await verifyInsert('quick')
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await waitForStableCanvas()
    await verifyInsert('editor')
    const trusted = await browser.execute(() =>
      (window as unknown as { imageTrustedPaste: boolean }).imageTrustedPaste)
    expect(trusted).toBe(true)
    const before = (await imageDocument()).layers.length
    await nativeImageIngress('cancel')
    await $('button[data-tool-id="image"]').click()
    await expect($('.cs-image-feedback')).toHaveText('Image import cancelled')
    expect((await imageDocument()).layers).toHaveLength(before)
    await nativeImageIngress('picker', 'corrupted.png')
    await browser.keys('g')
    await expect($('.cs-tool-error[role="alert"]')).toExist()
    expect((await imageDocument()).layers).toHaveLength(before)
    await browser.keys('Escape')
    await nativeImageIngress('multiple')
    await expect($('.cs-tool-error[role="alert"]')).toHaveText('Drop one image at a time.')
    expect((await imageDocument()).layers).toHaveLength(before)
    await browser.keys('Escape')
    await $('button[aria-label="Copy"]').click()
    await expect($('.cs-action-feedback.is-success')).toHaveText('Result copied')
    const expected = await browser.execute(() => {
      const scene = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')!
      return { width: scene.width, height: scene.height }
    })
    const exported = await browser.execute(async () => {
      type Native = { __TAURI__: { core: {
        invoke(command: string, args: unknown): Promise<{ bitmap: { width: number; height: number } }>
      } } }
      const native = window as unknown as Native
      const result = await native.__TAURI__.core.invoke('clipboard_read_snapshot', { correlationId: 'image-export-decode' })
      return { width: result.bitmap.width, height: result.bitmap.height }
    })
    expect(exported).toEqual(expected)
    await browser.saveScreenshot('artifacts/tauri-e2e/image-import-editor.png')
    await browser.waitUntil(() => browser.execute(() => !document.querySelector('.cs-save-status')))
  }).timeout(180_000)
})

async function verifyInsert(surface: string): Promise<void> {
  const before = (await imageDocument()).layers.length
  await nativeImageIngress('picker')
  await browser.keys('g')
  await browser.waitUntil(async () => (await imageDocument()).layers.length === before + 1)
  const image = (await imageDocument()).layers.at(-1)!
  expect(image.payload.intrinsicWidth).toBe(3840)
  expect(image.payload.intrinsicHeight).toBe(2160)
  expect(image.transform.scaleX).toBeLessThan(1)
  expect(image.transform.scaleY).toBe(image.transform.scaleX)
  await expect($('button[data-tool-id="select"]')).toHaveAttribute('aria-pressed', 'true')
  await verifyImageEditing(`artifacts/tauri-e2e/image-edit-${surface}`)
  await browser.keys(['Control', 'z'])
  await browser.waitUntil(async () => (await imageDocument()).layers.length === before)
  await browser.keys(['Control', 'Shift', 'z'])
  await browser.waitUntil(async () => (await imageDocument()).layers.length === before + 1)
  await nativeImageIngress('clipboard', 'alpha.png')
  await browser.keys(['Control', 'v'])
  await browser.waitUntil(async () => (await imageDocument()).layers.length === before + 2)
  await nativeImageIngress('drop', 'alpha.png')
  await browser.waitUntil(async () => (await imageDocument()).layers.length === before + 3)
  await waitForStableCanvas()
  await browser.saveScreenshot(`artifacts/tauri-e2e/image-import-${surface}.png`)
}
