import {
  createCanvas,
  loadImage,
} from '@napi-rs/canvas'
import {
  copyFile,
  mkdir,
  readFile,
} from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { nativeImageIngress } from '../image-ingress'
import { rulerDocument } from '../ruler-toolbar'
import { waitForStableCanvas } from '../canvas-ready'

async function chooseExport(cancel = false): Promise<string> {
  return browser.execute(async (cancel) => {
    type Native = { __TAURI__: { core: { invoke<T>(name: string, args: unknown): Promise<T> } } }
    return (window as unknown as Native).__TAURI__.core.invoke<string>('test_result_export', { cancel })
  }, cancel)
}

async function scenePixels(): Promise<string> {
  return browser.execute(async () => {
    const scene = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')!
    const pixels = scene.getContext('2d')!.getImageData(0, 0, scene.width, scene.height).data
    const digest = await crypto.subtle.digest('SHA-256', pixels)
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  })
}

describe('PNG export through the production editor', () => {
  it('exports annotated 4K pixels, committed crop and cancels Save As in WebView', async function () {
    this.timeout(180000)
    await browser.setWindowSize(1280, 900)
    await nativeImageIngress('picker')
    await $('button[aria-label="Open image…"]').click()
    await $('button[aria-label="Export"]').waitForEnabled()
    await waitForStableCanvas()
    const initial = await rulerDocument()
    expect([initial.source.width, initial.source.height]).toEqual([3840, 2160])
    await $('button[aria-label="Numbered marker"]').click()
    await $('.cs-canvas:not(.cs-canvas-overlay)').click({ x: 40, y: 40 })
    await browser.waitUntil(async () => (await rulerDocument()).layers.some((layer) => layer.kind === 'numberedMarker'))
    await waitForStableCanvas()
    const output = await chooseExport()
    await $('button[aria-label="Export"]').click()
    await expect($('.cs-action-feedback')).toHaveText(expect.stringContaining('PNG exported'))
    const fullBytes = await readFile(output)
    const image = await loadImage(fullBytes)
    expect([image.width, image.height]).toEqual([3840, 2160])
    const decoded = createCanvas(image.width, image.height)
    decoded.getContext('2d').drawImage(image, 0, 0)
    expect(createHash('sha256').update(decoded.getContext('2d').getImageData(0, 0, image.width, image.height).data)
      .digest('hex')).toBe(await scenePixels())
    const evidence = path.resolve('artifacts/tauri-e2e/result-export')
    await mkdir(evidence, { recursive: true })
    await copyFile(output, path.join(evidence, 'full.png'))

    await chooseExport(true)
    await $('button[aria-label="Export"]').click()
    await expect($('.cs-action-feedback')).toHaveText(expect.stringContaining('Export cancelled'))
    expect(await readFile(output)).toEqual(fullBytes)

    await $('button[aria-label="Crop"]').click()
    await $('[role="combobox"][aria-label="Preset"]').click()
    await $('[role="option"]=1:1').click()
    await $('button=Apply').click()
    const crop = (await rulerDocument()).crop!
    expect(crop.width).toBe(2160)
    // Keep Crop active so its full-canvas preview cannot determine output bounds.
    await $('button[aria-label="Crop"]').click()
    await $('.cs-zoom-value').click()
    await $('.cs-zoom-controls [aria-label="Zoom in"]').click()
    await waitForStableCanvas()
    await chooseExport()
    await $('button[aria-label="Export"]').click()
    await expect($('.cs-action-feedback')).toHaveText(expect.stringContaining('PNG exported'))
    const cropped = await loadImage(await readFile(output))
    expect([cropped.width, cropped.height]).toEqual([crop.width, crop.height])
    const croppedCanvas = createCanvas(cropped.width, cropped.height)
    croppedCanvas.getContext('2d').drawImage(cropped, 0, 0)
    expect(Buffer.from(croppedCanvas.getContext('2d').getImageData(0, 0, cropped.width, cropped.height).data))
      .toEqual(Buffer.from(decoded.getContext('2d').getImageData(crop.x, crop.y, crop.width, crop.height).data))
    await copyFile(output, path.join(evidence, 'cropped.png'))
    expect((await rulerDocument()).source).toEqual(initial.source)
    await browser.saveScreenshot(path.join(evidence, 'editor.png'))
  })
})
