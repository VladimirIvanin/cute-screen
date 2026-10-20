import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises'
import { loadImage } from '@napi-rs/canvas'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import {
  blurDocument,
  verifyBlurOptimization,
  verifyBlurOtherToolsAndFlip,
} from '../blur-optimization'
import { nativeImageIngress } from '../image-ingress'
import { verifyFreeformCensor } from '../censor-freeform'
import { cardNative } from '../publication-card'
import { resolveCompositionLayout } from '../../../packages/editor-core/src/composition/layout'

describe('blur optimization in WebView2', () => {
  it('updates a 4K source live and exports the exact committed composition', async () => {
    const directory = 'artifacts/blur-optimization/native'
    await mkdir(directory, { recursive: true })
    await browser.setWindowSize(1280, 900)
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await $('.cs-quick-actions button:first-child').waitForEnabled()
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await nativeImageIngress('picker')
    await $('button[aria-label="Open image"]').click()
    await browser.waitUntil(async () => (await blurDocument()).canvas.width === 3840)
    await verifyBlurOptimization(directory)
    await verifyBlurOtherToolsAndFlip(directory)
    await verifyFreeformCensor(directory)
    const doc = await blurDocument()
    const output = await cardNative<string>('test_result_export', { cancel: false })
    await $('button[aria-label="Export"]').click()
    await expect($('.cs-action-feedback')).toHaveText(expect.stringContaining('PNG exported'), { wait: 90000 })
    const bytes = await readFile(output)
    const image = await loadImage(bytes)
    const layout = resolveCompositionLayout(doc)
    expect([image.width, image.height]).toEqual([layout.width, layout.height])
    await writeFile(`${directory}/export.png`, bytes)
    await writeFile(`${directory}/export.json`, JSON.stringify({ width: image.width, height: image.height,
      bytes: bytes.length, source: doc.canvas, note: 'Re-decoded native PNG; exact filter bytes are covered by renderer reference tests.' }, null, 2))
  }).timeout(180000)
})
