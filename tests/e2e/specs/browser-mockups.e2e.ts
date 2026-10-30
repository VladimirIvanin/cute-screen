import { browser } from '@wdio/globals'
import { openDrawingHarness } from './browser-m06-test-kit'
import { verifyMockups } from '../mockups'
import type { EditorDocumentV1 } from '../../../packages/editor-core/src/document/types'

describe('phone and browser mockups', () => {
  it('selects models with trusted keyboard, preserves settings and fits the bilingual dock', async () => {
    await browser.setWindowSize(1024, 900)
    await openDrawingHarness(true, true)
    await verifyMockups(() => browser.execute(() => (window as typeof window & {
      __cuteScreenE2eM05: { snapshot(): EditorDocumentV1 }
    }).__cuteScreenE2eM05.snapshot()), 'artifacts/browser-e2e')
  }).timeout(120000)
})
