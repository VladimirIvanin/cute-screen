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
    await $('button[aria-label="Appearance"]').click()
    await $('.cs-composition-panel').$('[data-card-fill="solid"]').click()
    await verifyInsetSlider(snapshot, 'artifacts/browser-e2e')
    await setNumericInput($('.cs-card-linked-inset input'), '5')
    await browser.keys('Enter')
    for (const locale of ['ru', 'en'] as const) for (const theme of ['dark', 'light'] as const) {
      await setEditorPreferences(locale, theme)
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
      await browser.saveScreenshot(`artifacts/browser-e2e/inset-slider-${locale}-${theme}.png`)
    }
  }).timeout(120000)
})
