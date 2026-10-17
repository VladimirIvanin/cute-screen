import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { waitForStableCanvas } from '../canvas-ready'
import { imageDocument } from '../image-ingress'

describe('imported images after native restart', () => {
  it('restores all immutable images and decodes them before the first frame', async () => {
    await $('button[data-tool-id="image"]').waitForEnabled()
    await waitForStableCanvas()
    const content = (await imageDocument()).layers.filter((layer) => layer.kind === 'image' && layer.payload.role === 'content')
    expect(content).toHaveLength(6)
    expect(content.filter((layer) => layer.payload.intrinsicWidth === 3840)).toHaveLength(2)
    await expect($('.cs-tool-error[role="alert"]')).not.toExist()
    await browser.saveScreenshot('artifacts/tauri-e2e/image-import-reopened.png')
  })
})
