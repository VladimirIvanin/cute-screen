import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { verifyCropCursors } from '../crop-cursors'
import {
  openM08,
  chooseOption,
  m08Snapshot,
} from './browser-m08-test-kit'

describe('crop hover cursors', () => {
  it('shows all eight resize directions on the initial frame and a crop preset', async () => {
    await browser.setWindowSize(1024, 700)
    await openM08()
    await $('button[aria-label="Crop"]').click()
    await verifyCropCursors({ x: 0, y: 0, width: 400, height: 300 })
    await chooseOption('Preset', '1:1')
    await verifyCropCursors({ x: 50, y: 0, width: 300, height: 300 })
    await browser.keys('Escape')
    await expect($('button[aria-label="Select"]')).toHaveAttribute('aria-pressed', 'true')
    expect((await m08Snapshot()).document.crop).toBeNull()
  })
})
