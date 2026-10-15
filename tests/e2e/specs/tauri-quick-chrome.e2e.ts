import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { $, browser, expect } from '@wdio/globals'
import { finishAreaQuickCaptureInEditor } from '../quick-capture'

const executeFile = promisify(execFile)

async function startCapture(): Promise<void> {
  const executable = process.env.CUTE_SCREEN_WDIO_APP_BINARY
  if (!executable) throw new Error('Missing test-harness binary')
  await executeFile(executable, ['show'])
  await browser.switchToWindow('main')
  await $('button[aria-label="Capture"]').click()
  await browser.waitUntil(async () =>
    (await browser.getWindowHandles()).includes('quick-capture'),
  )
  await browser.switchToWindow('quick-capture')
  await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
}

describe('Quick Capture chrome in a real Tauri webview', () => {
  it('keeps tool settings, keyboard focus and the handoff to Editor', async () => {
    await startCapture()
    await expect($('button[aria-label="Undo"]')).toBeDisabled()
    await $('button[aria-label="Pencil"]').click()
    await expect($('.cs-context-toolbar')).toBeDisplayed()
    await expect($('button[aria-label="Pencil"]')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await browser.keys('Tab')
    expect(
      await browser.execute(() =>
        document.activeElement?.matches('button:focus-visible'),
      ),
    ).toBe(true)
    await browser.saveScreenshot(
      path.resolve('artifacts/tauri-e2e/quick-tabler-focus.png'),
    )
    await finishAreaQuickCaptureInEditor()
    await expect($('button[aria-label="Copy"]')).toBeEnabled()
  })

  it('copies a quick draft and dismisses the surface only after success', async () => {
    await startCapture()
    await $('.cs-quick-actions button:nth-child(2)').click()
    await browser.waitUntil(
      async () => !(await $('.cs-quick-actions').isExisting()),
    )
    await expect($('.cs-quick-error')).not.toExist()
  })

  it('cancels the quick draft with Escape and can start another capture', async () => {
    await startCapture()
    await browser.keys('Escape')
    await browser.waitUntil(
      async () => !(await $('.cs-quick-actions').isExisting()),
    )
    await startCapture()
    await expect($('button=Flip horizontally')).not.toExist()
    await expect($('button=Flip vertically')).not.toExist()
    await $('.cs-quick-actions button:last-child').click()
    await browser.waitUntil(
      async () => !(await $('.cs-quick-actions').isExisting()),
    )
  })
})
