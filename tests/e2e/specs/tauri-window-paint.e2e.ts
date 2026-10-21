import { execFile } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { promisify } from 'node:util'
import {
  createCanvas,
  loadImage,
} from '@napi-rs/canvas'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { nativeImageIngress } from '../image-ingress'
import { cardDocument } from '../publication-card'
import { waitForStableCanvas } from '../canvas-ready'

const executeFile = promisify(execFile)

async function expectVisiblePixels(name: string): Promise<void> {
  const bytes = await browser.saveScreenshot(`artifacts/tauri-e2e/window-paint-${name}.png`)
  const image = await loadImage(bytes)
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0)
  const top = Math.min(80, image.height - 1)
  const pixels = context.getImageData(0, top, image.width, image.height - top).data
  let visible = 0
  for (let index = 0; index < pixels.length; index += 4) {
    if (Math.max(pixels[index]!, pixels[index + 1]!, pixels[index + 2]!) > 32) visible += 1
  }
  expect(visible / (pixels.length / 4)).toBeGreaterThan(0.05)
}

describe('native window paint lifecycle', () => {
  it('keeps the 4K document visible through resize, maximize, hover and second-launch restore', async () => {
    await mkdir('artifacts/tauri-e2e', { recursive: true })
    await expect($('button[aria-label="Open image"]')).toBeEnabled()
    await nativeImageIngress('picker', 'ui-4k.png')
    await $('button[aria-label="Open image"]').click()
    await browser.waitUntil(async () => (await cardDocument()).canvas.width === 3840)
    await waitForStableCanvas()
    const document = await cardDocument()
    const executable = process.env.CUTE_SCREEN_WDIO_APP_BINARY
    if (!executable) throw new Error('CUTE_SCREEN_WDIO_APP_BINARY is required')

    for (let cycle = 0; cycle < 3; cycle += 1) {
      await browser.setWindowSize(cycle % 2 === 0 ? 1024 : 1280, 800)
      await waitForStableCanvas()
      await expectVisiblePixels(`${cycle}-restored`)
      await browser.maximizeWindow()
      await waitForStableCanvas()
      for (const selector of ['.cs-layers-peek', '.cs-tool-button[data-tool-id="select"]']) {
        await $(selector).moveTo()
        await browser.pause(650)
        await expectVisiblePixels(`${cycle}-${selector.includes('layers') ? 'native-tooltip' : 'html-tooltip'}`)
      }
      await browser.execute(async () => window.__cuteScreenE2eWindow?.hide())
      await executeFile(executable, ['show'])
      await browser.waitUntil(() => browser.execute(() => window.__cuteScreenE2eWindow?.isVisible() ?? false))
      await waitForStableCanvas()
      await expectVisiblePixels(`${cycle}-reopen`)
      expect(await cardDocument()).toEqual(document)
    }
  }).timeout(120000)
})
