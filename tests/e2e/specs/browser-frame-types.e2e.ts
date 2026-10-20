import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { openDrawingHarness } from './browser-m06-test-kit'
import { setEditorPreferences } from '../editor-settings'
import { verifyFrameTypes } from '../frame-types'
import type { EditorDocumentV1 } from '../../../packages/editor-core/src/document/types'

async function snapshot() {
  return browser.execute(() => (window as typeof window & {
    __cuteScreenE2eM05: { snapshot(): EditorDocumentV1 }
  }).__cuteScreenE2eM05.snapshot().presentation.composition)
}
describe('visual frame choices', () => {
  it('puts frames second and supports keyboard selection, undo and compact bilingual previews', async () => {
    await browser.setWindowSize(1024, 768)
    await openDrawingHarness(true, true)
    await $('button[aria-label="Appearance"]').click()
    const panel = $('.cs-composition-panel')
    await panel.$('button=Browser').click()
    await verifyFrameTypes(snapshot, 'artifacts/browser-e2e')
    for (const locale of ['ru', 'en'] as const) for (const theme of ['dark', 'light'] as const) {
      await setEditorPreferences(locale, theme)
      const summary = panel.$('summary=' + (locale === 'ru' ? 'Фон и макет' : 'Background & layout'))
      await summary.click()
      const group = panel.$('.cs-card-frame-types')
      await expect(group).toBeDisplayed()
      const geometry = await browser.execute(() => {
        const panel = document.querySelector('.cs-composition-body')!
        const group = panel.querySelector('.cs-card-frame-types')!
        const options = [...group.querySelectorAll('.cs-card-frame-choice')].map((option) => {
          const rect = option.getBoundingClientRect()
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
            overflow: option.scrollWidth > option.clientWidth }
        })
        return { options, overflow: panel.scrollWidth > panel.clientWidth }
      })
      expect(geometry.overflow).toBe(false)
      expect(geometry.options).toHaveLength(4)
      expect(geometry.options.every((option) =>
        !option.overflow && option.width >= 60 && option.height >= 60)).toBe(true)
      expect(new Set(geometry.options.map((option) => option.y)).size).toBe(1)
      await browser.saveScreenshot(`artifacts/browser-e2e/frame-tiles-${locale}-${theme}.png`)
      await summary.click()
    }
  }).timeout(120000)
})
