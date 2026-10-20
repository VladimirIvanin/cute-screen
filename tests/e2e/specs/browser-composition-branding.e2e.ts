import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { openDrawingHarness } from './browser-m06-test-kit'
import { setEditorPreferences } from '../editor-settings'
import { setNumericInput } from '../numeric-input'
import type { EditorDocumentV1 } from '../../../packages/editor-core/src/document/types'

async function blocks() {
  return browser.execute(() => {
    const state = window as typeof window & { __cuteScreenE2eM05: { snapshot(): EditorDocumentV1 } }
    return state.__cuteScreenE2eM05.snapshot().presentation.composition!.branding
  })
}
async function showTextControls(): Promise<void> {
  await browser.execute(() => {
    const body = document.querySelector('.cs-composition-body')!
    const text = document.querySelector('.cs-brand-text')!.getBoundingClientRect()
    body.scrollTop += Math.round(text.top - body.getBoundingClientRect().top - 60)
  })
  await browser.waitUntil(() => browser.execute(() => {
    const body = document.querySelector('.cs-composition-body')!.getBoundingClientRect()
    const text = document.querySelector('.cs-brand-text')!.getBoundingClientRect()
    return text.top >= body.top + 30 && text.top < body.top + 100
  }))
}
describe('signature controls', () => {
  it('edits text and quick colour, switches flat items and restores deletion through undo', async () => {
    await browser.setWindowSize(1024, 768)
    await openDrawingHarness(true, true)
    await $('button[aria-label="Appearance"]').click()
    const panel = $('.cs-composition-panel')
    await panel.$('button=Padding').click()
    for (const title of ['Presets', 'Layout', 'Background']) await panel.$(`summary=${title}`).click()
    await panel.$('summary=Signatures').click()
    await panel.$('button=Add signature').click()
    await browser.waitUntil(async () => (await blocks()).length === 1)
    const firstId = (await blocks())[0]!.id
    const text = panel.$('textarea')
    await setNumericInput(text, '© {year} Cute Screen')
    await browser.keys('Tab')
    await browser.waitUntil(async () => (await blocks())[0]!.text.includes('Cute Screen'))
    await expect(panel.$('button=Refresh year')).toBeDisplayed()
    const alpha = panel.$('label*=Text %').$('input')
    await alpha.scrollIntoView({ block: 'center' })
    await setNumericInput(alpha, '40')
    await browser.keys('Tab')
    await browser.waitUntil(async () => (await blocks())[0]!.color.alpha === 0.4)
    await panel.$('.cs-brand-colour button[aria-label="Blue"]').click()
    await browser.waitUntil(async () => (await blocks())[0]!.color.red === 61 / 255)
    expect((await blocks())[0]!.color.alpha).toBe(0.4)
    await $('button[aria-label="Undo"]').click()
    await browser.waitUntil(async () => (await blocks())[0]!.color.red === 1)
    await $('button[aria-label="Redo"]').click()
    await browser.waitUntil(async () => (await blocks())[0]!.color.red === 61 / 255)
    await panel.$('button[aria-label="Signature anchor 1"]').click()
    await panel.$('.cs-brand-text-align button[aria-label="Center"]').click()
    expect((await blocks())[0]!.alignment).toEqual({ x: 0, y: 0 })
    expect((await blocks())[0]!.textAlignment).toBe('center')
    await panel.$('.cs-brand-backplate-toggle input').click()
    await panel.$('button[aria-label="Backplate color"]').click()
    const palette = $('[role="dialog"][aria-label="Backplate color"]')
    await expect(palette).toBeDisplayed()
    expect(await palette.getSize()).toMatchObject({ width: 280 })
    await palette.$('button[aria-label="White"]').click()
    await browser.waitUntil(async () => (await blocks())[0]!.backplate?.red === 1)
    expect((await blocks())[0]!.backplate?.alpha).toBe(0.65)
    await showTextControls()
    await browser.saveScreenshot('artifacts/browser-e2e/composition-signature-single.png')
    await panel.$('button=Add signature').click()
    await browser.waitUntil(async () => (await blocks()).length === 2)
    const secondId = (await blocks())[1]!.id
    await setNumericInput(panel.$('textarea'), 'Вторая подпись — длинное название канала '.repeat(5))
    await browser.keys('Tab')
    await panel.$(`[data-brand-id="${firstId}"]`).click()
    await expect(panel.$('textarea')).toHaveValue('© {year} Cute Screen')
    await panel.$('button[aria-label="Remove signature"]').click()
    await browser.waitUntil(async () => (await blocks()).length === 1)
    expect((await blocks())[0]!.id).toBe(secondId)
    await $('button[aria-label="Undo"]').click()
    await browser.waitUntil(async () => (await blocks()).length === 2)
    await panel.$(`[data-brand-id="${firstId}"]`).click()
    expect(await panel.$$('.cs-branding details')).toHaveLength(0)
    for (const locale of ['ru', 'en'] as const) for (const theme of ['light', 'dark'] as const) {
      await setEditorPreferences(locale, theme)
      await showTextControls()
      expect(await browser.execute(() => {
        const body = document.querySelector('.cs-composition-body')!
        return body.scrollWidth - body.clientWidth
      })).toBeLessThanOrEqual(1)
      await browser.saveScreenshot(`artifacts/browser-e2e/composition-signatures-${locale}-${theme}.png`)
    }
  }).timeout(120000)
})
