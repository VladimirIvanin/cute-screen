import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import path from 'node:path'
import { waitForStableCanvas } from '../canvas-ready'
import { setNumericInput } from '../numeric-input'
import {
  snapshot,
  versionToken,
} from './browser-v7-rich-text-test-kit'

type CalloutPayload = {
  target: { x: number; y: number }
  label: { x: number; y: number }
  content: { text: string; wrap: string; fixedWidth?: number }
}

async function editorRect() {
  return browser.execute(() => {
    const editor = document.querySelector<HTMLElement>('[aria-label="Callout editor"]')!
    const rect = editor.getBoundingClientRect()
    const canvas = document.querySelector<HTMLElement>('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height,
      scale: canvas.width / 2560, canvasLeft: canvas.left, canvasTop: canvas.top,
      breaks: editor.querySelectorAll('[data-rich-text-soft-break]').length }
  })
}

export async function exerciseCalloutLayout(artifacts: string): Promise<void> {
  await browser.setWindowSize(1440, 900)
  await expect($('.cs-canvas-ready')).toExist()
  for (const left of [true, false]) {
    const before = (await snapshot()).layers.length
    const token = await versionToken()
    await $('button[aria-label="Callout"]').click()
    await waitForStableCanvas()
    const points = await browser.execute((left) => {
      const rect = document.querySelector<HTMLElement>('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
      return {
        start: {
          x: Math.round(rect.left + rect.width * (left ? 0.75 : 0.25)),
          y: Math.round(rect.top + rect.height * 0.6),
        },
        end: {
          x: Math.round(rect.left + rect.width * 0.5),
          y: Math.round(rect.top + rect.height * (left ? 0.35 : 0.75)),
        },
      }
    }, left)
    await browser.action('pointer').move({ origin: 'viewport', ...points.start }).down({ button: 'left' })
      .move({ origin: 'viewport', ...points.end, duration: 150 }).up({ button: 'left' }).perform()
    const editor = $('[aria-label="Callout editor"]')
    await expect(editor).toExist()
    await browser.keys('Текст выноски')
    const short = await editorRect()
    expect(short.width / short.scale).toBeGreaterThan(24)
    expect(left ? short.left + short.width : short.left).toBeCloseTo(points.end.x + (left ? -8 : 8) * short.scale, 0)
    await browser.keys(' длинная подпись '.repeat(12))
    const long = await editorRect()
    expect(long.width / long.scale).toBeCloseTo(480, 0)
    expect(long.breaks).toBeGreaterThan(0)
    await browser.saveScreenshot(path.resolve(artifacts, `callout-${left ? 'left' : 'right'}-inline.png`))
    await browser.keys(['Control', 'Enter'])
    await browser.waitUntil(async () => (await snapshot()).layers.length === before + 1)
    expect(await versionToken()).toBe(token + 1)
    const layer = (await snapshot()).layers.at(-1)!
    const payload = layer.payload as CalloutPayload
    expect(payload.content).toMatchObject({ wrap: 'fixedWidth', fixedWidth: 480 })
    await browser.action('pointer').move({ origin: 'viewport', x: Math.round(long.left + long.width / 2), y: Math.round(long.top + 8) })
      .down({ button: 'left' }).up({ button: 'left' }).down({ button: 'left' }).up({ button: 'left' }).perform()
    await expect(editor).toExist()
    const reopened = await editorRect()
    expect(reopened.left).toBeCloseTo(long.left, 0)
    expect(reopened.top).toBeCloseTo(long.top, 0)
    expect(reopened.height).toBeCloseTo(long.height, 0)
    const widthInput = $('.cs-callout-width-control input')
    await widthInput.click()
    await expect(widthInput).toBeFocused()
    await setNumericInput(widthInput, '800')
    await browser.keys('Escape')
    await expect(editor).toExist()
    expect((await editorRect()).width / long.scale).toBeCloseTo(480, 0)
    await setNumericInput(widthInput, '720')
    await browser.keys('Enter')
    expect((await editorRect()).width / long.scale).toBeCloseTo(720, 0)
    expect(await versionToken()).toBe(token + 1)
    await editor.click()
    await browser.keys(['Control', 'Enter'])
    await expect(editor).not.toExist()
    const changed = (await snapshot()).layers.at(-1)!
    expect((changed.payload as CalloutPayload).content.fixedWidth).toBe(720)
    const world = (value: typeof layer, key: 'target' | 'label') => {
      const p = (value.payload as CalloutPayload)[key]
      return { x: value.transform.translateX + p.x, y: value.transform.translateY + p.y }
    }
    expect(world(changed, 'target')).toEqual(world(layer, 'target'))
    expect(world(changed, 'label')).toEqual(world(layer, 'label'))
    const handle = world(changed, 'label')
    const scene = await browser.execute(() => {
      const r = document.querySelector<HTMLElement>('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
      return { left: r.left, top: r.top, scale: r.width / 2560 }
    })
    const x = scene.left + (handle.x + (left ? -728 : 728)) * scene.scale
    const y = scene.top + handle.y * scene.scale
    await browser.action('pointer').move({ origin: 'viewport', x: Math.round(x), y: Math.round(y) }).down({ button: 'left' })
      .move({ origin: 'viewport', x: Math.round(x + (left ? 100 : -100)), y: Math.round(y), duration: 150 })
      .up({ button: 'left' }).perform()
    const resized = (await snapshot()).layers.at(-1)!
    expect((resized.payload as CalloutPayload).content.fixedWidth).toBeLessThan(720)
    expect(world(resized, 'label')).toEqual(world(layer, 'label'))
    await browser.keys(['Control', 'z'])
    expect((await snapshot()).layers.at(-1)).toEqual(changed)
    await browser.keys(['Control', 'Shift', 'z'])
    expect((await snapshot()).layers.at(-1)).toEqual(resized)
    await browser.saveScreenshot(path.resolve(artifacts, `callout-${left ? 'left' : 'right'}-resized.png`))
  }
}
