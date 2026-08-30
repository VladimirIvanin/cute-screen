import path from 'node:path'

import { $, browser, expect } from '@wdio/globals'
import { Key } from 'webdriverio'
import { finishAreaQuickCaptureInEditor } from '../quick-capture'

type CropMountSnapshot = {
  readonly document: {
    readonly canvas: { readonly width: number; readonly height: number }
    readonly crop: {
      readonly x: number
      readonly y: number
      readonly width: number
      readonly height: number
    } | null
  }
  readonly decodedSource?: { readonly width: number; readonly height: number }
}

async function snapshot(): Promise<CropMountSnapshot> {
  return browser.execute(() => {
    const result = (
      window as typeof window & {
        __cuteScreenE2eM08?: {
          snapshot(): CropMountSnapshot | undefined
        }
      }
    ).__cuteScreenE2eM08?.snapshot()
    if (!result) throw new Error('M08 Tauri mount is not ready')
    return result
  })
}

async function choosePreset(option: string): Promise<void> {
  await $('[role="combobox"][aria-label="Preset"]').click()
  await browser.waitUntil(() =>
    browser.execute(
      (name) =>
        [...document.querySelectorAll<HTMLElement>('[role="option"]')].some(
          (element) => element.textContent?.trim() === name,
        ),
      option,
    ),
  )
  await browser.execute((name) => {
    const target = [
      ...document.querySelectorAll<HTMLElement>('[role="option"]'),
    ].find((element) => element.textContent?.trim() === name)
    if (!target) throw new Error(`Missing crop preset: ${name}`)
    target.click()
  }, option)
}

describe('M08 clean crop mount in a real Tauri webview', () => {
  it('opens Crop from the first decoded capture without manual frame state', async () => {
    await browser.setWindowSize(1024, 700)
    await expect($('h1')).toHaveText('Capture your first screen')
    await $('button[aria-label="Capture"]').click()
    await finishAreaQuickCaptureInEditor()
    await expect($('[aria-label="Scene canvas"]')).toExist()
    await browser.waitUntil(async () => {
      const mounted = await snapshot()
      return mounted.decodedSource?.width === 400
    })
    expect(await snapshot()).toMatchObject({
      document: { canvas: { width: 400, height: 300 }, crop: null },
      decodedSource: { width: 400, height: 300 },
    })

    await $('button[aria-label="Crop"]').click()
    await expect($('[role="combobox"][aria-label="Preset"]')).toExist()
    const overlayEvidence = await browser.execute(() => {
      const overlay = document.querySelector<HTMLCanvasElement>(
        '.cs-canvas-overlay[aria-label="Interaction overlay"]',
      )
      if (!overlay) throw new Error('Crop overlay is missing')
      const data = overlay.getContext('2d')?.getImageData(0, 0, 400, 300).data
      if (!data) throw new Error('Crop overlay pixels are unavailable')
      let visible = 0
      for (let index = 3; index < data.length; index += 4) {
        if ((data[index] ?? 0) > 0) visible += 1
      }
      return visible
    })
    expect(overlayEvidence).toBeGreaterThan(1_000)

    await choosePreset('16:9')
    await browser.keys('Escape')
    expect((await snapshot()).document.crop).toBeNull()
    await $('button[aria-label="Crop"]').click()
    await choosePreset('1:1')
    await browser.keys([Key.Shift, 'ArrowRight'])
    await browser.keys('Enter')
    await browser.waitUntil(
      async () => (await snapshot()).document.crop?.x === 60,
    )
    expect((await snapshot()).document.crop).toEqual({
      x: 60,
      y: 0,
      width: 300,
      height: 300,
    })
    await $('button[aria-label="Undo"]').click()
    await browser.waitUntil(
      async () => (await snapshot()).document.crop === null,
    )
    await browser.saveScreenshot(
      path.resolve(
        process.env.CUTE_SCREEN_WDIO_ARTIFACTS ?? 'artifacts/tauri-e2e',
        'm08-crop-first-open-1024x700.png',
      ),
    )
  })
})
