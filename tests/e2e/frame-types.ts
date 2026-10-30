import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import type { CompositionSettings } from '../../packages/editor-core/src/composition/types'

export async function verifyFrameTypes(
  readComposition: () => Promise<CompositionSettings | undefined>,
  directory: string,
): Promise<void> {
  const panel = $('.cs-composition-panel')
  const order = await browser.execute(() => [...document.querySelectorAll('.cs-composition-body > details > summary')]
    .slice(0, 4).map((element) => element.textContent))
  expect(order).toEqual(['Background & layout', 'Frame', 'Header strip', 'Footer strip'])
  await panel.$('summary=Frame').click()
  const group = panel.$('[role="radiogroup"][aria-label="Frame type"]')
  const original = (await readComposition())!
  expect(original.frame.theme).toBe('dark')
  const theme = panel.$('label*=Frame theme').$('select')
  await expect(theme).toHaveValue('dark')
  await theme.selectByAttribute('value', 'light')
  expect((await readComposition())!.frame.theme).toBe('light')
  await $('button[aria-label="Undo"]').click()
  await expect(theme).toHaveValue('dark')
  await $('button[aria-label="Redo"]').click()
  await expect(theme).toHaveValue('light')
  await $('button[aria-label="Undo"]').click()
  await expect(theme).toHaveValue('dark')
  await group.$('input[value="window"] + .cs-card-frame-choice').click()
  expect(await readComposition()).toEqual({ ...original, frame: { ...original.frame, kind: 'window' } })
  await browser.keys('ArrowRight')
  await expect(group.$('input[value="browser"]')).toBeChecked()
  expect((await readComposition())!.frame.kind).toBe('browser')
  await expect(panel.$('label=URL').$('input')).toBeDisplayed()
  await browser.keys('ArrowRight')
  await expect(group.$('input[value="phone"]')).toBeChecked()
  expect((await readComposition())!.frame.kind).toBe('phone')
  const phoneOrientation = (await readComposition())!.frame.orientation
  await expect(panel.$('.cs-card-orientation-toggle')).toBeDisplayed()
  await expect(panel.$('label*=Title')).not.toExist()
  await $('button[aria-label="Undo"]').click()
  await expect(group.$('input[value="browser"]')).toBeChecked()
  await $('button[aria-label="Redo"]').click()
  await expect(group.$('input[value="phone"]')).toBeChecked()
  await group.$('input[value="none"] + .cs-card-frame-choice').click()
  expect((await readComposition())!.frame.kind).toBe('none')
  await expect(panel.$('label*=Frame theme')).not.toExist()
  await group.$('input[value="browser"] + .cs-card-frame-choice').click()
  expect(await readComposition()).toEqual({ ...original,
    frame: { ...original.frame, kind: 'browser', orientation: phoneOrientation } })
  await browser.saveScreenshot(`${directory}/frame-tiles.png`)
}
