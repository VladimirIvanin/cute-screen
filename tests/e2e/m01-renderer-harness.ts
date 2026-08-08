import { $, browser, expect } from '@wdio/globals'

export const startupBackendPattern =
  /^(canvaskit ready|Canvas2D fallback · startupFailure)$/

export async function waitForHarnessMount(): Promise<void> {
  await browser.waitUntil(
    async () => {
      const mounted = await browser.execute(
        () => document.querySelector('.backend-state') !== null,
      )
      return mounted === true
    },
    {
      timeout: 45_000,
      interval: 500,
      timeoutMsg: 'M01 harness did not mount',
    },
  )
}

export async function expectStartupBackend(): Promise<void> {
  const label = (await $('.backend-state').getText()).trim()
  expect(label).toMatch(startupBackendPattern)
}
