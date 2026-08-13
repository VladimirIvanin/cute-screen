import { browser, expect } from '@wdio/globals'

declare global {
  interface Window {
    __cuteScreenE2eDocument?: {
      setCrop(): void
      snapshot():
        | {
            crop: unknown
            layers: readonly {
              kind: string
              payload: Record<string, unknown>
            }[]
            saveState: string
          }
        | undefined
    }
  }
}

describe('M03 persisted document reopen', () => {
  it('opens the editable crop saved by the previous isolated launch', async () => {
    await browser.waitUntil(
      () => browser.execute(() => window.__cuteScreenE2eDocument?.snapshot()),
      { timeout: 10_000, timeoutMsg: 'persisted M03 session did not mount' },
    )
    const reopened = await browser.execute(() =>
      window.__cuteScreenE2eDocument?.snapshot(),
    )
    expect(reopened).toMatchObject({
      crop: { x: 0, y: 0, width: 120, height: 80 },
      saveState: 'saved',
    })
    expect(reopened?.layers).toHaveLength(1)
    expect(reopened?.layers[0]).toMatchObject({
      kind: 'arrow',
      payload: { path: 'elbow' },
    })
  })
})
