import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { $, browser, expect } from '@wdio/globals'

declare global {
  interface Window {
    __cuteScreenE2eWindow?: {
      close(): Promise<void>
      hide(): Promise<void>
      isDecorated(): Promise<boolean>
      isVisible(): Promise<boolean>
    }
  }
}

const executeFile = promisify(execFile)

async function isMainWindowVisible(): Promise<boolean> {
  return browser.execute(
    () => window.__cuteScreenE2eWindow?.isVisible() ?? false,
  )
}

describe('M02 native shell in a real Tauri webview', () => {
  it('uses native decorations and lets a second GUI launch restore the hidden editor', async () => {
    await expect($('.cs-editor-shell')).toExist()
    await browser.setWindowSize(1024, 700)
    expect(
      await browser.execute(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    await expect($('button[aria-label="Capture"]')).toBeEnabled()
    await expect($('button[aria-label="Copy"]')).toBeEnabled()
    await expect($('button[aria-label="Export"]')).toBeEnabled()
    await expect(
      browser.execute(
        () => window.__cuteScreenE2eWindow?.isDecorated() ?? false,
      ),
    ).resolves.toBe(true)

    const visibleAfterHide = await browser.execute(async () => {
      await window.__cuteScreenE2eWindow?.hide()
      return window.__cuteScreenE2eWindow?.isVisible() ?? false
    })
    expect(visibleAfterHide).toBe(false)

    const executable = process.env.CUTE_SCREEN_WDIO_APP_BINARY
    if (!executable)
      throw new Error(
        'CUTE_SCREEN_WDIO_APP_BINARY must point to the test binary',
      )
    await executeFile(executable, ['show'])

    await browser.waitUntil(isMainWindowVisible, {
      timeout: 10_000,
      timeoutMsg:
        'The second launch did not restore the existing editor window.',
    })
    await expect($('.cs-editor-shell')).toExist()
  })
})
