import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import {
  highlighterToolbarSelector,
  verifyCollapsedHighlighterEffects,
  verifyHighlighter,
} from '../highlighter-toolbar'
import { waitForStableCanvas } from '../canvas-ready'
import { waitForShapeAnimation } from '../shape-toolbar'
import { setShellPreferences } from './browser-m06-test-kit'
import { verifyCompositionHighlighterPreview } from '../highlighter-live-preview'

describe('highlighter through production capture', () => {
  it('shows the collapsed effects in Quick and Editor in both languages and themes', async () => {
    await browser.setWindowSize(1024, 700)
    await expect($('h1')).toHaveText('Capture your first screen')
    await $('button[aria-label="Capture"]').click()
    await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
    await browser.tauri.switchWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await expect($('.cs-canvas-ready')).toExist()
    await waitForStableCanvas()
    await browser.setWindowSize(1024, 700)
    for (const locale of ['en', 'ru'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        await setShellPreferences(locale, theme)
        await $('.cs-toolrail button[data-tool-id="marker"]').click()
        const prefix = `highlighter-editor-${locale}-${theme}`
        await verifyCollapsedHighlighterEffects('artifacts/tauri-e2e', prefix, locale)
        await $(highlighterToolbarSelector).$('button[aria-label="' + (locale === 'ru' ? 'Режим' : 'Effect') + '"]').click()
        await waitForShapeAnimation()
        await browser.saveScreenshot(`artifacts/tauri-e2e/${prefix}-menu.png`)
        await browser.keys('Escape')
        await $('button[aria-label="' + (locale === 'ru' ? 'Снимок' : 'Capture') + '"]').click()
        await browser.tauri.switchWindow('quick-capture')
        await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
        await $('.cs-toolrail button[data-tool-id="marker"]').click()
        await verifyCollapsedHighlighterEffects('artifacts/tauri-e2e', `highlighter-quick-${locale}-${theme}`, locale)
        await $(highlighterToolbarSelector).$('button[aria-label="' + (locale === 'ru' ? 'Режим' : 'Effect') + '"]').click()
        await waitForShapeAnimation()
        await browser.saveScreenshot(`artifacts/tauri-e2e/highlighter-quick-${locale}-${theme}-menu.png`)
        await browser.keys('Escape')
        if (await $('.cs-tool-configure-popover-host').isDisplayed()) await browser.keys('Escape')
        await $('.cs-quick-actions button:first-child').click()
        await browser.tauri.switchWindow('main')
        await expect($('.cs-canvas-ready')).toExist()
        await waitForStableCanvas()
      }
    }
  }).timeout(300000)
  it('previews composition strokes while held and restores Escape with trusted native input', async () => {
    await setShellPreferences('en', 'dark')
    await browser.setWindowSize(1280, 900)
    await verifyCompositionHighlighterPreview('artifacts/tauri-e2e', 'highlighter-live-native')
  }).timeout(120000)
  it('draws and configures the highlighter in Quick Capture and the editor', async () => {
    await setShellPreferences('en', 'dark')
    await $('button[aria-label="Capture"]').click()
    await browser.tauri.switchWindow('quick-capture')
    await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
    await verifyHighlighter('artifacts/tauri-e2e', 'highlighter-quick', true)
    await $('.cs-quick-actions button:first-child').click()
    await browser.tauri.switchWindow('main')
    await expect($('.cs-canvas-ready')).toExist()
    await waitForStableCanvas()
    await verifyHighlighter('artifacts/tauri-e2e', 'highlighter-editor', true)
  }).timeout(180000)
})
