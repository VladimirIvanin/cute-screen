import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { nativeImageIngress } from '../image-ingress'
import { cardDocument } from '../publication-card'
import { verifyPhoneOrientation } from '../phone-orientation'
import { waitForStableCanvas } from '../canvas-ready'

describe('native first phone orientation', () => {
  it('matches the imported screenshot once and retains manual orientation', async () => {
    await browser.setWindowSize(1280, 900)
    await nativeImageIngress('picker')
    await $('button[aria-label="Open image"]').click()
    await browser.waitUntil(async () => (await cardDocument()).canvas.width === 3840)
    await waitForStableCanvas()
    await browser.execute(() => {
      const state = window as typeof window & { __phoneTrustedInput?: boolean[] }
      state.__phoneTrustedInput = []
      document.addEventListener('pointerdown', (event) => state.__phoneTrustedInput!.push(event.isTrusted))
    })
    await verifyPhoneOrientation(cardDocument, 'tile', 'artifacts/tauri-e2e')
    const trusted = await browser.execute(() =>
      (window as typeof window & { __phoneTrustedInput: boolean[] }).__phoneTrustedInput)
    expect(trusted.length).toBeGreaterThan(5)
    expect(trusted.every(Boolean)).toBe(true)
  }).timeout(90000)
})
