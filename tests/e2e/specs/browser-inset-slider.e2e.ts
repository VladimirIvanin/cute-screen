import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { openDrawingHarness } from './browser-m06-test-kit'
import { verifyInsetSlider } from '../inset-slider'
import { setEditorPreferences } from '../editor-settings'
import { setNumericInput } from '../numeric-input'
import type { EditorDocumentV1 } from '../../../packages/editor-core/src/document/types'
async function snapshot() {
  return browser.execute(() => (window as typeof window & {
    __cuteScreenE2eM05: { snapshot(): EditorDocumentV1 }
  }).__cuteScreenE2eM05.snapshot().presentation.composition)
}
describe('linked padding slider', () => {
  it('previews all sides while held and commits one undoable change', async () => {
    await browser.setWindowSize(1024, 768)
    await openDrawingHarness(true, true)
    const chrome = await browser.execute(() => ({ width: window.outerWidth - window.innerWidth,
      height: window.outerHeight - window.innerHeight }))
    await browser.setWindowSize(1024 + chrome.width, 768 + chrome.height)
    await $('button[aria-label="Appearance"]').click()
    await $('.cs-composition-panel [data-composition-section="background"]').click()
    await $('.cs-composition-panel').$('[data-card-fill="solid"]').click()
    await $('.cs-composition-panel [data-composition-section="layout"]').click()
    await $('.cs-card-insets').scrollIntoView({ block: 'start' })
    await verifyInsetSlider(snapshot, 'artifacts/browser-e2e')
    await setNumericInput($('.cs-card-linked-inset input'), '5')
    await browser.keys('Enter')
    const link = $('.cs-inset-link')
    await expect(link).toHaveAttribute('aria-pressed', 'true')
    await expect(link.$('.tabler-icon-link')).toExist()
    await link.click()
    await expect(link).toHaveAttribute('aria-pressed', 'false')
    await expect(link.$('.tabler-icon-unlink')).toExist()
    await browser.keys('Enter')
    await expect(link).toHaveAttribute('aria-pressed', 'true')
    await browser.keys('Enter')
    await expect(link).toHaveAttribute('aria-pressed', 'false')
    const independent = await snapshot()
    await $('[data-inset-side="left"]').click()
    expect(await snapshot()).toEqual(independent)
    const left = $('input[aria-label="Left"]')
    await expect(left).toBeFocused()
    await setNumericInput(left, '17')
    await $('[data-inset-side="right"]').click()
    expect(await snapshot()).toEqual(independent)
    await expect($('input[aria-label="Right"]')).toHaveValue('5')
    await $('[data-inset-side="left"]').click()
    await setNumericInput(left, '17')
    await browser.keys('Enter')
    expect((await snapshot())!.layout.insets).toMatchObject({ top: 5, left: 17, right: 5, bottom: 5 })
    await $('.cs-card-insets').scrollIntoView({ block: 'start' })
    await browser.saveScreenshot('artifacts/padding-link/unlinked.png')
    await browser.saveScreenshot('artifacts/browser-e2e/insets-independent.png')
    await $('button[aria-label="Undo"]').click()
    expect((await snapshot())!.layout.insets.left).toBe(5)
    await $('button[aria-label="Redo"]').click()
    expect((await snapshot())!.layout.insets.left).toBe(17)
    await link.click()
    expect((await snapshot())!.layout.insets).toMatchObject({ top: 5, left: 5, right: 5, bottom: 5, linked: true })
    for (const locale of ['ru', 'en'] as const) for (const theme of ['dark', 'light'] as const) {
      await setEditorPreferences(locale, theme)
      await $('.cs-card-insets').scrollIntoView({ block: 'start' })
      const geometry = await browser.execute(() => {
        const control = document.querySelector('.cs-card-linked-inset')!
        const rect = control.getBoundingClientRect()
        const number = control.querySelector('.cs-numeric-values')!.getBoundingClientRect()
        const rail = control.querySelector('.n-slider')!.getBoundingClientRect()
        return { height: rect.height, overflow: control.scrollWidth > control.clientWidth,
          numberY: number.y, sliderY: rail.y, sliderWidth: rail.width }
      })
      expect(geometry.overflow).toBe(false)
      expect(geometry.height).toBeLessThanOrEqual(68)
      expect(geometry.sliderWidth).toBeGreaterThanOrEqual(250)
      expect(geometry.sliderY - geometry.numberY).toBeGreaterThanOrEqual(32)
      const diagram = await browser.execute(() => {
        const root = document.querySelector('.cs-inset-diagram')!
        const center = root.querySelector('.cs-inset-center')!.getBoundingClientRect()
        const link = root.querySelector('.cs-inset-link')!.getBoundingClientRect()
        const side = (id: string) => root.querySelector(`[data-inset-side="${id}"]`)!.getBoundingClientRect()
        return { top: side('top').bottom <= center.top, bottom: side('bottom').top >= center.bottom,
          left: side('left').right <= center.left, right: side('right').left >= center.right,
          overflow: root.scrollWidth > root.clientWidth,
          compact: root.getBoundingClientRect().height <= 112,
          centered: Math.abs(link.x + link.width / 2 - center.x - center.width / 2) <= 1
            && Math.abs(link.y + link.height / 2 - center.y - center.height / 2) <= 1 }
      })
      expect(diagram).toEqual({
        top: true, bottom: true, left: true, right: true, overflow: false, compact: true, centered: true,
      })
      await browser.saveScreenshot(`artifacts/browser-e2e/inset-slider-${locale}-${theme}.png`)
      await browser.saveScreenshot(`artifacts/padding-link/linked-${locale}-${theme}.png`)
    }
    await $('.cs-card-inset-units').$('button=px').click()
    await $('.cs-inset-link').click()
    await $('[data-inset-side="left"]').click()
    for (const value of ['0', '8192']) {
      await setNumericInput($('.cs-card-linked-inset input'), value)
      await browser.keys('Enter')
      expect((await snapshot())!.layout.insets.left).toBe(Number(value))
      const fits = await browser.execute(() => [...document.querySelectorAll('.cs-inset-side')].every((button) => {
        const outer = button.getBoundingClientRect()
        return [...button.querySelectorAll('span, strong')].every((label) => {
          const range = document.createRange()
          range.selectNodeContents(label)
          const rect = range.getBoundingClientRect()
          return rect.left >= outer.left && rect.right <= outer.right
            && rect.top >= outer.top && rect.bottom <= outer.bottom
        })
      }))
      expect(fits).toBe(true)
    }
  }).timeout(120000)
  it('renders both chain states beside Tabler at 16–32 px and DPR 1/2', async () => {
    await browser.url('/icons-preview.html')
    await expect($('.icon-workbench')).toBeDisplayed()
    for (const dpr of [1, 2]) {
      await browser.setViewport({ width: 1000, height: 700, devicePixelRatio: dpr })
      for (const theme of ['light', 'dark']) for (const name of ['link', 'unlink']) {
        const row = $(`.icon-theme[data-theme="${theme}"] [data-icon-name="${name}"]`)
        await row.scrollIntoView({ block: 'center' })
        const sizes = await browser.execute((element: HTMLElement) => [...element.querySelectorAll('svg')]
          .map((svg) => svg.getBoundingClientRect().width), await row.getElement())
        expect(sizes).toEqual([16, 18, 20, 24, 32])
        await row.saveScreenshot(`artifacts/padding-link/${name}-${theme}-dpr-${dpr}.png`)
      }
    }
  }).timeout(60000)
})
