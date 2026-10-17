import { waitForHistoryDocument } from '../history-soak'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { rulerDocument } from '../ruler-toolbar'
import { waitForStableCanvas } from '../canvas-ready'

describe('history after restarting the real application', () => {
  it('restores the selected older document with annotations and protection', async () => {
    await waitForHistoryDocument()
    await waitForStableCanvas()
    expect((await rulerDocument()).layers.some((layer) => layer.kind === 'numberedMarker')).toBe(true)
    expect((await rulerDocument()).crop).toMatchObject({ width: 2160, height: 2160 })
    await expect($('.cs-zoom-controls')).toHaveAttribute('data-zoom', '110')
    await $('.cs-history-trigger').click()
    const current = $('.cs-history-capture[aria-current="true"]')
    await expect(current).toHaveAttribute('aria-label', expect.stringContaining('protected'))
    const cards = await browser.$$('.cs-history-capture')
    expect(cards.length).toBe(2)
    await cards[0]!.click()
    await browser.waitUntil(async () => !(await rulerDocument()).layers.some((layer) => layer.kind === 'numberedMarker'))
  })
})
