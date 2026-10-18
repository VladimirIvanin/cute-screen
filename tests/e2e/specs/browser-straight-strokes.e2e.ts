import {
  $,
  browser,
} from '@wdio/globals'
import {
  openDrawingHarness,
  setShellPreferences,
} from './browser-m06-test-kit'
import { verifyStraightStrokes } from '../straight-strokes'
import { waitForStableCanvas } from '../canvas-ready'
import { expectToolTooltip } from '../tool-tooltip'

describe('Shift straight drawing', () => {
  for (const dpr of [1, 2]) {
    for (const actualSize of [false, true]) {
      it(`draws mixed strokes at DPR ${dpr}, ${actualSize ? '1:1' : 'Fit'} with both Shift keys`, async () => {
        await browser.setViewport({ width: 1280, height: 900, devicePixelRatio: dpr })
        await openDrawingHarness(true)
        if (actualSize) await $('.cs-zoom-value').click()
        await waitForStableCanvas()
        await verifyStraightStrokes('artifacts/browser-e2e', `straight-strokes-${dpr}-${actualSize ? 'actual' : 'fit'}`)
      })
    }
  }
  it('keeps localized tooltips concise at 1024px', async () => {
    await browser.setViewport({ width: 1024, height: 800, devicePixelRatio: 1 })
    await openDrawingHarness(true)
    for (const locale of ['en', 'ru'] as const) {
      await setShellPreferences(locale, locale === 'ru' ? 'dark' : 'light')
      for (const tool of ['pencil', 'marker']) {
        await $(`.cs-toolrail button[data-tool-id="${tool}"]`).moveTo()
        await expectToolTooltip(tool === 'pencil'
          ? locale === 'ru' ? 'Карандаш (P)' : 'Pencil (P)'
          : locale === 'ru' ? 'Выделитель (M)' : 'Highlighter (M)')
        await $('.cs-brand').moveTo()
      }
    }
  })
})
