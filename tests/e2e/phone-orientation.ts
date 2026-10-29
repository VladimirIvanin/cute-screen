import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import type { EditorDocumentV1 } from '../../packages/editor-core/src/document/types'
import { waitForStableCanvas } from './canvas-ready'

export async function verifyPhoneOrientation(
  snapshot: () => Promise<EditorDocumentV1>,
  entry: 'starter' | 'tile',
  directory: string,
): Promise<void> {
  const original = await snapshot()
  const source = original.crop ?? original.canvas
  const automatic = source.width > source.height ? 'landscape' : 'portrait'
  const manual = automatic === 'landscape' ? 'portrait' : 'landscape'
  await $('button[aria-label="Appearance"]').click()
  const panel = $('.cs-composition-panel')
  await panel.$('summary=Frame').click()
  if (entry === 'starter') await panel.$('button=Phone').click()
  else await panel.$('input[value="phone"] + .cs-card-frame-choice').click()
  const orientation = panel.$('label*=Orientation').$('select')
  await expect(orientation).toHaveValue(automatic)
  expect((await snapshot()).presentation.phoneOrientation).toBe(automatic)
  await $('button[aria-label="Undo"]').click()
  expect((await snapshot()).presentation.composition).toBeUndefined()
  expect((await snapshot()).presentation.phoneOrientation).toBeUndefined()
  await $('button[aria-label="Redo"]').click()
  await expect(orientation).toHaveValue(automatic)
  await $('.cs-zoom-fit').click()
  await waitForStableCanvas()
  await browser.saveScreenshot(`${directory}/phone-${entry}-automatic.png`)
  await orientation.selectByAttribute('value', manual)
  await panel.$('label*=Frame theme').$('select').selectByAttribute('value', 'light')
  await expect(orientation).toHaveValue(manual)
  await panel.$('button=Phone').click()
  await expect(orientation).toHaveValue(manual)
  await panel.$('input[value="browser"] + .cs-card-frame-choice').click()
  await panel.$('input[value="phone"] + .cs-card-frame-choice').click()
  await expect(orientation).toHaveValue(manual)
  await panel.$('button[aria-label="Close appearance"]').click()
  await $('button[aria-label="Appearance"]').click()
  await expect(orientation).toHaveValue(manual)
  await panel.$('[data-composition-reset]').click()
  expect((await snapshot()).presentation.phoneOrientation).toBe(manual)
  await panel.$('button=Phone').click()
  await expect(orientation).toHaveValue(manual)
  expect((await snapshot()).presentation.phoneOrientation).toBe(manual)
  expect((await snapshot()).layers).toEqual(original.layers)
  expect((await snapshot()).source).toEqual(original.source)
  await $('.cs-zoom-fit').click()
  await waitForStableCanvas()
  await browser.saveScreenshot(`${directory}/phone-${entry}-manual.png`)
}
