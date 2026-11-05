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
    await panel.$('[data-composition-section="background"]').click()
    await panel.$('[data-card-fill="solid"]').click()
    await verifyAppearanceColors(snapshot, 'artifacts/browser-e2e')
    await verifyEyedropperButton('artifacts/browser-e2e')
    for (const locale of ['ru', 'en'] as const) for (const theme of ['dark', 'light'] as const) {
      await setEditorPreferences(locale, theme)
      const custom = locale === 'ru' ? 'Свой цвет' : 'Custom colour'
      await panel.$(`.cs-card-color-embedded .cs-simple-color-panel button[aria-label="${custom}"]`).click()
      const geometry = await browser.execute(() => {
        const panel = document.querySelector('.cs-card-color-embedded .cs-simple-color-panel')!
        const body = panel.closest('.cs-composition-body')!.getBoundingClientRect()
        const rect = panel.getBoundingClientRect()
        return { overflow: panel.scrollWidth > panel.clientWidth,
          fits: rect.left >= body.left && rect.right <= body.right,
          portaled: Boolean(document.querySelector('.cs-overlay-root .cs-simple-color-panel')) }
      })
      expect(geometry).toEqual({ overflow: false, fits: true, portaled: false })
      await browser.saveScreenshot(`artifacts/browser-e2e/appearance-color-${locale}-${theme}.png`)
      await browser.keys('Escape')
    }
  }).timeout(120000)
})
