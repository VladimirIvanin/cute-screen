import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { openHarness } from './browser-v7-rich-text-test-kit'
import { selectionDocument } from '../selection-interactions'
import path from 'node:path'

describe('empty callout production editing', () => {
  it('reopens the committed line and restores its caption without replacing the callout', async () => {
    await browser.setWindowSize(1440, 900)
    await openHarness()
    await browser.url('/?m05=1&m05viewport=1')
    await expect($('.cs-canvas-ready')).toExist()
    await $('button[aria-label="Callout"]').click()
    await browser.action('pointer').move({ origin: 'viewport', x: 550, y: 470 }).down({ button: 'left' })
      .move({ origin: 'viewport', x: 780, y: 340, duration: 160 }).up({ button: 'left' }).perform()
    await expect($('[aria-label="Callout editor"]')).toBeDisplayed()
    await browser.keys(['Control', 'Enter'])
    await expect($('[aria-label="Callout editor"]')).not.toExist()
    const empty = (await selectionDocument()).layers.at(-1)!
    expect(empty.kind).toBe('callout')
    if (empty.kind !== 'callout') throw new Error('expected an empty callout')
    expect(empty.payload.content).toMatchObject({ text: '', spans: [], paragraphs: [] })
    await browser.action('pointer').move({ origin: 'viewport', x: 550, y: 410 }).down({ button: 'left' }).up({ button: 'left' })
      .pause(40).down({ button: 'left' }).up({ button: 'left' }).perform()
    await expect($('[aria-label="Callout editor"]')).toBeDisplayed()
    await browser.keys('Caption after empty commit')
    await browser.keys(['Control', 'Enter'])
    const captioned = (await selectionDocument()).layers.at(-1)!
    if (captioned.kind !== 'callout') throw new Error('expected the captioned callout')
    expect(captioned.id).toBe(empty.id)
    expect(captioned.payload.content).toMatchObject({ text: 'Caption after empty commit' })
    await browser.saveScreenshot(path.resolve('artifacts/browser-e2e/callout-empty-captioned.png'))
  }).timeout(180_000)
})
