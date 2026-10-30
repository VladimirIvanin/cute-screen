import {
  readFile,
  writeFile,
  stat,
} from 'node:fs/promises'
import { loadImage } from '@napi-rs/canvas'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { resolveCompositionLayout } from '../../../packages/editor-core/src/composition/layout'
import { nativeImageIngress } from '../image-ingress'
import {
  cardDocument,
  cardNative,
} from '../publication-card'
import { verifyMockups } from '../mockups'
import { waitForStableCanvas } from '../canvas-ready'

describe('native device mockups', () => {
  it('exports decoded phones and retro browsers and saves the model for reopen', async () => {
    await browser.setWindowSize(1024, 900)
    await nativeImageIngress('picker')
    await $('button[aria-label="Open image"]').click()
    await browser.waitUntil(async () => (await cardDocument()).canvas.width === 3840)
    await waitForStableCanvas()
    await verifyMockups(cardDocument, 'artifacts/tauri-e2e', async (name) => {
      const output = await cardNative<string>('test_result_export', { cancel: false })
      let previous = 0
      try {
        previous = (await stat(output)).mtimeMs
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      await $('button[aria-label="Export"]').click()
      await browser.waitUntil(async () => (await stat(output)).mtimeMs > previous, { timeout: 90000 })
      await expect($('.cs-action-feedback')).toHaveText(expect.stringContaining('PNG exported'), { wait: 90000 })
      const bytes = await readFile(output)
      const image = await loadImage(bytes)
      const layout = resolveCompositionLayout(await cardDocument())
      expect([image.width, image.height]).toEqual([layout.width, layout.height])
      await writeFile(`artifacts/tauri-e2e/mockup-${name}-export.png`, bytes)
    })
    await writeFile('artifacts/tauri-e2e/mockups-document.json', JSON.stringify(await cardDocument()))
    await browser.waitUntil(() => browser.execute(() => !document.querySelector('.cs-save-status')))
  }).timeout(240000)
})
