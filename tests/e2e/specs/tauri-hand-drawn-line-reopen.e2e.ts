import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { readFile } from 'node:fs/promises'
import { lineDocument } from '../line'
import { drawingDefaultsHost } from '../hand-drawn'
import { waitForStableCanvas } from '../canvas-ready'
import type { EditorDocumentV1 } from '../../../packages/editor-core/src'

describe('hand-drawn line after native relaunch', () => {
  it('restores seeds and independently remembered line defaults', async () => {
    await waitForStableCanvas()
    const previous = JSON.parse(await readFile('artifacts/tauri-e2e/hand-drawn-line-document.json', 'utf8')) as EditorDocumentV1
    expect((await lineDocument()).layers.slice(-2)).toEqual(previous.layers.slice(-2))
    await $('.cs-toolrail [data-tool-id="line"]').click()
    const host = await drawingDefaultsHost()
    await $(`${host} [data-control="stroke"] button`).click()
    await expect($('.cs-arrow-toolbar-popover').$('button=Hand-drawn')).toHaveAttribute('aria-pressed', 'true')
    await browser.saveScreenshot('artifacts/tauri-e2e/hand-drawn-line-reopened.png')
  }).timeout(120000)
})
