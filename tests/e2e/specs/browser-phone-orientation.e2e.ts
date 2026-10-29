import { browser } from '@wdio/globals'
import { openDrawingHarness } from './browser-m06-test-kit'
import { verifyPhoneOrientation } from '../phone-orientation'
import type { EditorDocumentV1 } from '../../../packages/editor-core/src/document/types'

async function snapshot(): Promise<EditorDocumentV1> {
  return browser.execute(() => (window as typeof window & {
    __cuteScreenE2eM05: { snapshot(): EditorDocumentV1 }
  }).__cuteScreenE2eM05.snapshot())
}

describe('phone orientation on first application', () => {
  for (const entry of ['starter', 'tile'] as const) {
    it(`matches the screenshot once from ${entry} and keeps manual changes`, async () => {
      await browser.setWindowSize(1280, 900)
      await openDrawingHarness(true)
      await verifyPhoneOrientation(snapshot, entry, 'artifacts/browser-e2e')
    }).timeout(60000)
  }
})
