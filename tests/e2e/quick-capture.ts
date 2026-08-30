import { $, browser, expect } from '@wdio/globals'

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
  await editor.click()
  await browser.switchToWindow('main')
  await expect($('[aria-label="Scene canvas"]')).toExist()
}
