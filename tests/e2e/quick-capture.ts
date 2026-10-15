import { $, browser, expect } from '@wdio/globals'
import path from 'node:path'

/** Completes the fake-platform Area quick lifecycle used by real-Tauri E2E.
 * Area intentionally no longer persists directly in the main WebView. */
export async function finishAreaQuickCaptureInEditor(): Promise<void> {
  await browser.waitUntil(async () =>
    (await browser.getWindowHandles()).includes('quick-capture'),
  )
  await browser.switchToWindow('quick-capture')
  const editor = $('.cs-quick-actions button:first-child')
  try {
    await expect(editor).toBeEnabled()
  } catch (cause) {
    const diagnostics = await browser.execute(() => ({
      href: window.location.href,
      text: document.body.innerText,
      shell: document
        .querySelector('[data-testid="quick-capture-shell"]')
        ?.getAttribute('class'),
    }))
    throw new Error(
      `Quick capture did not reach editing: ${JSON.stringify(diagnostics)}`,
      { cause },
    )
  }
  await expect($('button=Flip horizontally')).not.toExist()
  await expect($('button=Flip vertically')).not.toExist()
  await $('button[aria-label="Select"]').click()
  await expect($('.cs-context-toolbar')).not.toExist()
  const overlayResolution = await browser.execute(() => {
    const overlay =
      document.querySelector<HTMLCanvasElement>('.cs-canvas-overlay')
    if (!overlay) throw new Error('Quick overlay is missing')
    const rect = overlay.getBoundingClientRect()
    return {
      width: overlay.width,
      height: overlay.height,
      expectedWidth: Math.round(rect.width * window.devicePixelRatio),
      expectedHeight: Math.round(rect.height * window.devicePixelRatio),
    }
  })
  expect(overlayResolution.width).toBe(overlayResolution.expectedWidth)
  expect(overlayResolution.height).toBe(overlayResolution.expectedHeight)
  await expect(
    $('button[aria-label="Numbered marker"] .tabler-icon-circle-number-1'),
  ).toExist()
  await expect(
    $('button[aria-label="Callout"] .tabler-icon-text-caption'),
  ).toExist()
  await $('button[aria-label="Pencil"]').click()
  await expect($('.cs-context-toolbar')).toBeDisplayed()
  await browser.saveScreenshot(
    path.resolve('artifacts/tauri-e2e/quick-tabler-pencil.png'),
  )
  await $('button[aria-label="Select"]').click()
  await expect($('.cs-context-toolbar')).not.toExist()
  await browser.saveScreenshot(
    path.resolve('artifacts/tauri-e2e/quick-tabler-select.png'),
  )
  await editor.click()
  await browser.switchToWindow('main')
  await expect($('[aria-label="Scene canvas"]')).toExist()
}
