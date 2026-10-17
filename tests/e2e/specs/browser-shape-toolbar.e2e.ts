import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import path from 'node:path'
import { verifyShapeDefaultsPlacement } from '../shape-defaults-placement'
import { verifyNumericOpacity } from '../numeric-controls'
import { verifyToolbarSeparators } from '../toolbar-separators'
import {
  openDrawingHarness,
  setShellPreferences,
} from './browser-m06-test-kit'
import {
  shapeDocument,
  verifyShapeToolbar,
  verifyShapeDefaults,
  verifyShapeCatalogue,
  drawShape,
  waitForShapeAnimation,
} from '../shape-toolbar'

describe('compact shape toolbar', () => {
  it('keeps nested shape defaults beside their trigger after selecting a callout', async () => {
    await browser.setWindowSize(1024, 700)
    await openDrawingHarness()
    await verifyShapeDefaultsPlacement('artifacts/browser-e2e', 'callout-shape-defaults')
  })
  it('edits every catalogue figure and preserves the object preview at 1024px', async () => {
    await browser.setWindowSize(1024, 700)
    await openDrawingHarness()
    await drawShape()
    await verifyShapeCatalogue('artifacts/browser-e2e', 'shape-expanded')
  })
  it('configures defaults with trusted right-click without editing the selection', async () => {
    await browser.setWindowSize(1280, 800)
    await openDrawingHarness()
    await verifyShapeToolbar('artifacts/browser-e2e', 'shape-large')
    await verifyShapeDefaults()
  })
  it('edits paint and history, then fits every locale/theme at 1024px', async () => {
    await browser.setWindowSize(1024, 700)
    await openDrawingHarness()
    await verifyShapeToolbar('artifacts/browser-e2e', 'shape')
    await verifyNumericOpacity('artifacts/browser-e2e', 'numeric-editor')
    const shape = (await shapeDocument()).layers.at(-1)!
    expect(shape).toMatchObject({ kind: 'shape', opacity: 0.75, blendMode: 'multiply', payload: { cornerRadius: 12, fill: { kind: 'solid', color: { red: 0.2, green: 0.4, blue: 0.6 } }, stroke: { width: 8 } } })
    for (const width of [1024, 1280]) {
      await browser.setWindowSize(width, 800)
      for (const locale of ['en', 'ru'] as const) {
        for (const theme of ['light', 'dark'] as const) {
          await setShellPreferences(locale, theme)
          await $('.cs-selection-floating-toolbar [data-shape-control="appearance"]').click()
          await expect($('.cs-shape-popover select')).toHaveAttribute('aria-label', locale === 'ru' ? 'Режим наложения' : 'Blend mode')
          const fits = await browser.execute(() => {
            const rect = document.querySelector('.cs-shape-popover')!.getBoundingClientRect()
            return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight
          })
          expect(fits).toBe(true)
          await waitForShapeAnimation()
          await verifyToolbarSeparators('.cs-selection-floating-toolbar .cs-shape-toolbar', 3)
          await browser.saveScreenshot(path.resolve('artifacts/browser-e2e', `shape-${width}-${locale}-${theme}.png`))
          await browser.keys('Escape')
        }
      }
    }
  }).timeout(120000)
})
