import { readFile } from 'node:fs/promises'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import type { EditorDocumentV1 } from '../../../packages/editor-core/src/document/types'
import {
  cardDocument,
  cardNative,
} from '../publication-card'
import { waitForStableCanvas } from '../canvas-ready'
import { verifyBackgroundThumbnail } from '../background-thumbnail'

describe('publication card after native restart', () => {
  it('restores frame, background bytes and independent reusable preset', async () => {
    await expect($('.cs-canvas-ready')).toExist()
    await waitForStableCanvas()
    const saved = JSON.parse(await readFile('artifacts/tauri-e2e/composition-document.json', 'utf8')) as EditorDocumentV1
    expect((await cardDocument()).presentation.composition).toEqual(saved.presentation.composition)
    await $('button[aria-label="Appearance"]').click()
    await verifyBackgroundThumbnail(64, 64, 'artifacts/tauri-e2e')
    await expect($('.cs-composition-panel').$('button*=Cute publication')).toExist()
    const materials = await cardNative<Array<{ kind: string }>>('materials_list')
    expect(materials.filter((item) => item.kind === 'preset')).toHaveLength(1)
    expect(materials.filter((item) => item.kind === 'background')).toHaveLength(0)
    await $('button[aria-label="Copy"]').click()
    await expect($('.cs-action-feedback.is-success')).toHaveText('Result copied', { wait: 90000 })
    await browser.saveScreenshot('artifacts/tauri-e2e/composition-reopened.png')
  }).timeout(120000)
})
