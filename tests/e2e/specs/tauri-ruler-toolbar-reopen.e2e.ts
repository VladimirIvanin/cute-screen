import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import {
  assertRulerLength,
  rulerDocument,
  selectLastRuler,
} from '../ruler-toolbar'
import { waitForStableCanvas } from '../canvas-ready'

describe('ruler measurement after a separate native launch', () => {
  it('restores the saved base and visible-area measurement', async () => {
    await waitForStableCanvas()
    const document = await rulerDocument()
    expect(document.layers.filter((layer) => layer.kind === 'ruler')).toHaveLength(2)
    expect(document.crop).not.toBeNull()
    await selectLastRuler()
    expect((await rulerDocument()).layers.at(-1)?.payload).toMatchObject({ unit: 'percent', percentBasis: 'canvasWidth' })
    await assertRulerLength('canvasWidth')
    await browser.saveScreenshot('artifacts/tauri-e2e/ruler-ux-reopened.png')
    await $('button[aria-label="Ruler"]').click()
    await expect($('.cs-tool-defaults-toolbar .cs-ruler-measure-trigger')).toHaveText('% of width')
  })
})
