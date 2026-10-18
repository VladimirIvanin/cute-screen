import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { verifyEmoji } from '../emoji'
import { waitForStableCanvas } from '../canvas-ready'
import {
  readFile,
  copyFile,
} from 'node:fs/promises'
import {
  createCanvas,
  loadImage,
} from '@napi-rs/canvas'
import { createHash } from 'node:crypto'

describe('bundled emoji in the real WebView', () => {
  it('places and edits emoji in Quick and after editor handoff', async function () {
    this.timeout(120000)
    await expect($('h1')).toHaveText('Capture your first screen')
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await $('[data-quick-action="editor"]').waitForEnabled()
    await $('button[data-tool-id="select"]').click()
    await waitForStableCanvas()
    const rect = await browser.execute(() =>
      document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect().toJSON())
    await browser.action('pointer')
      .move({ origin: 'viewport', x: Math.round(rect.left + 5), y: Math.round(rect.top + 5) })
      .down({ button: 'left' })
      .move({ origin: 'viewport', x: Math.round(rect.left + rect.width * .2),
        y: Math.round(rect.top + rect.height * .2), duration: 180 })
      .up({ button: 'left' }).perform()
    await verifyEmoji('artifacts/tauri-e2e', 'emoji-quick')
    await $('[data-quick-action="editor"]').click()
    await browser.tauri.switchWindow('main')
    await waitForStableCanvas()
    await verifyEmoji('artifacts/tauri-e2e', 'emoji-editor')
    await $('.cs-zoom-value').click()
    await waitForStableCanvas()
    const output = await browser.execute(async () => {
      type Native = { __TAURI__: { core: { invoke<T>(command: string, args: unknown): Promise<T> } } }
      return (window as unknown as Native).__TAURI__.core.invoke<string>('test_result_export', { cancel: false })
    })
    await $('button[aria-label="Export"]').click()
    await expect($('.cs-action-feedback')).toHaveText(expect.stringContaining('PNG exported'))
    const decoded = await loadImage(await readFile(output))
    const png = createCanvas(decoded.width, decoded.height)
    png.getContext('2d').drawImage(decoded, 0, 0)
    const pixels = png.getContext('2d').getImageData(0, 0, decoded.width, decoded.height).data
    const digest = await browser.execute(async () => {
      const scene = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')!
      const pixels = scene.getContext('2d')!.getImageData(0, 0, scene.width, scene.height).data
      return { width: scene.width, height: scene.height, dpr: devicePixelRatio,
        zoom: document.querySelector('.cs-zoom-controls')?.getAttribute('data-zoom'),
        hash: [...new Uint8Array(await crypto.subtle.digest('SHA-256', pixels))]
          .map((byte) => byte.toString(16).padStart(2, '0')).join('') }
    })
    expect({ width: decoded.width, height: decoded.height }).toMatchObject({
      width: digest.width,
      height: digest.height,
    })
    expect(createHash('sha256').update(pixels).digest('hex')).toBe(digest.hash)
    await copyFile(output, 'artifacts/tauri-e2e/emoji-export.png')
    await expect($('.cs-save-status')).not.toExist()
  })
})
