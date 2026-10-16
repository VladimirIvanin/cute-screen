import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import path from 'node:path'
import { waitForStableCanvas } from './canvas-ready'

async function layerKinds(): Promise<string[]> {
  return browser.execute(() => {
    const state = window as typeof window & {
      __cuteScreenE2eQuick?: { snapshot(): { layers: { kind: string }[] } | undefined }
      __cuteScreenE2eM08?: { snapshot(): { document: { layers: { kind: string }[] } } | undefined }
    }
    const snapshot = state.__cuteScreenE2eQuick?.snapshot() ?? state.__cuteScreenE2eM08?.snapshot()?.document
    if (!snapshot) throw new Error('Production document has not mounted')
    return snapshot.layers.map((layer) => layer.kind)
  })
}

export async function verifyIconTools(
  locale: 'en' | 'ru',
  screenshot: string,
): Promise<void> {
  const labels = locale === 'ru'
    ? { pencil: 'Карандаш', marker: 'Выделитель', eyedropper: 'Пипетка', select: 'Выбор', undo: 'Отменить', redo: 'Повторить' }
    : { pencil: 'Pencil', marker: 'Highlighter', eyedropper: 'Eyedropper', select: 'Select', undo: 'Undo', redo: 'Redo' }
  await waitForStableCanvas()
  await browser.execute(() => {
    document.addEventListener('keydown', (event) => {
      document.documentElement.dataset.iconKeyTrusted = String(event.isTrusted)
    }, { once: true, capture: true })
  })
  await browser.keys('i')
  await expect($(`button[aria-label="${labels.eyedropper}"]`)).toHaveAttribute('aria-pressed', 'true')
  await browser.keys('Enter')
  await expect($('.cs-eyedropper-feedback')).toHaveText(expect.stringContaining('#7F7F7F'))
  expect(await $('html').getAttribute('data-icon-key-trusted')).toBe('true')
  for (const [key, kind, offset] of [['p', 'pencil', -22], ['m', 'marker', 22]] as const) {
    const before = (await layerKinds()).length
    await browser.keys(key)
    await expect($(`button[aria-label="${labels[kind]}"]`)).toHaveAttribute('aria-pressed', 'true')
    // The production action returns keyboard focus to the scene canvas.
    expect(await browser.execute(() => document.activeElement?.getAttribute('aria-label'))).toBe('Scene canvas')
    await waitForStableCanvas()
    const point = await browser.execute((yOffset) => {
      const bounds = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
      return {
        x: Math.round(bounds.left + bounds.width * 0.35),
        y: Math.round(bounds.top + bounds.height * 0.5 + yOffset),
        endX: Math.round(bounds.left + bounds.width * 0.65),
      }
    }, offset)
    await browser.action('pointer')
      .move({ origin: 'viewport', x: point.x, y: point.y })
      .down({ button: 'left' })
      .move({ origin: 'viewport', x: point.endX, y: point.y, duration: 160 })
      .up({ button: 'left' }).perform()
    await browser.waitUntil(async () => (await layerKinds()).length === before + 1, { timeoutMsg: `${kind} stroke did not commit` })
    expect((await layerKinds()).at(-1)).toBe(kind)
    await expect($(`button[aria-label="${labels[kind]}"]`)).toHaveAttribute('aria-pressed', 'true')
  }
  const drawn = await layerKinds()
  await $(`button[aria-label="${labels.undo}"]`).click()
  await browser.waitUntil(async () => (await layerKinds()).length === drawn.length - 1)
  await $(`button[aria-label="${labels.redo}"]`).click()
  await browser.waitUntil(async () => (await layerKinds()).length === drawn.length)
  const spotlight = $(`button[aria-label="${locale === 'ru' ? 'Фонарь' : 'Spotlight'}"]`)
  await spotlight.click()
  await expect(spotlight).toHaveAttribute('aria-pressed', 'true')
  await expect(spotlight.$('svg')).toHaveElementClass('cs-icon-spotlight')
  const censor = $(`button[aria-label="${locale === 'ru' ? 'Скрыть данные' : 'Hide data'}"]`)
  await censor.click()
  await expect(censor).toHaveAttribute('aria-pressed', 'true')
  await expect(censor.$('svg')).toHaveElementClass('cs-icon-privacy')
  await browser.keys('l')
  const loupe = $(`button[aria-label="${locale === 'ru' ? 'Лупа' : 'Loupe'}"]`)
  await expect(loupe).toHaveAttribute('aria-pressed', 'true')
  await expect(loupe.$('svg')).toHaveElementClass('cs-icon-loupe')
  await browser.saveScreenshot(path.resolve(screenshot))
  await browser.keys('v')
  await expect($(`button[aria-label="${labels.select}"]`)).toHaveAttribute('aria-pressed', 'true')
}
