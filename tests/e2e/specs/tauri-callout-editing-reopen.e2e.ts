import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { selectionDocument } from '../selection-interactions'
import { waitForStableCanvas } from '../canvas-ready'

describe('callout after a separate native launch', () => {
  it('restores its saved geometry, appearance and defaults', async () => {
    await $('button[data-tool-id="callout"]').waitForEnabled()
    await waitForStableCanvas()
    const callout = (await selectionDocument()).layers.find((layer) => layer.kind === 'callout')!
    expect(callout.payload).toMatchObject({ targetMarker: 'ring', labelMarker: 'none', frame: { kind: 'card' }, route: { path: 'orthogonal' } })
    await $('button[aria-label="Callout"]').click({ button: 'right' })
    await expect($('.cs-callout-toolbar')).toBeDisplayed()
    expect(await $('.cs-callout-toolbar button[aria-label="Endpoints"]').getText()).toContain('Ring')
    await browser.saveScreenshot('artifacts/tauri-e2e/callout-reopened.png')
  })
})
