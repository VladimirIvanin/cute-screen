import {
  $,
  $$,
  browser,
  expect,
} from '@wdio/globals'
import { writeFile } from 'node:fs/promises'
import type { EditorDocumentV1 } from '../../packages/editor-core/src/document/types'

export async function waitForColorPopover(): Promise<void> {
  await browser.waitUntil(() => browser.execute(() => !document.querySelector(
    '.cs-overlay-root .popover-transition-enter-active, .cs-overlay-root .popover-transition-leave-active',
  )))
}

export async function verifyAppearanceColors(
  snapshot: () => Promise<EditorDocumentV1>,
  directory: string,
): Promise<void> {
  const panel = $('.cs-composition-panel')
  const original = (await snapshot()).presentation.composition!.background.color
  const input = panel.$('input[aria-label="Background color HEX"]')
  const opacity = panel.$('input[aria-label="Background opacity %"]')
  const trigger = panel.$('button[aria-label="Background color"]')
  await opacity.setValue('37')
  await browser.keys('Enter')
  await trigger.click()
  await waitForColorPopover()
  await $('.cs-simple-color-panel button[aria-label="Red"]').click()
  await expect($('.cs-simple-color-panel')).not.toBeDisplayed()
  expect((await snapshot()).presentation.composition!.background.color)
    .toEqual({ red: 1, green: 117 / 255, blue: 86 / 255, alpha: 0.37 })
  await $('button[aria-label="Undo"]').click()
  expect((await snapshot()).presentation.composition!.background.color).toEqual({ ...original, alpha: 0.37 })
  await $('button[aria-label="Redo"]').click()
  await trigger.click()
  await waitForColorPopover()
  await $('.cs-simple-color-panel button[aria-label="Custom colour"]').click()
  const customHex = $('.cs-simple-color-panel input[aria-label="HEX colour code"]')
  await customHex.click()
  await browser.keys(['Control', 'a'])
  await browser.keys('#123456')
  await browser.keys('Enter')
  await expect($('.cs-simple-color-panel')).not.toBeDisplayed()
  expect((await snapshot()).presentation.composition!.background.color)
    .toEqual({ red: 18 / 255, green: 52 / 255, blue: 86 / 255, alpha: 0.37 })
  const beforeCancel = (await snapshot()).presentation.composition
  await trigger.click()
  await waitForColorPopover()
  await $('.cs-simple-color-panel button[aria-label="Custom colour"]').click()
  await customHex.click()
  await browser.keys(['Control', 'a'])
  await browser.keys('invalid')
  await browser.keys('Enter')
  await expect($('.cs-simple-color-panel [role="alert"]')).toBeDisplayed()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
  await expect(customHex).toBeFocused()
  await browser.keys('Escape')
  await expect($('.cs-simple-color-panel button[aria-label="Custom colour"]')).toBeFocused()
  await browser.keys('Escape')
  await expect(trigger).toBeFocused()
  await expect(panel).toBeDisplayed()
  expect((await snapshot()).presentation.composition).toEqual(beforeCancel)
  await trigger.click()
  await waitForColorPopover()
  await $('.cs-simple-color-panel button[aria-label="Custom colour"]').click()
  await browser.saveScreenshot(`${directory}/appearance-color-custom.png`)
  await browser.keys('Escape')
  await browser.keys('Escape')
  const hex = '#' + [original.red, original.green, original.blue]
    .map((channel) => Math.round(channel * 255).toString(16).padStart(2, '0')).join('')
  await input.setValue(hex)
  await browser.keys('Tab')
  await opacity.setValue(String(Math.round(original.alpha * 100)))
  await browser.keys('Enter')
  const restored = (await snapshot()).presentation.composition!.background.color
  expect(restored.red).toBeCloseTo(original.red, 2)
  expect(restored.green).toBeCloseTo(original.green, 2)
  expect(restored.blue).toBeCloseTo(original.blue, 2)
  expect(restored.alpha).toBe(original.alpha)
}

export async function verifyEyedropperButton(directory: string): Promise<void> {
  await $('.cs-composition-panel button[aria-label="Close appearance"]').click()
  await $('.cs-toolrail [data-tool-id="arrow"]').click({ button: 'right' })
  for (const button of await $$('.cs-simple-color-trigger')) {
    if (await button.isDisplayed()) {
      await button.click()
      break
    }
  }
  await waitForColorPopover()
  await $('.cs-simple-color-panel button[aria-label="Custom colour"]').click()
  const sample = $('.cs-color-eyedropper')
  await expect(sample).toBeDisplayed()
  const geometry = await browser.execute(() => {
    const button = document.querySelector('.cs-color-eyedropper')!
    const icon = button.querySelector('svg')!
    const rect = button.getBoundingClientRect()
    const glyph = icon.getBoundingClientRect()
    const style = getComputedStyle(button)
    return { width: rect.width, height: rect.height, iconWidth: glyph.width, iconHeight: glyph.height,
      dx: glyph.left + glyph.width / 2 - rect.left - rect.width / 2,
      dy: glyph.top + glyph.height / 2 - rect.top - rect.height / 2,
      paddingLeft: style.paddingLeft, paddingRight: style.paddingRight }
  })
  expect(geometry.width).toBe(34)
  expect(geometry.height).toBe(34)
  expect(geometry.iconWidth).toBe(18)
  expect(geometry.iconHeight).toBe(18)
  expect(Math.abs(geometry.dx)).toBeLessThanOrEqual(1)
  expect(Math.abs(geometry.dy)).toBeLessThanOrEqual(1)
  expect(geometry.paddingLeft).toBe('0px')
  expect(geometry.paddingRight).toBe('0px')
  await writeFile(`${directory}/eyedropper-button.json`, JSON.stringify(geometry, null, 2))
  await browser.saveScreenshot(`${directory}/eyedropper-button.png`)
  await sample.click()
  await expect($('.cs-canvas:not(.cs-canvas-overlay)')).toHaveElementClass('cs-canvas-eyedropper-cursor')
  await browser.keys('Escape')
  await expect($('.cs-canvas:not(.cs-canvas-overlay)')).not.toHaveElementClass('cs-canvas-eyedropper-cursor')
  await $('.cs-toolrail [data-tool-id="select"]').click()
  await $('button[aria-label="Appearance"]').click()
}
