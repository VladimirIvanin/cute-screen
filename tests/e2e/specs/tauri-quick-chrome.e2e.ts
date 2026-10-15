import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { finishAreaQuickCaptureInEditor } from '../quick-capture'

const executeFile = promisify(execFile)

async function startCapture(): Promise<void> {
  const executable = process.env.CUTE_SCREEN_WDIO_APP_BINARY
  if (!executable) throw new Error('Missing test-harness binary')
  await executeFile(executable, ['show'])
  await browser.tauri.switchWindow('main')
  await $('button[aria-label="Capture"]').click()
  await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
  await browser.tauri.switchWindow('quick-capture')
  await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
}

describe('Quick Capture chrome in a real Tauri webview', () => {
  it('configures through real right-click and nested SVG controls without closing Quick Capture', async () => {
    await startCapture()
    await browser.execute(() => {
      document.addEventListener('contextmenu', (event) => {
        document.documentElement.dataset.e2eContextTrusted = String(event.isTrusted)
      }, { capture: true, once: true })
      window.addEventListener('keydown', (event) => {
        document.documentElement.dataset.e2eKeyTrusted = String(event.isTrusted)
      }, { capture: true, once: true })
    })
    await $('button[aria-label="Arrow"]').click({ button: 'right' })
    await expect($('.cs-tool-configure-popover-host')).toBeDisplayed()
    expect(await $('html').getAttribute('data-e2e-context-trusted')).toBe('true')
    await $('.cs-tool-configure-popover-host [data-control="stroke"] button').click()
    await expect($('.cs-arrow-toolbar-popover')).toBeDisplayed()
    await $('.cs-arrow-toolbar-popover').$('button=2 px').click()
    await browser.saveScreenshot(path.resolve('artifacts/tauri-e2e/quick-native-tool-settings.png'))
    await browser.keys('Escape')
    expect(await $('html').getAttribute('data-e2e-key-trusted')).toBe('true')
    await expect($('.cs-tool-configure-popover-host')).not.toExist()
    await expect($('.cs-quick-actions')).toBeDisplayed()
    await browser.keys('Escape')
    await expect($('button[aria-label="Select"]')).toHaveAttribute('aria-pressed', 'true')
    await expect($('.cs-quick-actions')).toBeDisplayed()
    await $('.cs-quick-actions button:last-child').click()
  })
  it('keeps tool settings, keyboard focus and the handoff to Editor', async () => {
    await startCapture()
    await expect($('button[aria-label="Undo"]')).toBeDisabled()
    await $('button[aria-label="Pencil"]').click()
    await expect($('.cs-context-toolbar')).toBeDisplayed()
    await expect($('button[aria-label="Pencil"]')).toHaveAttribute('aria-pressed', 'true')
    await browser.keys('Tab')
    expect(await browser.execute(() => document.activeElement?.matches('button:focus-visible'))).toBe(true)
    await browser.saveScreenshot(path.resolve('artifacts/tauri-e2e/quick-tabler-focus.png'))
    await finishAreaQuickCaptureInEditor()
    await expect($('button[aria-label="Copy"]')).toBeEnabled()
  })

  it('copies a quick draft and dismisses the surface only after success', async () => {
    await startCapture()
    await $('.cs-quick-actions button:nth-child(2)').click()
    await browser.waitUntil(async () => !(await $('.cs-quick-actions').isExisting()))
    await expect($('.cs-quick-error')).not.toExist()
  })

  it('cancels the quick draft with Escape and can start another capture', async () => {
    await startCapture()
    await browser.keys('Escape')
    await browser.waitUntil(async () => !(await $('.cs-quick-actions').isExisting()))
    await startCapture()
    await expect($('button=Flip horizontally')).not.toExist()
    await expect($('button=Flip vertically')).not.toExist()
    await $('.cs-quick-actions button:last-child').click()
    await browser.waitUntil(async () => !(await $('.cs-quick-actions').isExisting()))
  })
})
