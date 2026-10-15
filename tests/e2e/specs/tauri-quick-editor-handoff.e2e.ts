import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { EditorDocumentV1 } from '@cute-screen/editor-vue'
import { waitForStableCanvas } from '../canvas-ready'
import { verifyEyedropperToolSwitch } from '../eyedropper-tool-switch'

async function documentSnapshot(): Promise<EditorDocumentV1> {
  return browser.execute(() => {
    const facade = (window as typeof window & {
      __cuteScreenE2eM08?: { snapshot(): { document: EditorDocumentV1 } | undefined }
    }).__cuteScreenE2eM08
    const mounted = facade?.snapshot()
    if (!mounted) throw new Error('Materialized document is not mounted')
    return mounted.document
  })
}

async function visibleWindows(): Promise<{ main: boolean; quick: boolean }> {
  return browser.execute(async () => {
    const core = (window as typeof window & {
      __TAURI__: { core: { invoke<T>(command: string, args: Record<string, unknown>): Promise<T> } }
    }).__TAURI__.core
    return {
      main: await core.invoke<boolean>('plugin:window|is_visible', { label: 'main' }),
      quick: await core.invoke<boolean>('plugin:window|is_visible', { label: 'quick-capture' }),
    }
  })
}

async function focusWindow(label: string): Promise<void> {
  await browser.execute(async (windowLabel) => {
    const core = (window as typeof window & {
      __TAURI__: { core: { invoke(command: string, args: Record<string, unknown>): Promise<void> } }
    }).__TAURI__.core
    await core.invoke('plugin:window|set_focus', { label: windowLabel })
  }, label)
}

async function scenePixel(point: { x: number; y: number }): Promise<number[]> {
  return browser.execute(({ x, y }) => {
    const canvas = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')!
    return [...canvas.getContext('2d')!.getImageData(x, y, 1, 1).data]
  }, point)
}

describe('Quick → Editor with editable annotations', () => {
  it('opens once, preserves a cropped arrow and removes its ink completely through Delete/Undo/Redo', async () => {
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    const editor = $('.cs-quick-actions button:first-child')
    await editor.waitForEnabled()
    await editor.waitForDisplayed()
    await browser.waitUntil(async () => (await visibleWindows()).quick)
    await $('button[aria-label="Select"]').click()
    await waitForStableCanvas()
    const scene = $('.cs-canvas:not(.cs-canvas-overlay)')
    const origin = await scene.getLocation()
    const size = await scene.getSize()
    const sizeBefore = await browser.execute(() => document.querySelector('.cs-quick-size-a11y')?.textContent)
    await focusWindow('quick-capture')
    await browser.execute(() => {
      const events: Record<string, unknown>[] = []
      ;
      (window as typeof window & { __handoffInput: unknown }).__handoffInput = events
      for (const type of ['pointerdown', 'pointerup']) {
        document.addEventListener(type, (event) => {
          const pointer = event as PointerEvent
          const canvas = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')!
          events.push({
            type,
            x: pointer.clientX,
            y: pointer.clientY,
            target: (event.target as Element).className,
            rect: canvas.getBoundingClientRect().toJSON(),
            trusted: event.isTrusted,
            prevented: event.defaultPrevented,
          })
        })
      }
    })
    await browser.action('pointer')
      .move({ origin: 'viewport', x: Math.round(origin.x + 5), y: Math.round(origin.y + 5) })
      .down({ button: 'left' })
      .move({ origin: 'pointer', x: Math.round(size.width * 0.2), y: Math.round(size.height * 0.2), duration: 240 })
      .up({ button: 'left' }).perform()
    await writeFile(path.resolve('artifacts/tauri-e2e/handoff-input.json'), JSON.stringify(await browser.execute(() =>
      (window as typeof window & { __handoffInput: unknown }).__handoffInput), null, 2))
    await browser.waitUntil(async () =>
      (await browser.execute(() => document.querySelector('.cs-quick-size-a11y')?.textContent)) !== sizeBefore)
    const crop = await browser.execute(() => {
      const source = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')!
      const text = document.querySelector('.cs-quick-size-a11y')!.textContent!
      const [width, height] = text.match(/\d+/gu)!.map(Number)
      if (!width || !height) throw new Error('Missing crop dimensions')
      return { x: source.width - width, y: source.height - height, width, height }
    })
    expect(crop.x).toBeGreaterThan(0)
    expect(crop.y).toBeGreaterThan(0)
    await $('button[aria-label="Arrow"]').click()
    await focusWindow('quick-capture')
    await waitForStableCanvas()
    const drawOrigin = await scene.getLocation()
    const drawSize = await scene.getSize()
    await browser.action('pointer')
      .move({ origin: 'viewport', x: Math.round(drawOrigin.x + drawSize.width * 0.35),
        y: Math.round(drawOrigin.y + drawSize.height * 0.6) })
      .down({ button: 'left' })
      .move({ origin: 'pointer', x: Math.round(drawSize.width * 0.3),
        y: -Math.round(drawSize.height * 0.2), duration: 100 })
      .up({ button: 'left' }).perform()
    await $('.cs-selection-floating-toolbar').waitForDisplayed()
    const ink = await browser.execute(() => {
      const source = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')!
      const pixels = source.getContext('2d')!.getImageData(0, 0, source.width, source.height).data
      let sample: { x: number; y: number; rgba: number[] } | undefined
      for (let y = Math.floor(source.height / 2); y < source.height; y += 1) {
        for (let x = 0; x < source.width; x += 1) {
          const offset = (y * source.width + x) * 4
          if (
            pixels[offset]! > 180 &&
            pixels[offset + 1]! < 110 &&
            pixels[offset + 2]! < 130
          ) {
            const rgba = [...pixels.slice(offset, offset + 4)]
            // Use opaque inner ink, not the first antialiased boundary pixel.
            if (!sample || rgba[0]! - rgba[1]! > sample.rgba[0]! - sample.rgba[1]!) {
              sample = { x, y, rgba }
            }
          }
        }
      }
      if (sample) return sample
      throw new Error('The arrow did not paint visible red ink')
    })
    await browser.saveScreenshot(path.resolve('artifacts/tauri-e2e/handoff-quick-before.png'))
    const started = Date.now()
    await editor.click()
    await browser.waitUntil(async () => {
      const visible = await visibleWindows()
      return visible.main && !visible.quick
    }, { timeout: 15_000, timeoutMsg: 'One Editor click did not show main and hide Quick' })
    const elapsedMs = Date.now() - started
    await browser.tauri.switchWindow('main')
    await focusWindow('main')
    await waitForStableCanvas()
    const mounted = await documentSnapshot()
    expect(mounted.canvas).toEqual({ width: crop.width, height: crop.height })
    expect(mounted.crop).toBeNull()
    expect(mounted.source.width).toBe(crop.width)
    expect(mounted.source.height).toBe(crop.height)
    const arrows = mounted.layers.filter((layer) => layer.kind === 'arrow')
    expect(arrows).toHaveLength(1)
    const arrow = arrows[0]!
    const point = { x: ink.x - crop.x, y: ink.y - crop.y }
    expect(await scenePixel(point)).toEqual(ink.rgba)
    await browser.saveScreenshot(path.resolve('artifacts/tauri-e2e/handoff-editor-before-delete.png'))
    await $('button[aria-label="Show layers"]').click()
    await $(`[data-layer-id="${arrow.id}"] .cs-layer-select`).click()
    await browser.keys('Delete')
    await browser.waitUntil(async () => !(await documentSnapshot()).layers.some((layer) => layer.id === arrow.id))
    const pixel = await scenePixel(point)
    await writeFile(path.resolve('artifacts/tauri-e2e/handoff-evidence.json'), JSON.stringify({
      elapsedMs, crop, ink, point, pixelAfterDelete: pixel, visible: await visibleWindows(),
      canvas: mounted.canvas, annotationId: arrow.id,
    }, null, 2))
    await browser.saveScreenshot(path.resolve('artifacts/tauri-e2e/handoff-editor-after-delete.png'))
    expect(pixel).toEqual([127, 127, 127, 255])
    await $('button[aria-label="Undo"]').click()
    await browser.waitUntil(async () => (await documentSnapshot()).layers.some((layer) => layer.id === arrow.id))
    expect(await scenePixel(point)).toEqual(ink.rgba)
    await $('button[aria-label="Redo"]').click()
    await browser.waitUntil(async () => !(await documentSnapshot()).layers.some((layer) => layer.id === arrow.id))
    expect(await scenePixel(point)).toEqual([127, 127, 127, 255])
    const restored = await visibleWindows()
    expect(restored).toEqual({ main: true, quick: false })
    await verifyEyedropperToolSwitch('main', 'artifacts/tauri-e2e/eyedropper-switch-editor.png')
  })
})
