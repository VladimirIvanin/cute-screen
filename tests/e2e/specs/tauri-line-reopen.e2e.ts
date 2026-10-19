import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import {
  lineDefaultsHost,
  lineDocument,
} from '../line'
import { waitForStableCanvas } from '../canvas-ready'

describe('line after native restart', () => {
  it('restores semantic lines and independent style/interaction preferences', async () => {
    await $('.cs-toolrail [data-tool-id="line"]').waitForEnabled()
    await waitForStableCanvas()
    const lines = (await lineDocument()).layers.filter((layer) => layer.kind === 'arrow' && layer.payload.annotationTool === 'line')
    expect(lines).toHaveLength(6)
    await $('.cs-toolrail [data-tool-id="line"]').click()
    const host = await lineDefaultsHost()
    await expect($(`${host} [data-control="autoAlignAxes"]`)).toHaveAttribute('aria-pressed', 'false')
    await $(`${host} [data-control="stroke"] button`).click()
    await expect($('input[aria-label="Thickness"]')).toHaveValue('6')
    await expect($('.cs-arrow-toolbar-options button[aria-label="Dotted"]')).toHaveAttribute('aria-pressed', 'true')
    await browser.saveScreenshot('artifacts/tauri-e2e/line-reopened.png')
    await browser.keys('Escape')
    if (host.includes('popover')) await browser.keys('Escape')
    await $('.cs-toolrail [data-tool-id="arrow"]').click()
    const arrowHost = await lineDefaultsHost()
    await $(`${arrowHost} [data-control="stroke"] button`).click()
    await expect($('input[aria-label="Thickness"]')).toHaveValue('8')
  })
})
