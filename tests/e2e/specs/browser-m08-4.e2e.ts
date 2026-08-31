import path from 'node:path'
import { $, $$, browser, expect } from '@wdio/globals'
import {
  m08Snapshot,
  openM08,
  canvasPoint,
  drawPrecisionTool,
} from './browser-m08-test-kit'

describe('M08 crop and precision acceptance in browser mode', () => {
  it('creates precision layers with loupe-only auto-selection and preserves active tools', async () => {
    await browser.setWindowSize(1280, 800)
    await openM08()
    await $('button[aria-label="Show layers"]').click()

    for (const [index, label, kind] of [
      [0, 'Hide data', 'censor'],
      [1, 'Spotlight', 'spotlight'],
      [2, 'Ruler', 'ruler'],
    ] as const) {
      await drawPrecisionTool(label, kind, index)
      expect(await $$('.cs-layer-row.is-selected')).toHaveLength(0)
      if (kind === 'ruler') {
        await browser.saveScreenshot(
          path.resolve('artifacts/browser-e2e/m08-ruler-visual.png'),
        )
      }
    }

    const beforeCancel = (await m08Snapshot()).document.layers.length
    const start = await canvasPoint(280, 40)
    const end = await canvasPoint(330, 80)
    await browser
      .action('pointer', { id: 'm08-cancel-censor' })
      .move({ origin: 'viewport', x: start.x, y: start.y, duration: 0 })
      .down({ button: 'left' })
      .move({ origin: 'viewport', x: end.x, y: end.y, duration: 40 })
      .cancel()
      .perform()
    expect((await m08Snapshot()).document.layers).toHaveLength(beforeCancel)

    await drawPrecisionTool('Loupe', 'loupe', 3)
    const selected = await $$('.cs-layer-row.is-selected')
    expect(selected).toHaveLength(1)
    await expect(selected[0]!).toHaveAttribute('data-layer-id')
    await expect($('button[aria-label="Loupe"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
