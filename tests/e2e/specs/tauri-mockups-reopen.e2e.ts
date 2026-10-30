import { readFile } from 'node:fs/promises'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import type { EditorDocumentV1 } from '../../../packages/editor-core/src/document/types'
import { cardDocument } from '../publication-card'
import { waitForStableCanvas } from '../canvas-ready'

describe('mockups after native restart', () => {
  it('restores the exact frame and shows the persisted controls', async () => {
    await expect($('.cs-canvas-ready')).toExist()
    await waitForStableCanvas()
    const saved = JSON.parse(await readFile('artifacts/tauri-e2e/mockups-document.json', 'utf8')) as EditorDocumentV1
    expect((await cardDocument()).presentation.composition).toEqual(saved.presentation.composition)
    await $('button[aria-label="Appearance"]').click()
    await $('.cs-composition-panel').$('summary=Frame').click()
    await expect($('.cs-card-models input[value="android-angular"]')).toBeChecked()
    await expect($('.cs-composition-panel').$('label*=System details').$('input')).toBeChecked()
    await browser.saveScreenshot('artifacts/tauri-e2e/mockups-reopen.png')
  }).timeout(90000)
})
