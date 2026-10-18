import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { verifyBrandEyes } from '../brand-eyes'
import { setShellPreferences } from './browser-m06-test-kit'

describe('brand eyes in the production editor shell', () => {
  it('greets, tracks the whole brand and returns in both themes/locales', async () => {
    await mkdir('artifacts/brand-eyes', { recursive: true })
    await browser.setWindowSize(1280, 800)
    await browser.url('/?m04=1')
    await expect($('.cs-brand')).toBeDisplayed()
    for (const locale of ['ru', 'en'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        await setShellPreferences(locale, theme)
        await verifyBrandEyes('.cs-brand', path.resolve(`artifacts/brand-eyes/editor-${locale}-${theme}.png`))
        expect(await $('.cs-brand svg').getSize('width')).toBe(30)
      }
    }
  }).timeout(120000)
})
