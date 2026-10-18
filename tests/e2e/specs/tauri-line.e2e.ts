import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import {
  lineDocument,
  verifyLine,
} from '../line'
import { waitForStableCanvas } from '../canvas-ready'

describe('line in the real WebView', () => {
  it('creates lines in non-origin Quick, hands them to Editor and decodes the clipboard export', async () => {
    await browser.setWindowSize(1280, 900)
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await browser.execute(async () => {
      const native = window as unknown as {
        __TAURI__: { core: { invoke(command: string, args: unknown): Promise<void> } }
      }
      await native.__TAURI__.core.invoke('plugin:window|set_focus', { label: 'quick-capture' })
    })
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await waitForStableCanvas()
    const rect = await browser.execute(() => document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect().toJSON())
    await browser.action('pointer')
      .move({ origin: 'viewport', x: Math.round(rect.left + 1), y: Math.round(rect.top + 1) })
      .down({ button: 'left' })
      .move({ origin: 'viewport', x: Math.round(rect.left + rect.width * .08), y: Math.round(rect.top + rect.height * .08), duration: 180 })
      .up({ button: 'left' }).perform()
    await browser.waitUntil(async () => {
      const crop = (await lineDocument()).crop
      return Boolean(crop && crop.x > 0 && crop.y > 0)
    }, { timeoutMsg: 'Native corner resize did not produce a non-origin Quick crop' })
    expect((await lineDocument()).crop!.x).toBeGreaterThan(0)
    expect((await lineDocument()).crop!.y).toBeGreaterThan(0)
    await verifyLine('artifacts/tauri-e2e/line-quick')
    const before = await lineDocument()
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await browser.execute(async () => {
      const native = window as unknown as {
        __TAURI__: { core: { invoke(command: string, args: unknown): Promise<void> } }
      }
      await native.__TAURI__.core.invoke('plugin:window|set_focus', { label: 'main' })
    })
    await waitForStableCanvas()
    const expectedLine = before.layers.find((layer) => layer.kind === 'arrow' && layer.payload.annotationTool === 'line')!
    await browser.waitUntil(async () => (await lineDocument()).layers.some((layer) => layer.id === expectedLine.id),
      { timeoutMsg: 'Quick annotations did not mount in Editor' })
    const handed = await lineDocument()
    const lines = before.layers.filter((layer) => layer.kind === 'arrow' && layer.payload.annotationTool === 'line')
    for (const line of lines) {
      expect(handed.layers.find((layer) => layer.id === line.id)).toEqual({
        ...line, transform: { ...line.transform,
          translateX: line.transform.translateX - Math.round(before.crop!.x),
          translateY: line.transform.translateY - Math.round(before.crop!.y),
        },
      })
    }
    expect(handed.canvas).toEqual({
      width: Math.round(before.crop!.x + before.crop!.width) - Math.round(before.crop!.x),
      height: Math.round(before.crop!.y + before.crop!.height) - Math.round(before.crop!.y),
    })
    await verifyLine('artifacts/tauri-e2e/line-editor')
    await $('button[aria-label="Copy"]').click()
    await expect($('.cs-action-feedback.is-success')).toHaveText('Result copied')
    const decoded = await browser.execute(async () => {
      const native = window as unknown as {
        __TAURI__: { core: { invoke<T>(command: string, args: unknown): Promise<T> } }
      }
      const clipboard = await native.__TAURI__.core.invoke<{ bitmap: { resourceToken: string } }>('clipboard_read_snapshot', { correlationId: 'line-export' })
      const bytes = await native.__TAURI__.core.invoke<ArrayBuffer>('read_image_bytes', { token: clipboard.bitmap.resourceToken, correlationId: 'line-export' })
      const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')!
      context.drawImage(image, 0, 0)
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      let red = 0
      for (let i = 0; i < pixels.length; i += 4) if (
        pixels[i]! > 180 &&
        pixels[i + 1]! < 120 &&
        pixels[i + 2]! < 130 &&
        pixels[i + 3] === 255
      ) red++
      const size = { width: image.width, height: image.height, red }
      image.close()
      return size
    })
    expect(decoded.width).toBeGreaterThan(0)
    expect(decoded.height).toBeGreaterThan(0)
    expect(decoded.red).toBeGreaterThan(100)
    await expect($('.cs-save-status')).not.toExist()
  }).timeout(180000)
})
