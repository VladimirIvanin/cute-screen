import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import path from 'node:path'

/** Completes the fake-platform Area quick lifecycle used by real-Tauri E2E.
 * Area intentionally no longer persists directly in the main WebView. */
export async function finishAreaQuickCaptureInEditor(): Promise<void> {
  await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
  await browser.tauri.switchWindow('quick-capture')
  const editor = $('.cs-quick-actions button:first-child')
  try {
    await expect(editor).toBeEnabled()
  } catch (cause) {
    const diagnostics = await browser.execute(() => ({
      href: window.location.href,
      text: document.body.innerText,
      shell: document.querySelector('[data-testid="quick-capture-shell"]')?.getAttribute('class'),
    }))
    throw new Error(`Quick capture did not reach editing: ${JSON.stringify(diagnostics)}`, { cause })
  }
  await expect($('button=Flip horizontally')).not.toExist()
  await expect($('button=Flip vertically')).not.toExist()
  await $('button[aria-label="Select"]').click()
  await expect($('.cs-context-toolbar')).not.toExist()
  const overlayResolution = await browser.execute(() => {
    const overlay = document.querySelector<HTMLCanvasElement>('.cs-canvas-overlay')
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
  await expect($('button[aria-label="Numbered marker"] .tabler-icon-circle-number-1')).toExist()
  await expect($('button[aria-label="Callout"] .tabler-icon-stroke-dynamic')).toExist()
  await $('button[aria-label="Pencil"]').click()
  await expect($('.cs-quick-defaults')).toExist()
  if (!(await $('.cs-quick-defaults').isDisplayed())) {
    await expect($('.cs-quick-settings-button')).toBeDisplayed()
  }
  await browser.saveScreenshot(path.resolve('artifacts/tauri-e2e/quick-tabler-pencil.png'))
  await $('button[aria-label="Select"]').click()
  await expect($('.cs-context-toolbar')).not.toExist()
  await browser.saveScreenshot(path.resolve('artifacts/tauri-e2e/quick-tabler-select.png'))
  await editor.click()
  await browser.tauri.switchWindow('main')
  await expect($('[aria-label="Scene canvas"]')).toExist()
  try {
    await browser.waitUntil(() => browser.execute(() => {
      const scene = document.querySelector<HTMLCanvasElement>('.cs-canvas:not(.cs-canvas-overlay)')
      return scene?.getContext('2d')?.getImageData(Math.floor(scene.width / 2), Math.floor(scene.height / 2), 1, 1).data[3] === 255
    }), { timeout: 10_000, timeoutMsg: 'Editor did not paint the opaque fake capture after handoff' })
  } catch (cause) {
    const diagnostics = await browser.execute(() => ({
      text: document.body.innerText,
      canvas: [...document.querySelectorAll('canvas')].map((canvas) => ({ width: canvas.width, height: canvas.height })),
      snapshot: (
        window as typeof window & { __cuteScreenE2eM08?: { snapshot(): unknown } }
      ).__cuteScreenE2eM08?.snapshot(),
    }))
    throw new Error(`Editor handoff did not paint: ${JSON.stringify(diagnostics)}`, { cause })
  }
}
