import { Key } from 'webdriverio'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import {
  openDrawingHarness,
  setShellPreferences,
} from './browser-m06-test-kit'
import { verifySelectionInteractions } from '../selection-interactions'

describe('selection interaction policies', () => {
  for (const locale of ['en', 'ru'] as const) {
    for (const theme of ['light', 'dark'] as const) {
      for (const zoom of [25, 100, 400]) {
        it(`uses selection policies ${locale}-${theme}-${zoom}`, async () => {
          await browser.setWindowSize(1280, 900)
          await openDrawingHarness(true)
          await setShellPreferences(locale, theme)
          await $('.cs-zoom-value').click()
          // The zoom controls advance in ten percent steps; fit reset starts at 100.
          const adjustment = zoom < 100 ? '.cs-zoom-controls button:first-child' : '.cs-zoom-controls button:last-child'
          for (let step = 0; step < Math.floor(Math.abs(zoom - 100) / 10); step += 1) await $(adjustment).click()
          if (zoom === 25) {
            const scene = $('.cs-canvas:not(.cs-canvas-overlay)')
            await browser.action('key', { id: 'zoom-modifier' }).down(Key.Control).perform(true)
            for (let step = 0; step < 2; step += 1) await browser.action('wheel').scroll({
              origin: await scene.getElement(), x: 0, y: 0, deltaY: 100, deltaX: 0,
            }).perform(true)
            await browser.action('key', { id: 'zoom-modifier' }).up(Key.Control).perform()
          }
          await expect($('.cs-zoom-controls')).toHaveAttribute('data-zoom', String(zoom))
          await verifySelectionInteractions(`artifacts/browser-e2e/selection-${locale}-${theme}-${zoom}`, locale)
        }).timeout(120_000)
      }
    }
  }
})
