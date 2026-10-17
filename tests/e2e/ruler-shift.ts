import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import type {
  EditorDocumentV1,
  Point,
  RulerLayer,
} from '../../packages/editor-core/src'
import { waitForStableCanvas } from './canvas-ready'

async function snapshot(): Promise<EditorDocumentV1> {
  return browser.execute(() => {
    const state = window as typeof window & {
      __cuteScreenE2eQuick?: { snapshot(): EditorDocumentV1 }
      __cuteScreenE2eM05?: { snapshot(): EditorDocumentV1 }
      __cuteScreenE2eM08?: { snapshot(): { document: EditorDocumentV1 } }
    }
    const result = state.__cuteScreenE2eQuick?.snapshot() ?? state.__cuteScreenE2eM05?.snapshot()
      ?? state.__cuteScreenE2eM08?.snapshot().document
    if (!result) throw new Error('Ruler workspace is not ready')
    return result
  })
}

function lastRuler(document: EditorDocumentV1): RulerLayer {
  const result = document.layers.at(-1)
  if (result?.kind !== 'ruler') throw new Error('Expected a ruler')
  return result
}

function checkAngle(
  ruler: RulerLayer,
  angle: number,
): void {
  const { start, end } = ruler.payload
  const degrees = Math.atan2(end.y - start.y, end.x - start.x) * 180 / Math.PI
  expect(degrees).toBeCloseTo(angle, 6)
}

async function overlayChecksum(): Promise<number> {
  return browser.execute(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.cs-canvas-overlay')!
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    return data.reduce((sum, value, index) => (sum + value * (index % 31 + 1)) % 2147483647, 0)
  })
}

async function key(
  value: string,
  pressed: boolean,
): Promise<void> {
  await browser.performActions([{ type: 'key', id: 'ruler-shift-key', actions: [
    { type: pressed ? 'keyDown' : 'keyUp', value },
  ] }])
}

async function pointer(
  from: Point,
  to: Point,
): Promise<void> {
  await browser.waitUntil(() => browser.execute(({ x, y }) => document.elementFromPoint(x, y)?.tagName === 'CANVAS', from),
    { timeoutMsg: 'Ruler pointer start is covered by a floating control' })
  await browser.performActions([{ type: 'pointer', id: 'ruler-shift-pointer', parameters: { pointerType: 'mouse' }, actions: [
    { type: 'pointerMove', origin: 'viewport', ...from, duration: 0 },
    { type: 'pointerDown', button: 0 },
    { type: 'pointerMove', origin: 'viewport', ...to, duration: 120 },
  ] }])
}

async function release(): Promise<void> {
  await browser.performActions([{ type: 'pointer', id: 'ruler-shift-pointer', parameters: { pointerType: 'mouse' }, actions: [
    { type: 'pointerUp', button: 0 },
  ] }])
  await key('\uE008', false)
  await key('\uE050', false)
  await browser.releaseActions()
}

export async function verifyRulerShift(prefix: string): Promise<void> {
  await browser.releaseActions()
  await browser.execute(() => {
    const trace: unknown[] = []
    for (const type of ['keydown', 'keyup', 'blur', 'pointerdown']) window.addEventListener(type, (event) => {
      const key = event as KeyboardEvent
      trace.push({ type, key: key.key, code: key.code, shift: key.shiftKey, prevented: event.defaultPrevented,
        target: (event.target as HTMLElement)?.tagName })
      document.documentElement.dataset.rulerInputTrace = JSON.stringify(trace)
    }, true)
  })
  const initial = (await snapshot()).layers.length
  let cancelOrigin = { x: 0, y: 0 }
  for (const [index, shift] of ['\uE008', '\uE050'].entries()) {
    await $('button[aria-label="Ruler"]').click()
    await expect($('button[aria-label="Ruler"]')).toHaveAttribute('aria-pressed', 'true')
    await waitForStableCanvas()
    const origin = await browser.execute((row) => {
      const canvas = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!
      const rect = canvas.getBoundingClientRect()
      const viewport = document.querySelector('.cs-viewport')!.getBoundingClientRect()
      const left = Math.max(rect.left, viewport.left)
      const top = Math.max(rect.top, viewport.top + 60)
      const right = Math.min(rect.right, viewport.right)
      const bottom = Math.min(rect.bottom, viewport.bottom - 140)
      document.addEventListener('pointerdown', (event) => {
        document.documentElement.dataset.rulerShiftTrusted = String(event.isTrusted)
      }, { capture: true, once: true })
      return { x: Math.round(left + (right - left) * .2),
        y: Math.round(top + (bottom - top) * (.2 + row * .3)) }
    }, index)
    cancelOrigin = origin
    const end = { x: origin.x + 100, y: origin.y + (index ? 65 : 15) }
    if (!index) await key(shift, true)
    await pointer(origin, end)
    if (index) {
      const before = await overlayChecksum()
      await key(shift, true)
      await browser.waitUntil(async () => await overlayChecksum() !== before,
        { timeoutMsg: 'Shift must update ruler preview without moving the pointer' })
      const snapped = await overlayChecksum()
      await key(shift, false)
      await browser.waitUntil(async () => await overlayChecksum() !== snapped,
        { timeoutMsg: 'Releasing Shift must restore the raw endpoint without movement' })
      await key(shift, true)
    }
    expect((await snapshot()).layers.length).toBe(initial + index)
    await release()
    await browser.waitUntil(async () => (await snapshot()).layers.length === initial + index + 1)
    checkAngle(lastRuler(await snapshot()), index ? 45 : 0)
    expect(await $('html').getAttribute('data-ruler-shift-trusted')).toBe('true')
  }
  await browser.saveScreenshot(`${prefix}-45.png`)
  await $('button[aria-label="Select"]').click()
  await waitForStableCanvas()
  const beforeResize = await snapshot()
  const ruler = lastRuler(beforeResize)
  const dimensions = beforeResize.crop ?? { x: 0, y: 0, ...beforeResize.canvas }
  const scene = await browser.execute(() => {
    const rect = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
  })
  const documentEnd = { x: ruler.transform.translateX + ruler.payload.end.x - dimensions.x,
    y: ruler.transform.translateY + ruler.payload.end.y - dimensions.y }
  const end = { x: Math.round(scene.x + documentEnd.x * scene.width / dimensions.width),
    y: Math.round(scene.y + documentEnd.y * scene.height / dimensions.height) }
  await key('\uE050', true)
  await pointer(end, { x: end.x + 35, y: end.y - 45 })
  await release()
  await browser.waitUntil(async () => JSON.stringify(await snapshot()) !== JSON.stringify(beforeResize))
  const resized = await snapshot()
  expect(resized.layers).toHaveLength(beforeResize.layers.length)
  expect(lastRuler(resized).id).toBe(ruler.id)
  expect(lastRuler(resized).transform.translateX + lastRuler(resized).payload.start.x)
    .toBeCloseTo(ruler.transform.translateX + ruler.payload.start.x, 6)
  expect(lastRuler(resized).transform.translateY + lastRuler(resized).payload.start.y)
    .toBeCloseTo(ruler.transform.translateY + ruler.payload.start.y, 6)
  checkAngle(lastRuler(resized), 0)
  await $('button[aria-label="Undo"]').click()
  expect((await snapshot()).layers).toEqual(beforeResize.layers)
  await $('button[aria-label="Redo"]').click()
  expect((await snapshot()).layers).toEqual(resized.layers)
  await $('button[aria-label="Ruler"]').click()
  await waitForStableCanvas()
  cancelOrigin = { x: cancelOrigin.x + 180, y: cancelOrigin.y + 70 }
  await key('\uE008', true)
  await pointer(cancelOrigin, { x: cancelOrigin.x + 80, y: cancelOrigin.y + 10 })
  await key('\uE00C', true)
  await key('\uE00C', false)
  await release()
  expect((await snapshot()).layers).toEqual(resized.layers)
  await expect($('button[aria-label="Ruler"]')).toHaveAttribute('aria-pressed', 'true')
  await browser.saveScreenshot(`${prefix}.png`)
}
