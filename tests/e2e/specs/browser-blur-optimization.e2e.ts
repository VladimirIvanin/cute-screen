import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { openDrawingHarness } from './browser-m06-test-kit'
import { verifyFreeformCensor } from '../censor-freeform'
import {
  blurDocument,
  verifyBlurOptimization,
  verifyBlurOtherToolsAndFlip,
} from '../blur-optimization'

describe('blur optimization in the production editor', () => {
  it('keeps censorship and blurred appearance live through gestures, cancel and history', async () => {
    await mkdir('artifacts/blur-optimization/browser', { recursive: true })
    await browser.setWindowSize(1280, 900)
    await openDrawingHarness(true, true)
    await browser.execute(async (url) => {
      const state = window as typeof window & { __cuteScreenE2eImages: { chooseFixture(url: string): Promise<void> } }
      await state.__cuteScreenE2eImages.chooseFixture(url)
    }, `/@fs/${path.resolve('tests/fixtures/generated/ui-4k.png').replaceAll('\\', '/')}`)
    const before = (await blurDocument()).layers.length
    await $('[data-tool-id="image"]').click()
    await browser.waitUntil(async () => (await blurDocument()).layers.length === before + 1)
    expect((await blurDocument()).layers.at(-1)!.kind).toBe('image')
    await verifyBlurOptimization('artifacts/blur-optimization/browser')
    await verifyBlurOtherToolsAndFlip('artifacts/blur-optimization/browser')
    await verifyFreeformCensor('artifacts/blur-optimization/browser')
  }).timeout(120000)
})
