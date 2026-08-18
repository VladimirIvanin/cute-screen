import { $, $$, browser, expect } from '@wdio/globals'

import { chooseArrowConfigureOption, openArrowConfigurePopover } from '../arrow-toolbar'

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

describe('M03 persisted document write', () => {
  it('flushes an edit made before the debounce when the main window closes', async () => {
    await browser.setWindowSize(1280, 720)
    await browser.waitUntil(
      () =>
        browser.execute(
          () => window.__cuteScreenE2eDocument?.snapshot() !== undefined,
        ),
      { timeout: 10_000, timeoutMsg: 'M03 session did not mount' },
    )
    await $('button[aria-label="Show layers"]').click()
    const arrowTool = $('button[aria-label="Arrow"]')
    await arrowTool.click()
    await openArrowConfigurePopover()
    await chooseArrowConfigureOption('arrowPath', 'Elbow')
    const scene = $('.cs-canvas:not(.cs-canvas-overlay)')
    await browser
      .action('pointer')
      .move({ origin: scene, x: -52, y: -18, duration: 0 })
      .down({ button: 'left' })
      .move({ origin: 'pointer', x: 104, y: 36, duration: 80 })
      .up({ button: 'left' })
      .perform()
    await browser.waitUntil(
      () =>
        browser.execute(
          () => window.__cuteScreenE2eDocument?.snapshot()?.layers.length === 1,
        ),
      { timeout: 10_000, timeoutMsg: 'persisted arrow was not created' },
    )
    await expect(arrowTool).toHaveAttribute('aria-pressed', 'true')
    expect(await $$('.cs-layer-row.is-selected').length).toBe(0)
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
