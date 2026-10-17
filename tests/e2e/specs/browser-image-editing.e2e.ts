import {
  $,
  browser,
} from '@wdio/globals'
import { verifyImageEditing } from '../image-editing'
import { imageDocument } from '../image-ingress'
import { setShellPreferences } from './browser-m06-test-kit'

describe('image formatting and uninterrupted gesture pixels', () => {
  it('keeps an imported 4K image visible across gestures and compact settings', async function () {
    for (const width of [1024, 1600]) for (const locale of ['en', 'ru'] as const) for (const theme of ['light', 'dark'] as const) {
      await browser.setWindowSize(width, 900)
      await browser.url('/')
      await browser.execute(() => window.localStorage.clear())
      await browser.url('/?m05=1&m05viewport=1&imageIngress=1')
      await $('button[data-tool-id="image"]').waitForEnabled()
      await setShellPreferences(locale, theme)
      await browser.execute(async () => {
        const harness = (window as unknown as { __cuteScreenE2eImages: {
          choose(format: string, width: number, height: number): Promise<void>
          crop(): void
        } }).__cuteScreenE2eImages
        await harness.choose('png', 3840, 2160)
        harness.crop()
      })
      const before = (await imageDocument()).layers.length
      await browser.keys('g')
      await browser.waitUntil(async () => (await imageDocument()).layers.length === before + 1)
      await verifyImageEditing(`artifacts/browser-e2e/image-edit-${width}-${locale}-${theme}`)
    }
  }).timeout(600_000)
})
