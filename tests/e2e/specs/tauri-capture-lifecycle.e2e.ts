import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import {
  createCanvas,
  loadImage,
} from '@napi-rs/canvas'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { finishAreaQuickCaptureInEditor } from '../quick-capture'
import {
  drawShape,
  shapeDocument,
} from '../shape-toolbar'
import { waitForStableCanvas } from '../canvas-ready'

const execute = promisify(execFile)
type NativeWindow = Window & { __TAURI__: { core: { invoke<T>(command: string, args?: unknown): Promise<T> } } }
type Draft = { draftId: string; selection: { x: number; y: number; width: number; height: number } }

describe('capture lifecycle regressions from waytator issues', () => {
  it('keeps text pixels unchanged when the next object becomes an ellipse', async () => {
    await $('button[aria-label="Capture"]').click()
    await finishAreaQuickCaptureInEditor()
    await $('button[aria-label="Text"]').click()
    const textPoint = await browser.execute(() => {
      const rect = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
      return { x: Math.round(rect.left + rect.width * .1), y: Math.round(rect.top + rect.height * .15) }
    })
    await browser.action('pointer').move({ origin: 'viewport', ...textPoint }).down().up().perform()
    const editor = $('[contenteditable="true"][aria-label="Text editor"]')
    await editor.waitForDisplayed()
    await editor.addValue('Text before ellipse')
    await browser.keys(['Control', 'Enter'])
    await browser.waitUntil(async () => (await shapeDocument()).layers.some((layer) => layer.kind === 'text'))
    await expect(editor).not.toExist()
    await $('button[aria-label="Select"]').click()
    await browser.action('pointer').move({ origin: 'viewport',
      x: textPoint.x, y: textPoint.y + 180 }).down().up().perform()
    await waitForStableCanvas()
    await browser.execute(async () => {
      await document.fonts.ready
    })
    let previousPixels = 0
    let stablePixels = 0
    await browser.waitUntil(async () => {
      const hash = await browser.execute(() => {
        const canvas = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')!
        const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
        let hash = 0
        for (let i = 0; i < data.length; i++) hash = (Math.imul(hash, 31) + data[i]!) | 0
        return hash
      })
      stablePixels = hash === previousPixels ? stablePixels + 1 : 0
      previousPixels = hash
      return stablePixels >= 3
    }, { interval: 100, timeoutMsg: 'Committed text pixels did not settle' })
    await browser.execute(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')!
      const state = window as typeof window & { __beforeEllipse?: ImageData }
      state.__beforeEllipse = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
    })
    await browser.execute(async () => {
      await (window as unknown as NativeWindow).__TAURI__.core.invoke('plugin:window|set_focus', { label: 'main' })
    })
    await drawShape()
    await $('.cs-selection-floating-toolbar [data-shape-control="geometry"]').click()
    await $('[data-shape-id="circle"]').click()
    await browser.keys('Escape')
    await waitForStableCanvas()
    const diff = await browser.execute(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')!
      const state = window as typeof window & { __beforeEllipse?: ImageData }
      const before = state.__beforeEllipse!
      const after = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
      if (before.width !== after.width || before.height !== after.height) {
        throw new Error('Canvas resized during ellipse regression')
      }
      let changed = 0
      let outside = 0
      let maxOutsideDifference = 0
      const bounds = { left: after.width, top: after.height, right: 0, bottom: 0 }
      for (let y = 0; y < after.height; y++) for (let x = 0; x < after.width; x++) {
        const offset = (y * after.width + x) * 4
        if (
          before.data[offset] === after.data[offset] &&
          before.data[offset + 1] === after.data[offset + 1] &&
          before.data[offset + 2] === after.data[offset + 2] &&
          before.data[offset + 3] === after.data[offset + 3]
        ) continue
        changed++
        if (
          x < after.width * .35 - 24 ||
          x > after.width * .65 + 24 ||
          y < after.height * .55 - 24 ||
          y > after.height * .7 + 24
        ) {
          outside++
          for (let channel = 0; channel < 4; channel++) {
            maxOutsideDifference = Math.max(maxOutsideDifference,
              Math.abs(before.data[offset + channel]! - after.data[offset + channel]!))
          }
          bounds.left = Math.min(bounds.left, x)
          bounds.top = Math.min(bounds.top, y)
          bounds.right = Math.max(bounds.right, x)
          bounds.bottom = Math.max(bounds.bottom, y)
        }
      }
      delete state.__beforeEllipse
      return { changed, outside, maxOutsideDifference, bounds, width: after.width, height: after.height }
    })
    expect(diff.changed).toBeGreaterThan(20)
    expect(diff).toEqual(expect.objectContaining({ outside: 0 }))
    await browser.saveScreenshot(path.resolve('artifacts/tauri-e2e/text-then-ellipse.png'))
  })

  it('rejects competing ingress and keeps annotated system clipboard pixels after Quick closes', async function () {
    if (process.platform !== 'win32') {
      this.skip()
      return
    }
    const directory = path.resolve('artifacts/portal-lifecycle/native')
    await mkdir(directory, { recursive: true })
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await $('.cs-quick-actions button:nth-child(2)').waitForEnabled()
    const draft = await browser.execute(() => (window as unknown as NativeWindow).__TAURI__.core.invoke<Draft>('quick_capture_get_active'))
    const busy = []
    for (const source of ['hotkey', 'tray', 'cli', 'ui']) {
      const result = await browser.execute(async (source) => {
        const native = (window as unknown as NativeWindow).__TAURI__.core
        const outcome = await native.invoke<{ outcome: string }>('capture_request', { request: {
          correlationId: crypto.randomUUID(), action: 'area', delayMs: 0, cursor: false, invocationSource: source,
        } })
        const current = await native.invoke<Draft>('quick_capture_get_active')
        return { outcome: outcome.outcome, draftId: current.draftId }
      }, source)
      expect(result).toEqual({ outcome: 'busy', draftId: draft.draftId })
      busy.push({ source, ...result })
    }
    expect((await browser.tauri.listWindows()).filter((label) => label === 'quick-capture')).toHaveLength(1)
    // Pixel/clipboard evidence is independent of the native activation gate.
    await browser.execute(async () => {
      await (window as unknown as NativeWindow).__TAURI__.core.invoke('plugin:window|set_focus',
        { label: 'quick-capture' })
    })
    await $('button[aria-label="Arrow"]').click()
    await expect($('button[aria-label="Arrow"]')).toHaveAttribute('aria-pressed', 'true')
    await waitForStableCanvas()
    const points = await browser.execute(() => {
      const state = window as typeof window & { __cuteScreenE2eQuick: { snapshot(): {
        crop: { x: number; y: number; width: number; height: number }
        canvas: { width: number; height: number }
      } } }
      const doc = state.__cuteScreenE2eQuick.snapshot()
      const rect = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
      return { x: Math.round(rect.left + (doc.crop.x + doc.crop.width * .25) * rect.width / doc.canvas.width),
        y: Math.round(rect.top + (doc.crop.y + doc.crop.height * .45) * rect.height / doc.canvas.height),
        dx: Math.round(doc.crop.width * .4 * rect.width / doc.canvas.width),
        dy: Math.round(doc.crop.height * .15 * rect.height / doc.canvas.height) }
    })
    await browser.action('pointer').move({ origin: 'viewport', x: points.x, y: points.y }).down({ button: 'left' })
      .move({ origin: 'pointer', x: points.dx, y: points.dy, duration: 150 }).up({ button: 'left' }).perform()
    await $('.cs-selection-floating-toolbar').waitForDisplayed()
    await browser.saveScreenshot(path.join(directory, 'quick-before-copy.png'))
    await $('.cs-quick-actions button:nth-child(2)').click()
    await browser.waitUntil(async () => !(await $('.cs-quick-actions').isExisting()))
    // A separate STA process reads the Windows clipboard, after Quick dismissed.
    const png = path.join(directory, 'clipboard.png')
    await execute('powershell.exe', ['-NoProfile', '-STA', '-File', path.resolve('tests/e2e/fixtures/read-clipboard-image.ps1'), '-OutputPath', png])
    const image = await loadImage(await readFile(png))
    expect([image.width, image.height]).toEqual([draft.selection.width, draft.selection.height])
    const canvas = createCanvas(image.width, image.height)
    canvas.getContext('2d').drawImage(image, 0, 0)
    const pixels = canvas.getContext('2d').getImageData(0, 0, image.width, image.height).data
    let annotated = 0
    let transparent = 0
    for (let offset = 0; offset < pixels.length; offset += 4) {
      if (pixels[offset + 3] !== 255) transparent++
      if (
        pixels[offset] !== 127 ||
        pixels[offset + 1] !== 127 ||
        pixels[offset + 2] !== 127
      ) annotated++
    }
    expect(annotated).toBeGreaterThan(20)
    expect(transparent).toBe(0)
    await browser.tauri.switchWindow('main')
    expect(await browser.execute(() => (window as unknown as NativeWindow).__TAURI__.core.invoke('quick_capture_get_active'))).toBeNull()
    await writeFile(path.join(directory, 'result.json'), JSON.stringify({ platform: process.platform, busy,
      selection: draft.selection, decoded: { width: image.width, height: image.height, annotated }, reader: 'separate Windows STA process' }, null, 2))
  })
})
