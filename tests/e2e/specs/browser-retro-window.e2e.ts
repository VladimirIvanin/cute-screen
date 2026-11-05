import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { openDrawingHarness } from './browser-m06-test-kit'
import { setEditorPreferences } from '../editor-settings'
import { waitForStableCanvas } from '../canvas-ready'
import type { EditorDocumentV1 } from '../../../packages/editor-core/src/document/types'

async function snapshot() {
  return browser.execute(() => (window as typeof window & {
    __cuteScreenE2eM05: { snapshot(): EditorDocumentV1 }
  }).__cuteScreenE2eM05.snapshot())
}
describe('simple retro window styles', () => {
  it('selects independently from browser styles, supports keyboard/undo and fits RU/EN themes', async () => {
    await browser.setWindowSize(1024, 900)
    await openDrawingHarness(true, true)
    const layers = (await snapshot()).layers
    await $('button[aria-label="Appearance"]').click()
    await $('[data-composition-section="frame"]').click()
    const panel = $('.cs-composition-panel')
    const type = async (kind: string) => panel.$(`.cs-card-frame-types input[value="${kind}"] + span`).click()
    const style = async (id: string) => panel.$(`.cs-card-models input[value="${id}"] + span`).click()
    await type('window')
    await expect(panel.$('[aria-label="Window style"]')).toExist()
    await style('modern')
    await browser.keys('ArrowRight')
    await expect(panel.$('.cs-card-models input[value="retro-windows"]')).toBeChecked()
    expect((await snapshot()).presentation.composition!.frame.windowStyle).toBe('retro-windows')
    await $('button[aria-label="Undo"]').click()
    await expect(panel.$('.cs-card-models input[value="modern"]')).toBeChecked()
    await $('button[aria-label="Redo"]').click()
    await expect(panel.$('.cs-card-models input[value="retro-windows"]')).toBeChecked()
    await style('retro-mac')
    await type('browser')
    await style('retro-windows')
    await type('window')
    expect((await snapshot()).presentation.composition!.frame).toMatchObject({
      windowStyle: 'retro-mac', browserStyle: 'retro-windows',
    })
    await expect(panel.$('label=URL')).not.toExist()
    for (const windowStyle of ['retro-windows', 'retro-mac']) {
      await style(windowStyle)
      for (const locale of ['ru', 'en'] as const) for (const theme of ['light', 'dark'] as const) {
        await setEditorPreferences(locale, theme)
        await panel.$(`label*=${locale === 'ru' ? 'Тема рамки' : 'Frame theme'}`).$('select').selectByAttribute('value', theme)
        await panel.$('.cs-card-models').scrollIntoView({ block: 'center' })
        await waitForStableCanvas()
        const geometry = await browser.execute(() => {
          const body = document.querySelector('.cs-composition-body')!
          const tiles = [...body.querySelectorAll('.cs-card-models .cs-card-frame-choice')]
          return { overflow: body.scrollWidth > body.clientWidth, count: tiles.length,
            clipped: tiles.some((tile) => tile.scrollWidth > tile.clientWidth) }
        })
        expect(geometry).toEqual({ overflow: false, count: 3, clipped: false })
        await browser.saveScreenshot(`artifacts/browser-e2e/window-${windowStyle}-${locale}-${theme}.png`)
      }
    }
    expect((await snapshot()).layers).toEqual(layers)
  }).timeout(120000)
})
