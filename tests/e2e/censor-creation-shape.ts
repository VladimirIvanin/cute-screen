import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import type { EditorDocumentV1 } from '../../packages/editor-core/src'
import { writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { waitForStableCanvas } from './canvas-ready'

const executeFile = promisify(execFile)

export class CensorPointerInputUnavailable extends Error {
  constructor(tracePath: string) {
    super(`The input backend did not deliver pointerdown; native drawing remains unverified. Trace: ${tracePath}`)
    this.name = 'CensorPointerInputUnavailable'
  }
}

async function draw(points: readonly { x: number; y: number }[]): Promise<void> {
  if (process.env.CUTE_SCREEN_E2E_CONTEXT_INPUT === 'x11') {
    const focused = (await executeFile('xdotool', ['getactivewindow'])).stdout.trim()
    await executeFile('xdotool', ['mouseup', '1', 'mouseup', '2', 'mouseup', '3'], { timeout: 5000 })
    const move = ({ x, y }: { x: number; y: number }) => [
      'mousemove', '--sync', '--window', focused, String(x), String(y),
    ]
    const actions = [...move(points[0]!), 'mousedown', '1', 'sleep', '0.1']
    for (const point of points.slice(1)) actions.push(...move(point), 'sleep', '0.1')
    try {
      await executeFile('xdotool', actions, { timeout: 5000 })
    } finally {
      await executeFile('xdotool', ['mouseup', '1'], { timeout: 5000 })
    }
    return
  }
  const pointer = browser.action('pointer', { id: 'censor-creation' })
    .move({ origin: 'viewport', ...points[0]! }).down({ button: 'left' })
  for (const point of points.slice(1)) pointer.move({ origin: 'viewport', ...point, duration: 100 })
  await pointer.up({ button: 'left' }).perform()
  await browser.releaseActions()
}

async function snapshot(): Promise<EditorDocumentV1> {
  return browser.execute(() => {
    const state = window as typeof window & {
      __cuteScreenE2eQuick?: { snapshot(): EditorDocumentV1 }
      __cuteScreenE2eM05?: { snapshot(): EditorDocumentV1 }
      __cuteScreenE2eM08?: { snapshot(): { document: EditorDocumentV1 } }
    }
    const result = state.__cuteScreenE2eQuick?.snapshot() ?? state.__cuteScreenE2eM05?.snapshot()
      ?? state.__cuteScreenE2eM08?.snapshot().document
    if (!result) throw new Error('Censor workspace is not ready')
    return result
  })
}

export async function verifyCensorCreationShape(
  prefix: string,
  locale: 'en' | 'ru' = 'en',
): Promise<void> {
  const text = (en: string, ru: string) => locale === 'ru' ? ru : en
  const tool = $(`.cs-toolrail button[aria-label="${text('Hide data', 'Скрыть данные')}"]`)
  const initial = (await snapshot()).layers.length
  for (const [index, kind] of ['rectangle', 'freeform'].entries()) {
    const before = await snapshot()
    await tool.click()
    await expect(tool).toHaveAttribute('aria-pressed', 'true')
    let settings = $('.cs-tool-defaults-toolbar:not(.is-collapsed) .cs-censor-toolbar')
    const fallback = $('.cs-quick-settings-button')
    if (await fallback.isDisplayed()) {
      await fallback.click()
      settings = $('.cs-tool-configure-popover-host .cs-censor-toolbar')
    }
    const trigger = settings.$('.cs-censor-region')
    await expect(trigger).toBeDisplayed()
    await trigger.click()
    await expect($('.cs-censor-popover[role="dialog"]')).toBeDisplayed()
    await browser.keys('Escape')
    await expect(trigger).toBeFocused()
    await browser.keys('Enter')
    const choice = kind === 'rectangle' ? text('Rectangle', 'Прямоугольник') : text('Freeform outline', 'Свободный контур')
    await $(`.cs-censor-region-choice[aria-label="${choice}"]`).click()
    await expect(trigger).toBeFocused()
    expect((await snapshot()).layers).toEqual(before.layers)
    await settings.$(`.cs-censor-effect[aria-label="${text('Pixelate', 'Мозаика')}"]`).click()
    if (await $('.cs-tool-configure-popover-host').isDisplayed()) await browser.keys('Escape')
    await waitForStableCanvas()
    const from = await browser.execute((row) => {
      const rect = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
      const viewport = document.querySelector('.cs-viewport')!.getBoundingClientRect()
      const left = Math.max(rect.left, viewport.left)
      const right = Math.min(rect.right, viewport.right)
      const top = Math.max(rect.top, viewport.top + 35)
      const bottom = Math.min(rect.bottom, viewport.bottom - 150)
      document.addEventListener('pointerdown', (event) => {
        document.documentElement.dataset.censorPointerTrusted = String(event.isTrusted)
      }, { capture: true, once: true })
      const events: unknown[] = []
      for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup']) {
        document.addEventListener(type, (event) => {
          const pointer = event as MouseEvent
          events.push({ type, trusted: event.isTrusted, x: pointer.clientX, y: pointer.clientY,
            target: (event.target as Element)?.tagName })
          document.documentElement.dataset.censorInputTrace = JSON.stringify(events)
        }, { capture: true })
      }
      return { x: Math.round(left + (right - left) * (.2 + row * .35)), y: Math.round(top + (bottom - top) * .4) }
    }, index)
    expect(await browser.execute(({ x, y }) => document.elementFromPoint(x, y)?.tagName, from)).toBe('CANVAS')
    const points = [from, { x: from.x + 85, y: from.y + (kind === 'rectangle' ? 55 : 12) }]
    if (kind === 'freeform') {
      points.push({ x: from.x + 45, y: from.y + 65 }, { x: from.x + 5, y: from.y + 4 })
    }
    await draw(points)
    const input = await browser.execute(() => ({
      focus: document.hasFocus(),
      events: document.documentElement.dataset.censorInputTrace,
    }))
    await writeFile(`${prefix}-${kind}-input.json`, JSON.stringify(input, null, 2))
    if (!input.events?.includes('"type":"pointerdown"')) {
      throw new CensorPointerInputUnavailable(`${prefix}-${kind}-input.json`)
    }
    await browser.waitUntil(async () => (await snapshot()).layers.length === initial + index + 1, {
      timeoutMsg: `Pointer creation must add one ${kind} censor`,
    })
    expect(await $('html').getAttribute('data-censor-pointer-trusted')).toBe('true')
    const drawn = await snapshot()
    const layer = drawn.layers.at(-1)!
    if (layer.kind !== 'censor') throw new Error('Expected a created censor layer')
    expect(layer.payload.region.kind).toBe(kind)
    if (layer.payload.region.kind === 'freeform') expect(layer.payload.region.points.length).toBeGreaterThanOrEqual(3)
    await expect($('.cs-selection-floating-toolbar .cs-censor-toolbar')).toBeDisplayed()
    await expect($('.cs-censor-region')).not.toExist()
    await expect($('.cs-censor-region-choice')).not.toExist()
    await $(`.cs-censor-effect[aria-label="${text('Blur', 'Размытие')}"]`).click()
    const edited = await snapshot()
    expect(edited.layers.at(-1)).toMatchObject({ payload: { region: layer.payload.region, effect: { mode: 'blur' } } })
    await expect($(`.cs-censor-parameter[aria-label="${text('Blur strength', 'Сила размытия')}"]`)).toBeEnabled()
    await $(`button[aria-label="${text('Undo', 'Отменить')}"]`).click()
    expect((await snapshot()).layers).toEqual(drawn.layers)
    await $(`button[aria-label="${text('Redo', 'Повторить')}"]`).click()
    expect((await snapshot()).layers).toEqual(edited.layers)
    expect(edited.layers.slice(0, -1)).toEqual(before.layers)
    expect(await browser.execute(() => {
      const toolbar = document.querySelector<HTMLElement>('.cs-censor-toolbar')!
      const rect = toolbar.getBoundingClientRect()
      return (
        rect.left >= 0 &&
        rect.right <= innerWidth &&
        rect.top >= 0 &&
        rect.bottom <= innerHeight &&
        toolbar.scrollWidth <= toolbar.clientWidth
      )
    })).toBe(true)
    await browser.saveScreenshot(`${prefix}-${kind}.png`)
  }
}
