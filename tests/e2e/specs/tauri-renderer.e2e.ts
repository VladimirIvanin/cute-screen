import { $, browser, expect } from '@wdio/globals'

async function openHarness(query: string): Promise<void> {
  await browser.execute((search) => {
    window.location.search = search
  }, query)
  await expect($('.backend-state')).toExist()
}

describe('M01 renderer and transport in a real Tauri webview', () => {
  it('decodes a scoped alpha fixture into the active renderer', async () => {
    await openHarness('?m01=1&token=m01-alpha-png')
    await expect($('.backend-state')).toHaveText(
      'Canvas2D fallback · startupFailure',
    )
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
    await expect($('.backend-state')).toHaveText(
      'Canvas2D fallback · startupFailure',
    )
    await $('button=Verify image transport').click()
    await expect($('.diagnostic-metrics')).toHaveText(
      expect.stringContaining('binary · 64×64 · rgba(24,38,52,255)'),
    )
  })

  it('reports a corrupted fixture as a typed failure', async () => {
    await openHarness('?m01=1&token=m01-corrupted-png')
    await expect($('.backend-state')).toHaveText(
      'Canvas2D fallback · startupFailure',
    )
    await $('button=Verify image transport').click()
    await expect($('.diagnostic-metrics [role="alert"]')).toHaveText('error')
  })
})
