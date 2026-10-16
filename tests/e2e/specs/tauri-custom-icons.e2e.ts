import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { verifyIconTools } from '../custom-icons'
import { setShellPreferences } from './browser-m06-test-kit'

const evidence = path.resolve('artifacts/custom-icons', process.env.CUTE_SCREEN_ICON_EVIDENCE ?? 'after')

describe('icons through production Capture → Quick → Editor', () => {
  before(async () => {
    await mkdir(evidence, { recursive: true })
    await browser.setWindowSize(1024, 750)
    await expect($('button[aria-label="Eyedropper"]')).toBeDisabled()
    await browser.saveScreenshot(path.join(evidence, 'native-empty-disabled.png'))
  })

  afterEach(async () => {
    if (await $('.cs-quick-actions button:last-child').isExisting()) {
      await $('.cs-quick-actions button:last-child').click()
      await browser.tauri.switchWindow('main')
    }
  })

  it('preserves drawing, sampling, history and keyboard input through the handoff', async () => {
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await verifyIconTools('en', path.join(evidence, 'native-quick.png'))
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await expect($('.cs-canvas-ready')).toExist()
    await verifyIconTools('en', path.join(evidence, 'native-editor.png'))
    for (const locale of ['en', 'ru'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        await setShellPreferences(locale, theme)
        const label = locale === 'ru' ? 'Выделитель' : 'Highlighter'
        await expect($(`button[aria-label="${label}"] svg`)).toBeDisplayed()
        await browser.saveScreenshot(path.join(evidence, `native-editor-${locale}-${theme}.png`))
      }
    }
  })
})
