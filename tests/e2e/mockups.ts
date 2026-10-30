import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import type { EditorDocumentV1 } from '../../packages/editor-core/src/document/types'
import { setEditorPreferences } from './editor-settings'
import { waitForStableCanvas } from './canvas-ready'
import { setPhoneOrientation } from './phone-orientation-control'

export async function verifyMockups(
  snapshot: () => Promise<EditorDocumentV1>,
  directory: string,
  exportResult?: (name: string) => Promise<void>,
): Promise<void> {
  await browser.execute(() => {
    const state = window as typeof window & { __mockupInput?: { type: string; trusted: boolean }[] }
    state.__mockupInput = []
    for (const type of ['pointerdown', 'keydown']) document.addEventListener(type, (event) => {
      state.__mockupInput!.push({ type, trusted: event.isTrusted })
    })
  })
  await $('button[aria-label="Appearance"]').click()
  const panel = $('.cs-composition-panel')
  await panel.$('summary=Frame').click()
  const chooseType = async (kind: 'phone' | 'browser') => {
    const input = panel.$(`.cs-card-frame-types input[value="${kind}"]`)
    const tile = panel.$(`.cs-card-frame-types input[value="${kind}"] + span`)
    await input.waitForEnabled()
    await tile.scrollIntoView({ block: 'center' })
    await tile.click()
    await expect(input).toBeChecked()
  }
  await chooseType('phone')
  const layers = (await snapshot()).layers
  const choose = async (id: string) => panel.$(`.cs-card-models input[value="${id}"] + span`).click()
  await choose('iphone-island')
  await browser.keys('ArrowRight')
  await expect(panel.$('.cs-card-models input[value="iphone-notch"]')).toBeChecked()
  expect((await snapshot()).presentation.composition!.frame.phoneModel).toBe('iphone-notch')
  await $('button[aria-label="Undo"]').click()
  await expect(panel.$('.cs-card-models input[value="iphone-island"]')).toBeChecked()
  await $('button[aria-label="Redo"]').click()
  await expect(panel.$('.cs-card-models input[value="iphone-notch"]')).toBeChecked()
  for (const model of ['iphone-island', 'iphone-notch', 'android-rounded', 'android-angular']) {
    await choose(model)
    expect((await snapshot()).presentation.composition!.frame.phoneModel).toBe(model)
    if (model === 'iphone-notch') {
      await waitForStableCanvas()
      await browser.saveScreenshot(`${directory}/mockup-notch-landscape.png`)
    }
  }
  await setPhoneOrientation('portrait')
  await panel.$('label*=System details').$('input').click()
  await panel.$('label*=Screenshot placement').$('select').selectByAttribute('value', 'fullscreen')
  await waitForStableCanvas()
  await exportResult?.('phone')
  await chooseType('browser')
  for (const style of ['retro-windows', 'retro-mac', 'modern']) {
    await choose(style)
    expect((await snapshot()).presentation.composition!.frame.browserStyle).toBe(style)
  }
  await choose('retro-mac')
  await panel.$('label*=Title').$('input').setValue('Cute Screen · Мокапы')
  await panel.$('label=URL').$('input').setValue('https://example.test/mockups')
  await browser.keys('Tab')
  await waitForStableCanvas()
  await exportResult?.('browser')
  await chooseType('phone')
  expect((await snapshot()).presentation.composition!.frame).toMatchObject({ phoneModel: 'android-angular',
    phoneSystemDetails: true, phoneContentMode: 'fullscreen', browserStyle: 'retro-mac', orientation: 'portrait' })
  expect((await snapshot()).layers).toEqual(layers)
  const input = await browser.execute(() => (window as typeof window & {
    __mockupInput: { type: string; trusted: boolean }[]
  }).__mockupInput)
  expect(input.some((event) => event.type === 'keydown')).toBe(true)
  expect(input.some((event) => event.type === 'pointerdown')).toBe(true)
  expect(input.every((event) => event.trusted)).toBe(true)
  for (const locale of ['ru', 'en'] as const) for (const theme of ['light', 'dark'] as const) {
    await setEditorPreferences(locale, theme)
    await panel.$('.cs-card-models input[value="android-angular"] + span').scrollIntoView()
    const metrics = await browser.execute(() => {
      const body = document.querySelector('.cs-composition-body')!
      const tiles = [...body.querySelectorAll('.cs-card-models .cs-card-frame-choice')]
      return { overflow: body.scrollWidth > body.clientWidth,
        rows: new Set(tiles.map((tile) => tile.getBoundingClientRect().y)).size,
        tiles: tiles.length, wide: tiles.some((tile) => tile.scrollWidth > tile.clientWidth) }
    })
    expect(metrics).toEqual({ overflow: false, rows: 2, tiles: 4, wide: false })
    await browser.saveScreenshot(`${directory}/mockups-${locale}-${theme}.png`)
    const rotate = panel.$('.cs-card-orientation-toggle')
    await rotate.scrollIntoView({ block: 'center' })
    await expect(rotate).toHaveText(locale === 'ru' ? 'Вертикальная' : 'Portrait')
    await expect(rotate).toHaveAttribute('title', locale === 'ru' ? 'Повернуть горизонтально' : 'Rotate to landscape')
    await panel.$('.cs-card-orientation').saveScreenshot(`${directory}/phone-rotate-${locale}-${theme}.png`)
  }
}
