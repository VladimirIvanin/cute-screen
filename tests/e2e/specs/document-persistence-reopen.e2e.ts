import { browser, expect } from '@wdio/globals'

declare global {
  interface Window {
    __cuteScreenE2eDocument?: {
      setCrop(): void
      snapshot(): { crop: unknown; saveState: string } | undefined
    }
  }
}

describe('M03 persisted document reopen', () => {
  it('opens the editable crop saved by the previous isolated launch', async () => {
    await browser.waitUntil(
      () => browser.execute(() => window.__cuteScreenE2eDocument?.snapshot()),
      { timeout: 10_000, timeoutMsg: 'persisted M03 session did not mount' },
    )
    await expect(
      browser.execute(() => window.__cuteScreenE2eDocument?.snapshot()),
    ).resolves.toEqual({
      crop: { x: 0, y: 0, width: 120, height: 80 },
      saveState: 'saved',
    })
  })
})
