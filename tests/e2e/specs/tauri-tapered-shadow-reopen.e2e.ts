import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { readFile } from 'node:fs/promises'
import { shadowLayers } from '../tapered-shadow'
import { waitForStableCanvas } from '../canvas-ready'

describe('tapered shadow persistence', () => {
  it('restores the editable arrow and remembered appearance after relaunch', async () => {
    await expect($('.cs-canvas-ready')).toExist()
    await waitForStableCanvas()
    const previous = JSON.parse(await readFile('artifacts/tauri-e2e/tapered-shadow-document.json', 'utf8')) as { layers: { id: string; annotationShadow?: string; payload: object }[] }
    const saved = previous.layers.find((layer) => layer.annotationShadow === 'strong')!
    expect((await shadowLayers()).find((layer) => layer.id === saved.id)).toEqual(saved)
    await $('button[aria-label="Arrow"]').click()
    await $('.cs-tool-defaults-toolbar [data-control="stroke"] button').click()
    await expect($('.cs-arrow-toolbar-popover').$('button=Tapered')).toHaveAttribute('aria-pressed', 'true')
    await browser.keys('Escape')
    await expect($('.cs-tool-defaults-toolbar .cs-annotation-shadow-trigger')).toHaveAttribute('aria-label', 'Shadow: Strong')
    await browser.saveScreenshot('artifacts/tauri-e2e/tapered-shadow-reopen.png')
  }).timeout(120000)
})
