import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { shapeDocument } from '../shape-toolbar'
import { waitForStableCanvas } from '../canvas-ready'

describe('bundled emoji after native restart', () => {
  it('resolves the saved pack before the first rendered frame', async () => {
    await waitForStableCanvas()
    const emoji = (await shapeDocument()).layers.filter((layer) => layer.kind === 'emoji')
    expect(emoji).toHaveLength(2)
    expect(emoji.every((layer) => layer.payload.grapheme === '⚡')).toBe(true)
    await expect($('.cs-tool-error[role="alert"]')).not.toExist()
    await browser.saveScreenshot('artifacts/tauri-e2e/emoji-reopened.png')
  })
})
