import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { openDrawingHarness } from './browser-m06-test-kit'
import {
  verifyAppearanceColors,
  verifyEyedropperButton,
} from '../appearance-colors'
import { setEditorPreferences } from '../editor-settings'
import type { EditorDocumentV1 } from '../../../packages/editor-core/src/document/types'
async function snapshot() {
  return browser.execute(() => (window as typeof window & {
    __cuteScreenE2eM05: { snapshot(): EditorDocumentV1 }
  }).__cuteScreenE2eM05.snapshot())
}
describe('shared appearance palette', () => {
  it('uses the tool color UI, preserves alpha and keeps the eyedropper icon full size', async () => {
    await browser.setWindowSize(1024, 900)
    await openDrawingHarness(true, true)
    await $('button[aria-label="Appearance"]').click()
    const panel = $('.cs-composition-panel')
    await panel.$('[data-card-fill="solid"]').click()
    await verifyAppearanceColors(snapshot, 'artifacts/browser-e2e')
    await verifyEyedropperButton('artifacts/browser-e2e')
    for (const locale of ['ru', 'en'] as const) for (const theme of ['dark', 'light'] as const) {
      await setEditorPreferences(locale, theme)
      await panel.$(`button[aria-label="${locale === 'ru' ? 'Цвет фона' : 'Background color'}"]`).click()
      await $('.cs-simple-color-panel button[aria-label="' + (locale === 'ru' ? 'Свой цвет' : 'Custom colour') + '"]').click()
      const geometry = await browser.execute(() => {
        const panel = document.querySelector('.cs-simple-color-panel:not(.is-embedded)')!
        const rect = panel.getBoundingClientRect()
        return { overflow: panel.scrollWidth > panel.clientWidth,
          fits: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight }
      })
      expect(geometry).toEqual({ overflow: false, fits: true })
      await browser.saveScreenshot(`artifacts/browser-e2e/appearance-color-${locale}-${theme}.png`)
      await browser.keys('Escape')
      await browser.keys('Escape')
    }
  }).timeout(120000)
})
