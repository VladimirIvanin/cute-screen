import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { openDrawingHarness } from './browser-m06-test-kit'
import { setEditorPreferences } from '../editor-settings'
import { setNumericInput } from '../numeric-input'
import type { EditorDocumentV1 } from '../../../packages/editor-core/src/document/types'

async function background() {
  return browser.execute(() => {
    const state = window as typeof window & { __cuteScreenE2eM05: { snapshot(): EditorDocumentV1 } }
    return state.__cuteScreenE2eM05.snapshot().presentation.composition!.background
  })
}

async function expectControlsFit(): Promise<void> {
  const metrics = await browser.execute(() => {
    const host = document.querySelector('.cs-composition-panel .cs-shape-gradient-editor')!
    const body = document.querySelector('.cs-composition-body')!
    const bounds = host.getBoundingClientRect()
    return {
      overflow: body.scrollWidth - body.clientWidth,
      controls: [...host.querySelectorAll('.cs-numeric-entry')].map((entry) => {
        const input = entry.querySelector('input')!.getBoundingClientRect()
        const suffix = entry.querySelector('.n-input__suffix')!.getBoundingClientRect()
        const outer = entry.getBoundingClientRect()
        return input.width >= 36 && input.left >= outer.left && input.right <= suffix.left
          && suffix.right <= outer.right
      }),
      palette: [...host.querySelectorAll('.cs-simple-color-swatch')].every((button) => {
        const rect = button.getBoundingClientRect()
        return rect.left >= bounds.left && rect.right <= bounds.right
      }),
    }
  })
  expect(metrics.overflow).toBeLessThanOrEqual(1)
  expect(metrics.controls).toEqual([true, true, true])
  expect(metrics.palette).toBe(true)
}

async function expectPointLabelsFit(count: number): Promise<void> {
  const labels = await browser.execute(() => [...document.querySelectorAll('.cs-composition-handles button[aria-label^="Gradient point"]')].map((button) => {
    const bounds = button.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(button)
    const text = range.getBoundingClientRect()
    return text.left >= bounds.left + 2 && text.right <= bounds.right - 2
      && text.top >= bounds.top + 2 && text.bottom <= bounds.bottom - 2
      && Math.abs((text.left + text.right - bounds.left - bounds.right) / 2) < 1.5
      && Math.abs((text.top + text.bottom - bounds.top - bounds.bottom) / 2) < 1.5
  }))
  expect(labels).toEqual(Array.from({ length: count }, () => true))
}

describe('compact appearance gradient', () => {
  it('fits complete numeric values and the full palette inside a narrow dock', async () => {
    await browser.setWindowSize(1024, 768)
    await openDrawingHarness(true, true)
    await $('button[aria-label="Appearance"]').click()
    const panel = $('.cs-composition-panel')
    await panel.$('button=Padding').click()
    await panel.$('summary=Presets').click()
    await panel.$('summary=Layout').click()
    await expectControlsFit()
    await panel.$('button=Edit on canvas').click()
    for (const degrees of [0, 45, 90, 180, 270, 359]) {
      const field = panel.$('input[aria-label="Angle"]')
      await setNumericInput(field, String(degrees))
      await browser.keys('Enter')
      await expect(field).toHaveValue(String(degrees))
      await expectPointLabelsFit(2)
      await expectControlsFit()
    }
    const position = panel.$('input[aria-label="Stop position"]')
    await position.scrollIntoView({ block: 'center' })
    await setNumericInput(position, '55')
    await browser.keys('Enter')
    await browser.waitUntil(async () => (await background()).linear.stops[0]!.position === 0.55)
    const angle = panel.$('input[aria-label="Angle"]')
    await angle.scrollIntoView({ block: 'center' })
    await setNumericInput(angle, '359')
    await browser.keys('Enter')
    await expect(angle).toHaveValue('359')
    const opacity = panel.$('input[aria-label="Stop opacity"]')
    await opacity.scrollIntoView({ block: 'center' })
    await setNumericInput(opacity, '100')
    await browser.keys('Enter')
    await expect(opacity).toHaveValue('100')
    await panel.$('button[aria-label="Black"]').click()
    await browser.keys('ArrowDown')
    await expect(panel.$('button[aria-label="Violet"]')).toBeFocused()
    const custom = panel.$('button[aria-label="Custom colour"]')
    await custom.scrollIntoView({ block: 'center' })
    await custom.click()
    const hex = panel.$('input[aria-label="HEX colour code"]')
    await hex.scrollIntoView({ block: 'center' })
    await setNumericInput(hex, '#123456')
    await browser.keys('Enter')
    await browser.waitUntil(async () => Math.round((await background()).linear.stops[0]!.color.red * 255) === 0x12)
    expect(await browser.execute(() => {
      const body = document.querySelector('.cs-composition-body')!
      return body.scrollWidth - body.clientWidth
    })).toBeLessThanOrEqual(1)
    await panel.$('button*=Palette').click()
    for (const locale of ['ru', 'en'] as const) for (const theme of ['light', 'dark'] as const) {
      await setEditorPreferences(locale, theme)
      await expectControlsFit()
      await panel.$('.cs-gradient-track').scrollIntoView({ block: 'start' })
      await browser.saveScreenshot(`artifacts/browser-e2e/composition-compact-${locale}-${theme}.png`)
    }
    await panel.$('[data-card-fill="freeform"]').click()
    while (await $('.cs-composition-handles').$$('button[aria-label^="Gradient point"]').length < 16) {
      await panel.$('button=Add point').click()
    }
    await expectPointLabelsFit(16)
    await browser.saveScreenshot('artifacts/browser-e2e/composition-point-labels.png')
  }).timeout(120000)
})
