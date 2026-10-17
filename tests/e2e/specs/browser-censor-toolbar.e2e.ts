import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import {
  drawPrecisionTool,
  m08Snapshot,
  m08VersionToken,
  openM08,
} from './browser-m08-test-kit'
import { verifyCensorCreationShape } from '../censor-creation-shape'
import { setNumericInput } from '../numeric-input'
import { setShellPreferences } from './browser-m06-test-kit'

const evidence = path.resolve('artifacts/censor-toolbar')

async function assertFits(): Promise<void> {
  expect(await browser.execute(() => {
    const toolbar = document.querySelector<HTMLElement>('.cs-censor-toolbar')!
    const buttons = [...toolbar.querySelectorAll<HTMLElement>('button')]
    const panels = [...document.querySelectorAll<HTMLElement>('.cs-censor-popover')]
    const fits = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect()
      return (
        rect.left >= 0 &&
        rect.top >= 0 &&
        rect.right <= innerWidth &&
        rect.bottom <= innerHeight &&
        element.scrollWidth <= element.clientWidth
      )
    }
    return buttons.every(fits) && panels.every(fits)
  })).toBe(true)
}

describe('censor formatting toolbar', () => {
  before(async () => mkdir(evidence, { recursive: true }))

  for (const dpr of [1, 2]) {
    for (const width of [1024, 1440]) {
      it(`keeps all effects and settings legible in RU/EN and both themes at ${width}px DPR ${dpr}`, async () => {
        await openM08()
        await browser.setViewport({ width, height: width === 1024 ? 700 : 900, devicePixelRatio: dpr })
        for (const locale of ['en', 'ru'] as const) {
          for (const theme of ['light', 'dark'] as const) {
            await setShellPreferences(locale, theme)
            await $(`button[aria-label="${locale === 'ru' ? 'Скрыть данные' : 'Hide data'}"]`).click({ button: 'right' })
            const toolbar = $('.cs-censor-toolbar')
            expect((await toolbar.$$('.cs-censor-effect')).length).toBe(3)
            await assertFits()
            const prefix = `${locale}-${theme}-${width}-dpr${dpr}`
            await toolbar.saveScreenshot(path.join(evidence, `${prefix}-toolbar.png`))
            await toolbar.$(`button[aria-label="${locale === 'ru' ? 'Размер пикселей' : 'Pixel size'}"]`).click()
            await expect($('.cs-censor-popover')).toBeDisplayed()
            await assertFits()
            await browser.saveScreenshot(path.join(evidence, `${prefix}-presets.png`))
            await browser.keys('Escape')
            await expect(toolbar.$('.cs-censor-parameter')).toBeFocused()
          }
        }
      })
    }
  }

  for (const locale of ['en', 'ru'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      it(`chooses shapes only before pointer creation in ${locale}/${theme}`, async function () {
        this.timeout(120000)
        await browser.setViewport({ width: 1024, height: 700, devicePixelRatio: 1 })
        await openM08()
        await setShellPreferences(locale, theme)
        await verifyCensorCreationShape(path.join(evidence, `creation-only-${locale}-${theme}`), locale)
      })
    }
  }

  it('creates a region, edits presets/exact values/colour and preserves undo, cancel and Select reachability', async () => {
    await browser.setViewport({ width: 1024, height: 700, devicePixelRatio: 1 })
    await openM08()
    await drawPrecisionTool('Hide data', 'censor', 0)
    await expect($('.cs-selection-floating-toolbar .cs-censor-toolbar')).toBeDisplayed()
    const original = (await m08Snapshot()).document.layers.at(-1)!
    const version = await m08VersionToken()
    await $('.cs-censor-parameter').click()
    await expect($('.cs-censor-popover button[aria-label="12 px"]')).toBeFocused()
    await browser.keys(['Tab'])
    await expect($('.cs-censor-popover button[aria-label="24 px"]')).toBeFocused()
    await browser.keys('Enter')
    await browser.waitUntil(async () => (await m08VersionToken()) === version + 1)
    await expect($('.cs-censor-popover')).toBeDisplayed()
    await expect($('.cs-censor-popover button[aria-label="24 px"]')).toHaveAttribute('aria-pressed', 'true')
    const input = $('.cs-censor-popover input[aria-label="Pixel size"]')
    await setNumericInput(input, '17')
    await browser.keys('Escape')
    expect(await m08VersionToken()).toBe(version + 1)
    await expect($('.cs-censor-parameter')).toHaveText('Pixels: 24 px')
    await expect($('.cs-censor-popover')).not.toExist()
    await $('.cs-censor-parameter').click()
    const exact = $('.cs-censor-popover input[aria-label="Pixel size"]')
    await setNumericInput(exact, '17')
    await expect(exact).toHaveValue('17')
    await expect(exact).toBeFocused()
    await browser.keys('Enter')
    await browser.waitUntil(async () => (await m08VersionToken()) === version + 2)
    await browser.keys('Escape')
    await expect($('.cs-censor-parameter')).toHaveText('Pixels: 17 px')
    await $('button[aria-label="Undo"]').click()
    await expect($('.cs-censor-parameter')).toHaveText('Pixels: 24 px')
    await $('button[aria-label="Redo"]').click()
    await expect($('.cs-censor-parameter')).toHaveText('Pixels: 17 px')
    await $('.cs-censor-effect[aria-label="Blur"]').click()
    await $('.cs-censor-parameter').click()
    await $('.cs-censor-popover button[aria-label="24"]').click()
    await browser.keys('Escape')
    await expect($('.cs-censor-parameter')).toHaveText('Strength: 24')
    await $('.cs-censor-effect[aria-label="Solid fill"]').click()
    await $('.cs-censor-parameter').click()
    await $('.cs-censor-popover button[aria-label="Red"]').click()
    await browser.keys('Escape')
    expect((await m08Snapshot()).document.layers.at(-1)).toMatchObject({
      id: original.id, localBounds: original.localBounds,
      payload: { effect: { mode: 'solid', color: { alpha: 1 } } },
    })
    await browser.saveScreenshot(path.join(evidence, 'selected-solid.png'))
    await $('button[aria-label="Hide data"]').click({ button: 'right' })
    await expect($('.cs-tool-defaults-toolbar .cs-censor-toolbar')).toBeDisplayed()
    await browser.keys('Escape')
    await $('button[aria-label="Select"]').click()
    await expect($('button[aria-label="Select"]')).toHaveAttribute('aria-pressed', 'true')
    await expect($('.cs-tool-configure-popover-host')).not.toExist()
  })
})
