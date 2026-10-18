import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { verifyBrandEyes } from '../brand-eyes'
import { setShellPreferences } from './browser-m06-test-kit'

describe('brand eyes through the real editor WebView', () => {
  it('uses trusted pointer input after production mount in both themes', async () => {
    await mkdir('artifacts/brand-eyes', { recursive: true })
    await browser.setWindowSize(1280, 800)
    await expect($('.cs-brand')).toBeDisplayed()
    for (const theme of ['light', 'dark'] as const) {
      await setShellPreferences('en', theme)
      await verifyBrandEyes('.cs-brand', path.resolve(`artifacts/brand-eyes/native-${theme}.png`))
    }
  }).timeout(120000)
})
