import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { finishAreaQuickCaptureInEditor } from '../quick-capture'
import { verifyEyedropperToolSwitch } from '../eyedropper-tool-switch'

const executeFile = promisify(execFile)

async function startCapture(): Promise<void> {
  const executable = process.env.CUTE_SCREEN_WDIO_APP_BINARY
  if (!executable) throw new Error('Missing test-harness binary')
  await executeFile(executable, ['show'])
  await browser.tauri.switchWindow('main')
  await $('button[aria-label="Capture"]').click()
  await browser.waitUntil(async () => (await browser.tauri.listWindows()).includes('quick-capture'))
  await browser.tauri.switchWindow('quick-capture')
  await expect($('.cs-quick-actions button:first-child')).toBeEnabled()
}

describe('Quick Capture chrome in a real Tauri webview', () => {
  it('cancels palette sampling when another tool action is chosen', async () => {
    await startCapture()
    await verifyEyedropperToolSwitch('quick-capture', 'artifacts/tauri-e2e/eyedropper-switch-quick.png')
    await $('.cs-quick-actions button:last-child').click()
  })
  it('configures through real right-click and nested SVG controls without closing Quick Capture', async () => {
    await startCapture()
    await browser.execute(() => {
      document.addEventListener('contextmenu', (event) => {
        document.documentElement.dataset.e2eContextTrusted = String(event.isTrusted)
      }, { capture: true, once: true })
      window.addEventListener('keydown', (event) => {
        document.documentElement.dataset.e2eKeyTrusted = String(event.isTrusted)
      }, { capture: true, once: true })
    })
    await $('button[aria-label="Arrow"]').click({ button: 'right' })
    await expect($('.cs-tool-configure-popover-host')).toBeDisplayed()
    expect(await $('html').getAttribute('data-e2e-context-trusted')).toBe('true')
    await $('.cs-tool-configure-popover-host [data-control="stroke"] button').click()
    await expect($('.cs-arrow-toolbar-popover')).toBeDisplayed()
    await $('.cs-arrow-toolbar-popover').$('button[aria-label="2 px"]').click()
    await browser.saveScreenshot(path.resolve('artifacts/tauri-e2e/quick-native-tool-settings.png'))
    await browser.keys('Escape')
    expect(await $('html').getAttribute('data-e2e-key-trusted')).toBe('true')
    await expect($('.cs-arrow-toolbar-popover')).not.toExist()
    await browser.keys('Escape')
    await expect($('.cs-tool-configure-popover-host')).not.toExist()
    await expect($('.cs-quick-actions')).toBeDisplayed()
    await browser.keys('Escape')
    await expect($('button[aria-label="Select"]')).toHaveAttribute('aria-pressed', 'true')
    await expect($('.cs-quick-actions')).toBeDisplayed()
    await $('.cs-quick-actions button:last-child').click()
  })
  it('keeps tool settings, keyboard focus and the handoff to Editor', async () => {
    await startCapture()
    await expect($('button[aria-label="Undo"]')).toBeDisabled()
    await $('button[aria-label="Pencil"]').click()
    await expect($('.cs-quick-defaults')).toExist()
    if (!(await $('.cs-quick-defaults').isDisplayed())) {
      await expect($('.cs-quick-settings-button')).toBeDisplayed()
    }
    await expect($('button[aria-label="Pencil"]')).toHaveAttribute('aria-pressed', 'true')
    await browser.keys('Tab')
    expect(await browser.execute(() => document.activeElement?.matches('button:focus-visible'))).toBe(true)
    await browser.saveScreenshot(path.resolve('artifacts/tauri-e2e/quick-tabler-focus.png'))
    await finishAreaQuickCaptureInEditor()
    await expect($('button[aria-label="Copy"]')).toBeEnabled()
  })

  it('anchors selection controls above an arrow inside a non-origin Quick frame', async () => {
    await startCapture()
    await $('button[aria-label="Select"]').click()
    const scene = $('.cs-canvas:not(.cs-canvas-overlay)')
    const bounds = await scene.getSize()
    const origin = await scene.getLocation()
    const sizeBefore = await browser.execute(() => document.querySelector('.cs-quick-size-a11y')?.textContent)
    await browser.action('pointer')
      .move({ origin: 'viewport', x: Math.round(origin.x + 5), y: Math.round(origin.y + 5) })
      .down({ button: 'left' })
      .move({ origin: 'pointer', x: Math.round(bounds.width * 0.2), y: Math.round(bounds.height * 0.2), duration: 100 })
      .up({ button: 'left' }).perform()
    await browser.waitUntil(async () =>
      (await browser.execute(() => document.querySelector('.cs-quick-size-a11y')?.textContent)) !== sizeBefore)
    await $('button[aria-label="Arrow"]').click()
    await browser.action('pointer')
      .move({ origin: 'viewport', x: Math.round(origin.x + bounds.width * 0.35),
        y: Math.round(origin.y + bounds.height * 0.6) })
      .down({ button: 'left' })
      .move({ origin: 'pointer', x: Math.round(bounds.width * 0.3), y: -Math.round(bounds.height * 0.2), duration: 100 })
      .up({ button: 'left' }).perform()
    await $('.cs-selection-floating-toolbar').waitForDisplayed()
    const geometry = await browser.execute(() => {
      const toolbar = document.querySelector('.cs-selection-floating-toolbar')!.getBoundingClientRect()
      const overlay = document.querySelector<HTMLCanvasElement>('.cs-canvas-overlay')!
      const rect = overlay.getBoundingClientRect()
      const pixels = overlay.getContext('2d')!.getImageData(0, 0, overlay.width, overlay.height).data
      let minX = overlay.width
      let maxX = -1
      let minY = overlay.height
      for (let y = 0; y < overlay.height; y += 1) {
        for (let x = 0; x < overlay.width; x += 1) {
          const offset = (y * overlay.width + x) * 4
          if (
            pixels[offset] === 13 &&
            pixels[offset + 1] === 153 &&
            pixels[offset + 2] === 255
          ) {
            minX = Math.min(minX, x)
            maxX = Math.max(maxX, x)
            minY = Math.min(minY, y)
          }
        }
      }
      if (maxX < minX) throw new Error('Selection frame was not painted')
      const center = rect.left + ((minX + maxX + 1) / 2) * rect.width / overlay.width
      const top = rect.top + minY * rect.height / overlay.height
      return {
        horizontalError: Math.abs(toolbar.left + toolbar.width / 2 - center),
        gap: top - toolbar.bottom,
        fits: toolbar.left >= 0 && toolbar.right <= innerWidth && toolbar.top >= 0 && toolbar.bottom <= innerHeight,
      }
    })
    expect(geometry.horizontalError).toBeLessThanOrEqual(1)
    expect(geometry.gap).toBeGreaterThanOrEqual(5)
    expect(geometry.fits).toBe(true)
    await browser.saveScreenshot(path.resolve('artifacts/tauri-e2e/quick-arrow-selection-position.png'))
    await $('.cs-selection-floating-toolbar [data-control="endCap"] button').click()
    await expect($('.cs-arrow-toolbar-popover')).toBeDisplayed()
    await browser.keys('Escape')
    await expect($('.cs-quick-actions')).toBeDisplayed()
    await $('.cs-quick-actions button:last-child').click()
  })

  it('copies a quick draft and dismisses the surface only after success', async () => {
    await startCapture()
    await $('.cs-quick-actions button:nth-child(2)').click()
    await browser.waitUntil(async () => !(await $('.cs-quick-actions').isExisting()))
    await expect($('.cs-quick-error')).not.toExist()
  })

  it('cancels the quick draft with Escape and can start another capture', async () => {
    await startCapture()
    await browser.keys('Escape')
    await browser.waitUntil(async () => !(await $('.cs-quick-actions').isExisting()))
    await startCapture()
    await expect($('button=Flip horizontally')).not.toExist()
    await expect($('button=Flip vertically')).not.toExist()
    await $('.cs-quick-actions button:last-child').click()
    await browser.waitUntil(async () => !(await $('.cs-quick-actions').isExisting()))
  })
})
