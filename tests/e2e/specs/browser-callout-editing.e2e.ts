import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { openHarness } from './browser-v7-rich-text-test-kit'
import { exerciseCalloutEditing } from '../callout-editing'

describe('editable callout routes and cards', () => {
  it('creates, edits geometry and appearance, cancels and undoes through the production UI', async () => {
    await openHarness()
    await browser.url('/?m05=1&m05viewport=1')
    await expect($('.cs-canvas-ready')).toExist()
    await exerciseCalloutEditing('artifacts/browser-e2e')
  }).timeout(300_000)
})
