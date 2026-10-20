import {
  $,
  browser,
} from '@wdio/globals'
import { verifyAppearanceGradientDrag } from '../appearance-gradient'
import { openDrawingHarness } from './browser-m06-test-kit'
import type { EditorDocumentV1 } from '../../../packages/editor-core/src/document/types'

async function stops() {
  return browser.execute(() => {
    const state = window as typeof window & { __cuteScreenE2eM05: { snapshot(): EditorDocumentV1 } }
    return state.__cuteScreenE2eM05.snapshot().presentation.composition!.background.linear.stops
  })
}

describe('appearance gradient dragging', () => {
  it('moves an existing stop smoothly without creating another point', async () => {
    await browser.setWindowSize(1280, 900)
    await openDrawingHarness(true)
    await $('button[aria-label="Appearance"]').click()
    await $('.cs-composition-panel').$('button=Padding').click()
    await verifyAppearanceGradientDrag(stops)
    await browser.saveScreenshot('artifacts/browser-e2e/composition-gradient-drag.png')
  }).timeout(120000)
})
