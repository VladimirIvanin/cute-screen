import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { openDrawingHarness } from './browser-m06-test-kit'
import { setEditorPreferences } from '../editor-settings'
import { setNumericInput } from '../numeric-input'
import { verifyShadowPresetPreviews } from '../shadow-preset-previews'
import type { EditorDocumentV1 } from '../../../packages/editor-core/src/document/types'

async function snapshot() {
  return browser.execute(() => (window as typeof window & {
    __cuteScreenE2eM05: { snapshot(): EditorDocumentV1 }
  }).__cuteScreenE2eM05.snapshot().presentation.composition)
}

async function fillField(
  label: string,
  value: string,
) {
  const input = $('.cs-composition-panel').$(`input[aria-label="${label}"]`)
  await setNumericInput(input, value)
  await browser.keys('Tab')
}

describe('compact background and layout', () => {
  it('keeps common settings together and previews shadows with one undoable commit', async () => {
    await browser.setWindowSize(1024, 768)
    await openDrawingHarness(true, true)
    const chrome = await browser.execute(() => ({
      width: window.outerWidth - window.innerWidth,
      height: window.outerHeight - window.innerHeight,
    }))
    await browser.setWindowSize(1024 + chrome.width, 768 + chrome.height)
    await $('button[aria-label="Appearance"]').click()
    const panel = $('.cs-composition-panel')
    expect(await snapshot()).toBeUndefined()
    await panel.$('[data-card-fill="solid"]').click()
    await fillField('All sides', '8')
    expect((await snapshot())!.layout.insets).toMatchObject({ top: 8, right: 8, bottom: 8, left: 8 })
    const units = panel.$('.cs-card-inset-units')
    await units.$('button=px').click()
    expect((await snapshot())!.layout.insets).toMatchObject({ unit: 'px', top: 8 })
    await browser.keys(['Shift', 'Tab'])
    await browser.keys('Enter')
    expect((await snapshot())!.layout.insets.unit).toBe('percent')
    await expect(units.$('button=%')).toHaveAttribute('aria-pressed', 'true')
    await $('button[aria-label="Undo"]').click()
    expect((await snapshot())!.layout.insets.unit).toBe('px')
    await $('button[aria-label="Redo"]').click()
    expect((await snapshot())!.layout.insets.unit).toBe('percent')
    await panel.$('button[aria-label="Link insets"]').click()
    await fillField('Left', '16')
    expect((await snapshot())!.layout.insets).toMatchObject({ top: 8, right: 8, bottom: 8, left: 16 })
    await panel.$('button[aria-label="Link insets"]').click()
    expect((await snapshot())!.layout.insets.left).toBe(8)
    await $('button[aria-label="Undo"]').click()
    await expect(panel.$('label=Left').$('input')).toHaveValue('16')
    await $('button[aria-label="Redo"]').click()
    await panel.$('button=Medium').click()
    expect((await snapshot())!.shadow).toBe(0.45)
    const slider = panel.$('[role="slider"][aria-label="Shadow strength"]')
    await slider.click()
    const shadowBefore = (await snapshot())!.shadow
    await browser.keys('ArrowRight')
    expect((await snapshot())!.shadow).toBeCloseTo(shadowBefore + 0.01)
    await $('button[aria-label="Undo"]').click()
    expect((await snapshot())!.shadow).toBe(shadowBefore)
    await $('button[aria-label="Redo"]').click()
    const shadow = panel.$('input[aria-label="Shadow strength"]')
    const committed = (await snapshot())!.shadow
    await setNumericInput(shadow, '87')
    expect((await snapshot())!.shadow).toBe(committed)
    await browser.keys('Escape')
    await expect(panel).toBeDisplayed()
    await expect(shadow).toHaveValue(String(Math.round(committed * 100)))
    await setNumericInput(shadow, '63')
    await browser.keys('Enter')
    expect((await snapshot())!.shadow).toBe(0.63)
    await $('button[aria-label="Undo"]').click()
    expect((await snapshot())!.shadow).toBe(committed)
    await $('button[aria-label="Redo"]').click()
    expect((await snapshot())!.shadow).toBe(0.63)
    await fillField('Scale %', '99')
    await fillField('Corners', '38')
    await setNumericInput(shadow, '83')
    await browser.keys('Enter')
    const size = panel.$('input[aria-label="Shadow size"]')
    await setNumericInput(size, '400')
    await browser.keys('Enter')
    expect((await snapshot())!.shadowOptions?.size).toBe(4)
    expect((await snapshot())!.shadow).toBe(0.83)
    await $('button[aria-label="Undo"]').click()
    await expect(size).toHaveValue('100')
    await $('button[aria-label="Redo"]').click()
    await expect(size).toHaveValue('400')
    for (const locale of ['ru', 'en'] as const) for (const theme of ['dark', 'light'] as const) {
      await setEditorPreferences(locale, theme)
      await panel.$('header strong').click()
      // Return to the beginning with real wheel input after scrolled interactions.
      await browser.action('wheel').scroll({ origin: await $('.cs-composition-body').getElement(),
        x: 0, y: 0, deltaY: -2000, deltaX: 0, duration: 100 }).perform()
      const geometry = await browser.execute(() => {
        const body = document.querySelector('.cs-composition-body')!
        const section = document.querySelector('.cs-card-layout')!
        const rect = section.getBoundingClientRect()
        const shadow = section.querySelector('.cs-card-shadow-controls')!.getBoundingClientRect()
        const presets = section.querySelector('.cs-card-shadow-presets')!.getBoundingClientRect()
        return { height: rect.height, overflow: body.scrollWidth > body.clientWidth,
          shadowBottom: shadow.bottom, bodyBottom: body.getBoundingClientRect().bottom,
          presetsBottom: presets.bottom,
          widths: [...section.querySelectorAll('.cs-card-field-pair input')]
            .filter((input) => input.getClientRects().length > 0)
            .map((input) => input.getBoundingClientRect().width) }
      })
      await browser.saveScreenshot(`artifacts/browser-e2e/appearance-compact-${locale}-${theme}.png`)
      expect(geometry.overflow).toBe(false)
      expect(geometry.height).toBeLessThan(620)
      // The fixed removal action takes priority; exact numeric controls remain scrollable.
      expect(geometry.presetsBottom).toBeLessThanOrEqual(geometry.bodyBottom + 1)
      expect(geometry.widths.every((width) => width >= 120)).toBe(true)
      await verifyShadowPresetPreviews(`artifacts/browser-e2e/shadow-presets-${locale}-${theme}`)
    }
    await setEditorPreferences('en', 'dark')
    await panel.$('summary=Advanced shadow').click()
    await fillField('Spread px', '24')
    await fillField('Shift X px', '-20')
    await fillField('Softness %', '150')
    await panel.$('input[aria-label="Shadow color HEX"]').setValue('#14213d')
    await browser.keys('Tab')
    expect((await snapshot())!.shadowOptions).toMatchObject({ size: 4, spread: 24, offset: { x: -20, y: 0 } })
    expect((await snapshot())!.shadowOptions?.softness).toBe(1.5)
    expect((await snapshot())!.shadowOptions?.color.blue).toBeCloseTo(61 / 255)
    await browser.saveScreenshot('artifacts/browser-e2e/appearance-shadow-advanced.png')
    await panel.$('button=Reset shadow settings').click()
    expect((await snapshot())!.shadowOptions).toMatchObject({ size: 1, spread: 0, offset: { x: 0, y: 0 } })
    await panel.$('summary=Advanced shadow').click()
    await panel.$('summary=Screenshot position').click()
    await expect(panel.$('button[aria-label="Bottom · Right"]')).toBeDisplayed()
    await panel.$('button[aria-label="Bottom · Right"]').click()
    expect((await snapshot())!.layout.alignment).toEqual({ x: 1, y: 1 })
  }).timeout(120000)
})
