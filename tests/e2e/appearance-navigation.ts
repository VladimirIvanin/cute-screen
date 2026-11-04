import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import type { EditorDocumentV1 } from '../../packages/editor-core/src/document/types'
import { setNumericInput } from './numeric-input'

export async function verifyAppearanceNavigation(
  snapshot: () => Promise<EditorDocumentV1>,
  directory: string,
): Promise<void> {
  const panel = $('.cs-composition-panel')
  const original = await snapshot()
  expect(original.presentation.composition).toBeUndefined()
  await expect(panel.$('[aria-label="Ready-made templates"]')).toBeDisplayed()
  expect(await panel.$$('.cs-card-starters svg')).toHaveLength(3)
  await panel.$('button=My templates').click()
  await expect(panel.$('.cs-composition-inspector')).toHaveAttribute('data-active-section', 'templates')
  expect(await snapshot()).toEqual(original)
  await expect(panel.$('[data-composition-section="materials"]')).not.toExist()
  const sections = ['layout', 'background', 'shadow', 'frame', 'bands', 'branding']
  const labels = await browser.execute(() => [...document.querySelectorAll('.cs-composition-tab > span')]
    .map((label) => {
      const range = document.createRange()
      range.selectNodeContents(label)
      const text = range.getBoundingClientRect()
      const button = label.parentElement!.getBoundingClientRect()
      return { lines: range.getClientRects().length, fits: text.left >= button.left && text.right <= button.right }
    }))
  expect(labels).toEqual(sections.map(() => ({ lines: 1, fits: true })))
  for (const section of sections) {
    const button = panel.$(`[data-composition-section="${section}"]`)
    await button.click()
    await expect(button).toHaveAttribute('aria-current', 'page')
    await expect(panel.$('.cs-composition-inspector')).toHaveAttribute('data-active-section', section)
    expect(await panel.$$('details')).toHaveLength(0)
    expect(await snapshot()).toEqual(original)
    await expect($('button[aria-label="Undo"]')).toBeDisabled()
  }
  await panel.$('[data-composition-section="layout"]').click()
  const inset = panel.$('input[aria-label="All sides"]')
  await setNumericInput(inset, '17')
  expect(await snapshot()).toEqual(original)
  await panel.$('[data-composition-section="background"]').click()
  await expect(panel.$('input[aria-label="All sides"]')).not.toExist()
  expect(await snapshot()).toEqual(original)
  await panel.$('[data-composition-section="layout"]').click()
  await expect(inset).toHaveValue('0')
  await setNumericInput(inset, '17')
  await browser.keys('Enter')
  await browser.waitUntil(async () => (await snapshot()).presentation.composition?.layout.insets.top === 17)
  const committed = await snapshot()
  await panel.$('[data-composition-section="shadow"]').click()
  await expect(panel.$('input[aria-label="Spread px"]')).toExist()
  const navigation = await panel.$('[aria-label="Appearance sections"]').getLocation()
  await browser.action('wheel').scroll({ origin: await panel.$('.cs-composition-body').getElement(),
    x: 0, y: 0, deltaY: 1200, deltaX: 0, duration: 100 }).perform()
  expect(await panel.$('[aria-label="Appearance sections"]').getLocation()).toEqual(navigation)
  await panel.$('[data-composition-section="layout"]').click()
  expect(await snapshot()).toEqual(committed)
  await $('button[aria-label="Undo"]').click()
  await browser.waitUntil(async () => (await snapshot()).presentation.composition === undefined)
  expect(await snapshot()).toEqual(original)
  await expect(inset).toHaveValue('0')
  await $('button[aria-label="Redo"]').click()
  await browser.waitUntil(async () => (await snapshot()).presentation.composition?.layout.insets.top === 17)
  expect(await snapshot()).toEqual(committed)
  await browser.saveScreenshot(`${directory}/appearance-inspector-navigation.png`)
  await $('button[aria-label="Undo"]').click()
  await browser.waitUntil(async () => (await snapshot()).presentation.composition === undefined)
}
