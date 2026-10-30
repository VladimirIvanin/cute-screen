import {
  mkdir,
  writeFile,
} from 'node:fs/promises'
import {
  createCanvas,
  loadImage,
} from '@napi-rs/canvas'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { waitForStableCanvas } from './canvas-ready'
import { setPhoneOrientation } from './phone-orientation-control'

type Observation = { width: number; height: number; maxDifference: number; changedChannels: number }

async function samplePreview(baseline: boolean): Promise<Observation> {
  await waitForStableCanvas()
  return browser.execute(async (baseline) => {
    const state = window as typeof window & {
      __cuteScreenE2eM05?: { waitForRender(): Promise<void> }
      __cuteScreenE2eM08?: { waitForRender(): Promise<void> }
      __frameSeamsBaseline?: ImageData
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await (state.__cuteScreenE2eM08 ?? state.__cuteScreenE2eM05)!.waitForRender()
    const canvas = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')!
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
    let maxDifference = 0, changedChannels = 0
    if (baseline) state.__frameSeamsBaseline = pixels
    else {
      const before = state.__frameSeamsBaseline!
      if (before.width !== pixels.width || before.height !== pixels.height) throw new Error('Preview size changed')
      for (let i = 0; i < pixels.data.length; i++) {
        const delta = Math.abs(pixels.data[i]! - before.data[i]!)
        maxDifference = Math.max(maxDifference, delta)
        if (delta > 0) changedChannels++
      }
      delete state.__frameSeamsBaseline
    }
    return { width: pixels.width, height: pixels.height, maxDifference, changedChannels }
  }, baseline)
}

async function decodedPixels(bytes: Uint8Array) {
  const image = await loadImage(bytes)
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0)
  return context.getImageData(0, 0, canvas.width, canvas.height)
}

export async function verifyFrameSeams(
  directory: string,
  exportResult?: (name: string) => Promise<Uint8Array>,
): Promise<void> {
  await mkdir(directory, { recursive: true })
  await $('button[aria-label="Appearance"]').click()
  const panel = $('.cs-composition-panel')
  await panel.$('button=Phone').click()
  if (!await panel.$('.cs-card-orientation-toggle').isDisplayed()) await panel.$('summary=Frame').click()
  await panel.$('label*=Screenshot placement').$('select').selectByAttribute('value', 'fullscreen')
  await panel.$('label*=Screen content').$('select').selectByAttribute('value', 'cover')
  const fill = panel.$('input[aria-label="Screen fill HEX"]')
  const reports = []
  for (const orientation of ['portrait', 'landscape'] as const) for (const theme of ['dark', 'light']) {
    await setPhoneOrientation(orientation)
    await panel.$('label*=Frame theme').$('select').selectByAttribute('value', theme)
    await $('.cs-zoom-fit').click()
    await fill.setValue('#ffffff')
    await browser.keys('Tab')
    await samplePreview(true)
    const white = exportResult ? await decodedPixels(await exportResult(`${orientation}-${theme}-white`)) : undefined
    await fill.setValue('#000000')
    await browser.keys('Tab')
    const preview = await samplePreview(false)
    expect(preview.maxDifference).toBeLessThanOrEqual(1)
    let pngDifference = 0
    if (white && exportResult) {
      const black = await decodedPixels(await exportResult(`${orientation}-${theme}-black`))
      expect([black.width, black.height]).toEqual([white.width, white.height])
      for (let i = 0; i < black.data.length; i++) {
        pngDifference = Math.max(pngDifference, Math.abs(black.data[i]! - white.data[i]!))
      }
      expect(pngDifference).toBeLessThanOrEqual(1)
    }
    reports.push({ orientation, theme, preview, pngDifference: white ? pngDifference : null })
    if (theme === 'dark') await browser.saveScreenshot(`${directory}/${orientation}.png`)
  }
  await panel.$('label*=Screen content').$('select').selectByAttribute('value', 'contain')
  await fill.setValue('#ffffff')
  await browser.keys('Tab')
  await samplePreview(true)
  await fill.setValue('#000000')
  await browser.keys('Tab')
  const letterbox = await samplePreview(false)
  expect(letterbox.maxDifference).toBe(255)
  expect(letterbox.changedChannels).toBeGreaterThan(100)
  await $('button[aria-label="Undo"]').click()
  await expect(fill).toHaveValue('#ffffff')
  await $('button[aria-label="Redo"]').click()
  await expect(fill).toHaveValue('#000000')
  const runtime = await browser.execute(() => ({ userAgent: navigator.userAgent, dpr: devicePixelRatio }))
  await writeFile(`${directory}/pixels.json`, JSON.stringify({ runtime, reports, letterbox }, null, 2))
}
