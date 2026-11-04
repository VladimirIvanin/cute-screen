import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { openDrawingHarness } from './browser-m06-test-kit'
import { setEditorPreferences } from '../editor-settings'
import { setNumericInput } from '../numeric-input'
import type { EditorDocumentV1 } from '../../../packages/editor-core/src/document/types'

async function snapshot() {
  return browser.execute(() => (window as typeof window & {
    __cuteScreenE2eM05: { snapshot(): EditorDocumentV1 }
  }).__cuteScreenE2eM05.snapshot().presentation.composition)
}
async function expectCanvasFits(): Promise<void> {
  await browser.waitUntil(() => browser.execute(() => {
    const canvas = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
    const viewport = document.querySelector('.cs-canvas-scroll')!.getBoundingClientRect()
    return canvas.width > 0 && canvas.left >= viewport.left - 1 && canvas.top >= viewport.top - 1
      && canvas.right <= viewport.right + 1 && canvas.bottom <= viewport.bottom + 1
  }), { timeoutMsg: 'Fixed output must fit entirely inside the visible canvas viewport' })
}
describe('understandable screenshot size and corners', () => {
  it('shows visual samples, commits one change and explains fixed phone corners', async () => {
    await browser.setWindowSize(1024, 768)
    await openDrawingHarness(true, true)
    const chrome = await browser.execute(() => ({ width: window.outerWidth - window.innerWidth,
      height: window.outerHeight - window.innerHeight }))
    await browser.setWindowSize(1024 + chrome.width, 768 + chrome.height)
    await $('button[aria-label="Appearance"]').click()
    const panel = $('.cs-composition-panel')
    const size = panel.$('[data-composition-scale] input')
    await size.scrollIntoView({ block: 'center' })
    await setNumericInput(size, '99')
    expect(await snapshot()).toBeUndefined()
    await panel.$('[data-composition-scale]').$('button=75%').click()
    expect((await snapshot())!.layout.scale).toBe(0.75)
    await $('button[aria-label="Undo"]').click()
    expect(await snapshot()).toBeUndefined()
    await $('button[aria-label="Redo"]').click()
    expect((await snapshot())!.layout.scale).toBe(0.75)
    await panel.$('[data-composition-radius]').$('button=Round').click()
    expect((await snapshot())!.radius).toBe(40)
    await $('button[aria-label="Undo"]').click()
    expect((await snapshot())!.radius).toBe(0)
    await $('button[aria-label="Redo"]').click()
    for (const locale of ['ru', 'en'] as const) for (const theme of ['dark', 'light'] as const) {
      await setEditorPreferences(locale, theme)
      await panel.$('.cs-screenshot-style').scrollIntoView({ block: 'start' })
      await expect(size).toHaveAttribute('aria-label', locale === 'ru' ? 'Размер снимка' : 'Screenshot size')
      const fits = await browser.execute(() => {
        const root = document.querySelector('.cs-screenshot-style')!
        const bounds = root.getBoundingClientRect()
        return root.scrollWidth <= root.clientWidth && [...root.querySelectorAll('input, button')].every((control) => {
          const rect = control.getBoundingClientRect()
          return rect.left >= bounds.left && rect.right <= bounds.right
        })
      })
      expect(fits).toBe(true)
      await browser.saveScreenshot(`artifacts/browser-e2e/screenshot-style-${locale}-${theme}.png`)
    }
    await setEditorPreferences('en', 'dark')
    await panel.$('[data-composition-section="frame"]').click()
    await panel.$('input[value="phone"] + .cs-card-frame-choice').click()
    await panel.$('[data-composition-section="layout"]').click()
    await panel.$('.cs-fixed-corners').scrollIntoView({ block: 'center' })
    await expect(panel.$('[data-composition-radius] input')).not.toExist()
    await expect(panel.$('.cs-fixed-corners')).toHaveText(expect.stringContaining('Corners follow the phone model'))
    await $('.cs-zoom-value').click()
    await panel.$('[data-canvas-size="auto"]').click()
    await browser.keys('ArrowRight')
    await expect(panel.$('input[aria-label="Set size"]')).toBeChecked()
    await expectCanvasFits()
    const width = panel.$('input[aria-label="Width"]')
    await setNumericInput(width, '800')
    await browser.keys('Enter')
    await panel.$('.cs-canvas-ratios').$('button=16:9').click()
    expect((await snapshot())!.layout).toMatchObject({ mode: 'fixed', width: 800, height: 450 })
    await expectCanvasFits()
    await $('button[aria-label="Undo"]').click()
    await expect(panel.$('input[aria-label="Height"]')).toHaveValue('1080')
    await expectCanvasFits()
    await $('button[aria-label="Redo"]').click()
    await expect(panel.$('input[aria-label="Height"]')).toHaveValue('450')
    await expectCanvasFits()
    for (const locale of ['ru', 'en'] as const) for (const theme of ['dark', 'light'] as const) {
      await setEditorPreferences(locale, theme)
      await panel.$('.cs-canvas-size').scrollIntoView({ block: 'start' })
      const fit = await browser.execute(() => {
        const root = document.querySelector('.cs-canvas-size')!
        const bounds = root.getBoundingClientRect()
        return root.scrollWidth <= root.clientWidth && [...root.querySelectorAll('.cs-canvas-mode-choice, button')]
          .every((element) => {
            const rect = element.getBoundingClientRect()
            return rect.left >= bounds.left && rect.right <= bounds.right
          })
      })
      expect(fit).toBe(true)
      await browser.saveScreenshot(`artifacts/browser-e2e/canvas-size-${locale}-${theme}.png`)
    }
  }).timeout(120000)
})
