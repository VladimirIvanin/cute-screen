import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { openDrawingHarness } from './browser-m06-test-kit'
import { waitForStableCanvas } from '../canvas-ready'
import { setPhoneOrientation } from '../phone-orientation-control'
import { setEditorPreferences } from '../editor-settings'
import { verifyRemoveAppearance } from '../remove-appearance'
import type { EditorDocumentV1 } from '../../../packages/editor-core/src/document/types'
async function snapshot(): Promise<EditorDocumentV1> {
  return browser.execute(() => {
    const state = window as typeof window & { __cuteScreenE2eM05?: { snapshot(): EditorDocumentV1 } }
    return state.__cuteScreenE2eM05!.snapshot()
  })
}
async function drag(
  x: number,
  y: number,
  endX: number,
  endY: number,
): Promise<void> {
  await browser.action('pointer').move({ origin: 'viewport', x: Math.round(x), y: Math.round(y) }).down({ button: 'left' })
    .move({ origin: 'viewport', x: Math.round(endX), y: Math.round(endY), duration: 150 }).up({ button: 'left' }).perform()
}
describe('publication cards', () => {
  it('creates frames, freeform background and scoped arrows through production controls', async () => {
    await browser.setWindowSize(1280, 900)
    await openDrawingHarness(true)
    const original = (await snapshot()).layers
    await $('button[aria-label="Appearance"]').click()
    const panel = $('.cs-composition-panel')
    await expect(panel.$('[data-composition-reset]')).toBeDisabled()
    await expect(panel).toBeDisplayed()
    expect((await snapshot()).presentation.composition).toBeUndefined()
    await expect(panel.$('summary=Background & layout')).toBeDisplayed()
    await expect(panel.$('[data-card-fill="transparent"]')).toHaveAttribute('aria-pressed', 'true')
    await panel.$('input[aria-label="All sides"]').setValue('6')
    await browser.keys('Tab')
    await browser.waitUntil(async () => (await snapshot()).presentation.composition?.layout.insets.top === 6)
    expect((await snapshot()).presentation.composition?.shadow).toBe(0)
    await $('button[aria-label="Undo"]').click()
    await browser.waitUntil(async () => (await snapshot()).presentation.composition === undefined)
    await expect(panel.$('summary=Background & layout')).toBeDisplayed()
    await panel.$('button=Browser').click()
    await browser.waitUntil(async () => (await snapshot()).presentation.composition?.frame.kind === 'browser')
    expect((await snapshot()).layers).toEqual(original)
    await waitForStableCanvas()
    const p = await panel.getLocation(), view = await $('.cs-viewport').getLocation(), size = await $('.cs-viewport').getSize()
    expect(view.x + size.width).toBeLessThanOrEqual(p.x)
    await panel.$('summary=Frame').click()
    const title = await panel.$('label*=Title').$('input')
    await title.setValue('Блог Cute Screen — browser title')
    await browser.keys('Tab')
    await browser.waitUntil(async () => (await snapshot()).presentation.composition?.frame.title.includes('Cute Screen') === true)
    await panel.$('button=Phone').click()
    await setPhoneOrientation('landscape')
    await browser.waitUntil(async () => (await snapshot()).presentation.composition?.frame.orientation === 'landscape')
    await panel.$('button=Padding').click()
    await panel.$('[data-card-fill="freeform"]').click()
    await browser.waitUntil(async () => (await snapshot()).presentation.composition?.background.kind === 'freeform')
    await panel.$('button=Edit on canvas').click()
    const handle = $('.cs-composition-handles button[aria-label="Gradient point 1"]')
    await expect(handle).toBeDisplayed()
    const rect = await handle.getLocation(), handleSize = await handle.getSize()
    const before = (await snapshot()).presentation.composition!.background.freeform.points[0]!
    await drag(rect.x + handleSize.width / 2, rect.y + handleSize.height / 2, rect.x + 45, rect.y + 35)
    await browser.waitUntil(async () =>
      (await snapshot()).presentation.composition!.background.freeform.points[0]!.x !== before.x)
    await panel.$('button=Done').click()
    await expect($('button=On card')).not.toExist()
    await expect($('button=On screenshot')).not.toExist()
    await $('.cs-toolrail [data-tool-id="arrow"]').click()
    await $('.cs-zoom-fit').click()
    await waitForStableCanvas()
    const canvas = await browser.execute(() => document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect().toJSON())
    const count = (await snapshot()).layers.length
    await drag(canvas.left + canvas.width * 0.025, canvas.top + canvas.height * 0.5,
      canvas.left + canvas.width * 0.45, canvas.top + canvas.height * 0.5)
    await browser.waitUntil(async () => (await snapshot()).layers.length === count + 1)
    expect((await snapshot()).layers.at(-1)?.space).toBe('card')
    const cardArrow = (await snapshot()).layers.at(-1)!
    await $('.cs-toolrail [data-tool-id="arrow"]').click()
    await drag(canvas.left + canvas.width * 0.25, canvas.top + canvas.height * 0.25,
      canvas.left + canvas.width * 0.45, canvas.top + canvas.height * 0.25)
    await browser.waitUntil(async () => (await snapshot()).layers.length === count + 2)
    expect((await snapshot()).layers.at(-1)?.space ?? 'content').toBe('content')
    await drag(canvas.left + canvas.width * 0.25, canvas.top + canvas.height * 0.5,
      canvas.left + canvas.width * 0.25, canvas.top + canvas.height * 0.55)
    await browser.waitUntil(async () => {
      const moved = (await snapshot()).layers.find((layer) => layer.id === cardArrow.id)!
      return moved.transform.translateY !== cardArrow.transform.translateY
    })
    expect((await snapshot()).layers.find((layer) => layer.id === cardArrow.id)!.space).toBe('card')
    await verifyRemoveAppearance(snapshot, 'artifacts/browser-e2e')
    await browser.setWindowSize(1024, 768)
    for (const locale of ['ru', 'en'] as const) for (const theme of ['light', 'dark'] as const) {
      await setEditorPreferences(locale, theme)
      await browser.saveScreenshot(`artifacts/browser-e2e/composition-${locale}-${theme}.png`)
      const bounds = await panel.getSize()
      expect(bounds.width).toBe(320)
      await expect(panel.$('[data-composition-reset]')).toHaveText(locale === 'ru' ? 'Убрать оформление' : 'Remove appearance')
      const footer = await panel.$('.cs-composition-footer').getLocation()
      const footerSize = await panel.$('.cs-composition-footer').getSize()
      expect(footer.y + footerSize.height).toBeLessThanOrEqual(768)
    }
  }).timeout(120000)
})
