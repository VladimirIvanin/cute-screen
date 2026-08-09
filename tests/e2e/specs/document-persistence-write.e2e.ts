import { browser } from '@wdio/globals'

declare global {
  interface Window {
    __cuteScreenE2eWindow?: {
      close(): Promise<void>
      hide(): Promise<void>
      isDecorated(): Promise<boolean>
      isVisible(): Promise<boolean>
    }
    __cuteScreenE2eDocument?: {
      setCrop(): void
      snapshot(): { crop: unknown; saveState: string } | undefined
    }
  }
}

describe('M03 persisted document write', () => {
  it('flushes an edit made before the debounce when the main window closes', async () => {
    await browser.waitUntil(
      () =>
        browser.execute(
          () => window.__cuteScreenE2eDocument?.snapshot() !== undefined,
        ),
      { timeout: 10_000, timeoutMsg: 'M03 session did not mount' },
    )
    await browser.execute(() => window.__cuteScreenE2eDocument?.setCrop())
    await browser.execute(() => window.__cuteScreenE2eWindow?.close())
    await browser.waitUntil(
      () =>
        browser.execute(
          () =>
            window.__cuteScreenE2eDocument?.snapshot()?.saveState === 'saved',
        ),
      {
        timeout: 10_000,
        timeoutMsg: 'close handshake did not flush the active document',
      },
    )
    await browser.waitUntil(
      () =>
        browser.execute(
          async () =>
            (await window.__cuteScreenE2eWindow?.isVisible()) === false,
        ),
      {
        timeout: 10_000,
        timeoutMsg: 'window did not close after session flush',
      },
    )
  })
})
