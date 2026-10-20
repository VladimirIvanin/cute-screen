import { Key } from 'webdriverio'
import { writeFile } from 'node:fs/promises'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import type { EditorDocumentV1 } from '../../packages/editor-core/src/document/types'
import { setNumericInput } from './numeric-input'
import { waitForStableCanvas } from './canvas-ready'
import { numericSceneChecksum } from './numeric-keyboard'

async function snapshot(): Promise<EditorDocumentV1> {
  return browser.execute(() => {
    const state = window as typeof window & {
      __cuteScreenE2eM05?: { snapshot(): EditorDocumentV1 }
      __cuteScreenE2eM08?: { snapshot(): { document: EditorDocumentV1 } }
    }
    return state.__cuteScreenE2eM05?.snapshot() ?? state.__cuteScreenE2eM08!.snapshot().document
  })
}

export async function verifyNumericAppearance(
  directory: string,
  locale: 'en' | 'ru' = 'en',
): Promise<void> {
  await $(`button[aria-label="${locale === 'ru' ? 'Оформление' : 'Appearance'}"]`).click()
  const panel = $('.cs-composition-panel')
  const input = panel.$(`input[aria-label="${locale === 'ru' ? 'Все стороны' : 'All sides'}"]`)
  await expect(input).toBeDisplayed()
  const before = await snapshot()
  const start = Number(await input.getValue())
  const originalPixels = await numericSceneChecksum()
  await input.click()
  await browser.action('key', { id: 'appearance-number' }).down(Key.ArrowUp).perform(true)
  await expect(input).toHaveValue(String(start + 1))
  expect(await snapshot()).toEqual(before)
  await browser.waitUntil(async () => await numericSceneChecksum() !== originalPixels)
  await browser.saveScreenshot(`${directory}/numeric-appearance-held.png`)
  await browser.action('key', { id: 'appearance-number' }).up(Key.ArrowUp).perform(true)
  await browser.waitUntil(async () => (await snapshot()).presentation.composition?.layout.insets.top === start + 1)
  await $(`button[aria-label="${locale === 'ru' ? 'Отменить' : 'Undo'}"]`).click()
  expect(await snapshot()).toEqual(before)
  await $(`button[aria-label="${locale === 'ru' ? 'Повторить' : 'Redo'}"]`).click()
  const committed = await snapshot()
  await browser.execute(() => {
    const trace: unknown[] = []
    const controller = new AbortController()
    const state = window as typeof window & {
      __appearanceNumericTrace?: { trace: unknown[]; controller: AbortController }
    }
    state.__appearanceNumericTrace = { trace, controller }
    for (const type of ['keydown', 'keyup', 'input', 'change', 'blur', 'focus']) {
      document.addEventListener(type, (event) => {
        queueMicrotask(() => trace.push({ type, key: event instanceof KeyboardEvent ? event.key : '',
          prevented: event.defaultPrevented, trusted: event.isTrusted,
          value: event.target instanceof HTMLInputElement ? event.target.value : '',
          active: document.activeElement?.outerHTML.slice(0, 300) }))
      }, { capture: true, signal: controller.signal })
    }
  })
  await setNumericInput(input, '24')
  expect(await snapshot()).toEqual(committed)
  await browser.keys('Escape')
  const trace = await browser.execute(() => {
    const state = window as typeof window & {
      __appearanceNumericTrace: { trace: unknown[]; controller: AbortController }
    }
    state.__appearanceNumericTrace.controller.abort()
    return state.__appearanceNumericTrace.trace
  })
  const evidence = { trace, committed, after: await snapshot() }
  await writeFile(`${directory}/numeric-appearance-events-${locale}.json`, JSON.stringify(evidence, null, 2))
  await expect(panel).toBeDisplayed()
  await expect(input).toHaveValue(String(start + 1))
  expect(await snapshot()).toEqual(committed)
  await setNumericInput(input, '-')
  await browser.keys('Tab')
  await expect(input).toHaveValue(String(start + 1))
  expect(await snapshot()).toEqual(committed)
  await input.click()
  await browser.action('wheel').scroll({ origin: await input.getElement(), x: 4, y: 4,
    deltaY: 250, deltaX: 0, duration: 100 }).perform()
  expect(await snapshot()).toEqual(committed)
  await panel.$('header strong').click()
  await browser.action('wheel').scroll({ origin: await $('.cs-composition-body').getElement(),
    x: 0, y: 0, deltaY: -2000, deltaX: 0, duration: 100 }).perform()
  await panel.$(`button[aria-label="${locale === 'ru' ? 'Закрыть оформление' : 'Close appearance'}"]`).click()
  await waitForStableCanvas()
}
