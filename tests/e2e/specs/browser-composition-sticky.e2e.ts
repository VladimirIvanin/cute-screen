import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { openDrawingHarness } from './browser-m06-test-kit'
import { verifyAppearanceNavigation } from '../appearance-navigation'
import { setEditorPreferences } from '../editor-settings'
import type { EditorDocumentV1 } from '../../../packages/editor-core/src/document/types'

describe('persistent appearance navigation', () => {
  it('keeps sections reachable while scrolling and separates navigation from undoable edits', async () => {
    await browser.setWindowSize(1024, 768)
    await openDrawingHarness(true, true)
    await $('button[aria-label="Appearance"]').click()
    await verifyAppearanceNavigation(() => browser.execute(() => (window as typeof window & {
      __cuteScreenE2eM05: { snapshot(): EditorDocumentV1 }
    }).__cuteScreenE2eM05.snapshot()), 'artifacts/browser-e2e')
    const panel = $('.cs-composition-panel')
    await panel.$('[data-composition-start="browser"]').click()
    await panel.$('[data-composition-section="background"]').click()
    for (const locale of ['ru', 'en'] as const) for (const theme of ['light', 'dark'] as const) {
      await setEditorPreferences(locale, theme)
      await expect(panel.$('.cs-composition-template-heading strong'))
        .toHaveText(locale === 'ru' ? 'Готовые шаблоны' : 'Ready-made templates')
      const geometry = await browser.execute(() => {
        const root = document.querySelector('.cs-composition-panel')!
        const rect = root.getBoundingClientRect()
        const footer = root.querySelector('.cs-composition-footer')!.getBoundingClientRect()
        const canvas = document.querySelector('.cs-viewport')!.getBoundingClientRect()
        return { overflow: root.scrollWidth > root.clientWidth, footerBottom: footer.bottom,
          panelBottom: rect.bottom, canvasRight: canvas.right, panelLeft: rect.left }
      })
      expect(geometry.overflow).toBe(false)
      expect(geometry.footerBottom).toBeLessThanOrEqual(geometry.panelBottom)
      expect(geometry.canvasRight).toBeLessThanOrEqual(geometry.panelLeft)
      await browser.saveScreenshot(`artifacts/browser-e2e/templates-${locale}-${theme}.png`)
    }
  }).timeout(120000)
})
