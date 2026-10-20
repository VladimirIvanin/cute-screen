import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { readFile } from 'node:fs/promises'
import {
  verifyCreativeFontExport,
  verifyCreativeFontLayers,
} from '../creative-fonts'
import { cardDocument } from '../publication-card'
import { waitForStableCanvas } from '../canvas-ready'

describe('creative fonts after native restart', () => {
  it('restores all eight families and exports the same decoded pixels', async () => {
    await expect($('.cs-canvas-ready')).toExist()
    await waitForStableCanvas()
    const saved = JSON.parse(await readFile('artifacts/tauri-e2e/creative-fonts-document.json', 'utf8')) as Awaited<ReturnType<typeof cardDocument>>
    expect((await cardDocument()).layers).toEqual(saved.layers)
    await verifyCreativeFontLayers()
    const hash = await verifyCreativeFontExport('creative-fonts-reopened-export')
    expect(hash).toBe(await readFile('artifacts/tauri-e2e/creative-fonts-export-sha256.txt', 'utf8'))
    await $('.cs-zoom-fit').click()
    await waitForStableCanvas()
    await browser.saveScreenshot('artifacts/tauri-e2e/creative-fonts-reopened.png')
  }).timeout(120000)
})
