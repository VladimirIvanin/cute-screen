import { $, browser, expect } from '@wdio/globals'

const startupBackendPattern =
  /^(canvaskit ready|Canvas2D fallback · startupFailure)$/

async function openHarness(query: string): Promise<void> {
  await browser.execute((search) => {
    const url = new URL(window.location.href)
    url.search = search
    window.location.replace(url.toString())
  }, query)
  await browser.waitUntil(
    async () =>
      (await browser.execute(
        () => document.querySelector('.backend-state') !== null,
      )) === true,
    {
      timeout: 30_000,
      timeoutMsg: 'M01 harness did not mount',
    },
  )
}

async function expectStartupBackend(): Promise<void> {
  const label = await $('.backend-state').getText()
  expect(label).toMatch(startupBackendPattern)
}

describe('M01 renderer and transport in a real Tauri webview', () => {
  it('decodes a scoped alpha fixture into the active renderer', async () => {
    await openHarness('?m01=1&token=m01-alpha-png')
    await expectStartupBackend()
    await $('button=Verify image transport').click()
    expect(
      await $('.diagnostic-shell').getAttribute('data-primary-diagnostic'),
    ).toBe('none')
    await expect($('.diagnostic-metrics')).toHaveText(
      expect.stringContaining('asset · 64×64'),
    )
  })

  it('uses binary IPC when the asset URL is denied', async () => {
    await openHarness('?m01=1&assetFailure=1&token=m01-icc-png')
    await expectStartupBackend()
    await $('button=Verify image transport').click()
    await expect($('.diagnostic-metrics')).toHaveText(
      expect.stringContaining('binary · 64×64 · rgba(24,38,52,255)'),
    )
  })

  it('reports a corrupted fixture as a typed failure', async () => {
    await openHarness('?m01=1&token=m01-corrupted-png')
    await expectStartupBackend()
    await $('button=Verify image transport').click()
    await expect($('.diagnostic-metrics [role="alert"]')).toHaveText('error')
  })
})
