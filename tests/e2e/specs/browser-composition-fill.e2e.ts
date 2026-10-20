import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { openDrawingHarness } from './browser-m06-test-kit'
import { setEditorPreferences } from '../editor-settings'
import type { EditorDocumentV1 } from '../../../packages/editor-core/src/document/types'

async function backgroundKind() {
  return browser.execute(() => {
    const state = window as typeof window & { __cuteScreenE2eM05: { snapshot(): EditorDocumentV1 } }
    return state.__cuteScreenE2eM05.snapshot().presentation.composition!.background.kind
  })
}

describe('visual background fills', () => {
  it('selects all seven fills with icons, keyboard and undo in the production panel', async () => {
    await browser.setWindowSize(1024, 768)
    await openDrawingHarness(true)
    await $('button[aria-label="Appearance"]').click()
    const panel = $('.cs-composition-panel')
    await panel.$('button=Padding').click()
    const types = panel.$('.cs-card-fill-types')
    expect(await types.$$('button')).toHaveLength(7)
    for (const kind of ['transparent', 'solid', 'radial', 'freeform', 'image', 'blurred', 'linear']) {
      await types.$(`[data-card-fill="${kind}"]`).click()
      await browser.waitUntil(async () => await backgroundKind() === kind)
      await expect(types.$(`[data-card-fill="${kind}"]`)).toHaveAttribute('aria-pressed', 'true')
      expect(await types.$$('button[aria-pressed="true"]')).toHaveLength(1)
    }
    await types.$('[data-card-fill="transparent"]').click()
    await browser.keys('Tab')
    await browser.keys('Enter')
    await browser.waitUntil(async () => await backgroundKind() === 'solid')
    await $('button[aria-label="Undo"]').click()
    await browser.waitUntil(async () => await backgroundKind() === 'transparent')
    await $('button[aria-label="Redo"]').click()
    await browser.waitUntil(async () => await backgroundKind() === 'solid')
    for (const locale of ['ru', 'en'] as const) for (const theme of ['light', 'dark'] as const) {
      await setEditorPreferences(locale, theme)
      await types.scrollIntoView({ block: 'center' })
      const bounds = await types.getSize()
      expect(bounds.width).toBeLessThan(320)
      await expect(types.$('[data-card-fill="solid"]')).toHaveAttribute('title', locale === 'ru' ? 'Цвет' : 'Color')
      await browser.saveScreenshot(`artifacts/browser-e2e/composition-fill-${locale}-${theme}.png`)
    }
  }).timeout(120000)
})
