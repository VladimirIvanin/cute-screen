import { $, $$, browser, expect } from '@wdio/globals'
import path from 'node:path'

const onePixelPng = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0,
  0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120,
  156, 99, 248, 207, 192, 240, 31, 0, 5, 0, 1, 255, 137, 153, 61, 29, 0, 0, 0,
  0, 73, 69, 78, 68, 174, 66, 96, 130,
])

describe('M01 renderer harness in browser mode', () => {
  async function openHarness(query: string): Promise<void> {
    await browser.url('/')
    await browser.execute((search) => {
      window.location.search = search
    }, query)
    await expect($('.backend-state')).toExist()
  }

  it('loads bundled CanvasKit and keeps scene and overlay separate', async () => {
    await browser.setWindowSize(960, 640)
    await openHarness('?m01=1')
    await expect($('.backend-state')).toHaveText('canvaskit ready')
    await expect($$('.diagnostic-canvas')).toBeElementsArrayOfSize(2)
    await expect($('.diagnostic-metrics')).toHaveText(
      expect.stringContaining('NODES\n3'),
    )
    expect(
      await browser.execute(
        () =>
          document.documentElement.scrollWidth <= window.innerWidth &&
          document.documentElement.scrollHeight <= window.innerHeight,
      ),
    ).toBe(true)
    await browser.saveScreenshot(
      path.resolve('artifacts/browser-e2e/m01-harness-960x640.png'),
    )
    await browser.keys(['Tab'])
    expect(await browser.execute(() => document.activeElement?.tagName)).toBe(
      'BUTTON',
    )
    await browser.saveScreenshot(
      path.resolve('artifacts/browser-e2e/m01-harness-focus-960x640.png'),
    )
    await browser.setWindowSize(1024, 700)
    await browser.saveScreenshot(
      path.resolve('artifacts/browser-e2e/m01-harness-1024x700.png'),
    )
  })

  it('falls back for missing WASM and for context loss, then restores once', async () => {
    await openHarness('?m01=1&renderer=canvas2d')
    await expect($('.backend-state')).toHaveText(
      'Canvas2D fallback · startupFailure',
    )

    await openHarness('?m01=1&renderer=broken-wasm')
    await expect($('.backend-state')).toHaveText(
      'Canvas2D fallback · startupFailure',
    )

    await openHarness('?m01=1&syntheticContext=1')
    await expect($('.backend-state')).toHaveText('canvaskit ready')
    await $('button=Lose context').click()
    await expect($('.backend-state')).toHaveText('Canvas2D recovery active')
    await $('button=Restore context').click()
    await expect($('.backend-state')).toHaveText('canvaskit ready')

    await openHarness('?m01=1')
    await expect($('.backend-state')).toHaveText('canvaskit ready')
    await $('button=Lose context').click()
    await expect($('.backend-state')).toHaveText('Canvas2D recovery active')
    await $('button=Restore context').click()
    await expect($('.backend-state')).toHaveText(
      'Canvas2D fallback · recoveryFailure',
    )
  })

  it('uses raw binary IPC after a forced asset failure', async () => {
    await openHarness(
      '?m01=1&assetFailure=1&browserBinary=1&token=browser-pixel',
    )
    const stage = await browser.tauri.mock('stage_image')
    await stage.mockResolvedValue({
      token: 'browser-pixel',
      path: '/denied/browser-pixel.png',
      mimeType: 'image/png',
      width: 1,
      height: 1,
      sha256: 'a'.repeat(64),
      correlationId: 'm01-transport-harness',
    })
    const read = await browser.tauri.mock('read_image_bytes')
    await read.mockResolvedValue([...onePixelPng])

    await $('button=Verify image transport').click()
    await expect($('.diagnostic-metrics')).toHaveText(
      expect.stringContaining('binary · 1×1'),
    )
  })
})
